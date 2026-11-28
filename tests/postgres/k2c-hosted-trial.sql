-- Run as postgres only in the dedicated K2 staging project. All changes roll back.
begin;
create temp table k2c_trial_result (phase text primary key);
do $$
<<probe>>
declare
  owner_id uuid := gen_random_uuid();
  operator_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  slug text := 'k2c-trial-' || gen_random_uuid();
  shop uuid;
  trial private.automatic_premium_trials%rowtype;
  terms jsonb;
  operation uuid := gen_random_uuid();
  invoice_op uuid := gen_random_uuid();
  pix_op uuid := gen_random_uuid();
  contract uuid;
  invoice uuid;
  competence date := date_trunc('month', statement_timestamp() at time zone 'UTC')::date;
  receipt jsonb;
  paid jsonb;
begin
  if exists (select from auth.users) or exists (select from public.barbershops)
     or exists (select from private.automatic_premium_trial_activation where enabled)
     or exists (select from private.manual_trial_activation where enabled) then
    raise exception 'K2-C requires empty staging with both gates disabled';
  end if;
  insert into auth.users(id, email_confirmed_at)
  values (owner_id, now()), (operator_id, now()), (manager_id, now());
  insert into private.financial_operators(user_id, level, infrastructure_identity, grant_reason)
  values (operator_id, 'operator', session_user, 'Synthetic QA'),
         (manager_id, 'manager', session_user, 'Synthetic QA');
  update private.automatic_premium_trial_activation set enabled=true where singleton;
  if not public.automatic_premium_trial_available() then raise exception 'automatic gate did not open'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  shop := public.create_barbershop('QA trial', slug);
  if public.create_barbershop('QA trial', slug) is distinct from shop then raise exception 'onboarding replay'; end if;
  select * into strict trial from private.automatic_premium_trials t where t.shop_id=shop;
  if not exists (
    select from public.subscriptions s join public.plans p on p.id=s.plan_id
    where s.id=trial.subscription_id and p.code='premium' and p.max_barbers=10
      and s.status='trialing' and s.agreement_at is null and s.contracted_price_cents is null
      and trial.ends_at-trial.started_at=interval '7 days'
  ) then raise exception 'unexpected trial terms'; end if;
  if public.claim_automatic_trial_welcome(shop) is not true
     or public.claim_automatic_trial_welcome(shop) is not false then raise exception 'welcome claim'; end if;
  if private.booking_access_at(shop, trial.ends_at-interval '1 microsecond')->>'allowed' is distinct from 'true'
     or private.booking_access_at(shop, trial.ends_at)->>'reason' is distinct from 'trial_ended'
     or exists(select from public.payments p where p.barbershop_id=shop) then raise exception 'expiry or automatic charge'; end if;
  insert into k2c_trial_result values ('trial_premium_once_welcome_exact_expiry_no_charge');

  insert into public.barbers(barbershop_id, name) select shop, 'QA '||n from generate_series(1,10) n;
  begin
    insert into public.barbers(barbershop_id, name) values (shop,'QA 11');
    raise exception 'profesional cap bypassed';
  exception when check_violation then null;
  end;

  select jsonb_build_object('plan_id', id, 'monthly_cents', 4321, 'currency', 'BRL',
    'terms','Synthetic QA','coverage_start', clock_timestamp(), 'first_month', competence,
    'first_due', now()+interval '7 days', 'renewal_day',15,'due_day',15,
    'due_month_offset',1,'due_time','10:30','zone','UTC','booking_impact_accepted',true)
  into strict terms from public.plans where code='basico';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', operator_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  if public.finance_capability() is distinct from 'operator' then raise exception 'incorrect operator role'; end if;
  begin
    perform public.finance_operator(manager_id,'revoke','QA');
    raise exception 'operator promoted beyond grant';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finance_agreement(operation, shop, terms, 'QA early', 'QA');
    raise exception 'plan cap was bypassed';
  exception when sqlstate 'LP031' then null;
  end;
  update public.barbers set is_active=false where barbershop_id=shop and name<>'QA 1';
  begin
    perform public.finance_agreement(operation, shop, terms-'booking_impact_accepted', 'QA early', 'QA');
    raise exception 'conversion consent was bypassed';
  exception when sqlstate 'LP033' then null;
  end;
  receipt := public.finance_agreement(operation, shop, terms, 'QA early', 'QA');
  contract := (receipt->>'contract')::uuid;
  if receipt->>'state' is distinct from 'pending'
     or receipt is distinct from public.finance_agreement(operation, shop, terms, 'QA early', 'QA')
     or private.booking_access_at(shop, clock_timestamp())->>'allowed' is distinct from 'false'
     or exists(select from public.payments p where p.barbershop_id=shop) then raise exception 'pending conversion'; end if;
  select (public.finance_invoice(invoice_op, shop, contract, competence)->>'invoice')::uuid into invoice;
  paid := public.finance_confirm_pix(pix_op, shop, contract, invoice, 4321, now(), true, 'qa-'||pix_op);
  if paid is distinct from public.finance_confirm_pix(pix_op, shop, contract, invoice, 4321, now(), true, 'qa-'||pix_op)
     or private.booking_access_at(shop, clock_timestamp())->>'allowed' is distinct from 'true'
     or (select count(*) from public.payments p where p.barbershop_id=shop and p.status='paid')<>1 then
    raise exception 'Pix replay or coverage';
  end if;
  begin
    perform public.finance_confirm_pix(gen_random_uuid(), shop, contract, invoice, 4321, now(), true, 'qa-second-'||pix_op);
    raise exception 'duplicate payment accepted';
  exception when object_not_in_prerequisite_state or unique_violation then null;
  end;
  if not exists(select from private.financial_journal j where j.shop=probe.shop and j.op=pix_op)
     or not exists(select from private.automatic_premium_trials t where t.shop_id=shop and t.ends_at=trial.ends_at) then
    raise exception 'history changed or audit missing';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', manager_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  if public.finance_capability() is distinct from 'manager' then raise exception 'incorrect manager role'; end if;
  insert into k2c_trial_result values ('trial_cap_downgrade_consent_invoice_pix_idempotency_audit'),
    ('pre_fix_operator_and_manager_capability_accept_aal1');
end $$;
select phase from k2c_trial_result order by phase;
rollback;
