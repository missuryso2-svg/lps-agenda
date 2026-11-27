\set ON_ERROR_STOP on
begin;
\ir b2b-fixtures.sql
select pg_temp.verify('every public table has RLS', not exists(
  select from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity));
select pg_temp.verify('public SECURITY DEFINER functions pin search_path', not exists(
  select from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false)));
select pg_temp.verify('no public SECURITY DEFINER executable by anon', not exists(
  select from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and p.oid <> 'public.automatic_premium_trial_available()'::regprocedure
    and has_function_privilege('anon',p.oid,'execute')));
select pg_temp.verify('private schema not available to anon',not has_schema_privilege('anon','private','usage'));
select gen_random_uuid() as actor,gen_random_uuid() as other_actor,
 gen_random_uuid() as shop,gen_random_uuid() as other_shop,
 gen_random_uuid() as barber,gen_random_uuid() as service,gen_random_uuid() as customer,
 gen_random_uuid() as booking \gset
insert into auth.users(id) values(:'actor'),(:'other_actor');
insert into public.barbershops(id,name,slug) values(:'shop','I4 A','qa-'||:'shop'),(:'other_shop','I4 B','qa-'||:'other_shop');
insert into public.barbershop_members(barbershop_id,user_id,role) values(:'shop',:'actor','staff'),(:'other_shop',:'other_actor','owner');
insert into public.barbers(id,barbershop_id,name) values(:'barber',:'shop','QA');
insert into public.services(id,barbershop_id,name,duration_minutes,price_cents) values(:'service',:'shop','QA',30,3100);
insert into public.customers(id,barbershop_id,full_name) values(:'customer',:'shop','QA');
insert into public.customers(barbershop_id,full_name) values(:'other_shop','Private other shop');
insert into public.barber_services(barbershop_id,barber_id,service_id) values(:'shop',:'barber',:'service');
select current_date+7 as test_day,extract(dow from current_date+7)::int as test_weekday \gset
insert into public.business_hours(barbershop_id,weekday,opens_at,closes_at) values(:'shop',:test_weekday,'09:00','18:00');
insert into public.barber_working_hours(barbershop_id,barber_id,weekday,starts_at,ends_at) values(:'shop',:'barber',:test_weekday,'09:00','18:00');
insert into public.appointments(id,barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,price_cents,status)
 values(:'booking',:'shop',:'barber',:'service',:'customer',now()-interval '2 hours',now()-interval '90 minutes',3100,'completed');
select set_config('request.jwt.claims',jsonb_build_object('sub',:'actor','role','authenticated','user_metadata',jsonb_build_object('lps_role','platform_admin'))::text,true);
set local role authenticated;
select pg_temp.verify('staff cannot read another tenant customers',not exists(select from public.customers where barbershop_id=:'other_shop'));
select pg_temp.verify('user_metadata cannot grant platform authority',not private.is_platform_admin());
with changed as (update public.customers set full_name='intrusion' where barbershop_id=:'other_shop' returning id)
select pg_temp.verify('staff cannot update another tenant customers',not exists(select from changed));
select pg_temp.rejected('cannot insert in another tenant',format('insert into public.customers(barbershop_id,full_name) values(%L,%L)',:'other_shop','intrusion'),'42501');
select pg_temp.rejected('staff cannot grant own owner role',format('update public.barbershop_members set role=%L where barbershop_id=%L and user_id=%L','owner',:'shop',:'actor'),null);
select pg_temp.verify('membership remains staff',(select role='staff' from public.barbershop_members where barbershop_id=:'shop' and user_id=:'actor'));
select pg_temp.rejected('staff cannot rewrite completed price',format('update public.appointments set price_cents=1 where id=%L',:'booking'),'23514');
select pg_temp.rejected('staff cannot forge author',format('update public.appointments set created_by=%L where id=%L',:'other_actor',:'booking'),'23514');
insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,price_cents,status,created_by)
 values(:'shop',:'barber',:'service',:'customer',(:'test_day'::date+time '10:00') at time zone 'America/Sao_Paulo',
  (:'test_day'::date+time '10:30') at time zone 'America/Sao_Paulo',1,'scheduled',:'other_actor')
 returning id as canonical_booking \gset
select pg_temp.verify('insertion derives canonical price and actual author',(select price_cents=3100 and created_by=:'actor'::uuid from public.appointments where id=:'canonical_booking'));
select public.complete_rated_appointment(:'shop',:'canonical_booking',null,null);
reset role;
select set_config('request.jwt.claims','{}',true);
update public.barbershop_members set role='owner' where barbershop_id=:'shop' and user_id=:'actor';
select set_config('request.jwt.claims',jsonb_build_object('sub',:'actor','role','authenticated')::text,true);
set local role authenticated;
select pg_temp.rejected('owner cannot rewrite completed price',format('update public.appointments set price_cents=9999 where id=%L',:'booking'),'23514');
update public.services set price_cents=4500 where id=:'service';
update public.appointments set notes='Same price after catalog change' where id=:'canonical_booking';
select pg_temp.verify('catalog update preserves historical price',(select price_cents=3100 from public.appointments where id=:'canonical_booking'));
select pg_temp.verify('human insertion audited',exists(select from public.audit_logs where entity_id=:'canonical_booking'::uuid and metadata->>'price_cents'='3100' and actor_user_id=:'actor'));
reset role;
set local role service_role;
update public.appointments set price_cents=3200 where id=:'booking';
select pg_temp.verify('trusted service correction remains audited',exists(select from public.audit_logs where entity_id=:'booking'::uuid and metadata->>'price_cents'='3200'));
reset role;
rollback;
