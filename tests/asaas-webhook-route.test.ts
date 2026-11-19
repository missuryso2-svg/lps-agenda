import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase, type FakeRow } from "./helpers/fake-supabase";
import { installFakeAsaasPaymentTransitionRpc } from "./helpers/fake-asaas-payment-transition";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  db: null as unknown,
  failAdminClient: false,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    if (state.failAdminClient) {
      throw new Error("admin client unavailable");
    }

    return state.db;
  }),
}));

import { POST } from "@/app/api/webhooks/asaas/route";

const VALID_TOKEN = "webhook-token-with-at-least-32-characters-9f3a";
const SHOP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const EXTERNAL_REFERENCE = "33333333-3333-4333-8333-333333333333";

type WebhookPayload = {
  id: string;
  event: string;
  payment: FakeRow;
  [key: string]: unknown;
};

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

function webhookEventRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: "wh_1",
    provider: "asaas",
    event_id: "evt_1",
    event_type: "PAYMENT_CREATED",
    payload: {},
    status: "processed",
    error_message: null,
    processed_at: "2026-11-15T12:00:00.000Z",
    created_at: "2026-11-15T11:59:00.000Z",
    updated_at: "2026-11-15T12:00:00.000Z",
    ...overrides,
  };
}

function paymentPayload(
  id = "evt_1",
  event = "PAYMENT_CREATED",
  payment: FakeRow = {},
): WebhookPayload {
  return {
    id,
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
  state.db = db;

  return db;
}

function webhookRequest(
  body: unknown,
  options: { token?: string | null; contentLength?: number } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });

  if (options.token !== null) {
    headers.set("asaas-access-token", options.token ?? VALID_TOKEN);
  }

  if (options.contentLength !== undefined) {
    headers.set("content-length", String(options.contentLength));
  }

  return new Request("http://localhost/api/webhooks/asaas", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.ASAAS_ENV = "sandbox";
  process.env.ASAAS_API_KEY = "sandbox-api-key";
  process.env.ASAAS_WEBHOOK_TOKEN = VALID_TOKEN;
});

afterEach(() => {
  state.db = null;
  state.failAdminClient = false;
  process.env.ASAAS_ENV = "sandbox";
  process.env.ASAAS_API_KEY = "sandbox-api-key";
  process.env.ASAAS_WEBHOOK_TOKEN = VALID_TOKEN;
});

