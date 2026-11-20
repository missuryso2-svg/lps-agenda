-- Run with a read-only infrastructure connection. No identities or provider payloads.
with by_shop as (
  select barbershop_id, bool_or(gateway='manual_pix') manual, bool_or(gateway='asaas') legacy,
    count(*) filter (where status in ('pending','trialing','active','past_due')) current_count
  from public.subscriptions group by barbershop_id
)
select
  (select count(*) from supabase_migrations.schema_migrations) migrations,
  (select max(version) from supabase_migrations.schema_migrations) latest_migration,
  (select enabled from private.manual_trial_activation) onboarding_db,
  exists(select from pg_extension where extname='pg_cron') pg_cron,
  (select count(*) from private.financial_operators where revoked_at is null and level='manager') managers,
  (select count(*) from private.financial_operators where revoked_at is null and level='operator') operators,
  (select count(*) from public.subscriptions where gateway='asaas') asaas_total,
  (select count(*) from public.subscriptions where gateway='asaas' and status in ('active','pending','past_due','trialing')) asaas_current,
  (select count(*) from public.subscriptions where gateway='asaas' and status='canceled') asaas_canceled,
  (select count(*) from public.subscriptions where gateway='manual_pix' and agreement_at is not null) manual_agreements,
  (select count(*) from public.subscriptions where gateway='manual_pix' and trial_started_at is not null) manual_trials,
  (select count(*) from public.subscriptions where gateway='manual_pix' and status='trialing' and now()>=trial_started_at and now()<trial_ends_at) live_trials,
  (select count(*) from public.subscriptions where gateway='manual_pix' and status='past_due') manual_past_due,
  (select count(*) from public.payments where scope='platform_subscription') invoices,
  (select count(*) from public.payments where gateway='manual_pix' and scope='platform_subscription' and status='paid' and verified_at is not null) verified_pix,
  (select count(*) from private.financial_holds where suspended) suspended,
  (select count(*) from private.financial_holds where needs_reconciliation) reconciliation_holds,
  (select count(*) from by_shop where manual and legacy) mixed_history_shops,
  (select count(*) from by_shop where current_count>1) duplicate_current_shops,
  (select count(*) from public.payments where scope='platform_subscription' and gateway='asaas' and status in ('pending','overdue')) legacy_open,
  (select count(*) from public.payments p join public.subscriptions s on s.id=p.subscription_id
    where p.scope='platform_subscription' and s.status in ('canceled','expired') and p.paid_at>coalesce(s.canceled_at,s.current_period_end,s.trial_ends_at)) paid_after_end,
  (select count(*) from public.webhook_events where provider='asaas') asaas_webhooks,
  (select count(*) from public.webhook_events where provider='asaas' and status in ('received','processing','failed')) webhook_backlog,
  (select count(*) from public.webhook_events where provider='asaas' and status='failed') webhook_failed,
  (select count(*) from public.billing_remote_cleanup_jobs where status<>'completed') cleanup_open,
  (select count(*) from private.manual_overdue_retry) retry_queue,
  (select count(*) from private.financial_journal) operator_journal,
  (select count(*) from public.audit_logs where action like 'manual_billing.%') manual_audit;
