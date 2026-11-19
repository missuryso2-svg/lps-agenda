-- B1. No manual rows, jobs or public RPCs are created by this migration.
-- Existing rows share the constant legacy key (Postgres fast column default).
-- A manual invoice must reference the tenant key of an agreed contract.
alter table public.subscriptions
  add column invoice_link_key text not null default 'legacy',
  add column agreement_at timestamptz,
  add column coverage_starts_at timestamptz,
  add column first_competence date,
  add column first_due_at timestamptz,
  add column renewal_anchor_day smallint,
  add column due_anchor_day smallint,
  add column due_month_offset smallint,
  add column due_local_time time,
  add column contract_timezone text,
  add column agreement_terms text,
  add constraint subscriptions_invoice_link_unique unique (id, invoice_link_key),
  add constraint subscriptions_manual_terms_check check ((
    case when gateway <> 'manual_pix' then
      invoice_link_key = 'legacy' and num_nonnulls(agreement_at, coverage_starts_at,
        first_competence, first_due_at, renewal_anchor_day, due_anchor_day, due_month_offset, due_local_time,
        contract_timezone, agreement_terms) = 0
    when agreement_at is null then
      invoice_link_key = 'uncontracted' and status in ('pending','trialing','expired','canceled')
      and num_nonnulls(coverage_starts_at, first_competence, first_due_at, renewal_anchor_day,
        due_anchor_day, due_month_offset, due_local_time, contract_timezone, agreement_terms) = 0
    else
      invoice_link_key = barbershop_id::text and status <> 'trialing'
      and isfinite(agreement_at) and isfinite(coverage_starts_at)
      and isfinite(first_competence) and extract(day from first_competence) = 1
      and isfinite(first_due_at)
      and renewal_anchor_day between 1 and 31 and due_anchor_day between 1 and 31
      and due_month_offset is not null
      and due_local_time < time '24:00' and length(btrim(contract_timezone)) > 0
      and length(btrim(agreement_terms)) between 1 and 4000
      and contracted_interval = 'month' and contracted_currency = 'BRL'
      and contracted_price_cents is not null
      and isfinite(current_period_start) and isfinite(current_period_end)
      and current_period_start >= coverage_starts_at
    end
  ) is true),
  add constraint subscriptions_manual_origin_check check (gateway <> 'manual_pix' or (
    gateway_subscription_id is null and (billing_type is null or billing_type = 'pix')
    and (status <> 'trialing' or (trial_started_at is not null and
      isfinite(trial_started_at) and trial_ends_at is not null and
      trial_ends_at - trial_started_at = interval '168 hours'))
  ));

alter table public.payments
  add column invoice_link_key text not null default 'legacy',
  add column competence date,
  add column original_amount_cents integer,
  add column adjustment_cents integer,
  add column adjustment_reason text,
  add column due_at timestamptz,
  add column due_timezone text,
  add column verified_at timestamptz,
  add column verified_by uuid references auth.users (id) on delete restrict,
  add column receipt_reference text,
  add constraint payments_subscription_invoice_link_fk
    foreign key (subscription_id, invoice_link_key)
    references public.subscriptions (id, invoice_link_key),
  add constraint payments_manual_invoice_check check ((
    case when gateway <> 'manual_pix' then
      invoice_link_key = 'legacy' and num_nonnulls(competence, original_amount_cents,
        adjustment_cents, adjustment_reason, due_at, due_timezone, verified_at,
        verified_by, receipt_reference) = 0
    else
      invoice_link_key = barbershop_id::text and scope = 'platform_subscription'
      and subscription_id is not null and appointment_id is null and method = 'pix'
      and gateway_payment_id is null and invoice_url is null
      and isfinite(competence) and extract(day from competence) = 1
      and original_amount_cents between 0 and 100000000
      and original_amount_cents::bigint + coalesce(adjustment_cents, 0) = amount_cents
      and (coalesce(adjustment_cents, 0) = 0 or length(btrim(adjustment_reason)) > 0)
      and isfinite(due_at) and (due_at at time zone due_timezone)::date = due_date
      and status in ('pending','overdue','paid','cancelled')
      and case when status = 'paid' then
        amount_cents > 0 and isfinite(paid_at) and isfinite(verified_at)
        and verified_at >= paid_at and verified_by is not null
        and (receipt_reference is null or length(btrim(receipt_reference)) between 1 and 200)
      else num_nonnulls(paid_at, verified_at, verified_by, receipt_reference) = 0 end
    end
  ) is true);

create unique index payments_manual_competence_unique
  on public.payments (subscription_id, competence) where gateway = 'manual_pix';

-- Existing authenticated grants and permissive platform_admin policies still
-- serve the legacy flow. Restrictive policies cover OLD and NEW, including
-- attempts to disguise or promote a row by changing its gateway.
create policy subscriptions_manual_quarantine on public.subscriptions
  as restrictive for all to public
  using (gateway <> 'manual_pix') with check (gateway <> 'manual_pix');
create policy payments_manual_quarantine on public.payments
  as restrictive for all to public
  using (gateway <> 'manual_pix') with check (gateway <> 'manual_pix');

-- Existing server actions use service_role (BYPASSRLS). Quarantine also
-- applies to this writer, including calls through legacy definer functions.
create function private.quarantine_manual_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
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
revoke all on function private.quarantine_manual_write() from public, anon, authenticated, service_role;
create trigger b1_quarantine before insert or update or delete on public.subscriptions
  for each row execute function private.quarantine_manual_write();
