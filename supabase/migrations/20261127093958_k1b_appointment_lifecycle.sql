begin;

-- Add the scheduling state machine at the write boundary. Existing records and
-- price/authorship, policy, schedule, coverage and audit triggers are retained.
create function private.guard_appointment_lifecycle()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  api_writer boolean := current_user in ('authenticated','service_role');
  status_changed boolean;
  time_changed boolean;
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated'
      and not (private.is_barbershop_member(new.barbershop_id) or private.is_platform_admin()) then
      raise insufficient_privilege;
    end if;
    if api_writer and (new.status <> 'scheduled' or new.cancel_reason is not null) then
      raise exception 'Um novo atendimento deve começar agendado.' using errcode='23514';
    end if;
    if current_user = 'authenticated' then new.public_token := gen_random_uuid(); end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if api_writer and old.status in ('completed','cancelled','no_show')
      and exists (select from public.barbershops where id = old.barbershop_id) then
      raise exception 'O histórico de um atendimento encerrado deve ser preservado.' using errcode='23514';
    end if;
    return old;
  end if;

  status_changed := new.status is distinct from old.status;
  time_changed := (new.starts_at,new.ends_at) is distinct from (old.starts_at,old.ends_at);

  if api_writer and (new.id,new.customer_id,new.barber_id,new.created_at,new.public_token) is distinct from
      (old.id,old.customer_id,old.barber_id,old.created_at,old.public_token) then
    raise exception 'A identidade do atendimento deve ser preservada.' using errcode='23514';
  end if;

  if time_changed and (status_changed or old.status not in ('scheduled','confirmed')) then
    raise exception 'Reagende somente um atendimento agendado ou confirmado, sem mudar seu estado.' using errcode='23514';
  end if;

  if new.cancel_reason is distinct from old.cancel_reason
    and (not status_changed or new.status <> 'cancelled') then
    raise exception 'O motivo só pode ser registrado no momento do cancelamento.' using errcode='23514';
  end if;

  if not status_changed then return new; end if;

  if not (
    (old.status = 'scheduled' and new.status in ('confirmed','in_progress','completed','cancelled','no_show'))
    or (old.status = 'confirmed' and new.status in ('in_progress','completed','cancelled','no_show'))
    or (old.status = 'in_progress' and new.status = 'completed')
  ) then
    raise exception 'Transição de atendimento indisponível.' using errcode='23514';
  end if;

  -- The existing completion definer serializes the row, validates the current
  -- membership and records optional scores in the same transaction.
  if new.status = 'completed' and api_writer then
    raise exception 'Conclua o atendimento pelo fluxo de avaliação.' using errcode='23514';
  end if;

  -- The server-only bearer-link flow is the only service-role state writer.
  -- Use the actual row and clock at UPDATE after a concurrent row lock wait.
  if current_user = 'service_role' and (
    new.status <> 'cancelled' or old.public_token is null or old.starts_at <= clock_timestamp()
  ) then
    raise exception 'A reserva não pode ser cancelada pelo link público.' using errcode='23514';
  end if;

  return new;
end
$$;

revoke all on function private.guard_appointment_lifecycle()
  from public, anon, authenticated, service_role;
create trigger appointments_00_guard_lifecycle
  before insert or update or delete on public.appointments
  for each row execute function private.guard_appointment_lifecycle();

commit;
