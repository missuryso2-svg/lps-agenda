-- Disposable QA, including the upgrade database with historical Asaas data.
\set ON_ERROR_STOP on
begin;
\ir b2b-fixtures.sql
create extension if not exists dblink with schema extensions;
select pg_temp.verify('scheduler installed off',private.run_overdue(10)='disabled'
  and (select worker_state='disabled' from private.finance_health_summary));
select pg_temp.rejected('invalid batch','select private.run_overdue(101)','22023');
select pg_temp.verify('runner can only invoke the scheduled entry',
  has_function_privilege('lps_overdue_runner','private.run_overdue(integer)','execute') and
  not has_function_privilege('lps_overdue_runner','private.process_manual_overdue(integer)','execute') and
  not has_table_privilege('lps_overdue_runner','public.subscriptions','update') and
  not pg_has_role('authenticator','lps_overdue_runner','set'));
set local role authenticated;
select pg_temp.rejected('ordinary role denied worker','select private.run_overdue(1)','42501');
select pg_temp.rejected('ordinary role denied metrics','select public.finance_health()','42501');
reset role;
select pg_temp.enrolled_shop() as shop, pg_temp.enrolled_shop() as mixed \gset
select id as plan from public.plans where code='basico' \gset
select private.register_manual_agreement(gen_random_uuid(),:'shop',pg_temp.terms()) as contract \gset
select private.issue_manual_invoice(gen_random_uuid(),:'shop',:'contract','2023-01-01') as invoice \gset
insert into private.financial_holds(contract,suspended) values(:'contract',true);
select pg_temp.rejected('suspended contract cannot issue a new competence',
  format('select private.issue_manual_invoice(gen_random_uuid(),%L,%L,%L)',:'shop',:'contract','2023-02-01'),'55000');
select pg_temp.verify('held invoice excluded',not exists(select from private.eligible_overdue where id=:'invoice'));
update private.financial_holds set suspended=false where contract=:'contract';
set local role service_role;
select pg_temp.rejected('service cannot enroll an Asaas subscription',format(
  'insert into public.subscriptions(barbershop_id,plan_id,status) values(%L,%L,''canceled'')',:'mixed',:'plan'),'42501');
reset role;
insert into public.subscriptions(barbershop_id,plan_id,status) values(:'mixed',:'plan','canceled') returning id as legacy \gset
select pg_temp.verify('mixed origin counted', (select mixed>0 from private.finance_health_summary));
select pg_temp.rejected('mixed history requires a decision',format(
  'select private.register_manual_agreement(gen_random_uuid(),%L,pg_temp.terms())',:'mixed'),'55000');
select pg_temp.rejected('no automatic conversion',format(
  'update public.subscriptions set gateway=''manual_pix'' where id=%L',:'legacy'),'23514');
select pg_temp.rejected('no terminal resurrection',format(
  'update public.subscriptions set status=''pending'' where id=%L',:'legacy'),'42501');
update private.overdue_schedule set enabled=true,changed_at=now()-interval '20 minutes';
select pg_temp.verify('missing heartbeat detected',(select worker_state='stale' from private.finance_health_summary));
select extensions.dblink_connect('e_lock','dbname=postgres user=supabase_admin');
select extensions.dblink_exec('e_lock','begin');
select * from extensions.dblink('e_lock',$$select pg_try_advisory_xact_lock(hashtextextended('lps/scheduled-manual-overdue',0))$$) as t(locked boolean);
select pg_temp.verify('overlap skips without another run',private.run_overdue(50)='busy' and not exists(select from private.overdue_runs));
select extensions.dblink_exec('e_lock','commit'), extensions.dblink_disconnect('e_lock');
create function pg_temp.fail_invoice() returns trigger language plpgsql as $$
begin raise exception 'synthetic sensitive message' using errcode='P1001'; end $$;
create trigger e_fault after update of status on public.payments for each row when(new.gateway='manual_pix' and new.status='overdue') execute function pg_temp.fail_invoice();
select pg_temp.verify('partial batch persisted',private.run_overdue(50)='partial');
select pg_temp.verify('safe partial telemetry',exists(select from private.overdue_runs where outcome='partial' and failed>=1) and
  exists(select from private.manual_overdue_retry where payment_id=:'invoice' and error_state='P1001')
  and (select status='pending' from public.payments where id=:'invoice'));
drop trigger e_fault on public.payments;
update private.manual_overdue_retry set retry_at=now() where payment_id=:'invoice';
select pg_temp.verify('successful retry',private.run_overdue(50)='ok');
select pg_temp.verify('first unpaid installment stays blocked',
  (select status='pending' and grace_period_ends_at is null from public.subscriptions where id=:'contract')
  and private.booking_access_at(:'shop',now())->>'state'='blocked');
select pg_temp.verify('monitor recovers and retains failures',
  (select worker_state='healthy' and last_ok is not null and failures_24h>=1 and processed_24h>=1 from private.finance_health_summary));
select pg_temp.verify('telemetry excludes records and identifiers',
  (select to_jsonb(h)::text not like '%synthetic sensitive%' and to_jsonb(h)::text not like '%'||:'shop'||'%' from private.finance_health_summary h));
rollback;