create trigger b1_quarantine before insert or update or delete on public.payments
  for each row execute function private.quarantine_manual_write();

-- Store access concessions as individual events in the existing audit trail.
-- The composite reference targets an agreed contract of the same tenant.
alter table public.audit_logs
  add column extension_link_key text,
  add constraint audit_logs_extension_contract_fk foreign key (entity_id, extension_link_key)
    references public.subscriptions (id, invoice_link_key),
  add constraint audit_logs_manual_extension_check check ((
    case when action = 'manual_billing.extend_days' then
      extension_link_key = barbershop_id::text and actor_user_id is not null
      and entity_id is not null and entity_type = 'subscription'
      and jsonb_typeof(metadata->'days') = 'number'
      and metadata->>'days' ~ '^[1-9][0-9]*$'
      and jsonb_typeof(metadata->'reason') = 'string'
      and length(btrim(metadata->>'reason')) > 0
    else extension_link_key is null end
  ) is true);

create policy audit_logs_manual_quarantine on public.audit_logs
  as restrictive for all to public
  using (action not like 'manual!_billing.%' escape '!')
  with check (action not like 'manual!_billing.%' escape '!');

-- Trigger only. Invoker privileges; no executable helper or RPC for clients.
create function private.check_manual_contract_timezone() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select from pg_catalog.pg_timezone_names where name = new.contract_timezone) then
    raise exception 'Unknown contract timezone' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_manual_contract_timezone() from public, anon, authenticated, service_role;
create trigger subscriptions_manual_timezone before insert or update on public.subscriptions
  for each row when (new.gateway = 'manual_pix' and new.agreement_at is not null)
  execute function private.check_manual_contract_timezone();

-- The first due date may be individually negotiated. Subsequent invoices use
-- the contracted day and wall time in the explicitly selected due month.
create function private.check_manual_invoice_schedule() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  contract public.subscriptions%rowtype;
  month_start date;
  last_day date;
  expected_date date;
begin
  select * into contract from public.subscriptions
    where id = new.subscription_id and barbershop_id = new.barbershop_id
      and gateway = 'manual_pix' and agreement_at is not null for share;
  if not found then
    raise exception 'Missing manual agreement for this tenant' using errcode = '23503';
  end if;
  if new.competence < contract.first_competence or
     new.due_timezone is distinct from contract.contract_timezone then
    raise exception 'Invoice outside agreed terms' using errcode = '23514';
  end if;
  if new.competence = contract.first_competence and new.due_at is distinct from contract.first_due_at then
    raise exception 'First due date differs from agreement' using errcode = '23514';
  elsif new.competence > contract.first_competence then
    month_start := (new.competence + make_interval(months => contract.due_month_offset))::date;
    last_day := (month_start + interval '1 month - 1 day')::date;
    expected_date := least(last_day, month_start + (contract.due_anchor_day - 1));
    if new.due_date is distinct from expected_date or new.due_at is distinct from
       ((expected_date + contract.due_local_time) at time zone contract.contract_timezone) then
      raise exception 'Due date differs from monthly anchor' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.check_manual_invoice_schedule() from public, anon, authenticated, service_role;
create trigger payments_manual_schedule before insert on public.payments
  for each row when (new.gateway = 'manual_pix')
  execute function private.check_manual_invoice_schedule();

-- A manual invoice is a historical document. Corrections must be explicit
-- future operations. A privileged settlement may add evidence only once.
create function private.guard_manual_invoice_history() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Retain manual invoice history' using errcode = '23514';
  end if;
  if old.status in ('paid','cancelled')
     or (to_jsonb(new) - array['status','paid_at','verified_at','verified_by','receipt_reference','updated_at'])
        is distinct from
        (to_jsonb(old) - array['status','paid_at','verified_at','verified_by','receipt_reference','updated_at']) then
    raise exception 'Issued manual invoice is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_manual_invoice_history() from public, anon, authenticated, service_role;
create trigger payments_guard_manual_invoice before update or delete on public.payments
  for each row when (old.gateway = 'manual_pix')
  execute function private.guard_manual_invoice_history();

create function private.audit_manual_invoice() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.audit_logs(barbershop_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (new.barbershop_id, coalesce(auth.uid(), new.verified_by),
    'manual_billing.invoice', 'payment', new.id,
    jsonb_build_object('previous_status', old.status, 'status', new.status,
      'competence', new.competence, 'amount_cents', new.amount_cents,
      'paid_at', new.paid_at, 'verified_at', new.verified_at));
  return new;
end;
$$;
revoke all on function private.audit_manual_invoice() from public, anon, authenticated, service_role;
create trigger payments_audit_manual_invoice after insert or update on public.payments
  for each row when (new.gateway = 'manual_pix')
  execute function private.audit_manual_invoice();

create function private.retain_manual_audit() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Manual billing audit is append-only' using errcode = '23514';
end;
$$;
revoke all on function private.retain_manual_audit() from public, anon, authenticated, service_role;
create trigger audit_logs_retain_manual before update or delete on public.audit_logs
  for each row when (old.action like 'manual!_billing.%' escape '!')
  execute function private.retain_manual_audit();
