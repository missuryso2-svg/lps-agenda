-- I3: allow a first manual agreement only for a truly unenrolled shop, and
-- provide tenant-scoped, public-read storage for normalized shop logos.

create or replace function private.register_manual_agreement(
  op uuid,
  shop uuid,
  agreement private.manual_agreement_terms
)
returns uuid
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
set datestyle = 'ISO, YMD'
as $$
declare
  payload jsonb := jsonb_build_array('agreement', shop, to_jsonb(agreement));
  result uuid := private.manual_operation_result(op, payload);
  first_local timestamp := agreement.coverage_start at time zone agreement.zone;
  next_renewal timestamptz;
  ended_trial uuid;
begin
  if result is not null then
    return result;
  end if;

  if (agreement is not null
      and agreement.monthly_cents between 1 and 100000000
      and agreement.currency = 'BRL'
      and length(btrim(agreement.terms)) between 1 and 4000
      and isfinite(agreement.coverage_start)
      and isfinite(agreement.first_due)
      and isfinite(agreement.first_month)
      and extract(day from agreement.first_month) = 1
      and agreement.renewal_day between 1 and 31
      and agreement.due_day between 1 and 31
      and agreement.due_time < time '24:00') is not true then
    raise exception 'Incomplete or invalid agreement' using errcode = '22023';
  end if;

  perform 1 from public.barbershops where id = shop for no key update;
  if not found then
    raise exception 'Unknown shop' using errcode = '23503';
  end if;

  perform 1 from public.plans where id = agreement.plan_id and is_active for share;
  if not found then
    raise exception 'Unavailable plan' using errcode = '22023';
  end if;

  -- Legacy Asaas history remains quarantined. A truly unenrolled shop has no
  -- subscription rows at all; an existing manual trial/agreement may re-enter
  -- only when its prior coverage has ended.
  if exists (
      select from public.subscriptions
      where barbershop_id = shop
        and gateway <> 'manual_pix'
    ) then
    raise exception 'Manual enrollment required' using errcode = '55000';
  end if;

  if exists (
    select from public.subscriptions
    where barbershop_id = shop and gateway = 'manual_pix'
      and status = 'trialing' and trial_ends_at > clock_timestamp()
  ) then
    raise exception 'Manual trial is still active' using errcode = '55000';
  end if;

  if exists (
    select from public.subscriptions s
    join private.financial_holds h on h.contract = s.id
    where s.barbershop_id = shop and h.needs_reconciliation
  ) then
    raise exception 'Legacy history requires reconciliation' using errcode = '55000';
  end if;

  if exists (
    select from public.subscriptions
    where barbershop_id = shop and gateway = 'manual_pix'
      and (trial_ends_at > agreement.coverage_start or (agreement_at is not null and
        (status not in ('expired', 'canceled') or coalesce(
          case when status = 'canceled' then canceled_at else current_period_end end,
          'infinity') > agreement.coverage_start)))
  ) then
    raise exception 'Coverage overlaps an existing trial or agreement' using errcode = '55000';
  end if;

  if agreement.first_due >= ((private.manual_anchor(
      (agreement.first_month + make_interval(months => agreement.due_month_offset + 1))::date,
      agreement.due_day) + agreement.due_time) at time zone agreement.zone) then
    raise exception 'First maturity must precede the second' using errcode = '22023';
  end if;

  update public.subscriptions
  set status = 'expired'
  where barbershop_id = shop and gateway = 'manual_pix'
    and status = 'trialing' and trial_ends_at <= clock_timestamp()
  returning id into ended_trial;

  next_renewal := (private.manual_anchor(
      (date_trunc('month', first_local) + interval '1 month')::date,
      agreement.renewal_day) + first_local::time) at time zone agreement.zone;

  insert into public.subscriptions(
    barbershop_id, plan_id, gateway, gateway_status, status, invoice_link_key,
    agreement_at, agreement_terms, contracted_price_cents, contracted_currency,
    contracted_interval, coverage_starts_at, current_period_start, current_period_end,
    first_competence, first_due_at, renewal_anchor_day, due_anchor_day,
    due_month_offset, due_local_time, contract_timezone
  ) values (
    shop, agreement.plan_id, 'manual_pix', 'inactive', 'pending', shop::text,
    clock_timestamp(), agreement.terms, agreement.monthly_cents, agreement.currency,
    'month', agreement.coverage_start, agreement.coverage_start, next_renewal,
    agreement.first_month, agreement.first_due, agreement.renewal_day,
    agreement.due_day, agreement.due_month_offset, agreement.due_time, agreement.zone
  ) returning id into result;

  insert into private.manual_operation_receipts values (op, payload, result);
  insert into public.audit_logs(barbershop_id, action, entity_type, entity_id, metadata)
  values (shop, 'manual_billing.agreement', 'subscription', result,
    jsonb_build_object('operation_id', op, 'previous_trial', ended_trial, 'state', 'pending'));
  return result;
