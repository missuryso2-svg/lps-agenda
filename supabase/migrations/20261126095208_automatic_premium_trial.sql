begin;

-- The release switch is independent of the assisted Basic onboarding.
-- Neither the API nor an environment variable can activate this offer.
create table private.automatic_premium_trial_activation (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.automatic_premium_trial_activation default values;

-- Keep only the UUID after account or tenant deletion. A new Auth account is
-- a distinct identity. This table is deliberately not cascaded with a tenant.
create table private.trial_participation (
  user_id uuid primary key,
  first_seen_at timestamptz not null default clock_timestamp()
);
-- Keep writes out of the gap between backfill and trigger installation.
lock table public.barbershop_members in share row exclusive mode;
-- Include inactive and removed memberships where the audit history remains.
insert into private.trial_participation(user_id)
select user_id from public.barbershop_members
union
select (metadata->>'user_id')::uuid from public.audit_logs
  where entity_type = 'barbershop_members'
    and pg_input_is_valid(metadata->>'user_id', 'uuid');

create table private.automatic_premium_trials (
  owner_id uuid primary key references private.trial_participation(user_id),
  shop_id uuid unique references public.barbershops(id) on delete set null,
  subscription_id uuid not null unique,
  plan_id uuid not null references public.plans(id),
  started_at timestamptz not null,
  ends_at timestamptz not null check (ends_at - started_at = interval '168 hours'),
  welcomed_at timestamptz,
  check (welcomed_at is null or (welcomed_at >= started_at and welcomed_at < ends_at))
);
-- Later shops of a recipient follow the existing no-coverage policy until an
-- operator contracts them. This prevents a fresh slug from bypassing expiry
-- via the legacy uncontracted booking allowance. Operational data stays usable.
create table private.automatic_trial_followup_shops (
  shop_id uuid primary key references public.barbershops(id) on delete cascade
);
revoke all on private.automatic_premium_trial_activation, private.trial_participation,
  private.automatic_premium_trials, private.automatic_trial_followup_shops
  from public, anon, authenticated, service_role;

create function private.record_trial_participation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.trial_participation(user_id) values (new.user_id)
    on conflict (user_id) do nothing;
  return new;
end
$$;
revoke all on function private.record_trial_participation() from public, anon, authenticated, service_role;
create trigger members_record_trial_participation
  after insert or update of user_id on public.barbershop_members
  for each row execute function private.record_trial_participation();

create function public.automatic_premium_trial_available() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select from private.automatic_premium_trial_activation where enabled)
    and exists(select from private.manual_trial_activation where not enabled)
    and exists(select from public.plans where code = 'premium' and is_active and max_barbers = 10);
$$;
revoke all on function public.automatic_premium_trial_available() from public, anon, authenticated, service_role;
grant execute on function public.automatic_premium_trial_available() to anon, authenticated;

-- Only the onboarding primitive can call the insertion definer. The role has
-- no UPDATE or DELETE privileges and can insert only a fully validated grant.
create role lps_automatic_trial nologin noinherit;
grant lps_automatic_trial to postgres with inherit false, set true;
grant usage on schema public, private to lps_automatic_trial;
grant select (subscription_id, shop_id, plan_id, started_at, ends_at)
  on private.automatic_premium_trials to lps_automatic_trial;
grant insert (id, barbershop_id, plan_id, gateway, gateway_status, status,
  invoice_link_key, trial_started_at, trial_ends_at) on public.subscriptions to lps_automatic_trial;
alter policy subscriptions_manual_quarantine on public.subscriptions
  with check (gateway <> 'manual_pix' or
    current_user in ('lps_trial_onboarding', 'lps_financial_api', 'lps_automatic_trial'));
create policy subscriptions_insert_automatic_trial on public.subscriptions
  for insert to lps_automatic_trial with check (
    gateway = 'manual_pix' and gateway_status = 'inactive' and status = 'trialing'
    and invoice_link_key = 'uncontracted'
    and exists (select from private.automatic_premium_trials t
      where t.subscription_id = subscriptions.id and t.shop_id = subscriptions.barbershop_id
        and t.plan_id = subscriptions.plan_id and t.started_at = subscriptions.trial_started_at
        and t.ends_at = subscriptions.trial_ends_at)
  );

