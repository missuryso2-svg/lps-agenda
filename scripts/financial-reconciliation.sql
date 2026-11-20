-- Restricted infrastructure report. Keep the tenant/contract identifiers in the incident record.
with origins as (
  select barbershop_id, bool_or(gateway='manual_pix') manual, bool_or(gateway='asaas') legacy,
    count(*) filter(where status in ('pending','active','past_due','trialing')) current_count
  from public.subscriptions group by barbershop_id
), invoices as (
  select p.subscription_id,p.barbershop_id,
    count(*) filter(where p.status in ('pending','overdue')) open_items,
    count(*) filter(where p.status='paid' and s.status in ('canceled','expired') and
      p.paid_at > coalesce(s.canceled_at,s.current_period_end,s.trial_ends_at)) late_receipts,
    count(*) filter(where p.status='paid' and s.status in ('canceled','expired') and
      coalesce(s.canceled_at,s.current_period_end,s.trial_ends_at) is null) unknown_end_receipts
  from public.payments p join public.subscriptions s on s.id=p.subscription_id
  where p.scope='platform_subscription'
  group by p.subscription_id,p.barbershop_id
)
select s.barbershop_id,s.id contract_id,s.gateway,s.status,
  case when s.gateway='asaas' then 'legacy' when s.agreement_at is not null then 'agreement'
    when s.trial_ends_at is not null then 'trial' else 'unclassified' end record_kind,
  o.manual and o.legacy mixed_history,o.current_count>1 conflicting_current,
  coalesce(i.open_items,0) open_items, coalesce(i.late_receipts,0) late_receipts,
  coalesce(i.unknown_end_receipts,0) unknown_end_receipts,
  coalesce(h.suspended,false) suspended,coalesce(h.needs_reconciliation,false) requires_review
from public.subscriptions s join origins o using(barbershop_id)
left join invoices i on i.subscription_id=s.id and i.barbershop_id=s.barbershop_id
left join private.financial_holds h on h.contract=s.id
order by s.barbershop_id,s.created_at,s.id;