end
$$;

-- Keep mixed Asaas/manual history visible as reconciliation even when the
-- selected legacy row is already terminal. The database trigger remains the
-- final write barrier for every Asaas history row.
create or replace view private.finance_shop_directory with (security_invoker = true) as
select b.id as shop, b.name, owner.full_name as owner,
  coalesce(nullif(b.phone, ''), nullif(b.email, ''), owner.phone, owner.email) as contact,
  s.id as contract, s.gateway, s.status, p.name as plan,
  s.contracted_price_cents as monthly_cents,
  case when exists (select from private.financial_holds review
          join public.subscriptions prior on prior.id = review.contract
          where prior.barbershop_id = b.id and review.needs_reconciliation)
      or (exists(select from public.subscriptions legacy
          where legacy.barbershop_id = b.id and legacy.gateway = 'asaas')
        and exists(select from public.subscriptions manual
          where manual.barbershop_id = b.id and manual.gateway = 'manual_pix'))
      then 'reconcile'
    when s.id is null then 'none'
    when s.gateway = 'asaas' then 'asaas'
    when s.gateway = 'manual_pix' and s.agreement_at is not null then 'manual'
    when s.gateway = 'manual_pix' and s.trial_started_at is not null then 'trial'
    else 'reconcile' end as origin,
  t.trial_started_at as trial_start, t.trial_ends_at as trial_end,
  s.coverage_starts_at as coverage_start, s.first_competence, s.first_due_at,
  s.renewal_anchor_day, s.due_anchor_day as due_day, s.contract_timezone,
  s.current_period_start, s.current_period_end, coalesce(h.suspended, false) as suspended,
  (select max(pay.verified_at) from public.payments pay
    where pay.barbershop_id = b.id and pay.gateway = 'manual_pix'
      and pay.scope = 'platform_subscription' and pay.status = 'paid') as last_verified_at
from public.barbershops b
left join lateral (
  select a.full_name, a.phone, a.email
  from public.barbershop_members m
  join public.profiles a on a.id = m.user_id
  where m.barbershop_id = b.id and m.role = 'owner' and m.is_active
  order by m.user_id limit 1
) owner on true
left join lateral (
  select sub.* from public.subscriptions sub
  where sub.barbershop_id = b.id
  order by (sub.status in ('pending', 'active', 'past_due', 'trialing')) desc,
    (sub.gateway = 'manual_pix') desc, sub.created_at desc, sub.id desc
  limit 1
) s on true
left join lateral (
  select sub.id, sub.trial_started_at, sub.trial_ends_at
  from public.subscriptions sub
  where sub.barbershop_id = b.id and sub.gateway = 'manual_pix'
    and sub.trial_started_at is not null
  order by sub.trial_started_at desc, sub.created_at desc, sub.id desc
  limit 1
) t on true
left join public.plans p on p.id = s.plan_id
left join private.financial_holds h on h.contract = s.id;

-- Store only rasterized, versioned logo keys in barbershops.logo_url.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('barbershop-logos', 'barbershop-logos', true, 2097152, array['image/webp']);

create function private.is_barbershop_logo_object(shop uuid, object_name text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select object_name ~ ('^' || shop::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$')
$$;
revoke all on function private.is_barbershop_logo_object(uuid, text)
  from public, anon, authenticated, service_role;

create policy barbershop_logos_block_client_insert
  on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'barbershop-logos');
create policy barbershop_logos_block_client_update
  on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'barbershop-logos')
  with check (bucket_id <> 'barbershop-logos');
create policy barbershop_logos_block_client_delete
  on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'barbershop-logos');

-- Public buckets expose object downloads only. No client may create, replace,
-- list, or delete logo objects; the owner-checked server route normalizes first
-- and uses the server-only Storage admin client for immutable object keys.
create role lps_barbershop_logo_api nologin noinherit;
grant lps_barbershop_logo_api to postgres with inherit false, set true;
grant usage on schema public, private, storage to lps_barbershop_logo_api;
grant select on public.barbershop_members, public.barbershops to lps_barbershop_logo_api;
grant update (id) on public.barbershop_members to lps_barbershop_logo_api;
grant update (logo_url) on public.barbershops to lps_barbershop_logo_api;
grant select on storage.objects to lps_barbershop_logo_api;
grant execute on function private.trial_onboarding_actor(),
  private.is_barbershop_logo_object(uuid, text) to lps_barbershop_logo_api;

