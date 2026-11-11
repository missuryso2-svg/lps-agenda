-- LPS Agenda — Row Level Security
-- Toda tabela do schema public nasce com RLS habilitado.
-- Regra central: o usuário só acessa dados de barbearias das quais é membro ativo.
-- O administrador global é reconhecido apenas por app_metadata.lps_role = 'platform_admin'.

alter table public.profiles enable row level security;
alter table public.barbershops enable row level security;
alter table public.barbershop_members enable row level security;
alter table public.barbers enable row level security;
alter table public.services enable row level security;
alter table public.barber_services enable row level security;
alter table public.business_hours enable row level security;
alter table public.barber_working_hours enable row level security;
alter table public.blocked_slots enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- profiles
create policy profiles_select_self_shared_or_admin
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_platform_admin())
    or (select private.shares_barbershop(id))
  );

create policy profiles_update_self_or_admin
  on public.profiles for update to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_platform_admin())
  )
  with check (
    id = (select auth.uid())
    or (select private.is_platform_admin())
  );

create policy profiles_delete_admin
  on public.profiles for delete to authenticated
  using ((select private.is_platform_admin()));

-- barbershops
create policy barbershops_select_member_or_admin
  on public.barbershops for select to authenticated
  using (
    (select private.is_barbershop_member(id))
    or (select private.is_platform_admin())
  );

create policy barbershops_update_owner_or_admin
  on public.barbershops for update to authenticated
  using (
    (select private.has_barbershop_role(id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.has_barbershop_role(id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

-- barbershop_members
create policy barbershop_members_select_team_or_admin
  on public.barbershop_members for select to authenticated
  using (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy barbershop_members_insert_owner_or_admin
  on public.barbershop_members for insert to authenticated
  with check (
    (select private.is_platform_admin())
    or (
      (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
      and role = 'staff'
    )
  );

create policy barbershop_members_update_owner_or_admin
  on public.barbershop_members for update to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy barbershop_members_delete_owner_or_admin
  on public.barbershop_members for delete to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

-- barbers
create policy barbers_select_member_or_admin
  on public.barbers for select to authenticated
  using (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy barbers_insert_owner_or_admin
  on public.barbers for insert to authenticated
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy barbers_update_owner_or_admin
  on public.barbers for update to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy barbers_delete_owner_or_admin
  on public.barbers for delete to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

-- services
create policy services_select_member_or_admin
  on public.services for select to authenticated
  using (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy services_insert_owner_or_admin
  on public.services for insert to authenticated
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy services_update_owner_or_admin
  on public.services for update to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy services_delete_owner_or_admin
  on public.services for delete to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

-- barber_services
create policy barber_services_select_member_or_admin
  on public.barber_services for select to authenticated
  using (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy barber_services_insert_owner_or_admin
  on public.barber_services for insert to authenticated
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy barber_services_update_owner_or_admin
  on public.barber_services for update to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy barber_services_delete_owner_or_admin
  on public.barber_services for delete to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

-- business_hours
create policy business_hours_select_member_or_admin
  on public.business_hours for select to authenticated
  using (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy business_hours_insert_owner_or_admin
  on public.business_hours for insert to authenticated
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy business_hours_update_owner_or_admin
  on public.business_hours for update to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy business_hours_delete_owner_or_admin
  on public.business_hours for delete to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

-- barber_working_hours
create policy barber_working_hours_select_member_or_admin
  on public.barber_working_hours for select to authenticated
  using (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy barber_working_hours_insert_owner_or_admin
  on public.barber_working_hours for insert to authenticated
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy barber_working_hours_update_owner_or_admin
  on public.barber_working_hours for update to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy barber_working_hours_delete_owner_or_admin
  on public.barber_working_hours for delete to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

-- blocked_slots
create policy blocked_slots_select_member_or_admin
  on public.blocked_slots for select to authenticated
  using (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy blocked_slots_insert_owner_or_admin
  on public.blocked_slots for insert to authenticated
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy blocked_slots_update_owner_or_admin
  on public.blocked_slots for update to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy blocked_slots_delete_owner_or_admin
  on public.blocked_slots for delete to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

-- customers
create policy customers_select_member_or_admin
  on public.customers for select to authenticated
  using (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy customers_insert_member_or_admin
  on public.customers for insert to authenticated
  with check (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy customers_update_member_or_admin
  on public.customers for update to authenticated
  using (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy customers_delete_owner_or_admin
  on public.customers for delete to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

-- appointments
create policy appointments_select_member_or_admin
  on public.appointments for select to authenticated
  using (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy appointments_insert_member_or_admin
  on public.appointments for insert to authenticated
  with check (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy appointments_update_member_or_admin
  on public.appointments for update to authenticated
  using (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.is_barbershop_member(barbershop_id))
    or (select private.is_platform_admin())
  );

create policy appointments_delete_owner_or_admin
  on public.appointments for delete to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

-- plans (catálogo global)
create policy plans_select_authenticated
  on public.plans for select to authenticated
  using (true);

create policy plans_insert_admin
  on public.plans for insert to authenticated
  with check ((select private.is_platform_admin()));

create policy plans_update_admin
  on public.plans for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy plans_delete_admin
  on public.plans for delete to authenticated
  using ((select private.is_platform_admin()));

-- subscriptions (dados financeiros: proprietário ou admin da plataforma)
create policy subscriptions_select_owner_or_admin
  on public.subscriptions for select to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy subscriptions_insert_admin
  on public.subscriptions for insert to authenticated
  with check ((select private.is_platform_admin()));

create policy subscriptions_update_admin
  on public.subscriptions for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy subscriptions_delete_admin
  on public.subscriptions for delete to authenticated
  using ((select private.is_platform_admin()));

-- payments (dados financeiros: proprietário ou admin da plataforma)
create policy payments_select_owner_or_admin
  on public.payments for select to authenticated
  using (
    (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    or (select private.is_platform_admin())
  );

create policy payments_insert_admin
  on public.payments for insert to authenticated
  with check ((select private.is_platform_admin()));

create policy payments_update_admin
  on public.payments for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy payments_delete_admin
  on public.payments for delete to authenticated
  using ((select private.is_platform_admin()));

-- webhook_events
create policy webhook_events_select_admin
  on public.webhook_events for select to authenticated
  using ((select private.is_platform_admin()));

-- notifications
create policy notifications_select_own_or_admin
  on public.notifications for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_platform_admin())
  );

create policy notifications_update_own_or_admin
  on public.notifications for update to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_platform_admin())
  )
  with check (
    user_id = (select auth.uid())
    or (select private.is_platform_admin())
  );

create policy notifications_delete_own_or_admin
  on public.notifications for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_platform_admin())
  );

-- audit_logs
create policy audit_logs_select_owner_or_admin
  on public.audit_logs for select to authenticated
  using (
    (select private.is_platform_admin())
    or (
      barbershop_id is not null
      and (select private.has_barbershop_role(barbershop_id, array['owner']::public.barbershop_member_role[]))
    )
  );
