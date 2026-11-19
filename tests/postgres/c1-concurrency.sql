-- Dedicated disposable database. Two authenticated PostgREST-style sessions
-- and the B2-B worker operate on the exact same rows across commits.
\set ON_ERROR_STOP on
\ir b2b-fixtures.sql
create extension if not exists dblink with schema extensions;
select gen_random_uuid() as actor,pg_temp.enrolled_shop() as shop,date_trunc('month',now())::date as month \gset
insert into auth.users(id) values(:'actor');
select private.bootstrap_financial_manager(:'actor','QA concurrency');
select private.register_manual_agreement(gen_random_uuid(),:'shop',jsonb_populate_record(pg_temp.terms(),
  jsonb_build_object('coverage_start',:'month'::date,'first_month',:'month','first_due',now()-interval '1 day','zone','UTC','renewal_day',1))) as contract \gset
select extensions.dblink_connect(peer,'dbname=postgres user=supabase_admin application_name='||peer)
from unnest(array['c1_a','c1_b','c1_worker']) peer;
select extensions.dblink_exec(peer,'set session authorization authenticator') from unnest(array['c1_a','c1_b']) peer;
select extensions.dblink_exec(peer,'set role authenticated') from unnest(array['c1_a','c1_b']) peer;
select extensions.dblink_exec(peer,format('set request.jwt.claims=%L',jsonb_build_object('sub',:'actor','role','authenticated')::text))
from unnest(array['c1_a','c1_b']) peer;
create function pg_temp.wait_blocked(holder text) returns void language plpgsql as $$
declare deadline timestamptz:=clock_timestamp()+interval '10 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists(select from pg_stat_activity a join pg_stat_activity b on a.pid=any(pg_blocking_pids(b.pid))
      where a.application_name=holder and b.application_name='c1_b');
    if clock_timestamp()>deadline then raise exception 'Expected contention'; end if;
    perform pg_sleep(0.02);
  end loop;
  raise notice 'PASS real waiter behind %',holder;
end $$;
select format('select public.finance_invoice(gen_random_uuid(),%L,%L,%L)',:'shop',:'contract',:'month') as issue \gset
select extensions.dblink_exec('c1_a','begin');
select result->>'invoice' as invoice from extensions.dblink('c1_a',:'issue') as r(result jsonb) \gset
select extensions.dblink_send_query('c1_b',:'issue');
select pg_temp.wait_blocked('c1_a');
select extensions.dblink_exec('c1_a','commit');
select pg_temp.verify('parallel human issuance returns one invoice',result->>'invoice'=:'invoice')
from extensions.dblink_get_result('c1_b') as r(result jsonb);
select * from extensions.dblink_get_result('c1_b') as r(result jsonb);
select format('select public.finance_confirm_pix(%L,%L,%L,%L,4321,%L,true,%L)',gen_random_uuid(),:'shop',:'contract',:'invoice',now(),'c1-race') as settle \gset
select extensions.dblink_exec('c1_a','begin');
select result::text as receipt from extensions.dblink('c1_a',:'settle') as r(result jsonb) \gset
select extensions.dblink_send_query('c1_b',:'settle');
select pg_temp.wait_blocked('c1_a');
select extensions.dblink_exec('c1_a','commit');
select pg_temp.verify('parallel Pix returns identical receipt',result=:'receipt'::jsonb) from extensions.dblink_get_result('c1_b') as r(result jsonb);
select * from extensions.dblink_get_result('c1_b') as r(result jsonb);
select pg_temp.verify('one settlement audit',count(*)=1) from public.audit_logs where entity_id=:'invoice' and metadata->>'status'='paid';

-- Construct two further contracts with an already started current period.
create function pg_temp.race_contract() returns table(shop uuid,contract uuid,invoice uuid) language plpgsql as $$
declare m date:=date_trunc('month',now())::date;
begin
 shop:=pg_temp.enrolled_shop();
 contract:=private.register_manual_agreement(gen_random_uuid(),shop,jsonb_populate_record(pg_temp.terms(),
   jsonb_build_object('coverage_start',m,'first_month',m,'first_due',now()-interval '1 day','zone','UTC','renewal_day',1)));
 invoice:=private.issue_manual_invoice(gen_random_uuid(),shop,contract,m);
 return next;
end $$;
select * from pg_temp.race_contract() \gset
select extensions.dblink_exec('c1_a','begin');
select * from extensions.dblink('c1_a',format('select public.finance_contract_action(gen_random_uuid(),%L,%L,%L,%L)',
  :'shop',:'contract','cancel','QA before credit')) as r(result jsonb);
select extensions.dblink_send_query('c1_b',format('select public.finance_confirm_pix(gen_random_uuid(),%L,%L,%L,4321,now(),true)',:'shop',:'contract',:'invoice'));
select pg_temp.wait_blocked('c1_a');
select extensions.dblink_exec('c1_a','commit');
select pg_temp.verify('late credit keeps cancellation',result->>'contract_after'='canceled') from extensions.dblink_get_result('c1_b') as r(result jsonb);
select * from extensions.dblink_get_result('c1_b') as r(result jsonb);
select pg_temp.verify('late payment retained and access closed',exists(select from public.payments where id=:'invoice' and status='paid')
  and private.booking_access_at(:'shop',now())->>'state'='blocked');
select * from pg_temp.race_contract() \gset
update public.subscriptions set status='active' where id=:'contract';
select extensions.dblink_exec('c1_worker','set role lps_manual_overdue_worker');
select extensions.dblink_exec('c1_worker','begin');
select pg_temp.verify('worker claims due invoice',processed=1 and failed=0)
from extensions.dblink('c1_worker','select * from private.process_manual_overdue(100)') as r(processed int,failed int);
select extensions.dblink_send_query('c1_b',format('select public.finance_confirm_pix(gen_random_uuid(),%L,%L,%L,4321,now(),true)',:'shop',:'contract',:'invoice'));
select pg_temp.wait_blocked('c1_worker');
select extensions.dblink_exec('c1_worker','commit');
select pg_temp.verify('credit reconciles committed delinquency',result->>'contract_before'='past_due' and result->>'contract_after'='active')
from extensions.dblink_get_result('c1_b') as r(result jsonb);
select pg_temp.verify('one paid invoice with consistent coverage',exists(select from public.payments where id=:'invoice' and status='paid')
  and private.booking_access_at(:'shop',clock_timestamp())->>'reason'='paid');
select extensions.dblink_disconnect(peer) from unnest(array['c1_a','c1_b','c1_worker']) peer;
