import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase, type FakeRow } from "./helpers/fake-supabase";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  createClient: vi.fn(),
  adminCalls: 0,
  asaasConfigured: true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: state.createClient,
}));

// Importado apenas para provar que getBillingPageData não usa privilégio
// administrativo. Se o módulo passar a importar o admin client, o contador
// sobe e o teste falha.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    state.adminCalls += 1;
    return null;
  }),
}));

vi.mock("@/lib/env/server", () => ({
  isAsaasConfigured: vi.fn(() => state.asaasConfigured),
}));

import { getBillingPageData } from "@/features/billing/queries";

const SHOP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const PLAN_BASIC_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_PRO_ID = "22222222-2222-4222-8222-222222222222";
const PLAN_INACTIVE_ID = "33333333-3333-4333-8333-333333333333";
const PLAN_MISSING_ID = "99999999-9999-4999-8999-999999999999";

const SUBSCRIPTION_ID = "44444444-4444-4444-8444-444444444444";
const SUBSCRIPTION_B_ID = "55555555-5555-4555-8555-555555555555";
const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function planRow(id: string, overrides: FakeRow = {}): FakeRow {
  return {
    id,
    code: id === PLAN_PRO_ID ? "profissional" : "basico",
    name: id === PLAN_PRO_ID ? "Profissional" : "Básico",
    description: null,
    price_cents: id === PLAN_PRO_ID ? 8990 : 2990,
    interval: "month",
    features: ["agenda"],
    max_barbers: 5,
    currency: "BRL",
    trial_days: 7,
    is_active: true,
    ...overrides,
  };
}

function subscriptionRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SUBSCRIPTION_ID,
    barbershop_id: SHOP_A,
    plan_id: PLAN_BASIC_ID,
    status: "active",
    current_period_start: "2026-11-01T12:00:00.000Z",
    current_period_end: "2026-12-01T12:00:00.000Z",
    trial_started_at: null,
    trial_ends_at: null,
    cancel_at_period_end: false,
    gateway: "asaas",
    gateway_subscription_id: "sub_123",
    billing_type: "pix",
    gateway_status: "active",
    external_reference: "77777777-7777-4777-8777-777777777777",
    next_due_date: "2026-12-01",
    contracted_price_cents: 2990,
    contracted_currency: "BRL",
    contracted_interval: "month",
    canceled_at: null,
    cancel_reason: null,
    created_at: "2026-11-01T12:00:00.000Z",
    updated_at: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

function historyRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    barbershop_id: SHOP_A,
    plan_id: PLAN_BASIC_ID,
    status: "canceled",
    trial_ends_at: null,
    canceled_at: null,
    cancel_reason: null,
    created_at: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

function customerRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: CUSTOMER_ID,
    barbershop_id: SHOP_A,
    gateway: "asaas",
    gateway_customer_id: "cus_123",
    person_type: "individual",
    document_digits: "52998224725",
    holder_name: "Maria da Silva",
    email: "maria@example.com",
    phone_digits: "11999999999",
    ...overrides,
  };
}

function paymentRow(index: number, overrides: FakeRow = {}): FakeRow {
  const day = String(15 - index).padStart(2, "0");

  return {
    id: `payment-${index}`,
    barbershop_id: SHOP_A,
    subscription_id: SUBSCRIPTION_ID,
    amount_cents: 2990,
    status: "paid",
    method: "pix",
    scope: "platform_subscription",
    due_date: `2026-11-${day}`,
    paid_at: `2026-11-${day}T12:00:00.000Z`,
    invoice_url: `https://example.com/invoices/${index}`,
    created_at: `2026-11-${day}T12:00:00.000Z`,
    ...overrides,
  };
}

type FakeError = { code: string; message: string };

type FakeResult = {
  data: unknown;
  error: FakeError | null;
  count: number | null;
};

type FailingQuery = {
  select: () => FailingQuery;
  eq: () => FailingQuery;
  in: () => FailingQuery;
  order: () => FailingQuery;
  limit: () => FailingQuery;
  maybeSingle: () => Promise<FakeResult>;
  then: <TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
};

