import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  context: null as unknown,
  asaasConfigured: true,
  startSubscription: vi.fn(),
  changePlan: vi.fn(),
  cancelSubscription: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({
  getActiveDashboardContext: vi.fn(async () => state.context),
}));
vi.mock("@/lib/env/server", () => ({
  isAsaasConfigured: vi.fn(() => state.asaasConfigured),
}));
vi.mock("@/features/billing/service", () => ({
  BillingServiceError: class BillingServiceError extends Error {
    constructor(
      public readonly kind: string,
      message: string,
    ) {
      super(message);
      this.name = "BillingServiceError";
    }
  },
  startSubscription: state.startSubscription,
  changePlan: state.changePlan,
  cancelSubscription: state.cancelSubscription,
}));

import {
  cancelSubscriptionAction,
  changePlanAction,
  startSubscriptionAction,
} from "@/features/billing/actions";

const SHOP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";

function makeContext(
  role: "owner" | "staff",
  appMetadata: Record<string, unknown> = {},
) {
  return {
    user: {
      app_metadata: appMetadata,
      email: "owner@example.com",
    },
    profile: null,
    memberships: [],
    active: {
      barbershop_id: SHOP_ID,
      barbershop: {
        id: SHOP_ID,
        name: "Barbearia Teste",
        slug: "barbearia-teste",
        timezone: "America/Sao_Paulo",
        phone: "(11) 99999-9999",
      },
      role,
      is_active: true,
    },
  };
}

const validInput = {
  planId: PLAN_ID,
  billingType: "pix",
  holderName: "Maria da Silva",
  document: "529.982.247-25",
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  state.context = makeContext("owner");
  state.asaasConfigured = true;
  state.startSubscription.mockReset();
  state.changePlan.mockReset();
  state.cancelSubscription.mockReset();
  state.startSubscription.mockResolvedValue({ message: "Assinatura criada." });
  state.changePlan.mockResolvedValue({ message: "Plano alterado." });
  state.cancelSubscription.mockResolvedValue({ message: "Assinatura cancelada." });
});

describe("autorização das ações de cobrança", () => {
  it("permite somente o proprietário da barbearia", async () => {
    const result = await startSubscriptionAction(validInput);

    expect(result.status).toBe("success");
    expect(state.startSubscription).toHaveBeenCalledWith({
      barbershopId: SHOP_ID,
      planId: PLAN_ID,
      billingType: "pix",
      holderName: "Maria da Silva",
      document: "52998224725",
      email: "owner@example.com",
      phone: "(11) 99999-9999",
    });
  });

  it("bloqueia staff mesmo em chamada direta", async () => {
    state.context = makeContext("staff");

    const result = await startSubscriptionAction(validInput);

    expect(result.status).toBe("error");
    expect(result.message).toContain("Somente o proprietário");
    expect(state.startSubscription).not.toHaveBeenCalled();
  });

  it("não dá bypass para administrador global sem vínculo de owner", async () => {
    state.context = makeContext("staff", { lps_role: "platform_admin" });

    const result = await cancelSubscriptionAction();

    expect(result.status).toBe("error");
    expect(result.message).toContain("Somente o proprietário");
    expect(state.cancelSubscription).not.toHaveBeenCalled();
  });

  it("exige sessão ativa", async () => {
    state.context = null;

    const result = await startSubscriptionAction(validInput);

    expect(result.status).toBe("error");
    expect(result.message).toContain("sessão expirou");
    expect(state.startSubscription).not.toHaveBeenCalled();
  });
});

describe("validação e configuração das ações", () => {
  it("devolve erros de campo sem chamar o serviço", async () => {
    const result = await startSubscriptionAction({
      ...validInput,
      document: "111.111.111-11",
      billingType: "credit_card",
    });

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.document).toBeDefined();
    expect(result.fieldErrors?.billingType).toBeDefined();
    expect(state.startSubscription).not.toHaveBeenCalled();
  });

  it("encaminha apenas retomada de legado mesmo sem o Sandbox configurado", async () => {
    state.asaasConfigured = false;

    const result = await startSubscriptionAction(validInput);

    expect(result.status).toBe("success");
    expect(state.startSubscription).toHaveBeenCalledWith(expect.anything());
  });

  it("valida o plano na troca e encaminha o cancelamento", async () => {
    expect(
      (await changePlanAction({ planId: "invalido" })).status,
    ).toBe("error");
    expect(state.changePlan).not.toHaveBeenCalled();

    const changed = await changePlanAction({ planId: PLAN_ID });
    const canceled = await cancelSubscriptionAction();

    expect(changed.status).toBe("success");
    expect(canceled.status).toBe("success");
    expect(state.changePlan).toHaveBeenCalledWith({
      barbershopId: SHOP_ID,
      planId: PLAN_ID,
    });
    expect(state.cancelSubscription).toHaveBeenCalledWith({
      barbershopId: SHOP_ID,
      reason: null,
    });
  });

  it("valida e encaminha o motivo do cancelamento sem confiar no cliente", async () => {
    const canceled = await cancelSubscriptionAction({
      reason: "  vou pausar o negócio  ",
    });

    expect(canceled.status).toBe("success");
    expect(state.cancelSubscription).toHaveBeenCalledWith({
      barbershopId: SHOP_ID,
      reason: "vou pausar o negócio",
    });

    state.cancelSubscription.mockClear();

    const invalid = await cancelSubscriptionAction({
      reason: "x".repeat(501),
    });

    expect(invalid.status).toBe("error");
    expect(invalid.fieldErrors?.reason).toBeDefined();
    expect(state.cancelSubscription).not.toHaveBeenCalled();
  });
});
