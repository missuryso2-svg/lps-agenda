-- Read projections only. The C1 registry remains the authority for every RPC.
grant lps_financial_api to postgres with inherit true, set true;
grant create on schema public to lps_financial_api;

create view private.finance_shop_directory with (security_invoker=true) as
select b.id as shop, b.name, owner.full_name as owner,
  coalesce(nullif(b.phone,''),nullif(b.email,''),owner.phone,owner.email) as contact,
  s.id as contract, s.gateway, s.status, p.name as plan, s.contracted_price_cents as monthly_cents,
  case when h.needs_reconciliation or (s.gateway <> 'manual_pix' and s.status in ('pending','active','past_due','trialing')
      and exists(select from public.subscriptions prior where prior.barbershop_id=b.id and prior.gateway='manual_pix'))
      then 'reconcile'
    when s.id is null then 'none'
    when s.gateway='asaas' then 'asaas'
    when s.gateway='manual_pix' and s.agreement_at is not null then 'manual'
    when s.gateway='manual_pix' and s.trial_started_at is not null then 'trial'
    else 'reconcile' end as origin,
  t.trial_started_at as trial_start,t.trial_ends_at as trial_end,s.coverage_starts_at as coverage_start,
  s.first_competence,s.first_due_at,s.renewal_anchor_day,s.due_anchor_day as due_day,s.contract_timezone,
  s.current_period_start,s.current_period_end,coalesce(h.suspended,false) as suspended,
  (select max(pay.verified_at) from public.payments pay where pay.barbershop_id=b.id
    and pay.gateway='manual_pix' and pay.scope='platform_subscription' and pay.status='paid') as last_verified_at
from public.barbershops b
left join lateral (select a.full_name,a.phone,a.email from public.barbershop_members m join public.profiles a on a.id=m.user_id
  where m.barbershop_id=b.id and m.role='owner' and m.is_active order by m.user_id limit 1) owner on true
left join lateral (select sub.* from public.subscriptions sub where sub.barbershop_id=b.id
  order by (sub.status in ('pending','active','past_due','trialing')) desc,
    (sub.gateway='manual_pix') desc, sub.created_at desc, sub.id desc limit 1) s on true
left join lateral (select sub.id,sub.trial_started_at,sub.trial_ends_at from public.subscriptions sub
  where sub.barbershop_id=b.id and sub.gateway='manual_pix' and sub.trial_started_at is not null
  order by sub.trial_started_at desc,sub.created_at desc,sub.id desc limit 1) t on true
left join public.plans p on p.id=s.plan_id left join private.financial_holds h on h.contract=s.id;
revoke all on private.finance_shop_directory from public,anon,authenticated,service_role;
grant select on private.finance_shop_directory to lps_financial_api;

create function public.finance_directory(shop_id uuid default null, name_prefix text default null,
  origin_filter text default null, after_id uuid default null,page_size integer default 30)
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.financial_actor();
  if length(name_prefix)>80 or origin_filter not in ('manual','trial','asaas','none','reconcile') then
    raise exception 'Invalid filter' using errcode='22023'; end if;
  return query select to_jsonb(d) from private.finance_shop_directory d
    where (shop_id is null or d.shop=shop_id) and (after_id is null or d.shop>after_id)
      and (name_prefix is null or starts_with(lower(d.name),lower(name_prefix)))
      and (origin_filter is null or d.origin=origin_filter)
    order by d.shop limit private.finance_page_size(page_size);
end $$;

create or replace function public.finance_shops(after_id uuid default null,page_size integer default 30)
returns setof jsonb language sql security definer set search_path='' as $$
  select * from public.finance_directory(null,null,null,after_id,page_size)
$$;

create function public.finance_capability() returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.financial_actor();
begin
  return (select level from private.financial_operators where user_id=actor and revoked_at is null);
end $$;

create function public.finance_operator_list(after_id uuid default null,page_size integer default 30)
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.financial_actor(true);
  return query select jsonb_build_object('id',grant_id,'user_id',user_id,'level',level,
    'granted_at',granted_at,'revoked_at',revoked_at) from private.financial_operators
    where after_id is null or grant_id>after_id order by grant_id limit private.finance_page_size(page_size);
end $$;

create function public.finance_overview(bill_month date) returns jsonb language plpgsql security definer set search_path='' as $$
declare totals jsonb;
begin
  perform private.financial_actor();
  totals:=public.finance_totals(bill_month,null);
  return totals || jsonb_build_object('shops',(select count(*) from public.barbershops)) ||
    (select jsonb_build_object('active',count(*) filter(where status='active'),
      'pending',count(*) filter(where status='pending'),'past_due',count(*) filter(where status='past_due'))
      from public.subscriptions where gateway='manual_pix' and agreement_at is not null) ||
    (select jsonb_build_object('pending_invoices',count(*) filter(where status='pending'),
      'overdue_invoices',count(*) filter(where status='overdue')) from public.payments
      where gateway='manual_pix' and scope='platform_subscription' and competence=bill_month);
end $$;

