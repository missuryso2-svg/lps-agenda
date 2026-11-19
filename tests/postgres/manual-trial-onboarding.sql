-- Disposable Supabase QA only. Run as supabase_admin to reproduce the
-- PostgREST session identity (authenticator) and its actual SET ROLE.
\set ON_ERROR_STOP on
begin;
create function pg_temp.check_case(label text, command text, expected_state text default '00000',
  expected_rows integer default null) returns void language plpgsql as $$
declare actual text := '00000'; affected bigint; message text;
begin
  begin
    execute command;
    get diagnostics affected = row_count;
  exception when others then actual := sqlstate; message := sqlerrm;
  end;
  if actual <> expected_state or (expected_rows is not null and affected is distinct from expected_rows) then
    raise exception '%: got % (%) rows %, expected % rows %',label,actual,message,affected,expected_state,expected_rows;
  end if;
  raise notice 'PASS %', label;
end $$;
insert into auth.users(id) values ('ba100000-0000-4000-8000-000000000001'),('ba100000-0000-4000-8000-000000000002');
create function pg_temp.register_trial(slug text default 'qa-b2a1-one', intent uuid default 'ba100000-0000-4000-8000-000000000010')
returns uuid language sql security invoker as $$
  select public.create_barbershop_with_manual_trial(intent,'QA B2A1',slug)
$$;

select pg_temp.check_case('initially disabled','select 1 from private.manual_trial_activation where not enabled','00000',1);
select pg_temp.check_case('dedicated role has no login, bypass or administration',
  $$select 1 from pg_roles where rolname='lps_trial_onboarding' and not
    (rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolinherit or rolreplication)$$,'00000',1);
select pg_temp.check_case('only the onboarding RPC runs as this definer',
  $$select 1 from pg_proc where proowner='lps_trial_onboarding'::regrole
    and oid <> 'public.create_barbershop_with_manual_trial(uuid,text,text,text,text)'::regprocedure$$,'00000',0);
select pg_temp.check_case('no API role can SET ROLE to the definer',
  $$select r from unnest(array['anon','authenticated','service_role','authenticator']) r
    where pg_has_role(r,'lps_trial_onboarding','SET')$$,'00000',0);
select pg_temp.check_case('no broad privileges for definer',
  $$select 1 where has_schema_privilege('lps_trial_onboarding','public','create')
    or has_table_privilege('lps_trial_onboarding','public.payments','insert,update,delete')
    or has_any_column_privilege('lps_trial_onboarding','public.subscriptions','update')
    or has_column_privilege('lps_trial_onboarding','public.subscriptions','contracted_price_cents','insert')
    or has_table_privilege('lps_trial_onboarding','private.manual_trial_activation','update')$$,'00000',0);

set local session authorization authenticator;
set local role anon;
select pg_temp.check_case('anon denied','select pg_temp.register_trial()','42501');
set local role authenticated;
select pg_temp.check_case('auth.uid required','select pg_temp.register_trial()','28000');
select set_config('request.jwt.claims','{"sub":"ba100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.check_case('actual PostgREST role and claims',
  $$select 1 where session_user='authenticator' and current_user='authenticated'
    and current_setting('role')='authenticated' and auth.uid()='ba100000-0000-4000-8000-000000000001'$$,'00000',1);
select set_config('app.manual_trial_enabled','true',true);
select pg_temp.check_case('direct RPC with caller flag still disabled','select pg_temp.register_trial()','42501');
select pg_temp.check_case('cannot write database flag','update private.manual_trial_activation set enabled=true','42501');
select pg_temp.check_case('cannot assume onboarding identity','set local role lps_trial_onboarding','42501');
select pg_temp.check_case('cannot supply own intent record','insert into private.manual_trial_intents default values','42501');
reset session authorization;

