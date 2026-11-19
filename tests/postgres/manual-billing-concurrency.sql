-- Only on a dedicated B1 database. Both connections use this local cluster's
-- Unix socket. This test commits one synthetic PENDING invoice, never a Pix.
\set ON_ERROR_STOP on
create extension if not exists dblink with schema extensions;
select gen_random_uuid() as shop, gen_random_uuid() as subscription \gset
begin;
insert into public.barbershops(id,slug,name)
values (:'shop','b1-' || :'shop','B1 concurrency');
insert into public.subscriptions(id,barbershop_id,plan_id,gateway,status,invoice_link_key,
  agreement_at,coverage_starts_at,current_period_start,current_period_end,first_competence,
  first_due_at,renewal_anchor_day,due_anchor_day,due_month_offset,due_local_time,contract_timezone,
  agreement_terms,contracted_interval,contracted_price_cents,contracted_currency)
select :'subscription',:'shop',id,'manual_pix','pending',:'shop',now(),
  '2077-01-01Z','2077-01-01Z','2077-02-01Z','2077-01-01','2077-01-02Z',
  1,2,0,'00:00','UTC','Synthetic concurrency fixture','month',100,'BRL'
from public.plans where code='basico';
commit;

select format($insert$
  insert into public.payments(barbershop_id,subscription_id,gateway,invoice_link_key,
    scope,method,status,competence,due_date,due_at,due_timezone,original_amount_cents,amount_cents)
  values (%L,%L,'manual_pix',%L,'platform_subscription','pix','pending','2077-01-01',
    '2077-01-02','2077-01-02Z','UTC',100,100)
$insert$, :'shop', :'subscription', :'shop') as issue_sql \gset
select extensions.dblink_connect('writer_a','dbname=postgres application_name=b1_writer_a');
select extensions.dblink_connect('writer_b','dbname=postgres application_name=b1_writer_b');
select extensions.dblink_exec('writer_a','begin');
select extensions.dblink_exec('writer_a', :'issue_sql');
select extensions.dblink_send_query('writer_b', :'issue_sql');
do $$
declare deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists (
      select from pg_stat_activity a join pg_stat_activity b
        on a.pid = any(pg_blocking_pids(b.pid))
      where a.application_name='b1_writer_a' and b.application_name='b1_writer_b'
    );
    if clock_timestamp() >= deadline then raise exception 'Second writer did not wait'; end if;
    perform pg_sleep(0.025);
  end loop;
  raise notice 'PASS second writer blocked by first';
end $$;
select extensions.dblink_exec('writer_a','commit');
do $$ begin
  perform * from extensions.dblink_get_result('writer_b') as result(command text);
  raise exception 'Both sessions issued the same competence';
exception when unique_violation then raise notice 'PASS competing insert rejected with 23505';
end $$;
select extensions.dblink_disconnect('writer_a'), extensions.dblink_disconnect('writer_b');
select (count(*) = 1 and min(status::text) = 'pending') as one_invoice
from public.payments where subscription_id=:'subscription' \gset
\if :one_invoice
\echo PASS one pending invoice committed
\else
do $$ begin raise exception 'Incorrect final invoice count or state'; end $$;
\endif
