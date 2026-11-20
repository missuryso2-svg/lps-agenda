-- Infrastructure only. Installation schedules nothing and grants no login.
create function private.guard_cutover_subscription() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and old.gateway is distinct from new.gateway then
    raise exception 'Origin changes require reconciliation' using errcode='55000';
  end if;
  if tg_op='INSERT' and new.gateway='asaas' and current_user not in ('postgres','supabase_admin') then
    raise exception 'New Asaas enrollment is closed' using errcode='42501';
  end if;
  if tg_op='UPDATE' and old.gateway='asaas' and (
    current_user in ('anon','authenticated') or old.id<>new.id or old.barbershop_id<>new.barbershop_id
    or (old.status in ('expired','canceled') and new.status not in ('expired','canceled'))
  ) then raise exception 'Legacy subscription requires reconciliation' using errcode='42501'; end if;
  if new.gateway='manual_pix' and new.agreement_at is not null
    and (tg_op='INSERT' or old.agreement_at is distinct from new.agreement_at) and exists (
    select from public.subscriptions where barbershop_id=new.barbershop_id and gateway='asaas'
  ) then raise exception 'Legacy history requires reconciliation' using errcode='55000'; end if;
  return new;
end $$;
revoke all on function private.guard_cutover_subscription() from public,anon,authenticated,service_role;
create trigger cutover_origin before insert or update on public.subscriptions
  for each row execute function private.guard_cutover_subscription();

create function private.guard_manual_issue() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select from private.financial_holds where contract=new.subscription_id and (suspended or needs_reconciliation))
    or exists(select from public.subscriptions where barbershop_id=new.barbershop_id and gateway='asaas') then
    raise exception 'Contract requires financial review' using errcode='55000';
  end if;
  return new;
end $$;
revoke all on function private.guard_manual_issue() from public,anon,authenticated,service_role;
create trigger cutover_invoice before insert on public.payments for each row
  when (new.gateway='manual_pix' and new.scope='platform_subscription') execute function private.guard_manual_issue();

create view private.eligible_overdue as
  select p.id, p.due_at from public.payments p
  join public.subscriptions s on s.id=p.subscription_id and s.barbershop_id=p.barbershop_id
    left join private.manual_overdue_retry r on r.payment_id=p.id
    where p.gateway='manual_pix' and p.scope='platform_subscription' and p.method='pix'
      and p.amount_cents>0 and p.due_at<=statement_timestamp() and s.gateway='manual_pix' and s.agreement_at is not null
      and s.status in ('pending','active','past_due') and s.canceled_at is null
      and s.coverage_starts_at<=statement_timestamp() and (not s.cancel_at_period_end or statement_timestamp()<s.current_period_end)
      and p.competence>=s.first_competence
      and (p.status='pending' or (p.status='overdue' and s.status='active'))
      and (r.retry_at is null or r.retry_at<=statement_timestamp())
    and not exists(select from private.financial_holds h where h.contract=s.id and (h.suspended or h.needs_reconciliation))
    and not exists(select from public.subscriptions legacy where legacy.barbershop_id=s.barbershop_id and legacy.gateway='asaas');
revoke all on private.eligible_overdue from public,anon,authenticated,service_role;

create or replace function private.process_manual_overdue(batch_size integer)
returns table(processed integer, failed integer)
language plpgsql security definer set search_path='' set lock_timeout='500ms' as $$
declare
  item record;
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
    join private.eligible_overdue eligible on eligible.id=p.id
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

create table private.overdue_schedule (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  changed_at timestamptz not null default clock_timestamp()
);
insert into private.overdue_schedule(singleton) values(true);
create table private.overdue_runs (
  started_at timestamptz not null, finished_at timestamptz not null,
  outcome text not null check(outcome in ('ok','partial','failed')),
  processed integer not null, failed integer not null, error_state text
);
create index overdue_runs_finished on private.overdue_runs(finished_at desc);
revoke all on private.overdue_schedule,private.overdue_runs from public,anon,authenticated,service_role;

