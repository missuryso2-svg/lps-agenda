import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    checkout_locked_at: null,
    checkout_lease_token: null,
    checkout_attempted_at: null,
    checkout_attempts: 0,
    checkout_error: null,
    remote_cleanup_pending: false,
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

function createDb(seed: Record<string, FakeRow[]> = {}): FakeSupabase {
  const db = new FakeSupabase({
    plans: seed.plans ?? [
      planRow(),
      planRow({ id: OTHER_PLAN_ID, name: "Essencial", price_cents: 4990 }),
    ],
    billing_customers: seed.billing_customers ?? [customerRow()],
    ...seed,
  });

  // Espelha os índices parciais de produção relevantes para a contratação.
  db.addUniqueConstraint(
    "subscriptions",
    ["barbershop_id"],
    (row) =>
      row.status === "pending" ||
      row.status === "trialing" ||
      row.status === "active" ||
      row.status === "past_due",
  );
  db.addUniqueConstraint(
    "subscriptions",
    ["barbershop_id"],
    (row) => row.status === "pending" && row.trial_ends_at === null,
  );
  db.addUniqueConstraint(
    "billing_remote_cleanup_jobs",
    ["subscription_id"],
    (row) => row.status !== "completed",
  );

  state.db = db;
  return db;
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function startInput() {
  return {
    barbershopId: SHOP_ID,
    planId: PLAN_ID,
    billingType: "pix" as const,
    holderName: "Maria da Silva",
    document: "52998224725",
  };
}

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

beforeEach(() => {
  for (const mock of Object.values(asaas)) {
    mock.mockReset();
  }

  asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([]);

  createDb({
    plans: [planRow(), planRow({ id: OTHER_PLAN_ID, name: "Essencial", price_cents: 4990 })],
    billing_customers: [customerRow()],
  });
});

describe("contratação da assinatura", () => {
  it.each([0, 7])("a entrada comercial recusa loja sem contrato, inclusive com trial de %i dias", async (days) => {
    const db = createDb({ plans: [planRow({ trial_days: days })], billing_customers: [] });
    await expect(startSubscription(startInput(), "resume-pending")).rejects.toThrow(/LPS Solutions/);
    expect(db.getRows("subscriptions")).toHaveLength(0);
    expect(db.getRows("payments")).toHaveLength(0);
    expect(db.getRows("billing_customers")).toHaveLength(0);
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
  });
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
    createDb({
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
    createDb({
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
    createDb({
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
    const db = createDb({
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
    createDb({
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
    const db = createDb({
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

    asaas.getAsaasSubscription.mockResolvedValue({
      id: "sub_123",
      status: "ACTIVE",
      externalReference: EXTERNAL_REFERENCE,
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
      remote_cleanup_pending: false,
    });
    expect(db.getRows("subscriptions")[0]?.canceled_at).toEqual(
      expect.any(String),
    );
    expect(db.getRows("payments")[0]?.status).toBe("cancelled");
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      subscription_id: SUBSCRIPTION_ID,
      gateway_subscription_id: "sub_123",
      status: "completed",
      completed_at: expect.any(String),
    });
    expect(result.message).toContain("Assinatura cancelada");
  });

  it("recupera o id remoto por externalReference antes de cancelar", async () => {
    const db = createDb({
      plans: [planRow()],
      billing_customers: [customerRow()],
      subscriptions: [subscriptionRow({ gateway_subscription_id: null })],
    });

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([
      {
        id: "sub_found",
        status: "ACTIVE",
        externalReference: EXTERNAL_REFERENCE,
      },
    ]);
    asaas.deleteAsaasSubscription.mockResolvedValue(undefined);

    await cancelSubscription({ barbershopId: SHOP_ID });

    expect(asaas.listAsaasSubscriptionsByExternalReference).toHaveBeenCalledWith(
      EXTERNAL_REFERENCE,
    );
    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_found");
    expect(db.getRows("subscriptions")[0]?.status).toBe("canceled");
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      gateway_subscription_id: "sub_found",
      status: "completed",
    });
  });
});

describe("concorrência da contratação paga (P3-B)", () => {
  it("permite apenas uma contratação concorrente quando não há linha pendente", async () => {
    const db = createDb();

    asaas.createAsaasSubscription.mockResolvedValue({
      id: "sub_once",
      status: "ACTIVE",
      nextDueDate: "2026-11-16",
    });

    const results = await Promise.allSettled([
      startSubscription(startInput()),
      startSubscription(startInput()),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: "rejected",
      reason: { kind: "conflict" },
    });
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(1);

    const rows = db.getRows("subscriptions");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_once",
      checkout_locked_at: null,
    });
  });

  it("não permite que duas execuções reutilizem a mesma contratação pendente", async () => {
    const db = createDb({
      subscriptions: [
        subscriptionRow({
          status: "pending",
          gateway_subscription_id: null,
          trial_ends_at: null,
        }),
      ],
    });
    const started = deferred();
    const remote = deferred();

    asaas.createAsaasSubscription.mockImplementation(
      (input: { externalReference: string }) => {
        started.resolve(undefined);

        return remote.promise.then(() => ({
          id: "sub_once",
          status: "ACTIVE",
          nextDueDate: "2026-11-16",
          externalReference: input.externalReference,
        }));
      },
    );

    const first = startSubscription(startInput());

    await started.promise;

    const second = await startSubscription(startInput()).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason) => ({ status: "rejected" as const, reason }),
    );

    expect(second).toMatchObject({
      status: "rejected",
      reason: { kind: "conflict" },
    });
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(1);

    remote.resolve(undefined);
    await expect(first).resolves.toMatchObject({
      message: expect.stringContaining("após a confirmação"),
    });

    const rows = db.getRows("subscriptions");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_once",
      checkout_locked_at: null,
      checkout_attempts: 1,
    });
  });

  it("trata 23505 no insert como conflito controlado, sem chamar o Asaas", async () => {
    const db = createDb();

    db.failNext("subscriptions", "23505", "insert");

    await expect(startSubscription(startInput())).rejects.toMatchObject({
      kind: "conflict",
    });

    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")).toHaveLength(0);
  });

  it("não inicia outra execução enquanto o lease de checkout está válido", async () => {
    const db = createDb({
      subscriptions: [
        subscriptionRow({
          status: "pending",
          gateway_subscription_id: null,
          trial_ends_at: null,
          checkout_locked_at: new Date().toISOString(),
          checkout_attempts: 1,
        }),
      ],
    });

    await expect(startSubscription(startInput())).rejects.toMatchObject({
      kind: "conflict",
    });

    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
    expect(asaas.listAsaasSubscriptionsByExternalReference).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: null,
    });
  });

  it("retoma uma contratação interrompida recuperando a mesma assinatura remota", async () => {
    const db = createDb({
      subscriptions: [
        subscriptionRow({
          status: "pending",
          gateway_subscription_id: null,
          trial_ends_at: null,
          next_due_date: "2026-11-16",
        }),
      ],
    });

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([
      {
        id: "sub_existing",
        status: "ACTIVE",
        nextDueDate: "2026-11-16",
        externalReference: EXTERNAL_REFERENCE,
      },
    ]);

    const result = await startSubscription(startInput());

    const rows = db.getRows("subscriptions");

    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
    expect(
      asaas.listAsaasSubscriptionsByExternalReference,
    ).toHaveBeenCalledWith(EXTERNAL_REFERENCE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_existing",
      gateway_status: "active",
      checkout_locked_at: null,
      checkout_attempts: 1,
    });
    expect(result.message).toContain("após a confirmação");
  });

  it("retoma a contratação quando o lease expirou, sem criar outra recorrência", async () => {
    const db = createDb({
      subscriptions: [
        subscriptionRow({
          status: "pending",
          gateway_subscription_id: null,
          trial_ends_at: null,
          next_due_date: "2026-11-16",
          checkout_locked_at: new Date(
            Date.now() - 6 * 60 * 1000,
          ).toISOString(),
          checkout_attempted_at: new Date(
            Date.now() - 6 * 60 * 1000,
          ).toISOString(),
          checkout_attempts: 1,
        }),
      ],
    });

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([
      {
        id: "sub_recovered",
        status: "ACTIVE",
        nextDueDate: "2026-11-16",
        externalReference: EXTERNAL_REFERENCE,
      },
    ]);

    await startSubscription(startInput());

    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();

    const rows = db.getRows("subscriptions");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_recovered",
      checkout_locked_at: null,
      checkout_attempts: 2,
    });
  });
});

