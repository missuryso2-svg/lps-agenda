-- subscriptions_lock_tenant (B2-A2) runs first, in trigger-name order.
-- Its revision row serializes this count with enforce_barber_plan_limit.
create function private.check_agreement_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap integer;
begin
  select max_barbers into strict cap from public.plans where id = new.plan_id for share;
  if cap is not null and (select count(*) from public.barbers
      where barbershop_id = new.barbershop_id and is_active) > cap then
    raise exception 'Active team exceeds agreement plan capacity' using errcode='LP031';
  end if;
  return new;
end $$;
revoke all on function private.check_agreement_capacity() from public, anon, authenticated, service_role;
create trigger validate_agreement_capacity before insert on public.subscriptions
  for each row when (new.gateway='manual_pix' and new.agreement_at is not null)
  execute function private.check_agreement_capacity();

-- Retirement must survive tenant deletion. Object keys remain tenant-scoped
-- and the existing replacement RPC refuses a key present in this table.
alter table private.barbershop_logo_cleanup drop constraint barbershop_logo_cleanup_barbershop_id_fkey;
create table private.logo_reconciliation_log (
  shop uuid not null, object_name text not null, requested_by name not null default session_user,
  requested_at timestamptz not null default clock_timestamp(), removed_at timestamptz,
  primary key(shop,object_name), check(private.is_barbershop_logo_object(shop,object_name))
);
revoke all on private.logo_reconciliation_log from public,anon,authenticated,service_role;

-- DBA-only. Commit the claim before removing the exact returned Storage key.
create function private.claim_retired_logo(shop uuid, object_key text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  if private.is_barbershop_logo_object(shop,object_key) is not true then
    raise exception 'Invalid tenant key' using errcode='22023';
  end if;
  perform 1 from public.barbershops where id=shop for update;
  if exists(select from public.barbershops where logo_url=object_key
      or split_part(split_part(logo_url,'?',1),'#',1) like '%/barbershop-logos/' || object_key)
    or not exists(select from storage.objects where bucket_id='barbershop-logos'
      and name=object_key and created_at < statement_timestamp()-interval '15 minutes') then
    return false;
  end if;
  insert into private.barbershop_logo_cleanup(barbershop_id,object_name)
    values(shop,object_key) on conflict do nothing;
  insert into private.logo_reconciliation_log(shop,object_name)
    values(shop,object_key) on conflict do nothing;
  return true;
end $$;

create function private.finish_retired_logo(tenant uuid, object_key text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select from private.logo_reconciliation_log where shop=tenant and object_name=object_key)
    or exists(select from storage.objects where bucket_id='barbershop-logos' and name=object_key) then
    return false;
  end if;
  update private.logo_reconciliation_log set removed_at=coalesce(removed_at,clock_timestamp())
    where shop=tenant and object_name=object_key;
  delete from private.barbershop_logo_cleanup where barbershop_id=tenant and object_name=object_key;
  return true;
end $$;
revoke all on function private.claim_retired_logo(uuid,text), private.finish_retired_logo(uuid,text)
  from public,anon,authenticated,service_role;