create policy barbershop_logo_api_member_read
  on public.barbershop_members for select to lps_barbershop_logo_api
  using (user_id = private.trial_onboarding_actor() and role = 'owner' and is_active);
create policy barbershop_logo_api_member_lock
  on public.barbershop_members for update to lps_barbershop_logo_api
  using (user_id = private.trial_onboarding_actor() and role = 'owner' and is_active)
  with check (false);
create policy barbershop_logo_api_shop_read
  on public.barbershops for select to lps_barbershop_logo_api using (true);
create policy barbershop_logo_api_shop_update
  on public.barbershops for update to lps_barbershop_logo_api
  using (true) with check (true);
create policy barbershop_logo_api_storage_read
  on storage.objects for select to lps_barbershop_logo_api
  using (bucket_id = 'barbershop-logos');

create table private.barbershop_logo_cleanup (
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  object_name text not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default clock_timestamp(),
  last_attempt_at timestamptz,
  primary key (barbershop_id, object_name),
  check (private.is_barbershop_logo_object(barbershop_id, object_name))
);
alter table private.barbershop_logo_cleanup enable row level security;
create policy barbershop_logo_cleanup_api
  on private.barbershop_logo_cleanup for all to lps_barbershop_logo_api
  using (true) with check (true);
revoke all on private.barbershop_logo_cleanup
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on private.barbershop_logo_cleanup
  to lps_barbershop_logo_api;

create function private.guard_barbershop_logo_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.logo_url is not null
      and current_user not in ('postgres', 'supabase_admin', 'lps_barbershop_logo_api') then
      raise exception 'Use the authorized barbershop logo flow' using errcode = '42501';
    end if;
  elsif old.logo_url is distinct from new.logo_url
    and current_user not in ('postgres', 'supabase_admin', 'lps_barbershop_logo_api') then
    raise exception 'Use the authorized barbershop logo flow' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function private.guard_barbershop_logo_reference()
  from public, anon, authenticated, service_role;
create trigger barbershops_logo_reference_guard
  before insert or update of logo_url on public.barbershops
  for each row execute function private.guard_barbershop_logo_reference();
revoke update (logo_url) on public.barbershops from authenticated;

