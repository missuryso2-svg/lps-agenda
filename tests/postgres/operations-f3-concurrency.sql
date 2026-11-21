-- Disposable local database only. Use supabase_admin for loopback dblink sessions.
\set ON_ERROR_STOP on
create extension if not exists dblink with schema extensions;
begin;
insert into public.barbershops(name,slug) values('QA Pausa','pausa-'||gen_random_uuid()) returning id as shop \gset
insert into public.barbers(barbershop_id,name) values(:'shop','Profissional QA') returning id as barber \gset
insert into public.services(barbershop_id,name,duration_minutes,price_cents) values(:'shop','Corte QA',30,2000) returning id as service \gset
insert into public.customers(barbershop_id,full_name) values(:'shop','Cliente QA') returning id as customer \gset
insert into public.barber_services(barbershop_id,barber_id,service_id) values(:'shop',:'barber',:'service');
select (current_date+14+time '11:45') at time zone 'America/Sao_Paulo' as starts,extract(dow from current_date+14)::integer as weekday \gset
insert into public.business_hours(barbershop_id,weekday,opens_at,closes_at) values(:'shop',:weekday,'08:00','18:00');
insert into public.barber_working_hours(barbershop_id,barber_id,weekday,starts_at,ends_at) values(:'shop',:'barber',:weekday,'08:00','18:00');
commit;
select extensions.dblink_connect(peer,'dbname=postgres user=supabase_admin application_name='||peer) from unnest(array['f3_pause','f3_booking']) peer;
select format('insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,price_cents) values(%L,%L,%L,%L,%L,%L,2000) returning id',:'shop',:'barber',:'service',:'customer',:'starts',:'starts'::timestamptz+interval '30 minutes') as booking_sql \gset
select extensions.dblink_exec('f3_pause','begin');
select extensions.dblink_exec('f3_pause',format('insert into public.barber_breaks values(%L,%L,%s,''12:00'',''13:00'',true)',:'shop',:'barber',:weekday));
select extensions.dblink_send_query('f3_booking',:'booking_sql');
do $$
declare deadline timestamptz:=clock_timestamp()+interval '10 seconds';
begin
 loop
  perform pg_stat_clear_snapshot();
  exit when exists(select from pg_stat_activity a join pg_stat_activity b on a.pid=any(pg_blocking_pids(b.pid)) where a.application_name='f3_pause' and b.application_name='f3_booking');
  if clock_timestamp()>deadline then raise exception 'Booking did not wait for break';end if;
  perform pg_sleep(0.04);
 end loop;
end $$;
select extensions.dblink_exec('f3_pause','commit');
do $$begin
 perform * from extensions.dblink_get_result('f3_booking') as booked(id uuid);
 raise exception 'Reservation crossed committed break';
exception when check_violation then null;
end $$;
select * from extensions.dblink_get_result('f3_booking') as drained(id uuid);
-- Repeatable read retains its snapshot even when a break transaction already committed.
select extensions.dblink_exec('f3_booking','begin isolation level repeatable read');
select * from extensions.dblink('f3_booking',format('select is_active from public.barber_breaks where barbershop_id=%L',:'shop')) as snapshot(active boolean);
select extensions.dblink_exec('f3_pause',format('update public.barber_breaks set is_active=false where barbershop_id=%L',:'shop'));
select extensions.dblink_send_query('f3_booking',:'booking_sql');
do $$begin
 perform * from extensions.dblink_get_result('f3_booking') as booked(id uuid);
 raise exception 'Stale transaction did not retry';
exception when serialization_failure then null;
end $$;
select * from extensions.dblink_get_result('f3_booking') as drained(id uuid);
select extensions.dblink_exec('f3_booking','rollback');
select extensions.dblink_disconnect('f3_pause'),extensions.dblink_disconnect('f3_booking');
select 1/(count(*)=0)::integer as no_partial_booking from public.appointments where barbershop_id=:'shop';
