import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AsaasError,
  createAsaasCustomer,
  createAsaasSubscription,
  deleteAsaasSubscription,
  getAsaasSubscription,
  listAsaasSubscriptionsByExternalReference,
  updateAsaasSubscription,
} from "@/lib/asaas/client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  process.env.ASAAS_ENV = "sandbox";
  process.env.ASAAS_API_KEY = "sandbox-api-key";
  process.env.ASAAS_WEBHOOK_TOKEN =
    "webhook-token-with-at-least-32-characters-9f3a";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cliente Asaas Sandbox", () => {
  it("envia o access_token e nunca usa a URL de produção", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "cus_123", name: "Maria" }),
    );

    await createAsaasCustomer({
      name: "Maria da Silva",
      cpfCnpj: "52998224725",
      email: "maria@example.com",
      phone: "11999999999",
      externalReference: "shop-1",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(String(url)).toBe("https://api-sandbox.asaas.com/v3/customers");
    expect(headers.get("access_token")).toBe("sandbox-api-key");
    expect(String(url)).not.toContain("api.asaas.com");
    expect(init?.method).toBe("POST");

    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      name: "Maria da Silva",
      cpfCnpj: "52998224725",
      externalReference: "shop-1",
    });
  });

  it("envia o valor da assinatura em reais, sem centavos crus", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "sub_123",
        status: "ACTIVE",
        nextDueDate: "2026-11-15",
        value: 89.9,
      }),
    );

    await createAsaasSubscription({
      customer: "cus_123",
      billingType: "PIX",
      valueCents: 8990,
      nextDueDate: "2026-11-15",
      cycle: "MONTHLY",
      description: "LPS Agenda — Profissional",
      externalReference: "11111111-1111-4111-8111-111111111111",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));

    expect(String(url)).toBe("https://api-sandbox.asaas.com/v3/subscriptions");
    expect(body).toMatchObject({
      customer: "cus_123",
      billingType: "PIX",
      value: 89.9,
      nextDueDate: "2026-11-15",
      cycle: "MONTHLY",
      externalReference: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("atualiza valor e cobranças pendentes da assinatura", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "sub_123" }));

    await updateAsaasSubscription("sub_123", {
      valueCents: 12990,
      billingType: "BOLETO",
      updatePendingPayments: true,
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));

    expect(String(url)).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions/sub_123",
    );
    expect(init?.method).toBe("PUT");
    expect(body).toMatchObject({
      value: 129.9,
      billingType: "BOLETO",
      updatePendingPayments: true,
    });
  });

  it("recupera assinaturas por externalReference e remove por id", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { id: "sub_123", deleted: false },
            { id: "sub_old", deleted: true },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ deleted: true, id: "sub_123" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "sub_123" }));

    const found = await listAsaasSubscriptionsByExternalReference("ref-1");
    await deleteAsaasSubscription("sub_123");
    await getAsaasSubscription("sub_123");

    const [listUrl] = fetchMock.mock.calls[0] ?? [];
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1] ?? [];
    const [getUrl] = fetchMock.mock.calls[2] ?? [];

    expect(String(listUrl)).toContain("externalReference=ref-1");
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe("sub_123");
    expect(String(deleteUrl)).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions/sub_123",
    );
    expect(deleteInit?.method).toBe("DELETE");
    expect(String(getUrl)).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions/sub_123",
    );
  });

  it.each([
    ["deleted false", { deleted: false, id: "sub_123" }],
    ["ID divergente", { deleted: true, id: "sub_other" }],
    ["corpo sem confirmação", { id: "sub_123" }],
  ])("não confirma DELETE com %s", async (_label, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(body));

    await expect(deleteAsaasSubscription("sub_123")).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("traduz erros HTTP sem expor a API key", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ errors: [{ description: "Chave inválida" }] }, 401),
    );

    await expect(
      createAsaasCustomer({ name: "Maria", cpfCnpj: "52998224725" }),
    ).rejects.toMatchObject({ kind: "unauthorized" });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ errors: [{ description: "CPF inválido" }] }, 400),
    );

    await expect(
      createAsaasCustomer({ name: "Maria", cpfCnpj: "52998224725" }),
    ).rejects.toMatchObject({ kind: "validation" });

    fetchMock.mockResolvedValueOnce(
      new Response("not-json", { status: 200 }),
    );

    await expect(
      createAsaasCustomer({ name: "Maria", cpfCnpj: "52998224725" }),
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("respeita Retry-After e identifica indisponibilidade", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("{}", {
        status: 429,
        headers: { "Retry-After": "7" },
      }),
    );

    await expect(getAsaasSubscription("sub_123")).rejects.toMatchObject({
      kind: "rate_limited",
      retryAfterSeconds: 7,
    });

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));

    await expect(getAsaasSubscription("sub_123")).rejects.toMatchObject({
      kind: "unavailable",
      status: 503,
    });
  });

  it("converte timeout em erro transitório", async () => {
    fetchMock.mockImplementationOnce((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    await expect(
      getAsaasSubscription("sub_123", { timeoutMs: 1 }),
    ).rejects.toMatchObject({ kind: "timeout" });
  });

  it("falha fechado quando o ambiente não está configurado", async () => {
    delete process.env.ASAAS_API_KEY;

    await expect(getAsaasSubscription("sub_123")).rejects.toBeInstanceOf(
      AsaasError,
    );
    await expect(getAsaasSubscription("sub_123")).rejects.toMatchObject({
      kind: "config",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
