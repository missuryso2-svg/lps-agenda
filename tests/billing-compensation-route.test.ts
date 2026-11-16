import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  processRemoteCleanupJobs: vi.fn(),
  isAsaasConfigured: vi.fn(),
}));

vi.mock("@/features/billing/compensation", () => ({
  processRemoteCleanupJobs: mocks.processRemoteCleanupJobs,
}));

vi.mock("@/lib/env/server", () => ({
  isAsaasConfigured: mocks.isAsaasConfigured,
}));

import { GET, POST } from "@/app/api/cron/billing-compensation/route";

const validSecret = "billing-cron-secret-with-at-least-32-chars";

const summary = {
  candidates: 4,
  claimed: 3,
  completed: 2,
  retry: 1,
  manualReview: 0,
  failed: 0,
};

function createRequest(
  method: "GET" | "POST",
  headers: Record<string, string> = {},
  search = "",
): Request {
  return new Request(
    `http://localhost/api/cron/billing-compensation${search}`,
    { method, headers },
  );
}

beforeEach(() => {
  mocks.processRemoteCleanupJobs.mockReset();
  mocks.isAsaasConfigured.mockReset();
  mocks.isAsaasConfigured.mockReturnValue(true);
  mocks.processRemoteCleanupJobs.mockResolvedValue(summary);

  vi.stubEnv("BILLING_CRON_SECRET", validSecret);
  vi.stubEnv("CRON_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("rota HTTP do cron de compensação remota", () => {
  it("rejeita GET e POST sem credencial com 401", async () => {
    const getResponse = await GET(createRequest("GET"));
    const postResponse = await POST(createRequest("POST"));

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
    await expect(getResponse.json()).resolves.toEqual({
      error: "Não autorizado.",
    });
    await expect(postResponse.json()).resolves.toEqual({
      error: "Não autorizado.",
    });
    expect(mocks.processRemoteCleanupJobs).not.toHaveBeenCalled();
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
    expect(mocks.processRemoteCleanupJobs).not.toHaveBeenCalled();
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
    expect(mocks.processRemoteCleanupJobs).not.toHaveBeenCalled();
  });

  it("aceita Bearer válido em GET e retorna apenas contadores", async () => {
    const response = await GET(
      createRequest("GET", {
        authorization: `Bearer ${validSecret}`,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ...summary,
    });
    expect(mocks.processRemoteCleanupJobs).toHaveBeenCalledWith({
      limit: undefined,
    });
  });

  it("aceita o header dedicado em POST", async () => {
    const response = await POST(
      createRequest("POST", {
        "x-billing-cron-secret": validSecret,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ...summary,
    });
  });

  it("repassa limite válido e ignora limite inválido", async () => {
    const valid = await GET(
      createRequest(
        "GET",
        { authorization: `Bearer ${validSecret}` },
        "?limit=5",
      ),
    );
    const invalid = await GET(
      createRequest(
        "GET",
        { authorization: `Bearer ${validSecret}` },
        "?limit=abc",
      ),
    );

    expect(valid.status).toBe(200);
    expect(invalid.status).toBe(200);
    expect(mocks.processRemoteCleanupJobs).toHaveBeenNthCalledWith(1, {
      limit: 5,
    });
    expect(mocks.processRemoteCleanupJobs).toHaveBeenNthCalledWith(2, {
      limit: undefined,
    });
  });

  it("retorna 500 sem expor detalhes quando o worker falha", async () => {
    mocks.processRemoteCleanupJobs.mockRejectedValue(
      new Error("falha simulada com detalhe interno e segredo"),
    );

    const response = await POST(
      createRequest("POST", {
        authorization: `Bearer ${validSecret}`,
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Falha ao processar a compensação remota.",
    });
  });

  it("não executa operações externas reais", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const getResponse = await GET(
      createRequest("GET", { authorization: `Bearer ${validSecret}` }),
    );
    const postResponse = await POST(
      createRequest("POST", {
        "x-billing-cron-secret": validSecret,
      }),
    );

    expect(getResponse.status).toBe(200);
    expect(postResponse.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
