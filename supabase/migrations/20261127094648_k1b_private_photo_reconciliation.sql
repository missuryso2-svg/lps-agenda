begin;

-- Keep both the lock row and reconciliation record after tenant deletion.
create table private.barber_photo_reconciliation_fence (
  tenant uuid primary key,
  revision bigint not null default 0
);

create function private.barber_photo_storage_key(reference text)
returns text language sql immutable strict set search_path='' as $$
  select substring(split_part(split_part(reference,'?',1),'#',1) from
    ('(?:^|/barber-photos/)(' ||
      repeat('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/',2) ||
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp)$'))
$$;

create table private.barber_photo_reconciliation (
  tenant uuid not null,
  professional uuid not null,
  object_key text not null,
  claimed_by name not null default session_user,
  claimed_at timestamptz not null default clock_timestamp(),
  removed_at timestamptz,
  primary key (tenant, object_key),
  check (private.barber_photo_storage_key(object_key) is not distinct from object_key
    and split_part(object_key,'/',1)=tenant::text and split_part(object_key,'/',2)=professional::text)
);
revoke all on private.barber_photo_reconciliation_fence,private.barber_photo_reconciliation
  from public,anon,authenticated,service_role;

-- A write fence refreshes read-committed statements and rejects stale snapshots
-- at higher isolation. Claim never waits on the professional row behind it.
create function private.lock_barber_photo_reconciliation(shop uuid)
returns void language sql volatile set search_path='' as $$
  insert into private.barber_photo_reconciliation_fence as fence(tenant) values(shop)
  on conflict(tenant) do update set revision=fence.revision+1
$$;

create function private.protect_claimed_barber_photo()
returns trigger language plpgsql security definer set search_path='' as $$
declare photo text;
begin
  if tg_op='UPDATE' and new.avatar_url is not distinct from old.avatar_url then return new; end if;
  photo:=private.barber_photo_storage_key(new.avatar_url);
  if photo is null then return new; end if;
  perform private.lock_barber_photo_reconciliation(split_part(photo,'/',1)::uuid);
  if exists(select from private.barber_photo_reconciliation r
    where r.tenant=split_part(photo,'/',1)::uuid and r.object_key=photo) then
    raise exception 'Foto reservada para reconciliação.' using errcode='22023';
  end if;
  return new;
end
$$;
create trigger barber_photo_reconciliation_guard before insert or update of avatar_url on public.barbers
  for each row execute function private.protect_claimed_barber_photo();

create function private.inspect_retired_barber_photos(shop uuid, page_size integer default 100)
returns table(object_key text, professional uuid, created_at timestamptz, claimed_at timestamptz)
language sql stable security invoker set search_path='' as $$
  select o.name,split_part(o.name,'/',2)::uuid,o.created_at,r.claimed_at
  from storage.objects o
  left join private.barber_photo_reconciliation r on r.tenant=shop and r.object_key=o.name
  where o.bucket_id='barber-photos' and split_part(o.name,'/',1)=shop::text
    and private.barber_photo_storage_key(o.name)=o.name and r.removed_at is null
    and o.created_at < statement_timestamp()-interval '15 minutes'
    and not exists(select from public.barbers b where private.barber_photo_storage_key(b.avatar_url)=o.name)
  order by o.created_at,o.name
  limit greatest(1,least(coalesce(page_size,100),500))
$$;

create function private.claim_retired_barber_photo(shop uuid, barber uuid, photo text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare object_created timestamptz; prior private.barber_photo_reconciliation%rowtype;
begin
  if shop is null or barber is null or photo is null
    or private.barber_photo_storage_key(photo) is distinct from photo
    or split_part(photo,'/',1)<>shop::text or split_part(photo,'/',2)<>barber::text then
    raise exception 'Chave de foto incompatível com a barbearia ou profissional.' using errcode='22023';
  end if;

  perform private.lock_barber_photo_reconciliation(shop);
  if exists(select from public.barbers b where private.barber_photo_storage_key(b.avatar_url)=photo) then
    return false;
  end if;

  select * into prior from private.barber_photo_reconciliation r where r.tenant=shop and r.object_key=photo;
  if prior.removed_at is not null then return false; end if;
  select o.created_at into object_created from storage.objects o where o.bucket_id='barber-photos' and o.name=photo;
  if not found then return prior.claimed_at is not null; end if;
  if object_created >= clock_timestamp()-interval '15 minutes' then return false; end if;

  insert into private.barber_photo_reconciliation(tenant,professional,object_key) values(shop,barber,photo)
    on conflict do nothing;
  return true;
end
$$;

create function private.finish_retired_barber_photo(shop uuid, photo text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform private.lock_barber_photo_reconciliation(shop);
  if exists(select from storage.objects o where o.bucket_id='barber-photos' and o.name=photo) then
    return false;
  end if;
  update private.barber_photo_reconciliation r set removed_at=coalesce(removed_at,clock_timestamp())
    where r.tenant=shop and r.object_key=photo;
  return found;
end
$$;

revoke all on function private.barber_photo_storage_key(text),
  private.lock_barber_photo_reconciliation(uuid),private.protect_claimed_barber_photo(),
  private.inspect_retired_barber_photos(uuid,integer),private.claim_retired_barber_photo(uuid,uuid,text),
  private.finish_retired_barber_photo(uuid,text) from public,anon,authenticated,service_role;

commit;
