-- LPS Agenda — tolerância de 72 horas para inadimplência de assinatura.
-- A janela começa na transição registrada no banco. Assinaturas que já
-- estavam past_due recebem 72 horas a partir da implantação desta migration,
-- evitando bloqueio retroativo.

alter table public.subscriptions
  add column if not exists past_due_since timestamptz,
  add column if not exists grace_period_ends_at timestamptz;

do $$
declare
  v_transition_time timestamptz := clock_timestamp();
begin
  update public.subscriptions s
  set past_due_since = coalesce(s.past_due_since, v_transition_time),
      grace_period_ends_at = coalesce(
        s.grace_period_ends_at,
        coalesce(s.past_due_since, v_transition_time) + interval '72 hours'
      )
  where s.status = 'past_due';
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conname = 'subscriptions_past_due_grace_fields_check'
      and c.conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_past_due_grace_fields_check
      check (
        (
          status = 'past_due'
          and past_due_since is not null
          and grace_period_ends_at is not null
        )
        or (
          status <> 'past_due'
          and past_due_since is null
          and grace_period_ends_at is null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conname = 'subscriptions_past_due_grace_duration_check'
      and c.conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_past_due_grace_duration_check
      check (
        past_due_since is null
        or grace_period_ends_at = past_due_since + interval '72 hours'
      );
  end if;
end;
$$;

comment on column public.subscriptions.past_due_since is
  'Instante do banco em que a assinatura entrou em past_due; preservado em updates repetidos.';

comment on column public.subscriptions.grace_period_ends_at is
  'Fim exato da tolerância de 72 horas, calculado a partir de past_due_since pelo banco.';

create or replace function private.is_subscription_booking_blocked(
  p_status public.subscription_status,
  p_grace_period_ends_at timestamptz,
  p_now timestamptz
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    p_status = 'past_due'
    and (
      p_grace_period_ends_at is null
      or p_grace_period_ends_at <= p_now
    ),
    false
  );
$$;

comment on function private.is_subscription_booking_blocked(
  public.subscription_status,
  timestamptz,
  timestamptz
) is
  'Regra única de bloqueio: somente past_due com prazo vencido ou ausente bloqueia novos horários.';

create or replace function private.set_subscription_past_due_grace()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_since timestamptz;
begin
  if new.status = 'past_due' then
    if tg_op = 'UPDATE' and old.status = 'past_due' then
      v_since := coalesce(old.past_due_since, clock_timestamp());
      new.past_due_since := v_since;
      new.grace_period_ends_at := coalesce(
        old.grace_period_ends_at,
        v_since + interval '72 hours'
      );
    else
      v_since := clock_timestamp();
      new.past_due_since := v_since;
      new.grace_period_ends_at := v_since + interval '72 hours';
    end if;
  else
    new.past_due_since := null;
    new.grace_period_ends_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists subscriptions_set_past_due_grace
  on public.subscriptions;

create trigger subscriptions_set_past_due_grace
  before insert or update on public.subscriptions
  for each row execute function private.set_subscription_past_due_grace();

create or replace function public.get_barbershop_booking_access(
  p_barbershop_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.subscription_status;
  v_past_due_since timestamptz;
  v_grace_period_ends_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_allowed boolean;
  v_state text;
  v_seconds_remaining integer;
begin
  select
    s.status,
    s.past_due_since,
    s.grace_period_ends_at
  into
    v_status,
    v_past_due_since,
    v_grace_period_ends_at
  from public.subscriptions s
  where s.barbershop_id = p_barbershop_id
    and s.status in ('pending', 'trialing', 'active', 'past_due')
  order by s.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'allowed', true,
      'state', 'normal',
      'subscription_status', null,
      'past_due_since', null,
      'grace_period_ends_at', null,
      'seconds_remaining', null
    );
  end if;

  v_allowed := not private.is_subscription_booking_blocked(
    v_status,
    v_grace_period_ends_at,
    v_now
  );

  v_state := case
    when v_status <> 'past_due' then 'normal'
    when v_allowed then 'grace'
    else 'blocked'
  end;

  if v_status = 'past_due' and v_allowed then
    v_seconds_remaining := greatest(
      ceil(extract(epoch from (v_grace_period_ends_at - v_now)))::integer,
      0
    );
  else
    v_seconds_remaining := null;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'state', v_state,
    'subscription_status', v_status,
    'past_due_since', v_past_due_since,
    'grace_period_ends_at', v_grace_period_ends_at,
    'seconds_remaining', v_seconds_remaining
  );
end;
$$;

comment on function public.get_barbershop_booking_access(uuid) is
  'Snapshot de autorização para novas reservas. Usa o relógio do banco; disponível somente ao servidor com service_role.';

create or replace function private.enforce_appointment_booking_grace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.subscription_status;
  v_grace_period_ends_at timestamptz;
  v_now timestamptz;
  v_requires_new_slot boolean := false;
begin
  if tg_op = 'INSERT' then
    v_requires_new_slot := true;
  else
    v_requires_new_slot :=
      (
        new.status in ('scheduled', 'confirmed', 'in_progress')
        and old.status not in ('scheduled', 'confirmed', 'in_progress')
      )
      or (
        new.status in ('scheduled', 'confirmed', 'in_progress')
        and (
          new.barbershop_id is distinct from old.barbershop_id
          or new.barber_id is distinct from old.barber_id
          or new.service_id is distinct from old.service_id
          or new.starts_at is distinct from old.starts_at
          or new.ends_at is distinct from old.ends_at
        )
      );
  end if;

  if not v_requires_new_slot then
    return new;
  end if;

  -- O lock serializa o insert/reagendamento com a transição de assinatura.
  -- Assim, o trigger avalia o status corrente depois de qualquer update que
  -- tenha vencido a corrida. Ele também roda em inserts feitos por service_role.
  select s.status, s.grace_period_ends_at
    into v_status, v_grace_period_ends_at
  from public.subscriptions s
  where s.barbershop_id = new.barbershop_id
    and s.status in ('pending', 'trialing', 'active', 'past_due')
  order by s.created_at desc
  limit 1
  for share;

  if not found then
    return new;
  end if;

  v_now := clock_timestamp();

  if private.is_subscription_booking_blocked(
    v_status,
    v_grace_period_ends_at,
    v_now
  ) then
    raise exception 'Agendamentos temporariamente indisponíveis.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_enforce_booking_grace
  on public.appointments;

create trigger appointments_enforce_booking_grace
  before insert or update on public.appointments
  for each row execute function private.enforce_appointment_booking_grace();

revoke all on function private.is_subscription_booking_blocked(
  public.subscription_status,
  timestamptz,
  timestamptz
) from public;
revoke all on function private.is_subscription_booking_blocked(
  public.subscription_status,
  timestamptz,
  timestamptz
) from anon;
revoke all on function private.is_subscription_booking_blocked(
  public.subscription_status,
  timestamptz,
  timestamptz
) from authenticated;

revoke all on function private.set_subscription_past_due_grace()
  from public;
revoke all on function private.set_subscription_past_due_grace()
  from anon;
revoke all on function private.set_subscription_past_due_grace()
  from authenticated;

revoke all on function private.enforce_appointment_booking_grace()
  from public;
revoke all on function private.enforce_appointment_booking_grace()
  from anon;
revoke all on function private.enforce_appointment_booking_grace()
  from authenticated;

revoke all on function public.get_barbershop_booking_access(uuid)
  from public;
revoke all on function public.get_barbershop_booking_access(uuid)
  from anon;
revoke all on function public.get_barbershop_booking_access(uuid)
  from authenticated;
grant execute on function public.get_barbershop_booking_access(uuid)
  to service_role;
