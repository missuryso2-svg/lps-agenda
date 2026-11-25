import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { contentSecurityPolicy } from "@/lib/security/csp";
import { rasterFormat } from "@/lib/security/image-signature";
import { loginSchema, forgotPasswordSchema } from "@/lib/validation/auth";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: mocks.update }));
import { limitImageMutation } from "@/lib/security/upload-limit";
import { proxy } from "@/proxy";

beforeEach(() => { vi.unstubAllEnvs(); mocks.rpc.mockReset(); mocks.update.mockReset(); });

describe("I4 security controls", () => {
  it("does not allow eval/inline scripts in the production policy", () => {
    const csp = contentSecurityPolicy("random", "https://project.supabase.co/ignored?q=x");
    const script = csp.split("; ").find(s => s.startsWith("script-src"))!;
    expect(script).not.toContain("unsafe-");
    expect(script).toContain("'nonce-random' 'strict-dynamic'");
    expect(csp).toContain("connect-src 'self' https://project.supabase.co;");
    expect(contentSecurityPolicy("nonce", "javascript:evil")).not.toContain("javascript");
    expect(contentSecurityPolicy("nonce", undefined, true)).toContain("'unsafe-eval'");
  });
  it("overwrites attacker nonces and forwards fresh renderer policy on every request", async () => {
    vi.stubEnv("CSP_ENFORCE", "false");
    mocks.update.mockImplementation(async () => NextResponse.next());
    const request = () => new NextRequest("https://agenda.example/login", { headers: { "x-nonce": "attacker", "Content-Security-Policy": "unsafe" } });
    const a = request(), b = request();
    const first = await proxy(a), second = await proxy(b);
    expect(a.headers.get("x-nonce")).not.toBe("attacker");
    expect(a.headers.get("x-nonce")).not.toBe(b.headers.get("x-nonce"));
    expect(first.headers.has("Content-Security-Policy")).toBe(false);
    expect(first.headers.get("Content-Security-Policy-Report-Only")).toBe(a.headers.get("Content-Security-Policy"));
    expect(second.headers.get("Content-Security-Policy-Report-Only")).not.toBe(first.headers.get("Content-Security-Policy-Report-Only"));
  });
  it("adds policy without losing session-refresh cookies on redirects", async () => {
    vi.stubEnv("CSP_ENFORCE", "true");
    mocks.update.mockImplementation(async () => {
      const response = NextResponse.redirect("https://agenda.example/login");
      response.cookies.set("refresh-fixture", "synthetic");
      return response;
    });
    const response = await proxy(new NextRequest("https://agenda.example/dashboard"));
    expect(response.status).toBe(307);
    expect(response.cookies.get("refresh-fixture")?.value).toBe("synthetic");
    expect(response.headers.get("Content-Security-Policy")).toContain("script-src");
    expect(response.headers.has("Content-Security-Policy-Report-Only")).toBe(false);
  });
  it("rate-limits by verified tenant and fails closed before decoding", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: false })
      .mockResolvedValueOnce({ error: { code: "unavailable" } }).mockRejectedValueOnce(new Error("transport"));
    expect(await limitImageMutation("tenant-a")).toBeNull();
    const limited = await limitImageMutation("tenant-a");
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("retry-after")).toBe("300");
    expect((await limitImageMutation("tenant-a"))?.status).toBe(503);
    expect((await limitImageMutation("tenant-b"))?.status).toBe(503);
    const buckets = mocks.rpc.mock.calls.map(c => c[1].p_bucket);
    expect(buckets[0]).toBe(buckets[1]);
    expect(buckets[0]).not.toBe(buckets[3]);
    expect(buckets[0]).not.toContain("tenant");
  });
  it("rejects SVG, HTML, PDF and truncated signatures before native decoding", () => {
    for (const text of ["<svg/>", "<html/>", "%PDF", "RIFF", "WEBP"]) expect(rasterFormat(Buffer.from(text))).toBeNull();
  });
  it("bounds authentication inputs on the server", () => {
    expect(loginSchema.safeParse({ email: "a@example.test", password: "x".repeat(4097) }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "x".repeat(254) + "@example.test" }).success).toBe(false);
  });
});
