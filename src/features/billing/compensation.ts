import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AsaasError,
  deleteAsaasSubscription,
  getAsaasSubscription,
  isAsaasTransientError,
  listAsaasSubscriptionsByExternalReference,
} from "@/lib/asaas/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;
type CleanupJobRow =
  Database["public"]["Tables"]["billing_remote_cleanup_jobs"]["Row"];
type CleanupJobUpdate =
  Database["public"]["Tables"]["billing_remote_cleanup_jobs"]["Update"];
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];

const defaultBatchSize = 10;
const maxBatchSize = 50;
const maxAttempts = 8;
const staleLeaseMs = 5 * 60 * 1000;
const maxErrorLength = 500;

const unresolvedStatuses = [
  "pending",
  "processing",
  "retry",
  "manual_review",
] as const;

export type RemoteCleanupSummary = {
  candidates: number;
  claimed: number;
  completed: number;
  retry: number;
  manualReview: number;
  failed: number;
};

export type ProcessRemoteCleanupOptions = {
  limit?: number;
  now?: Date;
  jobIds?: string[];
  /** Injeção usada pelo fluxo de cancelamento para reaproveitar o cliente. */
  supabase?: Supabase;
};

export type RegisterRemoteCleanupInput = {
  subscriptionId: string;
  barbershopId: string;
  externalReference: string;
  gatewaySubscriptionId?: string | null;
  lastError?: string | null;
  manualReview?: boolean;
};

function clampBatchSize(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined) {
    return defaultBatchSize;
  }

  return Math.min(Math.max(value, 1), maxBatchSize);
}

function isTerminalStatus(status: string): boolean {
  return status === "canceled" || status === "expired";
}

/**
 * Enquanto um checkout pago estiver ativo, uma recorrência não adotada pode
 * ser a que a execução atual está prestes a vincular. Nesse caso o worker não
 * remove: agenda retry e deixa a execução terminar. Sem lease ativo, a
 * recorrência órfã da mesma referência pode ser removida com segurança.
 */
function hasActiveCheckout(subscription: SubscriptionRow, now: Date): boolean {
  if (!subscription.checkout_locked_at) {
    return false;
  }

  const lockedAt = new Date(subscription.checkout_locked_at).getTime();

  return Number.isFinite(lockedAt) && now.getTime() - lockedAt < staleLeaseMs;
}

function backoffMs(attempts: number): number {
  const exponent = Math.max(attempts - 1, 0);
  const minutes = Math.min(2 ** exponent, 60);

  return minutes * 60 * 1000;
}

/**
 * Mensagem operacional sem PII, token de lease, documento ou payload do
 * gateway. O job guarda apenas o suficiente para diagnóstico.
 */
function cleanupErrorMessage(error: unknown): string {
  if (error instanceof AsaasError) {
    switch (error.kind) {
      case "timeout":
      case "unavailable":
      case "rate_limited":
      case "invalid_response":
        return "Não foi possível confirmar a remoção da recorrência no Asaas.";
      case "config":
      case "unauthorized":
        return "A configuração do Asaas não permite concluir a compensação.";
      case "validation":
        return "O Asaas recusou a remoção da recorrência.";
      case "not_found":
        return "A recorrência já não existe no Asaas.";
    }
  }

  if (isAsaasTransientError(error)) {
    return "Não foi possível confirmar a remoção da recorrência no Asaas.";
  }

  return "Falha temporária ao processar a compensação remota.";
}

function ownedRemoteMatches(
  remote: { externalReference?: string | null; deleted?: boolean },
  externalReference: string,
): boolean {
  return (
    !remote.deleted && remote.externalReference === externalReference
  );
}

async function updateSubscriptionCleanupFlag(
  supabase: Supabase,
  subscriptionId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("billing_remote_cleanup_jobs")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .in("status", [...unresolvedStatuses])
    .limit(1)
    .maybeSingle();

  if (error) {
    return;
  }

  await supabase
    .from("subscriptions")
    .update({ remote_cleanup_pending: Boolean(data) })
    .eq("id", subscriptionId);
}

