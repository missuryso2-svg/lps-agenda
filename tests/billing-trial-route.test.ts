import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  finalizeExpiredTrials: vi.fn(),
  isAsaasConfigured: vi.fn(),
}));

vi.mock("@/features/billing/trial", () => ({
  finalizeExpiredTrials: mocks.finalizeExpiredTrials,
}));

vi.mock("@/lib/env/server", () => ({
  isAsaasConfigured: mocks.isAsaasConfigured,
}));

import { GET, POST } from "@/app/api/cron/trial-finalization/route";

const validSecret = "billing-cron-secret-with-at-least-32-chars";

const summary = {
  candidates: 7,
  claimed: 5,
  created: 3,
  failed: 1,
  skipped: 1,
  items: [],
};

function createRequest(
  method: "GET" | "POST",
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/cron/trial-finalization", {
    method,
    headers,
  });
}

beforeEach(() => {
  mocks.finalizeExpiredTrials.mockReset();
  mocks.isAsaasConfigured.mockReset();
  mocks.isAsaasConfigured.mockReturnValue(true);
  mocks.finalizeExpiredTrials.mockResolvedValue(summary);

  vi.stubEnv("BILLING_CRON_SECRET", validSecret);
  vi.stubEnv("CRON_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("rota HTTP do cron de finalização do trial", () => {
  it("rejeita GET sem credencial com 401", async () => {
    const response = await GET(createRequest("GET"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Não autorizado.",
    });
    expect(mocks.finalizeExpiredTrials).not.toHaveBeenCalled();
    expect(mocks.isAsaasConfigured).not.toHaveBeenCalled();
  });

  it("rejeita POST sem credencial com 401", async () => {
    const response = await POST(createRequest("POST"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Não autorizado.",
    });
    expect(mocks.finalizeExpiredTrials).not.toHaveBeenCalled();
    expect(mocks.isAsaasConfigured).not.toHaveBeenCalled();
  });

  it("rejeita credencial inválida com 401", async () => {
    const bearerResponse = await GET(
      createRequest("GET", {
        authorization: `Bearer ${"segredo-invalido".repeat(3)}`,
      }),
    );
    const headerResponse = await POST(
      createRequest("POST", {
        "x-billing-cron-secret": "outro-segredo-invalido-com-32-caracteres",
      }),
    );

    expect(bearerResponse.status).toBe(401);
    expect(headerResponse.status).toBe(401);
    await expect(bearerResponse.json()).resolves.toEqual({
      error: "Não autorizado.",
    });
    await expect(headerResponse.json()).resolves.toEqual({
      error: "Não autorizado.",
    });
    expect(mocks.finalizeExpiredTrials).not.toHaveBeenCalled();
    expect(mocks.isAsaasConfigured).not.toHaveBeenCalled();
  });

  it("aceita Authorization Bearer válido e retorna os contadores", async () => {
    const response = await GET(
      createRequest("GET", {
        authorization: `Bearer ${validSecret}`,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      candidates: 7,
      claimed: 5,
      created: 3,
      failed: 1,
      skipped: 1,
    });
    expect(mocks.isAsaasConfigured).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeExpiredTrials).toHaveBeenCalledTimes(1);
  });

  it("aceita x-billing-cron-secret válido e retorna os contadores", async () => {
    const response = await POST(
      createRequest("POST", {
        "x-billing-cron-secret": validSecret,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      candidates: 7,
      claimed: 5,
      created: 3,
      failed: 1,
      skipped: 1,
    });
    expect(mocks.isAsaasConfigured).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeExpiredTrials).toHaveBeenCalledTimes(1);
  });

  it("retorna 503 quando o Asaas não está configurado", async () => {
    mocks.isAsaasConfigured.mockReturnValue(false);

    const response = await GET(
      createRequest("GET", {
        authorization: `Bearer ${validSecret}`,
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Asaas Sandbox não configurado neste ambiente.",
    });
    expect(mocks.finalizeExpiredTrials).not.toHaveBeenCalled();
  });

  it("retorna 200 com os contadores após finalização bem-sucedida", async () => {
    const response = await POST(
      createRequest("POST", {
        authorization: `Bearer ${validSecret}`,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      candidates: 7,
      claimed: 5,
      created: 3,
      failed: 1,
      skipped: 1,
    });
    expect(mocks.finalizeExpiredTrials).toHaveBeenCalledTimes(1);
  });

  it("retorna 500 quando a finalização falha", async () => {
    mocks.finalizeExpiredTrials.mockRejectedValue(
      new Error("falha simulada na finalização"),
    );

    const response = await GET(
      createRequest("GET", {
        authorization: `Bearer ${validSecret}`,
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Falha ao finalizar os testes vencidos.",
    });
    expect(mocks.finalizeExpiredTrials).toHaveBeenCalledTimes(1);
  });

  it("não executa operações externas reais em GET nem POST", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const getResponse = await GET(
      createRequest("GET", {
        authorization: `Bearer ${validSecret}`,
      }),
    );
    const postResponse = await POST(
      createRequest("POST", {
        "x-billing-cron-secret": validSecret,
      }),
    );

    expect(getResponse.status).toBe(200);
    expect(postResponse.status).toBe(200);
    expect(mocks.finalizeExpiredTrials).toHaveBeenCalledTimes(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
