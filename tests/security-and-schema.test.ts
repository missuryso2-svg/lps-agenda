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