create function private.insert_automatic_trial(p_subscription uuid) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.subscriptions(id, barbershop_id, plan_id, gateway, gateway_status,
    status, invoice_link_key, trial_started_at, trial_ends_at)
  select subscription_id, shop_id, plan_id, 'manual_pix', 'inactive',
    'trialing', 'uncontracted', started_at, ends_at
  from private.automatic_premium_trials where subscription_id = p_subscription;
$$;
revoke all on function private.insert_automatic_trial(uuid) from public, anon, authenticated, service_role;
grant create on schema private to lps_automatic_trial;
alter function private.insert_automatic_trial(uuid) owner to lps_automatic_trial;
revoke create on schema private from lps_automatic_trial;
set role lps_automatic_trial;
grant execute on function private.insert_automatic_trial(uuid) to postgres;
reset role;
revoke lps_automatic_trial from postgres;

-- A free trial may follow a privileged tenant deletion, which already cascades
-- operational data. Direct subscription deletes and paid history stay guarded.
create function private.is_deleted_automatic_trial(p_subscription uuid, p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select from public.barbershops where id = p_shop)
    and exists(select from private.automatic_premium_trials where subscription_id = p_subscription);
$$;
revoke all on function private.is_deleted_automatic_trial(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function private.is_deleted_automatic_trial(uuid,uuid) to service_role;

-- Existing financial RPCs may recognize (but cannot change) the automatic origin.
create function private.is_automatic_trial(p_subscription uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select from private.automatic_premium_trials where subscription_id = p_subscription);
$$;
revoke all on function private.is_automatic_trial(uuid) from public, anon, authenticated, service_role;
grant execute on function private.is_automatic_trial(uuid) to lps_financial_api;

create or replace function private.quarantine_manual_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'lps_automatic_trial' then
    if tg_relid <> 'public.subscriptions'::regclass or tg_op <> 'INSERT' then
      raise exception 'Automatic trial insertion only' using errcode = '42501';
    end if;
    -- The dedicated role's INSERT columns and restrictive RLS require the
    -- exact recorded subscription, tenant, Premium plan and time window.
    return new;
  end if;
  if tg_relid = 'public.subscriptions'::regclass and tg_op = 'DELETE'
     and current_user in ('postgres', 'service_role') then
    if old.gateway = 'manual_pix' and old.agreement_at is null
       and private.is_deleted_automatic_trial(old.id, old.barbershop_id) then
      return old;
    end if;
  end if;
  if current_user = 'lps_trial_onboarding' then
    if tg_relid <> 'public.subscriptions'::regclass or tg_op <> 'INSERT' then
      raise exception 'Trial insertion only' using errcode = '42501';
    end if;
    -- The only function owned by this role creates the intent with the ID
    -- returned by create_barbershop. Neither API roles nor the caller can
    -- supply a tenant, write intents, or SET ROLE to this identity.
    if (new.gateway = 'manual_pix' and new.status = 'trialing'
        and new.invoice_link_key = 'uncontracted' and new.gateway_status = 'inactive'
        and new.trial_ends_at = new.trial_started_at + interval '168 hours'
        and num_nonnulls(new.agreement_at,new.contracted_price_cents,new.contracted_currency,
          new.contracted_interval,new.current_period_start,new.current_period_end,new.billing_type,
          new.gateway_subscription_id,new.checkout_locked_at,new.checkout_lease_token,
          new.trial_finalization_locked_at,new.trial_finalization_lease_token,new.next_due_date) = 0
        and exists (select from private.manual_trial_activation where enabled)
        and exists (select from public.plans where id = new.plan_id and code = 'basico' and is_active)
        and exists (select from private.manual_trial_intents i where i.user_id = private.trial_onboarding_actor()
          and i.barbershop_id = new.barbershop_id and i.trial_start = new.trial_started_at)
        and private.has_barbershop_role(new.barbershop_id, array['owner']::public.barbershop_member_role[])
       ) is not true then
      raise exception 'Invalid onboarding trial' using errcode = '42501';
    end if;
    return new;
  end if;

  -- B1 quarantine for every other execution identity, including old definers.
  if (tg_op <> 'DELETE' and new.gateway = 'manual_pix')
     or (tg_op <> 'INSERT' and old.gateway = 'manual_pix') then
    if current_user in ('anon','authenticated','service_role')
       or session_user in ('anon','authenticated','service_role')
       or current_setting('role', true) in ('anon','authenticated','service_role') then
      raise exception 'Manual billing writes are disabled in B1' using errcode = '42501';
    end if;
    if tg_op = 'DELETE' or
       (tg_op = 'UPDATE' and (old.gateway, old.id, old.barbershop_id)
         is distinct from (new.gateway, new.id, new.barbershop_id)) then
      raise exception 'Retain manual financial identity' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Only agreements need the subscription history lookup. Keeping it in a
-- branch prevents the planner from requiring SELECT for the INSERT-only trial role.
create or replace function private.guard_cutover_subscription() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and old.gateway is distinct from new.gateway then
    raise exception 'Origin changes require reconciliation' using errcode='55000';
  end if;
  if tg_op='INSERT' and new.gateway='asaas' and current_user not in ('postgres','supabase_admin') then
    raise exception 'New Asaas enrollment is closed' using errcode='42501';
  end if;
  if tg_op='UPDATE' and old.gateway='asaas' and (
    current_user in ('anon','authenticated') or old.id<>new.id or old.barbershop_id<>new.barbershop_id
    or (old.status in ('expired','canceled') and new.status not in ('expired','canceled'))
  ) then raise exception 'Legacy subscription requires reconciliation' using errcode='42501'; end if;
  if new.gateway='manual_pix' and new.agreement_at is not null
    and (tg_op='INSERT' or old.agreement_at is distinct from new.agreement_at) then
    if exists (select from public.subscriptions
      where barbershop_id=new.barbershop_id and gateway='asaas') then
      raise exception 'Legacy history requires reconciliation' using errcode='55000';
    end if;
  end if;
  return new;
end $$;

create or replace function private.create_barbershop(
  p_name text,
  p_slug text,
  p_phone text default null,
  p_timezone text default 'America/Sao_Paulo'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text := btrim(p_name);
  v_slug text := lower(btrim(p_slug));
  v_phone text := nullif(btrim(p_phone), '');
  v_timezone text := coalesce(nullif(btrim(p_timezone), ''), 'America/Sao_Paulo');
  v_barbershop_id uuid;
  v_auto_enabled boolean;
  v_first_participation boolean;
  v_plan_id uuid;
  v_subscription_id uuid;
  v_started_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida. Entre novamente para continuar.'
      using errcode = '28000';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe um nome de barbearia entre 2 e 120 caracteres.'
      using errcode = '22023';
  end if;

  if v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) < 3 or char_length(v_slug) > 60 then
    raise exception 'O identificador deve ter de 3 a 60 caracteres, usando letras minúsculas, números e hífens.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = v_timezone
  ) then
    raise exception 'Fuso horário inválido.'
      using errcode = '22023';
  end if;

  -- Match the legacy dispatcher lock order. Under concurrent registration
  -- the primary key is the arbitration point, even at stricter isolation.
  perform 1 from private.manual_trial_activation where singleton for share;
  select enabled into v_auto_enabled from private.automatic_premium_trial_activation
    where singleton for share;
  v_auto_enabled := v_auto_enabled is true
    and exists(select from private.manual_trial_activation where not enabled)
    and exists(select from public.plans where code = 'premium' and is_active and max_barbers = 10);

  if v_auto_enabled then
    if not exists (select from auth.users
      where id = v_user_id and email_confirmed_at is not null and not is_anonymous) then
      raise exception 'Confirme seu e-mail antes de cadastrar a barbearia.' using errcode = '28000';
    end if;
    -- A network retry returns the first shop if it still belongs to the
    -- same owner. A different slug never receives a second trial.
    perform pg_advisory_xact_lock(hashtextextended('automatic-premium-trial:' || v_user_id::text, 0));
    select b.id into v_barbershop_id
      from private.automatic_premium_trials t
      join public.barbershops b on b.id = t.shop_id and b.slug = v_slug
      join public.barbershop_members m on m.barbershop_id = b.id
        and m.user_id = v_user_id and m.role = 'owner' and m.is_active
      where t.owner_id = v_user_id;
    if found then return v_barbershop_id; end if;
  end if;

  insert into private.trial_participation(user_id) values (v_user_id)
    on conflict (user_id) do nothing;
  v_first_participation := found;

  insert into public.barbershops (name, slug, phone, timezone)
  values (v_name, v_slug, v_phone, v_timezone)
  returning id into v_barbershop_id;

  insert into public.barbershop_members (barbershop_id, user_id, role, is_active)
  values (v_barbershop_id, v_user_id, 'owner', true);

  if v_auto_enabled and v_first_participation then
    select id into v_plan_id from public.plans
      where code = 'premium' and is_active and max_barbers = 10 for share;
    if not found then
      raise exception 'O plano Premium está indisponível. Tente novamente mais tarde.' using errcode = '55000';
    end if;

    v_started_at := clock_timestamp();
    v_subscription_id := gen_random_uuid();
    insert into private.automatic_premium_trials
      (owner_id, shop_id, subscription_id, plan_id, started_at, ends_at)
    values (v_user_id, v_barbershop_id, v_subscription_id, v_plan_id,
      v_started_at, v_started_at + interval '168 hours');
    perform private.insert_automatic_trial(v_subscription_id);
  elsif exists (select from private.automatic_premium_trials where owner_id = v_user_id) then
    insert into private.automatic_trial_followup_shops(shop_id) values (v_barbershop_id);
  end if;

  return v_barbershop_id;
