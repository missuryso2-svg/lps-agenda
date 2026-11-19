import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase, type FakeRow } from "./helpers/fake-supabase";
import { installFakeAsaasPaymentTransitionRpc } from "./helpers/fake-asaas-payment-transition";

vi.mock("server-only", () => ({}));

import {
  BillingWebhookError,
  processAsaasEvent,
} from "@/features/billing/webhook";
import {
  sanitizeAsaasWebhookPayload,
  verifyAsaasWebhookToken,
  type AsaasWebhookEvent,
} from "@/lib/asaas/webhook";

const SHOP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_SHOP_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SUBSCRIPTION_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const EXTERNAL_REFERENCE = "33333333-3333-4333-8333-333333333333";
const OTHER_EXTERNAL_REFERENCE = "66666666-6666-4666-8666-666666666666";

function subscriptionRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SUBSCRIPTION_ID,
    barbershop_id: SHOP_ID,
    plan_id: PLAN_ID,
    status: "pending",
    current_period_start: null,
    current_period_end: null,
    trial_ends_at: null,
    trial_finalization_locked_at: null,
    trial_finalization_lease_token: null,
    trial_finalized_at: null,
    past_due_since: null,
    grace_period_ends_at: null,
    cancel_at_period_end: false,
    gateway: "asaas",
    gateway_subscription_id: "sub_123",
    billing_type: "pix",
    gateway_status: "active",
    external_reference: EXTERNAL_REFERENCE,
    next_due_date: "2026-11-15",
    canceled_at: null,
    checkout_locked_at: null,
    checkout_lease_token: null,
    remote_cleanup_pending: false,
    created_at: "2026-11-14T12:00:00.000Z",
    updated_at: "2026-11-14T12:00:00.000Z",
    ...overrides,
  };
}

function paymentRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    barbershop_id: SHOP_ID,
    subscription_id: SUBSCRIPTION_ID,
    appointment_id: null,
    amount_cents: 8990,
    status: "paid",
    method: "pix",
    scope: "platform_subscription",
    due_date: "2026-11-15",
    paid_at: "2026-11-15T12:00:00.000Z",
    gateway: "asaas",
    gateway_payment_id: "pay_123",
    invoice_url: null,
    metadata: {},
    created_at: "2026-11-14T12:00:00.000Z",
    updated_at: "2026-11-14T12:00:00.000Z",
    ...overrides,
  };
}

function paymentEvent(
  event: string,
  payment: Partial<AsaasWebhookEvent["payment"]> = {},
): AsaasWebhookEvent {
  return {
    id: `evt_${event}`,
    event,
    payment: {
      id: "pay_123",
      subscription: "sub_123",
      value: 89.9,
      status: "PENDING",
      billingType: "PIX",
      dueDate: "2026-11-15",
      externalReference: EXTERNAL_REFERENCE,
      ...payment,
    },
  };
}

function useDb(seed: Record<string, FakeRow[]> = {}) {
  const db = new FakeSupabase({
    plans: [
      {
        id: PLAN_ID,
        name: "Profissional",
        interval: "month",
        price_cents: 8990,
        is_active: true,
        features: [],
        code: "profissional",
        description: null,
        max_barbers: 5,
      },
    ],
    subscriptions: [subscriptionRow()],
    ...seed,
  });

  installFakeAsaasPaymentTransitionRpc(db);

  return db;
}

function installPastDueGraceTrigger(
  db: FakeSupabase,
  databaseNow: () => Date,
): void {
  db.setUpdateHook("subscriptions", (current, payload) => {
    const nextStatus = payload.status ?? current.status;

    if (nextStatus !== "past_due") {
      return {
        ...payload,
        past_due_since: null,
        grace_period_ends_at: null,
      };
    }

    const startedAt =
      current.status === "past_due" && typeof current.past_due_since === "string"
        ? current.past_due_since
        : databaseNow().toISOString();
    const existingEnd =
      current.status === "past_due" &&
      typeof current.grace_period_ends_at === "string"
        ? current.grace_period_ends_at
        : null;

    return {
      ...payload,
      past_due_since: startedAt,
      grace_period_ends_at:
        existingEnd ??
        new Date(new Date(startedAt).getTime() + 72 * 60 * 60 * 1000).toISOString(),
    };
  });
}

