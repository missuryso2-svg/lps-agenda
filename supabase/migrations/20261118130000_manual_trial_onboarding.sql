-- B2-A1. Create a fresh role: a pre-existing identity with this name is an error.
create role lps_trial_onboarding nologin noinherit;
grant lps_trial_onboarding to postgres with inherit false, set true;

create table private.manual_trial_activation (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.manual_trial_activation default values;

create table private.manual_trial_intents (
  user_id uuid not null references auth.users(id),
  intent_id uuid not null,
  barbershop_id uuid not null unique references public.barbershops(id),
  registration jsonb not null,
  trial_start timestamptz not null,
  primary key (user_id, intent_id)
);
revoke all on private.manual_trial_activation, private.manual_trial_intents
  from public, anon, authenticated, service_role;
-- Managed postgres cannot delegate USAGE on the Supabase-owned auth schema.
-- Bind auth.uid() by OID at definition time; this wrapper runs as INVOKER.
create function private.trial_onboarding_actor() returns uuid
  language sql stable security invoker set search_path = '' return auth.uid();
revoke all on function private.trial_onboarding_actor() from public, anon, authenticated, service_role;
grant usage on schema public, private to lps_trial_onboarding;
grant execute on function private.trial_onboarding_actor(), public.create_barbershop(text,text,text,text),
  private.has_barbershop_role(uuid,public.barbershop_member_role[]) to lps_trial_onboarding;
grant select on private.manual_trial_activation to lps_trial_onboarding;
grant select, insert on private.manual_trial_intents to lps_trial_onboarding;
grant select (id, code, is_active) on public.plans to lps_trial_onboarding;
create policy plans_read_trial_catalog on public.plans for select to lps_trial_onboarding
  using (code = 'basico' and is_active);

grant insert (barbershop_id, plan_id, gateway, gateway_status, status, invoice_link_key,
  trial_started_at, trial_ends_at) on public.subscriptions to lps_trial_onboarding;
-- Retain the B1 USING clause for every role and all existing rows.
alter policy subscriptions_manual_quarantine on public.subscriptions
  with check (gateway <> 'manual_pix' or current_user = 'lps_trial_onboarding');
create policy subscriptions_insert_onboarding_trial on public.subscriptions
  for insert to lps_trial_onboarding
  with check (gateway = 'manual_pix' and status = 'trialing' and invoice_link_key = 'uncontracted');

create or replace function private.quarantine_manual_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
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

create function public.create_barbershop_with_manual_trial(
  p_intent_id uuid, p_name text, p_slug text,
  p_phone text default null, p_timezone text default 'America/Sao_Paulo'
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := private.trial_onboarding_actor();
  shop_name text := btrim(p_name);
  slug text := lower(btrim(p_slug));
  phone text := nullif(btrim(p_phone),'');
  zone text := coalesce(nullif(btrim(p_timezone),''),'America/Sao_Paulo');
  payload jsonb := jsonb_build_array(shop_name,slug,phone,zone);
  prior private.manual_trial_intents%rowtype;
  shop uuid;
  plan uuid;
  started timestamptz;
begin
  if actor is null then raise exception 'Sessão inválida' using errcode = '28000'; end if;
  if not exists (select from private.manual_trial_activation where enabled) then
    raise exception 'Onboarding manual indisponível' using errcode = '42501';
  end if;
  if p_intent_id is null or shop_name is null or slug is null
     or (phone is not null and length(phone) not between 8 and 24) then
    raise exception 'Cadastro inválido' using errcode = '22023';
  end if;
  -- Serialize before lookup. A hash collision only serializes unrelated calls;
  -- identity is always compared on the full (user_id,intent_id) primary key.
  perform pg_advisory_xact_lock(hashtextextended(actor::text || '/' || p_intent_id::text,0));
  select * into prior from private.manual_trial_intents
    where user_id = actor and intent_id = p_intent_id;
  if found then
    if prior.registration <> payload then
      raise exception 'Intenção já utilizada com outros dados' using errcode = '22023';
    end if;
    if not private.has_barbershop_role(prior.barbershop_id,array['owner']::public.barbershop_member_role[]) then
      raise exception 'Cadastro indisponível' using errcode = '42501';
    end if;
    return prior.barbershop_id;
  end if;

  -- Reuse validation and the atomic creation of the authenticated owner.
  begin
    shop := public.create_barbershop(shop_name,slug,phone,zone);
  exception when unique_violation then
    raise exception 'Identificador indisponível' using errcode = '23505';
  end;
  select id into plan from public.plans where code = 'basico' and is_active;
  if not found then raise exception 'Plano inicial indisponível' using errcode = '55000'; end if;
  started := clock_timestamp();
  insert into private.manual_trial_intents(user_id,intent_id,barbershop_id,registration,trial_start)
    values (actor,p_intent_id,shop,payload,started);
  insert into public.subscriptions(barbershop_id,plan_id,gateway,gateway_status,status,invoice_link_key,
    trial_started_at,trial_ends_at)
    values (shop,plan,'manual_pix','inactive','trialing','uncontracted',started,started + interval '168 hours');
  return shop;
end;
$$;
revoke all on function public.create_barbershop_with_manual_trial(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_barbershop_with_manual_trial(uuid,text,text,text,text)
  to authenticated;
-- CREATE is needed for transfer only. No runtime role can become this owner.
grant create on schema public to lps_trial_onboarding;
alter function public.create_barbershop_with_manual_trial(uuid,text,text,text,text) owner to lps_trial_onboarding;
revoke create on schema public from lps_trial_onboarding;
revoke lps_trial_onboarding from postgres;