end;
$$;

create or replace function private.booking_access_before_holds(shop uuid, at_time timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  sub public.subscriptions%rowtype;
  manual boolean;
  allowed boolean;
  reason text;
  grace boolean := false;
  competence_month date;
begin
  select exists(select from private.automatic_trial_followup_shops where shop_id=shop)
    or exists(select from private.manual_trial_intents where barbershop_id=shop)
    or exists(select from public.subscriptions where barbershop_id=shop and gateway='manual_pix') into manual;
  -- The existing partial unique index admits at most one current subscription.
  select * into sub from public.subscriptions where barbershop_id=shop
    and status in ('pending','trialing','active','past_due');
  if not manual then
    allowed := not private.is_subscription_booking_blocked(sub.status,sub.grace_period_ends_at,at_time);
    grace := sub.status='past_due' and allowed;
  elsif sub.gateway is distinct from 'manual_pix' then
    allowed := false;
    reason := case when sub.id is null then 'no_coverage' else 'mixed_origin' end;
  elsif sub.status='trialing' then
    allowed := at_time >= sub.trial_started_at and at_time < sub.trial_ends_at;
    reason := case when allowed then 'trial' else 'trial_ended' end;
  elsif sub.agreement_at is not null and sub.status='past_due' then
    allowed := exists(select from public.payments p where p.subscription_id=sub.id
      and p.barbershop_id=shop and p.gateway='manual_pix' and p.status='overdue' and p.due_at<=at_time)
      and at_time >= sub.past_due_since
      and not private.is_subscription_booking_blocked(sub.status,sub.grace_period_ends_at,at_time);
    grace := allowed;
    reason := 'past_due';
  elsif sub.agreement_at is not null and sub.status='active' and at_time >= sub.current_period_start
    and at_time < sub.current_period_end then
    -- Map the covered month to the explicitly agreed first competence.
    competence_month := (sub.first_competence + age(date_trunc('month',sub.current_period_start at time zone sub.contract_timezone),
      date_trunc('month',sub.coverage_starts_at at time zone sub.contract_timezone)))::date;
    allowed := exists(select from public.payments p where p.subscription_id=sub.id and p.barbershop_id=shop
      and p.gateway='manual_pix' and p.competence=competence_month and p.status='paid' and p.verified_at<=at_time);
    reason := case when allowed then 'paid' else 'no_coverage' end;
  else
    allowed := false;
    reason := 'no_coverage';
  end if;
  return jsonb_build_object('allowed',coalesce(allowed,false),'state',case when grace then 'grace'
    when allowed then 'normal' else 'blocked' end,'subscription_status',sub.status,
    'past_due_since',sub.past_due_since,'grace_period_ends_at',sub.grace_period_ends_at,
    'seconds_remaining',case when grace then greatest(0,ceil(extract(epoch from sub.grace_period_ends_at-at_time))) end,
    'manual',manual,'reason',reason);
end $$;

create or replace function private.register_manual_agreement(
  op uuid,
  shop uuid,
  agreement private.manual_agreement_terms
)
returns uuid
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
set datestyle = 'ISO, YMD'
as $$
declare
  payload jsonb := jsonb_build_array('agreement', shop, to_jsonb(agreement));
  result uuid := private.manual_operation_result(op, payload);
  first_local timestamp := agreement.coverage_start at time zone agreement.zone;
  next_renewal timestamptz;
  ended_trial uuid;
  automatic_conversion uuid;
  observed timestamptz;
begin
  if result is not null then
    return result;
  end if;

  if (agreement is not null
      and agreement.monthly_cents between 1 and 100000000
      and agreement.currency = 'BRL'
      and length(btrim(agreement.terms)) between 1 and 4000
      and isfinite(agreement.coverage_start)
      and isfinite(agreement.first_due)
      and isfinite(agreement.first_month)
      and extract(day from agreement.first_month) = 1
      and agreement.renewal_day between 1 and 31
      and agreement.due_day between 1 and 31
      and agreement.due_time < time '24:00') is not true then
    raise exception 'Incomplete or invalid agreement' using errcode = '22023';
  end if;

  perform 1 from public.barbershops where id = shop for no key update;
  if not found then
    raise exception 'Unknown shop' using errcode = '23503';
  end if;

  perform 1 from public.plans where id = agreement.plan_id and is_active for share;
  if not found then
    raise exception 'Unavailable plan' using errcode = '22023';
  end if;

  -- Keep legacy trials intact. Only an automatic trial can end at the
  -- operator's confirmed agreement, with no backdated covered period.
  observed := clock_timestamp();
  select id into automatic_conversion from public.subscriptions
    where barbershop_id = shop and gateway = 'manual_pix' and status = 'trialing'
      and trial_ends_at > observed and private.is_automatic_trial(id)
      and agreement.coverage_start >= greatest(trial_started_at, date_trunc('minute', observed));

  -- Legacy Asaas history remains quarantined.
  if exists (
      select from public.subscriptions
      where barbershop_id = shop
        and gateway <> 'manual_pix'
    ) then
    raise exception 'Manual enrollment required' using errcode = '55000';
  end if;

  if exists (
    select from public.subscriptions
    where barbershop_id = shop and gateway = 'manual_pix'
      and status = 'trialing' and trial_ends_at > observed
      and id is distinct from automatic_conversion
  ) then
    raise exception 'Manual trial is still active' using errcode = '55000';
  end if;

  if exists (
    select from public.subscriptions s
    join private.financial_holds h on h.contract = s.id
    where s.barbershop_id = shop and h.needs_reconciliation
  ) then
    raise exception 'Legacy history requires reconciliation' using errcode = '55000';
  end if;

  if exists (
    select from public.subscriptions
    where barbershop_id = shop and gateway = 'manual_pix'
      and ((id is distinct from automatic_conversion and trial_ends_at > agreement.coverage_start) or (agreement_at is not null and
        (status not in ('expired', 'canceled') or coalesce(
          case when status = 'canceled' then canceled_at else current_period_end end,
          'infinity') > agreement.coverage_start)))
  ) then
    raise exception 'Coverage overlaps an existing trial or agreement' using errcode = '55000';
  end if;

  if agreement.first_due >= ((private.manual_anchor(
      (agreement.first_month + make_interval(months => agreement.due_month_offset + 1))::date,
      agreement.due_day) + agreement.due_time) at time zone agreement.zone) then
    raise exception 'First maturity must precede the second' using errcode = '22023';
  end if;

  update public.subscriptions
  set status = 'expired'
  where barbershop_id = shop and gateway = 'manual_pix'
    and status = 'trialing' and (trial_ends_at <= observed or id = automatic_conversion)
  returning id into ended_trial;

  next_renewal := (private.manual_anchor(
      (date_trunc('month', first_local) + interval '1 month')::date,
      agreement.renewal_day) + first_local::time) at time zone agreement.zone;

  insert into public.subscriptions(
    barbershop_id, plan_id, gateway, gateway_status, status, invoice_link_key,
    agreement_at, agreement_terms, contracted_price_cents, contracted_currency,
    contracted_interval, coverage_starts_at, current_period_start, current_period_end,
    first_competence, first_due_at, renewal_anchor_day, due_anchor_day,
    due_month_offset, due_local_time, contract_timezone
  ) values (
    shop, agreement.plan_id, 'manual_pix', 'inactive', 'pending', shop::text,
    clock_timestamp(), agreement.terms, agreement.monthly_cents, agreement.currency,
    'month', agreement.coverage_start, agreement.coverage_start, next_renewal,
    agreement.first_month, agreement.first_due, agreement.renewal_day,
    agreement.due_day, agreement.due_month_offset, agreement.due_time, agreement.zone
  ) returning id into result;

  insert into private.manual_operation_receipts values (op, payload, result);
  insert into public.audit_logs(barbershop_id, action, entity_type, entity_id, metadata)
  values (shop, 'manual_billing.agreement', 'subscription', result,
    jsonb_build_object('operation_id', op, 'previous_trial', ended_trial, 'state', 'pending'));
  return result;
end
$$;

-- Retain the original journal payload so existing operation ids replay.
-- The acknowledgement is only a precondition for a new early conversion.
grant lps_financial_api to postgres with inherit false, set true;
grant create on schema public to lps_financial_api;
set role lps_financial_api;
create or replace function public.finance_agreement(op uuid,shop uuid,terms jsonb,reference text,reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.financial_actor(); args jsonb:=jsonb_build_array(terms - 'booking_impact_accepted',reference,reason);
  result jsonb:=private.finance_replay(op,actor,'agreement',shop,args); contract uuid;
begin
  if result is not null then return result; end if;
  if (length(btrim(reference)) between 1 and 120 and length(btrim(reason)) between 1 and 300) is not true
    or jsonb_typeof(terms) is distinct from 'object' or terms - array['plan_id','monthly_cents','currency','terms',
      'coverage_start','first_month','first_due','renewal_day','due_day','due_month_offset','due_time','zone','booking_impact_accepted'] <> '{}'::jsonb
    then raise exception 'Invalid agreement details' using errcode='22023'; end if;
  if terms->'booking_impact_accepted' is distinct from 'true'::jsonb and exists (
    select from public.subscriptions s where s.barbershop_id=shop and s.gateway='manual_pix'
      and s.status='trialing' and s.trial_ends_at>clock_timestamp()
      and private.is_automatic_trial(s.id)
  ) then
    raise exception 'Confirm the immediate booking impact before converting a trial' using errcode='LP033';
  end if;
  contract:=private.register_manual_agreement(op,shop,jsonb_populate_record(null::private.manual_agreement_terms,terms));
  result:=jsonb_build_object('contract',contract,'state','pending');
  insert into private.financial_journal(op,actor,action,shop,request,result) values(op,actor,'agreement',shop,args,result);
  return result;
end $$;
reset role;
revoke create on schema public from lps_financial_api;
revoke lps_financial_api from postgres;

grant select (shop_id, subscription_id, plan_id, started_at, ends_at)
  on private.automatic_premium_trials to lps_financial_api;

create or replace view private.finance_shop_directory with (security_invoker = true) as
select b.id as shop, b.name, owner.full_name as owner,
  coalesce(nullif(b.phone, ''), nullif(b.email, ''), owner.phone, owner.email) as contact,
  s.id as contract, s.gateway, s.status, p.name as plan,
  s.contracted_price_cents as monthly_cents,
  case when exists (select from private.financial_holds review
          join public.subscriptions prior on prior.id = review.contract
          where prior.barbershop_id = b.id and review.needs_reconciliation)
      or (exists(select from public.subscriptions legacy
          where legacy.barbershop_id = b.id and legacy.gateway = 'asaas')
        and exists(select from public.subscriptions manual
          where manual.barbershop_id = b.id and manual.gateway = 'manual_pix'))
      then 'reconcile'
    when s.id is null then 'none'
    when s.gateway = 'asaas' then 'asaas'
    when s.gateway = 'manual_pix' and s.agreement_at is not null then 'manual'
    when s.gateway = 'manual_pix' and s.trial_started_at is not null then 'trial'
    else 'reconcile' end as origin,
  t.trial_started_at as trial_start, t.trial_ends_at as trial_end,
  s.coverage_starts_at as coverage_start, s.first_competence, s.first_due_at,
  s.renewal_anchor_day, s.due_anchor_day as due_day, s.contract_timezone,
  s.current_period_start, s.current_period_end, coalesce(h.suspended, false) as suspended,
  (select max(pay.verified_at) from public.payments pay
    where pay.barbershop_id = b.id and pay.gateway = 'manual_pix'
      and pay.scope = 'platform_subscription' and pay.status = 'paid') as last_verified_at,
  (grant_data.subscription_id is not null) as automatic_trial,
  case when grant_data.subscription_id is null then null
    when exists (select from public.payments paid
      join public.subscriptions contract on contract.id = paid.subscription_id
      where paid.barbershop_id = b.id and contract.barbershop_id = b.id
        and contract.gateway = 'manual_pix' and contract.agreement_at >= grant_data.started_at
        and paid.gateway = 'manual_pix' and paid.scope = 'platform_subscription'
        and paid.status = 'paid' and paid.verified_at is not null) then 'converted'
    when s.id = grant_data.subscription_id and s.status = 'trialing'
      and statement_timestamp() < grant_data.ends_at then 'running'
    else 'ended' end as automatic_trial_state,
  case when s.id = grant_data.subscription_id and s.status = 'trialing'
    then greatest(0, ceil(extract(epoch from grant_data.ends_at - statement_timestamp()) / 86400))::integer
    when grant_data.subscription_id is not null then 0 end as automatic_trial_days,
  (select tp.name from public.plans tp where tp.id = grant_data.plan_id) as automatic_trial_plan
from public.barbershops b
left join lateral (
  select a.full_name, a.phone, a.email
  from public.barbershop_members m
  join public.profiles a on a.id = m.user_id
  where m.barbershop_id = b.id and m.role = 'owner' and m.is_active
  order by m.user_id limit 1
) owner on true
left join lateral (
  select sub.* from public.subscriptions sub
  where sub.barbershop_id = b.id
  order by (sub.status in ('pending', 'active', 'past_due', 'trialing')) desc,
    (sub.gateway = 'manual_pix') desc, sub.created_at desc, sub.id desc
  limit 1
) s on true
left join lateral (
  select sub.id, sub.trial_started_at, sub.trial_ends_at
  from public.subscriptions sub
  where sub.barbershop_id = b.id and sub.gateway = 'manual_pix'
    and sub.trial_started_at is not null
  order by sub.trial_started_at desc, sub.created_at desc, sub.id desc
  limit 1
) t on true
left join private.automatic_premium_trials grant_data on grant_data.shop_id = b.id
left join public.plans p on p.id = s.plan_id
left join private.financial_holds h on h.contract = s.id;

create function public.get_owner_automatic_trial(p_shop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_barbershop_role(p_shop, array['owner']::public.barbershop_member_role[]) then
    raise exception 'Acesso restrito ao proprietário' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'started_at', t.started_at, 'ends_at', t.ends_at, 'observed_at', statement_timestamp(),
      'running', s.status = 'trialing' and statement_timestamp() < t.ends_at,
      'welcome_available', t.welcomed_at is null and t.owner_id = (select auth.uid())
        and s.status = 'trialing' and statement_timestamp() < t.ends_at)
    from private.automatic_premium_trials t
    join public.subscriptions s on s.id = t.subscription_id
    where t.shop_id = p_shop and not exists (
      select from public.subscriptions c
      where c.barbershop_id = p_shop and c.gateway = 'manual_pix' and c.agreement_at is not null)
  );
end
$$;
revoke all on function public.get_owner_automatic_trial(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_owner_automatic_trial(uuid) to authenticated;

create function public.claim_automatic_trial_welcome(p_shop uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  observed timestamptz;
begin
  if not private.has_barbershop_role(p_shop, array['owner']::public.barbershop_member_role[]) then
    raise exception 'Acesso restrito ao proprietário' using errcode = '42501';
  end if;
  -- Serialize with conversion without locking the grant ahead of the tenant.
  perform private.lock_booking_access(p_shop, false);
  observed := clock_timestamp();
  update private.automatic_premium_trials t set welcomed_at = observed
  where t.owner_id = actor and t.shop_id = p_shop and t.welcomed_at is null
    and observed >= t.started_at and observed < t.ends_at
    and exists(select from public.subscriptions s where s.id = t.subscription_id and s.status = 'trialing');
  return found;
end
$$;
revoke all on function public.claim_automatic_trial_welcome(uuid) from public, anon, authenticated, service_role;
grant execute on function public.claim_automatic_trial_welcome(uuid) to authenticated;

commit;