-- Describe the invoice's own contract, including when the shop has since recontracted.
create or replace function public.finance_invoices(shop uuid, bill_month date, state public.payment_status,
  after_id uuid default null,page_size integer default 30) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.financial_actor();
  if shop is null and bill_month is null then raise exception 'Tenant or month required' using errcode='22023'; end if;
  return query select jsonb_build_object('id',p.id,'shop',p.barbershop_id,'contract',p.subscription_id,'month',p.competence,
    'state',p.status,'original_cents',p.original_amount_cents,'adjustment_cents',p.adjustment_cents,'reason',p.adjustment_reason,
    'total_cents',p.amount_cents,'due_at',p.due_at,'paid_at',p.paid_at,'verified_at',p.verified_at,
    'shop_name',b.name,'plan',pl.name)
    from public.payments p join public.subscriptions s on s.id=p.subscription_id and s.barbershop_id=p.barbershop_id and s.gateway='manual_pix'
    join public.barbershops b on b.id=p.barbershop_id left join public.plans pl on pl.id=s.plan_id
    where p.gateway='manual_pix' and p.scope='platform_subscription'
      and (shop is null or p.barbershop_id=shop) and (bill_month is null or p.competence=bill_month)
      and (state is null or p.status=state) and (after_id is null or p.id>after_id)
    order by p.id limit private.finance_page_size(page_size);
end $$;

-- One source per cursor. Filters are applied before pagination, including in global searches.
create function public.finance_activity(source_name text, tenant uuid default null, kind text default null, who uuid default null,
  since_at timestamptz default null, until_at timestamptz default null,
  before_at timestamptz default null,before_id uuid default null,page_size integer default 30)
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.financial_actor();
  if (before_at is null)<>(before_id is null) or source_name is null or source_name not in ('journal','events') then
    raise exception 'Invalid history filter' using errcode='22023'; end if;
  return query select to_jsonb(r) from (
    select j.op id,j.shop,j.actor,case when j.action='contract_action' then j.result->>'action' else j.action end action,
      j.recorded_at at,j.result->>'contract' contract,j.result->>'invoice' invoice,
      coalesce(j.result->>'after',j.result->>'state') state,
      case when j.action in ('agreement','contract_action') then j.request->>2 end reason
    from private.financial_journal j where source_name='journal'
    union all
    select a.id,a.barbershop_id,a.actor_user_id,a.action,a.created_at,
      case when a.entity_type='subscription' then a.entity_id::text end,
      case when a.entity_type='payment' then a.entity_id::text end,a.metadata->>'status',null::text
    from public.audit_logs a where source_name='events' and a.action like 'manual!_billing.%' escape '!'
  ) r where (tenant is null or r.shop=tenant) and (kind is null or r.action=kind) and (who is null or r.actor=who)
    and (since_at is null or r.at>=since_at) and (until_at is null or r.at<until_at)
    and (before_at is null or (r.at,r.id)<(before_at,before_id))
    order by r.at desc,r.id desc limit private.finance_page_size(page_size);
end $$;
create index financial_journal_cursor on private.financial_journal(recorded_at desc,op desc);
create index manual_audit_cursor on public.audit_logs(created_at desc,id desc) where action like 'manual!_billing.%' escape '!';
create index manual_pix_last_verified on public.payments(barbershop_id,verified_at desc)
  where gateway='manual_pix' and scope='platform_subscription' and status='paid';

alter function public.finance_directory(uuid,text,text,uuid,integer) owner to lps_financial_api;
revoke all on function public.finance_directory(uuid,text,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.finance_directory(uuid,text,text,uuid,integer) to authenticated;
alter function public.finance_capability() owner to lps_financial_api;
revoke all on function public.finance_capability() from public,anon,authenticated,service_role;
grant execute on function public.finance_capability() to authenticated;
alter function public.finance_operator_list(uuid,integer) owner to lps_financial_api;
revoke all on function public.finance_operator_list(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.finance_operator_list(uuid,integer) to authenticated;
alter function public.finance_overview(date) owner to lps_financial_api;
revoke all on function public.finance_overview(date) from public,anon,authenticated,service_role;
grant execute on function public.finance_overview(date) to authenticated;
alter function public.finance_activity(text,uuid,text,uuid,timestamptz,timestamptz,timestamptz,uuid,integer) owner to lps_financial_api;
revoke all on function public.finance_activity(text,uuid,text,uuid,timestamptz,timestamptz,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.finance_activity(text,uuid,text,uuid,timestamptz,timestamptz,timestamptz,uuid,integer) to authenticated;
-- Apply ACLs with owner privileges after C1 transferred function ownership.
revoke all on function public.finance_operator(uuid,text,text), public.finance_agreement(uuid,uuid,jsonb,text,text),
  public.finance_invoice(uuid,uuid,uuid,date), public.finance_confirm_pix(uuid,uuid,uuid,uuid,integer,timestamptz,boolean,text),
  public.finance_contract_action(uuid,uuid,uuid,text,text), public.finance_totals(date,uuid), public.finance_history(uuid,uuid,integer),
  public.finance_invoices(uuid,date,public.payment_status,uuid,integer), public.finance_shops(uuid,integer) from public,anon,service_role;
grant execute on function public.finance_operator(uuid,text,text), public.finance_agreement(uuid,uuid,jsonb,text,text),
  public.finance_invoice(uuid,uuid,uuid,date), public.finance_confirm_pix(uuid,uuid,uuid,uuid,integer,timestamptz,boolean,text),
  public.finance_contract_action(uuid,uuid,uuid,text,text), public.finance_totals(date,uuid), public.finance_history(uuid,uuid,integer),
  public.finance_invoices(uuid,date,public.payment_status,uuid,integer), public.finance_shops(uuid,integer) to authenticated;
revoke create on schema public from lps_financial_api;
revoke lps_financial_api from postgres;
