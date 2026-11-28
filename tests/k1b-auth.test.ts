import { describe, expect, it, vi } from "vitest";

const signUp = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp } }),
}));
vi.mock("@/lib/env/public", () => ({ getSupabasePublicEnv: () => ({}) }));
vi.mock("@/lib/env/server", () => ({ getAppUrl: () => "http://localhost:59336" }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { signUpAction } from "@/features/auth/actions";

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