function failingQuery(error: FakeError): FailingQuery {
  const result: FakeResult = { data: null, error, count: null };
  const query: FailingQuery = {
    select: () => query,
    eq: () => query,
    in: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: () => Promise.resolve(result),
    then: (onfulfilled, onrejected) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
  };

  return query;
}

/**
 * O histórico é a segunda leitura de `subscriptions` (a primeira é a
 * assinatura atual). Este cliente devolve erro apenas para essa segunda
 * consulta, sem alterar o comportamento do módulo sob teste.
 */
function historyFailureClient(db: FakeSupabase) {
  let subscriptionReads = 0;

  return {
    from(table: string) {
      if (table === "subscriptions") {
        subscriptionReads += 1;

        if (subscriptionReads === 2) {
          return failingQuery({
            code: "PGRST500",
            message: "Falha simulada no histórico.",
          });
        }
      }

      return db.from(table);
    },
  };
}

function setup(
  seed: Record<string, FakeRow[]> = {},
  options: { asaasConfigured?: boolean; historyFailure?: boolean } = {},
) {
  const db = new FakeSupabase(seed);
  const client = options.historyFailure ? historyFailureClient(db) : db;

  state.createClient.mockImplementation(async () => client);
  state.asaasConfigured = options.asaasConfigured ?? true;

  return { db };
}

beforeEach(() => {
  state.createClient.mockReset();
  state.adminCalls = 0;
  state.asaasConfigured = true;
});

describe("consultas da página de cobrança", () => {
  it("carrega somente planos ativos em ordem crescente de preço", async () => {
    setup({
      plans: [
        planRow(PLAN_PRO_ID),
        planRow(PLAN_BASIC_ID),
        planRow(PLAN_INACTIVE_ID, { is_active: false }),
      ],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.plans.map((plan) => plan.id)).toEqual([
      PLAN_BASIC_ID,
      PLAN_PRO_ID,
    ]);
    expect(data.plans[0]).toMatchObject({
      code: "basico",
      name: "Básico",
      price_cents: 2990,
      interval: "month",
      max_barbers: 5,
      currency: "BRL",
      trial_days: 7,
    });
  });

  it("carrega a assinatura atual da barbearia e o plano associado", async () => {
    setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [
        subscriptionRow({
          id: SUBSCRIPTION_ID,
          status: "active",
          created_at: "2026-11-01T12:00:00.000Z",
        }),
        subscriptionRow({
          id: "canceled-older",
          status: "canceled",
          canceled_at: "2026-11-10T12:00:00.000Z",
          created_at: "2026-11-10T12:00:00.000Z",
        }),
        subscriptionRow({
          id: SUBSCRIPTION_B_ID,
          barbershop_id: SHOP_B,
          created_at: "2026-11-20T12:00:00.000Z",
        }),
      ],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.subscription).toMatchObject({
      id: SUBSCRIPTION_ID,
      planId: PLAN_BASIC_ID,
      status: "active",
      billingType: "pix",
      gatewayStatus: "active",
      nextDueDate: "2026-12-01",
      currentPeriodStart: "2026-11-01T12:00:00.000Z",
      currentPeriodEnd: "2026-12-01T12:00:00.000Z",
      contractedPriceCents: 2990,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      hasRemoteSubscription: true,
    });
    expect(data.subscription?.plan).toMatchObject({
      id: PLAN_BASIC_ID,
      price_cents: 2990,
    });
  });

  it("expõe apenas flags resumidas de lease e limpeza para a interface", async () => {
    setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [
        subscriptionRow({
          checkout_locked_at: new Date().toISOString(),
          checkout_lease_token: "checkout-token",
          remote_cleanup_pending: true,
        }),
      ],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.subscription).toMatchObject({
      billingMutationInProgress: true,
      remoteCleanupPending: true,
    });
    expect(state.adminCalls).toBe(0);
  });

  it.each([
    ["pix", "pix"],
    ["boleto", "boleto"],
    ["credit_card", null],
    [null, null],
  ] as const)(
    "mapeia o método de pagamento %s para %s",
    async (billingType, expected) => {
      setup({
        plans: [planRow(PLAN_BASIC_ID)],
        subscriptions: [subscriptionRow({ billing_type: billingType })],
      });

      const data = await getBillingPageData(SHOP_A);

      expect(data.subscription?.billingType).toBe(expected);
    },
  );

  it("aceita assinatura cujo plano não está mais no catálogo", async () => {
    setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [subscriptionRow({ plan_id: PLAN_MISSING_ID })],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.subscription?.planId).toBe(PLAN_MISSING_ID);
    expect(data.subscription?.plan).toBeNull();
  });

  it("considera apenas os status correntes na assinatura atual", async () => {
    setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [
        subscriptionRow({
          id: "expired",
          status: "expired",
          created_at: "2026-11-20T12:00:00.000Z",
        }),
        historyRow({
          id: "canceled-newer",
          status: "canceled",
          canceled_at: "2026-11-21T12:00:00.000Z",
          cancel_reason: "Mudei de plano",
          created_at: "2026-11-21T12:00:00.000Z",
        }),
      ],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.subscription).toBeNull();
    expect(data.lastCanceled).toEqual({
      canceledAt: "2026-11-21T12:00:00.000Z",
      cancelReason: "Mudei de plano",
    });
  });
});

