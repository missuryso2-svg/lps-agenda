import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function listFiles(directory: string): string[] {
  return readdirSync(join(root, directory)).flatMap((entry) => {
    const relativePath = join(directory, entry);
    const absolutePath = join(root, relativePath);

    if (statSync(absolutePath).isDirectory()) {
      return listFiles(relativePath);
    }

    return [relativePath];
  });
}

const migrationFiles = readdirSync(join(root, "supabase/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const migrationSql = migrationFiles
  .map((file) => read(join("supabase/migrations", file)))
  .join("\n");

const tenantTables = [
  "barbershop_members",
  "barbers",
  "services",
  "barber_services",
  "business_hours",
  "barber_working_hours",
  "blocked_slots",
  "customers",
  "appointments",
  "subscriptions",
  "payments",
  "notifications",
  "billing_remote_cleanup_jobs",
];

const allTables = [
  "profiles",
  "barbershops",
  ...tenantTables,
  "plans",
  "webhook_events",
  "audit_logs",
  "booking_rate_limits",
];

describe("migrações", () => {
  it("mantém migrações versionadas e na ordem esperada", () => {
    expect(migrationFiles.length).toBeGreaterThanOrEqual(7);
    expect(migrationFiles).toEqual([...migrationFiles].sort());
    expect(migrationFiles[0]).toMatch(/^20261108090000_/);
    expect(migrationFiles).toContain(
      "20261115120000_subscription_cancel_reason.sql",
    );
    expect(migrationFiles.slice(-6)).toEqual([
      "20261117120000_asaas_payment_transition_guard.sql",
      "20261118120000_manual_billing_foundation.sql",
      "20261118130000_manual_trial_onboarding.sql",
      "20261118140000_manual_trial_access.sql",
      "20261119120000_manual_billing_operations.sql",
      "20261119160000_financial_operators.sql",
    ]);
  });

  it("mantém a migration de concorrência aditiva e sem índice redundante", () => {
    const migration = read(
      "supabase/migrations/20261115130000_subscription_checkout_concurrency.sql",
    );
    const billingAsaasMigration = read(
      "supabase/migrations/20261114100100_billing_asaas.sql",
    );

    for (const column of [
      "checkout_locked_at",
      "checkout_attempted_at",
      "checkout_attempts",
      "checkout_error",
      "remote_cleanup_pending",
    ]) {
      expect(migration).toContain(`add column if not exists ${column}`);
    }

    expect(migration).toContain("subscriptions_checkout_attempts_check");
    expect(migration).toContain("subscriptions_checkout_error_length_check");
    expect(migration).toContain("duplicated_shops");
    expect(migration).toContain("raise exception");
    expect(migration).toMatch(/transa[çc][ãa]o/i);
    expect(migration).not.toContain(
      "subscriptions_one_paid_pending_per_shop_idx",
    );
    expect(migration).not.toMatch(/\bcreate\s+(unique\s+)?index\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\bdrop\s+(table|index)\b/i);

    const alteredTables = Array.from(
      migration.matchAll(/alter\s+table\s+public\.(\w+)/gi),
      (match) => match[1],
    );

    expect(new Set(alteredTables)).toEqual(new Set(["subscriptions"]));
    expect(billingAsaasMigration).toContain(
      "where status in ('pending', 'trialing', 'active', 'past_due');",
    );

    for (const previous of [
      "20261114100100_billing_asaas.sql",
      "20261114100400_trial_operation.sql",
      "20261115120000_subscription_cancel_reason.sql",
    ]) {
      expect(migrationFiles).toContain(previous);
    }
  });

  it("adiciona fencing do checkout e outbox durável de compensação", () => {
    const migration = read(
      "supabase/migrations/20261115140000_billing_checkout_fencing_and_cleanup.sql",
    );

    expect(migration).toContain(
      "add column if not exists checkout_lease_token uuid",
    );
    expect(migration).toContain(
      "create table public.billing_remote_cleanup_jobs",
    );

    for (const column of [
      "subscription_id",
      "barbershop_id",
      "provider",
      "external_reference",
      "gateway_subscription_id",
      "status",
      "attempts",
      "locked_at",
      "lease_token",
      "next_attempt_at",
      "last_error",
      "created_at",
      "updated_at",
      "completed_at",
    ]) {
      expect(migration).toMatch(new RegExp(`^\\s+${column}\\b`, "m"));
    }

    for (const status of [
      "pending",
      "processing",
      "retry",
      "completed",
      "manual_review",
    ]) {
      expect(migration).toContain(`'${status}'`);
    }

    expect(migration).toContain("billing_remote_cleanup_jobs_lease_check");
    expect(migration).toContain("billing_remote_cleanup_jobs_completion_check");
    expect(migration).toContain("billing_remote_cleanup_jobs_processing_check");
    expect(migration).toContain(
      "billing_remote_cleanup_jobs_one_open_per_subscription_idx",
    );
    expect(migration).toContain("where status <> 'completed'");
    expect(migration).toContain("billing_remote_cleanup_jobs_due_idx");
    expect(migration).toContain("billing_remote_cleanup_jobs_stale_idx");
    expect(migration).toContain("billing_remote_cleanup_jobs_shop_idx");

    expect(migration).toContain(
      "alter table public.billing_remote_cleanup_jobs enable row level security;",
    );
    expect(migration).toContain(
      "revoke all on table public.billing_remote_cleanup_jobs from authenticated;",
    );
    expect(migration).toContain(
      "revoke all on table public.billing_remote_cleanup_jobs from anon;",
    );
    expect(migration).toMatch(
      /grant select, insert, update, delete\s+on public\.billing_remote_cleanup_jobs to service_role;/,
    );

    expect(migration).toContain(
      "create or replace function public.cancel_subscription_with_cleanup(",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public.subscriptions s");
    expect(migration).toContain(
      "from public.billing_remote_cleanup_jobs j",
    );
    expect(migration).toContain("for update;");
    expect(migration).toContain("when unique_violation then");
    expect(migration).toContain("checkout_lease_token = null");
    expect(migration).toContain("remote_cleanup_pending = v_pending");

    expect(migration).toMatch(
      /revoke all on function public\.cancel_subscription_with_cleanup\(uuid, uuid, text\)\s+from authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.cancel_subscription_with_cleanup\(uuid, uuid, text\)\s+to service_role;/,
    );

    // O backfill converte sinais legados em jobs duráveis, sem remover dados.
    expect(migration).toMatch(
      /insert into public\.billing_remote_cleanup_jobs[\s\S]*where s\.remote_cleanup_pending = true/,
    );

    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\bdrop\s+(table|index|column)\b/i);
    expect(migration).not.toContain("security invoker");
  });

  it("adiciona fencing próprio ao trial e invalida os leases no cancelamento", () => {
    const migration = read(
      "supabase/migrations/20261116100000_billing_concurrency_hardening.sql",
    );

    expect(migration).toContain(
      "add column if not exists trial_finalization_lease_token uuid",
    );
    expect(migration).toContain(
      "create or replace function public.cancel_subscription_with_cleanup(",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("gateway_status = 'inactive'");
    expect(migration).toContain("checkout_lease_token = null");
    expect(migration).toContain("trial_finalization_lease_token = null");
    expect(migration).toMatch(
      /revoke all on function public\.cancel_subscription_with_cleanup\(uuid, uuid, text\)\s+from authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.cancel_subscription_with_cleanup\(uuid, uuid, text\)\s+to service_role;/,
    );
  });

  it("persiste a tolerância de 72h e protege inserts e reagendamentos no banco", () => {
    const migration = read(
      "supabase/migrations/20261116120000_subscription_booking_grace_period.sql",
    );

    expect(migration).toContain(
      "add column if not exists past_due_since timestamptz",
    );
    expect(migration).toContain(
      "add column if not exists grace_period_ends_at timestamptz",
    );
    expect(migration).toContain("v_transition_time timestamptz := clock_timestamp()");
    expect(migration).toContain("interval '72 hours'");
    expect(migration).toContain("create or replace function private.set_subscription_past_due_grace()");
    expect(migration).toContain("old.status = 'past_due'");
    expect(migration).toContain("new.past_due_since := null");
    expect(migration).toContain("new.grace_period_ends_at := null");
    expect(migration).toContain("create or replace function public.get_barbershop_booking_access(");
    expect(migration).toContain("v_now timestamptz := clock_timestamp()");
    expect(migration).toContain("create or replace function private.enforce_appointment_booking_grace()");
    expect(migration).toContain("for share");
    expect(migration).toContain("before insert or update on public.appointments");
    expect(migration).toContain("using errcode = 'P0001'");
    expect(migration).toMatch(
      /revoke all on function public\.get_barbershop_booking_access\(uuid\)\s+from authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_barbershop_booking_access\(uuid\)\s+to service_role;/,
    );
  });

  it("habilita RLS em todas as tabelas do schema public", () => {
    for (const table of allTables) {
      expect(migrationSql).toContain(
        `alter table public.${table} enable row level security;`,
      );
    }
  });

  it("isola as tabelas operacionais por barbershop_id", () => {
    for (const table of tenantTables) {
      expect(migrationSql).toContain(`public.${table}`);
      expect(migrationSql).toMatch(
        new RegExp(
          `create table public\\.${table} \\([\\s\\S]*?barbershop_id`,
          "m",
        ),
      );
    }
  });

  it("reconhece administrador global apenas em app_metadata", () => {
    expect(migrationSql).toContain(
      "auth.jwt() -> 'app_metadata' ->> 'lps_role'",
    );
    expect(migrationSql).not.toMatch(/user_metadata[\s\S]{0,80}lps_role/);
  });

  it("cria onboarding transacional sem confiar no cliente", () => {
    expect(migrationSql).toContain(
      "create or replace function public.create_barbershop",
    );
    expect(migrationSql).toContain("security definer");
    expect(migrationSql).toContain("v_user_id uuid := (select auth.uid());");
    expect(migrationSql).toContain("p_name text");
  });

  it("protege contra sobreposição de agenda", () => {
    expect(migrationSql).toContain("appointments_no_overlap");
    expect(migrationSql).toContain("exclude using gist");
    expect(migrationSql).toContain("tstzrange(starts_at, ends_at, '[)')");
  });

  it("não entrega acesso anônimo às tabelas de negócio", () => {
    expect(migrationSql).toContain(
      "revoke all on all tables in schema public from anon;",
    );
    expect(migrationSql).toContain(
      "grant select on all tables in schema public to authenticated;",
    );
  });

  it("restringe dados financeiros ao proprietário ou admin da plataforma", () => {
    expect(migrationSql).toContain(
      "create policy subscriptions_select_owner_or_admin",
    );
    expect(migrationSql).toContain(
      "create policy payments_select_owner_or_admin",
    );
    expect(migrationSql).not.toContain(
      "create policy subscriptions_select_member_or_admin",
    );
    expect(migrationSql).not.toContain(
      "create policy payments_select_member_or_admin",
    );
  });

  it("restringe escrita do catálogo e dos vínculos ao proprietário ou admin", () => {
    for (const table of ["barbers", "services", "barber_services"]) {
      expect(migrationSql).toContain(
        `create policy ${table}_select_member_or_admin`,
      );

      for (const action of ["insert", "update", "delete"]) {
        expect(migrationSql).toContain(
          `create policy ${table}_${action}_owner_or_admin`,
        );
      }
    }
  });

  it("restringe escrita dos horários e bloqueios ao proprietário ou admin", () => {
    for (const table of [
      "business_hours",
      "barber_working_hours",
      "blocked_slots",
    ]) {
      expect(migrationSql).toContain(
        `create policy ${table}_select_member_or_admin`,
      );

      for (const action of ["insert", "update", "delete"]) {
        expect(migrationSql).toContain(
          `create policy ${table}_${action}_owner_or_admin`,
        );
      }
    }
  });
});

describe("ambiente e segredos", () => {
  it("documenta as variáveis e mantém o onboarding manual desligado", () => {
    const lines = read(".env.example").trim().split(/\r?\n/);

    expect(lines).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL=",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
      "SUPABASE_SERVICE_ROLE_KEY=",
      "MANUAL_TRIAL_ONBOARDING_ENABLED=false",
      "ASAAS_ENV=sandbox",
      "ASAAS_API_KEY=",
      "ASAAS_WEBHOOK_TOKEN=",
      "NEXT_PUBLIC_APP_URL=",
      "BILLING_CRON_SECRET=",
    ]);
  });

  it("marca o cliente administrativo como server-only", () => {
    const adminClient = read("src/lib/supabase/admin.ts");

    expect(adminClient).toContain('import "server-only"');
    expect(adminClient).toContain("getServiceRoleKey");
  });

  it("não referência segredos em arquivos client", () => {
    const files = listFiles("src").filter((file) =>
      /\.(ts|tsx)$/.test(file),
    );

    const clientFiles = files.filter((file) =>
      /^\s*["']use client["']/.test(read(file)),
    );

    expect(clientFiles.length).toBeGreaterThan(0);

    for (const file of clientFiles) {
      const source = read(file);
      const label = relative(root, join(root, file));

      expect(source, label).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(source, label).not.toContain("ASAAS_API_KEY");
      expect(source, label).not.toContain("ASAAS_WEBHOOK_TOKEN");
      expect(source, label).not.toContain("BILLING_CRON_SECRET");
      expect(source, label).not.toContain("CRON_SECRET");
      expect(source, label).not.toContain("@/lib/supabase/admin");
      expect(source, label).not.toContain("@/lib/env/server");
    }
  });

  it("não expõe segredos no cliente Supabase do navegador", () => {
    const browserClient = read("src/lib/supabase/client.ts");

    expect(browserClient).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(browserClient).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(browserClient).not.toContain("ASAAS_API_KEY");
  });
});

describe("ações de catálogo e equipe", () => {
  const servicesActions = read("src/features/services/actions.ts");
  const barbersActions = read("src/features/barbers/actions.ts");
  const scheduleActions = read("src/features/schedule/actions.ts");
  const managementAuthorization = read("src/lib/auth/management.ts");

  it("marca as mutações como Server Actions e exige autorização de gestão", () => {
    for (const source of [servicesActions, barbersActions, scheduleActions]) {
      expect(source.startsWith('"use server";')).toBe(true);
      expect(source).toContain("authorizeShopManagement()");
      expect(source).toContain("authorization.context.active.barbershop_id");
      expect(source).not.toMatch(
        /SUPABASE_SERVICE_ROLE_KEY|@\/lib\/supabase\/admin/,
      );
    }

    expect(managementAuthorization).toContain("getActiveDashboardContext");
    expect(managementAuthorization).toContain("canManageShop");
    expect(managementAuthorization).toContain("isPlatformAdmin");
    expect(managementAuthorization).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|@\/lib\/supabase\/admin/,
    );
  });

  it("não aceita barbershop_id enviado pelo formulário", () => {
    for (const source of [servicesActions, barbersActions, scheduleActions]) {
      expect(source).not.toMatch(/parsed\.data\.barbershop/i);
      expect(source).not.toMatch(/values\.barbershop/i);
      expect(source).not.toMatch(/input\.barbershop/i);
    }
  });

  it("filtra mutações e vínculos pela barbearia ativa", () => {
    expect(servicesActions).toContain('.eq("barbershop_id", barbershopId)');
    expect(barbersActions).toContain('.eq("barbershop_id", barbershopId)');
    expect(barbersActions).toContain("barbershop_id: barbershopId");
    expect(scheduleActions).toContain('.eq("barbershop_id", barbershopId)');
    expect(scheduleActions).toContain("barbershop_id: barbershopId");
  });
});

describe("clientes, RLS e integridade", () => {
  const customersActions = read("src/features/customers/actions.ts");
  const customersQueries = read("src/features/dashboard/queries.ts");
  const managementAuthorization = read("src/lib/auth/management.ts");

  it("define RLS de clientes para membros e exclusão restrita ao proprietário", () => {
    for (const action of ["select", "insert", "update"]) {
      expect(migrationSql).toContain(
        `create policy customers_${action}_member_or_admin`,
      );
    }

    expect(migrationSql).toContain(
      "create policy customers_delete_owner_or_admin",
    );
    expect(migrationSql).not.toContain(
      "create policy customers_delete_member_or_admin",
    );
  });

  it("protege o histórico com chave estrangeira restritiva", () => {
    expect(migrationSql).toContain("appointments_customer_fk");
    expect(migrationSql).toMatch(
      /appointments_customer_fk[\s\S]*?references public\.customers \(id, barbershop_id\)[\s\S]*?on delete restrict/,
    );
  });

  it("mantém o vínculo do cliente com a barbearia no banco", () => {
    expect(migrationSql).toMatch(
      /create table public\.customers \([\s\S]*?barbershop_id uuid not null references public\.barbershops/,
    );
    expect(migrationSql).toContain(
      "constraint customers_id_shop_unique unique (id, barbershop_id)",
    );
  });

  it("marca as mutações de clientes como Server Actions autorizadas", () => {
    expect(customersActions.startsWith('"use server";')).toBe(true);
    expect(customersActions).toContain("authorizeCustomerManagement()");
    expect(customersActions).toContain(
      "authorization.context.active.barbershop_id",
    );
    expect(customersActions).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|@\/lib\/supabase\/admin/,
    );
    expect(managementAuthorization).toContain(
      "export async function authorizeCustomerManagement",
    );
    expect(managementAuthorization).toContain("canOperateShop");
  });

  it("não aceita barbershop_id enviado pelo formulário de cliente", () => {
    expect(customersActions).not.toMatch(/parsed\.data\.barbershop/i);
    expect(customersActions).not.toMatch(/values\.barbershop/i);
    expect(customersActions).not.toMatch(/input\.barbershop/i);
    expect(customersActions).toContain("barbershop_id: barbershopId");
  });

  it("filtra leitura e escrita de clientes pela barbearia ativa", () => {
    expect(customersActions).toContain('.eq("barbershop_id", barbershopId)');
    expect(customersQueries).toContain(
      '.eq("barbershop_id", barbershopId)',
    );
  });

  it("usa arquivamento reversível e não expõe exclusão física", () => {
    expect(customersActions).toContain("setCustomerActiveAction");
    expect(customersActions).toContain("is_active: parsedActive.data");
    expect(customersActions).not.toMatch(/\.delete\(\)/);
    expect(customersActions).not.toContain("deleteCustomerAction");
  });

  it("verifica duplicidade dentro do tenant, incluindo arquivados", () => {
    expect(customersActions).toContain("phoneLookupVariants");
    expect(customersActions).toContain('.in("phone", phoneVariants)');
    expect(customersActions).toContain('.ilike("email", email)');
    expect(customersActions).toContain('excludeId');
    expect(customersActions).not.toContain(".eq(\"is_active\", true)");
  });
});

describe("agenda e agendamentos", () => {
  const schedulingActions = read("src/features/scheduling/actions.ts");
  const schedulingQueries = read("src/features/scheduling/queries.ts");
  const agendaPage = read("src/app/dashboard/agenda/page.tsx");
  const managementAuthorization = read("src/lib/auth/management.ts");

  it("mantém RLS de agenda para membros e exclusão restrita ao proprietário", () => {
    for (const action of ["select", "insert", "update"]) {
      expect(migrationSql).toContain(
        `create policy appointments_${action}_member_or_admin`,
      );
    }

    expect(migrationSql).toContain(
      "create policy appointments_delete_owner_or_admin",
    );
    expect(migrationSql).not.toContain(
      "create policy appointments_delete_member_or_admin",
    );
  });

  it("protege a sobreposição apenas para status ativos no PostgreSQL", () => {
    expect(migrationSql).toMatch(
      /appointments_no_overlap[\s\S]*?exclude using gist \([\s\S]*?barber_id with =,[\s\S]*?tstzrange\(starts_at, ends_at, '\[\)'\) with &&[\s\S]*?where \(status in \('scheduled', 'confirmed', 'in_progress'\)\)/,
    );
  });

  it("marca as mutações da agenda como Server Actions autorizadas", () => {
    expect(schedulingActions.startsWith('"use server";')).toBe(true);
    expect(schedulingActions).toContain("authorizeAppointmentManagement()");
    expect(schedulingActions).toContain(
      "authorization.context.active.barbershop_id",
    );
    expect(managementAuthorization).toContain(
      "export async function authorizeAppointmentManagement",
    );
    expect(managementAuthorization).toContain("canOperateShop");
    expect(schedulingActions).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|@\/lib\/supabase\/admin/,
    );
  });

  it("não aceita barbershop_id do navegador e filtra escrita pelo tenant", () => {
    expect(schedulingActions).not.toMatch(/parsed\.data\.barbershop/i);
    expect(schedulingActions).not.toMatch(/values\.barbershop/i);
    expect(schedulingActions).toContain("barbershop_id: barbershopId");
    expect(schedulingActions).toContain('.eq("barbershop_id", barbershopId)');
  });

  it("revalida a disponibilidade antes de criar e reagendar", () => {
    expect(schedulingActions).toContain("loadAvailability({");
    expect(schedulingActions).toContain("excludeAppointmentId");
    expect(schedulingActions).toContain(
      "price_cents: availability.data.priceCents",
    );
    expect(schedulingActions).toContain('status: "scheduled"');
    expect(migrationSql).toContain("appointments_no_overlap");
    expect(schedulingActions).toContain('case "23P01"');
    expect(schedulingActions).toContain("acabou de ser reservado");
  });

  it("valida cliente, serviço e profissional dentro da barbearia ativa", () => {
    const schedulingSql = `${schedulingActions}\n${schedulingQueries}`;

    for (const table of ["customers", "services", "barbers"]) {
      expect(schedulingSql).toContain(`.from("${table}")`);
    }

    expect(schedulingQueries).toContain('.eq("barbershop_id", barbershopId)');
    expect(schedulingQueries).toContain('eq("service_id", serviceId)');
    expect(schedulingQueries).toContain('eq("barber_id", barberId)');
    expect(schedulingQueries).toContain(".eq(\"is_active\", true)");
    expect(schedulingQueries).toContain(
      '.in("status", activeAppointmentStatuses)',
    );
  });

  it("carrega a agenda por período e profissional, sem varredura global", () => {
    expect(schedulingQueries).toContain(
      '.lt("starts_at", rangeEnd.toISOString())',
    );
    expect(schedulingQueries).toContain(
      '.gt("ends_at", rangeStart.toISOString())',
    );
    expect(schedulingQueries).toContain(
      'appointmentsQuery = appointmentsQuery.eq("barber_id", selectedBarberId)',
    );
    expect(agendaPage).toContain("getAgendaPageData");
    expect(agendaPage).toContain("AgendaBoard");
    expect(agendaPage).not.toContain("getAgendaForToday");
    expect(agendaPage).not.toContain("PrototypeAction");
  });

  it("não expõe exclusão física de agendamentos nesta fase", () => {
    expect(schedulingActions).not.toMatch(/\.delete\(\)/);
    expect(schedulingActions).not.toContain("deleteAppointmentAction");
  });
});

describe("agendamento público, token e rate limiting", () => {
  const publicMigration = read(
    "supabase/migrations/20261113120000_public_booking.sql",
  );
  const publicActions = read("src/features/public-booking/actions.ts");
  const publicQueries = read("src/features/public-booking/queries.ts");
  const publicService = read("src/features/public-booking/service.ts");
  const publicRateLimit = read("src/features/public-booking/rate-limit.ts");
  const publicWizard = read(
    "src/features/public-booking/components/booking-wizard.tsx",
  );
  const publicBookingPage = read("src/app/agendar/[slug]/page.tsx");
  const reservationPage = read(
    "src/app/agendar/[slug]/reserva/[token]/page.tsx",
  );

  it("cria token imprevisível e único para a reserva pública", () => {
    expect(publicMigration).toContain(
      "add column public_token uuid not null default gen_random_uuid()",
    );
    expect(publicMigration).toContain(
      "create unique index appointments_public_token_key",
    );
    expect(publicService).toContain("randomUUID()");
    expect(publicService).toContain("public_token: publicToken");
    expect(publicService).toContain('error.code === "23505"');
  });

  it("consulta e cancela somente por slug e public_token, nunca por id", () => {
    expect(publicQueries).toContain('.eq("public_token", token)');
    expect(publicService).toContain('.eq("public_token", token)');
    expect(publicService).toContain('.eq("barbershop_id", shop.id)');
    expect(publicService).not.toContain('.eq("id", token)');
    expect(publicService).not.toContain('.eq("id", slug)');
    expect(reservationPage).toContain("publicTokenSchema");
    expect(reservationPage).toContain("robots: { index: false, follow: false }");
    expect(publicBookingPage).toContain('dynamic = "force-dynamic"');
  });

  it("mantém a página pública somente server-side com service role", () => {
    expect(publicActions.startsWith('"use server";')).toBe(true);
    expect(publicQueries).toContain('import "server-only"');
    expect(publicService).toContain('import "server-only"');
    expect(publicRateLimit).toContain('import "server-only"');
    expect(publicQueries).toContain("createAdminClient");
    expect(publicActions).toContain("createAdminClient");
    expect(publicActions).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|@\/lib\/env\/server/,
    );
    expect(publicWizard).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|@\/lib\/supabase\/admin|@\/lib\/env\/server/,
    );
  });

  it("não cria políticas RLS públicas para clientes, agenda ou rate limit", () => {
    expect(publicMigration).not.toMatch(/create policy/i);
    expect(publicMigration).not.toMatch(/to anon/i);
    expect(publicMigration).not.toMatch(/grant [^;]+ to anon/i);
    expect(publicMigration).not.toMatch(
      /grant [^;]+ on (table )?public\.(appointments|customers)/i,
    );
    expect(publicMigration).toContain(
      "alter table public.booking_rate_limits enable row level security;",
    );
    expect(publicMigration).toContain(
      "revoke all on table public.booking_rate_limits from anon, authenticated;",
    );
    expect(publicMigration).toContain(
      "grant all on table public.booking_rate_limits to service_role;",
    );
  });

  it("restringe as funções internas ao service_role", () => {
    for (const [name, signature] of [
      ["consume_booking_rate_limit", "text, integer, integer"],
      ["find_or_create_public_customer", "uuid, text, text, text"],
    ]) {
      expect(publicMigration).toContain(
        `revoke all on function public.${name}(${signature})`,
      );
      expect(publicMigration).toContain(
        `from public, anon, authenticated;`,
      );
      expect(publicMigration).toContain(
        `grant execute on function public.${name}(${signature})`,
      );
      expect(publicMigration).toContain("to service_role;");
    }

    expect(publicMigration.match(/security definer/g)).toHaveLength(2);
    expect(publicMigration.match(/set search_path = ''/g)).toHaveLength(2);
    expect(publicMigration).toContain("pg_advisory_xact_lock");
    expect(publicMigration).toContain("regexp_replace(coalesce(c.phone");
    expect(publicMigration).toContain(
      "customers_shop_phone_digits_idx",
    );
  });

  it("aplica rate limit atômico com buckets hasheados e retenção curta", () => {
    expect(publicMigration).toContain(
      "on conflict (bucket, window_start)",
    );
    expect(publicMigration).toContain("hits = public.booking_rate_limits.hits + 1");
    expect(publicMigration).toContain(
      "delete from public.booking_rate_limits",
    );
    expect(publicRateLimit).toContain('createHash("sha256")');
    expect(publicRateLimit).toContain("publicBookingRateLimits");
    expect(publicActions).toContain("hashRateLimitKey");
    expect(publicActions).not.toContain("p_bucket: ip");
    expect(publicActions).not.toContain("p_bucket: phone");
  });

  it("falha fechado em escritas e aberto apenas na consulta de horários", () => {
    expect(publicActions).toContain(
      "rate limit unavailable (create ip)",
    );
    expect(publicActions).toContain("rate limit unavailable (cancel)");
    expect(publicActions).toContain(
      "rate limit unavailable (availability)",
    );
    const availabilityBlock =
      publicActions.split("export async function createPublicBookingAction")[0];

    expect(availabilityBlock).toContain(
      "// Leitura não deve derrubar a página; a escrita continua protegida.",
    );
  });

  it("não registra telefone, e-mail ou IP em logs", () => {
    const logged = publicActions
      .split("\n")
      .filter((line) => line.includes("console."));

    expect(logged.length).toBeGreaterThan(0);

    for (const line of logged) {
      expect(line).not.toMatch(/parsed\.data|ipHash|clientIp|\$\{/);
    }
  });

  it("revalida disponibilidade e ignora preço, duração e tenant do navegador", () => {
    expect(publicService).toContain("loadAvailability({");
    expect(publicService).toContain("barbershopId: shop.id");
    expect(publicService).toContain("price_cents: availability.data.priceCents");
    expect(publicService).toContain("starts_at: slot.startsAt");
    expect(publicService).toContain("ends_at: slot.endsAt");
    expect(publicService).toContain('error?.code === "23P01"');
    expect(publicService).not.toMatch(/input\.(priceCents|durationMinutes|barbershopId)/);
    expect(publicService).not.toContain("appointments_no_overlap");
    expect(migrationSql).toContain("appointments_no_overlap");
  });

  it("mantém o cancelamento condicionado ao status e ao início do atendimento", () => {
    expect(publicService).toContain(
      'appointment.status !== "scheduled"',
    );
    expect(publicService).toContain(
      'appointment.status !== "confirmed"',
    );
    expect(publicService).toContain(
      "new Date(appointment.starts_at).getTime() <= now.getTime()",
    );
    expect(publicService).toContain(
      '.in("status", ["scheduled", "confirmed"])',
    );
    expect(publicService).not.toMatch(/\.delete\(\)/);
  });
});