update private.manual_trial_activation set enabled=true;
select to_regprocedure('public.authorize_manual_trial_intent(uuid,uuid,text,text,text,text)') is not null as app_gate \gset
\if :app_gate
select public.authorize_manual_trial_intent(actor::uuid,intent::uuid,'QA B2A1',slug,null,'America/Sao_Paulo')
from (values
  ('ba100000-0000-4000-8000-000000000001','ba100000-0000-4000-8000-000000000010','qa-b2a1-one'),
  ('ba100000-0000-4000-8000-000000000001','ba100000-0000-4000-8000-000000000011','qa-b2a1-two'),
  ('ba100000-0000-4000-8000-000000000002','ba100000-0000-4000-8000-000000000010','qa-b2a1-three'),
  ('ba100000-0000-4000-8000-000000000002','ba100000-0000-4000-8000-000000000012','qa-b2a1-fail')
) fixtures(actor,intent,slug);
\endif
set local session authorization authenticator;
set local role authenticated;
select pg_temp.register_trial() as shop \gset
select pg_temp.check_case('equivalent retry returns original shop',format(
  'select 1 where pg_temp.register_trial(%L)=%L::uuid','  QA-B2A1-ONE ',:'shop'),'00000',1);
select pg_temp.check_case('invalid slug rejected',
  $$select public.create_barbershop_with_manual_trial(gen_random_uuid(),'QA','bad slug')$$,'22023');
select pg_temp.check_case('invalid timezone rejected',
  $$select public.create_barbershop_with_manual_trial(gen_random_uuid(),'QA','qa-b2a1-invalid',null,'Bad/Zone')$$,'22023');
select pg_temp.check_case('missing intent rejected',
  $$select public.create_barbershop_with_manual_trial(null,'QA','qa-b2a1-invalid')$$,'22023');
select pg_temp.check_case('owner cannot insert manual subscription while enabled',format(
  'insert into public.subscriptions(barbershop_id,plan_id,gateway) select %L,id,''manual_pix'' from public.plans limit 1',
  :'shop'),'42501');
select pg_temp.check_case('owner cannot create manual invoice while enabled',format(
  'insert into public.payments(barbershop_id,amount_cents,gateway) values (%L,1,''manual_pix'')',:'shop'),'42501');
select set_config('request.jwt.claims','{"sub":"ba100000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"lps_role":"platform_admin"}}',true);
select pg_temp.check_case('legacy admin cannot extend trial while enabled',format(
  'update public.subscriptions set trial_ends_at=trial_ends_at+interval ''1 day'' where barbershop_id=%L',:'shop'),'00000',0);
set local role service_role;
select pg_temp.check_case('service cannot insert through the RPC','select pg_temp.register_trial()','42501');
select pg_temp.check_case('service cannot edit manual trial while enabled',format(
  'update public.subscriptions set contracted_price_cents=1 where barbershop_id=%L',:'shop'),'42501');
select pg_temp.check_case('service cannot toggle the DB flag','update private.manual_trial_activation set enabled=false','42501');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ba100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.check_case('same intent divergent input rejected',
  $$select pg_temp.register_trial('qa-b2a1-other')$$,'22023');
select pg_temp.check_case('new intention can create a different shop',format(
  'select 1 where pg_temp.register_trial(%L,%L)<>%L::uuid','qa-b2a1-two',
  'ba100000-0000-4000-8000-000000000011',:'shop'),'00000',1);
