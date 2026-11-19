-- Synthetic fixtures only; every row in this suite is rolled back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.check_access(shop uuid, observed timestamptz, state text, reason text)
returns void language plpgsql as $$
declare actual jsonb:=private.booking_access_at(shop,observed);
begin
  if (actual->>'state',actual->>'reason') is distinct from (state,reason)
    or (actual->>'allowed')::boolean is distinct from (state<>'blocked') then
    raise exception 'Expected (%,%) at %, got %',state,reason,observed,actual;
  end if;
  raise notice 'PASS (%,%) at %',state,reason,observed;
end $$;
insert into public.barbershops(name,slug) values ('QA Trial','qa-b2a2-access') returning id as shop \gset
select id as plan from public.plans where code='basico' \gset
select pg_temp.check_access(:'shop',now(),'normal',null);
insert into public.subscriptions(barbershop_id,plan_id,gateway,status,invoice_link_key,trial_started_at,trial_ends_at)
values (:'shop',:'plan','manual_pix','trialing','uncontracted','2026-01-01Z','2026-01-08Z') returning id as trial \gset
select pg_temp.check_access(:'shop','2026-01-07 23:59:59Z','normal','trial');
select pg_temp.check_access(:'shop','2026-01-08 00:00:00Z','blocked','trial_ended');
update public.subscriptions set status='expired' where id=:'trial';
select pg_temp.check_access(:'shop','2026-01-07Z','blocked','no_coverage');
update public.subscriptions set status='canceled' where id=:'trial';
select pg_temp.check_access(:'shop','2026-01-07Z','blocked','no_coverage');
insert into public.subscriptions(barbershop_id,plan_id,gateway,status)
values (:'shop',:'plan','asaas','active') returning id as legacy \gset
select pg_temp.check_access(:'shop',now(),'blocked','mixed_origin');
update public.subscriptions set status='canceled' where id=:'legacy';
insert into public.subscriptions(barbershop_id,plan_id,gateway,status,invoice_link_key,
    agreement_at,coverage_starts_at,current_period_start,current_period_end,first_competence,
    first_due_at,renewal_anchor_day,due_anchor_day,due_month_offset,due_local_time,contract_timezone,agreement_terms,
    contracted_interval,contracted_price_cents,contracted_currency)
values (:'shop',:'plan','manual_pix','pending',:'shop','2026-01-01 12:00Z','2026-01-01 12:00Z',
    '2026-01-01 12:00Z','2026-02-01 12:00Z','2026-01-01','2026-01-15 13:00Z',1,15,0,
    '10:00','America/Sao_Paulo','QA', 'month',4500,'BRL') returning id as contract \gset
select pg_temp.check_access(:'shop','2026-01-20Z','blocked','no_coverage');
update public.subscriptions set status='active' where id=:'contract';
select pg_temp.check_access(:'shop','2026-01-20Z','blocked','no_coverage');
update public.subscriptions set status='past_due' where id=:'contract' returning past_due_since as since \gset
select pg_temp.check_access(:'shop',:'since','blocked','past_due');
insert into public.payments(barbershop_id,subscription_id,gateway,invoice_link_key,scope,method,status,
    competence,due_date,due_at,due_timezone,original_amount_cents,amount_cents)
values (:'shop',:'contract','manual_pix',:'shop','platform_subscription','pix','overdue','2026-01-01',
  '2026-01-15','2026-01-15 13:00Z','America/Sao_Paulo',4500,4500) returning id as invoice \gset
select pg_temp.check_access(:'shop',:'since'::timestamptz+interval '72 hours'-interval '1 second','grace','past_due');
select pg_temp.check_access(:'shop',:'since'::timestamptz+interval '72 hours','blocked','past_due');
insert into auth.users(id) values(gen_random_uuid()) returning id as reviewer \gset
update public.payments set status='paid',paid_at='2026-01-17Z',verified_at='2026-01-18Z',verified_by=:'reviewer'
where id=:'invoice';
update public.subscriptions set status='active' where id=:'contract';
select pg_temp.check_access(:'shop','2026-01-17Z','blocked','no_coverage');
select pg_temp.check_access(:'shop','2026-01-20Z','normal','paid');
update public.subscriptions set current_period_start='2026-02-01 12:00Z',current_period_end='2026-03-01 12:00Z' where id=:'contract';
select pg_temp.check_access(:'shop','2026-02-20Z','blocked','no_coverage');
insert into public.barbershops(name,slug) values ('QA Legacy','qa-b2a2-legacy') returning id as old_shop \gset
insert into public.subscriptions(barbershop_id,plan_id,gateway,status) values (:'old_shop',:'plan','asaas','past_due')
returning grace_period_ends_at as cutoff \gset
select pg_temp.check_access(:'old_shop',:'cutoff'::timestamptz-interval '1 microsecond','grace',null);
select pg_temp.check_access(:'old_shop',:'cutoff','blocked',null);
rollback;
