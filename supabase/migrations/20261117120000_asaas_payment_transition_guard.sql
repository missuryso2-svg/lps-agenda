-- LPS Agenda — sincronização serializada do estado comercial a partir de uma
-- cobrança Asaas já persistida.
--
-- A aplicação calcula a transição permitida; apply_asaas_payment_transition
-- valida o snapshot e persiste payment + assinatura na mesma transação. Os
-- locks e as verificações de período impedem que uma confirmação antiga vença
-- uma inadimplência mais recente.
--
-- Migration aditiva: não altera dados, enums, policies ou triggers. Para
-- rollback, remova as funções desta migration depois de reverter o código.

create or replace function public.sync_subscription_from_asaas_payment(
  p_payment_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_interval public.billing_interval;
  v_state_event text;
  v_provider_status text;
  v_state_status text;
  v_restored_from_event text;
  v_previous_local_status text;
  v_due_date date;
  v_current_start_date date;
  v_current_end_date date;
  v_candidate_start timestamptz;
  v_candidate_end timestamptz;
  v_has_later_blocker boolean := false;
  v_has_later_paid boolean := false;
  v_target_status public.subscription_status;
  v_target_period_start timestamptz;
  v_target_period_end timestamptz;
  v_target_gateway_status text;
begin
  -- Lê primeiro os vínculos sem lock para determinar o tenant; os locks são
  -- adquiridos sempre na ordem assinatura -> cobrança. O vínculo é revalidado
  -- depois do lock da cobrança.
  select p.*
    into v_payment
  from public.payments p
  where p.id = p_payment_id
    and p.gateway = 'asaas'
    and p.scope = 'platform_subscription';

  if not found or v_payment.subscription_id is null then
    return false;
  end if;

  select s.*
    into v_subscription
  from public.subscriptions s
  where s.id = v_payment.subscription_id
    and s.barbershop_id = v_payment.barbershop_id
    and s.gateway = 'asaas'
  for update;

  if not found
    or v_subscription.status in ('canceled', 'expired')
    or (
      v_subscription.status = 'trialing'
      and v_subscription.gateway_subscription_id is null
    ) then
    return false;
  end if;

  select p.*
    into v_payment
  from public.payments p
  where p.id = p_payment_id
    and p.gateway = 'asaas'
    and p.scope = 'platform_subscription'
    and p.subscription_id = v_subscription.id
    and p.barbershop_id = v_subscription.barbershop_id
  for update;

  if not found then
    return false;
  end if;

  v_due_date := v_payment.due_date;
  v_target_status := v_subscription.status;
  v_target_period_start := v_subscription.current_period_start;
  v_target_period_end := v_subscription.current_period_end;
  v_target_gateway_status := v_subscription.gateway_status;

  if v_payment.status = 'paid' then
    v_state_event := coalesce(
      v_payment.metadata ->> 'asaas_payment_state_event',
      v_payment.metadata ->> 'asaas_event',
      ''
    );
    v_provider_status := upper(coalesce(
      v_payment.metadata ->> 'asaas_payment_state_provider_status',
      v_payment.metadata ->> 'asaas_status',
      ''
    ));
    v_state_status := coalesce(
      v_payment.metadata ->> 'asaas_payment_state_status',
      ''
    );
    v_restored_from_event := coalesce(
      v_payment.metadata ->> 'asaas_restored_from_event',
      ''
    );
    v_previous_local_status := coalesce(
      v_payment.metadata ->> 'asaas_previous_local_status',
      ''
    );

    if v_state_status <> 'paid'
      or not (
        (
          v_state_event = 'PAYMENT_CONFIRMED'
          and v_provider_status = 'CONFIRMED'
          and (
            v_restored_from_event = ''
            or v_restored_from_event in (
              'PAYMENT_CHARGEBACK_REQUESTED',
              'PAYMENT_CHARGEBACK_DISPUTE',
              'PAYMENT_AWAITING_CHARGEBACK_REVERSAL'
            )
          )
        )
        or (
          v_state_event = 'PAYMENT_RECEIVED'
          and v_provider_status = 'RECEIVED'
          and (
            v_restored_from_event = ''
            or v_restored_from_event in (
              'PAYMENT_CHARGEBACK_REQUESTED',
              'PAYMENT_CHARGEBACK_DISPUTE',
              'PAYMENT_AWAITING_CHARGEBACK_REVERSAL'
            )
          )
        )
        or (
          v_state_event = 'PAYMENT_REFUND_DENIED'
          and v_provider_status in ('CONFIRMED', 'RECEIVED')
          and v_restored_from_event = 'PAYMENT_REFUND_IN_PROGRESS'
        )
      ) then
      return false;
    end if;

    if v_due_date is not null then
      select p.interval
        into v_interval
      from public.plans p
      where p.id = v_subscription.plan_id;

      if not found then
        return false;
      end if;

      v_candidate_start :=
        (v_due_date::timestamp + interval '12 hours') at time zone 'UTC';
      v_candidate_end := (
        v_due_date::timestamp
        + interval '12 hours'
        + case
            when v_interval = 'year' then interval '1 year'
            else interval '1 month'
          end
      ) at time zone 'UTC';
      v_current_start_date :=
        (v_subscription.current_period_start at time zone 'UTC')::date;
      v_current_end_date :=
        (v_subscription.current_period_end at time zone 'UTC')::date;

      select exists (
        select 1
        from public.payments later_payment
        where later_payment.subscription_id = v_subscription.id
          and later_payment.barbershop_id = v_subscription.barbershop_id
          and later_payment.scope = 'platform_subscription'
          and later_payment.id <> v_payment.id
          and later_payment.due_date >= v_due_date
          and (
            later_payment.status in ('overdue', 'failed', 'refunded')
            or (
              later_payment.status = 'pending'
              and later_payment.due_date = v_due_date
            )
          )
      ) into v_has_later_blocker;
    end if;

    if v_subscription.status = 'past_due' then
      if v_due_date is null then
        return false;
      end if;

      if v_subscription.current_period_start is null
        and v_subscription.current_period_end is null then
        -- Compatibilidade conservadora com linhas antigas sem período salvo:
        -- só a própria cobrança que estava vencida pode regularizar.
        if v_previous_local_status not in ('overdue', 'failed') then
          return false;
        end if;
      elsif v_due_date is distinct from v_current_start_date
        and v_due_date is distinct from v_current_end_date then
        return false;
      end if;

      if v_has_later_blocker then
        return false;
      end if;

      if v_due_date = v_current_end_date
        or (
          v_subscription.current_period_start is null
          and v_subscription.current_period_end is null
        ) then
        v_target_period_start := v_candidate_start;
        v_target_period_end := v_candidate_end;
      end if;

      v_target_status := 'active';
    elsif v_subscription.status in ('pending', 'trialing', 'active') then
      if v_due_date is not null then
        if v_subscription.status in ('pending', 'trialing')
          and v_current_end_date is not null
          and v_due_date < v_current_end_date then
          return false;
        end if;

        if v_subscription.status in ('pending', 'trialing')
          and v_current_start_date is not null
          and v_due_date < v_current_start_date then
          return false;
        end if;

        if v_has_later_blocker then
          return false;
        end if;

        if v_subscription.current_period_start is null
          or v_candidate_start > v_subscription.current_period_start then
          v_target_period_start := v_candidate_start;
          v_target_period_end := v_candidate_end;
        end if;
      end if;

      if v_subscription.status in ('pending', 'trialing') then
        v_target_status := 'active';
      end if;
    else
      return false;
    end if;

    if v_subscription.gateway_status = 'pending_creation' then
      v_target_gateway_status := 'active';
    end if;

    if v_target_status is not distinct from v_subscription.status
      and v_target_period_start is not distinct from v_subscription.current_period_start
      and v_target_period_end is not distinct from v_subscription.current_period_end
      and v_target_gateway_status is not distinct from v_subscription.gateway_status then
      return false;
    end if;

    update public.subscriptions s
    set status = v_target_status,
        current_period_start = v_target_period_start,
        current_period_end = v_target_period_end,
        gateway_status = v_target_gateway_status
    where s.id = v_subscription.id
      and s.barbershop_id = v_subscription.barbershop_id
      and s.plan_id = v_subscription.plan_id
      and s.status = v_subscription.status
      and s.current_period_start is not distinct from v_subscription.current_period_start
      and s.current_period_end is not distinct from v_subscription.current_period_end;

    return found;
  end if;

  if v_payment.status in ('overdue', 'failed', 'refunded') then
    if v_due_date is not null then
      select exists (
        select 1
        from public.payments later_paid_payment
        where later_paid_payment.subscription_id = v_subscription.id
          and later_paid_payment.barbershop_id = v_subscription.barbershop_id
          and later_paid_payment.scope = 'platform_subscription'
          and later_paid_payment.id <> v_payment.id
          and later_paid_payment.status = 'paid'
          and later_paid_payment.due_date >= v_due_date
      ) into v_has_later_paid;

      if v_has_later_paid then
        return false;
      end if;
    end if;

    if v_subscription.status not in ('pending', 'trialing', 'active') then
      return false;
    end if;

    update public.subscriptions s
    set status = 'past_due'
    where s.id = v_subscription.id
      and s.barbershop_id = v_subscription.barbershop_id
      and s.status = v_subscription.status;

    return found;
  end if;

  return false;
end;
$$;

comment on function public.sync_subscription_from_asaas_payment(uuid) is
  'Sincroniza assinatura e carência a partir do pagamento Asaas atual, com locks de linha e validação de tenant/período.';

revoke all on function public.sync_subscription_from_asaas_payment(uuid)
  from public;
revoke all on function public.sync_subscription_from_asaas_payment(uuid)
  from anon, authenticated;
grant execute on function public.sync_subscription_from_asaas_payment(uuid)
  to service_role;

-- A gravação do pagamento e a sincronização comercial ficam na mesma
-- transação. O chamador envia o snapshot lido; esta função adquire locks na
-- ordem assinatura -> pagamento, valida status/updated_at/metadata e só então
-- persiste e chama a sincronização. Uma falha de trigger ou de sincronização
-- reverte ambas as alterações.
create or replace function public.apply_asaas_payment_transition(
  p_barbershop_id uuid,
  p_subscription_id uuid,
  p_gateway_payment_id text,
  p_amount_cents integer,
  p_status public.payment_status,
  p_method public.payment_method,
  p_due_date date,
  p_paid_at timestamptz,
  p_invoice_url text,
  p_metadata jsonb,
  p_expected_status public.payment_status,
  p_expected_updated_at timestamptz,
  p_expected_metadata jsonb,
  p_sync_subscription boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_payment public.payments%rowtype;
  v_payment_id uuid;
  v_has_payment boolean := false;
  v_previous_state_event text := '';
  v_next_state_event text := '';
  v_next_provider_status text := '';
  v_next_state_status text := '';
  v_restored_from_event text := '';
  v_previous_event_created_at text;
  v_next_event_created_at text;
  v_previous_state_created_at text;
  v_next_state_created_at text;
begin
  if p_barbershop_id is null
    or p_subscription_id is null
    or p_gateway_payment_id is null
    or char_length(p_gateway_payment_id) not between 1 and 120
    or p_amount_cents is null
    or p_amount_cents not between 1 and 100000000
    or p_status is null
    or p_metadata is null
    or jsonb_typeof(p_metadata) <> 'object'
    or p_sync_subscription is null then
    raise exception 'Dados inválidos para transição de cobrança.'
      using errcode = '22023';
  end if;

  if (p_expected_status is null) <> (p_expected_updated_at is null)
    or (p_expected_status is null) <> (p_expected_metadata is null) then
    raise exception 'Snapshot incompleto para compare-and-swap da cobrança.'
      using errcode = '22023';
  end if;

  -- A assinatura é sempre o primeiro lock. Além de serializar transições por
  -- tenant, isso evita conversões concorrentes de KEY SHARE (FK de payments)
  -- para FOR UPDATE em duas inserções simultâneas.
  select s.*
    into v_subscription
  from public.subscriptions s
  where s.id = p_subscription_id
    and s.barbershop_id = p_barbershop_id
    and s.gateway = 'asaas'
  for update;

  if not found then
    return null;
  end if;

  select p.*
    into v_payment
  from public.payments p
  where p.gateway = 'asaas'
    and p.gateway_payment_id = p_gateway_payment_id
  for update;
  v_has_payment := found;

  if v_has_payment then
    -- Não permite reassociar uma chave global do Asaas a outro pagamento/tenant.
    if v_payment.scope <> 'platform_subscription'
      or v_payment.subscription_id is distinct from p_subscription_id
      or v_payment.barbershop_id is distinct from p_barbershop_id then
      return null;
    end if;

    -- Compare-and-swap determinístico: metadata cobre a rara colisão de
    -- timestamps now() idênticos entre transações independentes.
    if p_expected_status is null
      or v_payment.status is distinct from p_expected_status
      or v_payment.updated_at is distinct from p_expected_updated_at
      or v_payment.metadata is distinct from p_expected_metadata then
      return null;
    end if;
    v_previous_state_event := coalesce(
      v_payment.metadata ->> 'asaas_payment_state_event',
      v_payment.metadata ->> 'asaas_event',
      ''
    );
    v_previous_event_created_at :=
      v_payment.metadata ->> 'asaas_event_created_at';
    v_previous_state_created_at :=
      v_payment.metadata ->> 'asaas_payment_state_created_at';
  elsif not v_has_payment then
    if p_expected_status is not null then
      return null;
    end if;
  end if;

  if v_has_payment and p_metadata ->> 'asaas_event' = 'PAYMENT_UPDATED' then
    -- Older payment rows predate the dedicated state metadata fields. For a
    -- details-only update, retain the state evidence from the stored row.
    v_next_state_event := coalesce(
      p_metadata ->> 'asaas_payment_state_event',
      v_payment.metadata ->> 'asaas_payment_state_event',
      v_payment.metadata ->> 'asaas_event',
      ''
    );
    v_next_provider_status := upper(coalesce(
      p_metadata ->> 'asaas_payment_state_provider_status',
      v_payment.metadata ->> 'asaas_payment_state_provider_status',
      v_payment.metadata ->> 'asaas_status',
      p_metadata ->> 'asaas_status',
      ''
    ));
    v_next_state_status := coalesce(
      p_metadata ->> 'asaas_payment_state_status',
      v_payment.metadata ->> 'asaas_payment_state_status',
      p_status::text
    );
  else
    v_next_state_event := coalesce(
      p_metadata ->> 'asaas_payment_state_event',
      p_metadata ->> 'asaas_event',
      ''
    );
    v_next_provider_status := upper(coalesce(
      p_metadata ->> 'asaas_payment_state_provider_status',
      p_metadata ->> 'asaas_status',
      ''
    ));
    v_next_state_status := coalesce(
      p_metadata ->> 'asaas_payment_state_status',
      ''
    );
  end if;
  v_restored_from_event := coalesce(
    p_metadata ->> 'asaas_restored_from_event',
    ''
  );
  v_next_event_created_at := p_metadata ->> 'asaas_event_created_at';
  v_next_state_created_at := p_metadata ->> 'asaas_payment_state_created_at';

  if v_has_payment and v_previous_event_created_at is not null then
    if v_next_event_created_at is null
      or split_part(v_previous_event_created_at, ':', 1)
        <> split_part(v_next_event_created_at, ':', 1)
      or substring(v_next_event_created_at from position(':' in v_next_event_created_at) + 1)
        < substring(v_previous_event_created_at from position(':' in v_previous_event_created_at) + 1) then
      return null;
    end if;
  end if;

  if p_metadata ->> 'asaas_event' = 'PAYMENT_UPDATED' then
    if not v_has_payment
      or v_payment.status not in ('pending', 'overdue', 'failed')
      or p_status is distinct from v_payment.status then
      return null;
    end if;
  elsif v_next_state_status <> p_status::text then
    return null;
  end if;

  if v_has_payment and p_amount_cents is distinct from v_payment.amount_cents
    and (
      p_metadata ->> 'asaas_event' <> 'PAYMENT_UPDATED'
      or v_payment.status not in ('pending', 'overdue', 'failed')
    ) then
    return null;
  end if;

  if v_has_payment and (
    (v_payment.due_date is not null
      and p_due_date is distinct from v_payment.due_date
      and p_metadata ->> 'asaas_event' <> 'PAYMENT_UPDATED')
    or (v_payment.method is not null
      and p_method is distinct from v_payment.method
      and p_metadata ->> 'asaas_event' <> 'PAYMENT_UPDATED')
    or (v_payment.invoice_url is not null
      and p_invoice_url is distinct from v_payment.invoice_url
      and p_metadata ->> 'asaas_event' <> 'PAYMENT_UPDATED')
    or (v_payment.status = 'paid'
      and p_paid_at is distinct from v_payment.paid_at)
  ) then
    return null;
  end if;

  -- A borda financeira que altera status também é validada no PostgreSQL. A
  -- policy TypeScript decide os eventos autorizados; o CAS impede que um
  -- chamador use snapshot obsoleto para ultrapassar estorno/cancelamento.
  if p_status = 'paid' then
    if p_method is not null and p_method not in ('pix', 'boleto') then
      return null;
    end if;

    if not (
      (v_next_state_event = 'PAYMENT_CONFIRMED' and v_next_provider_status = 'CONFIRMED')
      or (v_next_state_event = 'PAYMENT_RECEIVED' and v_next_provider_status = 'RECEIVED')
      or (
        v_next_state_event = 'PAYMENT_REFUND_DENIED'
        and v_next_provider_status in ('CONFIRMED', 'RECEIVED')
      )
    ) then
      return null;
    end if;

    if v_has_payment and v_payment.status = 'cancelled' then
      return null;
    end if;

    if v_has_payment and v_payment.status = 'refunded' then
      if v_next_state_event = 'PAYMENT_REFUND_DENIED' then
        if v_previous_state_event <> 'PAYMENT_REFUND_IN_PROGRESS'
          or v_restored_from_event <> 'PAYMENT_REFUND_IN_PROGRESS'
          or v_previous_state_created_at is null
          or v_next_state_created_at is null
          or split_part(v_previous_state_created_at, ':', 1)
            <> split_part(v_next_state_created_at, ':', 1)
          or substring(v_next_state_created_at from position(':' in v_next_state_created_at) + 1)
            <= substring(v_previous_state_created_at from position(':' in v_previous_state_created_at) + 1) then
          return null;
        end if;
      elsif v_next_state_event in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED') then
        if v_restored_from_event not in (
          'PAYMENT_CHARGEBACK_REQUESTED',
          'PAYMENT_CHARGEBACK_DISPUTE',
          'PAYMENT_AWAITING_CHARGEBACK_REVERSAL'
        ) or v_previous_state_event <> v_restored_from_event then
          return null;
        end if;

        if v_previous_state_created_at is null
          or v_next_state_created_at is null
          or split_part(v_previous_state_created_at, ':', 1)
            <> split_part(v_next_state_created_at, ':', 1)
          or substring(v_next_state_created_at from position(':' in v_next_state_created_at) + 1)
            <= substring(v_previous_state_created_at from position(':' in v_previous_state_created_at) + 1) then
          return null;
        end if;
      else
        return null;
      end if;
    elsif v_restored_from_event <> '' then
      return null;
    end if;

  elsif p_status = 'overdue' then
    if v_next_state_event <> 'PAYMENT_OVERDUE'
      or v_next_provider_status <> 'OVERDUE'
      or (v_has_payment and v_payment.status not in ('pending', 'overdue')) then
      return null;
    end if;
  elsif p_status = 'failed' then
    if v_next_state_event not in (
      'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
      'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'
    )
      or v_next_provider_status not in (
        'FAILED',
        'REPROVED_BY_RISK_ANALYSIS',
        'CREDIT_CARD_CAPTURE_REFUSED'
      )
      or (v_has_payment and v_payment.status not in ('pending', 'overdue', 'failed')) then
      return null;
    end if;
  elsif p_status = 'refunded' then
    if v_next_state_event not in (
      'PAYMENT_REFUNDED',
      'PAYMENT_PARTIALLY_REFUNDED',
      'PAYMENT_REFUND_IN_PROGRESS',
      'PAYMENT_RECEIVED_IN_CASH_UNDONE',
      'PAYMENT_CHARGEBACK_REQUESTED',
      'PAYMENT_CHARGEBACK_DISPUTE',
      'PAYMENT_AWAITING_CHARGEBACK_REVERSAL'
    ) or (v_has_payment and v_payment.status = 'cancelled') then
      return null;
    end if;

    if v_next_state_event = 'PAYMENT_REFUNDED'
      and v_next_provider_status <> 'REFUNDED' then
      return null;
    elsif v_next_state_event = 'PAYMENT_PARTIALLY_REFUNDED'
      and v_next_provider_status <> 'PARTIALLY_REFUNDED' then
      return null;
    elsif v_next_state_event = 'PAYMENT_REFUND_IN_PROGRESS'
      and v_next_provider_status <> 'REFUND_IN_PROGRESS' then
      return null;
    end if;
  elsif p_status = 'cancelled' then
    if v_next_state_event <> 'PAYMENT_DELETED'
      or (v_has_payment and v_payment.status not in ('pending', 'overdue', 'failed', 'cancelled')) then
      return null;
    end if;
  elsif p_status = 'pending' then
    if v_next_state_event not in (
      'PAYMENT_CREATED',
      'PAYMENT_UPDATED',
      'PAYMENT_RESTORED',
      'PAYMENT_AWAITING_RISK_ANALYSIS',
      'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
      'PAYMENT_AUTHORIZED'
    ) then
      return null;
    end if;

    if v_has_payment and v_payment.status = 'cancelled' then
      if v_next_state_event <> 'PAYMENT_RESTORED'
        or v_next_provider_status <> 'PENDING'
        or v_previous_state_event <> 'PAYMENT_DELETED' then
        return null;
      end if;
    elsif v_has_payment and v_payment.status not in ('pending', 'overdue', 'failed') then
      return null;
    end if;
  end if;

  if v_has_payment
    and p_amount_cents is distinct from v_payment.amount_cents
    and p_metadata ->> 'asaas_event' <> 'PAYMENT_UPDATED' then
    return null;
  end if;

  if v_has_payment then
    update public.payments p
    set amount_cents = p_amount_cents,
        status = p_status,
        method = p_method,
        due_date = p_due_date,
        paid_at = p_paid_at,
        invoice_url = p_invoice_url,
        metadata = p_metadata
    where p.id = v_payment.id
    returning p.id into v_payment_id;
  else

    begin
      insert into public.payments (
        barbershop_id,
        subscription_id,
        appointment_id,
        amount_cents,
        status,
        method,
        scope,
        due_date,
        paid_at,
        gateway,
        gateway_payment_id,
        invoice_url,
        metadata
      )
      values (
        p_barbershop_id,
        p_subscription_id,
        null,
        p_amount_cents,
        p_status,
        p_method,
        'platform_subscription',
        p_due_date,
        p_paid_at,
        'asaas',
        p_gateway_payment_id,
        p_invoice_url,
        p_metadata
      )
      returning id into v_payment_id;
    exception
      when unique_violation then
        -- Outra assinatura/evento inseriu primeiro a chave global do gateway.
        return null;
    end;
  end if;

  if p_sync_subscription then
    perform public.sync_subscription_from_asaas_payment(v_payment_id);
  end if;

  return v_payment_id;
end;
$$;

comment on function public.apply_asaas_payment_transition(
  uuid,
  uuid,
  text,
  integer,
  public.payment_status,
  public.payment_method,
  date,
  timestamptz,
  text,
  jsonb,
  public.payment_status,
  timestamptz,
  jsonb,
  boolean
) is
  'Compare-and-swap da cobrança Asaas e sincronização da assinatura na mesma transação PostgreSQL.';

revoke all on function public.apply_asaas_payment_transition(
  uuid,
  uuid,
  text,
  integer,
  public.payment_status,
  public.payment_method,
  date,
  timestamptz,
  text,
  jsonb,
  public.payment_status,
  timestamptz,
  jsonb,
  boolean
) from public, anon, authenticated;
grant execute on function public.apply_asaas_payment_transition(
  uuid,
  uuid,
  text,
  integer,
  public.payment_status,
  public.payment_method,
  date,
  timestamptz,
  text,
  jsonb,
  public.payment_status,
  timestamptz,
  jsonb,
  boolean
) to service_role;
