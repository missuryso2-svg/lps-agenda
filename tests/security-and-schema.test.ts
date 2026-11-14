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
    expect(migrationFiles.at(-1)).toMatch(/public_booking\.sql$/);
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
  it("mantém exatamente as seis variáveis no .env.example, sem valores", () => {
    const lines = read(".env.example").trim().split(/\r?\n/);

    expect(lines).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL=",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
      "SUPABASE_SERVICE_ROLE_KEY=",
      "ASAAS_API_KEY=",
      "ASAAS_WEBHOOK_TOKEN=",
      "NEXT_PUBLIC_APP_URL=",
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
