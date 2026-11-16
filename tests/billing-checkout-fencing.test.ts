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

import { AsaasError } from "@/lib/asaas/client";
import {
  cancelSubscription,
  changePlan,
  startSubscription,
} from "@/features/billing/service";

const SHOP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PLAN_ID = "22222222-2222-4222-8222-222222222222";
const SUBSCRIPTION_ID = "33333333-3333-4333-8333-333333333333";
const EXTERNAL_REFERENCE = "44444444-4444-4444-8444-444444444444";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function paidPendingRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SUBSCRIPTION_ID,
    barbershop_id: SHOP_ID,
    plan_id: PLAN_ID,
    status: "pending",
    current_period_start: "2026-11-01T12:00:00.000Z",
    current_period_end: "2026-12-01T12:00:00.000Z",
    trial_ends_at: null,
    cancel_at_period_end: false,
    gateway: "asaas",
    gateway_subscription_id: null,
    billing_type: "pix",
    gateway_status: "pending_creation",
    external_reference: EXTERNAL_REFERENCE,
    next_due_date: "2026-11-16",
    canceled_at: null,
    cancel_reason: null,
    checkout_locked_at: null,
    checkout_lease_token: null,
    checkout_attempted_at: null,
    checkout_attempts: 0,
    checkout_error: null,
    remote_cleanup_pending: false,
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

function createDb(seed: Record<string, FakeRow[]> = {}): FakeSupabase {
  const db = new FakeSupabase({
    plans: [
      planRow(),
      planRow({
        id: OTHER_PLAN_ID,
        code: "basico",
        name: "Básico",
        price_cents: 4990,
      }),
    ],
    billing_customers: [customerRow()],
    ...seed,
  });

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

function outcomeOf<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason) => ({ status: "rejected" as const, reason }),
  );
}

function remote(id: string, externalReference: string) {
  return {
    id,
    status: "ACTIVE" as const,
    nextDueDate: "2026-11-16",
    externalReference,
  };
}

function deferCreation() {
  const started = deferred<string>();
  const release = deferred<{ id: string }>();

  asaas.createAsaasSubscription.mockImplementation(
    (input: { externalReference: string }) => {
      started.resolve(input.externalReference);

      return release.promise.then((value) => ({
        status: "ACTIVE" as const,
        nextDueDate: "2026-11-16",
        externalReference: input.externalReference,
        ...value,
      }));
    },
  );

  return { started, release };
}

beforeEach(() => {
  for (const mock of Object.values(asaas)) {
    mock.mockReset();
  }

  asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([]);
});