describe("pagador e faturas", () => {
  it.each([
    ["52998224725", "***.***.***-25"],
    ["11222333000181", "**.***.***/****-81"],
    ["123", "—"],
  ])("mascara o documento %s", async (documentDigits, expected) => {
    setup({
      billing_customers: [customerRow({ document_digits: documentDigits })],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.customer?.documentMasked).toBe(expected);
    expect(data.customer?.holderName).toBe("Maria da Silva");
    expect(data.customer?.personType).toBe("individual");
  });

  it("sinaliza pagador sem cadastro remoto", async () => {
    setup({
      billing_customers: [customerRow({ gateway_customer_id: null })],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.customer?.hasGatewayCustomer).toBe(false);
  });

  it("carrega no máximo 12 faturas do escopo da assinatura, em ordem decrescente", async () => {
    const payments = Array.from({ length: 14 }, (_, index) =>
      paymentRow(index),
    );

    setup({
      payments: [
        ...payments,
        paymentRow(0, {
          id: "other-shop",
          barbershop_id: SHOP_B,
          created_at: "2026-12-20T12:00:00.000Z",
        }),
        paymentRow(0, {
          id: "service-scope",
          scope: "service_revenue",
          created_at: "2026-12-21T12:00:00.000Z",
        }),
      ],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.invoices).toHaveLength(12);
    expect(data.invoices.map((invoice) => invoice.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `payment-${index}`),
    );
    expect(data.invoices[0]).toMatchObject({
      id: "payment-0",
      amountCents: 2990,
      status: "paid",
      method: "pix",
      dueDate: "2026-11-15",
      paidAt: "2026-11-15T12:00:00.000Z",
      invoiceUrl: "https://example.com/invoices/0",
      createdAt: "2026-11-15T12:00:00.000Z",
    });
    expect("scope" in data.invoices[0]).toBe(false);
  });
});

describe("histórico e trial", () => {
  it("carrega o histórico, calcula trial utilizado e o último cancelamento", async () => {
    setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [
        historyRow({
          id: "trial-used",
          status: "canceled",
          trial_ends_at: "2026-11-08T12:00:00.000Z",
          canceled_at: "2026-11-09T12:00:00.000Z",
          cancel_reason: "Mudei de plano",
          created_at: "2026-11-10T12:00:00.000Z",
        }),
        historyRow({
          id: "older-cancellation",
          canceled_at: "2026-11-02T12:00:00.000Z",
          created_at: "2026-11-01T12:00:00.000Z",
        }),
      ],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.hasUsedTrial).toBe(true);
    expect(data.lastCanceled).toEqual({
      canceledAt: "2026-11-09T12:00:00.000Z",
      cancelReason: "Mudei de plano",
    });
    expect(data.trialAvailable).toBe(false);
  });

  it("ignora cancelamento sem data e aceita motivo nulo", async () => {
    setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [
        historyRow({
          id: "canceled-without-date",
          canceled_at: null,
          cancel_reason: "Sem data",
          created_at: "2026-11-12T12:00:00.000Z",
        }),
        historyRow({
          id: "canceled-with-date",
          canceled_at: "2026-11-05T12:00:00.000Z",
          cancel_reason: null,
          created_at: "2026-11-04T12:00:00.000Z",
        }),
      ],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.lastCanceled).toEqual({
      canceledAt: "2026-11-05T12:00:00.000Z",
      cancelReason: null,
    });
  });

  it("oferece trial apenas para loja nova com plano de trial", async () => {
    setup({ plans: [planRow(PLAN_BASIC_ID)] });

    const data = await getBillingPageData(SHOP_A);

    expect(data.trialAvailable).toBe(true);
    expect(data.hasUsedTrial).toBe(false);
    expect(data.lastCanceled).toBeNull();
  });

  it("não oferece trial quando já existe assinatura atual", async () => {
    setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [subscriptionRow()],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.subscription).not.toBeNull();
    expect(data.trialAvailable).toBe(false);
  });

  it("não oferece trial quando o histórico já usou o teste", async () => {
    setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [
        historyRow({
          status: "expired",
          trial_ends_at: "2026-11-08T12:00:00.000Z",
        }),
      ],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.hasUsedTrial).toBe(true);
    expect(data.trialAvailable).toBe(false);
  });

  it("não oferece trial quando nenhum plano tem trial", async () => {
    setup({ plans: [planRow(PLAN_BASIC_ID, { trial_days: 0 })] });

    const data = await getBillingPageData(SHOP_A);

    expect(data.trialAvailable).toBe(false);
  });

  it("devolve estado vazio quando não há dados financeiros", async () => {
    setup({ plans: [planRow(PLAN_BASIC_ID)] });

    const data = await getBillingPageData(SHOP_A);

    expect(data.subscription).toBeNull();
    expect(data.customer).toBeNull();
    expect(data.invoices).toEqual([]);
    expect(data.hasUsedTrial).toBe(false);
    expect(data.lastCanceled).toBeNull();
  });

  it("reflete a configuração do Asaas", async () => {
    setup({}, { asaasConfigured: false });

    const data = await getBillingPageData(SHOP_A);

    expect(data.asaasConfigured).toBe(false);
  });
});