describe("cancelamento durante a criação remota (P3-02)", () => {
  async function startWithDeferredRemote() {
    const db = createDb();
    const started = deferred();
    const remote = deferred();

    asaas.createAsaasSubscription.mockImplementation(
      (input: { externalReference: string }) => {
        started.resolve(undefined);

        return remote.promise.then(() => ({
          id: "sub_orphan",
          status: "ACTIVE",
          nextDueDate: "2026-11-16",
          externalReference: input.externalReference,
        }));
      },
    );

    const startOutcome = startSubscription(startInput()).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason) => ({ status: "rejected" as const, reason }),
    );

    await started.promise;

    const row = db.getRows("subscriptions")[0];

    return { db, remote, startOutcome, row };
  }

  it("remove a recorrência criada depois do cancelamento e preserva canceled", async () => {
    const { db, remote, startOutcome, row } = await startWithDeferredRemote();

    expect(row).toMatchObject({
      status: "pending",
      checkout_locked_at: expect.any(String),
    });

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([]);
    asaas.getAsaasSubscription.mockResolvedValue({
      id: "sub_orphan",
      status: "ACTIVE",
      externalReference: String(row?.external_reference ?? ""),
    });
    asaas.deleteAsaasSubscription.mockResolvedValue(undefined);

    const cancelResult = await cancelSubscription({ barbershopId: SHOP_ID });

    expect(cancelResult.message).toContain("Assinatura cancelada");
    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "canceled",
      gateway_subscription_id: null,
      checkout_locked_at: null,
      remote_cleanup_pending: true,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "retry",
      gateway_subscription_id: null,
    });

    remote.resolve(undefined);

    await expect(startOutcome).resolves.toMatchObject({
      status: "rejected",
      reason: { kind: "conflict" },
    });

    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_orphan");
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "canceled",
      gateway_status: "inactive",
      gateway_subscription_id: null,
      remote_cleanup_pending: false,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "completed",
      gateway_subscription_id: "sub_orphan",
    });
  });

  it("registra falha de compensação e bloqueia nova recorrência", async () => {
    const { db, remote, startOutcome, row } = await startWithDeferredRemote();

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([]);
    asaas.getAsaasSubscription.mockResolvedValue({
      id: "sub_orphan",
      status: "ACTIVE",
      externalReference: String(row?.external_reference ?? ""),
    });
    asaas.deleteAsaasSubscription.mockRejectedValue(
      new AsaasError("unavailable", "Asaas indisponível."),
    );

    await cancelSubscription({ barbershopId: SHOP_ID });
    remote.resolve(undefined);

    await expect(startOutcome).resolves.toMatchObject({
      status: "rejected",
      reason: { kind: "conflict" },
    });

    const rows = db.getRows("subscriptions");
    const jobs = db.getRows("billing_remote_cleanup_jobs");

    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_orphan");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "canceled",
      gateway_subscription_id: null,
      remote_cleanup_pending: true,
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      status: "retry",
      gateway_subscription_id: "sub_orphan",
      attempts: 2,
      next_attempt_at: expect.any(String),
    });
    expect(jobs[0]?.last_error).toContain("remoção da recorrência");

    await expect(startSubscription(startInput())).rejects.toMatchObject({
      kind: "pending_confirmation",
    });

    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(1);
    expect(db.getRows("subscriptions")).toHaveLength(1);
  });

  it("não grava vínculo remoto em assinatura expirada durante a criação", async () => {
    const { db, remote, startOutcome, row } = await startWithDeferredRemote();

    await db
      .from("subscriptions")
      .update({ status: "expired", gateway_status: "expired" })
      .eq("id", row?.id);

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([]);
    asaas.getAsaasSubscription.mockResolvedValue({
      id: "sub_orphan",
      status: "ACTIVE",
      externalReference: String(row?.external_reference ?? ""),
    });
    asaas.deleteAsaasSubscription.mockResolvedValue(undefined);

    remote.resolve(undefined);

    await expect(startOutcome).resolves.toMatchObject({
      status: "rejected",
      reason: { kind: "conflict" },
    });

    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_orphan");
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "expired",
      gateway_subscription_id: null,
      remote_cleanup_pending: false,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "completed",
    });
  });

  it("não remove recorrência remota que pertença a outra contratação", async () => {
    const db = createDb();
    const started = deferred();
    const remote = deferred();

    asaas.createAsaasSubscription.mockImplementation(() => {
      started.resolve(undefined);

      return remote.promise.then(() => ({
        id: "sub_other",
        status: "ACTIVE",
        nextDueDate: "2026-11-16",
        externalReference: "outra-contratacao",
      }));
    });

    const startOutcome = startSubscription(startInput()).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason) => ({ status: "rejected" as const, reason }),
    );

    await started.promise;

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([]);
    asaas.deleteAsaasSubscription.mockResolvedValue(undefined);

    await cancelSubscription({ barbershopId: SHOP_ID });
    remote.resolve(undefined);

    await expect(startOutcome).resolves.toMatchObject({
      status: "rejected",
      reason: { kind: "pending_confirmation" },
    });

    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "canceled",
      gateway_subscription_id: null,
      remote_cleanup_pending: true,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "manual_review",
      gateway_subscription_id: null,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]?.last_error).toContain(
      "não pertence",
    );
  });

  it("cancela uma contratação já persistida e remove a recorrência existente", async () => {
    const db = createDb();

    asaas.createAsaasSubscription.mockResolvedValue({
      id: "sub_persisted",
      status: "ACTIVE",
      nextDueDate: "2026-11-16",
    });
    asaas.deleteAsaasSubscription.mockResolvedValue(undefined);

    await startSubscription(startInput());

    const stored = db.getRows("subscriptions")[0];

    expect(stored).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_persisted",
    });

    asaas.getAsaasSubscription.mockResolvedValue({
      id: "sub_persisted",
      status: "ACTIVE",
      externalReference: String(stored?.external_reference ?? ""),
    });

    await cancelSubscription({ barbershopId: SHOP_ID });

    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_persisted");
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "canceled",
      gateway_status: "inactive",
      gateway_subscription_id: "sub_persisted",
      remote_cleanup_pending: false,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "completed",
    });
  });

  it("preserva o cancelamento local e registra falha ao remover recorrência existente", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
    });

    asaas.getAsaasSubscription.mockResolvedValue({
      id: "sub_123",
      status: "ACTIVE",
      externalReference: EXTERNAL_REFERENCE,
    });
    asaas.deleteAsaasSubscription.mockRejectedValue(
      new AsaasError("unavailable", "Asaas indisponível."),
    );

    await expect(
      cancelSubscription({ barbershopId: SHOP_ID }),
    ).resolves.toMatchObject({
      message: expect.stringContaining("Assinatura cancelada"),
    });

    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "canceled",
      gateway_status: "inactive",
      remote_cleanup_pending: true,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "retry",
      attempts: 1,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]?.last_error).toContain(
      "remoção da recorrência",
    );
  });
});

