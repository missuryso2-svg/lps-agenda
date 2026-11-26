\set ON_ERROR_STOP on
-- Committed synthetic fixtures are required for independent sessions.
\ir b2b-fixtures.sql
create extension if not exists dblink with schema extensions;

select gen_random_uuid() as actor, gen_random_uuid() as invited, gen_random_uuid() as inviter_shop \gset
select 'qa-trial-race-'||:'actor' as prefix \gset
select pg_temp.verify('concurrency starts with release disabled',not public.automatic_premium_trial_available());
insert into auth.users(id,email_confirmed_at) values(:'actor',now()),(:'invited',now());
insert into public.barbershops(id,name,slug) values(:'inviter_shop','QA Convite',:'prefix'||'-team');
update private.automatic_premium_trial_activation set enabled=true;

select extensions.dblink_connect('trial_peer','dbname=postgres user=supabase_admin application_name=trial_peer');
select extensions.dblink_exec('trial_peer','set session authorization authenticator');
select extensions.dblink_exec('trial_peer','set role authenticated');
select extensions.dblink_exec('trial_peer',format('set request.jwt.claims = %L',jsonb_build_object('sub',:'actor','role','authenticated')));
create function pg_temp.wait_trial_peer() returns void language plpgsql as $$
declare deadline timestamptz := clock_timestamp()+interval '8 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists(select from pg_stat_activity where application_name='trial_peer'
      and pg_backend_pid()=any(pg_blocking_pids(pid)));
    if clock_timestamp()>deadline then raise exception 'Expected separate session waiting on this transaction'; end if;
    perform pg_sleep(0.02);
  end loop;
end
$$;

-- Both requests start before the first commit, with different slugs.
begin;
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'actor','role','authenticated')::text,true) as claims \gset
select public.create_barbershop('QA Corrida A',:'prefix'||'-a') as one \gset
reset session authorization;
select extensions.dblink_send_query('trial_peer',format(
  'select public.create_barbershop(%L,%L)','QA Corrida B',:'prefix'||'-b'));
select pg_temp.wait_trial_peer();
commit;
select shop as two from extensions.dblink_get_result('trial_peer') as r(shop uuid) \gset
select * from extensions.dblink_get_result('trial_peer') as r(shop uuid);
select pg_temp.verify('parallel distinct requests grant one Premium period',
  :'one' <> :'two'
  and (select count(*)=1 from private.automatic_premium_trials where owner_id=:'actor')
  and (select count(*)=1 from public.subscriptions where barbershop_id in (:'one',:'two'))
  and private.booking_access_at(:'two',now())->>'reason'='no_coverage');

-- A second browser window waits for the first welcome write and loses.
begin;
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'actor','role','authenticated')::text,true) as claims \gset
select pg_temp.verify('first concurrent window claims welcome',public.claim_automatic_trial_welcome(:'one'));
reset session authorization;
select extensions.dblink_send_query('trial_peer',format(
  'select public.claim_automatic_trial_welcome(%L)',:'one'));
select pg_temp.wait_trial_peer();
commit;
select pg_temp.verify('concurrent second window cannot claim again',not opened)
  from extensions.dblink_get_result('trial_peer') as r(opened boolean);
select * from extensions.dblink_get_result('trial_peer') as r(opened boolean);

-- An uncommitted staff invitation wins against onboarding via the ledger PK.
select extensions.dblink_exec('trial_peer',format('set request.jwt.claims = %L',jsonb_build_object('sub',:'invited','role','authenticated')));
begin;
insert into public.barbershop_members(barbershop_id,user_id,role) values(:'inviter_shop',:'invited','staff');
select extensions.dblink_send_query('trial_peer',format(
  'select public.create_barbershop(%L,%L)','QA Convidado',:'prefix'||'-staff'));
select pg_temp.wait_trial_peer();
commit;
select shop as staff_shop from extensions.dblink_get_result('trial_peer') as r(shop uuid) \gset
select pg_temp.verify('invitation committed first disqualifies the competing onboarding',
  not exists(select from private.automatic_premium_trials where owner_id=:'invited')
  and not exists(select from public.subscriptions where barbershop_id=:'staff_shop'));
select extensions.dblink_disconnect('trial_peer');

update private.automatic_premium_trial_activation set enabled=false;
set session authorization authenticator;
set role service_role;
delete from public.barbershops where id in (:'one',:'two',:'inviter_shop',:'staff_shop');
reset session authorization;
