-- LPS Agenda — Fase 4.1: valores de enum para cobrança recorrente via Asaas.
-- Migração aditiva. Os novos valores só podem ser usados na migração seguinte,
-- porque ALTER TYPE ... ADD VALUE não permite uso no mesmo transação.

alter type public.subscription_status add value if not exists 'pending' before 'trialing';
alter type public.payment_status add value if not exists 'overdue' after 'pending';
alter type public.payment_method add value if not exists 'boleto' before 'pix';
alter type public.webhook_status add value if not exists 'processing' before 'processed';

-- Separa receita de serviços da barbearia da mensalidade do próprio LPS Agenda.
create type public.payment_scope as enum ('shop_service', 'platform_subscription');
