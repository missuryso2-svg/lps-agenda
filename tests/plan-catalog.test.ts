import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const catalog = read("supabase/migrations/20261114100200_plan_catalog.sql");

type CatalogPlan = {
  code: string;
  name: string;
  description: string;
  priceCents: number;
  interval: string;
  features: string[];
  maxBarbers: number;
  isActive: boolean;
  currency: string;
  trialDays: number;
};

function unquote(value: string): string {
  return value.replace(/,$/, "").replace(/^'/, "").replace(/'$/, "");
}

function planBlock(code: string): string {
  const match = catalog.match(
    new RegExp(`\\(\\s*'${code}',[\\s\\S]*?\\n  \\)`),
  );

  if (!match) {
    throw new Error(`Plano ${code} não encontrado na migration.`);
  }

  return match[0];
}

function parsePlan(code: string): CatalogPlan {
  const lines = planBlock(code)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const featureLine = lines[6]?.replace(/,$/, "") ?? "";
  const features = JSON.parse(
    featureLine.slice(1, featureLine.lastIndexOf("'")),
  ) as string[];

  return {
    code: unquote(lines[1] ?? ""),
    name: unquote(lines[2] ?? ""),
    description: unquote(lines[3] ?? ""),
    priceCents: Number((lines[4] ?? "").replace(",", "")),
    interval: unquote(lines[5] ?? ""),
    features,
    maxBarbers: Number((lines[7] ?? "").replace(",", "")),
    isActive: (lines[8] ?? "") === "true,",
    currency: unquote(lines[9] ?? ""),
    trialDays: Number(lines[10] ?? ""),
  };
}

const plans = ["basico", "profissional", "premium"].map(parsePlan);

const expected = {
  basico: {
    name: "Básico",
    description: "Entrada",
    priceCents: 4990,
    maxBarbers: 1,
    trialDays: 7,
    features: [
      "Agenda online",
      "Cadastro de clientes",
      "Cadastro de serviços",
      "Gestão de profissionais",
      "Controle de horários",
      "Painel administrativo",
    ],
  },
  profissional: {
    name: "Profissional",
    description: "Mais recomendado",
    priceCents: 7990,
    maxBarbers: 5,
    trialDays: 7,
    features: [
      "Agenda online",
      "Cadastro de clientes",
      "Cadastro de serviços",
      "Gestão de profissionais",
      "Controle de horários",
      "Painel administrativo",
      "Relatórios financeiros",
      "Histórico de agendamentos",
      "Indicadores de desempenho",
      "Gestão aprimorada da equipe",
    ],
  },
  premium: {
    name: "Premium",
    description: "Completo",
    priceCents: 11990,
    maxBarbers: 10,
    trialDays: 7,
    features: [
      "Agenda online",
      "Cadastro de clientes",
      "Cadastro de serviços",
      "Gestão de profissionais",
      "Controle de horários",
      "Painel administrativo",
      "Relatórios financeiros",
      "Histórico de agendamentos",
      "Indicadores de desempenho",
      "Gestão aprimorada da equipe",
      "Relatórios avançados",
      "Indicadores de crescimento",
      "Gestão completa da operação",
      "Prioridade no suporte",
    ],
  },
} as const;

