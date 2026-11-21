-- Operational data only. All times in recurring schedules are shop-local.
create table public.barber_breaks (
  barbershop_id uuid not null, barber_id uuid not null, weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null, ends_at time not null, is_active boolean not null default true,
  primary key (barbershop_id,barber_id,weekday), check (starts_at < ends_at),
  foreign key (barber_id,barbershop_id) references public.barbers(id,barbershop_id) on delete cascade
);
alter table public.barber_breaks enable row level security;
revoke all on public.barber_breaks from public,anon,authenticated;
grant select,insert,update on public.barber_breaks to authenticated;
grant select on public.barber_breaks to service_role;
create policy breaks_member_read on public.barber_breaks for select to authenticated using (private.is_barbershop_member(barbershop_id));
create policy breaks_owner_insert on public.barber_breaks for insert to authenticated with check (private.has_barbershop_role(barbershop_id,'{owner}'));
create policy breaks_owner_update on public.barber_breaks for update to authenticated using (private.has_barbershop_role(barbershop_id,'{owner}'))
  with check (private.has_barbershop_role(barbershop_id,'{owner}'));

create function private.within_workday(shop uuid, professional uuid, dow integer, starts time, ends time, slot_grid boolean default false)
returns boolean language sql stable set search_path='' as $$
  with business as (
    select range_agg(tsrange(date '2000-01-01'+opens_at,date '2000-01-01'+closes_at,'[)')) hours
    from public.business_hours where barbershop_id=shop and weekday=dow and is_active
  ), working as (
    select range_agg(tsrange(date '2000-01-01'+starts_at,date '2000-01-01'+ends_at,'[)')) hours
    from public.barber_working_hours where barbershop_id=shop and barber_id=professional and weekday=dow and is_active
  )
  select exists(select from business,working,unnest(business.hours * working.hours) window_range
    where window_range @> tsrange(date '2000-01-01'+starts,date '2000-01-01'+ends,'[)')
      and (not slot_grid or mod(extract(epoch from ((date '2000-01-01'+starts)-lower(window_range))),900)=0))
$$;

-- A row revision also fences repeatable-read snapshots when a competing write commits.
create table private.schedule_revisions (
  shop_id uuid primary key references public.barbershops(id) on delete cascade, revision bigint not null default 0
);
revoke all on private.schedule_revisions from public,anon,authenticated,service_role;
create function private.lock_shop_schedule(shop uuid) returns void language sql volatile set search_path='' as $$
  insert into private.schedule_revisions as revisions(shop_id) select id from public.barbershops where id=shop
    on conflict(shop_id) do update set revision=revisions.revision+1
$$;
create function private.check_barber_break() returns trigger language plpgsql security definer set search_path='' as $$
declare tz text;
begin
  if tg_op='UPDATE' and (new.barbershop_id,new.barber_id,new.weekday) is distinct from (old.barbershop_id,old.barber_id,old.weekday) then
    raise exception 'Identidade da pausa inválida.' using errcode='23514';
  end if;
  perform private.lock_shop_schedule(new.barbershop_id);
  if not new.is_active then return new; end if;
  if not private.within_workday(new.barbershop_id,new.barber_id,new.weekday,new.starts_at,new.ends_at) then
    raise exception 'A pausa precisa estar dentro do expediente da barbearia e do profissional.' using errcode='23514';
  end if;
  select timezone into strict tz from public.barbershops where id=new.barbershop_id;
  if exists(select from public.appointments a
    cross join lateral generate_series((a.starts_at at time zone tz)::date::timestamp,(a.ends_at at time zone tz)::date::timestamp,interval '1 day') d
    where a.barbershop_id=new.barbershop_id and a.barber_id=new.barber_id and a.status in ('scheduled','confirmed','in_progress')
      and a.ends_at>now() and extract(dow from d)=new.weekday
      and (d::date+new.starts_at) at time zone tz < a.ends_at and (d::date+new.ends_at) at time zone tz > a.starts_at) then
    raise exception 'A pausa coincide com um atendimento. Ajuste ou reagende antes de salvar.' using errcode='23P01';
  end if;
  return new;
