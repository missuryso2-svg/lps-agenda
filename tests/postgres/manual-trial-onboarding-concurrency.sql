-- Dedicated QA only. These sessions need committed fixtures to see one another.
\set ON_ERROR_STOP on
create extension if not exists dblink with schema extensions;
select gen_random_uuid() as actor, gen_random_uuid() as intent \gset
begin;
insert into auth.users(id) values (:'actor');
update private.manual_trial_activation set enabled=true;
select to_regprocedure('public.authorize_manual_trial_intent(uuid,uuid,text,text,text,text)') is not null as app_gate \gset
\if :app_gate
select public.authorize_manual_trial_intent(:'actor',:'intent','QA concurrency','race-' || :'intent',null,'America/Sao_Paulo');
\endif
commit;

select extensions.dblink_connect(peer,'dbname=postgres user=supabase_admin application_name=' || peer)
from unnest(array['b2a1_first','b2a1_retry']) peer;
do $$
declare peer text;
begin
  foreach peer in array array['b2a1_first','b2a1_retry'] loop
    perform extensions.dblink_exec(peer,'begin');
    perform extensions.dblink_exec(peer,'set local session authorization authenticator');
    perform extensions.dblink_exec(peer,'set local role authenticated');
  end loop;
end $$;
select extensions.dblink_exec(peer,format('set local request.jwt.claims = %L',
  jsonb_build_object('sub',:'actor','role','authenticated')::text))
from unnest(array['b2a1_first','b2a1_retry']) peer;
select format('select public.create_barbershop_with_manual_trial(%L,%L,%L)',:'intent',
  'QA concurrency','race-' || :'intent') as rpc \gset
select shop as first_shop from extensions.dblink('b2a1_first',:'rpc') as r(shop uuid) \gset
select extensions.dblink_send_query('b2a1_retry',:'rpc');
do $$
declare deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists (
      select from pg_catalog.pg_stat_activity a join pg_catalog.pg_stat_activity b
        on a.pid = any(pg_blocking_pids(b.pid))
      where a.application_name='b2a1_first' and b.application_name='b2a1_retry'
        and b.wait_event='advisory'
    );
    if clock_timestamp() >= deadline then raise exception 'No concurrent wait observed'; end if;
    perform pg_sleep(0.025);
  end loop;
  raise notice 'PASS retry waiting on the uncommitted first intention';
end $$;
select extensions.dblink_exec('b2a1_first','commit');
select shop as retry_shop from extensions.dblink_get_result('b2a1_retry') as r(shop uuid) \gset
-- Consume the asynchronous command terminator before reuse of this connection.
select * from extensions.dblink_get_result('b2a1_retry') as r(shop uuid);
select extensions.dblink_exec('b2a1_retry','commit');
select extensions.dblink_disconnect('b2a1_first'),extensions.dblink_disconnect('b2a1_retry');
update private.manual_trial_activation set enabled=false;
select (:'first_shop' = :'retry_shop'
  and (select count(*) from public.barbershops where slug='race-' || :'intent') = 1
  and (select count(*) from public.barbershop_members where user_id=:'actor' and role='owner') = 1
  and (select count(*) from private.manual_trial_intents where user_id=:'actor') = 1
  and (select count(*) from public.subscriptions where barbershop_id=:'first_shop' and status='trialing') = 1
  and not exists (select from public.payments where barbershop_id=:'first_shop')) as valid \gset
\if :valid
\echo PASS both sessions committed the same shop, one owner, one intent, one trial, zero payments
\else
do $$ begin raise exception 'Invalid concurrent onboarding result'; end $$;
\endif