describe("assinatura do SaaS via Asaas Sandbox", () => {
  const enumMigration = read(
    "supabase/migrations/20261114100000_billing_asaas_enums.sql",
  );
  const billingMigration = read(
    "supabase/migrations/20261114100100_billing_asaas.sql",
  );
  const paymentTransitionMigration = read(
    "supabase/migrations/20261117120000_asaas_payment_transition_guard.sql",
  );
  const billingActions = read("src/features/billing/actions.ts");
  const billingService = read("src/features/billing/service.ts");
  const billingWebhook = read("src/features/billing/webhook.ts");
  const webhookRoute = read("src/app/api/webhooks/asaas/route.ts");
  const webhookVerification = read("src/lib/asaas/webhook.ts");
  const asaasClient = read("src/lib/asaas/client.ts");
  const serverEnv = read("src/lib/env/server.ts");
  const managementAuthorization = read("src/lib/auth/management.ts");
  const billingForm = read(
    "src/features/billing/components/start-subscription-dialog.tsx",
  );

  it("adiciona apenas valores de enum e o escopo da mensalidade", () => {
    expect(enumMigration).toContain(
      "alter type public.subscription_status add value if not exists 'pending'",
    );
    expect(enumMigration).toContain(
      "alter type public.payment_status add value if not exists 'overdue'",
    );
    expect(enumMigration).toContain(
      "alter type public.payment_method add value if not exists 'boleto'",
    );
    expect(enumMigration).toContain(
      "create type public.payment_scope as enum ('shop_service', 'platform_subscription')",
    );
  });

  it("separa a mensalidade dos serviços da barbearia no banco", () => {
    expect(billingMigration).toContain("create table public.billing_customers");
    expect(billingMigration).toContain(
      "add column scope public.payment_scope not null default 'shop_service'",
    );
    expect(billingMigration).toContain("payments_scope_subscription_check");
    expect(billingMigration).toMatch(
      /scope = 'shop_service' and subscription_id is null/,
    );
    expect(billingMigration).toMatch(
      /scope = 'platform_subscription' and subscription_id is not null/,
    );
    expect(billingMigration).toContain(
      "payments_subscription_idx",
    );
  });

  it("mantém a assinatura pendente ocupando a vaga antes do gateway", () => {
    expect(billingMigration).toContain(
      "subscriptions_one_current_per_shop_idx",
    );
    expect(billingMigration).toMatch(
      /subscriptions_one_current_per_shop_idx[\s\S]*?where status in \('pending', 'trialing', 'active', 'past_due'\)/,
    );
    expect(billingMigration).toContain(
      "subscriptions_external_reference_key",
    );
    expect(billingMigration).toContain("gateway_status");
    expect(billingMigration).toContain("pending_creation");
  });

  it("opera o trial localmente e preserva um único teste por barbearia", () => {
    const trialMigration = read(
      "supabase/migrations/20261114100400_trial_operation.sql",
    );

    expect(trialMigration).toContain(
      "add column if not exists trial_started_at timestamptz",
    );
    expect(trialMigration).toContain("contracted_price_cents");
    expect(trialMigration).toContain("contracted_currency");
    expect(trialMigration).toContain("contracted_interval");
    expect(trialMigration).toContain("trial_finalization_locked_at");
    expect(trialMigration).toContain("trial_finalization_attempts");
    expect(trialMigration).toContain(
      "create unique index if not exists subscriptions_one_trial_per_shop_idx",
    );
    expect(trialMigration).toMatch(/where trial_ends_at is not null/);
    expect(trialMigration).toContain("subscriptions_trial_due_idx");
    expect(trialMigration).toContain("subscriptions_trial_retry_idx");
  });

  it("registra o motivo do cancelamento com o mesmo limite do agendamento", () => {
    const cancelReasonMigration = read(
      "supabase/migrations/20261115120000_subscription_cancel_reason.sql",
    );

    expect(cancelReasonMigration).toContain(
      "add column if not exists cancel_reason text",
    );
    expect(cancelReasonMigration).toContain(
      "subscriptions_cancel_reason_length_check",
    );
    expect(cancelReasonMigration).toMatch(/char_length\(cancel_reason\) <= 500/);
    expect(cancelReasonMigration).toContain(
      "comment on column public.subscriptions.cancel_reason",
    );
  });

  it("protege o pagador com RLS owner-only e escrita por service role", () => {
    expect(billingMigration).toContain(
      "create policy billing_customers_select_owner_or_admin",
    );
    expect(billingMigration).toContain(
      "revoke all on table public.billing_customers from anon, authenticated;",
    );
    expect(billingMigration).toContain(
      "grant select on table public.billing_customers to authenticated;",
    );
    expect(billingMigration).toContain(
      "grant all on table public.billing_customers to service_role;",
    );
    expect(billingMigration).not.toMatch(
      /grant (insert|update|delete)[^;]*billing_customers[^;]*authenticated/i,
    );
  });

  it("exige proprietário nas ações de cobrança, sem bypass de admin global", () => {
    expect(billingActions.startsWith('"use server";')).toBe(true);
    for (const action of [
      "startSubscriptionAction",
      "changePlanAction",
      "cancelSubscriptionAction",
    ]) {
      expect(billingActions).toContain(`export async function ${action}`);
    }

    expect(billingActions).toContain("authorizeBillingOwner()");
    expect(billingActions).toContain(
      "authorization.context.active.barbershop_id",
    );
    expect(billingActions).not.toMatch(/parsed\.data\.barbershop/i);
    expect(managementAuthorization).toContain(
      "export async function authorizeBillingOwner",
    );
    expect(managementAuthorization).toMatch(
      /authorizeBillingOwner[\s\S]*?context\.active\.role !== "owner"[\s\S]*?Somente o proprietário/,
    );
  });

  it("usa service role somente no servidor, depois da autorização", () => {
    expect(billingService.startsWith('import "server-only";')).toBe(true);
    expect(billingService).toContain("createAdminClient");
    expect(billingActions).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|@\/lib\/supabase\/admin/,
    );
    expect(billingForm).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|ASAAS_API_KEY|ASAAS_WEBHOOK_TOKEN|@\/lib\/supabase\/admin|@\/lib\/env\/server/,
    );
  });

  it("restringe o ambiente ao Sandbox e mantém segredos no servidor", () => {
    expect(serverEnv).toContain('import "server-only"');
    expect(serverEnv).toContain('z.literal("sandbox")');
    expect(serverEnv).not.toContain("api.asaas.com/v3");
    expect(asaasClient).toContain('import "server-only"');
    expect(asaasClient).toContain("https://api-sandbox.asaas.com/v3");
    expect(asaasClient).not.toContain("https://api.asaas.com/v3");
    expect(asaasClient).toContain("access_token");
  });

  it("valida o webhook pelo token dedicado, nunca pela API key", () => {
    expect(webhookVerification).toContain("timingSafeEqual");
    expect(webhookVerification).toContain("getAsaasEnv().webhookToken");
    expect(webhookVerification).not.toContain("apiKey");
    expect(webhookRoute).toContain('"asaas-access-token"');
    expect(webhookRoute).toContain("verifyAsaasWebhookToken");
    expect(webhookRoute).toContain('provider: "asaas"');
    expect(webhookRoute).toContain('status: "processing"');
  });

  it("persiste o evento antes de processar e tolera duplicidade", () => {
    expect(webhookRoute).toContain('from("webhook_events")');
    expect(webhookRoute).toContain('!== "23505"');
    expect(webhookRoute).toContain('record.status === "processed"');
    expect(webhookRoute).toContain("staleProcessingMs");
    expect(billingWebhook).toContain("processablePaymentEvents");
    expect(billingWebhook).toContain("processableSubscriptionEvents");
    expect(billingWebhook).toContain(
      "// Eventos desconhecidos ou sem efeito financeiro são persistidos e ignorados.",
    );
  });

  it("só ativa a assinatura em evento financeiro confirmado", () => {
    expect(billingWebhook).toContain('case "PAYMENT_CONFIRMED"');
    expect(billingWebhook).toContain('case "PAYMENT_RECEIVED"');
    expect(billingWebhook).toMatch(
      /function canConfirmPayment[\s\S]*?event === "PAYMENT_CONFIRMED" && status === "CONFIRMED"[\s\S]*?event === "PAYMENT_RECEIVED" && status === "RECEIVED"/,
    );
    expect(billingWebhook).toContain(
      '"apply_asaas_payment_transition"',
    );
    expect(paymentTransitionMigration).toContain(
      "v_state_event = 'PAYMENT_CONFIRMED'",
    );
    expect(paymentTransitionMigration).toContain("v_target_status := 'active'");
    expect(billingWebhook).not.toMatch(
      /SUBSCRIPTION_CREATED[\s\S]{0,200}status: "active"/,
    );
    expect(billingService).toContain(
      '"Assinatura criada. O plano será ativado após a confirmação do primeiro pagamento."',
    );
  });

  it("nunca regride pagamento confirmado ou estornado por evento atrasado", () => {
    expect(billingWebhook).toContain("isOlderPaymentEvent(event, existing)");
    expect(billingWebhook).toContain('existing?.status === "refunded"');
    expect(billingWebhook).toContain('existing?.status === "cancelled"');
    expect(paymentTransitionMigration).toContain(
      "v_payment.metadata is distinct from p_expected_metadata",
    );
    expect(paymentTransitionMigration.match(/for update;/g)).toHaveLength(4);
  });

  it("serializa a transição comercial, valida tenant e preserva cancelamento futuro", () => {
    expect(paymentTransitionMigration).toContain(
      "and s.barbershop_id = v_payment.barbershop_id",
    );
    expect(paymentTransitionMigration).toContain(
      "v_subscription.status in ('canceled', 'expired')",
    );
    expect(paymentTransitionMigration).toContain(
      "v_due_date is distinct from v_current_start_date",
    );
    expect(paymentTransitionMigration).toContain(
      "v_due_date is distinct from v_current_end_date",
    );
    expect(paymentTransitionMigration).toContain("later_payment.due_date >= v_due_date");
    expect(paymentTransitionMigration).toContain("to service_role;");
    expect(paymentTransitionMigration).toContain(
      "v_next_state_event = 'PAYMENT_REFUND_DENIED'",
    );
    expect(paymentTransitionMigration).toContain(
      "v_previous_state_event <> v_restored_from_event",
    );
    expect(paymentTransitionMigration).toContain(
      "perform public.sync_subscription_from_asaas_payment(v_payment_id)",
    );
    expect(paymentTransitionMigration).toContain(
      "v_payment.metadata is distinct from p_expected_metadata",
    );
    expect(paymentTransitionMigration).not.toContain(
      "cancel_at_period_end = false",
    );
    expect(paymentTransitionMigration).toMatch(
      /apply_asaas_payment_transition[\s\S]*?from public\.subscriptions s[\s\S]*?for update;[\s\S]*?from public\.payments p[\s\S]*?for update;/,
    );
  });

  it("não coleta cartão e bloqueia cartão no banco e na validação", () => {
    expect(billingForm).not.toMatch(/cardNumber|cardToken|securityCode|cvv/i);
    expect(billingForm).toContain("BILLING_TYPES");
    expect(enumMigration).toContain("'boleto'");
    expect(billingMigration).toContain("subscriptions_billing_type_check");
    expect(billingMigration).toMatch(
      /billing_type in \('boleto', 'pix'\)/,
    );
  });

  it("sanitiza dados de cartão antes de persistir o payload", () => {
    expect(webhookVerification).toContain("sensitiveKeys");
    expect(webhookVerification).toContain("sanitizeAsaasWebhookPayload");
    expect(webhookRoute).toContain("sanitizeAsaasWebhookPayload(payload)");
  });
});
