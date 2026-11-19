\set ON_ERROR_STOP on
begin;
\ir b2b-fixtures.sql
select gen_random_uuid() as manager,gen_random_uuid() as operator,gen_random_uuid() as ordinary,
  pg_temp.enrolled_shop() as shop,pg_temp.enrolled_shop() as other_shop,gen_random_uuid() as agreement_op,
  gen_random_uuid() as issue_op,gen_random_uuid() as pix_op \gset
insert into auth.users(id) values(:'manager'),(:'operator'),(:'ordinary');
insert into public.barbershop_members(barbershop_id,user_id,role) values(:'shop',:'ordinary','owner'),(:'other_shop',:'ordinary','staff');
select pg_temp.verify('no grants at install', not exists(select from private.financial_operators));
select private.bootstrap_financial_manager(:'manager','QA bootstrap');
select pg_temp.rejected('bootstrap once',format('select private.bootstrap_financial_manager(%L,%L)',:'ordinary','QA'),'55000');
select jsonb_build_object('sub',:'manager','role','authenticated')::text as manager_claim,
  jsonb_build_object('sub',:'operator','role','authenticated')::text as op_claim,
  jsonb_build_object('sub',:'ordinary','role','authenticated','app_metadata',jsonb_build_object('lps_role','platform_admin'),
    'user_metadata',jsonb_build_object('financial_operator',true))::text as ordinary_claim \gset
select (to_jsonb(pg_temp.terms()) || jsonb_build_object('coverage_start',date_trunc('month',now())-interval '2 months',
  'first_month',(date_trunc('month',now())-interval '2 months')::date,'first_due',date_trunc('month',now())-interval '2 months',
  'renewal_day',1,'due_day',1,'zone','UTC'))::text as terms,
  (date_trunc('month',now())-interval '2 months')::date as old_month,
  date_trunc('month',now())::date as this_month, clock_timestamp() as credit \gset
set local session authorization authenticator;
set local role service_role;
select pg_temp.rejected('privileged API cannot fabricate manual audit',
  $$insert into public.audit_logs(action,entity_type) values('manual_billing.invoice','payment')$$,'42501');
set local role anon;
select pg_temp.rejected('anon denied','select public.finance_shops()','42501');
set local role authenticated;
select set_config('request.jwt.claims',:'ordinary_claim',true);
select pg_temp.rejected('owner staff and legacy admin denied global read','select public.finance_shops()','42501');
select pg_temp.rejected('unregistered cannot confirm','select public.finance_confirm_pix(null,null,null,null,1,now(),true)','42501');
select pg_temp.rejected('no direct operator grant','insert into private.financial_operators default values','42501');
select set_config('request.jwt.claims',:'manager_claim',true);
select public.finance_operator(:'operator','operator','QA grant');
select set_config('request.jwt.claims',:'op_claim',true);
select pg_temp.rejected('operator cannot grant or promote',format('select public.finance_operator(%L,%L,%L)',:'operator','manager','QA'),'42501');
select pg_temp.verify('operator directory contains shop',exists(select from public.finance_shops() j where j->>'shop'=:'shop'));
select public.finance_agreement(:'agreement_op',:'shop',:'terms','qa-ref','QA terms')->>'contract' as contract \gset
select pg_temp.verify('agreement replay',public.finance_agreement(:'agreement_op',:'shop',:'terms','qa-ref','QA terms')->>'contract'=:'contract');
select pg_temp.rejected('receipt binds commercial reference',format('select public.finance_agreement(%L,%L,%L,%L,%L)',
  :'agreement_op',:'shop',:'terms','changed','QA terms'),'22023');
select pg_temp.rejected('invoice tenant mismatch',format('select public.finance_invoice(gen_random_uuid(),%L,%L,%L)',:'other_shop',:'contract',:'this_month'),'23503');
select public.finance_invoice(:'issue_op',:'shop',:'contract',:'old_month')->>'invoice' as older \gset
select public.finance_invoice(gen_random_uuid(),:'shop',:'contract',:'this_month')->>'invoice' as invoice \gset
select pg_temp.verify('invoice amount equals negotiated',exists(select from public.finance_invoices(:'shop',:'this_month','pending') j
  where (j->>'total_cents')::int=4321));
select pg_temp.rejected('requires bank credit check',format('select public.finance_confirm_pix(gen_random_uuid(),%L,%L,%L,4321,now(),false)',:'shop',:'contract',:'invoice'),'22023');
select pg_temp.rejected('partial and excess refused',format('select public.finance_confirm_pix(gen_random_uuid(),%L,%L,%L,%s,now(),true)',:'shop',:'contract',:'invoice',cents),'22023') from (values(42),(4322)) amounts(cents);
select pg_temp.rejected('cannot settle across tenants',format('select public.finance_confirm_pix(gen_random_uuid(),%L,%L,%L,4321,now(),true)',:'other_shop',:'contract',:'invoice'),'P0002');
select pg_temp.verify('older invoice does not activate while current month is due',
  (public.finance_confirm_pix(gen_random_uuid(),:'shop',:'contract',:'older',4321,:'credit',true,'qa-bank-old')->>'contract_after')='pending');
