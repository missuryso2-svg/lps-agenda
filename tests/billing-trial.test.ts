import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { getPlanBarberLimit } from "@/features/barbers/plan-limit";
import {
  cancelSubscription,
  changePlan,
  startSubscription,
} from "@/features/billing/service";
import { finalizeExpiredTrials } from "@/features/billing/trial";

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
    description: "Mais recomendado",
    price_cents: 7990,
    interval: "month",
    features: [],
    max_barbers: 5,
    is_active: true,
    currency: "BRL",
    trial_days: 7,
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
    gateway_customer_id: null,
    person_type: "individual",
    document_digits: "52998224725",
    holder_name: "Maria da Silva",
    email: "maria@example.com",
    phone_digits: "11999999999",
    created_at: "2026-11-01T12:00:00.000Z",
    updated_at: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

function trialRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SUBSCRIPTION_ID,
    barbershop_id: SHOP_ID,
    plan_id: PLAN_ID,
    status: "trialing",
    current_period_start: "2026-11-14T12:00:00.000Z",
    current_period_end: "2026-11-21T12:00:00.000Z",
    trial_started_at: "2026-11-14T12:00:00.000Z",
    trial_ends_at: "2026-11-21T12:00:00.000Z",
    contracted_price_cents: 7990,
    contracted_currency: "BRL",
    contracted_interval: "month",
    trial_finalization_locked_at: null,
    trial_finalization_attempted_at: null,
    trial_finalization_attempts: 0,
    trial_finalization_error: null,
    trial_finalized_at: null,
    cancel_at_period_end: false,
    gateway: "asaas",
    gateway_subscription_id: null,
    billing_type: "pix",
    gateway_status: "pending_creation",
    external_reference: EXTERNAL_REFERENCE,
    next_due_date: "2026-11-21",
    canceled_at: null,
    cancel_reason: null,
    created_at: "2026-11-14T12:00:00.000Z",
    updated_at: "2026-11-14T12:00:00.000Z",
    ...overrides,
  };
}

function useDb(seed: Record<string, FakeRow[]> = {}): FakeSupabase {
  const db = new FakeSupabase({
    plans: [
      planRow(),
      planRow({
        id: OTHER_PLAN_ID,
        code: "basico",
        name: "Básico",
        description: "Entrada",
        price_cents: 4990,
        max_barbers: 1,
      }),
    ],
    billing_customers: [customerRow()],
    ...seed,
  });

  db.addUniqueConstraint(
    "billing_remote_cleanup_jobs",
    ["subscription_id"],
    (row) => row.status !== "completed",
  );

  state.db = db;
  return db;
}

/**
 * Simula a corrida em que a rotina de finalização altera a assinatura depois
 * da leitura inicial do fluxo de cancelamento/troca, mas antes da atualização
 * condicional. A primeira leitura recebe um snapshot do estado antigo.
 */
function expiredTrials(
  count: number,
  overrides: (index: number) => FakeRow = () => ({}),
): { subscriptions: FakeRow[]; billing_customers: FakeRow[] } {
  const base = new Date("2026-11-01T12:00:00.000Z").getTime();

  return {
    subscriptions: Array.from({ length: count }, (_, index) =>
      trialRow({
        id: `sub_${index}`,
        external_reference: `ref_${index}`,
        trial_ends_at: new Date(base + index * 60_000).toISOString(),
        ...overrides(index),
      }),
    ),
    // Todos os candidatos compartilham o mesmo pagador; o primeiro cria o
    // cliente remoto e os demais reutilizam o vínculo já persistido.
    billing_customers: [customerRow()],
  };
}

function mockSuccessfulRemoteCreation(): void {
  let counter = 0;

  asaas.createAsaasSubscription.mockImplementation(async () => {
    counter += 1;

    return {
      id: `sub_remote_${counter}`,
      status: "ACTIVE",
      nextDueDate: "2026-11-22",
    };
  });
}

function patchSubscriptionsAfterFirstRead(
  db: FakeSupabase,
  patch: FakeRow,
): void {
  const originalGetRows = db.getRows.bind(db);
  let firstRead = true;

  db.getRows = (table: string) => {
    const rows = originalGetRows(table);

    if (table !== "subscriptions" || !firstRead) {
      return rows;
    }

    firstRead = false;
    const snapshot = rows.map((row) => ({ ...row }));

    db.setRows(
      "subscriptions",
      rows.map((row) =>
        row.id === SUBSCRIPTION_ID ? { ...row, ...patch } : { ...row },
      ),
    );

    return snapshot;
  };
}

