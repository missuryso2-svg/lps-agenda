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
  processRemoteCleanupJobs,
  registerRemoteCleanupCandidate,
} from "@/features/billing/compensation";
import {
  cancelSubscription,
  startSubscription,
} from "@/features/billing/service";

const SHOP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const SUBSCRIPTION_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "77777777-7777-4777-8777-777777777777";
const EXTERNAL_REFERENCE = "44444444-4444-4444-8444-444444444444";
const LEASE_TOKEN = "99999999-9999-4999-8999-999999999999";

const NOW = new Date("2026-11-15T12:00:00.000Z");
const PAST = "2026-11-15T11:00:00.000Z";
const STALE_LOCK = "2026-11-15T11:50:00.000Z";

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
    created_at: "2026-11-01T12:00:00.000Z",
    updated_at: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

function subscriptionRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SUBSCRIPTION_ID,
    barbershop_id: SHOP_ID,
    plan_id: PLAN_ID,
    status: "canceled",
    current_period_start: "2026-11-01T12:00:00.000Z",
    current_period_end: "2026-12-01T12:00:00.000Z",
    trial_ends_at: null,
    trial_finalization_locked_at: null,
    cancel_at_period_end: false,
    gateway: "asaas",
    gateway_subscription_id: null,
    billing_type: "pix",
    gateway_status: "inactive",
    external_reference: EXTERNAL_REFERENCE,
    next_due_date: "2026-11-16",
    canceled_at: "2026-11-10T12:00:00.000Z",
    cancel_reason: "Plano encerrado",
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

function jobRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: JOB_ID,
    subscription_id: SUBSCRIPTION_ID,
    barbershop_id: SHOP_ID,
    provider: "asaas",
    external_reference: EXTERNAL_REFERENCE,
    gateway_subscription_id: "sub_1",
    status: "pending",
    attempts: 0,
    locked_at: null,
    lease_token: null,
    next_attempt_at: PAST,
    last_error: null,
    created_at: PAST,
    updated_at: PAST,
    completed_at: null,
    ...overrides,
  };
}

