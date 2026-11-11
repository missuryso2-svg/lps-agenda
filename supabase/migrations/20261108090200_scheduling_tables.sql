-- LPS Agenda — bloqueios de agenda e agendamentos

set search_path = public, extensions;

create table public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  barber_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text
    check (reason is null or char_length(reason) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocked_slots_time_check check (ends_at > starts_at),
  constraint blocked_slots_barber_fk
    foreign key (barber_id, barbershop_id)
    references public.barbers (id, barbershop_id)
    on delete cascade
);

create index blocked_slots_shop_range_idx
  on public.blocked_slots (barbershop_id, starts_at, ends_at);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  customer_id uuid not null,
  barber_id uuid not null,
  service_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  price_cents integer not null
    check (price_cents between 0 and 100000000),
  notes text
    check (notes is null or char_length(notes) <= 2000),
  cancel_reason text
    check (cancel_reason is null or char_length(cancel_reason) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_time_check check (ends_at > starts_at),
  constraint appointments_id_shop_unique unique (id, barbershop_id),
  constraint appointments_customer_fk
    foreign key (customer_id, barbershop_id)
    references public.customers (id, barbershop_id)
    on delete restrict,
  constraint appointments_barber_fk
    foreign key (barber_id, barbershop_id)
    references public.barbers (id, barbershop_id)
    on delete restrict,
  constraint appointments_service_fk
    foreign key (service_id, barbershop_id)
    references public.services (id, barbershop_id)
    on delete restrict
);

comment on table public.appointments is
  'Agendamento com isolamento por barbershop_id. Sobreposição por profissional é bloqueada no banco.';

create index appointments_shop_range_idx
  on public.appointments (barbershop_id, starts_at);
create index appointments_barber_range_idx
  on public.appointments (barber_id, starts_at);
create index appointments_customer_idx
  on public.appointments (customer_id, starts_at desc);
create index appointments_status_idx
  on public.appointments (barbershop_id, status);

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    barber_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('scheduled', 'confirmed', 'in_progress'));
