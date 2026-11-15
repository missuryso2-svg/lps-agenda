-- LPS Agenda — Fase 4.1: cobrança recorrente do SaaS via Asaas (sandbox).
-- Migração aditiva: não altera migrations anteriores nem regras de segurança.
-- A mensalidade do LPS Agenda é separada da receita de serviços da barbearia
-- pelo escopo do pagamento e pelo vínculo opcional com a assinatura.

create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null unique references public.barbershops (id) on delete cascade,
  gateway text not null default 'asaas'
    check (gateway ~ '^[a-z0-9_-]+$' and char_length(gateway) <= 40),
  gateway_customer_id text
    check (gateway_customer_id is null or char_length(gateway_customer_id) between 1 and 120),
  person_type text not null
    check (person_type in ('individual', 'company')),
  document_digits text not null
    check (document_digits ~ '^([0-9]{11}|[0-9]{14})$'),
  holder_name text not null
    check (char_length(btrim(holder_name)) between 2 and 120),
  email text
    check (email is null or char_length(email) <= 254),
  phone_digits text
    check (phone_digits is null or phone_digits ~ '^[0-9]{10,11}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customers_document_type_check check (
    (person_type = 'individual' and char_length(document_digits) = 11)
    or (person_type = 'company' and char_length(document_digits) = 14)
  ),
  constraint billing_customers_gateway_reference_unique
    unique (gateway, gateway_customer_id)
);

comment on table public.billing_customers is
  'Pagador da mensalidade do LPS Agenda no gateway. Documento fiscal é dado sensível: leitura restrita ao proprietário e ao admin da plataforma; escrita apenas por service role.';

create trigger billing_customers_set_updated_at
  before update on public.billing_customers
  for each row execute function private.set_updated_at();

alter table public.subscriptions
  add column billing_type public.payment_method,
  add column gateway_status text not null default 'pending_creation',
  add column external_reference uuid not null default gen_random_uuid(),
  add column next_due_date date,
  add column canceled_at timestamptz;

alter table public.subscriptions
  add constraint subscriptions_billing_type_check
    check (billing_type is null or billing_type in ('boleto', 'pix')),
  add constraint subscriptions_gateway_status_check
    check (gateway_status in ('pending_creation', 'active', 'inactive', 'expired'));

comment on column public.subscriptions.gateway_status is
  'Estado da assinatura no gateway. pending_creation indica que o registro local existe mas o ID remoto ainda não foi confirmado.';

create unique index subscriptions_external_reference_key
  on public.subscriptions (external_reference);

-- A assinatura local nasce em pending e passa a contar como vaga ocupada
-- antes da chamada ao gateway, evitando duas contratações concorrentes.
drop index if exists public.subscriptions_one_current_per_shop_idx;
create unique index subscriptions_one_current_per_shop_idx
  on public.subscriptions (barbershop_id)
  where status in ('pending', 'trialing', 'active', 'past_due');

alter table public.payments
  add column scope public.payment_scope not null default 'shop_service';

update public.payments
set scope = 'platform_subscription'
where subscription_id is not null;

alter table public.payments
  add constraint payments_scope_subscription_check check (
    (scope = 'shop_service' and subscription_id is null)
    or (scope = 'platform_subscription' and subscription_id is not null)
  );

create index payments_subscription_idx
  on public.payments (subscription_id, created_at desc)
  where subscription_id is not null;

-- RLS do pagador: leitura para owner (ou admin da plataforma).
-- A escrita é feita exclusivamente pelo servidor com service role, depois da
-- validação explícita de owner na Server Action.
alter table public.billing_customers enable row level security;

create policy billing_customers_select_owner_or_admin
  on public.billing_customers for select to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy billing_customers_insert_admin
  on public.billing_customers for insert to authenticated
  with check ((select private.is_platform_admin()));

create policy billing_customers_update_admin
  on public.billing_customers for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy billing_customers_delete_admin
  on public.billing_customers for delete to authenticated
  using ((select private.is_platform_admin()));

revoke all on table public.billing_customers from anon, authenticated;
grant select on table public.billing_customers to authenticated;
grant all on table public.billing_customers to service_role;