select set_config('request.jwt.claims','{"sub":"ba100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  perform pg_temp.register_trial();
  raise exception 'Cross-user retry succeeded';
exception when unique_violation then
  if sqlerrm <> 'Identificador indisponível' then raise; end if;
  raise notice 'PASS slug collision returns generic conflict';
end $$;
select pg_temp.check_case('same UUID for another actor cannot recover original result',format(
  'select 1 where pg_temp.register_trial(%L)<>%L::uuid','qa-b2a1-three',:'shop'),'00000',1);
reset session authorization;

update public.plans set is_active=false where code='basico';
set local session authorization authenticator;
set local role authenticated;
select pg_temp.check_case('inactive basic plan rejects onboarding',
  $$select pg_temp.register_trial('qa-b2a1-inactive','ba100000-0000-4000-8000-000000000014')$$,'55000');
reset session authorization;
update public.plans set is_active=true where code='basico';
select pg_temp.check_case('one original shop',$$select id from public.barbershops where slug='qa-b2a1-one'$$,'00000',1);
select pg_temp.check_case('exactly one owner',format(
  'select 1 from public.barbershop_members where barbershop_id=%L and role=''owner'' and is_active and user_id=%L',
  :'shop','ba100000-0000-4000-8000-000000000001'),'00000',1);
select pg_temp.check_case('exactly one subscription',format(
  'select id from public.subscriptions where barbershop_id=%L',:'shop'),'00000',1);
select pg_temp.check_case('finite basic trial without commercial or remote fields',format($q$
  select 1 from public.subscriptions s join public.plans p on p.id=s.plan_id
  where s.barbershop_id=%L and p.code='basico' and p.is_active and s.gateway='manual_pix'
    and s.status='trialing' and s.invoice_link_key='uncontracted' and s.gateway_status='inactive'
    and s.trial_started_at between transaction_timestamp() and clock_timestamp()
    and s.trial_ends_at-s.trial_started_at=interval '168 hours'
    and num_nonnulls(s.agreement_at,s.agreement_terms,s.contracted_price_cents,s.next_due_date,
      s.gateway_subscription_id,s.checkout_lease_token,s.trial_finalization_lease_token)=0$q$,:'shop'),'00000',1);
select pg_temp.check_case('no payments or gateway jobs for onboarding shops',
  $$select p.id from public.payments p join public.barbershops b on b.id=p.barbershop_id where b.slug like 'qa-b2a1-%'
    union all select j.id from public.billing_remote_cleanup_jobs j join public.barbershops b on b.id=j.barbershop_id
    where b.slug like 'qa-b2a1-%'
    union all select c.id from public.billing_customers c join public.barbershops b on b.id=c.barbershop_id
    where b.slug like 'qa-b2a1-%'$$,'00000',0);

-- Fault at the last write, after the successful shop, owner and intent inserts.
create function pg_temp.fail_trial() returns trigger language plpgsql as $$
begin raise exception 'QA injected failure' using errcode='P1100'; end $$;
create trigger zz_qa_fail before insert on public.subscriptions
  for each row when (new.gateway='manual_pix') execute function pg_temp.fail_trial();
set local session authorization authenticator;
set local role authenticated;
select pg_temp.check_case('trial insert failure raised',
  $$select pg_temp.register_trial('qa-b2a1-fail','ba100000-0000-4000-8000-000000000012')$$,'P1100');
reset session authorization;
select pg_temp.check_case('failed shop rolled back',$$select id from public.barbershops where slug='qa-b2a1-fail'$$,'00000',0);
select pg_temp.check_case('failed owner rolled back',
  $$select 1 from public.barbershop_members where user_id='ba100000-0000-4000-8000-000000000002'$$,'00000',1);
select pg_temp.check_case('failed intent rolled back',
  $$select 1 from private.manual_trial_intents where intent_id='ba100000-0000-4000-8000-000000000012'$$,'00000',0);

-- A retry after administrative cancellation must not extend or re-create trial.
update public.subscriptions set status='canceled' where barbershop_id=:'shop';
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ba100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.check_case('recovery of canceled result',format(
  'select 1 where pg_temp.register_trial()=%L::uuid',:'shop'),'00000',1);
reset session authorization;
select pg_temp.check_case('no renewed access after retry',format($q$
  select 1 from public.subscriptions s join private.manual_trial_intents i using (barbershop_id)
    where s.barbershop_id=%L and s.status='canceled' and s.trial_started_at=i.trial_start
    and s.trial_ends_at=i.trial_start + interval '168 hours'$q$,:'shop'),'00000',1);
rollback;
