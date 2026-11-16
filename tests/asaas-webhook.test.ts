import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase, type FakeRow } from "./helpers/fake-supabase";

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
const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const EXTERNAL_REFERENCE = "33333333-3333-4333-8333-333333333333";

function subscriptionRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SUBSCRIPTION_ID,
    barbershop_id: SHOP_ID,
    plan_id: PLAN_ID,
    status: "pending",
    current_period_start: null,
    current_period_end: null,
    trial_ends_at: null,
    cancel_at_period_end: false,
    gateway: "asaas",
    gateway_subscription_id: "sub_123",
    billing_type: "pix",
    gateway_status: "active",
    external_reference: EXTERNAL_REFERENCE,
    next_due_date: "2026-11-15",
    canceled_at: null,
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
  return new FakeSupabase({
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

    expect(outcome).toBe("processed");
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

    db.failNext("subscriptions", "XX000", "update");

    await expect(processAsaasEvent(db as never, event)).rejects.toBeInstanceOf(
      BillingWebhookError,
    );

    expect(db.getRows("payments")).toHaveLength(1);
    expect(db.getRows("payments")[0]?.status).toBe("paid");
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
