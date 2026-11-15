import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase, type FakeRow } from "./helpers/fake-supabase";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  db: null as unknown,
}));

const asaas = vi.hoisted(() => ({
  createAsaasCustomer: vi.fn(),
  createAsaasSubscription: vi.fn(),
  deleteAsaasSubscription: vi.fn(),
  findAsaasCustomerByDocument: vi.fn(),
  getAsaasSubscription: vi.fn(),
  listAsaasSubscriptionsByExternalReference: vi.fn(),
  updateAsaasSubscription: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => state.db),
}));

vi.mock("@/lib/asaas/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/asaas/client")>(
      "@/lib/asaas/client",
    );

  return { ...actual, ...asaas };
});

import {
  AsaasError,
} from "@/lib/asaas/client";
import {
  BillingServiceError,
  cancelSubscription,
  changePlan,
  startSubscription,
} from "@/features/billing/service";

const SHOP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PLAN_ID = "22222222-2222-4222-8222-222222222222";
const SUBSCRIPTION_ID = "33333333-3333-4333-8333-333333333333";
const EXTERNAL_REFERENCE = "44444444-4444-4444-8444-444444444444";

function planRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: PLAN_ID,
    code: "profissional",
    name: "Profissional",
    description: null,
    price_cents: 8990,
    interval: "month",
    features: [],
    max_barbers: 5,
    is_active: true,
    currency: "BRL",
    trial_days: 0,
    ...overrides,
  };
}

function subscriptionRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SUBSCRIPTION_ID,
    barbershop_id: SHOP_ID,
    plan_id: PLAN_ID,
    status: "active",
    current_period_start: "2026-11-01T12:00:00.000Z",
    current_period_end: "2026-12-01T12:00:00.000Z",
    trial_ends_at: null,
    cancel_at_period_end: false,
    gateway: "asaas",
    gateway_subscription_id: "sub_123",
    billing_type: "pix",
    gateway_status: "active",
    external_reference: EXTERNAL_REFERENCE,
    next_due_date: "2026-12-01",
    canceled_at: null,
    created_at: "2026-11-01T12:00:00.000Z",
    updated_at: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

function customerRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    barbershop_id: SHOP_ID,
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

function useDb(seed: Record<string, FakeRow[]> = {}): FakeSupabase {
  const db = new FakeSupabase(seed);
  state.db = db;
  return db;
}

beforeEach(() => {
  for (const mock of Object.values(asaas)) {
    mock.mockReset();
  }

  asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([]);

  useDb({
    plans: [planRow(), planRow({ id: OTHER_PLAN_ID, name: "Essencial", price_cents: 4990 })],
    billing_customers: [customerRow()],
  });
});

describe("contratação da assinatura", () => {
  it("cria o registro local pendente antes e só então chama o Asaas", async () => {
    const db = state.db as FakeSupabase;

    asaas.createAsaasSubscription.mockResolvedValue({
      id: "sub_new",
      status: "ACTIVE",
      nextDueDate: "2026-11-15",
      value: 89.9,
    });

    const result = await startSubscription({
      barbershopId: SHOP_ID,
      planId: PLAN_ID,
      billingType: "pix",
      holderName: "Maria da Silva",
      document: "529.982.247-25",
    });

    const subscriptions = db.getRows("subscriptions");

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      barbershop_id: SHOP_ID,
      plan_id: PLAN_ID,
      status: "pending",
      billing_type: "pix",
      gateway: "asaas",
      gateway_subscription_id: "sub_new",
      gateway_status: "active",
      next_due_date: "2026-11-15",
    });
    expect(subscriptions[0]?.external_reference).toEqual(expect.any(String));

    expect(asaas.createAsaasSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        billingType: "PIX",
        valueCents: 8990,
        cycle: "MONTHLY",
        externalReference: subscriptions[0]?.external_reference,
      }),
    );
    expect(result.message).toContain("após a confirmação do primeiro pagamento");
  });

  it("recusa plano sem valor de cobrança antes de chamar o gateway", async () => {
    useDb({
      plans: [planRow({ price_cents: 0 })],
      billing_customers: [customerRow()],
    });

    await expect(
      startSubscription({
        barbershopId: SHOP_ID,
        planId: PLAN_ID,
        billingType: "pix",
        holderName: "Maria da Silva",
        document: "52998224725",
      }),
    ).rejects.toMatchObject({ kind: "validation" });

    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
  });

  it("recusa plano inativo mesmo que o id exista no catálogo", async () => {
    useDb({
      plans: [planRow({ is_active: false })],
      billing_customers: [customerRow()],
    });

    await expect(
      startSubscription({
        barbershopId: SHOP_ID,
        planId: PLAN_ID,
        billingType: "pix",
        holderName: "Maria da Silva",
        document: "52998224725",
      }),
    ).rejects.toMatchObject({ kind: "not_found" });

    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
  });

  it("ignora preço, limite e trial injetados e usa o plano carregado do banco", async () => {
    const db = state.db as FakeSupabase;

    asaas.createAsaasSubscription.mockResolvedValue({
      id: "sub_new",
      status: "ACTIVE",
      nextDueDate: "2026-11-15",
      value: 89.9,
    });

    const injectedPayload = {
      barbershopId: SHOP_ID,
      planId: PLAN_ID,
      billingType: "pix" as const,
      holderName: "Maria da Silva",
      document: "52998224725",
      price_cents: 100,
      max_barbers: 99,
      trial_days: 365,
    };

    await startSubscription(injectedPayload);

    expect(asaas.createAsaasSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        valueCents: 8990,
        cycle: "MONTHLY",
      }),
    );
    expect(db.getRows("subscriptions")[0]?.plan_id).toBe(PLAN_ID);
  });

  it("impede uma segunda contratação enquanto a atual está ativa", async () => {
    useDb({
      plans: [planRow()],
      billing_customers: [customerRow()],
      subscriptions: [subscriptionRow()],
    });

    await expect(
      startSubscription({
        barbershopId: SHOP_ID,
        planId: PLAN_ID,
        billingType: "pix",
        holderName: "Maria da Silva",
        document: "52998224725",
      }),
    ).rejects.toBeInstanceOf(BillingServiceError);
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
  });

  it("recupera assinatura remota por externalReference após timeout", async () => {
    const db = state.db as FakeSupabase;
    let listCalls = 0;

    asaas.createAsaasSubscription.mockRejectedValue(
      new AsaasError("timeout", "Tempo esgotado."),
    );
    asaas.listAsaasSubscriptionsByExternalReference.mockImplementation(
      async () => {
        listCalls += 1;

        if (listCalls === 1) {
          return [];
        }

        return [
          {
            id: "sub_recovered",
            status: "ACTIVE",
            nextDueDate: "2026-11-15",
          },
        ];
      },
    );

    const result = await startSubscription({
      barbershopId: SHOP_ID,
      planId: PLAN_ID,
      billingType: "boleto",
      holderName: "Maria da Silva",
      document: "52998224725",
    });

    expect(db.getRows("subscriptions")[0]).toMatchObject({
      gateway_subscription_id: "sub_recovered",
      status: "pending",
    });
    expect(result.message).toContain("após a confirmação");
  });
});

