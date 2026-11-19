-- Committed synthetic fixtures are visible to two independent sessions.
\set ON_ERROR_STOP on
\ir b2b-fixtures.sql
create extension if not exists dblink with schema extensions;
select pg_temp.enrolled_shop() as shop, pg_temp.enrolled_shop() as other_shop \gset
select private.register_manual_agreement(gen_random_uuid(),:'shop',pg_temp.terms()) as contract,
  private.register_manual_agreement(gen_random_uuid(),:'other_shop',pg_temp.terms()) as other_contract \gset
select extensions.dblink_connect(peer,'dbname=postgres user=supabase_admin application_name='||peer)
from unnest(array['b2b_writer','b2b_retry']) peer;
select format('select private.issue_manual_invoice(gen_random_uuid(),%L,%L,%L)',:'shop',:'contract','2023-01-01') as issue \gset
select extensions.dblink_exec('b2b_writer','begin');
select id as invoice from extensions.dblink('b2b_writer',:'issue') as r(id uuid) \gset
select extensions.dblink_send_query('b2b_retry',:'issue');
do $$
declare deadline timestamptz:=clock_timestamp()+interval '10 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists(select from pg_stat_activity a join pg_stat_activity b on a.pid=any(pg_blocking_pids(b.pid))
      where a.application_name='b2b_writer' and b.application_name='b2b_retry');
    if clock_timestamp()>deadline then raise exception 'Expected real lock contention'; end if;
    perform pg_sleep(0.02);
  end loop;
  raise notice 'PASS issue waits for uncommitted competing competence';
end $$;
select extensions.dblink_exec('b2b_writer','commit');
select id as retry_invoice from extensions.dblink_get_result('b2b_retry') as r(id uuid) \gset
select * from extensions.dblink_get_result('b2b_retry') as r(id uuid);
select pg_temp.verify('one invoice and one issuance audit across connections',:'invoice'=:'retry_invoice'
  and (select count(*) from public.payments where subscription_id=:'contract')=1
  and (select count(*) from public.audit_logs where action='manual_billing.invoice' and entity_id=:'invoice')=1);
select private.issue_manual_invoice(gen_random_uuid(),:'other_shop',:'other_contract','2023-02-01');
update public.subscriptions set status='active' where id in (:'contract',:'other_contract');
select extensions.dblink_exec(peer,'set role lps_manual_overdue_worker') from unnest(array['b2b_writer','b2b_retry']) peer;
select extensions.dblink_exec('b2b_writer','begin');
select pg_temp.verify('worker one claims one',processed=1 and failed=0)
  from extensions.dblink('b2b_writer','select * from private.process_manual_overdue(1)') as r(processed int,failed int);
select extensions.dblink_exec('b2b_retry','set statement_timeout=''3s''');
select pg_temp.verify('worker two skips uncommitted row and processes different tenant',processed=1 and failed=0)
  from extensions.dblink('b2b_retry','select * from private.process_manual_overdue(1)') as r(processed int,failed int);
select pg_temp.verify('exactly one transition visible before first worker commits',
  (select count(*) from public.subscriptions where id in (:'contract',:'other_contract') and status='past_due')=1);
select extensions.dblink_exec('b2b_writer','commit');
select pg_temp.verify('exactly two overdue events, correlated by tenant',count(*)=2)
from public.audit_logs a join public.payments p on p.id=(a.metadata->>'payment_id')::uuid
  and p.subscription_id=a.entity_id and p.barbershop_id=a.barbershop_id
where a.action='manual_billing.past_due' and a.entity_id in (:'contract',:'other_contract');
select pg_temp.verify('retry does not duplicate transitions',processed=0 and failed=0) from private.process_manual_overdue(10);
select extensions.dblink_disconnect('b2b_writer'),extensions.dblink_disconnect('b2b_retry');