describe("catálogo oficial de planos", () => {
  it("cadastra exatamente os três planos oficiais, sem duplicados", () => {
    const blocks =
      catalog.match(/\(\s*'(?:basico|profissional|premium)',[\s\S]*?\n  \)/g) ??
      [];

    expect(blocks).toHaveLength(3);
    expect(plans.map((plan) => plan.code)).toEqual([
      "basico",
      "profissional",
      "premium",
    ]);
    expect(new Set(plans.map((plan) => plan.code)).size).toBe(3);
  });

  it("usa UPSERT idempotente pela slug estável", () => {
    expect(catalog).toContain("insert into public.plans");
    expect(catalog).toContain("on conflict (code) do update");
    expect(catalog).toContain("add column if not exists currency");
    expect(catalog).toContain("add column if not exists trial_days");
  });

  it.each(["basico", "profissional", "premium"] as const)(
    "configura nome, descrição, preço, limite, ciclo e trial do plano %s",
    (code) => {
      const plan = parsePlan(code);
      const reference = expected[code];

      expect(plan.name).toBe(reference.name);
      expect(plan.description).toBe(reference.description);
      expect(plan.priceCents).toBe(reference.priceCents);
      expect(plan.maxBarbers).toBe(reference.maxBarbers);
      expect(plan.trialDays).toBe(reference.trialDays);
      expect(plan.interval).toBe("month");
      expect(plan.currency).toBe("BRL");
      expect(plan.isActive).toBe(true);
    },
  );

  it.each(["basico", "profissional", "premium"] as const)(
    "mantém as funcionalidades oficiais do plano %s",
    (code) => {
      expect(parsePlan(code).features).toEqual([...expected[code].features]);
    },
  );

  it("faz os planos superiores herdarem todos os recursos anteriores", () => {
    const basico = new Set(parsePlan("basico").features);
    const profissional = new Set(parsePlan("profissional").features);
    const premium = new Set(parsePlan("premium").features);

    for (const feature of basico) {
      expect(profissional.has(feature)).toBe(true);
      expect(premium.has(feature)).toBe(true);
    }

    for (const feature of profissional) {
      expect(premium.has(feature)).toBe(true);
    }
  });

  it("registra a coluna de moeda com padrão BRL e trial de 0 a 365 dias", () => {
    expect(catalog).toContain("currency ~ '^[A-Z]{3}$'");
    expect(catalog).toContain("trial_days between 0 and 365");
    expect(catalog).toContain("default 'BRL'");
  });
});

describe("integração da interface com o catálogo", () => {
  it("consulta preço, limite, moeda e trial diretamente do Supabase", () => {
    const queries = read("src/features/billing/queries.ts");

    expect(queries).toContain("currency, trial_days");
    expect(queries).toContain('.eq("is_active", true)');
  });

  it("mantém valores e limites no painel privado do contrato legado", () => {
    const manager = read(
      "src/features/billing/components/billing-manager.tsx",
    );

    expect(manager).toContain("plan.name");
    expect(manager).toContain("plan.description");
    expect(manager).toContain(
      "formatCurrencyFromCents(plan.price_cents, plan.currency)",
    );
    expect(manager).toContain("plan.max_barbers");
    expect(manager).not.toContain("Iniciar teste grátis");
    expect(manager).toContain("Mais recomendado");
    expect(manager).toContain('plan.code === "profissional"');
  });


});

describe("limites no servidor", () => {
  it("lê o limite da assinatura e do plano no banco antes de mutar a equipe", () => {
    const limit = read("src/features/barbers/plan-limit.ts");
    const actions = read("src/features/barbers/actions.ts");

    expect(limit).toContain('.rpc("get_shop_professional_limit"');
    const access = read("supabase/migrations/20261118140000_manual_trial_access.sql");
    expect(access).toContain("from public.subscriptions s join public.plans p");
    expect(limit).toContain("max_barbers");
    expect(actions).toContain("validateBarberLimit");
    expect(actions).toContain("getPlanBarberLimit");
    expect(actions).toContain("parsed.data.isActive");
  });

  it("reforça o limite no banco para chamadas diretas à Data API", () => {
    const sql = read("supabase/migrations/20261114100300_barber_plan_limit.sql");

    expect(sql).toContain("create or replace function private.enforce_barber_plan_limit");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("s.status in ('pending', 'trialing', 'active', 'past_due')");
    expect(sql).toContain("before insert or update of is_active on public.barbers");
    expect(sql).toContain("errcode = '23514'");
  });
});

describe("proteção contra preço e limite arbitrários", () => {
  it("mantém preço e limite fora do contrato de entrada da contratação", () => {
    const validation = read("src/lib/validation/billing.ts");
    const startSchema = validation.slice(
      validation.indexOf("export const startSubscriptionSchema"),
      validation.indexOf("export const changePlanSchema"),
    );

    expect(startSchema).not.toContain("price");
    expect(startSchema).not.toContain("max_barbers");
    expect(startSchema).not.toContain("trial");
    expect(startSchema).toContain("planId");
  });

  it("usa o preço do plano carregado do banco ao chamar o gateway", () => {
    const service = read("src/features/billing/service.ts");

    expect(service).toContain("findActivePlan");
    expect(service).toContain('.eq("is_active", true)');
    expect(service).toContain("valueCents: plan.price_cents");
    expect(service).not.toMatch(/input\.price_cents/);
  });
});