describe("preservação de estados terminais e migração P3-B", () => {
  it("não reativa assinaturas canceled ou expired ao iniciar nova contratação", async () => {
    const db = createDb({
      subscriptions: [
        subscriptionRow({
          id: "canceled-old",
          status: "canceled",
          gateway_subscription_id: null,
          canceled_at: "2026-11-10T12:00:00.000Z",
          cancel_reason: "Plano antigo",
        }),
        subscriptionRow({
          id: "expired-old",
          status: "expired",
          gateway_subscription_id: null,
          external_reference: "ref-expired",
        }),
      ],
    });

    asaas.createAsaasSubscription.mockResolvedValue({
      id: "sub_new_contract",
      status: "ACTIVE",
      nextDueDate: "2026-11-16",
    });

    await startSubscription(startInput());

    const rows = db.getRows("subscriptions");
    const canceled = rows.find((row) => row.id === "canceled-old");
    const expired = rows.find((row) => row.id === "expired-old");

    expect(canceled).toMatchObject({
      status: "canceled",
      canceled_at: "2026-11-10T12:00:00.000Z",
      cancel_reason: "Plano antigo",
    });
    expect(expired).toMatchObject({
      status: "expired",
      gateway_subscription_id: null,
    });
    expect(
      rows.filter((row) => row.status === "pending"),
    ).toHaveLength(1);
  });

  it("mantém migration aditiva e pré-checagem, sem índice redundante", () => {
    const migration = read(
      "supabase/migrations/20261115130000_subscription_checkout_concurrency.sql",
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
    expect(migration).toMatch(
      /where status = 'pending'[\s\S]{0,80}and trial_ends_at is null/,
    );
    expect(migration).toMatch(/transa[çc][ãa]o/i);
    expect(migration).not.toContain(
      "subscriptions_one_paid_pending_per_shop_idx",
    );
    expect(migration).not.toMatch(/\bcreate\s+(unique\s+)?index\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\bdrop\s+(table|index)\b/i);
  });
});