end $$;
create trigger validate_recurring_break before insert or update on public.barber_breaks for each row execute function private.check_barber_break();

create function private.check_booking_schedule() returns trigger language plpgsql security definer set search_path='' as $$
declare tz text; duration integer; local_start timestamp; local_end timestamp; day_number integer;
begin
  -- Completion fixes the identity of the service to which a verbal score belongs.
  if tg_op='UPDATE' and old.status='completed' and
    (new.status,new.barbershop_id,new.customer_id,new.barber_id,new.service_id,new.starts_at,new.ends_at) is distinct from
    (old.status,old.barbershop_id,old.customer_id,old.barber_id,old.service_id,old.starts_at,old.ends_at) then
    raise exception 'Atendimento já concluído.' using errcode='23514';
  end if;
  if new.status not in ('scheduled','confirmed','in_progress') then return new; end if;
  if tg_op='UPDATE' and old.status in ('scheduled','confirmed','in_progress') and
    (new.barbershop_id,new.barber_id,new.service_id,new.customer_id,new.starts_at,new.ends_at) is not distinct from
    (old.barbershop_id,old.barber_id,old.service_id,old.customer_id,old.starts_at,old.ends_at) then return new; end if;
  perform private.lock_shop_schedule(new.barbershop_id);
  select sh.timezone,s.duration_minutes into tz,duration from public.barbershops sh
    join public.barber_services bs on bs.barbershop_id=sh.id
    join public.services s on s.id=bs.service_id and s.is_active
    join public.barbers b on b.id=bs.barber_id and b.is_active
    join public.customers c on c.id=new.customer_id and c.barbershop_id=sh.id and c.is_active
    where sh.id=new.barbershop_id and sh.status='active' and bs.service_id=new.service_id and bs.barber_id=new.barber_id;
  if not found or new.starts_at<=statement_timestamp() or new.ends_at-new.starts_at<>make_interval(mins=>duration) then
    raise exception 'Serviço, profissional, cliente ou período indisponível.' using errcode='23514';
  end if;
  local_start:=new.starts_at at time zone tz; local_end:=new.ends_at at time zone tz; day_number:=extract(dow from local_start);
  if local_start::date<>local_end::date or not private.within_workday(new.barbershop_id,new.barber_id,day_number,local_start::time,local_end::time,true)
    or exists(select from public.barber_breaks p where p.barbershop_id=new.barbershop_id and p.barber_id=new.barber_id and p.weekday=day_number
      and p.is_active and p.starts_at<local_end::time and p.ends_at>local_start::time)
    or exists(select from public.blocked_slots b where b.barbershop_id=new.barbershop_id and (b.barber_id is null or b.barber_id=new.barber_id)
      and b.starts_at<new.ends_at and b.ends_at>new.starts_at) then
    raise exception 'Horário indisponível no expediente deste profissional.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger appointments_validate_schedule before insert or update on public.appointments for each row execute function private.check_booking_schedule();

-- Serialize both sides of availability changes. A change in working hours must retain enabled breaks.
create function private.schedule_edit_lock() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then perform private.lock_shop_schedule(old.barbershop_id); return old; end if;
  perform private.lock_shop_schedule(new.barbershop_id);
  if tg_table_name='blocked_slots' and exists(select from public.appointments a where a.barbershop_id=new.barbershop_id
    and (new.barber_id is null or a.barber_id=new.barber_id) and a.status in ('scheduled','confirmed','in_progress')
    and a.starts_at<new.ends_at and a.ends_at>new.starts_at) then
    raise exception 'Há atendimento no período do bloqueio.' using errcode='23P01';
  end if;
  return new;
end $$;
create trigger schedule_block_lock before insert or update or delete on public.blocked_slots for each row execute function private.schedule_edit_lock();

create function private.guard_hours_breaks() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select from public.barber_breaks b where b.barbershop_id=old.barbershop_id and b.weekday=old.weekday and b.is_active
    and not private.within_workday(b.barbershop_id,b.barber_id,b.weekday,b.starts_at,b.ends_at)) then
    raise exception 'Ajuste a pausa ativa antes de reduzir o expediente.' using errcode='23514';
  end if;
  return null;
