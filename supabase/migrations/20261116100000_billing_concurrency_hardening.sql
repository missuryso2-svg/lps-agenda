-- LPS Agenda — fencing independente da finalização de trial e hardening do
-- cancelamento idempotente.
--
-- Depende de 20261115140000_billing_checkout_fencing_and_cleanup.sql e deve ser
-- aplicada como uma única transação. Esta migration não foi aplicada durante
-- a implementação.

alter table public.subscriptions
  add column if not exists trial_finalization_lease_token uuid;

comment on column public.subscriptions.checkout_locked_at is
  'Lease exclusivo de checkout e de alteração remota de plano. Operações concorrentes precisam aguardar ou recuperar um lease expirado.';

comment on column public.subscriptions.checkout_lease_token is
  'Token de fencing do checkout ou da alteração de plano que possui checkout_locked_at.';

comment on column public.subscriptions.trial_finalization_lease_token is
  'Token exclusivo do proprietário atual da finalização do trial. Rotacionado a cada claim ou recuperação e validado em todas as persistências da execução.';

create or replace function public.cancel_subscription_with_cleanup(
  p_subscription_id uuid,
  p_barbershop_id uuid,
  p_cancel_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_job public.billing_remote_cleanup_jobs%rowtype;
  v_reason text;
  v_already_terminal boolean;
  v_has_completed_job boolean := false;
  v_completed_gateway_id text;
  v_pending boolean := false;
  v_job_id uuid;
begin
  v_reason := nullif(btrim(coalesce(p_cancel_reason, '')), '');

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'O motivo do cancelamento deve ter no máximo 500 caracteres.'
      using errcode = '22001';
  end if;

  select *
    into v_subscription
  from public.subscriptions s
  where s.id = p_subscription_id
    and s.barbershop_id = p_barbershop_id
  for update;

  if not found then
    raise exception 'Assinatura não encontrada para esta barbearia.'
      using errcode = 'P0002';
  end if;

  v_already_terminal := v_subscription.status in ('canceled', 'expired');

  select *
    into v_job
  from public.billing_remote_cleanup_jobs j
  where j.subscription_id = v_subscription.id
    and j.status <> 'completed'
  order by j.created_at desc
  limit 1;

  if found then
    v_job_id := v_job.id;

    update public.billing_remote_cleanup_jobs
    set gateway_subscription_id = coalesce(
          gateway_subscription_id,
          v_subscription.gateway_subscription_id
        )
    where id = v_job.id
    returning * into v_job;
  else
    select *
      into v_job
    from public.billing_remote_cleanup_jobs j
    where j.subscription_id = v_subscription.id
      and j.status = 'completed'
    order by j.created_at desc
    limit 1;

    if found then
      v_has_completed_job := true;
      v_completed_gateway_id := v_job.gateway_subscription_id;
    end if;

    if (not v_already_terminal)
      or (
        v_subscription.gateway_subscription_id is not null
        and (
          not v_has_completed_job
          or v_completed_gateway_id is distinct from v_subscription.gateway_subscription_id
        )
      )
    then
      begin
        insert into public.billing_remote_cleanup_jobs (
          subscription_id,
          barbershop_id,
          provider,
          external_reference,
          gateway_subscription_id,
          status,
          next_attempt_at
        )
        values (
          v_subscription.id,
          v_subscription.barbershop_id,
          'asaas',
          v_subscription.external_reference::text,
          v_subscription.gateway_subscription_id,
          'pending',
          now()
        )
        returning * into v_job;

        v_job_id := v_job.id;
      exception
        when unique_violation then
          select *
            into v_job
          from public.billing_remote_cleanup_jobs j
          where j.subscription_id = v_subscription.id
            and j.status <> 'completed'
          order by j.created_at desc
          limit 1;

          if not found then
            raise;
          end if;

          v_job_id := v_job.id;
      end;
    end if;
  end if;

  v_pending := (
    v_job_id is not null
    and exists (
      select 1
      from public.billing_remote_cleanup_jobs j
      where j.id = v_job_id
        and j.status <> 'completed'
    )
  );

  if v_already_terminal then
    update public.subscriptions
    set gateway_status = 'inactive',
        cancel_at_period_end = false,
        checkout_locked_at = null,
        checkout_lease_token = null,
        trial_finalization_locked_at = null,
        trial_finalization_lease_token = null,
        cancel_reason = coalesce(cancel_reason, v_reason),
        remote_cleanup_pending = v_pending
    where id = v_subscription.id
    returning * into v_subscription;
  else
    update public.subscriptions
    set status = 'canceled',
        gateway_status = 'inactive',
        cancel_at_period_end = false,
        canceled_at = coalesce(canceled_at, now()),
        cancel_reason = coalesce(cancel_reason, v_reason),
        checkout_locked_at = null,
        checkout_lease_token = null,
        trial_finalization_locked_at = null,
        trial_finalization_lease_token = null,
        remote_cleanup_pending = v_pending
    where id = v_subscription.id
    returning * into v_subscription;
  end if;

  return jsonb_build_object(
    'subscription_id', v_subscription.id,
    'job_id', v_job_id,
    'status', v_subscription.status,
    'gateway_subscription_id', v_subscription.gateway_subscription_id,
    'remote_cleanup_pending', v_subscription.remote_cleanup_pending,
    'already_terminal', v_already_terminal
  );
end;
$$;

revoke all on function public.cancel_subscription_with_cleanup(uuid, uuid, text)
  from public;
revoke all on function public.cancel_subscription_with_cleanup(uuid, uuid, text)
  from anon;
revoke all on function public.cancel_subscription_with_cleanup(uuid, uuid, text)
  from authenticated;
grant execute on function public.cancel_subscription_with_cleanup(uuid, uuid, text)
  to service_role;
