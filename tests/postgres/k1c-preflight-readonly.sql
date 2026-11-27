-- Run with psql using an approved read-only connection to the reviewed project.
-- Counts only. Legacy states and URLs are review candidates, not data repairs.
\set ON_ERROR_STOP on
begin read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';

select current_setting('server_version') as postgres_version,
       current_setting('max_connections')::int as max_connections;
select version from supabase_migrations.schema_migrations order by version;
select extname, extversion from pg_extension order by extname;
select rolname, rolcanlogin, rolbypassrls, rolcreaterole
from pg_roles where rolname in ('anon','authenticated','service_role') or rolname like 'lps_%'
order by rolname;

select count(*) as agreements_over_team_capacity
from public.subscriptions s join public.plans p on p.id = s.plan_id
where to_jsonb(s)->>'gateway' = 'manual_pix' and to_jsonb(s)->>'agreement_at' is not null
  and s.status in ('active','trialing','pending') and p.max_barbers is not null
  and (select count(*) from public.barbers b where b.barbershop_id = s.barbershop_id and b.is_active) > p.max_barbers;

select count(*) filter (where ends_at <= starts_at) as invalid_periods,
       count(*) filter (where status <> 'cancelled' and cancel_reason is not null) as reason_outside_cancellation,
       count(*) filter (where status = 'completed' and created_by is null) as completed_without_author_for_review,
       count(*) filter (where lower(status::text) in ('scheduled','confirmed') and ends_at < now()) as past_open_for_review
from public.appointments;

select status, count(*) as existing_trials from public.subscriptions
where to_jsonb(subscriptions)->>'trial_started_at' is not null or status = 'trialing'
group by status order by status;
select to_regclass('private.automatic_premium_trials') is not null as has_automatic_trial \gset
\if :has_automatic_trial
select count(*) as automatic_trials,
       count(*) filter (where ends_at <= started_at) as invalid_trial_dates
from private.automatic_premium_trials;
\endif

with refs(bucket, tenant, professional, ref) as (
  select 'barbershop-logos', id::text, null, logo_url from public.barbershops where logo_url is not null
  union all
  select 'barber-photos', barbershop_id::text, id::text, avatar_url from public.barbers where avatar_url is not null
), normalized as (
  select *, coalesce(substring(split_part(split_part(ref,'?',1),'#',1)
    from ('/' || bucket || '/(.+)$')), ref) as storage_key
  from refs
)
select bucket,
       count(*) filter (where split_part(storage_key,'/',1) <> tenant
         or (professional is not null and split_part(storage_key,'/',2) <> professional)) as foreign_or_legacy_reference,
       count(*) filter (where not exists (
         select from storage.objects o where o.bucket_id=bucket and o.name=storage_key)) as missing_metadata
from normalized group by bucket order by bucket;

with refs(bucket, ref) as (
  select 'barbershop-logos', logo_url from public.barbershops where logo_url is not null union all
  select 'barber-photos', avatar_url from public.barbers where avatar_url is not null
)
select o.bucket_id, count(*) as orphan_candidates
from storage.objects o
where o.bucket_id in ('barbershop-logos','barber-photos')
  and o.created_at < statement_timestamp()-interval '15 minutes'
  and not exists(select from refs r where r.bucket=o.bucket_id and
    (r.ref=o.name or substring(split_part(split_part(r.ref,'?',1),'#',1) from ('/'||r.bucket||'/(.+)$'))=o.name))
group by o.bucket_id order by o.bucket_id;

select conrelid::regclass::text as relation, conname from pg_constraint where not convalidated order by 1,2;
rollback;