/**
 * Mescla uma nova observação em um job já aberto. Só aceita a mesma
 * referência externa e nunca reabre um job concluído. IDs remotos distintos
 * para a mesma contratação são ambíguos e vão para revisão manual.
 */
async function mergeOpenCleanupJob(
  supabase: Supabase,
  existing: CleanupJobRow,
  input: {
    externalReference: string;
    gatewaySubscriptionId: string | null;
    lastError: string | null;
    manualReview: boolean;
  },
  nowIso: string,
): Promise<string | null> {
  if (existing.external_reference !== input.externalReference) {
    // Nunca mistura operações distintas na mesma assinatura.
    return null;
  }

  const update: CleanupJobUpdate = {};
  const conflictingGatewayId =
    Boolean(existing.gateway_subscription_id) &&
    Boolean(input.gatewaySubscriptionId) &&
    existing.gateway_subscription_id !== input.gatewaySubscriptionId;

  if (conflictingGatewayId) {
    // Dois IDs remotos distintos para a mesma referência externa: não é
    // possível decidir qual recorrência remover com segurança.
    update.status = "manual_review";
    update.locked_at = null;
    update.lease_token = null;
    update.last_error =
      "Identificadores remotos divergentes para a mesma contratação.";
  } else {
    if (!existing.gateway_subscription_id && input.gatewaySubscriptionId) {
      update.gateway_subscription_id = input.gatewaySubscriptionId;
    }

    if (input.lastError) {
      update.last_error = input.lastError;
    }

    if (input.manualReview && existing.status !== "processing") {
      update.status = "manual_review";
      update.locked_at = null;
      update.lease_token = null;
    } else if (existing.status === "retry" && !input.manualReview) {
      update.status = "pending";
      update.next_attempt_at = nowIso;
    }
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await supabase
      .from("billing_remote_cleanup_jobs")
      .update(update)
      .eq("id", existing.id);

    if (updateError) {
      throw new Error("Não foi possível atualizar a compensação remota.");
    }
  }

  return existing.id;
}

/**
 * Registra ou atualiza a intenção durável de compensação. É seguro chamar mais
 * de uma vez: existe no máximo um job aberto por assinatura. A fonte durável é
 * a linha em billing_remote_cleanup_jobs; a flag em subscriptions é apenas um
 * sinal rápido e pode falhar sem eliminar o bloqueio.
 */
export async function registerRemoteCleanupCandidate(
  supabase: Supabase,
  input: RegisterRemoteCleanupInput,
): Promise<string | null> {
  const externalReference = input.externalReference.trim();
  const gatewaySubscriptionId = input.gatewaySubscriptionId?.trim() || null;
  const lastError = input.lastError?.slice(0, maxErrorLength) ?? null;

  if (
    !input.subscriptionId ||
    !input.barbershopId ||
    externalReference.length === 0 ||
    externalReference.length > 120 ||
    (gatewaySubscriptionId !== null && gatewaySubscriptionId.length > 120)
  ) {
    throw new Error("Dados inválidos para registrar a compensação remota.");
  }

  const nowIso = new Date().toISOString();

  const { data: existing, error: existingError } = await supabase
    .from("billing_remote_cleanup_jobs")
    .select("*")
    .eq("subscription_id", input.subscriptionId)
    .neq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error("Não foi possível consultar a compensação remota.");
  }

  let jobId: string | null = null;

  if (existing) {
    jobId = await mergeOpenCleanupJob(
      supabase,
      existing as CleanupJobRow,
      {
        externalReference,
        gatewaySubscriptionId,
        lastError,
        manualReview: Boolean(input.manualReview),
      },
      nowIso,
    );
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("billing_remote_cleanup_jobs")
      .insert({
        subscription_id: input.subscriptionId,
        barbershop_id: input.barbershopId,
        provider: "asaas",
        external_reference: externalReference,
        gateway_subscription_id: gatewaySubscriptionId,
        status: input.manualReview ? "manual_review" : "pending",
        attempts: 0,
        locked_at: null,
        lease_token: null,
        next_attempt_at: nowIso,
        last_error: lastError,
        completed_at: null,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      if (insertError.code !== "23505") {
        throw new Error("Não foi possível registrar a compensação remota.");
      }

      const { data: concurrent } = await supabase
        .from("billing_remote_cleanup_jobs")
        .select("*")
        .eq("subscription_id", input.subscriptionId)
        .neq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!concurrent) {
        return null;
      }

      jobId = await mergeOpenCleanupJob(
        supabase,
        concurrent as CleanupJobRow,
        {
          externalReference,
          gatewaySubscriptionId,
          lastError,
          manualReview: Boolean(input.manualReview),
        },
        nowIso,
      );
    } else {
      jobId = inserted?.id ?? null;
    }
  }

  if (jobId) {
    await supabase
      .from("subscriptions")
      .update({ remote_cleanup_pending: true })
      .eq("id", input.subscriptionId);
  }

  return jobId;
}