beforeEach(() => {
  for (const mock of Object.values(asaas)) {
    mock.mockReset();
  }

  asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([]);
  asaas.findAsaasCustomerByDocument.mockResolvedValue(null);
  asaas.createAsaasCustomer.mockResolvedValue({ id: "cus_new" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("início e operação do trial", () => {
  it("inicia o trial local sem criar cliente, assinatura ou cobrança no Asaas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:00.000Z"));

    const db = useDb({ billing_customers: [] });

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
      status: "trialing",
      billing_type: "pix",
      gateway: "asaas",
      gateway_subscription_id: null,
      gateway_status: "pending_creation",
      trial_started_at: "2026-11-14T12:00:00.000Z",
      trial_ends_at: "2026-11-21T12:00:00.000Z",
      current_period_start: "2026-11-14T12:00:00.000Z",
      current_period_end: "2026-11-21T12:00:00.000Z",
      contracted_price_cents: 7990,
      contracted_currency: "BRL",
      contracted_interval: "month",
      next_due_date: "2026-11-21",
    });
    expect(subscriptions[0]?.external_reference).toEqual(expect.any(String));
    expect(result.message).toContain("7 dias");
    expect(result.message).toContain("Nenhuma cobrança");

    expect(db.getRows("billing_customers")[0]).toMatchObject({
      barbershop_id: SHOP_ID,
      gateway_customer_id: null,
      document_digits: "52998224725",
      holder_name: "Maria da Silva",
    });

    expect(asaas.findAsaasCustomerByDocument).not.toHaveBeenCalled();
    expect(asaas.createAsaasCustomer).not.toHaveBeenCalled();
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
  });

  it("aplica o limite do plano contratado durante o trial", async () => {
    const db = useDb({ subscriptions: [trialRow()] });

    const limit = await getPlanBarberLimit(db as never, SHOP_ID);

    expect(limit).toEqual({ planName: "Profissional", maxBarbers: 5 });
  });

  it("não cria cobrança antes do fim dos sete dias", async () => {
    const db = useDb({ subscriptions: [trialRow()] });

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-20T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      candidates: 0,
      claimed: 0,
      created: 0,
      failed: 0,
      skipped: 0,
    });
    expect(db.getRows("subscriptions")[0]?.status).toBe("trialing");
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
  });

  it("troca o plano do trial apenas no banco, sem chamar o Asaas", async () => {
    const db = useDb({ subscriptions: [trialRow()] });

    const result = await changePlan({
      barbershopId: SHOP_ID,
      planId: OTHER_PLAN_ID,
    });

    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
    expect(asaas.updateAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      plan_id: OTHER_PLAN_ID,
      status: "trialing",
      trial_ends_at: "2026-11-21T12:00:00.000Z",
      contracted_price_cents: 4990,
      contracted_interval: "month",
    });
    expect(result.message).toContain("teste gratuito");
  });

  it("cancela o trial localmente sem remover assinatura remota", async () => {
    const db = useDb({ subscriptions: [trialRow()] });

    const result = await cancelSubscription({
      barbershopId: SHOP_ID,
      reason: "  vou pausar o negócio  ",
    });

    expect(asaas.listAsaasSubscriptionsByExternalReference).not.toHaveBeenCalled();
    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "canceled",
      gateway_status: "inactive",
      cancel_at_period_end: false,
      cancel_reason: "vou pausar o negócio",
    });
    expect(db.getRows("subscriptions")[0]?.canceled_at).toEqual(
      expect.any(String),
    );
    expect(result.message).toContain("Nenhuma cobrança");
  });

  it("grava motivo nulo e recusa motivo acima de 500 caracteres", async () => {
    const db = useDb({ subscriptions: [trialRow()] });

    expect(
      await cancelSubscription({ barbershopId: SHOP_ID }),
    ).toMatchObject({
      message: expect.stringContaining("Nenhuma cobrança"),
    });
    expect(db.getRows("subscriptions")[0]?.cancel_reason).toBeNull();

    const other = useDb({ subscriptions: [trialRow()] });

    await expect(
      cancelSubscription({
        barbershopId: SHOP_ID,
        reason: "x".repeat(501),
      }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(other.getRows("subscriptions")[0]?.status).toBe("trialing");
    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
  });

  it("bloqueia a troca de plano se a finalização reivindicar o trial antes", async () => {
    const db = useDb({ subscriptions: [trialRow()] });

    patchSubscriptionsAfterFirstRead(db, {
      status: "pending",
      gateway_subscription_id: null,
      trial_finalization_locked_at: new Date().toISOString(),
    });

    await expect(
      changePlan({ barbershopId: SHOP_ID, planId: OTHER_PLAN_ID }),
    ).rejects.toMatchObject({ kind: "conflict" });

    expect(asaas.updateAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]?.plan_id).toBe(PLAN_ID);
  });

  it("bloqueia o cancelamento se a finalização reivindicar o trial com lock válido", async () => {
    const db = useDb({ subscriptions: [trialRow()] });

    patchSubscriptionsAfterFirstRead(db, {
      status: "pending",
      gateway_subscription_id: null,
      trial_finalization_locked_at: new Date().toISOString(),
    });

    await expect(
      cancelSubscription({ barbershopId: SHOP_ID }),
    ).rejects.toMatchObject({ kind: "conflict" });

    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("remove a assinatura remota se a finalização vencer a corrida do cancelamento", async () => {
    const db = useDb({ subscriptions: [trialRow()] });

    patchSubscriptionsAfterFirstRead(db, {
      status: "pending",
      gateway_subscription_id: "sub_race",
      gateway_status: "active",
      trial_finalized_at: "2026-11-22T12:00:00.000Z",
      trial_finalization_locked_at: null,
    });

    asaas.getAsaasSubscription.mockResolvedValue({
      id: "sub_race",
      status: "ACTIVE",
      externalReference: EXTERNAL_REFERENCE,
    });

    const result = await cancelSubscription({ barbershopId: SHOP_ID });

    expect(asaas.getAsaasSubscription).toHaveBeenCalledWith("sub_race");
    expect(asaas.deleteAsaasSubscription).toHaveBeenCalledWith("sub_race");
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "canceled",
      gateway_status: "inactive",
      remote_cleanup_pending: false,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      status: "completed",
      gateway_subscription_id: "sub_race",
    });
    expect(result.message).toContain("Assinatura cancelada");
  });

  it("bloqueia um segundo trial e contrata o plano pago imediatamente", async () => {
    const db = useDb({
      subscriptions: [
        trialRow({
          status: "canceled",
          canceled_at: "2026-11-15T12:00:00.000Z",
          gateway_status: "inactive",
        }),
      ],
    });

    asaas.createAsaasSubscription.mockResolvedValue({
      id: "sub_paid",
      status: "ACTIVE",
      nextDueDate: "2026-11-16",
    });

    const result = await startSubscription({
      barbershopId: SHOP_ID,
      planId: PLAN_ID,
      billingType: "pix",
      holderName: "Maria da Silva",
      document: "52998224725",
    });

    const subscriptions = db.getRows("subscriptions");

    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[1]).toMatchObject({
      status: "pending",
      trial_ends_at: null,
      gateway_subscription_id: "sub_paid",
    });
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(1);
    expect(result.message).toContain("já foi utilizado");
  });

  it("permite o primeiro trial após uma contratação paga sem teste", async () => {
    const db = useDb({
      subscriptions: [
        trialRow({
          status: "canceled",
          trial_started_at: null,
          trial_ends_at: null,
          gateway_subscription_id: "sub_old",
          gateway_status: "inactive",
          canceled_at: "2026-11-10T12:00:00.000Z",
        }),
      ],
    });

    const result = await startSubscription({
      barbershopId: SHOP_ID,
      planId: PLAN_ID,
      billingType: "pix",
      holderName: "Maria da Silva",
      document: "52998224725",
    });

    const subscriptions = db.getRows("subscriptions");

    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[1]).toMatchObject({
      status: "trialing",
      gateway_subscription_id: null,
      trial_started_at: expect.any(String),
      trial_ends_at: expect.any(String),
      contracted_price_cents: 7990,
    });
    expect(asaas.findAsaasCustomerByDocument).not.toHaveBeenCalled();
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
    expect(result.message).toContain("Teste gratuito");
  });
});

