-- I4-01: owner approved local price/authorship integrity on 2026-11-25.
-- No data rewrite and no change to subscription/Pix rules.
create function private.guard_appointment_price_identity()
returns trigger language plpgsql security invoker set search_path='' as $$
declare canonical_price integer; actor uuid:=auth.uid();
begin
  -- Trusted infrastructure/service paths retain their existing audit trigger.
  -- Never use a client-supplied JWT role claim to grant this bypass.
  if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
  if current_user <> 'authenticated' or actor is null then
    raise exception 'Sessão inválida para registrar atendimento.' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    select s.price_cents into canonical_price from public.services s
      where s.id=new.service_id and s.barbershop_id=new.barbershop_id and s.is_active;
    if not found then raise exception 'Serviço indisponível.' using errcode='23514'; end if;
    new.price_cents:=canonical_price;
    new.created_by:=actor;
  elsif (new.price_cents,new.created_by,new.service_id,new.barbershop_id) is distinct from
        (old.price_cents,old.created_by,old.service_id,old.barbershop_id) then
    raise exception 'O preço, serviço e autoria do atendimento não podem ser alterados. Registre uma correção autorizada.'
      using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.guard_appointment_price_identity() from public,anon,authenticated,service_role;
create trigger appointments_guard_price_identity
  before insert or update on public.appointments
  for each row execute function private.guard_appointment_price_identity();
comment on function private.guard_appointment_price_identity() is
  'Human writes use catalog price at creation and immutable price/service/tenant/authorship. Infrastructure writes remain audited.';