async function claimCleanupJob(
  supabase: Supabase,
  candidate: CleanupJobRow,
  now: Date,
): Promise<CleanupJobRow | null> {
  const nowIso = now.toISOString();
  const staleCutoff = new Date(now.getTime() - staleLeaseMs).toISOString();
  const token = randomUUID();
  const payload: CleanupJobUpdate = {
    status: "processing",
    locked_at: nowIso,
    lease_token: token,
    attempts: (candidate.attempts ?? 0) + 1,
    last_error: null,
  };

  if (candidate.status === "processing") {
    const { data, error } = await supabase
      .from("billing_remote_cleanup_jobs")
      .update(payload)
      .eq("id", candidate.id)
      .eq("status", "processing")
      .eq("lease_token", candidate.lease_token as string)
      .lt("locked_at", staleCutoff)
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ?? null;
  }

  const { data, error } = await supabase
    .from("billing_remote_cleanup_jobs")
    .update(payload)
    .eq("id", candidate.id)
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", nowIso)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function completeJob(
  supabase: Supabase,
  job: CleanupJobRow,
  token: string,
  now: Date,
  gatewaySubscriptionId?: string,
): Promise<boolean> {
  const payload: CleanupJobUpdate = {
    status: "completed",
    completed_at: now.toISOString(),
    locked_at: null,
    lease_token: null,
    last_error: null,
    gateway_subscription_id:
      job.gateway_subscription_id ?? gatewaySubscriptionId ?? null,
  };

  const { data, error } = await supabase
    .from("billing_remote_cleanup_jobs")
    .update(payload)
    .eq("id", job.id)
    .eq("status", "processing")
    .eq("lease_token", token)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  await updateSubscriptionCleanupFlag(supabase, job.subscription_id);

  return true;
}

async function scheduleRetry(
  supabase: Supabase,
  job: CleanupJobRow,
  token: string,
  now: Date,
  message: string,
): Promise<"retry" | "manual_review" | "failed"> {
  const manualReview = job.attempts >= maxAttempts;
  const payload: CleanupJobUpdate = {
    status: manualReview ? "manual_review" : "retry",
    locked_at: null,
    lease_token: null,
    last_error: message.slice(0, maxErrorLength),
    next_attempt_at: manualReview
      ? job.next_attempt_at
      : new Date(now.getTime() + backoffMs(job.attempts)).toISOString(),
  };

  const { data, error } = await supabase
    .from("billing_remote_cleanup_jobs")
    .update(payload)
    .eq("id", job.id)
    .eq("status", "processing")
    .eq("lease_token", token)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return "failed";
  }

  // Reafirma o sinal rápido: a outbox é a fonte durável e o job continua
  // aberto mesmo se uma gravação anterior da flag tiver falhado.
  await updateSubscriptionCleanupFlag(supabase, job.subscription_id);

  return manualReview ? "manual_review" : "retry";
}

