import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deleteAsaasSubscription } from "@/lib/asaas/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import {
  BillingServiceError,
  dateOnlyInSaoPaulo,
  ensureRemoteSubscription,
  resolveBillingCustomer,
} from "./service";

type Supabase = SupabaseClient<Database>;
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type SubscriptionUpdate =
  Database["public"]["Tables"]["subscriptions"]["Update"];
type PlanRow = Database["public"]["Tables"]["plans"]["Row"];

const defaultBatchSize = 20;
const maxBatchSize = 50;
const staleLockMs = 5 * 60 * 1000;

export type TrialFinalizationOutcome = "created" | "failed" | "skipped";

export type TrialFinalizationItem = {
  subscriptionId: string;
  barbershopId: string;
  outcome: TrialFinalizationOutcome;
  message?: string;
};

export type TrialFinalizationSummary = {
  candidates: number;
  claimed: number;
  created: number;
  failed: number;
  skipped: number;
  items: TrialFinalizationItem[];
};

export type FinalizeExpiredTrialsOptions = {
  limit?: number;
  now?: Date;
};

function clampBatchSize(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined) {
    return defaultBatchSize;
  }

  return Math.min(Math.max(value, 1), maxBatchSize);
}

function failureMessage(error: unknown): string {
  if (error instanceof BillingServiceError) {
    return error.message.slice(0, 500);
  }

  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return "Falha desconhecida ao finalizar o teste gratuito.";
}

async function findCandidates(
  supabase: Supabase,
  now: Date,
  limit: number,
): Promise<SubscriptionRow[]> {
  const nowIso = now.toISOString();

  const [trialingResult, retryResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*")
      .eq("status", "trialing")
      .lte("trial_ends_at", nowIso)
      .order("trial_ends_at", { ascending: true })
      .limit(limit),
    supabase
      .from("subscriptions")
      .select("*")
      .eq("status", "pending")
      .is("trial_finalized_at", null)
      .lte("trial_ends_at", nowIso)
      .order("trial_ends_at", { ascending: true })
      .limit(limit),
  ]);

  if (trialingResult.error || retryResult.error) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível consultar os testes vencidos.",
    );
  }

  const byId = new Map<string, SubscriptionRow>();

  for (const row of [...(trialingResult.data ?? []), ...(retryResult.data ?? [])]) {
    byId.set(row.id, row);
  }

  return [...byId.values()]
    .sort((left, right) =>
      String(left.trial_ends_at ?? "").localeCompare(
        String(right.trial_ends_at ?? ""),
      ),
    )
    .slice(0, limit);
}

function claimPayload(
  candidate: SubscriptionRow,
  now: Date,
): SubscriptionUpdate {
  return {
    status: "pending",
    gateway_status: "pending_creation",
    next_due_date: dateOnlyInSaoPaulo(now),
    trial_finalization_locked_at: now.toISOString(),
    trial_finalization_attempted_at: now.toISOString(),
    trial_finalization_attempts:
      (candidate.trial_finalization_attempts ?? 0) + 1,
    trial_finalization_error: null,
  };
}

/**
 * Reivindica uma linha de forma atômica.
 *
 * A atualização condicional é a trava: apenas a execução que encontra a linha
 * no estado esperado recebe o registro. Execuções concorrentes recebem zero
 * linhas e não chamam o Asaas.
 */