describe("troca e cancelamento", () => {
  it("atualiza valor, ciclo e cobranças pendentes no Asaas", async () => {
    const db = useDb({
      plans: [planRow(), planRow({ id: OTHER_PLAN_ID, name: "Essencial", price_cents: 4990 })],
      billing_customers: [customerRow()],
      subscriptions: [subscriptionRow()],
    });

    asaas.updateAsaasSubscription.mockResolvedValue({
      id: "sub_123",
      status: "ACTIVE",
      nextDueDate: "2026-12-01",
    });

    const result = await changePlan({
      barbershopId: SHOP_ID,
      planId: OTHER_PLAN_ID,
    });

    expect(asaas.updateAsaasSubscription).toHaveBeenCalledWith(
      "sub_123",
      expect.objectContaining({
        valueCents: 4990,
        billingType: "PIX",
        cycle: "MONTHLY",
        updatePendingPayments: true,
      }),
    );
    expect(db.getRows("subscriptions")[0]?.plan_id).toBe(OTHER_PLAN_ID);
    expect(result.message).toContain("Plano alterado");
  });

  it("recusa troca para o mesmo plano", async () => {
    useDb({
      plans: [planRow()],
      billing_customers: [customerRow()],
      subscriptions: [subscriptionRow()],
    });

    await expect(
      changePlan({ barbershopId: SHOP_ID, planId: PLAN_ID }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(asaas.updateAsaasSubscription).not.toHaveBeenCalled();
  });

  it("remove a recorrência no Asaas e marca a assinatura como cancelada", async () => {
    const db = useDb({
      plans: [planRow()],
      billing_customers: [customerRow()],
      subscriptions: [subscriptionRow()],
      payments: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          subscription_id: SUBSCRIPTION_ID,
          status: "pending",
          amount_cents: 8990,
        },
      ],
    });

    asaas.deleteAsaasSubscription.mockResolvedValue(undefined);

    const result = await cancelSubscription({
      barbershopId: SHOP_ID,
      reason: "  mudança de planos  ",
    });

    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_123");
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "canceled",
      gateway_status: "inactive",
      cancel_at_period_end: false,
      cancel_reason: "mudança de planos",
    });
    expect(db.getRows("subscriptions")[0]?.canceled_at).toEqual(
      expect.any(String),
    );
    expect(db.getRows("payments")[0]?.status).toBe("cancelled");
    expect(result.message).toContain("Assinatura cancelada");
  });

  it("recupera o id remoto por externalReference antes de cancelar", async () => {
    const db = useDb({
      plans: [planRow()],
      billing_customers: [customerRow()],
      subscriptions: [subscriptionRow({ gateway_subscription_id: null })],
    });

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([
      { id: "sub_found", status: "ACTIVE" },
    ]);
    asaas.deleteAsaasSubscription.mockResolvedValue(undefined);

    await cancelSubscription({ barbershopId: SHOP_ID });

    expect(asaas.listAsaasSubscriptionsByExternalReference).toHaveBeenCalledWith(
      EXTERNAL_REFERENCE,
    );
    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_found");
    expect(db.getRows("subscriptions")[0]?.status).toBe("canceled");
  });
});
