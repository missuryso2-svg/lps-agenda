-- LPS Agenda — catálogo oficial de planos e período de teste.
-- Migração aditiva: preserva as migrations anteriores e não altera assinaturas
-- ou pagamentos já existentes. O UPSERT usa o slug estável (code) como chave,
-- portanto reaproveita o mesmo registro em reexecuções e mantém o vínculo das
-- assinaturas pelo plan_id.

alter table public.plans
  add column if not exists currency text not null default 'BRL'
    check (currency ~ '^[A-Z]{3}$'),
  add column if not exists trial_days integer not null default 0
    check (trial_days between 0 and 365);

comment on column public.plans.currency is
  'Moeda do preço do plano no padrão ISO 4217. O catálogo oficial usa BRL.';

comment on column public.plans.trial_days is
  'Dias de teste gratuito previstos no catálogo. A operação do trial depende do fluxo de cobrança do gateway.';

insert into public.plans (
  code,
  name,
  description,
  price_cents,
  interval,
  features,
  max_barbers,
  is_active,
  currency,
  trial_days
)
values
  (
    'basico',
    'Básico',
    'Entrada',
    4990,
    'month',
    '["Agenda online","Cadastro de clientes","Cadastro de serviços","Gestão de profissionais","Controle de horários","Painel administrativo"]'::jsonb,
    1,
    true,
    'BRL',
    7
  ),
  (
    'profissional',
    'Profissional',
    'Mais recomendado',
    7990,
    'month',
    '["Agenda online","Cadastro de clientes","Cadastro de serviços","Gestão de profissionais","Controle de horários","Painel administrativo","Relatórios financeiros","Histórico de agendamentos","Indicadores de desempenho","Gestão aprimorada da equipe"]'::jsonb,
    5,
    true,
    'BRL',
    7
  ),
  (
    'premium',
    'Premium',
    'Completo',
    11990,
    'month',
    '["Agenda online","Cadastro de clientes","Cadastro de serviços","Gestão de profissionais","Controle de horários","Painel administrativo","Relatórios financeiros","Histórico de agendamentos","Indicadores de desempenho","Gestão aprimorada da equipe","Relatórios avançados","Indicadores de crescimento","Gestão completa da operação","Prioridade no suporte"]'::jsonb,
    10,
    true,
    'BRL',
    7
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  interval = excluded.interval,
  features = excluded.features,
  max_barbers = excluded.max_barbers,
  is_active = excluded.is_active,
  currency = excluded.currency,
  trial_days = excluded.trial_days,
  updated_at = now();