describe("erros e resultados vazios", () => {
  it("tolera erro na consulta de planos", async () => {
    const { db } = setup({ plans: [planRow(PLAN_BASIC_ID)] });
    db.failNext("plans");

    const data = await getBillingPageData(SHOP_A);

    expect(data.plans).toEqual([]);
    expect(data.trialAvailable).toBe(false);
  });

  it("tolera erro na consulta da assinatura atual", async () => {
    const { db } = setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [subscriptionRow()],
    });
    db.failNext("subscriptions");

    const data = await getBillingPageData(SHOP_A);

    expect(data.subscription).toBeNull();
    expect(data.hasUsedTrial).toBe(false);
  });

  it("documenta que erro na assinatura atual ainda sugere trial (comportamento atual)", async () => {
    const { db } = setup({ plans: [planRow(PLAN_BASIC_ID)] });
    db.failNext("subscriptions");

    const data = await getBillingPageData(SHOP_A);

    // Risco P3-04: trialAvailable não considera subscriptionResult.error.
    // Este teste apenas caracteriza o comportamento atual; não é uma
    // recomendação de produto.
    expect(data.subscription).toBeNull();
    expect(data.trialAvailable).toBe(true);
  });

  it("tolera erro na consulta do pagador", async () => {
    const { db } = setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [subscriptionRow()],
      billing_customers: [customerRow()],
      payments: [paymentRow(0)],
    });
    db.failNext("billing_customers");

    const data = await getBillingPageData(SHOP_A);

    expect(data.customer).toBeNull();
    expect(data.subscription).not.toBeNull();
    expect(data.invoices).toHaveLength(1);
  });

  it("tolera erro na consulta de pagamentos", async () => {
    const { db } = setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [subscriptionRow()],
      billing_customers: [customerRow()],
      payments: [paymentRow(0)],
    });
    db.failNext("payments");

    const data = await getBillingPageData(SHOP_A);

    expect(data.invoices).toEqual([]);
    expect(data.subscription).not.toBeNull();
    expect(data.customer).not.toBeNull();
  });

  it("falha fechado quando o histórico não pode ser lido", async () => {
    setup(
      {
        plans: [planRow(PLAN_BASIC_ID)],
        subscriptions: [
          subscriptionRow(),
          historyRow({
            id: "canceled",
            status: "canceled",
            canceled_at: "2026-11-10T12:00:00.000Z",
            cancel_reason: "Mudei de plano",
            created_at: "2026-11-10T12:00:00.000Z",
          }),
        ],
        billing_customers: [customerRow()],
        payments: [paymentRow(0)],
      },
      { historyFailure: true },
    );

    const data = await getBillingPageData(SHOP_A);

    expect(data.subscription).not.toBeNull();
    expect(data.trialAvailable).toBe(false);
    expect(data.hasUsedTrial).toBe(false);
    expect(data.lastCanceled).toBeNull();
  });
});

