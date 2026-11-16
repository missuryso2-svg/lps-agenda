import { describe, expect, it, vi } from "vitest";

import { networkGuardMessage } from "./setup/network-guard";

describe("proteção global contra requisições externas", () => {
  it("bloqueia imediatamente um fetch não simulado", async () => {
    await expect(fetch("https://example.com/api")).rejects.toThrow(
      networkGuardMessage,
    );
  });

  it("permite simular fetch com vi.stubGlobal", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const response = await fetch("https://api.example.test/resource");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("restaura a proteção no teste seguinte ao stub global", async () => {
    await expect(fetch("https://example.com/api")).rejects.toThrow(
      networkGuardMessage,
    );
  });

  it("volta a bloquear depois de vi.unstubAllGlobals", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    vi.stubGlobal("fetch", fetchMock);
    expect(globalThis.fetch).toBe(fetchMock);

    vi.unstubAllGlobals();

    await expect(fetch("https://example.com/api")).rejects.toThrow(
      networkGuardMessage,
    );
  });
});