async function claimCandidate(
  supabase: Supabase,
  candidate: SubscriptionRow,
  now: Date,
): Promise<SubscriptionRow | null> {
  const payload = claimPayload(candidate, now);

  if (candidate.status === "trialing") {
    const { data, error } = await supabase
      .from("subscriptions")
      .update(payload)
      .eq("id", candidate.id)
      .eq("status", "trialing")
      .lte("trial_ends_at", now.toISOString())
      .select("*")
      .maybeSingle();

    if (error) {
      throw new BillingServiceError(
        "gateway",
        "Não foi possível reivindicar o teste vencido.",
      );
    }

    return data ?? null;
  }

  // Retry de uma finalização anterior. Primeiro tenta um lock livre; depois,
  // aceita um lock abandonado por uma execução que caiu no meio do caminho.
  const { data: unlocked, error: unlockedError } = await supabase
    .from("subscriptions")
    .update(payload)
    .eq("id", candidate.id)
    .eq("status", "pending")
    .is("trial_finalized_at", null)
    .is("trial_finalization_locked_at", null)
    .select("*")
    .maybeSingle();

  if (unlockedError) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível reivindicar a finalização pendente.",
    );
  }

  if (unlocked) {
    return unlocked;
  }

  const staleCutoff = new Date(now.getTime() - staleLockMs).toISOString();

  const { data: stale, error: staleError } = await supabase
    .from("subscriptions")
    .update(payload)
    .eq("id", candidate.id)
    .eq("status", "pending")
    .is("trial_finalized_at", null)
    .lt("trial_finalization_locked_at", staleCutoff)
    .select("*")
    .maybeSingle();

  if (staleError) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível reivindicar a finalização pendente.",
    );
  }

  return stale ?? null;
}

async function loadPlan(
  supabase: Supabase,
  planId: string,
): Promise<PlanRow> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível consultar o plano contratado.",
    );
  }

  if (!data) {
    throw new BillingServiceError(
      "not_found",
      "O plano contratado não foi encontrado.",
    );
  }

  return data;
}

async function loadBillingCustomer(
  supabase: Supabase,
  barbershopId: string,
) {
  const { data, error } = await supabase
    .from("billing_customers")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .maybeSingle();

  if (error) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível consultar o pagador do teste.",
    );
  }

  if (!data) {
    throw new BillingServiceError(
      "not_found",
      "O cadastro do pagador não foi encontrado. Contrate o plano novamente.",
    );
  }

  return data;
}

function pricedPlan(plan: PlanRow, subscription: SubscriptionRow): PlanRow {
  return {
    ...plan,
    price_cents: subscription.contracted_price_cents ?? plan.price_cents,
    interval: subscription.contracted_interval ?? plan.interval,
    currency: subscription.contracted_currency ?? plan.currency,
  };
}

async function markSuccess(
  supabase: Supabase,
  subscriptionId: string,
  gatewaySubscriptionId: string,
  now: Date,
): Promise<void> {
  const { data, error } = await supabase
    .from("subscriptions")
    .update({
      trial_finalized_at: now.toISOString(),
      trial_finalization_locked_at: null,
      trial_finalization_error: null,
    })
    .eq("id", subscriptionId)
    .eq("gateway_subscription_id", gatewaySubscriptionId)
    .is("trial_finalized_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new BillingServiceError(
      "gateway",
      "A assinatura foi criada no Asaas, mas não foi possível registrar a finalização.",
    );
  }
}

async function markFailure(
  supabase: Supabase,
  subscriptionId: string,
  error: unknown,
): Promise<void> {
  await supabase
    .from("subscriptions")
    .update({
      trial_finalization_locked_at: null,
      trial_finalization_error: failureMessage(error).slice(0, 500),
    })
    .eq("id", subscriptionId)
    .is("trial_finalized_at", null);
}

