\set ON_ERROR_STOP on
-- Run only in disposable Supabase QA, as supabase_admin.
\ir b2b-fixtures.sql
begin;
select gen_random_uuid() as owner_id, gen_random_uuid() as staff_id,
  gen_random_uuid() as prior_id, gen_random_uuid() as waiting_id,
  gen_random_uuid() as finance_id, gen_random_uuid() as delete_id,
  gen_random_uuid() as op, gen_random_uuid() as invoice_op, gen_random_uuid() as pix_op \gset
insert into auth.users(id,email_confirmed_at)
values (:'owner_id',now()), (:'staff_id',now()), (:'prior_id',now()),
  (:'waiting_id',null), (:'finance_id',now()), (:'delete_id',now());
insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason)
values(:'finance_id','operator',session_user,'Synthetic trial regression');
select pg_temp.verify('automatic switch starts disabled', not public.automatic_premium_trial_available());
select set_config('request.jwt.claims',jsonb_build_object('sub',:'prior_id','role','authenticated')::text,true) as claims \gset
select public.create_barbershop('QA histórico','qa-auto-history') as prior_shop \gset
select private.register_manual_agreement(gen_random_uuid(),:'prior_shop',pg_temp.terms());
update private.automatic_premium_trial_activation set enabled=true;
select pg_temp.verify('dedicated insertion role has no payment or update grants',
  not has_table_privilege('lps_automatic_trial','public.payments','insert,update,delete')
  and not has_any_column_privilege('lps_automatic_trial','public.subscriptions','update')
  and not pg_has_role('authenticator','lps_automatic_trial','SET'));

set local session authorization authenticator;
set local role anon;
select pg_temp.verify('public announcement follows local switch',public.automatic_premium_trial_available());
select pg_temp.rejected('anon cannot create or claim',
  'select public.create_barbershop(''QA anon'', ''qa-auto-anon'')','42501');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'waiting_id','role','authenticated')::text,true) as claims \gset
select pg_temp.rejected('unconfirmed owner cannot start a trial',
  'select public.create_barbershop(''QA sem confirmação'', ''qa-auto-waiting'')','28000');
select set_config('request.jwt.claims',jsonb_build_object('sub',:'owner_id','role','authenticated')::text,true) as claims \gset
select public.create_barbershop('QA Premium','qa-auto-premium') as shop \gset
select pg_temp.verify('same owner and identifier is an idempotent retry',
  public.create_barbershop('QA Premium','qa-auto-premium') = :'shop');
select pg_temp.verify('owner sees unclaimed trial',
  (public.get_owner_automatic_trial(:'shop')->>'welcome_available')::boolean);
select pg_temp.verify('owner can claim welcome once',public.claim_automatic_trial_welcome(:'shop'));
select pg_temp.verify('reload cannot claim welcome again',not public.claim_automatic_trial_welcome(:'shop'));
select pg_temp.rejected('owner cannot turn on offer', 'update private.automatic_premium_trial_activation set enabled=true','42501');
select pg_temp.rejected('owner cannot write grant',
  format('update private.automatic_premium_trials set ends_at=now() where shop_id=%L',:'shop'),'42501');
select pg_temp.rejected('owner cannot register a financial agreement',
  format('select public.finance_agreement(gen_random_uuid(),%L,''{}'',''r'',''m'')',:'shop'),'42501');
select set_config('request.jwt.claims',jsonb_build_object('sub',:'prior_id','role','authenticated')::text,true) as claims \gset
select pg_temp.rejected('owner of another tenant cannot read trial',
  format('select public.get_owner_automatic_trial(%L)',:'shop'),'42501');
select pg_temp.rejected('owner of another tenant cannot claim welcome',
  format('select public.claim_automatic_trial_welcome(%L)',:'shop'),'42501');
select public.create_barbershop('QA proprietário anterior','qa-auto-prior-other') as existing_owner_shop \gset
reset session authorization;

insert into public.barbershop_members(barbershop_id,user_id,role) values(:'shop',:'staff_id','staff');
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'staff_id','role','authenticated')::text,true) as claims \gset
select pg_temp.rejected('staff cannot read the owner trial',format('select public.get_owner_automatic_trial(%L)',:'shop'),'42501');
select public.create_barbershop('QA usuário da equipe','qa-auto-staff-other') as other_staff_shop \gset
reset session authorization;
select pg_temp.verify('historical owner and invited staff do not get grants',
  not exists(select from private.automatic_premium_trials where owner_id in (:'prior_id',:'staff_id',:'waiting_id')));
select pg_temp.verify('original pending contract remains',
  (select count(*)=1 from public.subscriptions where barbershop_id=:'prior_shop' and status='pending'));
select subscription_id as trial_id, started_at as start_time, ends_at as end_time
from private.automatic_premium_trials where owner_id=:'owner_id' \gset
select pg_temp.verify('real Premium catalog and exact 604800 seconds with no billing terms',
  (select p.code='premium' and p.max_barbers=10 and s.status='trialing' and s.gateway='manual_pix'
    and s.agreement_at is null and s.contracted_price_cents is null and s.current_period_end is null
    and extract(epoch from s.trial_ends_at-s.trial_started_at)=604800
    from public.subscriptions s join public.plans p on p.id=s.plan_id where s.id=:'trial_id'));
select pg_temp.verify('active at start and immediately before exact expiry',
  (private.booking_access_at(:'shop',:'start_time')->>'allowed')::boolean
  and (private.booking_access_at(:'shop', :'end_time'::timestamptz-interval '1 microsecond')->>'allowed')::boolean);
