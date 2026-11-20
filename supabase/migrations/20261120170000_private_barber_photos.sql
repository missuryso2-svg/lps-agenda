-- Only the normalized image produced by the application may enter this private bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('barber-photos','barber-photos',false,524288,array['image/webp']);

create policy barber_photo_member_read on storage.objects for select to authenticated
using(bucket_id='barber-photos' and exists (
  select from public.barbers b join public.barbershop_members m on m.barbershop_id=b.barbershop_id
  where m.user_id=(select auth.uid()) and m.is_active and b.avatar_url=storage.objects.name
    and split_part(storage.objects.name,'/',1)=b.barbershop_id::text
    and split_part(storage.objects.name,'/',2)=b.id::text
));

create function private.guard_barber_photo() returns trigger language plpgsql set search_path='' as $$
begin
  if (tg_op='INSERT' and new.avatar_url is not null or tg_op='UPDATE' and old.avatar_url is distinct from new.avatar_url)
    and current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'Use the validated photo upload' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_barber_photo() from public,anon,authenticated,service_role;
create trigger barber_photo_guard before insert or update of avatar_url on public.barbers
for each row execute function private.guard_barber_photo();

create function public.replace_barber_photo(actor uuid, shop uuid, professional uuid, previous text, replacement text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.barbershop_members where user_id=actor and barbershop_id=shop and role='owner' and is_active for share;
  if not found then raise exception 'Owner required' using errcode='42501'; end if;
  if replacement is not null and (replacement !~ ('^'||shop::text||'/'||professional::text||'/[0-9a-f-]{36}[.]webp$')
    or not exists(select from storage.objects where bucket_id='barber-photos' and name=replacement)) then
    raise exception 'Invalid photo' using errcode='22023';
  end if;
  update public.barbers set avatar_url=replacement where id=professional and barbershop_id=shop and avatar_url is not distinct from previous;
  return found;
end $$;
revoke all on function public.replace_barber_photo(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.replace_barber_photo(uuid,uuid,uuid,text,text) to service_role;
