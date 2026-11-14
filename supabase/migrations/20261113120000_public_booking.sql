-- LPS Agenda — agendamento público, token de reserva e proteções
--
-- A página pública não usa a Data API com o papel anon. Todas as leituras e
-- escritas passam pelo servidor Next.js com service role, que não é exposto ao
-- navegador. As funções abaixo são internas e só podem ser executadas por esse
-- papel.

set search_path = public, extensions;

-- Token imprevisível usado para consultar e cancelar uma reserva sem login.
-- O valor padrão cobre linhas antigas; a aplicação gera o token explicitamente.
alter table public.appointments
  add column public_token uuid not null default gen_random_uuid();

comment on column public.appointments.public_token is
  'Segredo opaco da reserva pública. Nunca deve ser exibido na agenda interna como identificador do agendamento.';

create unique index appointments_public_token_key
  on public.appointments (public_token);

-- Busca por telefone normalizado dentro do tenant. A expressão é imutável e
-- atende à função de deduplicação de clientes criada mais abaixo.
create index customers_shop_phone_digits_idx
  on public.customers (
    barbershop_id,
    (regexp_replace(coalesce(phone, ''), '\D', '', 'g'))
  );

-- Janelas curtas de rate limiting. A chave é um hash, nunca IP ou telefone em
-- texto puro. A retenção é curta e a própria função remove janelas antigas.
create table public.booking_rate_limits (
  bucket text not null
    check (char_length(bucket) between 1 and 200),
  window_start timestamptz not null,
  hits integer not null default 1
    check (hits >= 0),
  updated_at timestamptz not null default now(),
  primary key (bucket, window_start)
);

comment on table public.booking_rate_limits is
  'Contadores efêmeros de rate limiting do agendamento público. Sem dados pessoais em texto puro.';

create index booking_rate_limits_window_idx
  on public.booking_rate_limits (window_start);

alter table public.booking_rate_limits enable row level security;

revoke all on table public.booking_rate_limits from anon, authenticated;
grant all on table public.booking_rate_limits to service_role;

-- Consome uma tentativa de forma atômica. Retorna true enquanto o limite da
-- janela não for excedido. O ON CONFLICT serializa concorrentes na mesma chave.
create or replace function public.consume_booking_rate_limit(
  p_bucket text,
  p_window_seconds integer,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
  v_bucket text;
begin
  v_bucket := left(btrim(coalesce(p_bucket, '')), 200);

  if v_bucket = '' or p_window_seconds <= 0 or p_limit <= 0 then
    return false;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds)
      * p_window_seconds
  );

  insert into public.booking_rate_limits (bucket, window_start, hits, updated_at)
  values (v_bucket, v_window_start, 1, clock_timestamp())
  on conflict (bucket, window_start)
  do update set
    hits = public.booking_rate_limits.hits + 1,
    updated_at = clock_timestamp()
  returning hits into v_hits;

  delete from public.booking_rate_limits
  where window_start < clock_timestamp() - interval '1 day';

  return v_hits <= p_limit;
end;
$$;

-- Localiza ou cria um cliente da barbearia usando o telefone normalizado.
-- O advisory lock é tomado por tenant + telefone para que duas requisições
-- simultâneas do mesmo número não criem cadastros duplicados. Nome e e-mail de
-- um cliente existente não são sobrescritos.
create or replace function public.find_or_create_public_customer(
  p_barbershop_id uuid,
  p_full_name text,
  p_phone text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_name text;
  v_email text;
  v_customer_id uuid;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');

  if char_length(v_phone) not between 10 and 11 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  if char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_barbershop_id::text || ':' || v_phone, 0)
  );

  select c.id
    into v_customer_id
    from public.customers c
   where c.barbershop_id = p_barbershop_id
     and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone
   order by c.created_at asc
   limit 1;

  if v_customer_id is not null then
    return v_customer_id;
  end if;

  insert into public.customers (barbershop_id, full_name, phone, email)
  values (p_barbershop_id, v_name, v_phone, v_email)
  returning id into v_customer_id;

  return v_customer_id;
end;
$$;

revoke all on function public.consume_booking_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_booking_rate_limit(text, integer, integer)
  to service_role;

revoke all on function public.find_or_create_public_customer(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.find_or_create_public_customer(uuid, text, text, text)
  to service_role;

comment on function public.consume_booking_rate_limit(text, integer, integer) is
  'Rate limiting atômico do agendamento público. Executável apenas por service_role.';

comment on function public.find_or_create_public_customer(uuid, text, text, text) is
  'Deduplica clientes por telefone dentro do tenant com advisory lock. Executável apenas por service_role.';
