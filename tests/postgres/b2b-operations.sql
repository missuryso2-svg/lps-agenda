\set ON_ERROR_STOP on
begin;
\ir b2b-fixtures.sql
select pg_temp.enrolled_shop() as shop, pg_temp.enrolled_shop() as other_shop,
  gen_random_uuid() as operation, gen_random_uuid() as invoice_op \gset
select id as trial from public.subscriptions where barbershop_id=:'shop' \gset
select pg_temp.rejected('uncontracted trial cannot issue',format('select private.issue_manual_invoice(gen_random_uuid(),%L,%L,current_date)',:'shop',:'trial'),'23503');
select pg_temp.verify('expired trial blocks without grace',private.booking_access_at(:'shop',now())->>'state'='blocked');
select pg_temp.rejected('missing terms fail',format('select private.register_manual_agreement(gen_random_uuid(),%L,null)',:'shop'),'22023');
select pg_temp.rejected('missing or negative explicit price',format(
  'select private.register_manual_agreement(gen_random_uuid(),%L,jsonb_populate_record(pg_temp.terms(),%L))',:'shop',changes),'22023')
from (values('{"monthly_cents":null}'),('{"monthly_cents":-1}'),('{"currency":"USD"}')) inputs(changes);
select private.register_manual_agreement(:'operation',:'shop',pg_temp.terms()) as contract \gset
select pg_temp.verify('repeat agreement',private.register_manual_agreement(:'operation',:'shop',pg_temp.terms())=:'contract');
select pg_temp.verify('registration is pending and does not issue or activate',exists(select from public.subscriptions
  where id=:'contract' and status='pending' and contracted_price_cents=4321)
  and not exists(select from public.payments where barbershop_id=:'shop')
  and not (private.booking_access_at(:'shop',now())->>'allowed')::boolean);
select pg_temp.rejected('agreement key payload conflict',format(
  'select private.register_manual_agreement(%L,%L,pg_temp.terms())',:'operation',:'other_shop'),'22023');
select pg_temp.rejected('tenant mismatch',format('select private.issue_manual_invoice(gen_random_uuid(),%L,%L,%L)',:'other_shop',:'contract','2023-01-01'),'23503');
select pg_temp.rejected('pre-contract competence',format('select private.issue_manual_invoice(gen_random_uuid(),%L,%L,%L)',:'shop',:'contract','2022-12-01'),'22023');
select pg_temp.rejected('future coverage',format('select private.issue_manual_invoice(gen_random_uuid(),%L,%L,%L)',:'shop',:'contract','2099-01-01'),'55000');
select private.issue_manual_invoice(:'invoice_op',:'shop',:'contract','2023-01-01') as first_bill \gset
select pg_temp.verify('same key returns existing invoice', private.issue_manual_invoice(:'invoice_op',:'shop',:'contract','2023-01-01')=:'first_bill');
select pg_temp.verify('another key converges on same competence',private.issue_manual_invoice(gen_random_uuid(),:'shop',:'contract','2023-01-01')=:'first_bill');
select pg_temp.rejected('invoice key cannot change month',format('select private.issue_manual_invoice(%L,%L,%L,%L)',:'invoice_op',:'shop',:'contract','2023-02-01'),'22023');
select pg_temp.verify('first exact negotiated due date and amount',exists(select from public.payments where id=:'first_bill'
  and barbershop_id=:'shop' and subscription_id=:'contract' and scope='platform_subscription' and method='pix'
  and status='pending' and due_at='2023-01-20 18:30Z' and amount_cents=4321 and original_amount_cents=4321));