async function moveToManualReview(
  supabase: Supabase,
  job: CleanupJobRow,
  token: string,
  message: string,
): Promise<"manual_review" | "failed"> {
  const { data, error } = await supabase
    .from("billing_remote_cleanup_jobs")
    .update({
      status: "manual_review",
      locked_at: null,
      lease_token: null,
      last_error: message.slice(0, maxErrorLength),
    })
    .eq("id", job.id)
    .eq("status", "processing")
    .eq("lease_token", token)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return "failed";
  }

  await updateSubscriptionCleanupFlag(supabase, job.subscription_id);

  return "manual_review";
}

async function processClaimedJob(
  supabase: Supabase,
  job: CleanupJobRow,
  token: string,
  now: Date,
): Promise<"completed" | "retry" | "manual_review" | "failed"> {
  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", job.subscription_id)
    .maybeSingle();

  if (subscriptionError) {
    return scheduleRetry(
      supabase,
      job,
      token,
      now,
      "Não foi possível consultar o estado local da assinatura.",
    );
  }

  if (!subscription) {
    return moveToManualReview(
      supabase,
      job,
      token,
      "A assinatura local do job não foi encontrada.",
    );
  }

  const current = subscription as SubscriptionRow;
  const terminal = isTerminalStatus(current.status);
  const currentLink = current.gateway_subscription_id;

  if (job.provider !== "asaas") {
    return moveToManualReview(
      supabase,
      job,
      token,
      "O provedor da recorrência remota não é suportado pelo worker.",
    );
  }

  try {
    if (job.gateway_subscription_id) {
      // A recorrência ainda é a vinculada a uma assinatura corrente: pertence à
      // execução atual, não é órfã e não pode ser removida.
      if (!terminal && currentLink === job.gateway_subscription_id) {
        return (await completeJob(supabase, job, token, now))
          ? "completed"
          : "failed";
      }

      const remote = await getAsaasSubscription(job.gateway_subscription_id);

      if (remote.deleted) {
        return (await completeJob(supabase, job, token, now))
          ? "completed"
          : "failed";
      }

      if (
        remote.id !== job.gateway_subscription_id ||
        !ownedRemoteMatches(remote, job.external_reference)
      ) {
        return moveToManualReview(
          supabase,
          job,
          token,
          "A recorrência remota não pertence exatamente a esta contratação.",
        );
      }

      if (!terminal && currentLink === remote.id) {
        return (await completeJob(supabase, job, token, now))
          ? "completed"
          : "failed";
      }

      if (!terminal && hasActiveCheckout(current, now)) {
        return scheduleRetry(
          supabase,
          job,
          token,
          now,
          "O checkout atual ainda pode adotar a recorrência; aguardando o término.",
        );
      }

      await deleteAsaasSubscription(remote.id);

      return (await completeJob(supabase, job, token, now))
        ? "completed"
        : "failed";
    }

    const matches = await listAsaasSubscriptionsByExternalReference(
      job.external_reference,
    );
    const owned = matches.filter((remote) =>
      ownedRemoteMatches(remote, job.external_reference),
    );

    if (owned.length === 0) {
      return scheduleRetry(
        supabase,
        job,
        token,
        now,
        "A recorrência ainda não foi encontrada no Asaas.",
      );
    }

    if (owned.length > 1) {
      return moveToManualReview(
        supabase,
        job,
        token,
        "Mais de uma recorrência remota corresponde à mesma contratação.",
      );
    }

    const remote = owned[0];

    if (!terminal && currentLink === remote.id) {
      return (await completeJob(supabase, job, token, now))
        ? "completed"
        : "failed";
    }

    if (!terminal && hasActiveCheckout(current, now)) {
      return scheduleRetry(
        supabase,
        job,
        token,
        now,
        "O checkout atual ainda pode adotar a recorrência; aguardando o término.",
      );
    }

    await deleteAsaasSubscription(remote.id);

    return (await completeJob(supabase, job, token, now, remote.id))
      ? "completed"
      : "failed";
  } catch (error) {
    if (error instanceof AsaasError && error.kind === "not_found") {
      return (await completeJob(supabase, job, token, now))
        ? "completed"
        : "failed";
    }

    if (
      error instanceof AsaasError &&
      (error.kind === "config" ||
        error.kind === "unauthorized" ||
        error.kind === "validation")
    ) {
      return moveToManualReview(
        supabase,
        job,
        token,
        cleanupErrorMessage(error),
      );
    }

    return scheduleRetry(
      supabase,
      job,
      token,
      now,
      cleanupErrorMessage(error),
    );
  }
}

