\set ON_ERROR_STOP on
\timing on
begin;
select gen_random_uuid() as actor \gset
insert into auth.users(id) values(:'actor');
create temp table i4_shops as select gen_random_uuid() id,gen_random_uuid() barber,gen_random_uuid() service,gen_random_uuid() customer,n from generate_series(1,20) n;
insert into public.barbershops(id,name,slug) select id,'Performance QA','qa-'||id from i4_shops;
insert into public.barbershop_members(barbershop_id,user_id,role) select id,:'actor','owner' from i4_shops where n=1;
insert into public.barbers(id,barbershop_id,name) select barber,id,'QA' from i4_shops;
insert into public.services(id,barbershop_id,name,price_cents,duration_minutes) select service,id,'QA',3000,30 from i4_shops;
insert into public.customers(id,barbershop_id,full_name) select customer,id,'QA' from i4_shops;
insert into public.customers(barbershop_id,full_name) select id,'Cliente '||x from i4_shops cross join generate_series(1,1000) x;
insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,price_cents,status)
 select id,barber,service,customer,'2025-01-01'::timestamptz+x*interval '30 minutes',
 '2025-01-01'::timestamptz+(x+1)*interval '30 minutes',3000,'completed' from i4_shops cross join generate_series(1,1000) x;
analyze public.appointments;
analyze public.customers;
analyze public.barbershop_members;
select id as shop from i4_shops where n=1 \gset
select set_config('request.jwt.claims',jsonb_build_object('sub',:'actor','role','authenticated')::text,true);
set local role authenticated;
\echo Agenda: tenant + time range under actual RLS (20,000 synthetic appointments)
explain (analyze,buffers,format text) select id,starts_at,status from public.appointments
 where barbershop_id=:'shop' and starts_at>='2025-01-10Z' and starts_at<'2025-01-11Z' order by starts_at;
\echo Customer page: tenant + active + sort under actual RLS (20,020 synthetic customers)
explain (analyze,buffers,format text) select id,full_name from public.customers
 where barbershop_id=:'shop' and is_active order by full_name limit 20;
\echo Customer substring search and exact count under actual RLS
explain (analyze,buffers,format text) select count(*) from public.customers
 where barbershop_id=:'shop' and is_active and (full_name ilike '%500%' or email ilike '%500%');
reset role;
rollback;