end $$;
create function private.lock_hours_edit() returns trigger language plpgsql set search_path='' security definer as $$
begin
  if tg_op='DELETE' then perform private.lock_shop_schedule(old.barbershop_id); return old; end if;
  perform private.lock_shop_schedule(new.barbershop_id); return new;
end $$;
create trigger schedule_hours_lock before insert or update or delete on public.business_hours for each row execute function private.lock_hours_edit();
create trigger professional_hours_lock before insert or update or delete on public.barber_working_hours for each row execute function private.lock_hours_edit();
create constraint trigger schedule_hours_breaks after update or delete on public.business_hours deferrable initially deferred for each row execute function private.guard_hours_breaks();
create constraint trigger professional_hours_breaks after update or delete on public.barber_working_hours deferrable initially deferred for each row execute function private.guard_hours_breaks();

create function public.book_new_walk_in(shop uuid, professional uuid, service uuid, customer_name text, starts timestamptz, note text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare customer uuid; booking uuid; amount integer; duration integer;
begin
  if not private.is_barbershop_member(shop) then raise insufficient_privilege; end if;
  select price_cents,duration_minutes into strict amount,duration from public.services where barbershop_id=shop and id=service and is_active;
  insert into public.customers(barbershop_id,full_name) values(shop,btrim(customer_name)) returning id into customer;
  insert into public.appointments(barbershop_id,customer_id,barber_id,service_id,starts_at,ends_at,status,price_cents,notes,created_by)
    values(shop,customer,professional,service,starts,starts+make_interval(mins=>duration),'scheduled',amount,nullif(btrim(note),''),auth.uid()) returning id into booking;
  return booking;
end $$;

create table public.appointment_ratings (
  appointment_id uuid primary key, barbershop_id uuid not null, barber_id uuid not null,
  barber_score smallint check(barber_score between 0 and 10), shop_score smallint check(shop_score between 0 and 10),
  recorded_by uuid references auth.users(id) on delete set null, recorded_at timestamptz not null default now(),
  check (barber_score is not null or shop_score is not null),
  foreign key (appointment_id,barbershop_id) references public.appointments(id,barbershop_id) on delete cascade,
  foreign key (barber_id,barbershop_id) references public.barbers(id,barbershop_id)
);
create index ratings_shop_barber on public.appointment_ratings(barbershop_id,barber_id);
alter table public.appointment_ratings enable row level security;
revoke all on public.appointment_ratings from public,anon,authenticated;
grant select on public.appointment_ratings to authenticated;
create policy ratings_owner_read on public.appointment_ratings for select to authenticated using(private.has_barbershop_role(barbershop_id,'{owner}'));
create function public.complete_rated_appointment(shop uuid, booking uuid, barber_score integer, shop_score integer)
returns void language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype; prior public.appointment_ratings%rowtype;
begin
  perform from public.barbershop_members m join public.barbershops s on m.barbershop_id=s.id
    where m.barbershop_id=shop and m.user_id=auth.uid() and m.is_active and s.status='active' for share of m,s;
  if not found then raise insufficient_privilege; end if;
  select * into strict a from public.appointments where id=booking and barbershop_id=shop for update;
  if barber_score not between 0 and 10 or shop_score not between 0 and 10 then raise exception 'Nota inválida' using errcode='22023'; end if;
  if a.status='completed' then
    select * into prior from public.appointment_ratings where appointment_id=booking;
    if (prior.barber_score,prior.shop_score) is distinct from (barber_score,shop_score) then raise exception 'Atendimento já concluído com outra avaliação.' using errcode='23514'; end if;
    return;
  end if;
  if a.status not in ('scheduled','confirmed','in_progress') then raise exception 'Transição indisponível' using errcode='23514'; end if;
  update public.appointments set status='completed' where id=booking;
  if barber_score is not null or shop_score is not null then
    insert into public.appointment_ratings(appointment_id,barbershop_id,barber_id,barber_score,shop_score,recorded_by)
      values(booking,shop,a.barber_id,barber_score,shop_score,auth.uid());
  end if;
end $$;
create function public.rating_summary(shop uuid) returns table(barber_id uuid,average_score numeric,votes bigint)
language sql stable security invoker set search_path='' as $$
  select null::uuid,round(avg(r.shop_score),1),count(r.shop_score) from public.appointment_ratings r where r.barbershop_id=shop
  union all select r.barber_id,round(avg(r.barber_score),1),count(r.barber_score) from public.appointment_ratings r
    where r.barbershop_id=shop group by r.barber_id
$$;

alter table public.notifications add column appointment_id uuid;
alter table public.notifications add constraint notification_booking_fk foreign key(appointment_id,barbershop_id)
  references public.appointments(id,barbershop_id) on delete cascade;
create unique index booking_recipient_once on public.notifications(appointment_id,user_id) where appointment_id is not null;
create policy booking_recipient_access on public.notifications as restrictive for all to authenticated
  using(appointment_id is null or (user_id=auth.uid() and private.is_barbershop_member(barbershop_id)))
  with check(appointment_id is null or (user_id=auth.uid() and private.is_barbershop_member(barbershop_id)));
create function private.guard_booking_notice() returns trigger language plpgsql set search_path='' as $$
begin
  if (old.appointment_id is not null or new.appointment_id is not null) and current_user in ('authenticated','anon') then
    if (to_jsonb(old)-array['read_at','status','updated_at']) is distinct from (to_jsonb(new)-array['read_at','status','updated_at'])
      or new.status<>'read' or new.read_at is null then raise insufficient_privilege; end if;
    new.read_at:=coalesce(old.read_at,now());
  end if;
  return new;
end $$;
create trigger guard_booking_notice before update on public.notifications for each row execute function private.guard_booking_notice();
create function private.notify_new_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='scheduled' then
    insert into public.notifications(barbershop_id,user_id,appointment_id,title,body,status)
      select new.barbershop_id,m.user_id,new.id,'Novo agendamento','Reserva aguardando confirmação.','sent'
      from public.barbershop_members m where m.barbershop_id=new.barbershop_id and m.is_active
      on conflict (appointment_id,user_id) where appointment_id is not null do nothing;
  end if;
  return new;
end $$;
create trigger notify_new_booking after insert on public.appointments for each row execute function private.notify_new_booking();

create function public.booking_notices(shop uuid, page_size integer default 20) returns table (
  notice_id uuid, booking_id uuid, customer_name text, service_name text, barber_name text, starts timestamptz,
  booking_status public.appointment_status, is_read boolean
) language sql stable security invoker set search_path='' as $$
  select n.id,a.id,c.full_name,s.name,b.name,a.starts_at,a.status,n.read_at is not null
  from public.notifications n join public.appointments a on a.id=n.appointment_id and a.barbershop_id=n.barbershop_id
  join public.customers c on c.id=a.customer_id join public.services s on s.id=a.service_id join public.barbers b on b.id=a.barber_id
  where n.barbershop_id=shop and n.user_id=auth.uid() and private.is_barbershop_member(shop)
  order by (n.read_at is null) desc,n.created_at desc,n.id desc limit greatest(1,least(page_size,100))
$$;
revoke all on function public.booking_notices(uuid,integer) from public,anon,service_role;
grant execute on function public.booking_notices(uuid,integer) to authenticated;

revoke all on function private.within_workday(uuid,uuid,integer,time,time,boolean),private.lock_shop_schedule(uuid),private.check_barber_break(),
  private.check_booking_schedule(),private.schedule_edit_lock(),private.lock_hours_edit(),private.guard_hours_breaks(),
  private.guard_booking_notice(),private.notify_new_booking() from public,anon,authenticated,service_role;
revoke all on function public.complete_rated_appointment(uuid,uuid,integer,integer),public.rating_summary(uuid),
  public.book_new_walk_in(uuid,uuid,uuid,text,timestamptz,text) from public,anon,service_role;
grant execute on function public.complete_rated_appointment(uuid,uuid,integer,integer),public.rating_summary(uuid),
  public.book_new_walk_in(uuid,uuid,uuid,text,timestamptz,text) to authenticated;
