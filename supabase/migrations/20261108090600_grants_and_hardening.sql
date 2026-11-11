-- LPS Agenda — grants mínimos e hardening
-- RLS sozinho não concede acesso: todo grant é explícito.
-- anon não recebe acesso a nenhuma tabela de negócio. A demo pública é estática.

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on all tables in schema public to authenticated;

grant update (full_name, phone, avatar_url)
  on public.profiles to authenticated;

grant update (
  slug,
  name,
  description,
  phone,
  email,
  address_street,
  address_number,
  address_complement,
  address_district,
  address_city,
  address_state,
  address_zip,
  timezone,
  logo_url,
  cover_url
) on public.barbershops to authenticated;

grant insert on public.barbershop_members to authenticated;
grant update (role, is_active) on public.barbershop_members to authenticated;
grant delete on public.barbershop_members to authenticated;

grant insert, update, delete on public.barbers to authenticated;
grant insert, update, delete on public.services to authenticated;
grant insert, update, delete on public.barber_services to authenticated;
grant insert, update, delete on public.business_hours to authenticated;
grant insert, update, delete on public.barber_working_hours to authenticated;
grant insert, update, delete on public.blocked_slots to authenticated;
grant insert, update, delete on public.customers to authenticated;
grant insert, update, delete on public.appointments to authenticated;

grant insert, update, delete on public.plans to authenticated;
grant insert, update, delete on public.subscriptions to authenticated;
grant insert, update, delete on public.payments to authenticated;

grant update, delete on public.notifications to authenticated;

-- Funções expostas pela Data API.
revoke all on function public.create_barbershop(text, text, text, text) from public;
revoke all on function public.create_barbershop(text, text, text, text) from anon;
grant execute on function public.create_barbershop(text, text, text, text) to authenticated;

-- Helpers de RLS: executáveis apenas por usuários autenticados e service role.
revoke all on all functions in schema private from public;
revoke all on all functions in schema private from anon;
grant execute on function private.is_platform_admin() to authenticated, service_role;
grant execute on function private.is_barbershop_member(uuid) to authenticated, service_role;
grant execute on function private.has_barbershop_role(uuid, public.barbershop_member_role[]) to authenticated, service_role;
grant execute on function private.shares_barbershop(uuid) to authenticated, service_role;

-- Objetos futuros exigem grants explícitos; nada nasce acessível por anon
-- ou authenticated só por ter sido criado no schema public.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- service_role opera jobs internos (webhooks, cobrança) e bypassa RLS por design.
grant all on all tables in schema public to service_role;
grant usage on schema public to service_role;
