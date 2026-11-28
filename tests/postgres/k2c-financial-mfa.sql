\set ON_ERROR_STOP on
-- Run against a dedicated PostgreSQL QA database after installing the MFA migration.
begin;
\ir b2b-fixtures.sql
select gen_random_uuid() as operator, gen_random_uuid() as manager, gen_random_uuid() as ordinary,
  gen_random_uuid() as session, gen_random_uuid() as factor, gen_random_uuid() as manager_session,
  gen_random_uuid() as manager_factor \gset
insert into auth.users(id) values (:'operator'), (:'manager'), (:'ordinary');
insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason)
values (:'operator','operator',session_user,'Synthetic QA'), (:'manager','manager',session_user,'Synthetic QA');
insert into auth.mfa_factors(id,user_id,created_at,updated_at,factor_type,status)
values (:'factor',:'operator',now(),now(),'totp','verified'),
       (:'manager_factor',:'manager',now(),now(),'totp','verified');
insert into auth.sessions(id,user_id,aal,factor_id)
values (:'session',:'operator','aal2',:'factor'),
       (:'manager_session',:'manager','aal2',:'manager_factor');
select jsonb_build_object('sub',:'operator','role','authenticated','aal','aal1','session_id',:'session') as aal1,
  jsonb_build_object('sub',:'operator','role','authenticated','aal','aal2','session_id',:'session') as aal2,
  jsonb_build_object('sub',:'manager','role','authenticated','aal','aal2','session_id',:'manager_session') as manager_jwt,
  jsonb_build_object('sub',:'ordinary','role','authenticated','aal','aal2','session_id',:'session') as ordinary_jwt,
  jsonb_build_object('sub',:'operator','role','authenticated','aal','aal2','session_id','bad') as invalid,
  jsonb_build_object('sub',:'operator','role','authenticated','aal','aal2','session_id',:'manager_session') as foreign_jwt \gset

set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims', :'aal1', true) as claims \gset
select pg_temp.rejected('AAL1 operator cannot read private financial data','select public.finance_capability()','LP037');
select pg_temp.rejected('AAL1 operator cannot confirm Pix directly','select public.finance_confirm_pix(null,null,null,null,1,now(),true)','LP037');
select set_config('request.jwt.claims', :'ordinary_jwt', true) as claims \gset
select pg_temp.rejected('AAL2 ordinary user still lacks a grant','select public.finance_capability()','42501');
select set_config('request.jwt.claims', :'invalid', true) as claims \gset
select pg_temp.rejected('malformed session identifier denied','select public.finance_capability()','LP037');
select set_config('request.jwt.claims', :'foreign_jwt', true) as claims \gset
select pg_temp.rejected('foreign AAL2 session denied','select public.finance_capability()','LP037');
select set_config('request.jwt.claims', :'aal2', true) as claims \gset
select pg_temp.verify('live AAL2 TOTP grants operator capability',public.finance_capability()='operator');
select pg_temp.rejected('operator cannot manage grants even at AAL2','select public.finance_operator_list()','42501');
select set_config('request.jwt.claims', :'manager_jwt', true) as claims \gset
select pg_temp.verify('live AAL2 TOTP grants manager capability and registry read',
  public.finance_capability()='manager' and exists(select from public.finance_operator_list()));
reset session authorization;

update auth.sessions set not_after=now()-interval '1 second' where id=:'session';
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims', :'aal2', true) as claims \gset
select pg_temp.rejected('expired server session denied','select public.finance_capability()','LP037');
reset session authorization;

update auth.sessions set not_after=null where id=:'session';
update auth.mfa_factors set status='unverified' where id=:'factor';
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims', :'aal2', true) as claims \gset
select pg_temp.rejected('removed verification denied despite old JWT','select public.finance_capability()','LP037');
reset session authorization;
delete from auth.sessions where id=:'manager_session';
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims', :'manager_jwt', true) as claims \gset
select pg_temp.rejected('revoked manager session denied despite old JWT','select public.finance_operator_list()','LP037');
reset session authorization;
select pg_temp.verify('no direct grants on Auth tables for REST roles',
  not has_table_privilege('lps_financial_api','auth.mfa_factors','select')
  and not has_table_privilege('authenticated','auth.sessions','select')
  and not has_function_privilege('authenticated','private.has_live_financial_totp(uuid)','execute'));
rollback;
