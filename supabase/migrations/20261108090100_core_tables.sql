-- LPS Agenda — perfis, barbearias, vínculos, profissionais e catálogo

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null
    check (char_length(btrim(full_name)) between 2 and 120),
  phone text
    check (phone is null or char_length(btrim(phone)) between 8 and 24),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Dados públicos do usuário. Papéis de plataforma ficam em auth.users.raw_app_meta_data e nunca aqui.';

create table public.barbershops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name text not null
    check (char_length(btrim(name)) between 2 and 120),
  description text
    check (description is null or char_length(description) <= 1000),
  phone text
    check (phone is null or char_length(btrim(phone)) between 8 and 24),
  email text
    check (email is null or (position('@' in email) > 1 and char_length(email) <= 254)),
  address_street text,
  address_number text,
  address_complement text,
  address_district text,
  address_city text,
  address_state text
    check (address_state is null or address_state ~ '^[A-Z]{2}$'),
  address_zip text
    check (address_zip is null or address_zip ~ '^[0-9]{5}-?[0-9]{3}$'),
  timezone text not null default 'America/Sao_Paulo',
  logo_url text,
  cover_url text,
  status public.barbershop_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.barbershops is 'Tenant raiz do LPS Agenda. Todo dado operacional referencia barbershop_id.';

create index barbershops_status_idx on public.barbershops (status);

create table public.barbershop_members (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.barbershop_member_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barbershop_members_shop_user_unique unique (barbershop_id, user_id)
);

comment on table public.barbershop_members is 'Vínculo entre usuário e barbearia. O papel owner/staff é sempre validado no banco.';

create index barbershop_members_user_idx on public.barbershop_members (user_id);
create index barbershop_members_shop_idx on public.barbershop_members (barbershop_id);
create unique index barbershop_members_one_active_owner_idx
  on public.barbershop_members (barbershop_id)
  where role = 'owner' and is_active;

create table public.barbers (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null
    check (char_length(btrim(name)) between 2 and 120),
  bio text
    check (bio is null or char_length(bio) <= 800),
  phone text
    check (phone is null or char_length(btrim(phone)) between 8 and 24),
  avatar_url text,
  is_active boolean not null default true,
  display_order integer not null default 0
    check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barbers_id_shop_unique unique (id, barbershop_id),
  constraint barbers_shop_user_unique unique (barbershop_id, user_id)
);

create index barbers_shop_idx on public.barbers (barbershop_id, is_active);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 2 and 120),
  description text
    check (description is null or char_length(description) <= 800),
  duration_minutes integer not null
    check (duration_minutes between 5 and 600),
  price_cents integer not null
    check (price_cents between 0 and 100000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_id_shop_unique unique (id, barbershop_id)
);

create index services_shop_idx on public.services (barbershop_id, is_active);

create table public.barber_services (
  barber_id uuid not null,
  service_id uuid not null,
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (barber_id, service_id),
  constraint barber_services_barber_fk
    foreign key (barber_id, barbershop_id)
    references public.barbers (id, barbershop_id)
    on delete cascade,
  constraint barber_services_service_fk
    foreign key (service_id, barbershop_id)
    references public.services (id, barbershop_id)
    on delete cascade
);

create index barber_services_shop_idx on public.barber_services (barbershop_id);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  weekday smallint not null
    check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_hours_time_check check (closes_at > opens_at),
  constraint business_hours_unique unique (barbershop_id, weekday, opens_at)
);

create index business_hours_shop_idx on public.business_hours (barbershop_id, weekday);

create table public.barber_working_hours (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null,
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  weekday smallint not null
    check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barber_working_hours_time_check check (ends_at > starts_at),
  constraint barber_working_hours_unique unique (barber_id, weekday, starts_at),
  constraint barber_working_hours_barber_fk
    foreign key (barber_id, barbershop_id)
    references public.barbers (id, barbershop_id)
    on delete cascade
);

create index barber_working_hours_shop_idx on public.barber_working_hours (barbershop_id, weekday);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  full_name text not null
    check (char_length(btrim(full_name)) between 2 and 120),
  email text
    check (email is null or (position('@' in email) > 1 and char_length(email) <= 254)),
  phone text
    check (phone is null or char_length(btrim(phone)) between 8 and 24),
  birth_date date,
  notes text
    check (notes is null or char_length(notes) <= 2000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_id_shop_unique unique (id, barbershop_id)
);

create index customers_shop_idx on public.customers (barbershop_id, full_name);
create index customers_phone_idx on public.customers (barbershop_id, phone);
