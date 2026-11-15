-- LPS Agenda — operação do período de teste gratuito.
-- Migração aditiva: não altera migrations anteriores, não cria cobranças e
-- mantém o histórico das assinaturas existentes.
--
-- O trial é local. A assinatura no Asaas só é criada quando o período termina,
-- pela rotina protegida /api/cron/trial-finalization. Os campos abaixo guardam
-- o valor contratado, o controle de concorrência e a trilha de auditoria da
-- finalização.

alter table public.subscriptions
  add column if not exists trial_started_at timestamptz,
  add column if not exists contracted_price_cents integer,
  add column if not exists contracted_currency text,
  add column if not exists contracted_interval public.billing_interval,
  add column if not exists trial_finalization_locked_at timestamptz,
  add column if not exists trial_finalization_attempted_at timestamptz,
  add column if not exists trial_finalization_attempts integer not null default 0,
  add column if not exists trial_finalization_error text,
  add column if not exists trial_finalized_at timestamptz;

alter table public.subscriptions
  add constraint subscriptions_contracted_price_check
    check (
      contracted_price_cents is null
      or contracted_price_cents between 0 and 100000000
    ),
  add constraint subscriptions_contracted_currency_check
    check (
      contracted_currency is null
      or contracted_currency ~ '^[A-Z]{3}$'
    ),
  add constraint subscriptions_trial_finalization_attempts_check
    check (trial_finalization_attempts >= 0),
  add constraint subscriptions_trial_error_length_check
    check (
      trial_finalization_error is null
      or char_length(trial_finalization_error) <= 500
    ),
  add constraint subscriptions_trial_window_check
    check (
      trial_ends_at is null
      or trial_started_at is null
      or trial_ends_at > trial_started_at
    );

comment on column public.subscriptions.trial_started_at is
  'Início do período de teste gratuito. O trial é sempre local e não cria assinatura no gateway.';

comment on column public.subscriptions.contracted_price_cents is
  'Preço contratado no início do trial ou da contratação, preservado mesmo se o catálogo mudar.';

comment on column public.subscriptions.contracted_currency is
  'Moeda do preço contratado, no padrão ISO 4217.';

comment on column public.subscriptions.contracted_interval is
  'Ciclo contratado, preservado para a primeira cobrança após o trial.';

comment on column public.subscriptions.trial_finalization_locked_at is
  'Lease da rotina de finalização. Evita que duas execuções criem a mesma assinatura no Asaas.';

comment on column public.subscriptions.trial_finalization_attempted_at is
  'Última tentativa de finalização do trial.';

comment on column public.subscriptions.trial_finalization_attempts is
  'Quantidade de tentativas de finalização do trial, para auditoria e reprocessamento.';

comment on column public.subscriptions.trial_finalization_error is
  'Último erro sanitizado da finalização. O reprocessamento usa external_reference para evitar duplicidade.';

comment on column public.subscriptions.trial_finalized_at is
  'Momento em que a assinatura remota foi confirmada e vinculada ao registro local.';

-- Regra de negócio: uma barbearia só pode ter um registro de trial em toda a
-- vida. O índice parcial também protege contra duas requisições concorrentes
-- que tentem iniciar o teste ao mesmo tempo. Uma contratação paga posterior
-- (trial_ends_at nulo) continua permitida.
create unique index if not exists subscriptions_one_trial_per_shop_idx
  on public.subscriptions (barbershop_id)
  where trial_ends_at is not null;

-- Busca dos trials vencidos que ainda não foram reivindicados.
create index if not exists subscriptions_trial_due_idx
  on public.subscriptions (trial_ends_at)
  where status = 'trialing' and trial_ends_at is not null;

-- Busca das finalizações que falharam e precisam de reprocessamento.
create index if not exists subscriptions_trial_retry_idx
  on public.subscriptions (trial_ends_at)
  where
    status = 'pending'
    and trial_ends_at is not null
    and gateway_subscription_id is null;
