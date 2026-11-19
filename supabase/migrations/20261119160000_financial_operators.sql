-- Human financial authority is independent of membership and JWT metadata.
create role lps_financial_api nologin noinherit;
grant lps_financial_api to postgres with inherit false, set true;
grant usage on schema private,public to lps_financial_api;

create table private.financial_operators (
  grant_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  level text not null check(level in ('operator','manager')),
  granted_at timestamptz not null default clock_timestamp(),
  granted_by uuid references auth.users(id),
  infrastructure_identity text,
  grant_reason text not null check(length(btrim(grant_reason)) between 1 and 300),
  revoked_at timestamptz, revoked_by uuid references auth.users(id), revoke_reason text,
  check(num_nonnulls(granted_by,infrastructure_identity)=1),
  check(num_nonnulls(revoked_at,revoked_by,revoke_reason) in (0,3))
);
create unique index financial_operator_current on private.financial_operators(user_id) where revoked_at is null;

create table private.financial_journal (
  op uuid primary key,
  actor uuid not null references auth.users(id),
  action text not null, shop uuid not null references public.barbershops(id),
  request jsonb not null, result jsonb not null,
  recorded_at timestamptz not null default clock_timestamp()
);
create index financial_journal_shop_time on private.financial_journal(shop,recorded_at);
create table private.financial_holds (
  contract uuid primary key references public.subscriptions(id), suspended boolean not null,
  needs_reconciliation boolean not null default false
);
revoke all on private.financial_operators,private.financial_journal,private.financial_holds from public,anon,authenticated,service_role;
grant select,insert on private.financial_operators,private.financial_journal,private.financial_holds to lps_financial_api;
grant update(revoked_at,revoked_by,revoke_reason) on private.financial_operators to lps_financial_api;
grant update(suspended,needs_reconciliation) on private.financial_holds to lps_financial_api;

create function private.bootstrap_financial_manager(target uuid, reason text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  lock table private.financial_operators in share row exclusive mode;
  if exists(select from private.financial_operators) then raise exception 'Bootstrap closed' using errcode='55000'; end if;
  insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason)
    values(target,'manager',session_user,reason) returning grant_id into result;
  return result;
end $$;
revoke all on function private.bootstrap_financial_manager(uuid,text) from public,anon,authenticated,service_role;

create function private.financial_actor(manager_only boolean default false) returns uuid
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=private.trial_onboarding_actor();
begin
  perform 1 from private.financial_operators where user_id=actor and revoked_at is null
    and (not manager_only or level='manager') for share;
  if not found then raise exception 'Financial authorization required' using errcode='42501'; end if;
  return actor;
end $$;
create function public.finance_operator(target uuid, permission text, reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid; result uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('lps/operator-management',0));
  actor:=private.financial_actor(true);
  if target=actor or target is null then raise exception 'Independent manager required' using errcode='42501'; end if;
  if reason is null or length(btrim(reason)) not between 1 and 300 then raise exception 'Reason required' using errcode='22023'; end if;
  if permission='revoke' then
    update private.financial_operators set revoked_at=clock_timestamp(),revoked_by=actor,revoke_reason=reason
      where user_id=target and revoked_at is null returning grant_id into result;
    if not found then raise exception 'No active grant' using errcode='55000'; end if;
  else
    insert into private.financial_operators(user_id,level,granted_by,grant_reason)
      values(target,permission,actor,reason) returning grant_id into result;
  end if;
  return result;
end $$;

-- The definer is not a member of any API role and owns no tables. The B1
-- quarantine remains the trigger for all original identities.
create or replace trigger b1_quarantine before insert or update or delete on public.subscriptions
  for each row when(current_user <> 'lps_financial_api') execute function private.quarantine_manual_write();
create or replace trigger b1_quarantine before insert or update or delete on public.payments
  for each row when(current_user <> 'lps_financial_api') execute function private.quarantine_manual_write();

alter policy subscriptions_manual_quarantine on public.subscriptions
  using(gateway<>'manual_pix' or current_user='lps_financial_api')
  with check(gateway<>'manual_pix' or current_user in ('lps_trial_onboarding','lps_financial_api'));
alter policy payments_manual_quarantine on public.payments
  using(gateway<>'manual_pix' or current_user='lps_financial_api')
  with check(gateway<>'manual_pix' or current_user='lps_financial_api');
alter policy audit_logs_manual_quarantine on public.audit_logs
  using(action not like 'manual!_billing.%' escape '!' or current_user='lps_financial_api')
  with check(action not like 'manual!_billing.%' escape '!' or current_user='lps_financial_api');

