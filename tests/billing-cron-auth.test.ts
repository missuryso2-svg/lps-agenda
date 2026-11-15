import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getBillingCronSecret,
  verifyBillingCronRequest,
} from "@/features/billing/cron-auth";

const validSecret = "billing-cron-secret-with-32-chars";

afterEach(() => {
  delete process.env.BILLING_CRON_SECRET;
  delete process.env.CRON_SECRET;
});

describe("autenticação da rotina de billing", () => {
  it("exige um segredo dedicado com pelo menos 32 caracteres", () => {
    expect(getBillingCronSecret()).toBeNull();

    process.env.BILLING_CRON_SECRET = "curto";
    expect(getBillingCronSecret()).toBeNull();

    process.env.BILLING_CRON_SECRET = `  ${validSecret}  `;
    expect(getBillingCronSecret()).toBe(validSecret);
  });

  it("aceita CRON_SECRET como fallback da plataforma", () => {
    process.env.CRON_SECRET = validSecret;

    expect(getBillingCronSecret()).toBe(validSecret);

    process.env.BILLING_CRON_SECRET = "outro-segredo-com-tamanho-suficiente";
    expect(getBillingCronSecret()).toBe("outro-segredo-com-tamanho-suficiente");
  });

  it("aceita Authorization Bearer e o cabeçalho dedicado", () => {
    process.env.BILLING_CRON_SECRET = validSecret;

    const bearer = new Headers({
      authorization: `Bearer ${validSecret}`,
    });
    const header = new Headers({
      "x-billing-cron-secret": validSecret,
    });

    expect(verifyBillingCronRequest(bearer)).toBe(true);
    expect(verifyBillingCronRequest(header)).toBe(true);
  });

  it("aceita os dois segredos quando BILLING_CRON_SECRET e CRON_SECRET coexistem", () => {
    const vercelSecret = "vercel-cron-secret-with-32-characters";

    process.env.BILLING_CRON_SECRET = validSecret;
    process.env.CRON_SECRET = vercelSecret;

    expect(
      verifyBillingCronRequest(
        new Headers({ authorization: `Bearer ${validSecret}` }),
      ),
    ).toBe(true);
    expect(
      verifyBillingCronRequest(
        new Headers({ authorization: `Bearer ${vercelSecret}` }),
      ),
    ).toBe(true);
    expect(
      verifyBillingCronRequest(
        new Headers({ authorization: "Bearer segredo-errado" }),
      ),
    ).toBe(false);
  });

  it("rejeita segredo ausente, incorreto ou configuração insegura", () => {
    expect(verifyBillingCronRequest(new Headers())).toBe(false);

    process.env.BILLING_CRON_SECRET = validSecret;

    expect(
      verifyBillingCronRequest(
        new Headers({ authorization: "Bearer segredo-errado" }),
      ),
    ).toBe(false);
    expect(
      verifyBillingCronRequest(
        new Headers({ "x-billing-cron-secret": "segredo-errado" }),
      ),
    ).toBe(false);

    process.env.BILLING_CRON_SECRET = "curto";

    expect(
      verifyBillingCronRequest(
        new Headers({ authorization: "Bearer curto" }),
      ),
    ).toBe(false);
  });

  it("não confunde Authorization de outro esquema com o segredo", () => {
    process.env.BILLING_CRON_SECRET = validSecret;

    expect(
      verifyBillingCronRequest(
        new Headers({ authorization: `Basic ${validSecret}` }),
      ),
    ).toBe(false);
  });
});
