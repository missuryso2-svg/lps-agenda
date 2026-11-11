-- LPS Agenda — funções de autorização, triggers e onboarding transacional

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

comment on schema private is
  'Helpers internos de autorização. Não é exposto pela Data API; uso liberado apenas para funções/RLS.';

-- Atualiza updated_at de forma padronizada.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Papel global lido exclusivamente de app_metadata (controlado pelo servidor).
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'lps_role') = 'platform_admin',
    false
  );
$$;

comment on function private.is_platform_admin() is
  'Administrador global. Lê app_metadata do JWT, nunca user_metadata.';

create or replace function private.is_barbershop_member(target_barbershop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barbershop_members m
    where m.barbershop_id = target_barbershop_id
      and m.user_id = (select auth.uid())
      and m.is_active
  );
$$;

create or replace function private.has_barbershop_role(
  target_barbershop_id uuid,
  allowed_roles public.barbershop_member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barbershop_members m
    where m.barbershop_id = target_barbershop_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role = any (allowed_roles)
  );
$$;

create or replace function private.shares_barbershop(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barbershop_members me
    join public.barbershop_members them
      on them.barbershop_id = me.barbershop_id
    where me.user_id = (select auth.uid())
      and me.is_active
      and them.user_id = other_user_id
      and them.is_active
  );
$$;

-- Cria o perfil quando um usuário do Supabase Auth é criado.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');

  -- O perfil exige nome com ao menos 2 caracteres. Um e-mail curto ou um
  -- metadado inválido não pode fazer o cadastro inteiro falhar.
  if v_name is null or char_length(v_name) < 2 then
    v_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;

  if v_name is null or char_length(v_name) < 2 then
    v_name := 'Usuario';
  end if;

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    left(v_name, 120)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Backfill idempotente para usuários que já existiam antes da migração.
insert into public.profiles (id, email, full_name)
select
  u.id,
  u.email,
  case
    when char_length(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', ''))) between 2 and 120
      then left(btrim(u.raw_user_meta_data ->> 'full_name'), 120)
    when char_length(btrim(split_part(coalesce(u.email, ''), '@', 1))) between 2 and 120
      then left(btrim(split_part(coalesce(u.email, ''), '@', 1)), 120)
    else 'Usuario'
  end
from auth.users u
on conflict (id) do nothing;

-- Impede troca de usuário/tenant e autopromoção de papel.
create or replace function private.guard_membership_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.barbershop_id is distinct from old.barbershop_id then
    raise exception 'O vínculo não pode ser movido para outra barbearia.'
      using errcode = '42501';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'O usuário do vínculo não pode ser alterado.'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     and (select auth.uid()) = old.user_id
     and not private.is_platform_admin() then
    raise exception 'Você não pode alterar o próprio papel.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger barbershop_members_guard
  before update on public.barbershop_members
  for each row execute function private.guard_membership_changes();

-- Garante ao menos um proprietário ativo por barbearia.
create or replace function private.ensure_barbershop_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barbershop_id uuid;
begin
  v_barbershop_id := case when tg_op = 'DELETE' then old.barbershop_id else new.barbershop_id end;

  -- Se a barbearia está sendo excluída em cascata, não há o que preservar.
  if not exists (
    select 1 from public.barbershops b where b.id = v_barbershop_id
  ) then
    return null;
  end if;

  if not exists (
    select 1
    from public.barbershop_members m
    where m.barbershop_id = v_barbershop_id
      and m.role = 'owner'
      and m.is_active
  ) then
    raise exception 'A barbearia precisa manter ao menos um proprietário ativo.'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger barbershop_members_keep_owner
  after update or delete on public.barbershop_members
  deferrable initially deferred
  for each row execute function private.ensure_barbershop_has_owner();

-- Auditoria de mutações sensíveis (sem DELETE, para não conflitar com cascatas).
create or replace function private.audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  v_row := to_jsonb(new);

  insert into public.audit_logs (
    barbershop_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    (v_row ->> 'barbershop_id')::uuid,
    (select auth.uid()),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_row
  );

  return new;
end;
$$;

create trigger barbershop_members_audit
  after insert or update on public.barbershop_members
  for each row execute function private.audit_mutation();

create trigger appointments_audit
  after insert or update on public.appointments
  for each row execute function private.audit_mutation();

create trigger subscriptions_audit
  after insert or update on public.subscriptions
  for each row execute function private.audit_mutation();

-- Onboarding atômico: cria a barbearia e o vínculo owner na mesma transação.
create or replace function public.create_barbershop(
  p_name text,
  p_slug text,
  p_phone text default null,
  p_timezone text default 'America/Sao_Paulo'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text := btrim(p_name);
  v_slug text := lower(btrim(p_slug));
  v_phone text := nullif(btrim(p_phone), '');
  v_timezone text := coalesce(nullif(btrim(p_timezone), ''), 'America/Sao_Paulo');
  v_barbershop_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida. Entre novamente para continuar.'
      using errcode = '28000';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe um nome de barbearia entre 2 e 120 caracteres.'
      using errcode = '22023';
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) < 3 or char_length(v_slug) > 60 then
    raise exception 'O identificador deve ter de 3 a 60 caracteres, usando letras minúsculas, números e hífens.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = v_timezone
  ) then
    raise exception 'Fuso horário inválido.'
      using errcode = '22023';
  end if;

  insert into public.barbershops (name, slug, phone, timezone)
  values (v_name, v_slug, v_phone, v_timezone)
  returning id into v_barbershop_id;

  insert into public.barbershop_members (barbershop_id, user_id, role, is_active)
  values (v_barbershop_id, v_user_id, 'owner', true);

  return v_barbershop_id;
end;
$$;

comment on function public.create_barbershop(text, text, text, text) is
  'Cria barbearia + vínculo owner. Não aceita barbershop_id do cliente; deriva o usuário do JWT.';

-- Aplica updated_at em todas as tabelas que possuem a coluna.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'barbershops',
    'barbershop_members',
    'barbers',
    'services',
    'business_hours',
    'barber_working_hours',
    'customers',
    'blocked_slots',
    'appointments',
    'plans',
    'subscriptions',
    'payments',
    'webhook_events',
    'notifications'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;