describe("isolamento multi-tenant no código da consulta", () => {
  it("isola os dados da barbearia informada", async () => {
    setup({
      plans: [planRow(PLAN_BASIC_ID)],
      subscriptions: [
        subscriptionRow({
          id: SUBSCRIPTION_ID,
          barbershop_id: SHOP_A,
          created_at: "2026-11-01T12:00:00.000Z",
        }),
        subscriptionRow({
          id: SUBSCRIPTION_B_ID,
          barbershop_id: SHOP_B,
          created_at: "2026-11-20T12:00:00.000Z",
        }),
      ],
      billing_customers: [
        customerRow({
          id: "customer-a",
          barbershop_id: SHOP_A,
          document_digits: "52998224725",
        }),
        customerRow({
          id: "customer-b",
          barbershop_id: SHOP_B,
          document_digits: "11222333000181",
        }),
      ],
      payments: [
        paymentRow(0, { id: "payment-a", barbershop_id: SHOP_A }),
        paymentRow(1, {
          id: "payment-b",
          barbershop_id: SHOP_B,
          created_at: "2026-12-01T12:00:00.000Z",
        }),
      ],
    });

    const data = await getBillingPageData(SHOP_A);

    expect(data.subscription?.id).toBe(SUBSCRIPTION_ID);
    expect(data.customer?.documentMasked).toBe("***.***.***-25");
    expect(data.invoices.map((invoice) => invoice.id)).toEqual(["payment-a"]);
  });

  it("preserva os filtros de barbershop_id nas quatro consultas financeiras", () => {
    const source = read("src/features/billing/queries.ts");
    const filters = source.match(/\.eq\("barbershop_id", barbershopId\)/g) ?? [];

    expect(filters).toHaveLength(4);
    expect(source).not.toContain(SHOP_A);
    expect(source).not.toContain(SHOP_B);
  });

  it("usa o cliente SSR e não usa o cliente administrativo ou service role", async () => {
    setup({ plans: [planRow(PLAN_BASIC_ID)] });

    await getBillingPageData(SHOP_A);

    const source = read("src/features/billing/queries.ts");

    expect(state.createClient).toHaveBeenCalledTimes(1);
    expect(state.adminCalls).toBe(0);
    expect(source).not.toMatch(
      /createAdminClient|@\/lib\/supabase\/admin|SERVICE_ROLE/,
    );
  });
});