select pg_temp.verify('at exact expiry and immediately after, bookings stop',
  private.booking_access_at(:'shop',:'end_time')->>'reason'='trial_ended'
  and not (private.booking_access_at(:'shop', :'end_time'::timestamptz+interval '1 microsecond')->>'allowed')::boolean);
select pg_temp.verify('expiry evaluation creates no payment',
  not exists(select from public.payments where barbershop_id=:'shop'));

set local session authorization authenticator;
set local role service_role;
select pg_temp.rejected('Data API service role cannot alter the trial plan or time',
  format('update public.subscriptions set plan_id=(select id from public.plans where code=''basico''), trial_ends_at=trial_ends_at+interval ''1 day'' where id=%L',:'trial_id'),'42501');
select pg_temp.rejected('Data API service role cannot delete the subscription directly',
  format('delete from public.subscriptions where id=%L',:'trial_id'),'42501');
reset session authorization;

insert into public.barbers(barbershop_id,name) select :'shop','QA '||position from generate_series(1,10) position;
select pg_temp.rejected('Premium rejects the eleventh active professional',
  format('insert into public.barbers(barbershop_id,name) values (%L,''QA excedente'')',:'shop'),'23514');
select to_jsonb(pg_temp.terms()) || jsonb_build_object(
  'coverage_start',clock_timestamp(),'first_month',date_trunc('month',clock_timestamp() at time zone 'UTC')::date,
  'first_due',clock_timestamp()+interval '7 days','renewal_day',15,'due_day',15,'due_month_offset',1,'zone','UTC',
  'booking_impact_accepted',true) as terms \gset

set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'finance_id','role','authenticated')::text,true) as claims \gset
select pg_temp.verify('operator sees automatic Premium in existing directory',
  (select d->>'automatic_trial_state'='running' and d->>'automatic_trial_plan'='Premium'
    and (d->>'automatic_trial_days')::int=7 from public.finance_directory(:'shop') d));
select pg_temp.rejected('early conversion requires explicit booking impact consent through Data API',
  format('select public.finance_agreement(%L,%L,%L,''QA sem confirmação'',''QA'')',:'op',:'shop',
    :'terms'::jsonb - 'booking_impact_accepted'),'LP033');
select pg_temp.rejected('downgrade above the agreed cap is rejected',
  format('select public.finance_agreement(%L,%L,%L,''QA-cap'',''QA'')',:'op',:'shop',:'terms'),'LP031');
reset session authorization;
select pg_temp.verify('failed downgrade preserves ten professionals, full trial and no payment',
  (select count(*)=10 from public.barbers where barbershop_id=:'shop' and is_active)
  and (select status='trialing' from public.subscriptions where id=:'trial_id')
  and not exists(select from public.payments where barbershop_id=:'shop'));
update public.barbers set is_active=false where barbershop_id=:'shop' and name<>'QA 1';

set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'finance_id','role','authenticated')::text,true) as claims \gset
select public.finance_agreement(:'op',:'shop',:'terms','QA early','QA approved') as agreement \gset
select pg_temp.verify('early conversion is pending and operation is idempotent',
  :'agreement'::jsonb->>'state'='pending'
  and public.finance_agreement(:'op',:'shop',:'terms'::jsonb - 'booking_impact_accepted','QA early','QA approved')=:'agreement'::jsonb);
reset session authorization;
select pg_temp.verify('pending conversion ends free booking without writing a payment',
  not (private.booking_access_at(:'shop',clock_timestamp())->>'allowed')::boolean
  and not exists(select from public.payments where barbershop_id=:'shop')
  and (select ends_at=:'end_time'::timestamptz from private.automatic_premium_trials where shop_id=:'shop'));
select :'agreement'::jsonb->>'contract' as contract, :'terms'::jsonb->>'first_month' as month \gset
set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'finance_id','role','authenticated')::text,true) as claims \gset
select public.finance_invoice(:'invoice_op',:'shop',:'contract',:'month')->>'invoice' as invoice \gset
select public.finance_confirm_pix(:'pix_op',:'shop',:'contract',:'invoice',4321,clock_timestamp(),true,'qa-automatic-premium-trial');
select pg_temp.verify('directory classifies only verified Pix as conversion',
  (select d->>'automatic_trial_state'='converted' from public.finance_directory(:'shop') d));
reset session authorization;
select pg_temp.verify('verified manual Pix restores coverage; original trial history is intact',
  (private.booking_access_at(:'shop',clock_timestamp())->>'allowed')::boolean
  and (select count(*)=1 from public.payments where barbershop_id=:'shop' and status='paid')
  and (select status='expired' and trial_ends_at=:'end_time' from public.subscriptions where id=:'trial_id'));

select set_config('request.jwt.claims',jsonb_build_object('sub',:'delete_id','role','authenticated')::text,true) as claims \gset
select public.create_barbershop('QA exclusão','qa-auto-delete') as deleted_shop \gset
set local session authorization authenticator;
set local role service_role;
delete from public.barbershops where id=:'deleted_shop';
reset session authorization;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'delete_id','role','authenticated')::text,true) as claims \gset
select public.create_barbershop('QA recriação','qa-auto-recreated') as recreated_shop \gset
select pg_temp.verify('tenant deletion preserves history and recreation never grants again',
  (select count(*)=1 from private.automatic_premium_trials where owner_id=:'delete_id' and shop_id is null)
  and not exists(select from public.subscriptions where barbershop_id=:'recreated_shop')
  and private.booking_access_at(:'recreated_shop',clock_timestamp())->>'reason'='no_coverage');
rollback;