function patchSubscriptionAfterFirstRead(
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

function patchPaymentAfterFirstRead(
  db: FakeSupabase,
  paymentId: string,
  patch: FakeRow,
): void {
  const originalGetRows = db.getRows.bind(db);
  let firstRead = true;

  db.getRows = (table: string) => {
    const rows = originalGetRows(table);

    if (table !== "payments" || !firstRead) {
      return rows;
    }

    firstRead = false;
    const snapshot = rows.map((row) => ({ ...row }));

    db.setRows(
      "payments",
      rows.map((row) =>
        row.id === paymentId ? { ...row, ...patch } : { ...row },
      ),
    );

    return snapshot;
  };
}

beforeEach(() => {
  process.env.ASAAS_ENV = "sandbox";
  process.env.ASAAS_API_KEY = "sandbox-api-key";
  process.env.ASAAS_WEBHOOK_TOKEN =
    "webhook-token-with-at-least-32-characters-9f3a";
});

describe("token e sanitização do webhook", () => {
  it("compara o token dedicado em tempo constante", () => {
    expect(
      verifyAsaasWebhookToken(
        "webhook-token-with-at-least-32-characters-9f3a",
      ),
    ).toBe(true);
    expect(verifyAsaasWebhookToken("wrong-token")).toBe(false);
    expect(verifyAsaasWebhookToken(null)).toBe(false);
    expect(verifyAsaasWebhookToken("sandbox-api-key")).toBe(false);
  });

  it("remove campos de cartão do payload persistido", () => {
    const sanitized = sanitizeAsaasWebhookPayload({
      id: "evt_1",
      event: "PAYMENT_CREATED",
      payment: {
        id: "pay_1",
        creditCard: {
          creditCardNumber: "4111111111111111",
          creditCardToken: "token",
          cvv: "123",
        },
      },
    });

    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain("4111111111111111");
    expect(serialized).not.toContain("creditCard");
    expect(serialized).not.toContain("cvv");
    expect(serialized).toContain("pay_1");
  });
});

describe("processamento idempotente dos eventos", () => {
  it("ignora eventos desconhecidos sem tocar nas tabelas", async () => {
    const db = useDb();

    const outcome = await processAsaasEvent(db as never, {
      id: "evt_unknown",
      event: "SOMETHING_NEW",
    });

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")).toHaveLength(0);
  });

  it("registra PAYMENT_CREATED como pendente e não ativa o plano", async () => {
    const db = useDb();

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CREATED"),
    );

    expect(outcome).toBe("processed");

    const payments = db.getRows("payments");
    const subscription = db.getRows("subscriptions")[0];

    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      status: "pending",
      scope: "platform_subscription",
      subscription_id: SUBSCRIPTION_ID,
      gateway_payment_id: "pay_123",
      amount_cents: 8990,
      method: "pix",
    });
    expect(subscription?.status).toBe("pending");
    expect(subscription?.current_period_start).toBeNull();
  });

  it("confirma o pagamento e ativa a assinatura com o próximo período", async () => {
    const db = useDb();

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CONFIRMED", {
        status: "CONFIRMED",
        confirmedDate: "2026-11-15",
      }),
    );

    const payment = db.getRows("payments")[0];
    const subscription = db.getRows("subscriptions")[0];

    expect(payment).toMatchObject({ status: "paid" });
    expect(payment?.paid_at).toBe("2026-11-15T12:00:00.000Z");
    expect(subscription).toMatchObject({
      status: "active",
      current_period_start: "2026-11-15T12:00:00.000Z",
      current_period_end: "2026-12-15T12:00:00.000Z",
    });
  });

  it("não avança duas vezes o período em eventos distintos da mesma confirmação", async () => {
    const db = useDb();
    const confirmed = paymentEvent("PAYMENT_CONFIRMED", {
      status: "CONFIRMED",
      confirmedDate: "2026-11-15",
    });
    const received = {
      ...paymentEvent("PAYMENT_RECEIVED", {
        status: "RECEIVED",
        paymentDate: "2026-11-15",
      }),
      id: "evt_payment_received_after_confirmed",
    };

    await processAsaasEvent(db as never, confirmed);
    const periodAfterConfirmation = {
      start: db.getRows("subscriptions")[0]?.current_period_start,
      end: db.getRows("subscriptions")[0]?.current_period_end,
    };
    await processAsaasEvent(db as never, received);

    expect(db.getRows("payments")).toHaveLength(1);
    expect(db.getRows("payments")[0]?.status).toBe("paid");
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "active",
      current_period_start: periodAfterConfirmation.start,
      current_period_end: periodAfterConfirmation.end,
    });
  });

  it("preserva o período inadimplente quando uma cobrança de outubro é confirmada atrasada", async () => {
    const octoberPayment = paymentRow({
      id: "44444444-4444-4444-8444-444444444410",
      gateway_payment_id: "pay_october",
      due_date: "2026-10-15",
      paid_at: "2026-10-15T12:00:00.000Z",
    });
    const novemberPayment = paymentRow({
      id: "44444444-4444-4444-8444-444444444411",
      gateway_payment_id: "pay_november",
      due_date: "2026-11-15",
      status: "overdue",
      paid_at: null,
    });
    const db = useDb({
      payments: [octoberPayment, novemberPayment],
      subscriptions: [
        subscriptionRow({
          status: "past_due",
          current_period_start: "2026-10-15T12:00:00.000Z",
          current_period_end: "2026-11-15T12:00:00.000Z",
          past_due_since: "2026-11-16T12:00:00.000Z",
          grace_period_ends_at: "2026-11-19T12:00:00.000Z",
        }),
      ],
    });

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CONFIRMED", {
        id: "pay_october",
        status: "CONFIRMED",
        dueDate: "2026-10-15",
        confirmedDate: "2026-10-15",
      }),
    );

    expect(db.getRows("payments")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gateway_payment_id: "pay_october", status: "paid" }),
        expect.objectContaining({ gateway_payment_id: "pay_november", status: "overdue" }),
      ]),
    );
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "past_due",
      current_period_start: "2026-10-15T12:00:00.000Z",
      current_period_end: "2026-11-15T12:00:00.000Z",
      past_due_since: "2026-11-16T12:00:00.000Z",
      grace_period_ends_at: "2026-11-19T12:00:00.000Z",
    });
  });

  it("não restaura pagamento estornado com confirmação antiga de outro evento", async () => {
    const db = useDb({
      payments: [
        paymentRow({
          status: "refunded",
          paid_at: "2026-11-15T12:00:00.000Z",
          metadata: {
            asaas_event: "PAYMENT_REFUNDED",
            asaas_status: "REFUNDED",
            asaas_payment_state_event: "PAYMENT_REFUNDED",
            asaas_payment_state_status: "refunded",
          },
        }),
      ],
      subscriptions: [subscriptionRow({ status: "past_due" })],
    });

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CONFIRMED", {
        status: "CONFIRMED",
        confirmedDate: "2026-11-15",
      }),
    );

    expect(db.getRows("payments")[0]).toMatchObject({
      status: "refunded",
      metadata: expect.objectContaining({
        asaas_payment_state_event: "PAYMENT_REFUNDED",
      }),
    });
    expect(db.getRows("subscriptions")[0]?.status).toBe("past_due");
  });

  it("usa dateCreated do Asaas para rejeitar confirmação mais antiga com outro ID", async () => {
    const db = useDb();
    const received = {
      ...paymentEvent("PAYMENT_RECEIVED", {
        status: "RECEIVED",
        paymentDate: "2026-11-15",
      }),
      id: "evt_payment_received_newer",
      dateCreated: "2026-11-15 14:00:00",
    };
    const confirmed = {
      ...paymentEvent("PAYMENT_CONFIRMED", {
        status: "CONFIRMED",
        value: 129.9,
        confirmedDate: "2026-11-15",
      }),
      id: "evt_payment_confirmed_older",
      dateCreated: "2026-11-15 13:00:00",
    };

    await processAsaasEvent(db as never, received);
    const periodAfterReceived = {
      start: db.getRows("subscriptions")[0]?.current_period_start,
      end: db.getRows("subscriptions")[0]?.current_period_end,
    };
    const outcome = await processAsaasEvent(db as never, confirmed);

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")).toHaveLength(1);
    expect(db.getRows("payments")[0]).toMatchObject({
      status: "paid",
      amount_cents: 8990,
      metadata: expect.objectContaining({
        asaas_event: "PAYMENT_RECEIVED",
        asaas_event_id: "evt_payment_received_newer",
      }),
    });
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "active",
      current_period_start: periodAfterReceived.start,
      current_period_end: periodAfterReceived.end,
    });
  });

  it("não infere ordem absoluta entre dateCreated com e sem timezone", async () => {
    const db = useDb();
    const wallClockEvent = {
      ...paymentEvent("PAYMENT_RECEIVED", { status: "RECEIVED" }),
      id: "evt_wall_clock_received",
      dateCreated: "2026-11-15 14:00:00",
    };
    const zonedEvent = {
      ...paymentEvent("PAYMENT_CONFIRMED", { status: "CONFIRMED" }),
      id: "evt_zoned_confirmation",
      dateCreated: "2026-11-15T13:00:00Z",
    };

    await processAsaasEvent(db as never, wallClockEvent);
    const outcome = await processAsaasEvent(db as never, zonedEvent);

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")[0]).toMatchObject({
      status: "paid",
      metadata: expect.objectContaining({
        asaas_event: "PAYMENT_RECEIVED",
        asaas_event_id: "evt_wall_clock_received",
      }),
    });
    expect(db.getRows("subscriptions")[0]?.status).toBe("active");
  });

  it("normaliza offsets explícitos antes de comparar dateCreated", async () => {
    const db = useDb();
    const laterReceived = {
      ...paymentEvent("PAYMENT_RECEIVED", { status: "RECEIVED" }),
      id: "evt_received_brasilia_offset",
      dateCreated: "2026-11-15T14:00:00-03:00",
    };
    const earlierConfirmed = {
      ...paymentEvent("PAYMENT_CONFIRMED", { status: "CONFIRMED" }),
      id: "evt_confirmed_utc_earlier",
      dateCreated: "2026-11-15T16:30:00Z",
    };

    await processAsaasEvent(db as never, laterReceived);
    const outcome = await processAsaasEvent(db as never, earlierConfirmed);

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")[0]).toMatchObject({
      status: "paid",
      metadata: expect.objectContaining({
        asaas_event_id: "evt_received_brasilia_offset",
      }),
    });
    expect(db.getRows("subscriptions")[0]?.status).toBe("active");
  });

  it("só restaura cobrança cancelada após PAYMENT_RESTORED com status pendente", async () => {
    const db = useDb({
      payments: [
        paymentRow({
          status: "cancelled",
          paid_at: null,
          metadata: {
            asaas_event: "PAYMENT_DELETED",
            asaas_status: "DELETED",
            asaas_payment_state_event: "PAYMENT_DELETED",
            asaas_payment_state_status: "cancelled",
          },
        }),
      ],
    });

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_RESTORED", { status: "PENDING" }),
    );

    expect(outcome).toBe("processed");
    expect(db.getRows("payments")[0]).toMatchObject({
      status: "pending",
      metadata: expect.objectContaining({
        asaas_payment_state_event: "PAYMENT_RESTORED",
      }),
    });
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("não reabre cobrança cancelada por confirmação financeira", async () => {
    const db = useDb({
      payments: [
        paymentRow({
          status: "cancelled",
          paid_at: null,
          metadata: {
            asaas_event: "PAYMENT_DELETED",
            asaas_status: "DELETED",
            asaas_payment_state_event: "PAYMENT_DELETED",
            asaas_payment_state_status: "cancelled",
          },
        }),
      ],
    });

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_RECEIVED", { status: "RECEIVED" }),
    );

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")[0]?.status).toBe("cancelled");
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("mantém o estorno mais recente em confirmações e estorno concorrentes", async () => {
    const db = useDb();
    db.addUniqueConstraint("payments", ["gateway", "gateway_payment_id"]);
    const confirmation = {
      ...paymentEvent("PAYMENT_CONFIRMED", { status: "CONFIRMED" }),
      id: "evt_confirmation_before_refund",
      dateCreated: "2026-11-15 13:00:00",
    };
    const refund = {
      ...paymentEvent("PAYMENT_REFUNDED", { status: "REFUNDED" }),
      id: "evt_refund_after_confirmation",
      dateCreated: "2026-11-15 14:00:00",
    };

    await Promise.all([
      processAsaasEvent(db as never, confirmation),
      processAsaasEvent(db as never, refund),
    ]);

    expect(db.getRows("payments")).toHaveLength(1);
    expect(db.getRows("payments")[0]).toMatchObject({ status: "refunded" });
    expect(db.getRows("subscriptions")[0]?.status).toBe("past_due");
  });

  it("preserva o cancelamento futuro após confirmação financeira", async () => {
    const db = useDb({
      payments: [paymentRow({ status: "overdue", paid_at: null })],
      subscriptions: [
        subscriptionRow({ status: "active", cancel_at_period_end: true }),
      ],
    });

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CONFIRMED", {
        status: "CONFIRMED",
        confirmedDate: "2026-11-15",
      }),
    );

    expect(db.getRows("payments")[0]?.status).toBe("paid");
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "active",
      cancel_at_period_end: true,
    });
  });

  it("ignora PAYMENT_DUNNING_RECEIVED sem alterar pagamento ou assinatura", async () => {
    const initialPayment = paymentRow({
      status: "overdue",
      paid_at: null,
      metadata: { preserved: "true" },
    });
    const db = useDb({
      payments: [initialPayment],
      subscriptions: [subscriptionRow({ status: "past_due" })],
    });

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_DUNNING_RECEIVED", {
        status: "DUNNING_RECEIVED",
      }),
    );

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")[0]).toMatchObject({
      status: "overdue",
      metadata: { preserved: "true" },
    });
    expect(db.getRows("subscriptions")[0]?.status).toBe("past_due");
  });

  it("não trata PAYMENT_REFUND_DENIED como confirmação financeira nova", async () => {
    const db = useDb({
      payments: [
        paymentRow({
          status: "refunded",
          metadata: {
            asaas_event: "PAYMENT_REFUNDED",
            asaas_status: "REFUNDED",
            asaas_payment_state_event: "PAYMENT_REFUNDED",
            asaas_payment_state_status: "refunded",
          },
        }),
      ],
      subscriptions: [subscriptionRow({ status: "past_due" })],
    });

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_REFUND_DENIED", { status: "RECEIVED" }),
    );

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")[0]?.status).toBe("refunded");
    expect(db.getRows("subscriptions")[0]?.status).toBe("past_due");
  });

  it("permite restauração explicitamente negada apenas após estorno em andamento", async () => {
    const db = useDb({
      payments: [
        paymentRow({
          status: "refunded",
          metadata: {
            asaas_event: "PAYMENT_REFUND_IN_PROGRESS",
            asaas_status: "REFUND_IN_PROGRESS",
            asaas_payment_state_event: "PAYMENT_REFUND_IN_PROGRESS",
            asaas_event_created_at: "wall_clock:2026-11-16T12:00:00.000",
            asaas_payment_state_created_at: "wall_clock:2026-11-16T12:00:00.000",
            asaas_payment_state_status: "refunded",
          },
        }),
      ],
      subscriptions: [
        subscriptionRow({
          status: "past_due",
          current_period_start: "2026-11-15T12:00:00.000Z",
          current_period_end: "2026-12-15T12:00:00.000Z",
        }),
      ],
    });

    await processAsaasEvent(
      db as never,
      {
        ...paymentEvent("PAYMENT_REFUND_DENIED", {
          status: "RECEIVED",
          dueDate: "2026-11-15",
        }),
        id: "evt_refund_denied_after_progress",
        dateCreated: "2026-11-17 12:00:00",
      },
    );

    expect(db.getRows("payments")[0]).toMatchObject({
      status: "paid",
      metadata: expect.objectContaining({
        asaas_restored_from_event: "PAYMENT_REFUND_IN_PROGRESS",
      }),
    });
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "active",
      current_period_start: "2026-11-15T12:00:00.000Z",
      current_period_end: "2026-12-15T12:00:00.000Z",
    });
  });

  it("não reverte estorno em andamento sem timestamp que prove a ordem do evento", async () => {
    const db = useDb({
      payments: [
        paymentRow({
          status: "refunded",
          metadata: {
            asaas_event: "PAYMENT_REFUND_IN_PROGRESS",
            asaas_status: "REFUND_IN_PROGRESS",
            asaas_payment_state_event: "PAYMENT_REFUND_IN_PROGRESS",
            asaas_event_created_at: "wall_clock:2026-11-16T12:00:00.000",
            asaas_payment_state_created_at: "wall_clock:2026-11-16T12:00:00.000",
            asaas_payment_state_status: "refunded",
          },
        }),
      ],
      subscriptions: [subscriptionRow({ status: "past_due" })],
    });

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_REFUND_DENIED", { status: "RECEIVED" }),
    );

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")[0]?.status).toBe("refunded");
    expect(db.getRows("subscriptions")[0]?.status).toBe("past_due");
  });

  it("não sobrescreve pagamento estornado por confirmação após leitura concorrente", async () => {
    const targetPaymentId = "44444444-4444-4444-8444-444444444499";
    const targetPayment = paymentRow({
      id: targetPaymentId,
      status: "pending",
      paid_at: null,
    });
    const db = useDb({ payments: [targetPayment] });
    patchPaymentAfterFirstRead(db, targetPaymentId, {
      status: "refunded",
      updated_at: "2026-11-16T12:00:00.000Z",
      metadata: {
        asaas_event: "PAYMENT_REFUNDED",
        asaas_status: "REFUNDED",
        asaas_payment_state_event: "PAYMENT_REFUNDED",
        asaas_payment_state_status: "refunded",
      },
    });

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CONFIRMED", { status: "CONFIRMED" }),
    );

    expect(db.getRows("payments")[0]).toMatchObject({
      status: "refunded",
      metadata: expect.objectContaining({
        asaas_payment_state_event: "PAYMENT_REFUNDED",
      }),
    });
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("não atualiza pagamento de outro tenant quando o ID remoto colide com evento da barbearia A", async () => {
    const otherSubscription = subscriptionRow({
      id: OTHER_SUBSCRIPTION_ID,
      barbershop_id: OTHER_SHOP_ID,
      external_reference: OTHER_EXTERNAL_REFERENCE,
      gateway_subscription_id: "sub_other",
      status: "past_due",
    });
    const otherPayment = paymentRow({
      id: "77777777-7777-4777-8777-777777777777",
      barbershop_id: OTHER_SHOP_ID,
      subscription_id: OTHER_SUBSCRIPTION_ID,
      gateway_subscription_id: "sub_other",
      status: "overdue",
      paid_at: null,
    });
    const db = useDb({
      payments: [otherPayment],
      subscriptions: [subscriptionRow(), otherSubscription],
    });

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CONFIRMED", { status: "CONFIRMED" }),
    );

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")[0]).toMatchObject({
      id: otherPayment.id,
      barbershop_id: OTHER_SHOP_ID,
      subscription_id: OTHER_SUBSCRIPTION_ID,
      status: "overdue",
    });
    expect(db.getRows("subscriptions")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: SUBSCRIPTION_ID, status: "pending" }),
        expect.objectContaining({ id: OTHER_SUBSCRIPTION_ID, status: "past_due" }),
      ]),
    );
  });

  it("ignora cobrança financeira recebida durante trial local sem assinatura remota", async () => {
    const db = useDb({
      subscriptions: [
        subscriptionRow({ status: "trialing", gateway_subscription_id: null }),
      ],
    });

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CONFIRMED", { status: "CONFIRMED" }),
    );

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")).toHaveLength(0);
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "trialing",
      gateway_subscription_id: null,
    });
  });

  it("não altera valores financeiros por PAYMENT_CREATED duplicado com valor diferente", async () => {
    const db = useDb();

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CREATED", { value: 89.9 }),
    );
    await processAsaasEvent(
      db as never,
      {
        ...paymentEvent("PAYMENT_CREATED", { value: 129.9 }),
        id: "evt_payment_created_with_stale_amount",
      },
    );

    expect(db.getRows("payments")).toHaveLength(1);
    expect(db.getRows("payments")[0]).toMatchObject({
      amount_cents: 8990,
      status: "pending",
    });
  });

  it("aceita alteração de valor somente em PAYMENT_UPDATED e rejeita sua versão antiga", async () => {
    const db = useDb();
    const created = {
      ...paymentEvent("PAYMENT_CREATED", { value: 89.9 }),
      id: "evt_payment_created_before_update",
      dateCreated: "2026-11-15 12:00:00",
    };
    const updated = {
      ...paymentEvent("PAYMENT_UPDATED", {
        value: 99.9,
        status: "PENDING",
        dueDate: "2026-11-20",
      }),
      id: "evt_payment_updated_newer",
      dateCreated: "2026-11-15 13:00:00",
    };
    const staleUpdate = {
      ...paymentEvent("PAYMENT_UPDATED", {
        value: 129.9,
        status: "PENDING",
        dueDate: "2026-11-25",
      }),
      id: "evt_payment_updated_older",
      dateCreated: "2026-11-15 12:30:00",
    };

    await processAsaasEvent(db as never, created);
    await processAsaasEvent(db as never, updated);
    const outcome = await processAsaasEvent(db as never, staleUpdate);

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")[0]).toMatchObject({
      amount_cents: 9990,
      due_date: "2026-11-20",
      status: "pending",
    });
  });

  it("atualiza uma cobrança vencida preexistente sem exigir metadata nova", async () => {
    const db = useDb({
      payments: [
        paymentRow({
          status: "overdue",
          paid_at: null,
          metadata: {
            asaas_event: "PAYMENT_OVERDUE",
            asaas_status: "OVERDUE",
          },
        }),
      ],
      subscriptions: [subscriptionRow({ status: "past_due" })],
    });

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_UPDATED", {
        status: "PENDING",
        value: 99.9,
        dueDate: "2026-11-20",
      }),
    );

    expect(outcome).toBe("processed");
    expect(db.getRows("payments")[0]).toMatchObject({
      status: "overdue",
      amount_cents: 9990,
      due_date: "2026-11-20",
    });
    expect(db.getRows("subscriptions")[0]?.status).toBe("past_due");
  });

  it("registra PAYMENT_RECEIVED como pago e ativa a assinatura", async () => {
    const db = useDb();

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_RECEIVED", {
        status: "RECEIVED",
        confirmedDate: "2026-11-15",
      }),
    );

    expect(db.getRows("payments")[0]).toMatchObject({ status: "paid" });
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "active",
      current_period_start: "2026-11-15T12:00:00.000Z",
      current_period_end: "2026-12-15T12:00:00.000Z",
    });
  });

  it("não reativa pending se o cancelamento vence após a leitura do webhook", async () => {
    const cleanupJob = {
      id: "cleanup-1",
      subscription_id: SUBSCRIPTION_ID,
      barbershop_id: SHOP_ID,
      external_reference: EXTERNAL_REFERENCE,
      gateway_subscription_id: "sub_123",
      status: "pending",
      attempts: 0,
    };
    const db = useDb({
      subscriptions: [subscriptionRow({ status: "pending" })],
      billing_remote_cleanup_jobs: [cleanupJob],
    });

    // O SELECT do webhook recebe pending, mas o estado com RPC/job muda antes
    // do UPDATE. O filtro de status terminal precisa vencer a leitura antiga.
    patchSubscriptionAfterFirstRead(db, {
      status: "canceled",
      gateway_status: "inactive",
      remote_cleanup_pending: true,
    });

    await expect(
      processAsaasEvent(
        db as never,
        paymentEvent("PAYMENT_CONFIRMED", { status: "CONFIRMED" }),
      ),
    ).resolves.toBe("processed");

    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "canceled",
      gateway_status: "inactive",
      remote_cleanup_pending: true,
    });
    expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
      id: "cleanup-1",
      status: "pending",
      gateway_subscription_id: "sub_123",
    });
  });

  it.each(["canceled", "expired"] as const)(
    "não reativa uma assinatura %s por evento PAYMENT_CONFIRMED",
    async (status) => {
      const db = useDb({
        subscriptions: [
          subscriptionRow({
            status,
            gateway_status: "inactive",
            remote_cleanup_pending: true,
          }),
        ],
        billing_remote_cleanup_jobs: [
          {
            id: "cleanup-1",
            subscription_id: SUBSCRIPTION_ID,
            barbershop_id: SHOP_ID,
            external_reference: EXTERNAL_REFERENCE,
            gateway_subscription_id: "sub_123",
            status: "retry",
            attempts: 1,
          },
        ],
      });

      await processAsaasEvent(
        db as never,
        paymentEvent("PAYMENT_CONFIRMED", { status: "CONFIRMED" }),
      );

      expect(db.getRows("subscriptions")[0]).toMatchObject({
        status,
        gateway_status: "inactive",
        remote_cleanup_pending: true,
      });
      expect(db.getRows("billing_remote_cleanup_jobs")[0]).toMatchObject({
        id: "cleanup-1",
        status: "retry",
      });
    },
  );

  it("ignora PAYMENT_RECEIVED_IN_CASH e não ativa a assinatura", async () => {
    const db = useDb();

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_RECEIVED_IN_CASH", {
        status: "RECEIVED_IN_CASH",
      }),
    );

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")).toHaveLength(0);
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("não ativa a assinatura em PAYMENT_UPDATED com RECEIVED_IN_CASH", async () => {
    const db = useDb();

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_UPDATED", { status: "RECEIVED_IN_CASH" }),
    );

    expect(outcome).toBe("processed");
    expect(db.getRows("payments")[0]).toMatchObject({ status: "pending" });
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("não ativa a assinatura em PAYMENT_UPDATED com status CONFIRMED", async () => {
    const db = useDb();

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_UPDATED", { status: "CONFIRMED" }),
    );

    expect(outcome).toBe("processed");
    expect(db.getRows("payments")[0]).toMatchObject({ status: "pending" });
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("não confirma cobrança de recebimento em dinheiro", async () => {
    const db = useDb();

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_RECEIVED", {
        status: "RECEIVED",
        billingType: "RECEIVED_IN_CASH",
      }),
    );

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")).toHaveLength(0);
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("mantém estorno de recebimento em dinheiro sem ativar a assinatura", async () => {
    const db = useDb({
      payments: [paymentRow()],
      subscriptions: [subscriptionRow({ status: "active" })],
    });

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_RECEIVED_IN_CASH_UNDONE", {
        status: "RECEIVED_IN_CASH",
      }),
    );

    expect(db.getRows("payments")[0]?.status).toBe("refunded");
    expect(db.getRows("subscriptions")[0]?.status).toBe("past_due");
  });

  it("não ativa assinatura pendente com pagamento pago fora dos eventos de confirmação", async () => {
    const db = useDb({
      payments: [paymentRow()],
      subscriptions: [subscriptionRow({ status: "pending" })],
    });

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_UPDATED", { status: "RECEIVED_IN_CASH" }),
    );

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")[0]?.status).toBe("paid");
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("não duplica pagamento quando PAYMENT_CREATED chega repetido", async () => {
    const db = useDb();
    const event = paymentEvent("PAYMENT_CREATED");

    await processAsaasEvent(db as never, event);
    await processAsaasEvent(db as never, event);

    expect(db.getRows("payments")).toHaveLength(1);
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("não duplica pagamento nem período quando PAYMENT_CONFIRMED chega repetido", async () => {
    const db = useDb();
    const event = paymentEvent("PAYMENT_CONFIRMED", {
      status: "CONFIRMED",
      confirmedDate: "2026-11-15",
    });

    await processAsaasEvent(db as never, event);
    await processAsaasEvent(db as never, event);

    expect(db.getRows("payments")).toHaveLength(1);
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "active",
      current_period_start: "2026-11-15T12:00:00.000Z",
      current_period_end: "2026-12-15T12:00:00.000Z",
    });
  });

  it("permite retry após falha na ativação sem duplicar o pagamento", async () => {
    const db = useDb();
    const event = paymentEvent("PAYMENT_CONFIRMED", {
      status: "CONFIRMED",
      confirmedDate: "2026-11-15",
    });

    db.failNextRpc("apply_asaas_payment_transition", "XX000");

    await expect(processAsaasEvent(db as never, event)).rejects.toBeInstanceOf(
      BillingWebhookError,
    );

    expect(db.getRows("payments")).toHaveLength(0);
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");

    await expect(processAsaasEvent(db as never, event)).resolves.toBe(
      "processed",
    );

    expect(db.getRows("payments")).toHaveLength(1);
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "active",
      current_period_start: "2026-11-15T12:00:00.000Z",
    });
  });

  it("não regride pagamento pago quando um evento atrasado chega depois", async () => {
    const db = useDb({
      payments: [paymentRow()],
      subscriptions: [subscriptionRow({ status: "active" })],
    });

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_OVERDUE", { status: "OVERDUE" }),
    );

    expect(db.getRows("payments")[0]?.status).toBe("paid");
    expect(db.getRows("subscriptions")[0]?.status).toBe("active");
  });

  it("não ativa assinatura pendente com evento atrasado de pagamento pago", async () => {
    const db = useDb({ payments: [paymentRow()] });

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_OVERDUE", { status: "OVERDUE" }),
    );

    expect(db.getRows("payments")[0]?.status).toBe("paid");
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("não retrocede o período ativo com evento financeiro atrasado", async () => {
    const db = useDb({
      subscriptions: [
        subscriptionRow({
          status: "active",
          current_period_start: "2026-12-15T12:00:00.000Z",
          current_period_end: "2027-01-15T12:00:00.000Z",
        }),
      ],
    });

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CONFIRMED", {
        id: "pay_older",
        status: "CONFIRMED",
        dueDate: "2026-11-15",
        confirmedDate: "2026-11-15",
      }),
    );

    const subscription = db.getRows("subscriptions")[0];

    expect(subscription?.current_period_start).toBe(
      "2026-12-15T12:00:00.000Z",
    );
    expect(subscription?.current_period_end).toBe("2027-01-15T12:00:00.000Z");
  });

  it("não reabre cobrança cancelada por evento atrasado", async () => {
    const db = useDb({
      payments: [paymentRow({ status: "cancelled", paid_at: null })],
      subscriptions: [subscriptionRow({ status: "active" })],
    });

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_OVERDUE", { status: "OVERDUE" }),
    );

    expect(db.getRows("payments")[0]?.status).toBe("cancelled");
  });

  it("marca estorno e coloca a assinatura em atraso", async () => {
    const db = useDb({
      payments: [paymentRow()],
      subscriptions: [subscriptionRow({ status: "active" })],
    });

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_REFUNDED", { status: "REFUNDED" }),
    );

    expect(db.getRows("payments")[0]?.status).toBe("refunded");
    expect(db.getRows("subscriptions")[0]?.status).toBe("past_due");
  });

  it.each([
    ["PAYMENT_PARTIALLY_REFUNDED", "PARTIALLY_REFUNDED"],
    ["PAYMENT_REFUND_IN_PROGRESS", "REFUND_IN_PROGRESS"],
  ] as const)("mantém %s como estado não liquidado", async (event, status) => {
    const db = useDb({
      payments: [paymentRow()],
      subscriptions: [subscriptionRow({ status: "active" })],
    });

    await processAsaasEvent(
      db as never,
      paymentEvent(event, { status }),
    );

    expect(db.getRows("payments")[0]).toMatchObject({
      status: "refunded",
      metadata: expect.objectContaining({
        asaas_payment_state_event: event,
      }),
    });
    expect(db.getRows("subscriptions")[0]?.status).toBe("past_due");
  });

  it("restaura chargeback apenas após a reversão e uma confirmação posterior", async () => {
    const db = useDb({
      payments: [paymentRow()],
      subscriptions: [
        subscriptionRow({
          status: "active",
          current_period_start: "2026-11-15T12:00:00.000Z",
          current_period_end: "2026-12-15T12:00:00.000Z",
        }),
      ],
    });
    const chargeback = {
      ...paymentEvent("PAYMENT_CHARGEBACK_REQUESTED", {
        status: "RECEIVED",
        dueDate: "2026-11-15",
      }),
      id: "evt_chargeback_requested",
      dateCreated: "2026-11-16 12:00:00",
    };
    const awaitingReversal = {
      ...paymentEvent("PAYMENT_AWAITING_CHARGEBACK_REVERSAL", {
        status: "AWAITING_CHARGEBACK_REVERSAL",
        dueDate: "2026-11-15",
      }),
      id: "evt_chargeback_awaiting_reversal",
      dateCreated: "2026-11-17 12:00:00",
    };
    const restored = {
      ...paymentEvent("PAYMENT_RECEIVED", {
        status: "RECEIVED",
        dueDate: "2026-11-15",
      }),
      id: "evt_chargeback_reversal_received",
      dateCreated: "2026-11-18 12:00:00",
    };

    await processAsaasEvent(db as never, chargeback);
    await processAsaasEvent(db as never, awaitingReversal);
    expect(db.getRows("payments")[0]?.status).toBe("refunded");
    expect(db.getRows("subscriptions")[0]?.status).toBe("past_due");

    await processAsaasEvent(db as never, restored);

    expect(db.getRows("payments")[0]).toMatchObject({
      status: "paid",
      metadata: expect.objectContaining({
        asaas_restored_from_event: "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
      }),
    });
    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "active",
      current_period_start: "2026-11-15T12:00:00.000Z",
      current_period_end: "2026-12-15T12:00:00.000Z",
    });
  });

  it("webhook duplicado preserva o início e o fim da tolerância", async () => {
    let databaseNow = new Date("2026-11-16T12:00:00.000Z");
    const db = useDb({
      payments: [paymentRow({ status: "pending", paid_at: null })],
      subscriptions: [subscriptionRow({ status: "active" })],
    });
    installPastDueGraceTrigger(db, () => databaseNow);
    const overdue = paymentEvent("PAYMENT_OVERDUE", {
      status: "OVERDUE",
      dueDate: "2026-11-15",
    });

    await processAsaasEvent(db as never, overdue);
    const first = db.getRows("subscriptions")[0];

    expect(first).toMatchObject({
      status: "past_due",
      past_due_since: databaseNow.toISOString(),
      grace_period_ends_at: new Date(
        databaseNow.getTime() + 72 * 60 * 60 * 1000,
      ).toISOString(),
    });

    databaseNow = new Date(databaseNow.getTime() + 30 * 60 * 1000);
    await processAsaasEvent(db as never, overdue);

    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "past_due",
      past_due_since: first?.past_due_since,
      grace_period_ends_at: first?.grace_period_ends_at,
    });
  });

  it("confirma pagamento, ativa a assinatura e encerra a tolerância", async () => {
    const db = useDb({
      payments: [paymentRow({ status: "overdue", paid_at: null })],
      subscriptions: [
        subscriptionRow({
          status: "past_due",
          past_due_since: "2026-11-14T12:00:00.000Z",
          grace_period_ends_at: "2026-11-17T12:00:00.000Z",
        }),
      ],
    });
    installPastDueGraceTrigger(
      db,
      () => new Date("2026-11-17T12:00:01.000Z"),
    );

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CONFIRMED", {
        status: "CONFIRMED",
        confirmedDate: "2026-11-17",
      }),
    );

    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "active",
      past_due_since: null,
      grace_period_ends_at: null,
    });
  });

  it("inicia uma nova tolerância para uma inadimplência posterior", async () => {
    const databaseNow = new Date("2026-11-20T12:00:00.000Z");
    const db = useDb({
      payments: [paymentRow({ status: "paid" })],
      subscriptions: [
        subscriptionRow({
          status: "active",
          past_due_since: null,
          grace_period_ends_at: null,
        }),
      ],
    });
    installPastDueGraceTrigger(db, () => databaseNow);

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_OVERDUE", {
        id: "pay_next_period",
        status: "OVERDUE",
        dueDate: "2026-12-15",
      }),
    );

    expect(db.getRows("subscriptions")[0]).toMatchObject({
      status: "past_due",
      past_due_since: databaseNow.toISOString(),
      grace_period_ends_at: new Date(
        databaseNow.getTime() + 72 * 60 * 60 * 1000,
      ).toISOString(),
    });
  });

  it("recupera a assinatura pelo externalReference quando o vínculo remoto falta", async () => {
    const db = useDb({
      subscriptions: [subscriptionRow({ gateway_subscription_id: null })],
    });

    await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CREATED", { subscription: null }),
    );

    expect(db.getRows("payments")).toHaveLength(1);
    expect(db.getRows("subscriptions")[0]?.gateway_subscription_id).toBeNull();
  });

  it("ignora pagamento sem assinatura local", async () => {
    const db = useDb({ subscriptions: [] });

    const outcome = await processAsaasEvent(
      db as never,
      paymentEvent("PAYMENT_CREATED", {
        subscription: "sub_unknown",
        externalReference: "99999999-9999-4999-8999-999999999999",
      }),
    );

    expect(outcome).toBe("ignored");
    expect(db.getRows("payments")).toHaveLength(0);
  });

  it("cancela a assinatura em SUBSCRIPTION_DELETED", async () => {
    const db = useDb({
      subscriptions: [subscriptionRow({ status: "active" })],
      payments: [paymentRow({ status: "pending", paid_at: null })],
    });

    await processAsaasEvent(db as never, {
      id: "evt_sub_deleted",
      event: "SUBSCRIPTION_DELETED",
      subscription: {
        id: "sub_123",
        status: "INACTIVE",
        externalReference: EXTERNAL_REFERENCE,
      },
    });

    const subscription = db.getRows("subscriptions")[0];

    expect(subscription).toMatchObject({
      status: "canceled",
      gateway_status: "inactive",
      cancel_at_period_end: false,
    });
    expect(subscription?.canceled_at).toEqual(expect.any(String));
    expect(db.getRows("payments")[0]?.status).toBe("cancelled");
  });

  it("rejeita evento financeiro sem o objeto de pagamento", async () => {
    const db = useDb();

    await expect(
      processAsaasEvent(db as never, {
        id: "evt_payment_missing",
        event: "PAYMENT_CONFIRMED",
      }),
    ).rejects.toBeInstanceOf(BillingWebhookError);
  });

  it("rejeita evento de assinatura sem o objeto de assinatura", async () => {
    const db = useDb();

    await expect(
      processAsaasEvent(db as never, {
        id: "evt_subscription_missing",
        event: "SUBSCRIPTION_UPDATED",
      }),
    ).rejects.toBeInstanceOf(BillingWebhookError);
  });
});