select pg_temp.rejected('cannot rewrite price after issue',format('update public.subscriptions set contracted_price_cents=5000 where id=%L',:'contract'),'23514');
select pg_temp.verify('pending contract can have overdue invoice without acquiring access',processed=1 and failed=0)
from private.process_manual_overdue(10);
select pg_temp.verify('first missed payment grants no grace',status='pending' and past_due_since is null)
from public.subscriptions where id=:'contract';
-- Simulate prior financial confirmation ONLY in fixtures. No callable settlement operation.
insert into auth.users(id) values(gen_random_uuid()) returning id as verifier \gset
update public.payments set status='paid',verified_by=:'verifier',paid_at='2023-02-01Z',verified_at='2023-02-02Z' where id=:'first_bill';
select private.issue_manual_invoice(gen_random_uuid(),:'shop',:'contract','2023-02-01') as feb \gset
update public.payments set status='paid',verified_by=:'verifier',paid_at='2023-02-05Z',verified_at='2023-02-06Z' where id=:'feb';
select private.issue_manual_invoice(gen_random_uuid(),:'shop',:'contract','2023-03-01') as march \gset
select private.issue_manual_invoice(gen_random_uuid(),:'shop',:'contract','2024-02-01') as leap \gset
select pg_temp.verify('calendar following early/late payments, including DST offset', count(*)=3)
from public.payments where subscription_id=:'contract' and due_timezone='America/New_York'
and (competence,due_at) in (('2023-02-01'::date,'2023-02-28 15:30Z'::timestamptz),
  ('2023-03-01','2023-03-31 14:30Z'),('2024-02-01','2024-02-29 15:30Z'));
update public.subscriptions set status='active' where id=:'contract';
-- A B1 historical fully discounted invoice is not a collectible debt.
insert into public.payments(barbershop_id,subscription_id,gateway,invoice_link_key,scope,method,status,
  competence,due_date,due_at,due_timezone,original_amount_cents,adjustment_cents,adjustment_reason,amount_cents)
values(:'shop',:'contract','manual_pix',:'shop','platform_subscription','pix','pending','2023-05-01',
  '2023-05-31','2023-05-31 14:30Z','America/New_York',4321,-4321,'QA full discount',0) returning id as free_bill \gset
create function pg_temp.fail_overdue() returns trigger language plpgsql as $$
begin raise exception 'QA injected failure' using errcode='P1001'; end $$;
create trigger qa_failure after insert on public.audit_logs for each row when(new.action='manual_billing.past_due')
execute function pg_temp.fail_overdue();
select pg_temp.verify('worker failure isolated',failed=1 and processed=0) from private.process_manual_overdue(1);
select pg_temp.verify('failed audit rolls back invoice and subscription',exists(select from public.payments where id=:'march' and status='pending')
  and exists(select from public.subscriptions where id=:'contract' and status='active')
  and exists(select from private.manual_overdue_retry where payment_id=:'march' and error_state='P1001'));
drop trigger qa_failure on public.audit_logs;
update private.manual_overdue_retry set retry_at=now() where payment_id=:'march';
select pg_temp.verify('retry updates both records',processed=1 and failed=0) from private.process_manual_overdue(1);
select past_due_since as since, grace_period_ends_at as cutoff from public.subscriptions where id=:'contract' \gset
select pg_temp.verify('exact 72h grace',:'cutoff'::timestamptz-:'since'::timestamptz=interval '72 hours'
  and private.booking_access_at(:'shop',:'cutoff'::timestamptz-interval '1 microsecond')->>'state'='grace'
  and private.booking_access_at(:'shop',:'cutoff')->>'state'='blocked');
select pg_temp.verify('second invoice processed once',processed=1 and failed=0) from private.process_manual_overdue(10);
select pg_temp.verify('empty replay',processed=0 and failed=0) from private.process_manual_overdue(10);
select pg_temp.verify('zero balance is not overdue',status='pending') from public.payments where id=:'free_bill';
select private.issue_manual_invoice(gen_random_uuid(),:'shop',:'contract','2023-04-01') as old_unpaid \gset
update public.payments set status='paid',verified_by=:'verifier',paid_at=now(),verified_at=now()
  where id=:'old_unpaid';
