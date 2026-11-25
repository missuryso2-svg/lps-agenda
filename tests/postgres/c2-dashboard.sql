\set ON_ERROR_STOP on
begin;
\ir b2b-fixtures.sql
select gen_random_uuid() as manager, gen_random_uuid() as operator, pg_temp.enrolled_shop() as shop,
  pg_temp.enrolled_shop() as mixed \gset
insert into auth.users(id) values(:'manager'),(:'operator');
select private.bootstrap_financial_manager(:'manager','QA C2');
insert into public.barbershops(name,slug) select 'C2 directory '||i,'c2-'||gen_random_uuid() from generate_series(1,105) i;
insert into public.barbershops(name,slug) values ('C2 sem assinatura','c2-'||gen_random_uuid()) returning id as no_contract_shop \gset
select pg_temp.enrolled_shop() as live_trial_shop \gset
update public.subscriptions set trial_started_at=now()-interval '1 hour',
  trial_ends_at=now()+interval '167 hours'
where barbershop_id=:'live_trial_shop' and gateway='manual_pix';
select id as plan from public.plans where code='basico' \gset
select to_jsonb(pg_temp.terms())::text as agreement_terms \gset
select pg_temp.enrolled_shop() as historical_mixed_shop \gset
insert into public.subscriptions(barbershop_id, plan_id, status, gateway)
values(:'historical_mixed_shop', :'plan', 'expired', 'asaas');
insert into public.subscriptions(barbershop_id,plan_id,status,gateway)
  values(:'shop',:'plan','expired','asaas');
insert into public.barbershops(name,slug) values ('C2 legacy','c2-'||gen_random_uuid()) returning id as legacy_shop \gset
insert into public.subscriptions(barbershop_id,plan_id,status,gateway,trial_started_at,trial_ends_at)
  values(:'legacy_shop',:'plan','active','asaas','2020-01-01Z','2020-01-08Z');
select count(*) as shops from public.barbershops \gset
update public.subscriptions set status='expired' where barbershop_id=:'mixed';
insert into public.subscriptions(barbershop_id,plan_id,status,gateway) values(:'mixed',:'plan','active','asaas');
insert into public.payments(barbershop_id,scope,amount_cents,method,status,paid_at,gateway)
  values(:'shop','shop_service',1200,'cash','paid',now(),'asaas');
insert into public.payments(barbershop_id,subscription_id,scope,amount_cents,method,status,paid_at,gateway)
  select :'mixed',id,'platform_subscription',1800,'pix','paid',now(),'asaas' from public.subscriptions
  where barbershop_id=:'mixed' and gateway='asaas';
select pg_temp.verify('public RPCs owned by limited role and no anonymous or service grants',bool_and(
  pg_get_userbyid(p.proowner)='lps_financial_api' and p.prosecdef and
  not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('service_role',p.oid,'execute')))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and left(p.proname,8)='finance_';
select pg_temp.verify('invoker view private',not has_table_privilege('authenticated','private.finance_shop_directory','select'));
select pg_temp.verify('dedicated role cannot login, bypass RLS or create public functions',
  not rolcanlogin and not rolbypassrls and not has_schema_privilege(rolname,'public','create'))
  from pg_roles where rolname='lps_financial_api';
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'manager','role','authenticated')::text,true);
select public.finance_operator(:'operator','operator','QA C2');
select pg_temp.rejected('manager self revocation denied',format('select public.finance_operator(%L,%L,%L)',:'manager','revoke','QA'),'42501');
select pg_temp.verify('manager can list grants',(select count(*)=2 from public.finance_operator_list()));
select set_config('request.jwt.claims',jsonb_build_object('sub',:'operator','role','authenticated')::text,true);
select pg_temp.verify('individual capability',public.finance_capability()='operator');
select pg_temp.rejected('regular operator cannot list grants','select public.finance_operator_list()','42501');
select public.finance_agreement(gen_random_uuid(),:'no_contract_shop',:'agreement_terms'::jsonb,
  'QA I3 first agreement','QA no prior subscription')->>'contract' as no_contract_result \gset
select pg_temp.verify('shop without any subscription can receive a pending agreement',
  j->>'contract'=:'no_contract_result' and j->>'origin'='manual' and j->>'status'='pending')
  from public.finance_directory(shop_id=>:'no_contract_shop') j;
