-- LPS Agenda — motivo do cancelamento da assinatura da plataforma.
-- Migração aditiva: preserva o histórico existente e segue o mesmo padrão de
-- `appointments.cancel_reason` (texto livre, opcional, limitado a 500 chars).
--
-- `canceled_at` já existe desde a migração de billing. O motivo é gravado pelo
-- servidor no cancelamento do trial ou da assinatura remota e nunca é enviado
-- ao navegador como fonte de autorização.

alter table public.subscriptions
  add column if not exists cancel_reason text;

alter table public.subscriptions
  add constraint subscriptions_cancel_reason_length_check
    check (
      cancel_reason is null
      or char_length(cancel_reason) <= 500
    );

comment on column public.subscriptions.cancel_reason is
  'Motivo informado pelo proprietário ao cancelar o teste ou a assinatura. Texto opcional de até 500 caracteres; nunca é usado para autorização.';