describe("finalização do trial", () => {
  it("cria a assinatura no Asaas somente depois do trial e usa o valor contratado", async () => {
    const db = useDb({
      subscriptions: [trialRow()],
      billing_customers: [customerRow({ gateway_customer_id: null })],
    });

    asaas.createAsaasSubscription.mockResolvedValue({
      id: "sub_new",
      status: "ACTIVE",
      nextDueDate: "2026-11-22",
    });

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      candidates: 1,
      claimed: 1,
      created: 1,
      failed: 0,
      skipped: 0,
    });

    expect(asaas.findAsaasCustomerByDocument).toHaveBeenCalledWith("52998224725");
    expect(asaas.createAsaasCustomer).toHaveBeenCalledTimes(1);
    expect(asaas.createAsaasSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_new",
        billingType: "PIX",
        valueCents: 7990,
        nextDueDate: "2026-11-22",
        cycle: "MONTHLY",
        externalReference: EXTERNAL_REFERENCE,
      }),
    );

    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_new",
      gateway_status: "active",
      trial_finalized_at: "2026-11-22T12:00:00.000Z",
      trial_finalization_attempts: 1,
      trial_finalization_error: null,
      trial_finalization_locked_at: null,
      next_due_date: "2026-11-22",
    });
    expect(db.getRows("billing_customers")[0]?.gateway_customer_id).toBe(
      "cus_new",
    );
  });

  it("recupera a assinatura remota após timeout sem duplicar a criação", async () => {
    const db = useDb({
      subscriptions: [trialRow()],
      billing_customers: [customerRow()],
    });

    asaas.createAsaasSubscription.mockRejectedValue(
      new AsaasError("timeout", "Tempo esgotado."),
    );
    asaas.listAsaasSubscriptionsByExternalReference
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "sub_recovered",
          status: "ACTIVE",
          nextDueDate: "2026-11-22",
        },
      ]);

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary.created).toBe(1);
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(1);
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      gateway_subscription_id: "sub_recovered",
      gateway_status: "active",
      trial_finalized_at: "2026-11-22T12:00:00.000Z",
    });
  });

  it("retoma finalização incompleta quando o ID remoto já foi persistido", async () => {
    const db = useDb({
      subscriptions: [
        trialRow({
          status: "pending",
          trial_ends_at: "2026-11-21T12:00:00.000Z",
          gateway_subscription_id: "sub_existing",
          gateway_status: "active",
          next_due_date: "2026-11-21",
          trial_finalization_attempts: 1,
        }),
      ],
      billing_customers: [customerRow({ gateway_customer_id: "cus_existing" })],
    });

    asaas.getAsaasSubscription.mockResolvedValue({
      id: "sub_existing",
      status: "ACTIVE",
      nextDueDate: "2026-11-22",
      externalReference: EXTERNAL_REFERENCE,
    });

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      candidates: 1,
      claimed: 1,
      created: 1,
      failed: 0,
      skipped: 0,
    });
    expect(asaas.getAsaasSubscription).toHaveBeenCalledWith("sub_existing");
    expect(asaas.listAsaasSubscriptionsByExternalReference).not.toHaveBeenCalled();
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_existing",
      gateway_status: "active",
      trial_finalized_at: "2026-11-22T12:00:00.000Z",
      trial_finalization_attempts: 2,
      trial_finalization_error: null,
      trial_finalization_locked_at: null,
    });
  });

  it("recupera por external_reference quando a criação remota venceu, mas o ID não foi salvo", async () => {
    const db = useDb({
      subscriptions: [trialRow()],
      billing_customers: [customerRow()],
    });

    asaas.createAsaasSubscription.mockResolvedValue({
      id: "sub_orphan",
      status: "ACTIVE",
      nextDueDate: "2026-11-22",
    });
    db.failNextUpdateMatching(
      "subscriptions",
      (payload) => payload.gateway_subscription_id === "sub_orphan",
    );

    const first = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(first).toMatchObject({
      candidates: 1,
      claimed: 1,
      created: 0,
      failed: 1,
    });
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: null,
      trial_finalized_at: null,
      trial_finalization_locked_at: null,
    });
    expect(db.getRows("subscriptions")[0]?.trial_finalization_error).toContain(
      "banco",
    );

    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([
      {
        id: "sub_orphan",
        status: "ACTIVE",
        nextDueDate: "2026-11-22",
        externalReference: EXTERNAL_REFERENCE,
      },
    ]);

    const second = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:01:00.000Z"),
    });

    expect(second).toMatchObject({ claimed: 1, created: 1, failed: 0 });
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(1);
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      gateway_subscription_id: "sub_orphan",
      gateway_status: "active",
      trial_finalized_at: "2026-11-22T12:01:00.000Z",
      trial_finalization_attempts: 2,
    });
  });

  it("retoma sem nova criação quando o ID remoto foi salvo e a conclusão local falhou", async () => {
    const db = useDb({
      subscriptions: [trialRow()],
      billing_customers: [customerRow()],
    });

    asaas.createAsaasSubscription.mockResolvedValue({
      id: "sub_saved",
      status: "ACTIVE",
      nextDueDate: "2026-11-22",
    });
    db.failNextUpdateMatching(
      "subscriptions",
      (payload) => typeof payload.trial_finalized_at === "string",
    );

    const first = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(first).toMatchObject({
      candidates: 1,
      claimed: 1,
      created: 0,
      failed: 1,
    });
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_saved",
      trial_finalized_at: null,
      trial_finalization_locked_at: null,
    });
    expect(db.getRows("subscriptions")[0]?.trial_finalization_error).toContain(
      "registrar a finalização",
    );

    asaas.getAsaasSubscription.mockResolvedValue({
      id: "sub_saved",
      status: "ACTIVE",
      nextDueDate: "2026-11-22",
      externalReference: EXTERNAL_REFERENCE,
    });

    const second = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:01:00.000Z"),
    });

    expect(second).toMatchObject({ claimed: 1, created: 1, failed: 0 });
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(1);
    expect(asaas.getAsaasSubscription).toHaveBeenCalledWith("sub_saved");
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      gateway_subscription_id: "sub_saved",
      gateway_status: "active",
      trial_finalized_at: "2026-11-22T12:01:00.000Z",
      trial_finalization_attempts: 2,
      trial_finalization_error: null,
    });
  });

  it("não conclui a finalização se a assinatura remota existente não puder ser confirmada", async () => {
    const db = useDb({
      subscriptions: [
        trialRow({
          status: "pending",
          gateway_subscription_id: "sub_unverified",
          gateway_status: "active",
          trial_finalization_attempts: 1,
        }),
      ],
      billing_customers: [customerRow({ gateway_customer_id: "cus_existing" })],
    });

    asaas.getAsaasSubscription.mockRejectedValue(
      new AsaasError("timeout", "Tempo esgotado."),
    );

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({ claimed: 1, created: 0, failed: 1 });
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
    expect(asaas.listAsaasSubscriptionsByExternalReference).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      gateway_subscription_id: "sub_unverified",
      trial_finalized_at: null,
      trial_finalization_locked_at: null,
    });
    expect(db.getRows("subscriptions")[0]?.trial_finalization_error).toContain(
      "confirmar a assinatura existente",
    );
  });

  it("adota a assinatura recuperada por external_reference quando o ID antigo não existe mais", async () => {
    const db = useDb({
      subscriptions: [
        trialRow({
          status: "pending",
          gateway_subscription_id: "sub_stale",
          gateway_status: "active",
          trial_finalization_attempts: 1,
        }),
      ],
      billing_customers: [customerRow({ gateway_customer_id: "cus_existing" })],
    });

    asaas.getAsaasSubscription.mockRejectedValue(
      new AsaasError("not_found", "Assinatura não encontrada.", 404),
    );
    asaas.listAsaasSubscriptionsByExternalReference.mockResolvedValue([
      {
        id: "sub_current",
        status: "ACTIVE",
        nextDueDate: "2026-11-22",
        externalReference: EXTERNAL_REFERENCE,
      },
    ]);

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({ claimed: 1, created: 1, failed: 0 });
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      gateway_subscription_id: "sub_current",
      gateway_status: "active",
      trial_finalized_at: "2026-11-22T12:00:00.000Z",
    });
  });

  it("registra falha temporária e reprocessa sem duplicar a cobrança", async () => {
    const db = useDb({
      subscriptions: [trialRow()],
      billing_customers: [customerRow()],
    });

    asaas.createAsaasSubscription.mockRejectedValueOnce(
      new AsaasError("unavailable", "Asaas indisponível."),
    );

    const first = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(first).toMatchObject({ claimed: 1, created: 0, failed: 1 });

    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: null,
      trial_finalized_at: null,
      trial_finalization_attempts: 1,
      trial_finalization_locked_at: null,
    });
    expect(db.getRows("subscriptions")[0]?.trial_finalization_error).toContain(
      "confirmação",
    );

    asaas.createAsaasSubscription.mockResolvedValueOnce({
      id: "sub_retry",
      status: "ACTIVE",
      nextDueDate: "2026-11-22",
    });

    const second = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:01:00.000Z"),
    });

    expect(second).toMatchObject({ claimed: 1, created: 1, failed: 0 });
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(2);
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      gateway_subscription_id: "sub_retry",
      gateway_status: "active",
      trial_finalization_attempts: 2,
      trial_finalization_error: null,
    });
  });

  it("impede duas execuções simultâneas de criarem a mesma assinatura", async () => {
    const db = useDb({
      subscriptions: [trialRow()],
      billing_customers: [customerRow()],
    });

    asaas.createAsaasSubscription.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));

      return {
        id: "sub_once",
        status: "ACTIVE",
        nextDueDate: "2026-11-22",
      };
    });

    const now = new Date("2026-11-22T12:00:00.000Z");
    const [first, second] = await Promise.all([
      finalizeExpiredTrials({ now }),
      finalizeExpiredTrials({ now }),
    ]);

    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(1);
    expect(first.created + second.created).toBe(1);
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "pending",
      gateway_subscription_id: "sub_once",
    });
  });

  it("não reprocessa uma finalização com lock válido de outra execução", async () => {
    useDb({
      subscriptions: [
        trialRow({
          status: "pending",
          trial_finalization_locked_at: "2026-11-22T11:58:00.000Z",
          trial_finalization_attempts: 1,
        }),
      ],
      billing_customers: [customerRow()],
    });

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({ candidates: 1, claimed: 0, skipped: 1 });
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
  });

  it("impede cancelamento enquanto a primeira cobrança está sendo preparada", async () => {
    const db = useDb({
      subscriptions: [
        trialRow({
          status: "pending",
          trial_finalization_locked_at: new Date().toISOString(),
          trial_finalization_attempts: 1,
        }),
      ],
    });

    await expect(
      cancelSubscription({ barbershopId: SHOP_ID }),
    ).rejects.toMatchObject({ kind: "conflict" });

    expect(asaas.deleteAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("ignora assinatura pending sem trial_ends_at", async () => {
    const db = useDb({
      subscriptions: [
        trialRow({
          status: "pending",
          trial_started_at: null,
          trial_ends_at: null,
        }),
      ],
    });

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      candidates: 0,
      claimed: 0,
      created: 0,
      failed: 0,
      skipped: 0,
    });
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "pending",
      trial_ends_at: null,
      trial_finalized_at: null,
      trial_finalization_attempts: 0,
    });
  });

  it("ignora assinatura trialing sem trial_ends_at", async () => {
    const db = useDb({
      subscriptions: [
        trialRow({
          status: "trialing",
          trial_started_at: null,
          trial_ends_at: null,
        }),
      ],
    });

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      candidates: 0,
      claimed: 0,
      created: 0,
      failed: 0,
      skipped: 0,
    });
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "trialing",
      trial_ends_at: null,
      trial_finalized_at: null,
      trial_finalization_attempts: 0,
    });
  });

  it("não reprocessa assinatura pending já finalizada", async () => {
    const finalizedAt = "2026-11-21T12:00:00.000Z";
    const db = useDb({
      subscriptions: [
        trialRow({
          status: "pending",
          trial_finalized_at: finalizedAt,
          trial_finalization_attempts: 1,
        }),
      ],
    });

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      candidates: 0,
      claimed: 0,
      created: 0,
      failed: 0,
      skipped: 0,
    });
    expect(asaas.createAsaasSubscription).not.toHaveBeenCalled();
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "pending",
      trial_finalized_at: finalizedAt,
      trial_finalization_attempts: 1,
    });
  });

  it("usa 20 como limite padrão de candidatos", async () => {
    const db = useDb(expiredTrials(25));

    mockSuccessfulRemoteCreation();

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      candidates: 20,
      claimed: 20,
      created: 20,
      failed: 0,
      skipped: 0,
    });
    expect(summary.items).toHaveLength(20);
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(20);
    expect(
      db
        .getRows("subscriptions")
        .filter((row) => row.status === "trialing"),
    ).toHaveLength(5);
  });

  it("respeita um limite explícito menor que o padrão", async () => {
    const db = useDb(expiredTrials(10));

    mockSuccessfulRemoteCreation();

    const summary = await finalizeExpiredTrials({
      limit: 3,
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      candidates: 3,
      claimed: 3,
      created: 3,
      failed: 0,
      skipped: 0,
    });
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(3);
    expect(
      db
        .getRows("subscriptions")
        .filter((row) => row.status === "trialing"),
    ).toHaveLength(7);
  });

  it("eleva o limite mínimo para 1", async () => {
    const db = useDb(expiredTrials(5));

    mockSuccessfulRemoteCreation();

    const summary = await finalizeExpiredTrials({
      limit: 0,
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      candidates: 1,
      claimed: 1,
      created: 1,
      failed: 0,
      skipped: 0,
    });
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(1);
    expect(
      db
        .getRows("subscriptions")
        .filter((row) => row.status === "trialing"),
    ).toHaveLength(4);
  });

  it("limita o lote máximo a 50 candidatos", async () => {
    const db = useDb(expiredTrials(55));

    mockSuccessfulRemoteCreation();

    const summary = await finalizeExpiredTrials({
      limit: 100,
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      candidates: 50,
      claimed: 50,
      created: 50,
      failed: 0,
      skipped: 0,
    });
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(50);
    expect(
      db
        .getRows("subscriptions")
        .filter((row) => row.status === "trialing"),
    ).toHaveLength(5);
  });

  it("processa os candidatos em ordem crescente de trial_ends_at", async () => {
    const db = useDb({
      subscriptions: [
        trialRow({
          id: "sub_late",
          external_reference: "ref_late",
          trial_ends_at: "2026-11-21T12:00:00.000Z",
        }),
        trialRow({
          id: "sub_early",
          external_reference: "ref_early",
          trial_ends_at: "2026-11-19T12:00:00.000Z",
        }),
        trialRow({
          id: "sub_middle",
          external_reference: "ref_middle",
          trial_ends_at: "2026-11-20T12:00:00.000Z",
        }),
      ],
      billing_customers: [customerRow()],
    });

    mockSuccessfulRemoteCreation();

    const summary = await finalizeExpiredTrials({
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary.items.map((item) => item.subscriptionId)).toEqual([
      "sub_early",
      "sub_middle",
      "sub_late",
    ]);
    expect(summary).toMatchObject({ candidates: 3, created: 3 });
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(3);
    expect(
      db.getRows("subscriptions").find((row) => row.id === "sub_early"),
    ).toMatchObject({
      trial_finalized_at: "2026-11-22T12:00:00.000Z",
    });
  });

  it("processa somente 20 dos mais de 20 trials vencidos", async () => {
    const db = useDb(expiredTrials(25));

    mockSuccessfulRemoteCreation();

    const summary = await finalizeExpiredTrials({
      limit: 20,
      now: new Date("2026-11-22T12:00:00.000Z"),
    });

    expect(summary).toMatchObject({
      candidates: 20,
      claimed: 20,
      created: 20,
      failed: 0,
      skipped: 0,
    });
    expect(asaas.createAsaasSubscription).toHaveBeenCalledTimes(20);

    const rows = db.getRows("subscriptions");
    const remaining = rows.filter((row) => row.status === "trialing");

    expect(remaining).toHaveLength(5);
    expect(remaining.map((row) => row.id).sort()).toEqual([
      "sub_20",
      "sub_21",
      "sub_22",
      "sub_23",
      "sub_24",
    ]);
    expect(
      rows.filter((row) => row.trial_finalized_at !== null),
    ).toHaveLength(20);
  });
});
