-- LPS Agenda — fencing do checkout pago e outbox de compensação remota.
--
-- Migração aditiva: não altera migrations anteriores, não remove registros e
-- não cria cobranças. A tabela de jobs é operacional, acessível apenas pelo
-- cliente administrativo (service role), e a função de cancelamento roda como
-- security definer com search_path vazio e nomes totalmente qualificados.
--
-- P3-D: checkout_lease_token
--   Cada claim grava um UUID exclusivo. Persistência, liberação e registro de
--   erro condicionam a atualização a esse token. Uma execução antiga que perca
--   o lease não sobrescreve o vínculo remoto nem libera o lock da execução
--   atual.
--
-- P3-E: billing_remote_cleanup_jobs
--   A intenção de compensação é gravada na mesma transação da transição local
--   para canceled/expired. remote_cleanup_pending continua sendo um sinal
--   rápido, mas a outbox é a fonte durável de verdade. O processador só marca
--   um job como completed após confirmar a remoção no Asaas.
--
-- Schedule recomendado para o worker (ativação operacional posterior):
--   GET /api/cron/billing-compensation a cada 5 minutos, com o mesmo segredo
--   BILLING_CRON_SECRET/CRON_SECRET da finalização de trial.
--
-- Pré-condições:
--   1. A migration 20261115130000_subscription_checkout_concurrency.sql já
--      deve estar aplicada (colunas de checkout e remote_cleanup_pending).
--   2. A migration deve rodar em transação. Com psql, usar -1; o runner do
--      Supabase já aplica cada migration como unidade transacional.

alter table public.subscriptions
  add column if not exists checkout_lease_token uuid;

comment on column public.subscriptions.checkout_lease_token is
  'Token exclusivo do proprietário atual do lease de checkout pago. Rotacionado ao recuperar lease expirado; nulo após liberação ou cancelamento.';

create table public.billing_remote_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null
    references public.subscriptions (id) on delete restrict,
  barbershop_id uuid not null
    references public.barbershops (id) on delete cascade,
  provider text not null default 'asaas'
    check (provider ~ '^[a-z0-9_-]+$' and char_length(provider) <= 40),
  external_reference text not null
    check (char_length(btrim(external_reference)) between 1 and 120),
  gateway_subscription_id text
    check (
      gateway_subscription_id is null
      or char_length(gateway_subscription_id) between 1 and 120
    ),
  status text not null default 'pending'
    check (
      status in ('pending', 'processing', 'retry', 'completed', 'manual_review')
    ),
  attempts integer not null default 0
    check (attempts >= 0),
  locked_at timestamptz,
  lease_token uuid,
  next_attempt_at timestamptz not null default now(),
  last_error text
    check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint billing_remote_cleanup_jobs_lease_check
    check ((locked_at is null) = (lease_token is null)),
  constraint billing_remote_cleanup_jobs_completion_check
    check ((status = 'completed') = (completed_at is not null)),
  constraint billing_remote_cleanup_jobs_processing_check
    check (status <> 'processing' or locked_at is not null)
);

comment on table public.billing_remote_cleanup_jobs is
  'Outbox durável de compensação de recorrências remotas. Fonte de verdade para bloquear nova contratação enquanto existir job não resolvido.';

comment on column public.billing_remote_cleanup_jobs.status is
  'pending/retry são elegíveis ao worker; processing está sob lease; completed exige confirmação remota; manual_review exige intervenção humana.';

-- Um único job aberto por assinatura. Jobs completed permanecem no histórico e
-- não impedem a criação de um novo job caso uma recorrência tardia apareça.
create unique index if not exists billing_remote_cleanup_jobs_one_open_per_subscription_idx
  on public.billing_remote_cleanup_jobs (subscription_id)
  where status <> 'completed';

create index if not exists billing_remote_cleanup_jobs_due_idx
  on public.billing_remote_cleanup_jobs (status, next_attempt_at);

create index if not exists billing_remote_cleanup_jobs_stale_idx
  on public.billing_remote_cleanup_jobs (status, locked_at);

create index if not exists billing_remote_cleanup_jobs_shop_idx
  on public.billing_remote_cleanup_jobs (barbershop_id, status);

create trigger billing_remote_cleanup_jobs_set_updated_at
  before update on public.billing_remote_cleanup_jobs
  for each row execute function private.set_updated_at();

-- Converte sinais legados de remote_cleanup_pending em intenção durável. Sem
-- isso, um bloqueio antigo ficaria sem job correspondente e não poderia ser
-- confirmado nem liberado automaticamente. A operação é aditiva e idempotente.
insert into public.billing_remote_cleanup_jobs (
  subscription_id,
  barbershop_id,
  provider,
  external_reference,
  gateway_subscription_id,
  status,
  next_attempt_at
)
select
  s.id,
  s.barbershop_id,
  'asaas',
  s.external_reference::text,
  s.gateway_subscription_id,
  'pending',
  now()
from public.subscriptions s
where s.remote_cleanup_pending = true
  and not exists (
    select 1
    from public.billing_remote_cleanup_jobs j
    where j.subscription_id = s.id
      and j.status <> 'completed'
  );

alter table public.billing_remote_cleanup_jobs enable row level security;

-- Sem policies e sem grants para o navegador/authenticated. O service role
-- bypassa RLS por design e é o único executor do worker e da RPC.
revoke all on table public.billing_remote_cleanup_jobs from public;
revoke all on table public.billing_remote_cleanup_jobs from anon;
revoke all on table public.billing_remote_cleanup_jobs from authenticated;
grant select, insert, update, delete
  on public.billing_remote_cleanup_jobs to service_role;

-- Cancela a assinatura e grava a intenção de compensação na mesma transação.
-- Se qualquer instrução falhar, nem o status terminal nem o job persistem.
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

  -- Apenas um job aberto por assinatura (índice parcial unique). O lock da
  -- linha de subscriptions serializa chamadas concorrentes desta função.
  select *
    into v_job
  from public.billing_remote_cleanup_jobs j
  where j.subscription_id = v_subscription.id
    and j.status <> 'completed'
  order by j.created_at desc
  limit 1;

  if found then
    v_job_id := v_job.id;

    -- Preserva o status e o próximo retry já definidos pelo worker. Um ID
    -- remoto tardio pode preencher o campo vazio, desde que o job seja da
    -- mesma assinatura (external_reference é único por contratação).
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

    -- Cria um novo job quando ainda há possibilidade de recorrência remota:
    -- assinatura não terminal ou vínculo local sem job concluído equivalente.
    -- Cancelamento já terminal e sem vínculo remoto não gera job.
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
    -- Idempotência: preserva canceled/expired, mas invalida qualquer lease de
    -- checkout remanescente e atualiza o sinal rápido conforme a outbox.
    update public.subscriptions
    set checkout_locked_at = null,
        checkout_lease_token = null,
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