/**
 * Processa um lote pequeno de jobs elegíveis. Cada job é reivindicado com
 * UPDATE condicional e lease próprio; executores concorrentes não processam a
 * mesma linha. Jobs em processing com lease expirado voltam a ser elegíveis.
 */
export async function processRemoteCleanupJobs(
  options: ProcessRemoteCleanupOptions = {},
): Promise<RemoteCleanupSummary> {
  const supabase = options.supabase ?? createAdminClient();
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const limit = clampBatchSize(options.limit);
  const staleCutoff = new Date(now.getTime() - staleLeaseMs).toISOString();

  if (options.jobIds && options.jobIds.length === 0) {
    return {
      candidates: 0,
      claimed: 0,
      completed: 0,
      retry: 0,
      manualReview: 0,
      failed: 0,
    };
  }

  let dueQuery = supabase
    .from("billing_remote_cleanup_jobs")
    .select("*")
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  let staleQuery = supabase
    .from("billing_remote_cleanup_jobs")
    .select("*")
    .eq("status", "processing")
    .lt("locked_at", staleCutoff)
    .order("locked_at", { ascending: true })
    .limit(limit);

  if (options.jobIds) {
    dueQuery = dueQuery.in("id", options.jobIds);
    staleQuery = staleQuery.in("id", options.jobIds);
  }

  const [dueResult, staleResult] = await Promise.all([dueQuery, staleQuery]);

  if (dueResult.error || staleResult.error) {
    throw new Error("Não foi possível consultar a fila de compensação remota.");
  }

  const candidates = new Map<string, CleanupJobRow>();

  for (const candidate of [
    ...((dueResult.data ?? []) as CleanupJobRow[]),
    ...((staleResult.data ?? []) as CleanupJobRow[]),
  ]) {
    candidates.set(candidate.id, candidate);
  }

  const summary: RemoteCleanupSummary = {
    candidates: candidates.size,
    claimed: 0,
    completed: 0,
    retry: 0,
    manualReview: 0,
    failed: 0,
  };

  for (const candidate of candidates.values()) {
    let claimed: CleanupJobRow | null;

    try {
      claimed = await claimCleanupJob(supabase, candidate, now);
    } catch {
      summary.failed += 1;
      continue;
    }

    if (!claimed || !claimed.lease_token) {
      continue;
    }

    summary.claimed += 1;

    let outcome: "completed" | "retry" | "manual_review" | "failed";

    try {
      outcome = await processClaimedJob(
        supabase,
        claimed,
        claimed.lease_token,
        now,
      );
    } catch {
      outcome = await scheduleRetry(
        supabase,
        claimed,
        claimed.lease_token,
        now,
        "Falha temporária ao processar a compensação remota.",
      );
    }

    if (outcome === "completed") {
      summary.completed += 1;
    } else if (outcome === "retry") {
      summary.retry += 1;
    } else if (outcome === "manual_review") {
      summary.manualReview += 1;
    } else {
      summary.failed += 1;
    }
  }

  return summary;
}
