-- Only on the disposable QA database; dblink uses its Unix socket.
\set ON_ERROR_STOP on
\ir b2b-fixtures.sql
create extension if not exists dblink with schema extensions;

begin;
select gen_random_uuid() as shop,gen_random_uuid() as actor,gen_random_uuid() as barber,
  gen_random_uuid() as service,gen_random_uuid() as customer,gen_random_uuid() as booking,
  (current_date+10+time '09:00') at time zone 'UTC' as slot,
  extract(dow from current_date+10)::integer as weekday \gset
insert into auth.users(id) values(:'actor');
insert into public.barbershops(id,name,slug,timezone) values(:'shop','QA agenda','k1b-'||:'shop','UTC');
insert into public.barbershop_members(barbershop_id,user_id,role) values(:'shop',:'actor','staff');
insert into public.barbers(id,barbershop_id,name) values(:'barber',:'shop','QA');
insert into public.services(id,barbershop_id,name,duration_minutes,price_cents) values(:'service',:'shop','QA',30,4100);
insert into public.customers(id,barbershop_id,full_name) values(:'customer',:'shop','QA');
insert into public.barber_services(barbershop_id,barber_id,service_id) values(:'shop',:'barber',:'service');
insert into public.business_hours(barbershop_id,weekday,opens_at,closes_at) values(:'shop',:weekday,'09:00','18:00');
insert into public.barber_working_hours(barbershop_id,barber_id,weekday,starts_at,ends_at) values(:'shop',:'barber',:weekday,'09:00','18:00');
insert into public.appointments(id,barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,price_cents)
 values(:'booking',:'shop',:'barber',:'service',:'customer',:'slot',:'slot'::timestamptz+interval '30 minutes',4100);
commit;

select extensions.dblink_connect(peer,'dbname=postgres user=supabase_admin application_name='||peer)
  from unnest(array['k1b_rating','k1b_cancel']) peer;
select extensions.dblink_exec(peer,'set session authorization authenticator')
  from unnest(array['k1b_rating','k1b_cancel']) peer;
select extensions.dblink_exec(peer,'set role authenticated')
  from unnest(array['k1b_rating','k1b_cancel']) peer;
select extensions.dblink_exec(peer,format('set request.jwt.claims=%L',jsonb_build_object('sub',:'actor','role','authenticated')::text))
  from unnest(array['k1b_rating','k1b_cancel']) peer;

select extensions.dblink_exec('k1b_rating','begin');
select * from extensions.dblink('k1b_rating',format('select public.complete_rated_appointment(%L,%L,8,9)',:'shop',:'booking'))
  as result(completed text);
select extensions.dblink_send_query('k1b_cancel',format(
  'update public.appointments set status=%L,cancel_reason=%L where id=%L returning id',
  'cancelled','QA race',:'booking'));

do $$
declare deadline timestamptz:=clock_timestamp()+interval '10 seconds';
begin
 loop
  perform pg_stat_clear_snapshot();
  exit when exists(select from pg_stat_activity waiter
    join pg_stat_activity owner on owner.pid=any(pg_blocking_pids(waiter.pid))
    where waiter.application_name='k1b_cancel' and owner.application_name='k1b_rating');
  if clock_timestamp()>deadline then raise exception 'Expected row lock contention'; end if;
  perform pg_sleep(0.025);
 end loop;
 raise notice 'PASS cancel waits behind in-flight rated completion';
end
$$;

select extensions.dblink_exec('k1b_rating','commit');
do $$
begin
 perform * from extensions.dblink_get_result('k1b_cancel') as result(id uuid);
 raise exception 'An update reopened the completed appointment';
exception when check_violation then
 raise notice 'PASS the waiting update revalidated the committed state';
end $$;
select * from extensions.dblink_get_result('k1b_cancel') as drained(id uuid);
select pg_temp.verify('one committed completion, preserved price and rating',exists (
 select from public.appointments a join public.appointment_ratings r on r.appointment_id=a.id
 where a.id=:'booking' and a.status='completed' and a.cancel_reason is null and a.price_cents=4100
   and r.recorded_by=:'actor' and r.barber_score=8 and r.shop_score=9
));
select extensions.dblink_disconnect('k1b_rating'),extensions.dblink_disconnect('k1b_cancel');