select pg_temp.rejected('reference cannot be reused',format('select public.finance_confirm_pix(gen_random_uuid(),%L,%L,%L,4321,%L,true,%L)',:'shop',:'contract',:'invoice',:'credit','QA-BANK-OLD'),'23505');
reset session authorization;
create function pg_temp.fail_journal() returns trigger language plpgsql as $$begin raise exception 'QA injected journal failure' using errcode='P1099'; end$$;
create trigger qa_fail_journal before insert on private.financial_journal for each row execute function pg_temp.fail_journal();
set local session authorization authenticator;
set local role authenticated;
select pg_temp.rejected('posting fails atomically',format('select public.finance_confirm_pix(%L,%L,%L,%L,4321,%L,true,%L)',:'pix_op',:'shop',:'contract',:'invoice',:'credit','qa-bank-current'),'P1099');
reset session authorization;
select pg_temp.verify('rollback preserves unpaid invoice',exists(select from public.payments where id=:'invoice' and status='pending' and verified_at is null));
drop trigger qa_fail_journal on private.financial_journal;
set local session authorization authenticator;
set local role authenticated;
select public.finance_confirm_pix(:'pix_op',:'shop',:'contract',:'invoice',4321,:'credit',true,'qa-bank-current')::text as receipt \gset
select pg_temp.verify('current payment activates',(:'receipt'::jsonb->>'coverage_confirmed')::boolean);
select pg_temp.verify('exact replay',public.finance_confirm_pix(:'pix_op',:'shop',:'contract',:'invoice',4321,:'credit',true,'qa-bank-current')=:'receipt'::jsonb);
select pg_temp.rejected('different payload after settlement',format('select public.finance_confirm_pix(%L,%L,%L,%L,4321,%L,true,%L)',:'pix_op',:'shop',:'contract',:'invoice',:'credit','new-ref'),'22023');
select pg_temp.verify('global financial totals',public.finance_totals(:'this_month',:'shop')->>'received_cents'='4321');
select public.finance_contract_action(gen_random_uuid(),:'shop',:'contract','suspend','QA hold');
reset session authorization;
select pg_temp.verify('hold blocks booking despite paid coverage',private.booking_access_at(:'shop',clock_timestamp())->>'reason'='suspended');
set local session authorization authenticator;
set local role authenticated;
select public.finance_contract_action(gen_random_uuid(),:'shop',:'contract','resume','QA verified');
select public.finance_invoice(gen_random_uuid(),:'shop',:'contract',(:'this_month'::date-interval '1 month')::date)->>'invoice' as outstanding \gset
select public.finance_contract_action(gen_random_uuid(),:'shop',:'contract','suspend','QA second hold');
select pg_temp.rejected('resume refuses another overdue obligation',format(
  'select public.finance_contract_action(gen_random_uuid(),%L,%L,%L,%L)',:'shop',:'contract','resume','QA check'),'55000');
select pg_temp.verify('credit cannot clear administrative hold',not (public.finance_confirm_pix(gen_random_uuid(),:'shop',
  :'contract',:'outstanding',4321,clock_timestamp(),true)->>'coverage_confirmed')::boolean);
select public.finance_contract_action(gen_random_uuid(),:'shop',:'contract','resume','QA cleared');
select pg_temp.rejected('adjustment unavailable even with reason',format(
  'select public.finance_contract_action(gen_random_uuid(),%L,%L,%L,%L)',:'shop',:'contract','adjust','QA reason'),'22023');
select pg_temp.rejected('extra days cannot create payment',format(
  'select public.finance_contract_action(gen_random_uuid(),%L,%L,%L,%L)',:'shop',:'contract','extend','QA reason'),'22023');
select public.finance_contract_action(gen_random_uuid(),:'shop',:'contract','cancel','QA cancellation');
select pg_temp.verify('journal visible to operator',exists(select from public.finance_history(:'shop') j where j->>'op'=:'pix_op'));
select set_config('request.jwt.claims',:'manager_claim',true);
select public.finance_operator(:'operator','revoke','QA revoke');
select set_config('request.jwt.claims',:'op_claim',true);
select pg_temp.rejected('revocation denies same JWT read','select public.finance_shops()','42501');
select pg_temp.rejected('revocation denies mutation and replay',format('select public.finance_invoice(%L,%L,%L,%L)',:'issue_op',:'shop',:'contract',:'old_month'),'42501');
reset session authorization;
select pg_temp.verify('cancellation retains all payments',count(*)=3) from public.payments where subscription_id=:'contract' and status='paid';
rollback;
