\set ON_ERROR_STOP on
begin;
\ir b2b-fixtures.sql

select gen_random_uuid() as owner_a, gen_random_uuid() as owner_b,
  gen_random_uuid() as staff_a, gen_random_uuid() as shop_a, gen_random_uuid() as shop_b,
  gen_random_uuid() as key_a, gen_random_uuid() as key_a2, gen_random_uuid() as key_b \gset
insert into auth.users(id) values (:'owner_a'), (:'owner_b'), (:'staff_a');
insert into public.barbershops(id, name, slug)
values (:'shop_a', 'I3 Logo A', 'i3-logo-a'), (:'shop_b', 'I3 Logo B', 'i3-logo-b');
insert into public.barbershop_members(barbershop_id, user_id, role)
values (:'shop_a', :'owner_a', 'owner'), (:'shop_a', :'staff_a', 'staff'),
       (:'shop_b', :'owner_b', 'owner');

select pg_temp.verify('dedicated public bucket accepts normalized WebP only', exists(
  select from storage.buckets
  where id = 'barbershop-logos' and public
    and file_size_limit = 2097152 and allowed_mime_types = array['image/webp']
));
select pg_temp.verify('logo mutation RPC is available only to authenticated clients',
  has_function_privilege('authenticated', 'public.replace_barbershop_logo(uuid,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.replace_barbershop_logo(uuid,text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.replace_barbershop_logo(uuid,text,text)', 'execute'));
select pg_temp.verify('logo API role is non-login, non-bypass and not delegated to API roles',
  exists(select from pg_roles where rolname='lps_barbershop_logo_api'
    and not rolcanlogin and not rolbypassrls and not has_schema_privilege(rolname,'public','create'))
  and not pg_has_role('anon','lps_barbershop_logo_api','member')
  and not pg_has_role('authenticated','lps_barbershop_logo_api','member')
  and not pg_has_role('service_role','lps_barbershop_logo_api','member')
  and not pg_has_role('authenticator','lps_barbershop_logo_api','member'));
select pg_temp.verify('client write policies do not permit direct logo storage mutations',
  exists(select from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='barbershop_logos_block_client_insert' and permissive='RESTRICTIVE')
  and exists(select from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='barbershop_logos_block_client_update' and permissive='RESTRICTIVE')
  and exists(select from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='barbershop_logos_block_client_delete' and permissive='RESTRICTIVE'));

-- Simulate the validated server upload. The application route uses a
-- server-only Storage client and calls the owner-checked RPC with the session.
insert into storage.objects(bucket_id, name, owner, metadata)
values
  ('barbershop-logos', :'shop_a' || '/' || :'key_a' || '.webp', :'owner_a', '{}'::jsonb),
  ('barbershop-logos', :'shop_a' || '/' || :'key_a2' || '.webp', :'owner_a', '{}'::jsonb),
  ('barbershop-logos', :'shop_b' || '/' || :'key_b' || '.webp', :'owner_b', '{}'::jsonb);

set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', :'owner_a', 'role', 'authenticated')::text, true);
select pg_temp.verify('owner session sees its own membership',
  auth.uid() = :'owner_a'::uuid and exists(select from public.barbershop_members
    where barbershop_id=:'shop_a' and user_id=auth.uid() and role='owner' and is_active));

select pg_temp.verify('owner can associate only an uploaded same-tenant logo',
  public.replace_barbershop_logo(:'shop_a', null, :'shop_a' || '/' || :'key_a' || '.webp')->>'current'
    = :'shop_a' || '/' || :'key_a' || '.webp');
select pg_temp.rejected('owner cannot change another tenant logo', format(
  'select public.replace_barbershop_logo(%L,%L,%L)',
  :'shop_b', null, :'shop_b' || '/' || :'key_b' || '.webp'), '42501');
select pg_temp.rejected('direct logo_url Data API update is blocked', format(
  'update public.barbershops set logo_url=%L where id=%L',
  'https://attacker.example/logo.webp', :'shop_a'), '42501');