describe("rota HTTP do webhook Asaas", () => {
  it("rejeita token inválido com 401 antes de persistir", async () => {
    const db = useDb();

    const response = await POST(
      webhookRequest(paymentPayload(), { token: "wrong-token" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Não autorizado.",
    });
    expect(db.getRows("webhook_events")).toHaveLength(0);
  });

  it("rejeita JSON malformado com 400", async () => {
    const db = useDb();

    const response = await POST(webhookRequest("{invalid"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "JSON inválido.",
    });
    expect(db.getRows("webhook_events")).toHaveLength(0);
  });

  it("rejeita payload com schema inválido com 400", async () => {
    const db = useDb();

    const response = await POST(
      webhookRequest(
        paymentPayload("evt_invalid", "PAYMENT_CREATED", { value: -1 }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Evento inválido.",
    });
    expect(db.getRows("webhook_events")).toHaveLength(0);
  });

  it("rejeita corpo acima de 64 KiB com 413", async () => {
    const db = useDb();
    const payload = {
      ...paymentPayload("evt_large"),
      padding: "x".repeat(65 * 1024),
    };

    const response = await POST(webhookRequest(payload));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: "Payload muito grande.",
    });
    expect(db.getRows("webhook_events")).toHaveLength(0);
  });

  it("rejeita content-length acima de 64 KiB com 413", async () => {
    const db = useDb();

    const response = await POST(
      webhookRequest(paymentPayload("evt_large_header"), {
        contentLength: 65 * 1024 + 1,
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: "Payload muito grande.",
    });
    expect(db.getRows("webhook_events")).toHaveLength(0);
  });

  it("retorna 500 quando a configuração do webhook está indisponível", async () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN;

    const response = await POST(webhookRequest(paymentPayload()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Webhook não configurado.",
    });
  });

  it("retorna 500 quando o cliente administrativo não pode ser criado", async () => {
    useDb();
    state.failAdminClient = true;

    const response = await POST(webhookRequest(paymentPayload()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Servidor não configurado.",
    });
  });

  it("retorna 500 quando a persistência inicial do evento falha", async () => {
    const db = useDb();
    db.failNext("webhook_events", "XX000", "insert");

    const response = await POST(
      webhookRequest(paymentPayload("evt_insert_failure")),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Falha ao registrar o evento.",
    });
    expect(db.getRows("webhook_events")).toHaveLength(0);
  });

  it("retorna 500 quando o evento existente não pode ser consultado após 23505", async () => {
    const db = useDb();
    db.failNext("webhook_events", "23505", "insert");
    db.failNext("webhook_events", "XX000", "select");

    const response = await POST(
      webhookRequest(paymentPayload("evt_lookup_failure")),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Falha ao registrar o evento.",
    });
  });

  it("trata conflito PostgreSQL 23505 como evento duplicado", async () => {
    const db = useDb({
      webhook_events: [
        webhookEventRow({ event_id: "evt_duplicate", status: "processed" }),
      ],
    });
    db.failNext("webhook_events", "23505", "insert");

    const response = await POST(
      webhookRequest(paymentPayload("evt_duplicate")),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(db.getRows("webhook_events")).toHaveLength(1);
    expect(db.getRows("payments")).toHaveLength(0);
  });

  it.each(["processed", "ignored"] as const)(
    "não reprocessa evento já %s",
    async (status) => {
      const eventId = `evt_${status}`;
      const db = useDb({
        webhook_events: [
          webhookEventRow({ event_id: eventId, status }),
        ],
      });
      db.failNext("webhook_events", "23505", "insert");

      const response = await POST(webhookRequest(paymentPayload(eventId)));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        received: true,
        duplicate: true,
      });
      expect(db.getRows("payments")).toHaveLength(0);
      expect(db.getRows("webhook_events")[0]?.status).toBe(status);
    },
  );

  it("retorna 503 com Retry-After quando o evento está em processamento", async () => {
    const db = useDb({
      webhook_events: [
        webhookEventRow({
          event_id: "evt_processing",
          status: "processing",
          updated_at: new Date().toISOString(),
        }),
      ],
    });
    db.failNext("webhook_events", "23505", "insert");

    const response = await POST(
      webhookRequest(paymentPayload("evt_processing")),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    await expect(response.json()).resolves.toMatchObject({
      error: "Evento em processamento.",
    });
    expect(db.getRows("webhook_events")[0]?.status).toBe("processing");
    expect(db.getRows("payments")).toHaveLength(0);
  });

  it("recupera com segurança um evento cujo lease expirou", async () => {
    const db = useDb({
      webhook_events: [
        webhookEventRow({
          event_id: "evt_stale",
          status: "processing",
          updated_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        }),
      ],
    });
    db.failNext("webhook_events", "23505", "insert");

    const response = await POST(webhookRequest(paymentPayload("evt_stale")));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(db.getRows("webhook_events")[0]).toMatchObject({
      event_id: "evt_stale",
      status: "processed",
      error_message: null,
    });
    expect(db.getRows("payments")).toHaveLength(1);
  });

  it("registra status failed e retorna 500 quando o processamento falha", async () => {
    const db = useDb();

    const response = await POST(
      webhookRequest(
        paymentPayload("evt_failure", "PAYMENT_CONFIRMED", {
          status: "CONFIRMED",
          value: 0,
        }),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Falha ao processar o evento.",
    });
    expect(db.getRows("webhook_events")[0]).toMatchObject({
      event_id: "evt_failure",
      status: "failed",
    });
    expect(db.getRows("webhook_events")[0]?.error_message).toContain(
      "valor de pagamento inválido",
    );
    expect(db.getRows("payments")).toHaveLength(0);
  });

  it("permite reprocessar um evento que estava failed", async () => {
    const db = useDb({
      webhook_events: [
        webhookEventRow({
          event_id: "evt_retry",
          status: "failed",
          error_message: "falha anterior",
        }),
      ],
    });
    db.failNext("webhook_events", "23505", "insert");

    const response = await POST(webhookRequest(paymentPayload("evt_retry")));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(db.getRows("webhook_events")[0]).toMatchObject({
      event_id: "evt_retry",
      status: "processed",
      error_message: null,
    });
    expect(db.getRows("webhook_events")[0]?.processed_at).toEqual(
      expect.any(String),
    );
    expect(db.getRows("payments")).toHaveLength(1);
  });

  it("persiste PAYMENT_RECEIVED_IN_CASH como ignored sem ativar a assinatura", async () => {
    const db = useDb();

    const response = await POST(
      webhookRequest(
        paymentPayload("evt_cash", "PAYMENT_RECEIVED_IN_CASH", {
          status: "RECEIVED_IN_CASH",
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(db.getRows("webhook_events")[0]).toMatchObject({
      event_id: "evt_cash",
      status: "ignored",
    });
    expect(db.getRows("payments")).toHaveLength(0);
    expect(db.getRows("subscriptions")[0]?.status).toBe("pending");
  });

  it("persiste o evento como processed após processamento concluído", async () => {
    const db = useDb();

    const response = await POST(webhookRequest(paymentPayload("evt_success")));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(db.getRows("webhook_events")[0]).toMatchObject({
      event_id: "evt_success",
      status: "processed",
      error_message: null,
    });
    expect(db.getRows("webhook_events")[0]?.processed_at).toEqual(
      expect.any(String),
    );
    expect(db.getRows("payments")[0]).toMatchObject({
      gateway_payment_id: "pay_123",
      status: "pending",
      subscription_id: SUBSCRIPTION_ID,
    });
  });
});