async function finalizeCandidate(
  supabase: Supabase,
  claimed: SubscriptionRow,
  now: Date,
): Promise<TrialFinalizationItem> {
  const base = {
    subscriptionId: claimed.id,
    barbershopId: claimed.barbershop_id,
  };

  try {
    const plan = await loadPlan(supabase, claimed.plan_id);
    const customer = await loadBillingCustomer(
      supabase,
      claimed.barbershop_id,
    );
    const customerId = await resolveBillingCustomer(supabase, {
      barbershopId: claimed.barbershop_id,
      holderName: customer.holder_name,
      document: customer.document_digits,
      email: customer.email,
      phone: customer.phone_digits,
    });

    const updated = await ensureRemoteSubscription(
      supabase,
      claimed,
      pricedPlan(plan, claimed),
      customerId,
    );

    if (!updated.gateway_subscription_id) {
      throw new BillingServiceError(
        "pending_confirmation",
        "A assinatura foi enviada ao Asaas, mas o vínculo remoto ainda não foi confirmado.",
      );
    }

    const gatewaySubscriptionId = updated.gateway_subscription_id;

    if (
      updated.gateway_status === "inactive" ||
      updated.gateway_status === "expired"
    ) {
      throw new BillingServiceError(
        "pending_confirmation",
        "A assinatura existente no Asaas não está ativa. Verifique o painel antes de tentar novamente.",
      );
    }

    // Defesa contra cancelamento concorrente: se a barbearia cancelou enquanto
    // o Asaas criava a recorrência, remove a assinatura remota antes de
    // encerrar a finalização.
    const { data: current } = await supabase
      .from("subscriptions")
      .select("status, gateway_subscription_id")
      .eq("id", claimed.id)
      .maybeSingle();

    if (current && current.gateway_subscription_id !== gatewaySubscriptionId) {
      throw new BillingServiceError(
        "pending_confirmation",
        "O vínculo da assinatura mudou durante a finalização. Tente novamente em instantes.",
      );
    }

    if (
      current?.status === "canceled" ||
      current?.status === "expired"
    ) {
      if (updated.gateway_subscription_id) {
        try {
          await deleteAsaasSubscription(updated.gateway_subscription_id);
        } catch {
          // A linha local já está cancelada; o próximo cancelamento/reprocessamento
          // não deve criar nova cobrança.
        }
      }

      await markFailure(
        supabase,
        claimed.id,
        "Assinatura cancelada durante a finalização do teste.",
      );

      return {
        ...base,
        outcome: "skipped",
        message: "Assinatura cancelada durante a finalização.",
      };
    }

    await markSuccess(
      supabase,
      claimed.id,
      gatewaySubscriptionId,
      now,
    );

    return { ...base, outcome: "created" };
  } catch (error) {
    await markFailure(supabase, claimed.id, error);

    return {
      ...base,
      outcome: "failed",
      message: failureMessage(error),
    };
  }
}

/**
 * Finaliza os trials vencidos e reprocessa finalizações que falharam.
 *
 * A função é idempotente: cada linha é reivindicada por uma atualização
 * condicional, a assinatura remota é recuperada por external_reference antes de
 * qualquer criação e o lock expira automaticamente após cinco minutos.
 */
export async function finalizeExpiredTrials(
  options: FinalizeExpiredTrialsOptions = {},
): Promise<TrialFinalizationSummary> {
  const supabase = createAdminClient();
  const now = options.now ?? new Date();
  const limit = clampBatchSize(options.limit);
  const candidates = await findCandidates(supabase, now, limit);

  const items: TrialFinalizationItem[] = [];
  let claimedCount = 0;
  let created = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    let claimed: SubscriptionRow | null;

    try {
      claimed = await claimCandidate(supabase, candidate, now);
    } catch (error) {
      failed += 1;
      items.push({
        subscriptionId: candidate.id,
        barbershopId: candidate.barbershop_id,
        outcome: "failed",
        message: failureMessage(error),
      });
      continue;
    }

    if (!claimed) {
      skipped += 1;
      items.push({
        subscriptionId: candidate.id,
        barbershopId: candidate.barbershop_id,
        outcome: "skipped",
        message: "Registro já reivindicado por outra execução.",
      });
      continue;
    }

    claimedCount += 1;

    const item = await finalizeCandidate(supabase, claimed, now);
    items.push(item);

    if (item.outcome === "created") {
      created += 1;
    } else if (item.outcome === "failed") {
      failed += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    candidates: candidates.length,
    claimed: claimedCount,
    created,
    failed,
    skipped,
    items,
  };
}
