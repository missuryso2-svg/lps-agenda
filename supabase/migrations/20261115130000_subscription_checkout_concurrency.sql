-- LPS Agenda — concorrência da contratação paga e compensação remota.
--
-- Migração aditiva: não altera migrations anteriores, não remove registros,
-- não apaga assinaturas duplicadas e não cria cobranças. A aplicação usa os
-- campos abaixo exclusivamente pelo cliente administrativo (service role).
--
-- Contexto:
--   1. O índice subscriptions_one_current_per_shop_idx já impede duas linhas
--      correntes (pending/trialing/active/past_due) para a mesma barbearia.
--   2. Ele não impede duas execuções concorrentes reutilizarem a MESMA linha
--      pending e ambas criarem uma recorrência no Asaas. O lease
--      checkout_locked_at fecha essa janela na aplicação.
--   3. A unicidade das contratações pagas pendentes já é garantida pelo
--      índice amplo subscriptions_one_current_per_shop_idx, cujo predicado
--      inclui pending independentemente de trial_ends_at. Não criar outro
--      índice aqui: o predicado específico seria um subconjunto redundante.
--
-- Identificação prévia de conflito (executar manualmente antes de aplicar):
--   select barbershop_id,
--          array_agg(id order by created_at desc) as subscription_ids,
--          count(*) as total
--   from public.subscriptions
--   where status = 'pending'
--     and trial_ends_at is null
--   group by barbershop_id
--   having count(*) > 1;
--
-- Tratamento de conflito:
--   Revisar cada barbearia listada, manter a contratação válida e cancelar as
--   demais pelo fluxo de cancelamento (com auditoria). Não usar DELETE e não
--   escolher vencedor automaticamente. A migração abaixo interrompe a execução
--   se ainda existir qualquer duplicidade.

alter table public.subscriptions
  add column if not exists checkout_locked_at timestamptz,
  add column if not exists checkout_attempted_at timestamptz,
  add column if not exists checkout_attempts integer not null default 0,
  add column if not exists checkout_error text,
  add column if not exists remote_cleanup_pending boolean not null default false;

alter table public.subscriptions
  add constraint subscriptions_checkout_attempts_check
    check (checkout_attempts >= 0),
  add constraint subscriptions_checkout_error_length_check
    check (
      checkout_error is null
      or char_length(checkout_error) <= 500
    );

comment on column public.subscriptions.checkout_locked_at is
  'Lease da contratação paga direta. A atualização condicional impede duas execuções de criarem a mesma recorrência; expira após cinco minutos.';

comment on column public.subscriptions.checkout_attempted_at is
  'Última tentativa de contratação paga direta, para auditoria e reprocessamento.';

comment on column public.subscriptions.checkout_attempts is
  'Quantidade de tentativas de contratação paga direta para a mesma linha.';

comment on column public.subscriptions.checkout_error is
  'Último erro sanitizado da contratação ou da compensação remota.';

comment on column public.subscriptions.remote_cleanup_pending is
  'Verdadeiro quando uma recorrência remota pode ter permanecido ativa após cancelamento/expiração. Bloqueia nova recorrência até a limpeza ser confirmada.';

-- Executar a migration dentro de uma transação. Se a pré-checagem encontrar
-- duplicidade, o raise exception abaixo aborta a aplicação e reverte as
-- colunas e constraints já criadas. Com psql, usar a opção -1; o runner do
-- Supabase já aplica cada migration como uma unidade transacional.
do $$
declare
  duplicated_shops integer;
begin
  select count(*)
    into duplicated_shops
  from (
    select barbershop_id
    from public.subscriptions
    where status = 'pending'
      and trial_ends_at is null
    group by barbershop_id
    having count(*) > 1
  ) duplicated;

  if duplicated_shops > 0 then
    raise exception
      'P3-B: % barbearia(s) com mais de uma contratação paga pendente. Resolva os conflitos antes de aplicar esta migration.',
      duplicated_shops
      using hint = 'Consulte o cabeçalho desta migration. Não apague registros; cancele manualmente as contratações inválidas com auditoria.';
  end if;
end $$;

-- A unicidade de contratações pagas pendentes já é garantida pelo índice
-- subscriptions_one_current_per_shop_idx, que cobre pending independentemente
-- de trial_ends_at. Um índice específico para "pending e trial_ends_at nulo"
-- seria apenas um subconjunto redundante e aumentaria o custo de escrita.
-- Nenhum índice novo é criado por esta migration.