function createDb(seed: Record<string, FakeRow[]> = {}): FakeSupabase {
  const db = new FakeSupabase({
    plans: [planRow()],
    billing_customers: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        barbershop_id: SHOP_ID,
        gateway: "asaas",
        gateway_customer_id: "cus_123",
        person_type: "individual",
        document_digits: "52998224725",
        holder_name: "Maria da Silva",
        email: "maria@example.com",
        phone_digits: "11999999999",
        created_at: "2026-11-01T12:00:00.000Z",
        updated_at: "2026-11-01T12:00:00.000Z",
      },
    ],
    billing_remote_cleanup_jobs: [],
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

function processOptions(
  db: FakeSupabase,
  now = NOW,
  extra: Record<string, unknown> = {},
) {
  return {
    supabase: db as never,
    now,
    ...extra,
  };
}

function remote(id = "sub_1", externalReference = EXTERNAL_REFERENCE) {
  return { id, status: "ACTIVE" as const, externalReference };
}

beforeEach(() => {
  for (const mock of Object.values(asaas)) {
    mock.mockReset();
  }

  asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([]);
  asaas.deleteAsaasSubscription.mockResolvedValue(undefined);
});

describe("outbox de compensação remota (P3-E)", () => {
  it("registra um job durável e deduplica chamadas da mesma contratação", async () => {
    const db = createDb({ subscriptions: [subscriptionRow()] });

    const first = await registerRemoteCleanupCandidate(db as never, {
      subscriptionId: SUBSCRIPTION_ID,
      barbershopId: SHOP_ID,
      externalReference: EXTERNAL_REFERENCE,
    });

    expect(first).toEqual(expect.any(String));
    expect(db.getRows("billing_remote_cleanup_jobs")).toHaveLength(1);
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "pending",
      attempts: 0,
      gateway_subscription_id: null,
      provider: "asaas",
      external_reference: EXTERNAL_REFERENCE,
    });
    expect(db.getRows("subscriptions")[0]?.remote_cleanup_pending).toBe(true);

    const second = await registerRemoteCleanupCandidate(db as never, {
      subscriptionId: SUBSCRIPTION_ID,
      barbershopId: SHOP_ID,
      externalReference: EXTERNAL_REFERENCE,
      gatewaySubscriptionId: "sub_late",
      lastError: "ID remoto recebido depois do registro.",
    });

    expect(second).toBe(first);
    expect(db.getRows("billing_remote_cleanup_jobs")).toHaveLength(1);
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_late",
      last_error: "ID remoto recebido depois do registro.",
    });
  });

  it("nunca mistura referências externas distintas no mesmo job", async () => {
    const db = createDb({ subscriptions: [subscriptionRow()] });

    const jobId = await registerRemoteCleanupCandidate(db as never, {
      subscriptionId: SUBSCRIPTION_ID,
      barbershopId: SHOP_ID,
      externalReference: EXTERNAL_REFERENCE,
    });
    const other = await registerRemoteCleanupCandidate(db as never, {
      subscriptionId: SUBSCRIPTION_ID,
      barbershopId: SHOP_ID,
      externalReference: "outra-referencia-externa",
      gatewaySubscriptionId: "sub_other",
    });

    expect(other).toBeNull();
    expect(db.getRows("billing_remote_cleanup_jobs")).toHaveLength(1);
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      id: jobId,
      external_reference: EXTERNAL_REFERENCE,
      gateway_subscription_id: null,
    });
  });

  it("só aceita ID remoto tardio quando a referência externa corresponde exatamente", async () => {
    const db = createDb({ subscriptions: [subscriptionRow()] });
    const jobId = await registerRemoteCleanupCandidate(db as never, {
      subscriptionId: SUBSCRIPTION_ID,
      barbershopId: SHOP_ID,
      externalReference: EXTERNAL_REFERENCE,
    });

    await registerRemoteCleanupCandidate(db as never, {
      subscriptionId: SUBSCRIPTION_ID,
      barbershopId: SHOP_ID,
      externalReference: EXTERNAL_REFERENCE,
      gatewaySubscriptionId: "sub_a",
    });

    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      id: jobId,
      gateway_subscription_id: "sub_a",
      status: "pending",
    });

    // Um segundo ID para a mesma referência é ambíguo e exige revisão.
    await registerRemoteCleanupCandidate(db as never, {
      subscriptionId: SUBSCRIPTION_ID,
      barbershopId: SHOP_ID,
      externalReference: EXTERNAL_REFERENCE,
      gatewaySubscriptionId: "sub_b",
    });

    expect(db.getRows("billing_remote_cleanup_jobs")).toHaveLength(1);
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      gateway_subscription_id: "sub_a",
      status: "manual_review",
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]?.last_error).toContain(
      "divergentes",
    );
  });

  it("reivindica cada job uma única vez sob concorrência", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
      billing_remote_cleanup_jobs: [jobRow()],
    });
    let release!: (value: unknown) => void;
    const remotePromise = new Promise((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });

    asaas.getAsaasSubscription.mockImplementation(() => {
      started();
      return remotePromise;
    });

    const first = processRemoteCleanupJobs(processOptions(db));
    const second = processRemoteCleanupJobs(processOptions(db));

    await startedPromise;

    const claimed = db.getRows("billing_remote_cleanup_jobs")[0];

    expect(claimed).toMatchObject({
      status: "processing",
      attempts: 1,
      locked_at: NOW.toISOString(),
    });
    expect(String(claimed?.lease_token)).toMatch(uuidPattern);

    release(remote());

    const summaries = await Promise.all([first, second]);

    expect(
      summaries.reduce((total, summary) => total + summary.claimed, 0),
    ).toBe(1);
    expect(
      summaries.reduce((total, summary) => total + summary.completed, 0),
    ).toBe(1);
    expect(asaas.getAsaasSubscription).toHaveBeenCalledTimes(1);
    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledTimes(1);
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "completed",
      lease_token: null,
      completed_at: NOW.toISOString(),
    });
  });

  it("recupera lease expirado, rotaciona o token e preserva o fencing", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
      billing_remote_cleanup_jobs: [
        jobRow({
          status: "processing",
          attempts: 2,
          locked_at: STALE_LOCK,
          lease_token: LEASE_TOKEN,
        }),
      ],
    });
    let release!: (value: unknown) => void;
    const remotePromise = new Promise((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });

    asaas.getAsaasSubscription.mockImplementation(() => {
      started();
      return remotePromise;
    });

    const processing = processRemoteCleanupJobs(processOptions(db));

    await startedPromise;

    const claimed = db.getRows("billing_remote_cleanup_jobs")[0];

    expect(claimed).toMatchObject({
      status: "processing",
      attempts: 3,
      locked_at: NOW.toISOString(),
    });
    expect(claimed?.lease_token).not.toBe(LEASE_TOKEN);
    expect(String(claimed?.lease_token)).toMatch(uuidPattern);

    release(remote());

    await expect(processing).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
    });
  });

  it("confirma a remoção apenas com referência externa e ID exatos", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
      billing_remote_cleanup_jobs: [jobRow()],
    });

    asaas.getAsaasSubscription.mockResolvedValue(remote());

    const summary = await processRemoteCleanupJobs(processOptions(db));

    expect(summary).toMatchObject({ claimed: 1, completed: 1 });
    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_1");
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "completed",
      gateway_subscription_id: "sub_1",
      completed_at: NOW.toISOString(),
    });
    expect(db.getRows("subscriptions")[0]?.remote_cleanup_pending).toBe(false);
  });

  it("mantém o job aberto quando o DELETE não confirma a remoção", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
      billing_remote_cleanup_jobs: [jobRow()],
    });

    asaas.getAsaasSubscription.mockResolvedValue(remote());
    asaas.deleteAsaasSubscription.mockRejectedValue(
      new AsaasError(
        "invalid_response",
        "O Asaas não confirmou a remoção da recorrência.",
      ),
    );

    const summary = await processRemoteCleanupJobs(processOptions(db));

    expect(summary).toMatchObject({ claimed: 1, retry: 1, completed: 0 });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "retry",
      completed_at: null,
    });
    expect(db.getRows("subscriptions")[0]?.remote_cleanup_pending).toBe(true);
  });

  it.each([
    ["referência externa divergente", remote("sub_1", "outra-referencia")],
    ["referência externa ausente", { id: "sub_1", status: "ACTIVE" as const }],
    [
      "ID remoto divergente",
      remote("sub_other", EXTERNAL_REFERENCE),
    ],
  ])(
    "vai para revisão manual com %s sem chamar a remoção",
    async (_label, gatewayRemote) => {
      const db = createDb({
        subscriptions: [subscriptionRow()],
        billing_remote_cleanup_jobs: [jobRow()],
      });

      asaas.getAsaasSubscription.mockResolvedValue(gatewayRemote);

      const summary = await processRemoteCleanupJobs(processOptions(db));

      expect(summary).toMatchObject({ claimed: 1, manualReview: 1 });
      expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
      expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
        status: "manual_review",
        lease_token: null,
      });
      expect(db.getRows("subscriptions")[0]?.remote_cleanup_pending).toBe(true);
    },
  );

  it("não considera tombstone de outro ID como remoção confirmada", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
      billing_remote_cleanup_jobs: [jobRow()],
    });

    asaas.getAsaasSubscription.mockResolvedValue({
      id: "sub_other",
      status: "INACTIVE",
      externalReference: EXTERNAL_REFERENCE,
      deleted: true,
    });

    const summary = await processRemoteCleanupJobs(processOptions(db));

    expect(summary).toMatchObject({ claimed: 1, manualReview: 1, completed: 0 });
    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "manual_review",
      completed_at: null,
    });
  });

  it("trata not_found do Asaas como remoção já confirmada", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
      billing_remote_cleanup_jobs: [jobRow()],
    });

    asaas.getAsaasSubscription.mockRejectedValue(
      new AsaasError("not_found", "Recorrência não encontrada."),
    );

    const summary = await processRemoteCleanupJobs(processOptions(db));

    expect(summary).toMatchObject({ claimed: 1, completed: 1 });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]?.status).toBe(
      "completed",
    );
    expect(db.getRows("subscriptions")[0]?.remote_cleanup_pending).toBe(false);
  });

  it("agenda retry com backoff e conclui quando o Asaas se recupera", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
      billing_remote_cleanup_jobs: [jobRow()],
    });

    asaas.getAsaasSubscription.mockResolvedValue(remote());
    asaas.deleteAsaasSubscription.mockRejectedValueOnce(
      new AsaasError("unavailable", "Asaas indisponível."),
    );

    const failed = await processRemoteCleanupJobs(processOptions(db));

    expect(failed).toMatchObject({ claimed: 1, retry: 1 });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "retry",
      attempts: 1,
      lease_token: null,
      next_attempt_at: "2026-11-15T12:01:00.000Z",
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]?.last_error).toContain(
      "remoção da recorrência",
    );
    expect(db.getRows("subscriptions")[0]?.remote_cleanup_pending).toBe(true);

    const recovered = await processRemoteCleanupJobs(
      processOptions(db, new Date("2026-11-15T12:02:00.000Z")),
    );

    expect(recovered).toMatchObject({ claimed: 1, completed: 1 });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "completed",
      attempts: 2,
    });
    expect(db.getRows("subscriptions")[0]?.remote_cleanup_pending).toBe(false);
  });

  it("move para revisão manual após o limite de tentativas", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
      billing_remote_cleanup_jobs: [
        jobRow({
          status: "retry",
          attempts: 7,
          next_attempt_at: PAST,
        }),
      ],
    });

    asaas.getAsaasSubscription.mockResolvedValue(remote());
    asaas.deleteAsaasSubscription.mockRejectedValue(
      new AsaasError("unavailable", "Asaas indisponível."),
    );

    const summary = await processRemoteCleanupJobs(processOptions(db));

    expect(summary).toMatchObject({ claimed: 1, manualReview: 1 });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "manual_review",
      attempts: 8,
    });
    expect(db.getRows("subscriptions")[0]?.remote_cleanup_pending).toBe(true);
  });

  it("não conclui quando a recorrência ainda não foi encontrada", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
      billing_remote_cleanup_jobs: [
        jobRow({ gateway_subscription_id: null }),
      ],
    });

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([]);

    const summary = await processRemoteCleanupJobs(processOptions(db));

    expect(summary).toMatchObject({ claimed: 1, retry: 1, completed: 0 });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "retry",
      attempts: 1,
      gateway_subscription_id: null,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]?.last_error).toContain(
      "ainda não foi encontrada",
    );
    expect(db.getRows("subscriptions")[0]?.remote_cleanup_pending).toBe(true);

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([
      remote("sub_late"),
    ]);

    const recovered = await processRemoteCleanupJobs(
      processOptions(db, new Date("2026-11-15T12:02:00.000Z")),
    );

    expect(recovered).toMatchObject({ completed: 1 });
    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_late");
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "completed",
      gateway_subscription_id: "sub_late",
    });
  });

  it("vai para revisão manual quando há mais de uma recorrência correspondente", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
      billing_remote_cleanup_jobs: [
        jobRow({ gateway_subscription_id: null }),
      ],
    });

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([
      remote("sub_a"),
      remote("sub_b"),
    ]);

    const summary = await processRemoteCleanupJobs(processOptions(db));

    expect(summary).toMatchObject({ claimed: 1, manualReview: 1 });
    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "manual_review",
    });
  });

  it("não remove a recorrência enquanto o checkout puder adotá-la", async () => {
    const db = createDb({
      subscriptions: [
        subscriptionRow({
          status: "pending",
          gateway_subscription_id: null,
          checkout_locked_at: "2026-11-15T11:59:00.000Z",
          checkout_lease_token: LEASE_TOKEN,
        }),
      ],
      billing_remote_cleanup_jobs: [jobRow()],
    });

    asaas.getAsaasSubscription.mockResolvedValue(remote());

    const blocked = await processRemoteCleanupJobs(processOptions(db));

    expect(blocked).toMatchObject({ claimed: 1, retry: 1 });
    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("billing_remote_cleanup_jobs")[0]?.last_error).toContain(
      "checkout atual",
    );

    await db
      .from("subscriptions")
      .update({ checkout_locked_at: null, checkout_lease_token: null })
      .eq("id", SUBSCRIPTION_ID);

    const released = await processRemoteCleanupJobs(
      processOptions(db, new Date("2026-11-15T12:02:00.000Z")),
    );

    expect(released).toMatchObject({ completed: 1 });
    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_1");
  });

  it("conclui sem remover quando a recorrência já foi adotada pelo vínculo atual", async () => {
    const db = createDb({
      subscriptions: [
        subscriptionRow({
          status: "pending",
          gateway_subscription_id: "sub_1",
        }),
      ],
      billing_remote_cleanup_jobs: [jobRow()],
    });

    const summary = await processRemoteCleanupJobs(processOptions(db));

    expect(summary).toMatchObject({ claimed: 1, completed: 1 });
    expect(asaas.getAsaasSubscription).not.toHaveBeenCalled();
    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("billing_remote_cleanup_jobs")[0]?.status).toBe(
      "completed",
    );
  });

  it("bloqueia nova contratação por job aberto e libera após a conclusão", async () => {
    const db = createDb({
      subscriptions: [subscriptionRow()],
      billing_remote_cleanup_jobs: [
        jobRow({ status: "manual_review" }),
      ],
    });

    await expect(
      startSubscription({
        barbershopId: SHOP_ID,
        planId: PLAN_ID,
        billingType: "pix",
        holderName: "Maria da Silva",
        document: "52998224725",
      }),
    ).rejects.toMatchObject({ kind: "pending_confirmation" });

    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();

    await db
      .from("billing_remote_cleanup_jobs")
      .update({
        status: "completed",
        completed_at: NOW.toISOString(),
        lease_token: null,
        locked_at: null,
      })
      .eq("id", JOB_ID);
    await db
      .from("subscriptions")
      .update({ remote_cleanup_pending: true })
      .eq("id", SUBSCRIPTION_ID);

    asaas.createAsaasSubscription.mockResolvedValue({
      id: "sub_new",
      status: "ACTIVE",
      nextDueDate: "2026-11-16",
    });

    const started = await startSubscription({
      barbershopId: SHOP_ID,
      planId: PLAN_ID,
      billingType: "pix",
      holderName: "Maria da Silva",
      document: "52998224725",
    });

    expect(started.message).toContain("Assinatura");
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(1);
    expect(db.getRows("subscriptions")).toHaveLength(2);
    expect(
      db
        .getRows("subscriptions")
        .find((row) => row.id === SUBSCRIPTION_ID)
        ?.remote_cleanup_pending,
    ).toBe(false);
  });

  it("não declara cancelamento concluído quando a RPC transacional falha", async () => {
    const db = createDb({
      subscriptions: [
        subscriptionRow({
          status: "pending",
          gateway_subscription_id: "sub_1",
          gateway_status: "active",
          canceled_at: null,
          cancel_reason: null,
          checkout_locked_at: "2026-11-15T11:59:00.000Z",
          checkout_lease_token: LEASE_TOKEN,
        }),
      ],
    });

    db.failNextRpc("cancel_subscription_with_cleanup");

    await expect(
      cancelSubscription({ barbershopId: SHOP_ID, reason: "teste" }),
    ).rejects.toMatchObject({ kind: "gateway" });

    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "pending",
      checkout_lease_token: LEASE_TOKEN,
      remote_cleanup_pending: false,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")).toHaveLength(0);
    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
  });
});
