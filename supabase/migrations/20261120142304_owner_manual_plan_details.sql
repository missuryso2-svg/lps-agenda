-- Extend the existing owner projection in place, retaining its ACL and return type.
create or replace function public.get_owner_manual_trial(p_shop uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  observed timestamptz := clock_timestamp();
  access jsonb;
  result jsonb;
begin
  if not private.has_barbershop_role(p_shop, array['owner']::public.barbershop_member_role[]) then
    raise exception 'Acesso restrito ao proprietário' using errcode='42501';
  end if;
  access := private.booking_access_at(p_shop, observed);
  if not (access->>'manual')::boolean then return null; end if;

  select jsonb_build_object(
    'plan', plan.name, 'next_step', 'contact_lps',
    'access', access->>'state', 'reason', access->>'reason',
    'trial_start', trial.trial_started_at, 'trial_end', trial.trial_ends_at,
    'trial_state', case when trial.id is null then null when trial.status='canceled' then 'canceled'
                        when access->>'reason'='trial' then 'running' else 'ended' end,
    'days_left', case when access->>'reason'='trial'
                      then ceil(extract(epoch from trial.trial_ends_at-observed)/86400) else 0 end,
    'status', s.status,
    'agreement', case when s.agreement_at is not null and access->>'reason' <> 'mixed_origin'
      then jsonb_build_object(
        'monthly_cents', s.contracted_price_cents,
        'period_start', s.current_period_start, 'period_end', s.current_period_end,
        'first_due_at', s.first_due_at,
        'outstanding_due_at', (select min(p.due_at) from public.payments p
          where p.barbershop_id=p_shop and p.subscription_id=s.id and p.gateway='manual_pix'
            and p.scope='platform_subscription' and p.status in ('pending','overdue'))
      ) end
  ) into result
  from (select 1) anchor
  left join lateral (
    select sub.* from public.subscriptions sub
    where sub.barbershop_id=p_shop and sub.gateway='manual_pix'
    order by (sub.status in ('pending','trialing','active','past_due')) desc,
             sub.created_at desc, sub.id desc limit 1
  ) s on true
  left join public.plans plan on plan.id=s.plan_id
  left join lateral (
    select t.id,t.status,t.trial_started_at,t.trial_ends_at from public.subscriptions t
    where t.barbershop_id=p_shop and t.gateway='manual_pix' and t.trial_ends_at is not null
    order by t.trial_started_at desc,t.id desc limit 1
  ) trial on true;
  return result;
end $$;
