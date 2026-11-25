\set ON_ERROR_STOP on
\ir b2b-fixtures.sql
create extension if not exists dblink with schema extensions;
select 'i4-rate-'||gen_random_uuid() as bucket \gset
select extensions.dblink_connect('i4_rate','dbname=postgres user=supabase_admin application_name=i4_rate');
begin;
select pg_temp.verify('first rate claim allowed',public.consume_booking_rate_limit(:'bucket',86400,1));
select extensions.dblink_send_query('i4_rate',format('select public.consume_booking_rate_limit(%L,86400,1)',:'bucket'));
do $$ declare deadline timestamptz:=clock_timestamp()+interval '5 seconds'; begin
 loop
  perform pg_stat_clear_snapshot();
  exit when exists(select from pg_stat_activity where application_name='i4_rate' and pg_backend_pid()=any(pg_blocking_pids(pid)));
  if clock_timestamp()>deadline then raise exception 'Expected concurrent limiter to block';end if;
  perform pg_sleep(0.02);
 end loop;
end $$;
commit;
select pg_temp.verify('concurrent claim cannot exceed limit',not allowed) from extensions.dblink_get_result('i4_rate') as r(allowed boolean);
select * from extensions.dblink_get_result('i4_rate') as r(allowed boolean);
select extensions.dblink_disconnect('i4_rate');
delete from public.booking_rate_limits where bucket=:'bucket';