create function private.run_overdue(batch_size integer) returns text language plpgsql
security definer set search_path='' set lock_timeout='1s' as $$
declare started timestamptz:=clock_timestamp(); n integer:=0; errors integer:=0; outcome text; code text;
begin
  if batch_size is null or batch_size not between 1 and 100 then
    raise exception 'Invalid batch size' using errcode='22023';
  end if;
  if not coalesce((select enabled from private.overdue_schedule where singleton for share), false) then return 'disabled'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('lps/scheduled-manual-overdue',0)) then return 'busy'; end if;
  begin
    select r.processed,r.failed into strict n,errors from private.process_manual_overdue(batch_size) r;
    outcome:=case when errors=0 then 'ok' else 'partial' end;
  exception when others then
    code:=sqlstate; n:=0; errors:=1; outcome:='failed';
  end;
  insert into private.overdue_runs values(started,clock_timestamp(),outcome,n,errors,code);
  return outcome;
end $$;
create role lps_overdue_runner nologin noinherit;
revoke all on function private.run_overdue(integer) from public,anon,authenticated,service_role;
grant usage on schema private to lps_overdue_runner;
grant execute on function private.run_overdue(integer) to lps_overdue_runner;

-- The API owner can read only this aggregate, never the job log or webhook bodies.
create view private.finance_health_summary as
with last_run as (select * from private.overdue_runs order by finished_at desc limit 1),
stats as (select max(finished_at) filter(where outcome='ok') last_ok,
    count(*) filter(where finished_at>=now()-interval '24 hours' and outcome<>'ok') failures_24h,
    coalesce(sum(processed) filter(where finished_at>=now()-interval '24 hours'),0) processed_24h
  from private.overdue_runs),
origins as (select barbershop_id, bool_or(gateway='manual_pix') manual,bool_or(gateway='asaas') legacy,
  count(*) filter(where status in ('active','pending','trialing','past_due')) current_count
  from public.subscriptions group by barbershop_id)
select cfg.enabled worker_enabled, a.enabled trial_db, r.finished_at last_run_at,r.outcome last_result,
  stats.last_ok, stats.processed_24h,stats.failures_24h,
  case when not cfg.enabled then 'disabled'
       when greatest(stats.last_ok,cfg.changed_at)<now()-interval '15 minutes' then 'stale'
       when stats.last_ok is null or stats.last_ok<cfg.changed_at then 'waiting' else 'healthy' end worker_state,
  oldest.due_at oldest_eligible,
  (select count(*) from private.manual_overdue_retry) retries,
  (select count(*) from public.subscriptions where gateway='manual_pix' and status='past_due') past_due,
  (select count(*) from private.financial_holds where needs_reconciliation) review,
  (select count(*) from origins where manual and legacy) mixed,
  (select count(*) from origins where current_count>1) duplicate_current,
  (select count(*) from public.billing_remote_cleanup_jobs where status<>'completed') cleanup,
  (select count(*) from public.webhook_events where provider='asaas' and status in ('failed','received','processing')) webhook_backlog,
  floor(extract(epoch from statement_timestamp()-oldest.due_at)/60)::bigint oldest_eligible_minutes
from private.overdue_schedule cfg cross join private.manual_trial_activation a cross join stats
cross join (select min(due_at) due_at from private.eligible_overdue) oldest left join last_run r on true;
revoke all on private.finance_health_summary from public,anon,authenticated,service_role;
grant select on private.finance_health_summary to lps_financial_api;
grant lps_financial_api to postgres with inherit true, set true;
grant create on schema public to lps_financial_api;
create function public.finance_health() returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.financial_actor();
  return (select to_jsonb(h) from private.finance_health_summary h);
end $$;
alter function public.finance_health() owner to lps_financial_api;
revoke all on function public.finance_health() from public,anon,authenticated,service_role;
grant execute on function public.finance_health() to authenticated;
revoke create on schema public from lps_financial_api;
revoke lps_financial_api from postgres;
