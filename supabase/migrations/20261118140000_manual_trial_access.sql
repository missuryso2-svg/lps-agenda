-- Keep the validated A1 primitive private; only the onboarding role and the
-- gated legacy definer can call it. The public dispatcher runs as its caller.
alter function public.create_barbershop(text,text,text,text) set schema private;
revoke all on function private.create_barbershop(text,text,text,text) from public,anon,authenticated,service_role;
create function private.create_legacy_barbershop(p_name text,p_slug text,p_phone text,p_timezone text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  if (select enabled from private.manual_trial_activation where singleton for share) is distinct from false then
    raise exception 'Cadastro legado indisponível' using errcode='42501';
  end if;
  return private.create_barbershop(p_name,p_slug,p_phone,p_timezone);
end $$;
revoke all on function private.create_legacy_barbershop(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.create_legacy_barbershop(text,text,text,text) to authenticated;
create function public.create_barbershop(p_name text,p_slug text,p_phone text default null,
  p_timezone text default 'America/Sao_Paulo') returns uuid language plpgsql security invoker set search_path='' as $$
begin
  if current_user='lps_trial_onboarding' then
    return private.create_barbershop(p_name,p_slug,p_phone,p_timezone);
  end if;
  return private.create_legacy_barbershop(p_name,p_slug,p_phone,p_timezone);
end $$;
revoke all on function public.create_barbershop(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_barbershop(text,text,text,text) to authenticated,lps_trial_onboarding;

-- The app gate authorizes exactly the canonical registration submitted by the
-- verified user. A1 still derives ownership from auth.uid() at creation.
create table private.manual_trial_permits (
  actor uuid not null, intent uuid not null, registration jsonb not null,
  expires_at timestamptz not null, primary key(actor,intent)
);
create index manual_trial_permits_expiry on private.manual_trial_permits(expires_at);
revoke all on private.manual_trial_permits from public,anon,authenticated,service_role;
create function public.authorize_manual_trial_intent(p_actor uuid,p_intent_id uuid,p_name text,p_slug text,
  p_phone text,p_timezone text) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select from private.manual_trial_activation where enabled) then
    raise exception 'Cadastro manual indisponível' using errcode='42501';
  end if;
  delete from private.manual_trial_permits where expires_at <= clock_timestamp();
  insert into private.manual_trial_permits values(p_actor,p_intent_id,
    jsonb_build_array(btrim(p_name),lower(btrim(p_slug)),nullif(btrim(p_phone),''),
      coalesce(nullif(btrim(p_timezone),''),'America/Sao_Paulo')),clock_timestamp()+interval '1 minute')
  on conflict(actor,intent) do update set expires_at=excluded.expires_at
    where manual_trial_permits.registration=excluded.registration;
  if not found then raise exception 'Intenção divergente' using errcode='22023'; end if;
end $$;
revoke all on function public.authorize_manual_trial_intent(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.authorize_manual_trial_intent(uuid,uuid,text,text,text,text) to service_role;
create function private.consume_manual_trial_permit() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (select enabled from private.manual_trial_activation where singleton for share) is distinct from true then
    raise exception 'Cadastro manual indisponível' using errcode='42501';
  end if;
  delete from private.manual_trial_permits where actor=new.user_id and intent=new.intent_id
    and registration=new.registration and expires_at > clock_timestamp();
  if not found then raise exception 'Cadastro não autorizado pelo servidor' using errcode='42501'; end if;
  return new;
end $$;
revoke all on function private.consume_manual_trial_permit() from public,authenticated,anon,service_role;
create trigger manual_trial_intents_require_permit before insert on private.manual_trial_intents
  for each row execute function private.consume_manual_trial_permit();

-- Check the completed transaction, including privileged Data API inserts.
-- A1 creates the shop first, then its owner, intent and subscription.
create function private.check_new_shop_trial() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (select enabled from private.manual_trial_activation where singleton for share) is distinct from false
    and not exists (
      select from private.manual_trial_intents i
      join public.barbershop_members m on m.barbershop_id=i.barbershop_id and m.user_id=i.user_id
        and m.role='owner' and m.is_active
      join public.subscriptions s on s.barbershop_id=i.barbershop_id and s.gateway='manual_pix'
        and s.status='trialing' and s.trial_started_at=i.trial_start
        and s.trial_ends_at=i.trial_start+interval '168 hours'
      where i.barbershop_id=new.id
    ) then
    raise exception 'O cadastro exige um trial autorizado' using errcode='42501';
  end if;
  return null;
end $$;
revoke all on function private.check_new_shop_trial() from public,anon,authenticated,service_role;
create constraint trigger barbershops_require_manual_trial after insert on public.barbershops
  deferrable initially deferred for each row execute function private.check_new_shop_trial();

-- A separate row per tenant survives the end of a subscription. Financial
-- writes change its MVCC version, so a waiter at REPEATABLE READ/SERIALIZABLE
-- aborts with 40001 instead of admitting a booking from an obsolete snapshot.
create table private.booking_access_locks (
  shop uuid primary key references public.barbershops(id) on delete cascade,
  revision bigint not null default 0
);
revoke all on private.booking_access_locks from public,anon,authenticated,service_role;
create function private.lock_booking_access(tenant uuid, writing boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if writing then
    insert into private.booking_access_locks as l(shop) select id from public.barbershops where id=tenant
      on conflict(shop) do update set revision=l.revision+1;
  else
    insert into private.booking_access_locks(shop) values(tenant) on conflict do nothing;
    perform shop from private.booking_access_locks where shop=tenant for share;
  end if;
end $$;
revoke all on function private.lock_booking_access(uuid,boolean) from public,anon,authenticated,service_role;

create function private.lock_billing_tenant() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.barbershop_id <> new.barbershop_id then
    perform private.lock_booking_access(least(old.barbershop_id,new.barbershop_id),true);
    perform private.lock_booking_access(greatest(old.barbershop_id,new.barbershop_id),true);
  elsif tg_op='DELETE' then
    perform private.lock_booking_access(old.barbershop_id,true);
    return old;
  else
    perform private.lock_booking_access(new.barbershop_id,true);
  end if;
  return new;
end $$;
revoke all on function private.lock_billing_tenant() from public,anon,authenticated,service_role;
create trigger subscriptions_lock_tenant before insert or update or delete on public.subscriptions
  for each row execute function private.lock_billing_tenant();
create trigger manual_payments_lock_tenant before insert or update on public.payments
  for each row when(new.gateway='manual_pix') execute function private.lock_billing_tenant();

create function private.booking_access_at(shop uuid, at_time timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  sub public.subscriptions%rowtype;
  manual boolean;
  allowed boolean;
  reason text;
  grace boolean := false;
  competence_month date;
begin
  select exists(select from private.manual_trial_intents where barbershop_id=shop)
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
revoke all on function private.booking_access_at(uuid,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.get_barbershop_booking_access(p_barbershop_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$
  select private.booking_access_at(p_barbershop_id,clock_timestamp())
$$;
create or replace function private.enforce_appointment_booking_grace() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.status not in ('scheduled','confirmed','in_progress') or
    (old.status in ('scheduled','confirmed','in_progress') and
      (old.barbershop_id,old.barber_id,old.service_id,old.starts_at,old.ends_at) is not distinct from
      (new.barbershop_id,new.barber_id,new.service_id,new.starts_at,new.ends_at))) then
    return new;
  end if;
  perform private.lock_booking_access(new.barbershop_id,false);
  if (private.booking_access_at(new.barbershop_id,clock_timestamp())->>'allowed')::boolean is not true then
    raise exception 'Agendamentos temporariamente indisponíveis.' using errcode='P0001';
  end if;
  return new;
end $$;

create function public.get_owner_manual_trial(p_shop uuid) returns jsonb language plpgsql
security definer set search_path='' as $$
declare access jsonb; result jsonb; observed timestamptz:=clock_timestamp();
begin
  if not private.has_barbershop_role(p_shop,array['owner']::public.barbershop_member_role[]) then
    raise exception 'Acesso restrito ao proprietário' using errcode='42501';
  end if;
  access:=private.booking_access_at(p_shop,observed);
  if not (access->>'manual')::boolean then return null; end if;
  select jsonb_build_object('plan',p.name,'trial_start',t.trial_started_at,'trial_end',t.trial_ends_at,
    'trial_state',case when t.id is null then null when t.status='canceled' then 'canceled'
      when access->>'reason'='trial' then 'running' else 'ended' end,
    'next_step','contact_lps',
    'days_left',case when access->>'reason'='trial' then ceil(extract(epoch from t.trial_ends_at-observed)/86400) else 0 end,
    'access',access->>'state','reason',access->>'reason') into result
  from (select 1) anchor
  left join public.subscriptions t on t.barbershop_id=p_shop and t.gateway='manual_pix' and t.trial_ends_at is not null
  left join public.subscriptions c on c.barbershop_id=p_shop and c.gateway='manual_pix'
    and c.status in ('pending','trialing','active','past_due')
  left join public.plans p on p.id=coalesce(c.plan_id,t.plan_id);
  return result;
end $$;
revoke all on function public.get_owner_manual_trial(uuid) from public,anon,service_role;
grant execute on function public.get_owner_manual_trial(uuid) to authenticated;

create function private.shop_professional_limit(shop uuid) returns table(plan_name text,max_barbers integer)
language sql stable security definer set search_path='' as $$
  select p.name,p.max_barbers from public.subscriptions s join public.plans p on p.id=s.plan_id
  where s.barbershop_id=shop and (s.status in ('pending','trialing','active','past_due') or
    (s.gateway='manual_pix' and s.trial_ends_at is not null))
  order by (s.gateway='manual_pix') desc,(s.status in ('pending','trialing','active','past_due')) desc
  limit 1
$$;
revoke all on function private.shop_professional_limit(uuid) from public,anon,authenticated,service_role;
create function public.get_shop_professional_limit(p_shop uuid) returns table(plan_name text,max_barbers integer)
language sql stable security definer set search_path='' as $$
  select * from private.shop_professional_limit(p_shop) where private.is_barbershop_member(p_shop)
    or private.is_platform_admin()
$$;
revoke all on function public.get_shop_professional_limit(uuid) from public,anon,service_role;
grant execute on function public.get_shop_professional_limit(uuid) to authenticated;
create or replace function private.enforce_barber_plan_limit() returns trigger
language plpgsql security definer set search_path='' as $$
declare cap int;
begin
  if not new.is_active or (tg_op='UPDATE' and old.is_active and old.barbershop_id=new.barbershop_id) then return new; end if;
  perform private.lock_booking_access(new.barbershop_id,true);
  select max_barbers into cap from private.shop_professional_limit(new.barbershop_id);
  if cap is not null and (select count(*) from public.barbers where barbershop_id=new.barbershop_id
    and is_active and id<>new.id)>=cap then
    raise exception 'O plano permite até % profissional(is) ativo(s) nesta barbearia.',cap using errcode='23514';
  end if;
  return new;
end $$;
create or replace trigger barbers_enforce_plan_limit
  before insert or update of is_active,barbershop_id on public.barbers
  for each row execute function private.enforce_barber_plan_limit();