grant select on public.subscriptions,public.payments, public.plans,public.barbershops,public.barbershop_members to lps_financial_api;
grant select(id,full_name,email,phone) on public.profiles to lps_financial_api;
grant select on public.audit_logs to lps_financial_api;
create policy finance_sub_read on public.subscriptions for select to lps_financial_api using(true);
create policy finance_pay_read on public.payments for select to lps_financial_api using(gateway='manual_pix' and scope='platform_subscription');
create policy finance_shop_read on public.barbershops for select to lps_financial_api using(true);
create policy finance_plan_read on public.plans for select to lps_financial_api using(true);
create policy finance_member_read on public.barbershop_members for select to lps_financial_api using(role='owner' and is_active);
create policy finance_profile_read on public.profiles for select to lps_financial_api using(exists(select from public.barbershop_members m where m.user_id=profiles.id and m.role='owner' and m.is_active));
create policy finance_audit_read on public.audit_logs for select to lps_financial_api using(action like 'manual!_billing.%' escape '!');
-- PostgreSQL requires UPDATE privilege and a USING policy for row locks used by B2-B.
grant update(id) on public.barbershops,public.plans to lps_financial_api;
create policy finance_shop_lock on public.barbershops for update to lps_financial_api using(true) with check(false);
create policy finance_plan_lock on public.plans for update to lps_financial_api using(true) with check(false);
grant insert(barbershop_id,plan_id,gateway,gateway_status,status,invoice_link_key,
    agreement_at,agreement_terms,contracted_price_cents,contracted_currency,contracted_interval,
    coverage_starts_at,current_period_start,current_period_end,first_competence,first_due_at,
    renewal_anchor_day,due_anchor_day,due_month_offset,due_local_time,contract_timezone),
  update(status,current_period_start,current_period_end,canceled_at,cancel_reason) on public.subscriptions to lps_financial_api;
grant insert(barbershop_id,subscription_id,gateway,invoice_link_key,scope,method,status,
      competence,due_date,due_at,due_timezone,original_amount_cents,amount_cents),
  update(status,paid_at,verified_at,verified_by,receipt_reference) on public.payments to lps_financial_api;
grant insert(barbershop_id,actor_user_id,action,entity_type,entity_id,metadata) on public.audit_logs to lps_financial_api;
create policy finance_sub_insert on public.subscriptions for insert to lps_financial_api with check(gateway='manual_pix' and status='pending');
create policy finance_sub_update on public.subscriptions for update to lps_financial_api using(gateway='manual_pix') with check(gateway='manual_pix');
create policy finance_pay_insert on public.payments for insert to lps_financial_api with check(gateway='manual_pix' and status='pending');
create policy finance_pay_update on public.payments for update to lps_financial_api using(gateway='manual_pix') with check(gateway='manual_pix');
create policy finance_audit_insert on public.audit_logs for insert to lps_financial_api with check(action like 'manual!_billing.%' escape '!');
-- Service credentials bypass RLS on legacy tables. Manual audit events must
-- originate in the financial transaction, including when called through a definer.
create function private.guard_financial_audit_origin() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'lps_financial_api' and
    (current_user in ('anon','authenticated','service_role') or session_user in ('anon','authenticated','service_role')
     or current_setting('role',true) in ('anon','authenticated','service_role')) then
    raise exception 'Financial journal authority required' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_financial_audit_origin() from public,anon,authenticated,service_role;
create trigger audit_logs_manual_origin before insert or update on public.audit_logs
  for each row when (new.action like 'manual!_billing.%' escape '!') execute function private.guard_financial_audit_origin();
grant select,insert on private.manual_operation_receipts to lps_financial_api;
grant execute on function private.trial_onboarding_actor(),private.manual_operation_result(uuid,jsonb),
  private.register_manual_agreement(uuid,uuid,private.manual_agreement_terms),private.issue_manual_invoice(uuid,uuid,uuid,date),
  private.manual_anchor(date,integer),private.lock_booking_access(uuid,boolean) to lps_financial_api;

