-- LPS Agenda — planos, assinaturas, pagamentos, webhooks, notificações e auditoria

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[a-z0-9_-]+$' and char_length(code) between 2 and 40),
  name text not null
    check (char_length(btrim(name)) between 2 and 80),
  description text
    check (description is null or char_length(description) <= 500),
  price_cents integer not null
    check (price_cents between 0 and 100000000),
  interval public.billing_interval not null default 'month',
  features jsonb not null default '[]'::jsonb
    check (jsonb_typeof(features) = 'array'),
  max_barbers integer
    check (max_barbers is null or max_barbers > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plans is 'Catálogo global de planos. Escrita restrita ao administrador da plataforma.';

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status public.subscription_status not null default 'trialing',
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  gateway text not null default 'asaas'
    check (gateway ~ '^[a-z0-9_-]+$' and char_length(gateway) <= 40),
  gateway_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_check check (
    current_period_start is null
    or current_period_end is null
    or current_period_end > current_period_start
  ),
  constraint subscriptions_gateway_reference_unique unique (gateway, gateway_subscription_id)
);

create index subscriptions_shop_idx on public.subscriptions (barbershop_id);
create unique index subscriptions_one_current_per_shop_idx
  on public.subscriptions (barbershop_id)
  where status in ('trialing', 'active', 'past_due');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  appointment_id uuid,
  amount_cents integer not null
    check (amount_cents between 0 and 100000000),
  status public.payment_status not null default 'pending',
  method public.payment_method,
  due_date date,
  paid_at timestamptz,
  gateway text not null default 'asaas'
    check (gateway ~ '^[a-z0-9_-]+$' and char_length(gateway) <= 40),
  gateway_payment_id text,
  invoice_url text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_gateway_reference_unique unique (gateway, gateway_payment_id),
  constraint payments_appointment_fk
    foreign key (appointment_id, barbershop_id)
    references public.appointments (id, barbershop_id)
    on delete set null (appointment_id)
);

create index payments_shop_idx on public.payments (barbershop_id, created_at desc);
create index payments_status_idx on public.payments (barbershop_id, status);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider ~ '^[a-z0-9_-]+$' and char_length(provider) <= 40),
  event_id text not null
    check (char_length(event_id) between 1 and 200),
  event_type text not null
    check (char_length(event_type) between 1 and 120),
  payload jsonb not null,
  status public.webhook_status not null default 'received',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_events_provider_event_unique unique (provider, event_id)
);

comment on table public.webhook_events is 'Idempotência de webhooks. Sem acesso para usuários comuns; escrita somente por service role.';

create index webhook_events_status_idx on public.webhook_events (status, created_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  title text not null
    check (char_length(btrim(title)) between 2 and 160),
  body text not null
    check (char_length(body) <= 2000),
  channel public.notification_channel not null default 'in_app',
  status public.notification_status not null default 'pending',
  read_at timestamptz,
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_shop_idx on public.notifications (barbershop_id, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid references public.barbershops (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null
    check (char_length(action) between 2 and 120),
  entity_type text not null
    check (char_length(entity_type) between 2 and 80),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  ip_address inet,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is 'Trilha de auditoria imutável para usuários da aplicação.';

create index audit_logs_shop_idx on public.audit_logs (barbershop_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);