describe("fencing do checkout pago (P3-D)", () => {
  it("serializa changePlan contra startSubscription usando o lease", async () => {
    const db = createDb({ subscriptions: [paidPendingRow()] });
    const creation = deferCreation();
    const startOutcome = outcomeOf(startSubscription(startInput()));

    await creation.started.promise;

    const ownerToken = db.getRows("subscriptions")[0]?.checkout_lease_token;

    await expect(
      changePlan({ barbershopId: SHOP_ID, planId: OTHER_PLAN_ID }),
    ).rejects.toMatchObject({ kind: "conflict" });

    expect(asaas.updateAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      checkout_lease_token: ownerToken,
      status: "pending",
      gateway_subscription_id: null,
    });

    creation.release.resolve({ id: "sub_start" });
    await expect(startOutcome).resolves.toMatchObject({ status: "fulfilled" });
  });

  it("bloqueia changePlan mesmo com a flag local desatualizada quando há job aberto", async () => {
    const db = createDb({
      subscriptions: [
        paidPendingRow({
          status: "active",
          gateway_subscription_id: "sub_existing",
          gateway_status: "active",
        }),
      ],
      billing_remote_cleanup_jobs: [
        {
          id: "cleanup-job",
          subscription_id: SUBSCRIPTION_ID,
          barbershop_id: SHOP_ID,
          provider: "asaas",
          external_reference: EXTERNAL_REFERENCE,
          gateway_subscription_id: "sub_orphan",
          status: "manual_review",
          attempts: 8,
          locked_at: null,
          lease_token: null,
          next_attempt_at: new Date().toISOString(),
          last_error: "revisão pendente",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: null,
        },
      ],
    });

    await expect(
      changePlan({ barbershopId: SHOP_ID, planId: OTHER_PLAN_ID }),
    ).rejects.toMatchObject({ kind: "pending_confirmation" });

    expect(asaas.updateAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "active",
      gateway_subscription_id: "sub_existing",
      checkout_locked_at: null,
      checkout_lease_token: null,
      remote_cleanup_pending: false,
    });
  });

  it("grava um token UUID exclusivo no claim inicial", async () => {
    const db = createDb({ subscriptions: [paidPendingRow()] });
    const creation = deferCreation();
    const outcome = outcomeOf(startSubscription(startInput()));

    await creation.started.promise;

    const claimed = db.getRows("subscriptions")[0];

    expect(claimed.checkout_lease_token).toEqual(expect.any(String));
    expect(String(claimed.checkout_lease_token)).toMatch(uuidPattern);
    expect(claimed.checkout_locked_at).toEqual(expect.any(String));

    creation.release.resolve({ id: "sub_a" });

    await expect(outcome).resolves.toMatchObject({ status: "fulfilled" });
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_a",
      checkout_locked_at: null,
      checkout_lease_token: null,
    });
  });

  it("rotaciona o token ao recuperar um lease expirado", async () => {
    const db = createDb({ subscriptions: [paidPendingRow()] });
    const first = deferCreation();
    const firstOutcome = outcomeOf(startSubscription(startInput()));

    await first.started.promise;

    const tokenA = String(db.getRows("subscriptions")[0]?.checkout_lease_token);

    expect(tokenA).toMatch(uuidPattern);

    await db
      .from("subscriptions")
      .update({
        checkout_locked_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      })
      .eq("id", SUBSCRIPTION_ID);

    const second = deferCreation();
    const secondOutcome = outcomeOf(startSubscription(startInput()));

    await second.started.promise;

    const tokenB = String(db.getRows("subscriptions")[0]?.checkout_lease_token);

    expect(tokenB).toMatch(uuidPattern);
    expect(tokenB).not.toBe(tokenA);

    first.release.resolve({ id: "sub_a" });

    await expect(firstOutcome).resolves.toMatchObject({
      status: "rejected",
      reason: { kind: "conflict" },
    });

    second.release.resolve({ id: "sub_b" });

    await expect(secondOutcome).resolves.toMatchObject({ status: "fulfilled" });
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      gateway_subscription_id: "sub_b",
      checkout_lease_token: null,
    });
  });

  it("impede a execução antiga de sobrescrever o vínculo da execução atual", async () => {
    const db = createDb({ subscriptions: [paidPendingRow()] });
    const first = deferCreation();
    const firstOutcome = outcomeOf(startSubscription(startInput()));

    await first.started.promise;

    const tokenA = String(db.getRows("subscriptions")[0]?.checkout_lease_token);

    await db
      .from("subscriptions")
      .update({
        checkout_locked_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      })
      .eq("id", SUBSCRIPTION_ID);

    const second = deferCreation();
    const secondOutcome = outcomeOf(startSubscription(startInput()));

    await second.started.promise;

    const tokenB = String(db.getRows("subscriptions")[0]?.checkout_lease_token);

    expect(tokenB).not.toBe(tokenA);

    // A execução atual B persiste e libera o próprio lease primeiro.
    second.release.resolve({ id: "sub_b" });
    await expect(secondOutcome).resolves.toMatchObject({ status: "fulfilled" });

    asaas.getAsaasSubscription.mockImplementation(
      async (id: string) => remote(id, EXTERNAL_REFERENCE),
    );
    asaas.deleteAsaasSubscription.mockResolvedValue(undefined);

    // A retorna tarde demais: não pode gravar sub_a sobre o vínculo sub_b.
    first.release.resolve({ id: "sub_a" });
    await expect(firstOutcome).resolves.toMatchObject({
      status: "rejected",
      reason: { kind: "conflict" },
    });

    const stored = db.getRows("subscriptions")[0];

    expect(stored).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_b",
      checkout_lease_token: null,
    });
    // A recorrência órfã de A é removida pela outbox, nunca o vínculo de B.
    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_a");
    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalledWith("sub_b");
  });

  it("expõe falha ao persistir compensação de recorrência órfã", async () => {
    const db = createDb({ subscriptions: [paidPendingRow()] });
    const first = deferCreation();
    const firstOutcome = outcomeOf(startSubscription(startInput()));

    await first.started.promise;
    const tokenA = String(db.getRows("subscriptions")[0]?.checkout_lease_token);

    await db
      .from("subscriptions")
      .update({
        checkout_locked_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      })
      .eq("id", SUBSCRIPTION_ID);

    const second = deferCreation();
    const secondOutcome = outcomeOf(startSubscription(startInput()));
    await second.started.promise;
    const tokenB = String(db.getRows("subscriptions")[0]?.checkout_lease_token);

    expect(tokenB).not.toBe(tokenA);
    db.failNext("billing_remote_cleanup_jobs", "XX000", "insert");

    first.release.resolve({ id: "sub_orphan" });
    await expect(firstOutcome).resolves.toMatchObject({
      status: "rejected",
      reason: {
        kind: "pending_confirmation",
        message: expect.stringContaining("registrada de forma durável"),
      },
    });

    expect(db.getRows("billing_remote_cleanup_jobs")).toHaveLength(0);
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      checkout_lease_token: tokenB,
      checkout_locked_at: expect.any(String),
      gateway_subscription_id: null,
    });

    second.release.resolve({ id: "sub_current" });
    await expect(secondOutcome).resolves.toMatchObject({ status: "fulfilled" });
  });

  it("impede a execução antiga de liberar o lease da execução atual", async () => {
    const db = createDb({ subscriptions: [paidPendingRow()] });
    const first = deferred<never>();
    const firstStarted = deferred();

    asaas.createAsaasSubscription.mockImplementation(() => {
      firstStarted.resolve(undefined);
      return first.promise;
    });

    const firstOutcome = outcomeOf(startSubscription(startInput()));

    await firstStarted.promise;

    await db
      .from("subscriptions")
      .update({
        checkout_locked_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      })
      .eq("id", SUBSCRIPTION_ID);

    const second = deferCreation();
    const secondOutcome = outcomeOf(startSubscription(startInput()));

    await second.started.promise;

    const tokenB = String(db.getRows("subscriptions")[0]?.checkout_lease_token);

    expect(tokenB).toMatch(uuidPattern);

    first.reject(new AsaasError("unavailable", "Asaas indisponível."));

    await expect(firstOutcome).resolves.toMatchObject({ status: "rejected" });

    expect(db.getRows("subscriptions")[0]).toMatchObject({
      checkout_lease_token: tokenB,
      checkout_locked_at: expect.any(String),
      checkout_error: null,
    });

    second.release.resolve({ id: "sub_b" });
    await expect(secondOutcome).resolves.toMatchObject({ status: "fulfilled" });
  });

  it("invalida o token antigo quando o cancelamento vence a criação remota", async () => {
    const db = createDb({ subscriptions: [paidPendingRow()] });
    const creation = deferCreation();
    const outcome = outcomeOf(startSubscription(startInput()));

    await creation.started.promise;

    const tokenA = String(db.getRows("subscriptions")[0]?.checkout_lease_token);

    expect(tokenA).toMatch(uuidPattern);

    const cancelResult = await cancelSubscription({ barbershopId: SHOP_ID });

    expect(cancelResult.message).toContain("Assinatura cancelada");
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "canceled",
      checkout_locked_at: null,
      checkout_lease_token: null,
      remote_cleanup_pending: true,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "retry",
      gateway_subscription_id: null,
    });

    asaas.getAsaasSubscription.mockImplementation(
      async (id: string) => remote(id, EXTERNAL_REFERENCE),
    );
    asaas.deleteAsaasSubscription.mockResolvedValue(undefined);

    creation.release.resolve({ id: "sub_late" });

    await expect(outcome).resolves.toMatchObject({
      status: "rejected",
      reason: { kind: "conflict" },
    });

    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "canceled",
      gateway_subscription_id: null,
      checkout_lease_token: null,
      remote_cleanup_pending: false,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "completed",
      gateway_subscription_id: "sub_late",
    });
    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_late");
  });

  it("não reativa uma assinatura terminal ao receber a criação remota atrasada", async () => {
    const db = createDb({
      subscriptions: [
        paidPendingRow({
          status: "expired",
          gateway_status: "expired",
          trial_finalization_locked_at: "2026-11-10T12:00:00.000Z",
          trial_finalization_lease_token:
            "88888888-8888-4888-8888-888888888888",
          canceled_at: "2026-11-10T12:00:00.000Z",
        }),
      ],
    });

    const result = await db.rpc("cancel_subscription_with_cleanup", {
      p_subscription_id: SUBSCRIPTION_ID,
      p_barbershop_id: SHOP_ID,
      p_cancel_reason: "Plano encerrado",
    });

    expect(result.error).toBeNull();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "expired",
      gateway_status: "inactive",
      trial_finalization_locked_at: null,
      trial_finalization_lease_token: null,
      cancel_at_period_end: false,
      cancel_reason: "Plano encerrado",
    });
    expect(db.getRows("billing_remote_cleanup_jobs")).toHaveLength(0);
  });
});