-- B1 audit triggers run as invoker. The bound actor helper resolves auth.uid()
-- without needing USAGE on the Supabase-owned auth schema for the new role.
create or replace function private.audit_manual_invoice() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor uuid;
begin
  if current_user='lps_financial_api' then actor:=private.trial_onboarding_actor(); else actor:=auth.uid(); end if;
  insert into public.audit_logs(barbershop_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(new.barbershop_id,coalesce(actor,new.verified_by),'manual_billing.invoice','payment',new.id,
      jsonb_build_object('previous_status',old.status,'status',new.status,'competence',new.competence,
        'amount_cents',new.amount_cents,'paid_at',new.paid_at,'verified_at',new.verified_at));
  return new;
end $$;

create function private.finance_replay(key uuid,who uuid,kind text,tenant uuid,args jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous private.financial_journal%rowtype;
begin
  if key is null then raise exception 'Operation ID required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('finance/'||key::text,0));
  select * into previous from private.financial_journal where op=key;
  if found and (previous.actor,previous.action,previous.shop,previous.request) is distinct from
      (who,kind,tenant,args) then raise exception 'Operation conflict' using errcode='22023'; end if;
  return previous.result;
end $$;
create function public.finance_agreement(op uuid,shop uuid,terms jsonb,reference text,reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.financial_actor(); args jsonb:=jsonb_build_array(terms,reference,reason);
  result jsonb:=private.finance_replay(op,actor,'agreement',shop,args); contract uuid;
begin
  if result is not null then return result; end if;
  if (length(btrim(reference)) between 1 and 120 and length(btrim(reason)) between 1 and 300) is not true
    or jsonb_typeof(terms) is distinct from 'object' or terms - array['plan_id','monthly_cents','currency','terms',
      'coverage_start','first_month','first_due','renewal_day','due_day','due_month_offset','due_time','zone'] <> '{}'::jsonb
    then raise exception 'Invalid agreement details' using errcode='22023'; end if;
  contract:=private.register_manual_agreement(op,shop,jsonb_populate_record(null::private.manual_agreement_terms,terms));
  result:=jsonb_build_object('contract',contract,'state','pending');
  insert into private.financial_journal(op,actor,action,shop,request,result) values(op,actor,'agreement',shop,args,result);
  return result;
end $$;
create function public.finance_invoice(op uuid,shop uuid,contract uuid,competence date) returns jsonb
language plpgsql security definer set search_path='' set datestyle='ISO, YMD' as $$
declare actor uuid:=private.financial_actor(); args jsonb:=jsonb_build_array(contract,competence);
  result jsonb:=private.finance_replay(op,actor,'issue',shop,args); bill uuid;
begin
  if result is not null then return result; end if;
  bill:=private.issue_manual_invoice(op,shop,contract,competence);
  result:=jsonb_build_object('invoice',bill,'contract',contract);
  insert into private.financial_journal(op,actor,action,shop,request,result) values(op,actor,'issue',shop,args,result);
  return result;
end $$;

create unique index payments_confirmed_pix_reference on public.payments(lower(btrim(receipt_reference)))
  where gateway='manual_pix' and status='paid' and receipt_reference is not null;
create index payments_manual_month_shop on public.payments(competence,barbershop_id,id)
  where gateway='manual_pix' and scope='platform_subscription';

alter function private.booking_access_at(uuid,timestamptz) rename to booking_access_before_holds;
create function private.booking_access_at(shop uuid, at_time timestamptz) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.booking_access_before_holds(shop,at_time) ||
    case when exists(select from private.financial_holds h join public.subscriptions s on s.id=h.contract
      where s.barbershop_id=shop and s.gateway='manual_pix' and s.status in ('pending','active','past_due') and h.suspended)
    then jsonb_build_object('allowed',false,'state','blocked','reason','suspended','seconds_remaining',null)
    when exists(select from private.financial_holds h join public.subscriptions s on s.id=h.contract
      where s.barbershop_id=shop and s.gateway='manual_pix' and s.status in ('pending','active','past_due') and h.needs_reconciliation)
    then jsonb_build_object('allowed',false,'state','blocked','reason','no_coverage','seconds_remaining',null)
    else '{}'::jsonb end
$$;
revoke all on function private.booking_access_at(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.booking_access_at(uuid,timestamptz) to lps_financial_api;

-- Caller holds the subscription lock. Only a paid current competence can
-- advance coverage. Dates come from the original wall-clock renewal anchor.
create function private.reconcile_manual_coverage(s public.subscriptions, observed timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
declare
  first_local timestamp:=s.coverage_starts_at at time zone s.contract_timezone;
  local_now timestamp:=observed at time zone s.contract_timezone;
  month_start date:=date_trunc('month',local_now)::date;
  period_start timestamptz; period_end timestamptz; current_competence date;
begin
  if s.status not in ('pending','active','past_due') or s.canceled_at is not null or observed<s.coverage_starts_at
     or exists(select from private.financial_holds where contract=s.id and suspended)
     or exists(select from public.payments where subscription_id=s.id and barbershop_id=s.barbershop_id and gateway='manual_pix'
       and status in ('pending','overdue') and amount_cents>0 and due_at<=observed) then return false; end if;
  if month_start>date_trunc('month',first_local)::date and observed <
      ((private.manual_anchor(month_start,s.renewal_anchor_day)+first_local::time) at time zone s.contract_timezone)
    then month_start:=(month_start-interval '1 month')::date; end if;
  period_start:=case when month_start=date_trunc('month',first_local)::date then s.coverage_starts_at else
    (private.manual_anchor(month_start,s.renewal_anchor_day)+first_local::time) at time zone s.contract_timezone end;
  period_end:=(private.manual_anchor((month_start+interval '1 month')::date,s.renewal_anchor_day)+first_local::time)
    at time zone s.contract_timezone;
  current_competence:=(s.first_competence + age(month_start::timestamp,date_trunc('month',first_local)))::date;
  if (s.cancel_at_period_end and period_end>s.current_period_end) or not exists(
    select from public.payments p where p.subscription_id=s.id and p.barbershop_id=s.barbershop_id
      and p.gateway='manual_pix' and p.competence=current_competence and p.status='paid' and p.verified_at<=observed)
    then return false; end if;
  update public.subscriptions set status='active',current_period_start=period_start,current_period_end=period_end where id=s.id;
  update private.financial_holds set needs_reconciliation=false where contract=s.id and needs_reconciliation;
  return true;
end $$;

create function public.finance_confirm_pix(op uuid,shop uuid,contract uuid,invoice uuid,received_cents integer,
  credited_at timestamptz,checked boolean,reference text default null) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' set datestyle='ISO, YMD' as $$
declare actor uuid:=private.financial_actor(); ref text:=nullif(lower(btrim(reference)),'');
  args jsonb:=jsonb_build_array(contract,invoice,received_cents,credited_at,checked,ref);
  result jsonb:=private.finance_replay(op,actor,'confirm_pix',shop,args);
  s public.subscriptions%rowtype; p public.payments%rowtype; observed timestamptz; covered boolean; prior_access boolean;
begin
  if result is not null then return result; end if;
  if checked is not true or credited_at is null or not isfinite(credited_at) or credited_at>clock_timestamp()
    or (ref is not null and ref !~ '^[a-z0-9][a-z0-9._/-]{0,119}$') then
    raise exception 'Bank credit verification required' using errcode='22023'; end if;
  select * into strict s from public.subscriptions where id=contract and barbershop_id=shop and gateway='manual_pix'
    and agreement_at is not null for update;
  select * into strict p from public.payments where id=invoice and barbershop_id=shop and subscription_id=contract
    and gateway='manual_pix' and scope='platform_subscription' and method='pix' for update;
  if p.status not in ('pending','overdue') then raise exception 'Invoice already closed' using errcode='55000'; end if;
  if received_cents is distinct from p.amount_cents or received_cents<=0 then
    raise exception 'Exact positive invoice amount required' using errcode='22023'; end if;
  observed:=clock_timestamp();
  prior_access:=(private.booking_access_at(shop,observed)->>'allowed')::boolean;
  update public.payments set status='paid',paid_at=credited_at,verified_at=observed,verified_by=actor,receipt_reference=ref where id=p.id;
  covered:=private.reconcile_manual_coverage(s,observed);
  if not covered and not prior_access and s.status='active' then
    insert into private.financial_holds(contract,suspended,needs_reconciliation) values(s.id,false,true)
      on conflict on constraint financial_holds_pkey do update set needs_reconciliation=true;
  end if;
  result:=jsonb_build_object('contract',contract,'invoice',invoice,'before',p.status,'after','paid',
    'contract_before',s.status,'contract_after',case when covered then 'active' else s.status::text end,
    'verified_at',observed,'coverage_confirmed',covered);
  insert into private.financial_journal(op,actor,action,shop,request,result) values(op,actor,'confirm_pix',shop,args,result);
  return result;
end $$;

create function public.finance_contract_action(op uuid,shop uuid,contract uuid,command text,reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.financial_actor(); args jsonb:=jsonb_build_array(contract,command,reason);
  result jsonb:=private.finance_replay(op,actor,'contract_action',shop,args); s public.subscriptions%rowtype;
  held boolean;
begin
  if result is not null then return result; end if;
  if command is null or command not in ('suspend','resume','cancel') or
    (length(btrim(reason)) between 1 and 300) is not true then raise exception 'Command and reason required' using errcode='22023'; end if;
  select * into strict s from public.subscriptions where id=contract and barbershop_id=shop and gateway='manual_pix'
    and agreement_at is not null and status in ('active','past_due','pending') for update;
  perform private.lock_booking_access(shop,true);
  held:=exists(select from private.financial_holds where financial_holds.contract=s.id and suspended);
  if command='cancel' then
    update public.subscriptions set status='canceled',canceled_at=clock_timestamp(),cancel_reason=reason where id=s.id;
  elsif command='suspend' and not held then
    insert into private.financial_holds(contract,suspended) values(s.id,true) on conflict on constraint financial_holds_pkey do update set suspended=true;
  elsif command='resume' and held then
    update private.financial_holds set suspended=false where financial_holds.contract=s.id;
    if not private.reconcile_manual_coverage(s,clock_timestamp()) then raise exception 'Current paid coverage required' using errcode='55000'; end if;
  else raise exception 'Incompatible contract state' using errcode='55000'; end if;
  result:=jsonb_build_object('contract',s.id,'before',s.status,'was_suspended',held,'action',command,
    'after',case command when 'cancel' then 'canceled' when 'resume' then 'active' else s.status::text end,
    'suspended',command='suspend');
  insert into private.financial_journal(op,actor,action,shop,request,result) values(op,actor,'contract_action',shop,args,result);
  return result;
end $$;

create function private.finance_page_size(n integer) returns integer
language plpgsql immutable security invoker set search_path='' as $$
begin
  if n is null or n not between 1 and 100 then raise exception 'Invalid page size' using errcode='22023'; end if;
  return n;
end $$;
create function public.finance_shops(after_id uuid default null,page_size integer default 30)
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.financial_actor();
  return query select jsonb_build_object('shop',b.id,'name',b.name,'owner',owner.full_name,
    'contact',coalesce(b.phone,b.email,owner.phone,owner.email),'contract',s.id,'status',s.status,'gateway',s.gateway,
    'plan',p.name,'monthly_cents',s.contracted_price_cents,'trial_start',t.trial_started_at,'trial_end',t.trial_ends_at,
    'due_day',s.due_anchor_day,'suspended',coalesce(h.suspended,false),'last_verified_at',
    (select max(verified_at) from public.payments where barbershop_id=b.id and status='paid'))
    from (select id,name,phone,email from public.barbershops where after_id is null or id>after_id
      order by id limit private.finance_page_size(page_size)) b
    left join lateral(select a.full_name,a.phone,a.email from public.barbershop_members m join public.profiles a on a.id=m.user_id
      where m.barbershop_id=b.id and m.role='owner' and m.is_active limit 1) owner on true
    left join lateral(select * from public.subscriptions where barbershop_id=b.id
      order by (status in ('pending','active','past_due','trialing')) desc,created_at desc,id desc limit 1) s on true
    left join lateral(select trial_started_at,trial_ends_at from public.subscriptions where barbershop_id=b.id and trial_ends_at is not null limit 1) t on true
    left join public.plans p on p.id=s.plan_id left join private.financial_holds h on h.contract=s.id order by b.id;
end $$;
create function public.finance_invoices(shop uuid, bill_month date, state public.payment_status,
  after_id uuid default null,page_size integer default 30) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.financial_actor();
  if shop is null and bill_month is null then raise exception 'Tenant or month required' using errcode='22023'; end if;
  return query select jsonb_build_object('id',p.id,'shop',p.barbershop_id,'contract',p.subscription_id,'month',p.competence,
    'state',p.status,'original_cents',p.original_amount_cents,'adjustment_cents',p.adjustment_cents,'reason',p.adjustment_reason,
    'total_cents',p.amount_cents,'due_at',p.due_at,'paid_at',p.paid_at,'verified_at',p.verified_at)
    from public.payments p where p.gateway='manual_pix' and p.scope='platform_subscription'
      and (shop is null or p.barbershop_id=shop) and (bill_month is null or p.competence=bill_month)
      and (state is null or p.status=state) and (after_id is null or p.id>after_id)
    order by p.id limit private.finance_page_size(page_size);
end $$;
create function public.finance_totals(bill_month date,shop uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.financial_actor();
  if (isfinite(bill_month) and extract(day from bill_month)=1) is not true then raise exception 'Month required' using errcode='22023'; end if;
  return (select jsonb_build_object('received_cents',coalesce(sum(amount_cents) filter(where status='paid'),0),
    'open_cents',coalesce(sum(amount_cents) filter(where status in ('pending','overdue')),0))
    from public.payments where gateway='manual_pix' and scope='platform_subscription' and competence=bill_month
      and (shop is null or barbershop_id=shop));
end $$;
create function public.finance_history(shop uuid,after_id uuid default null,page_size integer default 30) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.financial_actor();
  return query select jsonb_build_object('op',j.op,'actor',j.actor,'action',j.action,'at',j.recorded_at,'result',j.result,
    'reason',case j.action when 'contract_action' then j.request->2 when 'agreement' then j.request->2 end)
    from private.financial_journal j where j.shop=finance_history.shop and (after_id is null or j.op>after_id)
    order by j.op limit private.finance_page_size(page_size);
end $$;

create function public.finance_events(shop uuid,after_id uuid default null,page_size integer default 30) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.financial_actor();
  return query select jsonb_build_object('id',a.id,'actor',a.actor_user_id,'action',a.action,'at',a.created_at,
    'entity',a.entity_id,'type',a.entity_type,'state',a.metadata->>'status','previous',a.metadata->>'previous_status',
    'month',a.metadata->>'competence','amount_cents',a.metadata->'amount_cents','op',a.metadata->>'operation_id')
    from public.audit_logs a where a.barbershop_id=shop and a.action like 'manual!_billing.%' escape '!'
      and (after_id is null or a.id>after_id) order by a.id limit private.finance_page_size(page_size);
end $$;
revoke all on function private.financial_actor(boolean),
  private.finance_replay(uuid,uuid,text,uuid,jsonb),
  private.finance_page_size(integer),
  private.reconcile_manual_coverage(public.subscriptions,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.financial_actor(boolean),
  private.finance_replay(uuid,uuid,text,uuid,jsonb),
  private.finance_page_size(integer),
  private.reconcile_manual_coverage(public.subscriptions,timestamptz) to lps_financial_api;
grant create on schema public to lps_financial_api;
revoke all on function public.finance_events(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.finance_events(uuid,uuid,integer) to authenticated;
alter function public.finance_events(uuid,uuid,integer) owner to lps_financial_api;
alter function public.finance_operator(uuid,text,text) owner to lps_financial_api;
alter function public.finance_agreement(uuid,uuid,jsonb,text,text) owner to lps_financial_api;
alter function public.finance_invoice(uuid,uuid,uuid,date) owner to lps_financial_api;
alter function public.finance_confirm_pix(uuid,uuid,uuid,uuid,integer,timestamptz,boolean,text) owner to lps_financial_api;
alter function public.finance_contract_action(uuid,uuid,uuid,text,text) owner to lps_financial_api;
alter function public.finance_shops(uuid,integer) owner to lps_financial_api;
alter function public.finance_invoices(uuid,date,public.payment_status,uuid,integer) owner to lps_financial_api;
alter function public.finance_totals(date,uuid) owner to lps_financial_api;
alter function public.finance_history(uuid,uuid,integer) owner to lps_financial_api;
revoke create on schema public from lps_financial_api;
revoke all on function public.finance_operator(uuid,text,text),
  public.finance_agreement(uuid,uuid,jsonb,text,text),
  public.finance_invoice(uuid,uuid,uuid,date),
  public.finance_confirm_pix(uuid,uuid,uuid,uuid,integer,timestamptz,boolean,text),
  public.finance_contract_action(uuid,uuid,uuid,text,text),
  public.finance_shops(uuid,integer),
  public.finance_invoices(uuid,date,public.payment_status,uuid,integer),
  public.finance_totals(date,uuid),
  public.finance_history(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.finance_operator(uuid,text,text),
  public.finance_agreement(uuid,uuid,jsonb,text,text),
  public.finance_invoice(uuid,uuid,uuid,date),
  public.finance_confirm_pix(uuid,uuid,uuid,uuid,integer,timestamptz,boolean,text),
  public.finance_contract_action(uuid,uuid,uuid,text,text),
  public.finance_shops(uuid,integer),
  public.finance_invoices(uuid,date,public.payment_status,uuid,integer),
  public.finance_totals(date,uuid),
  public.finance_history(uuid,uuid,integer) to authenticated;
revoke lps_financial_api from postgres;
