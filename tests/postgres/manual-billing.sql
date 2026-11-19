-- psql -X -v ON_ERROR_STOP=1. Fixtures are synthetic and rolled back.
\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';

create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('b1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- Assert the actual SQLSTATE, not just that "something failed". SELECT/UPDATE
-- row counts distinguish a filtered RLS operation from a permitted mutation.
create function pg_temp.verify(label text, command text, state text default '00000',
  expected_rows int default null) returns void language plpgsql as $$
declare actual text := '00000'; affected bigint;
begin
  begin
    execute command;
    get diagnostics affected = row_count;
  exception when others then actual := sqlstate;
  end;
  if actual <> state or (expected_rows is not null and affected is distinct from expected_rows) then
    raise exception '%: got SQLSTATE %, rows %; expected %, %', label, actual, affected, state, expected_rows;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- Optional pre-migration snapshot, populated only on the upgrade path.
do $$ begin
  if to_regclass('b1_fixture.legacy_rows') is not null then
    perform pg_temp.verify('all pre-existing columns/values retained', $q$
      select l.id from b1_fixture.legacy_rows l left join (
        select id, to_jsonb(s) as current_row from public.subscriptions s
        union all select id, to_jsonb(p) from public.payments p
      ) x on x.id = l.id where x.current_row is null or not l.snapshot <@ x.current_row$q$,'00000',0);
    perform pg_temp.verify('original fixtures present', 'select id from b1_fixture.legacy_rows','00000',3);
  end if;
end $$;

insert into public.barbershops(id, slug, name)
select pg_temp.uid(n), 'b1-shop-' || n, 'B1 Fixture ' || n from generate_series(1,3) n;
insert into auth.users(id) select pg_temp.uid(n) from generate_series(10,12) n;
insert into public.barbershop_members(barbershop_id,user_id,role)
values (pg_temp.uid(1),pg_temp.uid(10),'owner'), (pg_temp.uid(1),pg_temp.uid(11),'staff');

insert into public.subscriptions(id,barbershop_id,plan_id,gateway,status,invoice_link_key,
    agreement_at,coverage_starts_at,current_period_start,current_period_end,first_competence,
    first_due_at,renewal_anchor_day,due_anchor_day,due_month_offset,due_local_time,contract_timezone,agreement_terms,
    contracted_interval,contracted_price_cents,contracted_currency)
select pg_temp.uid(21), pg_temp.uid(1), id, 'manual_pix','pending',pg_temp.uid(1)::text,
    '2026-01-01Z','2026-01-01Z','2026-01-01Z','2026-02-01Z','2026-01-01',
    '2026-01-15 13:00Z',31,31,0,'10:00','America/Sao_Paulo','Synthetic agreement',
    'month',4500,'BRL' from public.plans where code = 'basico';
insert into public.subscriptions(id,barbershop_id,plan_id,gateway,status,invoice_link_key,trial_started_at,trial_ends_at)
select pg_temp.uid(22),pg_temp.uid(2),id,'manual_pix','trialing','uncontracted','2026-01-01Z','2026-01-08Z'
from public.plans where code = 'basico';

create function pg_temp.issue(changes jsonb default '{}') returns void language plpgsql as $$
declare invoice public.payments;
begin
  select * into invoice from jsonb_populate_record(null::public.payments,
    jsonb_build_object('barbershop_id',pg_temp.uid(1),'subscription_id',pg_temp.uid(21),
      'gateway','manual_pix','invoice_link_key',pg_temp.uid(1)::text,'scope','platform_subscription',
      'method','pix','status','pending','competence','2026-01-01','due_date','2026-01-15',
      'due_at','2026-01-15 13:00Z','due_timezone','America/Sao_Paulo',
      'original_amount_cents',4500,'amount_cents',4500) || changes);
  insert into public.payments(barbershop_id,subscription_id,gateway,invoice_link_key,
    scope,method,status,competence,due_date,due_at,due_timezone,original_amount_cents,
    adjustment_cents,adjustment_reason,amount_cents,paid_at,verified_at,verified_by,receipt_reference)
  select invoice.barbershop_id,invoice.subscription_id,invoice.gateway,invoice.invoice_link_key,
    invoice.scope,invoice.method,invoice.status,invoice.competence,invoice.due_date,invoice.due_at,
    invoice.due_timezone,invoice.original_amount_cents,invoice.adjustment_cents,invoice.adjustment_reason,
    invoice.amount_cents,invoice.paid_at,invoice.verified_at,invoice.verified_by,invoice.receipt_reference;
end;
$$;

select pg_temp.verify('no automatic trial or contract debt',
  $$select id from public.payments where gateway='manual_pix' and barbershop_id in (pg_temp.uid(1),pg_temp.uid(2))$$,'00000',0);
select pg_temp.verify('wrong tenant', $$select pg_temp.issue(jsonb_build_object(
  'barbershop_id',pg_temp.uid(2),'invoice_link_key',pg_temp.uid(2)::text))$$,'23503');
select pg_temp.verify('uncontracted trial', $$select pg_temp.issue(jsonb_build_object(
  'subscription_id',pg_temp.uid(22),'barbershop_id',pg_temp.uid(2),'invoice_link_key',pg_temp.uid(2)::text))$$,'23503');
select pg_temp.verify('legacy invoice cannot attach to manual subscription',
  $$insert into public.payments(barbershop_id,subscription_id,scope,amount_cents)
    values(pg_temp.uid(1),pg_temp.uid(21),'platform_subscription',100)$$,'23503');
select pg_temp.verify('cannot use service scope', $$select pg_temp.issue('{"scope":"shop_service"}')$$,'23514');
select pg_temp.verify('invalid original', $$select pg_temp.issue('{"original_amount_cents":-1}')$$,'23514');
select pg_temp.verify('invalid total', $$select pg_temp.issue('{"amount_cents":-1}')$$,'23514');
select pg_temp.verify('unexplained discount', $$select pg_temp.issue('{"adjustment_cents":-1,"amount_cents":4499}')$$,'23514');
select pg_temp.verify('total differs', $$select pg_temp.issue('{"amount_cents":4400}')$$,'23514');
select pg_temp.verify('required method', $$select pg_temp.issue('{"method":null}')$$,'23514');
select pg_temp.verify('first competence', $$select pg_temp.issue('{"competence":"2025-12-01"}')$$,'23514');
select pg_temp.verify('canonical month', $$select pg_temp.issue('{"competence":"2026-01-02"}')$$,'23514');
select pg_temp.verify('required invoice date', $$select pg_temp.issue('{"due_date":null}')$$,'23514');
select pg_temp.verify('agreed cutoff', $$select pg_temp.issue('{"due_at":"2026-01-15 14:00Z"}')$$,'23514');
select pg_temp.verify('Feb 2026 anchored', $$select pg_temp.issue('{"competence":"2026-02-01","due_date":"2026-02-28","due_at":"2026-02-28 13:00Z"}')$$);
select pg_temp.verify('March restores 31', $$select pg_temp.issue('{"competence":"2026-03-01","due_date":"2026-03-28","due_at":"2026-03-28 13:00Z"}')$$,'23514');
select pg_temp.verify('March valid', $$select pg_temp.issue('{"competence":"2026-03-01","due_date":"2026-03-31","due_at":"2026-03-31 13:00Z"}')$$);
select pg_temp.verify('wrong due month', $$select pg_temp.issue('{"competence":"2026-04-01","due_date":"2026-03-31","due_at":"2026-03-31 13:00Z"}')$$,'23514');
select pg_temp.verify('leap February', $$select pg_temp.issue('{"competence":"2028-02-01","due_date":"2028-02-29","due_at":"2028-02-29 13:00Z"}')$$);
select pg_temp.verify('missing settlement evidence', $$select pg_temp.issue('{"status":"paid"}')$$,'23514');
select pg_temp.verify('pending cannot carry credit', $$select pg_temp.issue('{"paid_at":"2026-01-10Z"}')$$,'23514');
select pg_temp.verify('invalid agreement timezone',$$update public.subscriptions set contract_timezone='Invalid/Here' where id=pg_temp.uid(21)$$,'23514');
select pg_temp.verify('invalid period',$$update public.subscriptions set current_period_end=current_period_start where id=pg_temp.uid(21)$$,'23514');

savepoint before_issue;
select pg_temp.verify('invoice with negotiated discount', $$select pg_temp.issue('{"amount_cents":4400,"adjustment_cents":-100,"adjustment_reason":"Fixture"}')$$);
rollback to before_issue;
select pg_temp.verify('rollback restores invoice and audit', $$select id from public.audit_logs where
  action='manual_billing.invoice' and metadata->>'competence'='2026-01-01'
  union all select id from public.payments where competence='2026-01-01'$$,'00000',0);

select pg_temp.verify('first invoice', $$select pg_temp.issue()$$);
select pg_temp.verify('duplicate competence', $$select pg_temp.issue()$$,'23505');
select pg_temp.verify('immutable amount', $$update public.payments set amount_cents=1 where competence='2026-01-01'$$,'23514');
select pg_temp.verify('verified before credit', $$update public.payments set status='paid',paid_at='2026-01-12Z',
  verified_at='2026-01-11Z',verified_by=pg_temp.uid(12) where competence='2026-01-01'$$,'23514');
select pg_temp.verify('trusted fixture settlement', $$update public.payments set status='paid',paid_at='2026-01-11Z',
  verified_at='2026-01-12Z',verified_by=pg_temp.uid(12) where competence='2026-01-01'$$,'00000',1);
select pg_temp.verify('no renewal or anchor drift', $$select id from public.subscriptions where id=pg_temp.uid(21)
  and status='pending' and current_period_end='2026-02-01Z' and renewal_anchor_day=31 and due_anchor_day=31$$,'00000',1);
select pg_temp.verify('cannot erase confirmation', $$update public.payments set status='pending' where competence='2026-01-01'$$,'23514');
select pg_temp.verify('cannot erase paid invoice', $$delete from public.payments where competence='2026-01-01'$$,'23514');

select pg_temp.verify('extra days recorded', $$insert into public.audit_logs
  (barbershop_id,entity_id,entity_type,action,actor_user_id,extension_link_key,metadata)
  values(pg_temp.uid(1),pg_temp.uid(21),'subscription','manual_billing.extend_days',pg_temp.uid(12),
  pg_temp.uid(1)::text,'{"days":2,"reason":"Fixture"}')$$);
select pg_temp.verify('audit append only', $$delete from public.audit_logs where action='manual_billing.extend_days'$$,'23514');

set local role anon;
select pg_temp.verify('anon cannot read payments','select id from public.payments','42501');
select pg_temp.verify('anon cannot write payments','update public.payments set amount_cents=1','42501');
reset role;
set local role authenticated;
do $$
declare actor text; subject uuid; claims jsonb;
begin
  foreach actor in array array['authenticated','owner','staff','platform_admin'] loop
    subject := case actor when 'owner' then pg_temp.uid(10) when 'staff' then pg_temp.uid(11) else pg_temp.uid(12) end;
    claims := jsonb_build_object('sub',subject,'role','authenticated','app_metadata',
      case when actor='platform_admin' then '{"lps_role":"platform_admin"}'::jsonb else '{}'::jsonb end);
    perform set_config('request.jwt.claims',claims::text,true);
    perform pg_temp.verify(actor || ' verified claim',format(
      'select 1 where auth.uid() = %L::uuid and private.is_platform_admin() = %L::boolean',
      subject,actor='platform_admin'),'00000',1);
    if actor in ('owner','staff') then
      perform pg_temp.verify(actor || ' verified tenant membership',format(
        'select 1 where private.has_barbershop_role(pg_temp.uid(1), array[%L]::public.barbershop_member_role[])',
        actor),'00000',1);
    end if;
    perform pg_temp.verify(actor || ' cannot read manual payments',
      'select id from public.payments where gateway=''manual_pix''','00000',0);
    perform pg_temp.verify(actor || ' cannot update manual payment',
      'update public.payments set status=''paid'' where competence=''2026-02-01''','00000',0);
    perform pg_temp.verify(actor || ' cannot modify manual contract',
      'update public.subscriptions set contracted_price_cents=1 where id=pg_temp.uid(21)','00000',0);
    perform pg_temp.verify(actor || ' cannot delete manual contract',
      'delete from public.subscriptions where id=pg_temp.uid(21)','00000',0);
    perform pg_temp.verify(actor || ' cannot insert manual contract',
      'insert into public.subscriptions(barbershop_id,plan_id,gateway,invoice_link_key,status)
       select pg_temp.uid(3),id,''manual_pix'',''uncontracted'',''pending'' from public.plans limit 1','42501');
    perform pg_temp.verify(actor || ' cannot issue manual invoice',
      'select pg_temp.issue()', '42501');
    perform pg_temp.verify(actor || ' cannot execute trigger helpers',
      'select p.oid from pg_proc p where pronamespace=''private''::regnamespace and
        proname in (''check_manual_invoice_schedule'',''check_manual_contract_timezone'',
        ''guard_manual_invoice_history'',''audit_manual_invoice'',''retain_manual_audit'',''quarantine_manual_write'')
        and has_function_privilege(current_user,p.oid,''execute'')','00000',0);
  end loop;
end $$;
reset role;
set local role service_role;
select pg_temp.verify('legacy service cannot mutate manual rows',
  $$update public.subscriptions set contracted_price_cents=1 where id=pg_temp.uid(21)$$,'42501');
select pg_temp.verify('legacy service cannot settle manual Pix',
  $$update public.payments set status='paid' where competence='2026-02-01'$$,'42501');
reset role;
rollback;
