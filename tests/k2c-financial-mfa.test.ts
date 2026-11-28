import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyFinancialTotp } from "@/app/admin/mfa/actions";
import { submitFinancialOperation } from "@/features/admin-billing/actions";
import { financialSession, requireFinancialAdmin } from "@/lib/auth/financial-admin";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
  redirect: vi.fn((target: string) => { throw new Error(target); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: (fn: unknown) => fn }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "synthetic" } }, error: null }),
    mfa: { listFactors: mocks.listFactors, challengeAndVerify: mocks.challengeAndVerify } },
  rpc: mocks.rpc,
}) }));

const factor = "611eddb3-16a8-4588-a89e-b571a9c41a67";
function attempt(code: string) {
  const form = new FormData();
  form.set("factor", factor);
  form.set("code", code);
  return form;
}

describe("financial TOTP server boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({ error: { code: "LP037" } });
  });

  it("redirects a registered AAL1 user to TOTP and rejects financial mutations", async () => {
    expect((await financialSession()).status).toBe("mfa_required");
    await expect(requireFinancialAdmin()).rejects.toThrow("/admin/mfa");
    await expect(submitFinancialOperation({ kind: "pix" })).resolves.toMatchObject({ ok: false });
    expect(mocks.rpc.mock.calls.every(([name]) => name === "finance_capability")).toBe(true);
  });

  it("denies the challenge route to an account without financial authorization", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
    await verifyFinancialTotp("", attempt("123456"));
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("validates the code and checks membership in the verified factor list", async () => {
    await verifyFinancialTotp("", attempt("12345a"));
    expect(mocks.listFactors).not.toHaveBeenCalled();
    mocks.listFactors.mockResolvedValue({ data: { totp: [] } });
    await verifyFinancialTotp("", attempt("123456"));
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("submits the verified TOTP factor to Supabase and returns to finance after success", async () => {
    mocks.listFactors.mockResolvedValue({ data: { totp: [{ id: factor }] } });
    mocks.challengeAndVerify.mockResolvedValue({ error: null });
    await expect(verifyFinancialTotp("", attempt("123456"))).rejects.toThrow("/admin/assinaturas");
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({ factorId: factor, code: "123456" });
  });
});