select pg_temp.rejected('pending agreement cannot be duplicated',format(
  'select public.finance_agreement(gen_random_uuid(),%L,%L::jsonb,%L,%L)',
  :'no_contract_shop',:'agreement_terms','QA I3 duplicate','QA duplicate'),'55000');
select public.finance_contract_action(gen_random_uuid(),:'no_contract_shop',:'no_contract_result',
  'cancel','QA I3 recontratação cancelada');
select (to_jsonb(pg_temp.terms()) || jsonb_build_object(
  'coverage_start',clock_timestamp()+interval '5 minutes',
  'first_month',date_trunc('month',clock_timestamp())::date,
  'first_due',clock_timestamp()+interval '1 day',
  'due_day',31,'due_time','23:00','zone','UTC'))::text as re_contract_terms \gset
select public.finance_agreement(gen_random_uuid(),:'no_contract_shop',:'re_contract_terms'::jsonb,
  'QA I3 recontratação','QA contrato cancelado')->>'state' as re_contract_state \gset
select pg_temp.verify('canceled manual contract permits a non-overlapping new pending agreement',
  :'re_contract_state'='pending' and exists(select from public.finance_directory(shop_id=>:'no_contract_shop') j
    where j->>'origin'='manual' and j->>'status'='pending'));
select pg_temp.rejected('active trial is not ended by applying a contract',format(
  'select public.finance_agreement(gen_random_uuid(),%L,%L::jsonb,%L,%L)',
  :'live_trial_shop',:'agreement_terms','QA I3 active trial','QA active trial'),'55000');
select pg_temp.verify('active trial remains unchanged',j->>'origin'='trial'
  and j->>'status'='trialing' and (j->>'trial_end')::timestamptz>clock_timestamp())
  from public.finance_directory(shop_id=>:'live_trial_shop') j;
select pg_temp.rejected('legacy Asaas history remains blocked',format(
  'select public.finance_agreement(gen_random_uuid(),%L,%L::jsonb,%L,%L)',
  :'legacy_shop',:'agreement_terms','QA I3 Asaas','QA legacy'),'55000');
select pg_temp.verify('terminal mixed Asaas/manual history remains in reconciliation',
  j->>'origin'='reconcile')
from public.finance_directory(shop_id=>:'historical_mixed_shop') j;
select pg_temp.rejected('terminal Asaas history cannot be converted without reconciliation',format(
  'select public.finance_agreement(gen_random_uuid(),%L,%L::jsonb,%L,%L)',
  :'historical_mixed_shop',:'agreement_terms','QA I3 mixed history','QA reconciliation'),'55000');
select pg_temp.verify('overview counts all pages',public.finance_overview(current_date-extract(day from current_date)::int+1)->>'shops'=:'shops');
with a as (select j->>'shop' id from public.finance_directory(name_prefix=>'C2 directory ',page_size=>100) j),
 b as (select j->>'shop' id from public.finance_directory(name_prefix=>'C2 directory ',after_id=>(select max(id)::uuid from a),page_size=>100) j)
select pg_temp.verify('105 filtered shops without gaps or overlap',(select count(*)=105 and count(distinct id)=105 from (table a union all table b) both_pages));
select pg_temp.verify('no contract is distinct from delinquency',bool_and(j->>'origin'='none' and j->>'status' is null))
  from public.finance_directory(name_prefix=>'C2 directory ',page_size=>100) j;
select pg_temp.verify('mixed legacy history requires reconciliation; shop-service payment is not verified Pix',
  j->>'last_verified_at' is null and j->>'origin'='reconcile')
  from public.finance_directory(shop_id=>:'shop') j;
select pg_temp.verify('legacy plus manual history requires reconciliation',j->>'origin'='reconcile' and j->>'last_verified_at' is null)
  from public.finance_directory(shop_id=>:'mixed') j;
select pg_temp.verify('trial dates and selected subscription originate from manual trial',
  (j->>'trial_end')::timestamptz='2019-01-08Z'::timestamptz and j->>'gateway'='manual_pix')
  from public.finance_directory(shop_id=>:'shop') j;
select pg_temp.verify('isolated Asaas subscription explicitly classified without manual trial dates',j->>'origin'='asaas' and j->>'trial_end' is null)
  from public.finance_directory(shop_id=>:'legacy_shop') j;
select pg_temp.verify('compatibility projection matches directory',not exists(
  (select * from public.finance_shops(null,5)) except (select * from public.finance_directory(page_size=>5))));
select pg_temp.rejected('private history remains immutable','delete from private.financial_journal','42501');
rollback;
