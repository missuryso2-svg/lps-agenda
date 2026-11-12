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
];

describe("migrações", () => {
  it("mantém migrações versionadas e na ordem esperada", () => {
    expect(migrationFiles.length).toBeGreaterThanOrEqual(7);
    expect(migrationFiles).toEqual([...migrationFiles].sort());
    expect(migrationFiles[0]).toMatch(/^20261108090000_/);
    expect(migrationFiles.at(-1)).toMatch(/grants_and_hardening\.sql$/);
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