select pg_temp.rejected('authenticated clients cannot bypass normalized uploads', format(
  'insert into storage.objects(bucket_id,name,owner,metadata) values(%L,%L,%L,%L::jsonb)',
  'barbershop-logos', :'shop_a' || '/' || gen_random_uuid() || '.webp', :'owner_a', '{}'), '42501');
select pg_temp.rejected('owner cannot delete Storage objects directly', format(
  'delete from storage.objects where bucket_id=%L and name=%L',
  'barbershop-logos', :'shop_a' || '/' || :'key_a' || '.webp'), '42501');

select pg_temp.verify('replacement uses optimistic version and queues old object',
  (public.replace_barbershop_logo(:'shop_a', :'shop_a' || '/' || :'key_a' || '.webp',
    :'shop_a' || '/' || :'key_a2' || '.webp')->>'current') = :'shop_a' || '/' || :'key_a2' || '.webp'
  and :'shop_a' || '/' || :'key_a' || '.webp' = any(public.barbershop_logo_cleanup_list(:'shop_a')));
select pg_temp.rejected('stale logo version cannot overwrite replacement', format(
  'select public.replace_barbershop_logo(%L,%L,%L)',
  :'shop_a', null, :'shop_a' || '/' || gen_random_uuid() || '.webp'), '40001');
select pg_temp.rejected('retired object cannot be reattached while cleanup is running', format(
  'select public.replace_barbershop_logo(%L,%L,%L)',
  :'shop_a', :'shop_a' || '/' || :'key_a2' || '.webp',
  :'shop_a' || '/' || :'key_a' || '.webp'), '22023');
select pg_temp.verify('uncertain response cannot retire the current object',
  not public.barbershop_logo_cleanup_result(:'shop_a', :'shop_a' || '/' || :'key_a2' || '.webp', false));

select pg_temp.rejected('cleanup cannot be acknowledged while Storage still has the object', format(
  'select public.barbershop_logo_cleanup_result(%L,%L,true)',
  :'shop_a', :'shop_a' || '/' || :'key_a' || '.webp'), '55000');
select pg_temp.verify('failed object cleanup remains queued',
  public.barbershop_logo_cleanup_result(:'shop_a', :'shop_a' || '/' || :'key_a' || '.webp', false)
  and :'shop_a' || '/' || :'key_a' || '.webp' = any(public.barbershop_logo_cleanup_list(:'shop_a')));

select pg_temp.verify('owner can remove current logo without confirming payment',
  public.replace_barbershop_logo(:'shop_a', :'shop_a' || '/' || :'key_a2' || '.webp', null)->>'current' is null
  and :'shop_a' || '/' || :'key_a2' || '.webp' = any(public.barbershop_logo_cleanup_list(:'shop_a')));
select pg_temp.verify('replacement and removal cleanup keys remain tenant-scoped',
  cardinality(public.barbershop_logo_cleanup_list(:'shop_a')) = 2);

reset session authorization;
select gen_random_uuid() as orphan \gset
insert into storage.objects(bucket_id,name,created_at) values
  ('barbershop-logos', :'shop_a' || '/' || :'orphan' || '.webp', now() - interval '1 hour');
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', :'owner_a', 'role', 'authenticated')::text, true);
select pg_temp.verify('abandoned upload is retired on the next cleanup',
  :'shop_a' || '/' || :'orphan' || '.webp' = any(public.barbershop_logo_cleanup_list(:'shop_a')));
reset session authorization;
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', :'staff_a', 'role', 'authenticated')::text, true);
select pg_temp.rejected('team staff cannot replace a barbershop logo', format(
  'select public.replace_barbershop_logo(%L,null,null)', :'shop_a'), '42501');
reset session authorization;
select pg_temp.verify('logo reference remains tenant scoped',
  not exists(select from public.barbershops where id=:'shop_b' and logo_url is not null));
rollback;