grant create on schema public to lps_barbershop_logo_api;
create function public.replace_barbershop_logo(
  p_barbershop_id uuid,
  p_expected_object text,
  p_replacement_object text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.trial_onboarding_actor();
  previous_object text;
begin
  if actor is null then
    raise exception 'Owner authorization required' using errcode = '42501';
  end if;
  perform 1 from public.barbershop_members
  where user_id = actor and barbershop_id = p_barbershop_id
    and role = 'owner' and is_active for share;
  if not found then
    raise exception 'Owner authorization required' using errcode = '42501';
  end if;
  if p_expected_object is not null and length(p_expected_object) > 2048 then
    raise exception 'Invalid expected logo' using errcode = '22023';
  end if;
  if p_replacement_object is not null
    and (not private.is_barbershop_logo_object(p_barbershop_id, p_replacement_object)
      or p_replacement_object = p_expected_object) then
    raise exception 'Invalid replacement logo' using errcode = '22023';
  end if;

  select logo_url into previous_object
  from public.barbershops where id = p_barbershop_id for update;
  if not found then
    raise exception 'Unknown barbershop' using errcode = 'P0002';
  end if;
  if previous_object is distinct from p_expected_object then
    raise exception 'Logo changed; refresh before retrying' using errcode = '40001';
  end if;
  if p_replacement_object is not null and (exists (
    select from private.barbershop_logo_cleanup
    where barbershop_id = p_barbershop_id and object_name = p_replacement_object
  ) or not exists (
    select from storage.objects
    where bucket_id = 'barbershop-logos' and name = p_replacement_object
  )) then
    raise exception 'Uploaded logo is unavailable' using errcode = '22023';
  end if;

  update public.barbershops set logo_url = p_replacement_object
  where id = p_barbershop_id;

  if previous_object is not null
    and private.is_barbershop_logo_object(p_barbershop_id, previous_object) then
    insert into private.barbershop_logo_cleanup(barbershop_id, object_name)
    values (p_barbershop_id, previous_object)
    on conflict (barbershop_id, object_name) do nothing;
  end if;

  return jsonb_build_object('previous', previous_object, 'current', p_replacement_object);
end
$$;
alter function public.replace_barbershop_logo(uuid, text, text)
  owner to lps_barbershop_logo_api;
revoke all on function public.replace_barbershop_logo(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_barbershop_logo(uuid, text, text)
  to authenticated;

create function public.barbershop_logo_cleanup_list(p_barbershop_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.trial_onboarding_actor();
begin
  if actor is null or not exists (
    select from public.barbershop_members
    where user_id = actor and barbershop_id = p_barbershop_id
      and role = 'owner' and is_active
  ) then
    raise exception 'Owner authorization required' using errcode = '42501';
  end if;
  -- Serialize retirement with all changes of this shop's current reference.
  -- Recover uploads abandoned between Storage and the reference transaction.
  perform 1 from public.barbershops where id = p_barbershop_id for update;
  insert into private.barbershop_logo_cleanup(barbershop_id, object_name)
  select b.id, o.name from public.barbershops b
    join storage.objects o on o.bucket_id = 'barbershop-logos'
      and o.name like b.id::text || '/%'
    where b.id = p_barbershop_id and b.logo_url is distinct from o.name
      and private.is_barbershop_logo_object(b.id, o.name)
      and o.created_at < statement_timestamp() - interval '15 minutes'
      and not exists (select from private.barbershop_logo_cleanup q
        where q.barbershop_id = b.id and q.object_name = o.name)
    order by o.created_at limit 20
  on conflict do nothing;
  return coalesce((
    select array_agg(pending.object_name order by pending.created_at)
    from (
      select q.object_name, q.created_at
      from private.barbershop_logo_cleanup q
      join public.barbershops b on b.id = q.barbershop_id
      where q.barbershop_id = p_barbershop_id
        and b.logo_url is distinct from q.object_name
      order by q.created_at
      limit 20
    ) pending
  ), array[]::text[]);
end
$$;
alter function public.barbershop_logo_cleanup_list(uuid)
  owner to lps_barbershop_logo_api;
revoke all on function public.barbershop_logo_cleanup_list(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.barbershop_logo_cleanup_list(uuid)
  to authenticated;

create function public.barbershop_logo_cleanup_result(
  p_barbershop_id uuid,
  p_object_name text,
  p_removed boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.trial_onboarding_actor();
begin
  if actor is null or not exists (
    select from public.barbershop_members
    where user_id = actor and barbershop_id = p_barbershop_id
      and role = 'owner' and is_active
  ) then
    raise exception 'Owner authorization required' using errcode = '42501';
  end if;
  if not private.is_barbershop_logo_object(p_barbershop_id, p_object_name) then
    raise exception 'Invalid logo cleanup key' using errcode = '22023';
  end if;
  perform 1 from public.barbershops where id = p_barbershop_id for update;
  if exists (
    select from public.barbershops
    where id = p_barbershop_id and logo_url = p_object_name
  ) then
    return false;
  end if;

  if p_removed then
    if exists (
      select from storage.objects
      where bucket_id = 'barbershop-logos' and name = p_object_name
    ) then
      raise exception 'Logo object still exists' using errcode = '55000';
    end if;
    delete from private.barbershop_logo_cleanup
    where barbershop_id = p_barbershop_id and object_name = p_object_name;
    return true;
  end if;

  if not exists (select from storage.objects
    where bucket_id = 'barbershop-logos' and name = p_object_name) then
    return false;
  end if;
  insert into private.barbershop_logo_cleanup as queued
    (barbershop_id, object_name, attempts, last_attempt_at)
  values (p_barbershop_id, p_object_name, 1, clock_timestamp())
  on conflict (barbershop_id, object_name) do update
    set attempts = queued.attempts + 1,
        last_attempt_at = clock_timestamp();
  return true;
end
$$;
alter function public.barbershop_logo_cleanup_result(uuid, text, boolean)
  owner to lps_barbershop_logo_api;
revoke all on function public.barbershop_logo_cleanup_result(uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.barbershop_logo_cleanup_result(uuid, text, boolean)
  to authenticated;
revoke create on schema public from lps_barbershop_logo_api;

-- Reassert the public RPC ACLs after ownership transfer; no client role except
-- authenticated can invoke them, and only for its owner-checked tenant.
set role lps_barbershop_logo_api;
revoke all on function public.replace_barbershop_logo(uuid, text, text),
  public.barbershop_logo_cleanup_list(uuid),
  public.barbershop_logo_cleanup_result(uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_barbershop_logo(uuid, text, text),
  public.barbershop_logo_cleanup_list(uuid),
  public.barbershop_logo_cleanup_result(uuid, text, boolean)
  to authenticated;
reset role;