select pg_temp.verify('past_due not extended or cured by older paid month',status='past_due' and past_due_since=:'since' and grace_period_ends_at=:'cutoff')
from public.subscriptions where id=:'contract';
select pg_temp.verify('other tenant trial intact',status='trialing' and past_due_since is null) from public.subscriptions where barbershop_id=:'other_shop';
update public.subscriptions set status='canceled',canceled_at=now() where id=:'contract';
select pg_temp.rejected('canceled contract cannot issue',format('select private.issue_manual_invoice(gen_random_uuid(),%L,%L,%L)',:'shop',:'contract','2024-03-01'),'55000');
select pg_temp.verify('historical retry after cancellation', private.issue_manual_invoice(:'invoice_op',:'shop',:'contract','2023-01-01')=:'first_bill');
select pg_temp.rejected('new agreement cannot overlap trial',format(
  'select private.register_manual_agreement(gen_random_uuid(),%L,jsonb_populate_record(pg_temp.terms(),%L))',
  :'other_shop','{"coverage_start":"2019-01-03Z"}'),'55000');
select pg_temp.rejected('first due must precede next due',format(
  'select private.register_manual_agreement(gen_random_uuid(),%L,jsonb_populate_record(pg_temp.terms(),%L))',
  :'other_shop','{"first_due":"2030-01-01Z"}'),'22023');
select private.register_manual_agreement(gen_random_uuid(),:'other_shop',
  jsonb_populate_record(pg_temp.terms(),'{"due_day":12,"due_time":"02:30"}')) as gap_contract \gset
select private.issue_manual_invoice(gen_random_uuid(),:'other_shop',:'gap_contract','2023-03-01') as gap_invoice \gset
select pg_temp.verify('DST gap follows PostgreSQL wall-time rule',due_at='2023-03-12 07:30Z') from public.payments where id=:'gap_invoice';
select pg_temp.enrolled_shop() as fold_shop, gen_random_uuid() as retry_key \gset
select private.register_manual_agreement(gen_random_uuid(),:'fold_shop',
  jsonb_populate_record(pg_temp.terms(),'{"due_day":5,"due_time":"01:30"}')) as fold_contract \gset
create trigger qa_issue_failure after insert on public.audit_logs for each row when(new.action='manual_billing.invoice')
  execute function pg_temp.fail_overdue();
select pg_temp.rejected('invoice and audit fail together',format('select private.issue_manual_invoice(%L,%L,%L,%L)',
  :'retry_key',:'fold_shop',:'fold_contract','2023-11-01'),'P1001');
select pg_temp.verify('failed issue retains no receipt or invoice',
  not exists(select from private.manual_operation_receipts where operation_id=:'retry_key')
  and not exists(select from public.payments where subscription_id=:'fold_contract'));
drop trigger qa_issue_failure on public.audit_logs;
select private.issue_manual_invoice(:'retry_key',:'fold_shop',:'fold_contract','2023-11-01') as fold_invoice \gset
select pg_temp.verify('retry and autumn DST fold',due_at='2023-11-05 06:30Z') from public.payments where id=:'fold_invoice';
select pg_temp.verify('legacy API roles cannot execute any billing operation',not exists(
  select from pg_proc p cross join unnest(array['anon','authenticated','service_role','authenticator','lps_trial_onboarding']) r
  where p.pronamespace='private'::regnamespace and p.proname in ('register_manual_agreement','issue_manual_invoice','process_manual_overdue','manual_operation_result')
    and has_function_privilege(r,p.oid,'EXECUTE')));
select pg_temp.verify('worker has no general financial grants',not has_table_privilege('lps_manual_overdue_worker','public.payments','insert,update,delete')
  and not pg_has_role('authenticator','lps_manual_overdue_worker','SET'));
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'verifier','app_metadata',jsonb_build_object('lps_role','platform_admin'))::text,true);
select pg_temp.rejected('authenticated cannot issue directly',format('select private.issue_manual_invoice(gen_random_uuid(),%L,%L,current_date)',:'shop',:'contract'),'42501');
select pg_temp.rejected('authenticated cannot register',format('select private.register_manual_agreement(gen_random_uuid(),%L,null)',:'shop'),'42501');
reset role;
set local role service_role;
select pg_temp.rejected('service cannot run worker','select private.process_manual_overdue(1)','42501');
select pg_temp.rejected('service cannot directly update invoice',format('update public.payments set status=''pending'' where id=%L',:'march'),'42501');
reset role;
rollback;
