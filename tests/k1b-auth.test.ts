import { describe, expect, it, vi } from "vitest";

const { signUp, resetPasswordForEmail } = vi.hoisted(() => ({ signUp: vi.fn(), resetPasswordForEmail: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp, resetPasswordForEmail } }),
}));
vi.mock("@/lib/env/public", () => ({ getSupabasePublicEnv: () => ({}) }));
vi.mock("@/lib/env/server", () => ({ getAppUrl: () => "http://localhost:59336" }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { forgotPasswordAction, signUpAction } from "@/features/auth/actions";

const application = {
  fullName: "Proprietário sintético",
  email: "owner@example.test",
  password: "SenhaSintetica001!",
  confirmPassword: "SenhaSintetica001!",
  acceptTerms: true,
};

describe("proteção anti-enumeração no cadastro", () => {
  it.each(["email_exists", "user_already_exists"])(
    "usa a resposta neutra para %s e para um cadastro recebido",
    async (code) => {
      signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
      signUp.mockResolvedValueOnce({ data: { session: null }, error: { code } });

      const accepted = await signUpAction(application);
      const duplicate = await signUpAction(application);
      expect(accepted.status).toBe("success");
      expect(duplicate).toEqual(accepted);
    },
  );

  it("continua sinalizando limite operacional do provedor", async () => {
    signUp.mockResolvedValueOnce({
      data: { session: null },
      error: { code: "over_email_send_rate_limit" },
    });
    expect(await signUpAction(application)).toMatchObject({ status: "error" });
  });
});

describe("transporte do cookie de sessão", () => {
  it.each([
    ["https://qa.example.test", true],
    ["http://127.0.0.1:59336", false],
  ])("segue a origem canônica %s", async (origin, secure) => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
    vi.resetModules();
    try {
      const { authCookieOptions } = await import("@/lib/supabase/auth-cookie-options");
      expect(authCookieOptions).toEqual({ secure });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe("proteção anti-enumeração na recuperação", () => {
  it("mantém resposta neutra com sucesso ou recusa do provedor", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: null });
    resetPasswordForEmail.mockResolvedValueOnce({ error: { code: "user_not_found" } });
    const existing = await forgotPasswordAction({ email: "owner@example.test" });
    const missing = await forgotPasswordAction({ email: "missing@example.test" });
    expect(existing.status).toBe("success");
    expect(missing).toEqual(existing);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("owner@example.test", {
      redirectTo: "http://localhost:59336/auth/callback?next=%2Fredefinir-senha",
    });
  });
});
