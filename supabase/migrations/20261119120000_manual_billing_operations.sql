-- B2-B. Private operations only. No job, operator membership or data backfill.
create type private.manual_agreement_terms as (
  plan_id uuid, monthly_cents integer, currency text, terms text,
  coverage_start timestamptz, first_month date, first_due timestamptz,
  renewal_day integer, due_day integer, due_month_offset integer, due_time time, zone text
);

-- One global namespace across agreement and issuance, including alternate
-- request keys for the same invoice. Results survive cancellation and retries.
create table private.manual_operation_receipts (
  operation_id uuid primary key,
  request jsonb not null,
  result_id uuid not null
);
revoke all on private.manual_operation_receipts from public,anon,authenticated,service_role;

create function private.manual_operation_result(op uuid, payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare prior private.manual_operation_receipts%rowtype;
begin
  if op is null then raise exception 'Missing operation ID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('billing/' || op::text,0));
  select * into prior from private.manual_operation_receipts where operation_id=op;
  if found and prior.request is distinct from payload then
    raise exception 'Operation already used with different terms' using errcode='22023';
  end if;
  return prior.result_id;
end $$;

create function private.manual_anchor(month_start date, anchor integer) returns date
language sql immutable strict set search_path='' as $$
  select least(month_start + (anchor-1), (month_start+interval '1 month - 1 day')::date)
$$;

create function private.register_manual_agreement(op uuid, shop uuid, agreement private.manual_agreement_terms)
returns uuid language plpgsql security invoker set search_path='' set timezone='UTC' set datestyle='ISO, YMD' as $$
declare
  payload jsonb := jsonb_build_array('agreement',shop,to_jsonb(agreement));
  result uuid := private.manual_operation_result(op,payload);
  first_local timestamp := agreement.coverage_start at time zone agreement.zone;
  next_renewal timestamptz;
  ended_trial uuid;
begin
  if result is not null then return result; end if;
  if (agreement is not null and
      agreement.monthly_cents between 1 and 100000000 and agreement.currency='BRL'
      and length(btrim(agreement.terms)) between 1 and 4000
      and isfinite(agreement.coverage_start) and isfinite(agreement.first_due)
      and isfinite(agreement.first_month) and extract(day from agreement.first_month)=1
      and agreement.renewal_day between 1 and 31 and agreement.due_day between 1 and 31
      and agreement.due_time < time '24:00') is not true then
    raise exception 'Incomplete or invalid agreement' using errcode='22023';
  end if;
  perform 1 from public.barbershops where id=shop for no key update;
  if not found then raise exception 'Unknown shop' using errcode='23503'; end if;
  perform 1 from public.plans where id=agreement.plan_id and is_active for share;
  if not found then
    raise exception 'Unavailable plan' using errcode='22023';
  end if;
  -- Legacy tenants require reconciliation, not implicit conversion. Only a
  -- shop with manual history can enter this operation.
  if not exists(select from public.subscriptions where barbershop_id=shop and gateway='manual_pix')
     or exists(select from public.subscriptions where barbershop_id=shop and gateway<>'manual_pix'
       and status in ('pending','trialing','active','past_due')) then
    raise exception 'Manual enrollment required' using errcode='55000';
  end if;
  if exists(select from public.subscriptions where barbershop_id=shop and gateway='manual_pix'
      and (trial_ends_at>agreement.coverage_start or (agreement_at is not null and
        (status not in ('expired','canceled') or coalesce(case when status='canceled' then canceled_at
           else current_period_end end,'infinity')>agreement.coverage_start)))) then
    raise exception 'Coverage overlaps an existing trial or agreement' using errcode='55000';
  end if;
  if agreement.first_due >= ((private.manual_anchor(
       (agreement.first_month+make_interval(months=>agreement.due_month_offset+1))::date, agreement.due_day)
       + agreement.due_time) at time zone agreement.zone) then
    raise exception 'First maturity must precede the second' using errcode='22023';
  end if;
  update public.subscriptions set status='expired' where barbershop_id=shop and gateway='manual_pix'
    and status='trialing' and trial_ends_at<=clock_timestamp() returning id into ended_trial;
  next_renewal := (private.manual_anchor((date_trunc('month',first_local)+interval '1 month')::date,
    agreement.renewal_day) + first_local::time) at time zone agreement.zone;

  insert into public.subscriptions(barbershop_id,plan_id,gateway,gateway_status,status,invoice_link_key,
    agreement_at,agreement_terms,contracted_price_cents,contracted_currency,contracted_interval,
    coverage_starts_at,current_period_start,current_period_end,first_competence,first_due_at,
    renewal_anchor_day,due_anchor_day,due_month_offset,due_local_time,contract_timezone)
  values(shop,agreement.plan_id,'manual_pix','inactive','pending',shop::text,
    clock_timestamp(),agreement.terms,agreement.monthly_cents,agreement.currency,'month',
    agreement.coverage_start,agreement.coverage_start,next_renewal,agreement.first_month,agreement.first_due,
    agreement.renewal_day,agreement.due_day,agreement.due_month_offset,agreement.due_time,agreement.zone)
  returning id into result;
  insert into private.manual_operation_receipts values(op,payload,result);
  insert into public.audit_logs(barbershop_id,action,entity_type,entity_id,metadata)
  values(shop,'manual_billing.agreement','subscription',result,
    jsonb_build_object('operation_id',op,'previous_trial',ended_trial,'state','pending'));
  return result;
end $$;

-- A change of negotiated terms requires a new agreement. Operational period
-- advancement, cancellation and future authorized settlement retain the snapshot.
create function private.keep_manual_agreement_terms() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (new.plan_id,new.contracted_price_cents,new.contracted_currency,new.contracted_interval,
      new.agreement_at,new.agreement_terms,new.coverage_starts_at,new.first_competence,new.first_due_at,
      new.renewal_anchor_day,new.due_anchor_day,new.due_month_offset,new.due_local_time,new.contract_timezone)
    is distinct from
     (old.plan_id,old.contracted_price_cents,old.contracted_currency,old.contracted_interval,
      old.agreement_at,old.agreement_terms,old.coverage_starts_at,old.first_competence,old.first_due_at,
      old.renewal_anchor_day,old.due_anchor_day,old.due_month_offset,old.due_local_time,old.contract_timezone)
  then raise exception 'Agreed terms are immutable' using errcode='23514'; end if;
  return new;
end $$;
create trigger subscriptions_keep_manual_agreement before update on public.subscriptions
  for each row when (old.gateway='manual_pix' and old.agreement_at is not null)
  execute function private.keep_manual_agreement_terms();

create function private.issue_manual_invoice(op uuid,shop uuid,contract uuid,bill_month date)
returns uuid language plpgsql security invoker set search_path='' set datestyle='ISO, YMD' as $$
declare
  payload jsonb := jsonb_build_array('invoice',shop,contract,bill_month);
  result uuid := private.manual_operation_result(op,payload);
  s public.subscriptions%rowtype;
  offset_months integer;
  first_local timestamp;
  starts timestamptz;
  due timestamptz;
begin
  if result is not null then return result; end if;
  select * into s from public.subscriptions where id=contract and barbershop_id=shop
    and gateway='manual_pix' and agreement_at is not null for update;
  if not found then raise exception 'Manual agreement required' using errcode='23503'; end if;
  if (isfinite(bill_month) and extract(day from bill_month)=1 and bill_month>=s.first_competence) is not true then
    raise exception 'Invalid competence' using errcode='22023';
  end if;
  select id into result from public.payments where subscription_id=contract and barbershop_id=shop
    and gateway='manual_pix' and competence=bill_month;
  if result is null then
    if s.contracted_price_cents is null or s.contracted_price_cents not between 1 and 100000000 then
      raise exception 'No positive agreed amount to bill' using errcode='22023';
    end if;
    offset_months := (extract(year from bill_month)-extract(year from s.first_competence))*12
      + extract(month from bill_month)-extract(month from s.first_competence);
    first_local := s.coverage_starts_at at time zone s.contract_timezone;
    starts := case when offset_months=0 then s.coverage_starts_at else
      (private.manual_anchor((date_trunc('month',first_local)+make_interval(months=>offset_months))::date,
        s.renewal_anchor_day) + first_local::time) at time zone s.contract_timezone end;
    if s.status not in ('pending','active','past_due') or s.canceled_at is not null
      or starts>clock_timestamp() or (s.cancel_at_period_end and clock_timestamp()>=s.current_period_end) then
      raise exception 'Competence outside contract term' using errcode='55000';
    end if;
    due := case when offset_months=0 then s.first_due_at else
      (private.manual_anchor((bill_month+make_interval(months=>s.due_month_offset))::date,s.due_anchor_day)
        + s.due_local_time) at time zone s.contract_timezone end;
    insert into public.payments(barbershop_id,subscription_id,gateway,invoice_link_key,scope,method,status,
      competence,due_date,due_at,due_timezone,original_amount_cents,amount_cents)
    values(shop,contract,'manual_pix',shop::text,'platform_subscription','pix','pending',
      bill_month,(due at time zone s.contract_timezone)::date,due,s.contract_timezone,
      s.contracted_price_cents,s.contracted_price_cents) returning id into result;
  end if;
  insert into private.manual_operation_receipts values(op,payload,result);
  return result;
end $$;

create index payments_manual_due_queue on public.payments(due_at,id)
  where gateway='manual_pix' and status in ('pending','overdue');

create table private.manual_overdue_retry (
  payment_id uuid primary key references public.payments(id), retry_at timestamptz not null,
  error_state text not null, attempts integer not null
);
revoke all on private.manual_overdue_retry from public,anon,authenticated,service_role;

create function private.process_manual_overdue(batch_size integer)
returns table(processed integer, failed integer)
language plpgsql security definer set search_path='' set lock_timeout='500ms' as $$
declare
  item record;
  cutoff timestamptz:=clock_timestamp();
  since_at timestamptz;
  ends_at timestamptz;
begin
  if batch_size is null or batch_size not between 1 and 100 then
    raise exception 'Invalid batch size' using errcode='22023';
  end if;
  processed:=0;
  failed:=0;
  for item in
    select p.id,p.status,p.subscription_id,p.barbershop_id from public.payments p
    join public.subscriptions s on s.id=p.subscription_id and s.barbershop_id=p.barbershop_id
    left join private.manual_overdue_retry r on r.payment_id=p.id
    where p.gateway='manual_pix' and p.scope='platform_subscription' and p.method='pix'
      and p.amount_cents>0 and p.due_at<=cutoff and s.gateway='manual_pix' and s.agreement_at is not null
      and s.status in ('pending','active','past_due') and s.canceled_at is null
      and s.coverage_starts_at<=cutoff and (not s.cancel_at_period_end or cutoff<s.current_period_end)
      and p.competence>=s.first_competence
      and (p.status='pending' or (p.status='overdue' and s.status='active'))
      and (r.retry_at is null or r.retry_at<=cutoff)
    order by p.due_at,p.id limit batch_size for update of s,p skip locked
  loop
    begin
      if item.status='pending' then
        update public.payments set status='overdue' where id=item.id;
      end if;
      -- A first missed payment cannot turn an unactivated contract into grace access.
      update public.subscriptions set status='past_due' where id=item.subscription_id
        and barbershop_id=item.barbershop_id and gateway='manual_pix' and status='active'
        returning past_due_since,grace_period_ends_at into since_at,ends_at;
      if found then
        insert into public.audit_logs(barbershop_id,action,entity_type,entity_id,metadata)
        values(item.barbershop_id,'manual_billing.past_due','subscription',item.subscription_id,
          jsonb_build_object('payment_id',item.id,'past_due_since',since_at,'grace_period_ends_at',ends_at));
      end if;
      delete from private.manual_overdue_retry where payment_id=item.id;
      processed:=processed+1;
    exception when others then
      insert into private.manual_overdue_retry as r values(item.id,clock_timestamp()+interval '1 minute',sqlstate,1)
        on conflict(payment_id) do update set attempts=r.attempts+1,error_state=excluded.error_state,retry_at=excluded.retry_at;
      failed:=failed+1;
    end;
  end loop;
  return next;
end $$;

revoke all on function private.manual_operation_result(uuid,jsonb), private.manual_anchor(date,integer),
  private.register_manual_agreement(uuid,uuid,private.manual_agreement_terms),
  private.keep_manual_agreement_terms(), private.issue_manual_invoice(uuid,uuid,uuid,date),
  private.process_manual_overdue(integer) from public,anon,authenticated,service_role;
create role lps_manual_overdue_worker nologin noinherit;
grant usage on schema private to lps_manual_overdue_worker;
grant execute on function private.process_manual_overdue(integer) to lps_manual_overdue_worker;
