-- Disposable database. An uncommitted cancellation must fence a new booking.
\set ON_ERROR_STOP on
create extension if not exists dblink with schema extensions;
begin;
insert into public.barbershops(name,slug) values ('QA race','race-'||gen_random_uuid()) returning id as shop \gset
insert into public.subscriptions(barbershop_id,plan_id,gateway,status,invoice_link_key,trial_started_at,trial_ends_at)
select :'shop',id,'manual_pix','trialing','uncontracted',now(),now()+interval '168 hours'
from public.plans where code='basico' returning id as trial \gset
insert into public.customers(barbershop_id,full_name) values (:'shop','QA client') returning id as customer \gset
insert into public.barbers(barbershop_id,name) values (:'shop','QA barber') returning id as barber \gset
insert into public.services(barbershop_id,name,duration_minutes,price_cents)
values (:'shop','QA service',30,1000) returning id as service \gset
commit;
select extensions.dblink_connect(peer,'dbname=postgres user=supabase_admin application_name=' || peer)
from unnest(array['qa_subscription','qa_booking']) peer;
select extensions.dblink_exec('qa_subscription','begin');
select extensions.dblink_exec('qa_subscription',format('update public.subscriptions set status=''canceled'' where id=%L',:'trial'));
select extensions.dblink_send_query('qa_booking', format($q$
  insert into public.appointments(barbershop_id,customer_id,barber_id,service_id,starts_at,ends_at,price_cents)
  values (%L,%L,%L,%L,now()+interval '1 day',now()+interval '1 day 30 minutes',1000) returning id
$q$,:'shop',:'customer',:'barber',:'service'));
do $$
declare deadline timestamptz:=clock_timestamp()+interval '10 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists(select from pg_stat_activity a join pg_stat_activity b on a.pid=any(pg_blocking_pids(b.pid))
      where a.application_name='qa_subscription' and b.application_name='qa_booking');
    if clock_timestamp()>=deadline then raise exception 'Expected the booking to wait'; end if;
    perform pg_sleep(0.025);
  end loop;
  raise notice 'PASS booking waits on uncommitted subscription change';
end $$;
select extensions.dblink_exec('qa_subscription','commit');
do $$ begin
  perform * from extensions.dblink_get_result('qa_booking') as result(id uuid);
  raise exception 'Booking unexpectedly succeeded' using errcode='XX000';
exception when raise_exception then
  if sqlerrm <> 'Agendamentos temporariamente indisponíveis.' then raise; end if;
  raise notice 'PASS queued booking sees committed cancellation';
end $$;
select * from extensions.dblink_get_result('qa_booking') as drained(id uuid);
-- A snapshot taken before a competing commit must retry, even if the reader
-- starts its INSERT after the writer commits and therefore never waits.
select extensions.dblink_exec('qa_subscription',format(
  'update public.subscriptions set status=''trialing'' where id=%L',:'trial'));
select extensions.dblink_exec('qa_booking','begin isolation level repeatable read');
select * from extensions.dblink('qa_booking',format('select status::text from public.subscriptions where id=%L',:'trial'))
  as snapshot(status text);
select extensions.dblink_exec('qa_subscription',format(
  'update public.subscriptions set status=''canceled'' where id=%L',:'trial'));
select format($q$
  insert into public.appointments(barbershop_id,customer_id,barber_id,service_id,starts_at,ends_at,price_cents)
  values (%L,%L,%L,%L,now()+interval '1 day',now()+interval '1 day 30 minutes',1000)
$q$,:'shop',:'customer',:'barber',:'service') as attempted_insert \gset
select set_config('qa.attempted_insert',:'attempted_insert',false);
do $$ begin
  perform extensions.dblink_exec('qa_booking',current_setting('qa.attempted_insert'));
  raise exception 'Stale snapshot admitted booking';
exception when serialization_failure then
  raise notice 'PASS stale repeatable-read booking must retry';
end $$;
select extensions.dblink_exec('qa_booking','rollback');
select extensions.dblink_disconnect('qa_subscription'),extensions.dblink_disconnect('qa_booking');
select not exists(select from public.appointments where barbershop_id=:'shop') as empty \gset
\if :empty
\echo PASS no appointment persisted
\else
do $$ begin raise exception 'Unexpected booking'; end $$;
\endif
