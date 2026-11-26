import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const mocks = vi.hoisted(() => ({
  sessionRpc: vi.fn(), serverRpc: vi.fn(), setCookie: vi.fn(), remote: vi.fn(),
  db: null as unknown,
  autoReleased: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/premium-trial/queries", () => ({ automaticTrialAvailable: async () => mocks.autoReleased }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.setCookie }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect:dashboard"); } }));
vi.mock("@/lib/env/public", () => ({ getSupabasePublicEnv: () => ({}) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/auth/dal", () => ({ ACTIVE_BARBERSHOP_COOKIE: "active" }));
vi.mock("@/lib/auth/management", () => ({
  authorizeBillingOwner: async () => ({ context: { active: { barbershop_id: "shop", barbershop: {} }, user: {} } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.sessionRpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.db ?? { rpc: mocks.serverRpc } }));
vi.mock("@/lib/asaas/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/asaas/client")>("@/lib/asaas/client");
  return { ...actual, createAsaasCustomer: mocks.remote, createAsaasSubscription: mocks.remote,
    getAsaasSubscription: mocks.remote, listAsaasSubscriptionsByExternalReference: mocks.remote,
    findAsaasCustomerByDocument: mocks.remote, updateAsaasSubscription: mocks.remote, deleteAsaasSubscription: mocks.remote };
});

import { createBarbershopAction } from "@/features/barbershop/actions";
import { startSubscriptionAction, changePlanAction, cancelSubscriptionAction } from "@/features/billing/actions";
import { ensureRemoteSubscription, resolveBillingCustomer } from "@/features/billing/service";
import { finalizeExpiredTrials } from "@/features/billing/trial";

const form = { name: "Barbearia QA", slug: "barbearia-qa", phone: "", timezone: "America/Sao_Paulo" };
const intent = "38d2a419-7073-4841-aa80-8d1eb71a0254";
const invoiceInput = { planId: intent, billingType: "pix", holderName: "Titular QA", document: "52998224725" };

beforeEach(() => {
  mocks.db = null;
  mocks.autoReleased = false;
  vi.resetAllMocks();
  mocks.sessionRpc.mockResolvedValue({ data: "shop", error: null });
  mocks.serverRpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("integração das Server Actions com o onboarding", () => {
  it("usa o legado com flag ausente", async () => {
    vi.stubEnv("MANUAL_TRIAL_ONBOARDING_ENABLED", undefined);
    await expect(createBarbershopAction(form)).rejects.toThrow("redirect:dashboard");
    expect(mocks.sessionRpc.mock.calls[0][0]).toBe("create_barbershop");
    expect(mocks.serverRpc).not.toHaveBeenCalled();
    expect(mocks.setCookie).toHaveBeenCalledTimes(1);
  });
  it("usa o cadastro canônico quando o banco libera o Premium automático", async () => {
    vi.stubEnv("MANUAL_TRIAL_ONBOARDING_ENABLED", "true");
    mocks.autoReleased = true;
    await expect(createBarbershopAction(form)).rejects.toThrow("redirect:dashboard");
    expect(mocks.sessionRpc.mock.calls[0][0]).toBe("create_barbershop");
    expect(mocks.serverRpc).not.toHaveBeenCalled();
  });
  it("reapresenta a mesma intenção após perda da resposta", async () => {
    vi.stubEnv("MANUAL_TRIAL_ONBOARDING_ENABLED", "true");
    mocks.sessionRpc.mockRejectedValueOnce(new Error("network"));
    expect((await createBarbershopAction(form,intent)).status).toBe("error");
    expect(mocks.setCookie).not.toHaveBeenCalled();
    await expect(createBarbershopAction(form,intent)).rejects.toThrow("redirect:dashboard");
    expect(mocks.sessionRpc.mock.calls[0]).toEqual(mocks.sessionRpc.mock.calls[1]);
    expect(mocks.sessionRpc.mock.calls[1][0]).toBe("create_barbershop_with_manual_trial");
    expect(mocks.serverRpc.mock.calls[1][1]).toMatchObject({p_actor:"owner",p_intent_id:intent});
  });
  it("não usa fallback quando o banco rejeita a ativação", async () => {
    vi.stubEnv("MANUAL_TRIAL_ONBOARDING_ENABLED", "true");
    mocks.serverRpc.mockResolvedValue({ error: { code:"42501" } });
    expect((await createBarbershopAction(form,intent)).status).toBe("error");
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});

describe("origem manual nas entradas legadas", () => {
  it.each(["trialing","pending","expired","canceled"])("barra checkout, troca e cancelamento para %s", async (status) => {
    mocks.db = new FakeSupabase({ subscriptions: [{ id: "sub", barbershop_id:"shop", gateway:"manual_pix", status }] });
    for (const action of [() => startSubscriptionAction(invoiceInput),
      () => changePlanAction({planId:intent}), () => cancelSubscriptionAction({})]) {
      expect(await action()).toMatchObject({status:"error",message:expect.stringContaining("contratação online")});
    }
    expect(mocks.remote).not.toHaveBeenCalled();
  });
  it("exclui candidatos, retries e leases expirados; serviços internos também rejeitam", async () => {
    const subscriptions = ["trialing","pending","pending"].map((status,i) => ({
      id: String(i), status, gateway:"manual_pix", barbershop_id:"shop", trial_ends_at:"2020-01-01",
      trial_finalization_locked_at:i===2 ? "2020-01-01" : null, trial_finalized_at:null,
    }));
    const db = new FakeSupabase({subscriptions});
    mocks.db = db;
    expect((await finalizeExpiredTrials()).candidates).toBe(0);
    await expect(ensureRemoteSubscription(db as never,subscriptions[0] as never,{} as never,"customer")).rejects.toThrow();
    await expect(resolveBillingCustomer(db as never,{barbershopId:"shop",holderName:"QA",document:"52998224725"})).rejects.toThrow();
    expect(mocks.remote).not.toHaveBeenCalled();
  });
});
