import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AsaasError,
  createAsaasCustomer,
  createAsaasSubscription,
  findAsaasCustomerByDocument,
  getAsaasSubscription,
  isAsaasTransientError,
  listAsaasSubscriptionsByExternalReference,
  updateAsaasSubscription,
  type AsaasBillingType,
  type AsaasCycle,
  type AsaasSubscription,
} from "@/lib/asaas/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import {
  registerRemoteCleanupCandidate,
  processRemoteCleanupJobs,
} from "./compensation";
import {
  onlyDigits,
  personTypeFromDocument,
  type BillingType,
} from "@/lib/validation/billing";

type Supabase = SupabaseClient<Database>;
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type PlanRow = Database["public"]["Tables"]["plans"]["Row"];

/**
 * Cada fluxo passa o token do lease que possui. Checkout e finalização de trial
 * usam colunas independentes, mas todas as persistências remotas validam o
 * token indicado antes de alterar a assinatura local.
 */
type SubscriptionFencing = {
  column: "checkout_lease_token" | "trial_finalization_lease_token";
  token: string;
};

type CancelWithCleanupResult = {
  subscriptionId: string;
  jobId: string | null;
  status: string;
  remoteCleanupPending: boolean;
  alreadyTerminal: boolean;
};

const currentSubscriptionStatuses = [
  "pending",
  "trialing",
  "active",
  "past_due",
] as const;

const terminalSubscriptionStatuses = ["canceled", "expired"] as const;
const staleCheckoutLockMs = 5 * 60 * 1000;

function isTerminalStatus(status: string): boolean {
  return (
    status === terminalSubscriptionStatuses[0] ||
    status === terminalSubscriptionStatuses[1]
  );
}

function failureMessage(error: unknown): string {
  if (error instanceof BillingServiceError) {
    return error.message.slice(0, 500);
  }

  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return "Falha desconhecida ao processar a contratação.";
}

export type BillingServiceErrorKind =
  | "validation"
  | "conflict"
  | "not_found"
  | "gateway"
  | "pending_confirmation"
  | "config";

export class BillingServiceError extends Error {
  constructor(
    public readonly kind: BillingServiceErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "BillingServiceError";
  }
}

function asaasBillingType(type: BillingType): AsaasBillingType {
  return type === "boleto" ? "BOLETO" : "PIX";
}

function asaasCycle(interval: PlanRow["interval"]): AsaasCycle {
  return interval === "year" ? "YEARLY" : "MONTHLY";
}

function subscriptionDescription(plan: PlanRow): string {
  return `LPS Agenda — ${plan.name}`.slice(0, 500);
}

export function dateOnlyInSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayDateOnly(): string {
  return dateOnlyInSaoPaulo(new Date());
}

function tomorrowDateOnly(): string {
  return dateOnlyInSaoPaulo(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function trialEndLabel(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function isFreshLock(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) && Date.now() - timestamp < 5 * 60 * 1000;
}

function normalizedDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeCancelReason(
  value: string | null | undefined,
): string | null {
  const reason = value?.trim() ?? "";

  if (reason.length > 500) {
    throw new BillingServiceError(
      "validation",
      "O motivo do cancelamento deve ter no máximo 500 caracteres.",
    );
  }

  return reason.length > 0 ? reason : null;
}

/**
 * A RPC é a única fonte confiável da transição terminal + outbox. O retorno é
 * validado antes de qualquer mensagem de sucesso; formato inesperado é tratado
 * como falha, nunca como cancelamento concluído.
 */
function parseCancelWithCleanupResult(
  data: unknown,
): CancelWithCleanupResult | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const value = data as Record<string, unknown>;

  if (
    typeof value.subscription_id !== "string" ||
    typeof value.status !== "string" ||
    typeof value.remote_cleanup_pending !== "boolean" ||
    typeof value.already_terminal !== "boolean"
  ) {
    return null;
  }

  return {
    subscriptionId: value.subscription_id,
    jobId: typeof value.job_id === "string" ? value.job_id : null,
    status: value.status,
    remoteCleanupPending: value.remote_cleanup_pending,
    alreadyTerminal: value.already_terminal,
  };
}

function mapGatewayStatus(
  status: string | undefined,
): "active" | "inactive" | "expired" | null {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "INACTIVE":
      return "inactive";
    case "EXPIRED":
      return "expired";
    default:
      return null;
  }
}

function mapAsaasError(error: unknown): BillingServiceError {
  if (error instanceof BillingServiceError) {
    return error;
  }

  if (error instanceof AsaasError) {
    switch (error.kind) {
      case "config":
        return new BillingServiceError(
          "config",
          "Pagamento online não configurado neste ambiente.",
        );
      case "unauthorized":
        return new BillingServiceError(
          "config",
          "As credenciais do Asaas foram recusadas. Verifique o ambiente Sandbox.",
        );
      case "validation":
        return new BillingServiceError("validation", error.message);
      case "not_found":
        return new BillingServiceError(
          "not_found",
          "O recurso não foi encontrado no Asaas.",
        );
      default:
        return new BillingServiceError(
          "gateway",
          "Não foi possível concluir a operação no Asaas. Tente novamente em instantes.",
        );
    }
  }

  return new BillingServiceError(
    "gateway",
    "Não foi possível concluir a operação agora. Tente novamente.",
  );
}

async function requireLegacyBillingShop(supabase: Supabase, shop: string) {
  const { data, error } = await supabase.from("subscriptions").select("id")
    .eq("barbershop_id", shop).eq("gateway", "manual_pix").limit(1).maybeSingle();
  if (error || data) throw new BillingServiceError("conflict",
    "A contratação online está indisponível para esta barbearia.");
}

function requireAsaasSubscription(row: SubscriptionRow) {
  if (row.gateway !== "asaas") throw new BillingServiceError("conflict", "Esta assinatura não utiliza o Asaas.");
}

async function findCurrentSubscription(
  supabase: Supabase,
  barbershopId: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .in("status", [...currentSubscriptionStatuses])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível consultar a assinatura agora. Tente novamente.",
    );
  }

  if (data) requireAsaasSubscription(data);
  return data ?? null;
}

async function findSubscriptionById(
  supabase: Supabase,
  subscriptionId: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("gateway", "asaas")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (error) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível consultar o estado da assinatura agora. Tente novamente.",
    );
  }

  return data ?? null;
}

async function listSubscriptionHistory(
  supabase: Supabase,
  barbershopId: string,
): Promise<Array<{ id: string; trial_ends_at: string | null }>> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, trial_ends_at")
    .eq("barbershop_id", barbershopId);

  if (error) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível consultar o histórico da assinatura agora.",
    );
  }

  return data ?? [];
}

async function findActivePlan(
  supabase: Supabase,
  planId: string,
): Promise<PlanRow> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível consultar o plano agora. Tente novamente.",
    );
  }

  if (!data) {
    throw new BillingServiceError(
      "not_found",
      "O plano escolhido não está disponível.",
    );
  }

  return data;
}

export async function resolveBillingCustomer(
  supabase: Supabase,
  input: {
    barbershopId: string;
    holderName: string;
    document: string;
    email?: string | null;
    phone?: string | null;
  },
): Promise<string> {
  await requireLegacyBillingShop(supabase, input.barbershopId);
  const documentDigits = onlyDigits(input.document);

  if (documentDigits.length !== 11 && documentDigits.length !== 14) {
    throw new BillingServiceError(
      "validation",
      "Informe um CPF ou CNPJ válido.",
    );
  }

  const personType = personTypeFromDocument(documentDigits);
  const holderName = input.holderName.trim().slice(0, 120);
  const email = input.email?.trim().slice(0, 254) || null;
  const rawPhone = input.phone ? onlyDigits(input.phone) : "";
  const phoneDigits =
    rawPhone.length === 10 || rawPhone.length === 11 ? rawPhone : null;

  const { data: existing, error } = await supabase
    .from("billing_customers")
    .select("*")
    .eq("gateway", "asaas")
    .eq("barbershop_id", input.barbershopId)
    .maybeSingle();

  if (error) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível consultar o cadastro do pagador agora.",
    );
  }

  if (existing?.gateway_customer_id) {
    if (existing.document_digits !== documentDigits) {
      throw new BillingServiceError(
        "validation",
        "O documento do pagador já está cadastrado e não pode ser alterado por aqui.",
      );
    }

    return existing.gateway_customer_id;
  }

  let remote: { id: string } | null = null;

  try {
    remote = await findAsaasCustomerByDocument(documentDigits);
  } catch (error) {
    if (isAsaasTransientError(error)) {
      throw new BillingServiceError(
        "pending_confirmation",
        "Não foi possível confirmar o cadastro do pagador no Asaas. Tente novamente em instantes.",
      );
    }

    throw mapAsaasError(error);
  }

  if (!remote) {
    try {
      remote = await createAsaasCustomer({
        name: holderName,
        cpfCnpj: documentDigits,
        email,
        phone: phoneDigits,
        externalReference: input.barbershopId,
      });
    } catch (error) {
      if (isAsaasTransientError(error)) {
        try {
          const recovered = await findAsaasCustomerByDocument(documentDigits);
          if (recovered) {
            remote = recovered;
          }
        } catch {
          // Mantém o estado pendente para uma nova tentativa.
        }

        if (!remote) {
          throw new BillingServiceError(
            "pending_confirmation",
            "O cadastro do pagador foi enviado ao Asaas, mas a confirmação não chegou. Tente novamente em instantes.",
          );
        }
      } else {
        throw mapAsaasError(error);
      }
    }
  }

  if (!remote) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível cadastrar o pagador no Asaas.",
    );
  }

  const payload = {
    barbershop_id: input.barbershopId,
    gateway: "asaas",
    gateway_customer_id: remote.id,
    person_type: personType,
    document_digits: documentDigits,
    holder_name: holderName,
    email,
    phone_digits: phoneDigits,
  };

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from("billing_customers")
      .update(payload)
      .eq("id", existing.id)
      .is("gateway_customer_id", null)
      .select("gateway_customer_id")
      .maybeSingle();

    if (updateError) {
      throw new BillingServiceError(
        "gateway",
        "Não foi possível salvar o cadastro do pagador.",
      );
    }

    if (!updated) {
      const { data: refreshed } = await supabase
        .from("billing_customers")
        .select("gateway_customer_id")
        .eq("id", existing.id)
        .maybeSingle();

      if (refreshed?.gateway_customer_id) {
        return refreshed.gateway_customer_id;
      }

      throw new BillingServiceError(
        "gateway",
        "Não foi possível salvar o cadastro do pagador.",
      );
    }

    return remote.id;
  }

  const { error: insertError } = await supabase
    .from("billing_customers")
    .insert(payload);

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: concurrent } = await supabase
        .from("billing_customers")
        .select("gateway_customer_id")
        .eq("barbershop_id", input.barbershopId)
        .maybeSingle();

      if (concurrent?.gateway_customer_id) {
        return concurrent.gateway_customer_id;
      }
    }

    throw new BillingServiceError(
      "gateway",
      "Não foi possível salvar o cadastro do pagador.",
    );
  }

  return remote.id;
}

/**
 * Persiste o pagador localmente durante o trial, sem qualquer chamada ao
 * Asaas. A criação do cliente remoto acontece somente na finalização, quando
 * o período gratuito já terminou.
 */
async function saveLocalBillingCustomer(
  supabase: Supabase,
  input: {
    barbershopId: string;
    holderName: string;
    document: string;
    email?: string | null;
    phone?: string | null;
  },
): Promise<void> {
  const documentDigits = onlyDigits(input.document);

  if (documentDigits.length !== 11 && documentDigits.length !== 14) {
    throw new BillingServiceError(
      "validation",
      "Informe um CPF ou CNPJ válido.",
    );
  }

  const personType = personTypeFromDocument(documentDigits);
  const holderName = input.holderName.trim().slice(0, 120);
  const email = input.email?.trim().slice(0, 254) || null;
  const rawPhone = input.phone ? onlyDigits(input.phone) : "";
  const phoneDigits =
    rawPhone.length === 10 || rawPhone.length === 11 ? rawPhone : null;

  const { data: existing, error } = await supabase
    .from("billing_customers")
    .select("*")
    .eq("gateway", "asaas")
    .eq("barbershop_id", input.barbershopId)
    .maybeSingle();

  if (error) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível consultar o cadastro do pagador agora.",
    );
  }

  if (existing) {
    if (existing.document_digits !== documentDigits) {
      throw new BillingServiceError(
        "validation",
        "O documento do pagador já está cadastrado e não pode ser alterado por aqui.",
      );
    }

    const { error: updateError } = await supabase
      .from("billing_customers")
      .update({
        person_type: personType,
        holder_name: holderName,
        email,
        phone_digits: phoneDigits,
      })
      .eq("id", existing.id);

    if (updateError) {
      throw new BillingServiceError(
        "gateway",
        "Não foi possível salvar o cadastro do pagador.",
      );
    }

    return;
  }

  const { error: insertError } = await supabase
    .from("billing_customers")
    .insert({
      barbershop_id: input.barbershopId,
      gateway: "asaas",
      gateway_customer_id: null,
      person_type: personType,
      document_digits: documentDigits,
      holder_name: holderName,
      email,
      phone_digits: phoneDigits,
    });

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: concurrent } = await supabase
        .from("billing_customers")
        .select("document_digits")
        .eq("barbershop_id", input.barbershopId)
        .maybeSingle();

      if (concurrent?.document_digits === documentDigits) {
        return;
      }
    }

    throw new BillingServiceError(
      "gateway",
      "Não foi possível salvar o cadastro do pagador.",
    );
  }
}

function remoteBelongsToLocal(
  local: SubscriptionRow,
  remote: AsaasSubscription,
): boolean {
  // A referência externa é a identidade da contratação. Um ID remoto
  // divergente com a mesma referência indica duplicidade da mesma contratação
  // e pode ser compensado com segurança pelo worker.
  if (remote.externalReference) {
    return remote.externalReference === local.external_reference;
  }

  return (
    !local.gateway_subscription_id ||
    local.gateway_subscription_id === remote.id
  );
}

async function registerCleanupAndSchedule(
  supabase: Supabase,
  input: Parameters<typeof registerRemoteCleanupCandidate>[1],
): Promise<void> {
  let jobId: string | null;

  try {
    jobId = await registerRemoteCleanupCandidate(supabase, input);
  } catch {
    throw new BillingServiceError(
      "pending_confirmation",
      "A recorrência remota não pôde ser registrada de forma durável para limpeza. A contratação precisa de verificação antes de uma nova tentativa.",
    );
  }

  if (!jobId) {
    throw new BillingServiceError(
      "pending_confirmation",
      "A recorrência remota não pôde ser associada com segurança à fila de limpeza. A contratação precisa de revisão.",
    );
  }

  // A tentativa imediata é apenas uma otimização. Se falhar, o job já está
  // durável e será retomado pelo próximo ciclo do worker.
  try {
    await processRemoteCleanupJobs({
      jobIds: [jobId],
      limit: 1,
      supabase,
    });
  } catch {
    // Não suprime falha de persistência: somente falhas do processamento
    // imediato são toleradas porque a outbox já foi gravada.
  }
}

async function assertNoPendingRemoteCleanup(
  supabase: Supabase,
  barbershopId: string,
): Promise<void> {
  // A outbox é a fonte durável. Um job não concluído bloqueia a barbearia
  // mesmo que a flag remote_cleanup_pending tenha falhado.
  const { data: job, error: jobError } = await supabase
    .from("billing_remote_cleanup_jobs")
    .select("id")
    .eq("barbershop_id", barbershopId)
    .in("status", ["pending", "processing", "retry", "manual_review"])
    .limit(1)
    .maybeSingle();

  if (jobError) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível verificar a fila de compensação da assinatura.",
    );
  }

  if (job) {
    throw new BillingServiceError(
      "pending_confirmation",
      "Existe uma assinatura anterior com remoção no Asaas pendente. Novas contratações e trocas ficam bloqueadas até a confirmação da limpeza.",
    );
  }

  const { data: flagged, error: flaggedError } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("barbershop_id", barbershopId)
    .eq("remote_cleanup_pending", true);

  if (flaggedError) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível verificar pendências de sincronização da assinatura.",
    );
  }

  const flaggedRows = (flagged ?? []) as Array<{ id: string }>;

  if (flaggedRows.length === 0) {
    return;
  }

  // Sem job aberto, uma flag só pode ser legado (anterior à outbox) ou sinal
  // desatualizado de um job já concluído. O primeiro continua bloqueando; o
  // segundo é liberado e limpo de forma best-effort.
  const flaggedIds = flaggedRows.map((row) => row.id);
  const { data: completed, error: completedError } = await supabase
    .from("billing_remote_cleanup_jobs")
    .select("subscription_id")
    .in("subscription_id", flaggedIds)
    .eq("status", "completed");

  if (completedError) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível verificar a fila de compensação da assinatura.",
    );
  }

  const completedIds = new Set(
    ((completed ?? []) as Array<{ subscription_id: string }>).map((row) =>
      row.subscription_id,
    ),
  );
  const legacy = flaggedRows.some((row) => !completedIds.has(row.id));

  if (legacy) {
    throw new BillingServiceError(
      "pending_confirmation",
      "Existe uma assinatura anterior com remoção no Asaas pendente. Novas contratações e trocas ficam bloqueadas até a confirmação da limpeza.",
    );
  }

  await supabase
    .from("subscriptions")
    .update({ remote_cleanup_pending: false })
    .eq("gateway", "asaas")
    .in("id", [...completedIds])
    .eq("remote_cleanup_pending", true);
}

async function compensateTerminalRemote(
  supabase: Supabase,
  current: SubscriptionRow,
  remote: AsaasSubscription,
): Promise<never> {
  const belongs = remoteBelongsToLocal(current, remote);
  const message = belongs
    ? "A contratação foi encerrada, mas a remoção da recorrência no Asaas ainda não foi confirmada."
    : "A recorrência remota retornada não pertence a esta contratação e não foi removida.";

  await registerCleanupAndSchedule(supabase, {
    subscriptionId: current.id,
    barbershopId: current.barbershop_id,
    externalReference: current.external_reference,
    gatewaySubscriptionId: belongs ? remote.id : null,
    lastError: message,
    manualReview: !belongs,
  });

  if (!belongs) {
    throw new BillingServiceError(
      "pending_confirmation",
      `${message} O caso foi registrado para recuperação.`,
    );
  }

  throw new BillingServiceError(
    "conflict",
    "A contratação foi cancelada ou expirou durante a confirmação no Asaas. A limpeza da recorrência foi registrada para recuperação.",
  );
}

async function persistRemoteSubscription(
  supabase: Supabase,
  local: SubscriptionRow,
  plan: PlanRow,
  remote: AsaasSubscription,
  fencing?: SubscriptionFencing,
): Promise<SubscriptionRow> {
  const gatewayStatus =
    mapGatewayStatus(remote.status) ??
    (local.gateway_status === "pending_creation"
      ? "active"
      : local.gateway_status);

  const payload = {
    plan_id: plan.id,
    billing_type: local.billing_type,
    contracted_price_cents: plan.price_cents,
    contracted_currency: plan.currency,
    contracted_interval: plan.interval,
    gateway: "asaas",
    gateway_subscription_id: remote.id,
    gateway_status: gatewayStatus,
    next_due_date: normalizedDate(remote.nextDueDate) ?? local.next_due_date,
  };

  // Atualização condicional: nunca grava vínculo remoto em linha cancelada,
  // expirada ou cujo lease pertence a outra execução. Quando o token não é
  // informado (trial/troca de plano), preserva-se a defesa por status.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const base = supabase
      .from("subscriptions")
      .update(payload)
      .eq("gateway", "asaas")
      .eq("id", local.id)
      .in("status", [...currentSubscriptionStatuses]);

    const fencedBase =
      fencing?.column === "checkout_lease_token"
        ? base.eq("checkout_lease_token", fencing.token)
        : fencing
          ? base.eq("trial_finalization_lease_token", fencing.token)
          : base;
    const { data, error } = await fencedBase
      .select("*")
      .maybeSingle();

    if (error) {
      throw new BillingServiceError(
        "gateway",
        "Não foi possível salvar a assinatura no banco.",
      );
    }

    if (data) {
      return data;
    }

    const current = await findSubscriptionById(supabase, local.id);

    if (!current) {
      throw new BillingServiceError(
        "gateway",
        "O registro local da assinatura não foi encontrado.",
      );
    }

    if (isTerminalStatus(current.status)) {
      return compensateTerminalRemote(supabase, current, remote);
    }

    if (fencing && current[fencing.column] !== fencing.token) {
      if (current.gateway_subscription_id === remote.id) {
        // A execução atual já adotou esta mesma recorrência. Não removê-la.
        throw new BillingServiceError(
          "conflict",
          "Outra execução assumiu a contratação e já confirmou esta recorrência. Atualize a página.",
        );
      }

      // Um ID remoto recebido tardiamente só pode ser associado à outbox se a
      // referência externa corresponder exatamente. O vínculo local pode já
      // apontar para outra recorrência da mesma contratação (duplicidade);
      // nesse caso o worker verifica e remove apenas a recorrência órfã.
      const belongs =
        typeof remote.externalReference === "string" &&
        remote.externalReference === current.external_reference;

      await registerCleanupAndSchedule(supabase, {
        subscriptionId: current.id,
        barbershopId: current.barbershop_id,
        externalReference: current.external_reference,
        gatewaySubscriptionId: belongs ? remote.id : null,
        lastError: belongs
          ? "Execução antiga perdeu o lease de checkout após criar uma recorrência."
          : "Execução antiga perdeu o lease e retornou recorrência de outra contratação.",
        manualReview: !belongs,
      });

      throw new BillingServiceError(
        "conflict",
        "Outra execução assumiu a contratação. O vínculo remoto desta execução não foi gravado.",
      );
    }
  }

  throw new BillingServiceError(
    "pending_confirmation",
    "A assinatura foi criada no Asaas, mas o vínculo local não pôde ser confirmado. Atualize a página em instantes.",
  );
}

async function clearRemoteSubscriptionLink(
  supabase: Supabase,
  local: SubscriptionRow,
  gatewaySubscriptionId: string,
  fencing?: SubscriptionFencing,
): Promise<SubscriptionRow> {
  const base = supabase
    .from("subscriptions")
    .update({
      gateway_subscription_id: null,
      gateway_status: "pending_creation",
    })
    .eq("gateway", "asaas")
      .eq("id", local.id)
    .eq("gateway_subscription_id", gatewaySubscriptionId)
    .in("status", [...currentSubscriptionStatuses]);

  const fencedBase =
    fencing?.column === "checkout_lease_token"
      ? base.eq("checkout_lease_token", fencing.token)
      : fencing
        ? base.eq("trial_finalization_lease_token", fencing.token)
        : base;
  const { data, error } = await fencedBase
    .select("*")
    .maybeSingle();

  if (error) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível limpar o vínculo da assinatura removida no Asaas.",
    );
  }

  if (!data) {
    const current = await findSubscriptionById(supabase, local.id);

    if (current && isTerminalStatus(current.status)) {
      throw new BillingServiceError(
        "conflict",
        "A assinatura foi cancelada ou expirou durante a recuperação.",
      );
    }

    if (fencing && current?.[fencing.column] !== fencing.token) {
      throw new BillingServiceError(
        "conflict",
        "Outra execução assumiu a contratação durante a recuperação.",
      );
    }

    throw new BillingServiceError(
      "pending_confirmation",
      "O vínculo da assinatura mudou durante a recuperação. Tente novamente em instantes.",
    );
  }

  return data;
}

export async function ensureRemoteSubscription(
  supabase: Supabase,
  local: SubscriptionRow,
  plan: PlanRow,
  customerId: string,
  fencing?: SubscriptionFencing,
): Promise<SubscriptionRow> {
  requireAsaasSubscription(local);
  await requireLegacyBillingShop(supabase, local.barbershop_id);
  let current = local;
  const existingGatewaySubscriptionId = current.gateway_subscription_id;

  if (existingGatewaySubscriptionId) {
    let remote: AsaasSubscription | null = null;

    try {
      remote = await getAsaasSubscription(existingGatewaySubscriptionId);
    } catch (error) {
      if (error instanceof AsaasError && error.kind === "not_found") {
        // O vínculo local ficou obsoleto: a assinatura não existe mais no
        // Asaas. A recuperação por external_reference decide se cria ou adota
        // uma assinatura existente.
        remote = null;
      } else if (isAsaasTransientError(error)) {
        throw new BillingServiceError(
          "pending_confirmation",
          "Não foi possível confirmar a assinatura existente no Asaas. Tente novamente em instantes.",
        );
      } else {
        throw mapAsaasError(error);
      }
    }

    if (remote && !remote.deleted) {
      if (
        remote.externalReference &&
        remote.externalReference !== current.external_reference
      ) {
        throw new BillingServiceError(
          "conflict",
          "A assinatura encontrada no Asaas não pertence a esta contratação.",
        );
      }

      return persistRemoteSubscription(supabase, current, plan, remote, fencing);
    }

    current = await clearRemoteSubscriptionLink(
      supabase,
      current,
      existingGatewaySubscriptionId,
      fencing,
    );
  }

  let recovered: AsaasSubscription | null = null;

  try {
    const matches = await listAsaasSubscriptionsByExternalReference(
      current.external_reference,
    );
    recovered = matches[0] ?? null;
  } catch (error) {
    if (isAsaasTransientError(error)) {
      throw new BillingServiceError(
        "pending_confirmation",
        "Não foi possível confirmar a assinatura no Asaas. Tente novamente em instantes.",
      );
    }

    throw mapAsaasError(error);
  }

  if (recovered) {
    return persistRemoteSubscription(supabase, current, plan, recovered, fencing);
  }

  // Antes de criar uma nova recorrência, confirma que não existe outra linha
  // da mesma barbearia aguardando remoção remota. Isso evita duplicidade de
  // cobranças quando uma compensação anterior falhou.
  await assertNoPendingRemoteCleanup(supabase, current.barbershop_id);

  if (current.billing_type !== "boleto" && current.billing_type !== "pix") {
    throw new BillingServiceError("validation", "Escolha boleto ou Pix.");
  }

  let remote: AsaasSubscription;

  try {
    remote = await createAsaasSubscription({
      customer: customerId,
      billingType: asaasBillingType(current.billing_type),
      valueCents: plan.price_cents,
      nextDueDate: current.next_due_date ?? tomorrowDateOnly(),
      cycle: asaasCycle(plan.interval),
      description: subscriptionDescription(plan),
      externalReference: current.external_reference,
    });
  } catch (error) {
    if (isAsaasTransientError(error)) {
      try {
        const matches = await listAsaasSubscriptionsByExternalReference(
          current.external_reference,
        );

        if (matches[0]) {
          return persistRemoteSubscription(
            supabase,
            current,
            plan,
            matches[0],
            fencing,
          );
        }
      } catch {
        // Mantém a assinatura local pendente para nova tentativa.
      }

      throw new BillingServiceError(
        "pending_confirmation",
        "A assinatura foi enviada ao Asaas, mas a confirmação não chegou. Atualize a página em instantes antes de tentar novamente.",
      );
    }

    throw mapAsaasError(error);
  }

  return persistRemoteSubscription(supabase, current, plan, remote, fencing);
}

async function applyPlanToRemote(
  supabase: Supabase,
  local: SubscriptionRow,
  plan: PlanRow,
  customerId: string,
  fencing?: SubscriptionFencing,
): Promise<SubscriptionRow> {
  requireAsaasSubscription(local);
  if (!local.gateway_subscription_id) {
    return ensureRemoteSubscription(supabase, local, plan, customerId, fencing);
  }

  if (local.billing_type !== "boleto" && local.billing_type !== "pix") {
    throw new BillingServiceError("validation", "Escolha boleto ou Pix.");
  }

  await requireLegacyBillingShop(supabase, local.barbershop_id);
  try {
    const remote = await updateAsaasSubscription(local.gateway_subscription_id, {
      billingType: asaasBillingType(local.billing_type),
      valueCents: plan.price_cents,
      cycle: asaasCycle(plan.interval),
      description: subscriptionDescription(plan),
      updatePendingPayments: true,
    });

    return persistRemoteSubscription(supabase, local, plan, remote, fencing);
  } catch (error) {
    if (error instanceof AsaasError && error.kind === "not_found") {
      const base = supabase
        .from("subscriptions")
        .update({
          gateway_subscription_id: null,
          gateway_status: "pending_creation",
        })
        .eq("gateway", "asaas")
        .eq("id", local.id)
        .eq("gateway_subscription_id", local.gateway_subscription_id)
        .in("status", [...currentSubscriptionStatuses]);

      const fencedBase =
        fencing?.column === "checkout_lease_token"
          ? base.eq("checkout_lease_token", fencing.token)
          : fencing
            ? base.eq("trial_finalization_lease_token", fencing.token)
            : base;
      const { data: clearedRow, error: clearError } = await fencedBase
        .select("*")
        .maybeSingle();

      if (clearError) {
        throw new BillingServiceError(
          "gateway",
          "Não foi possível recuperar a assinatura no gateway.",
        );
      }

      if (!clearedRow) {
        const current = await findSubscriptionById(supabase, local.id);

        if (current && isTerminalStatus(current.status)) {
          throw new BillingServiceError(
            "conflict",
            "A assinatura foi cancelada ou expirou durante a recuperação.",
          );
        }

        if (fencing && current?.[fencing.column] !== fencing.token) {
          throw new BillingServiceError(
            "conflict",
            "Outra execução assumiu a contratação durante a recuperação.",
          );
        }

        throw new BillingServiceError(
          "pending_confirmation",
          "O vínculo da assinatura mudou durante a recuperação. Tente novamente em instantes.",
        );
      }

      return ensureRemoteSubscription(
        supabase,
        clearedRow,
        plan,
        customerId,
        fencing,
      );
    }

    throw mapAsaasError(error);
  }
}

async function resolveCustomerForExistingSubscription(
  supabase: Supabase,
  barbershopId: string,
): Promise<string> {
  const { data: existing, error } = await supabase
    .from("billing_customers")
    .select("*")
    .eq("gateway", "asaas")
    .eq("barbershop_id", barbershopId)
    .maybeSingle();

  if (error) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível consultar o cadastro do pagador agora.",
    );
  }

  if (!existing) {
    throw new BillingServiceError(
      "conflict",
      "O cadastro do pagador não foi encontrado. Contrate o plano novamente.",
    );
  }

  if (existing.gateway_customer_id) {
    return existing.gateway_customer_id;
  }

  return resolveBillingCustomer(supabase, {
    barbershopId,
    holderName: existing.holder_name,
    document: existing.document_digits,
    email: existing.email,
    phone: existing.phone_digits,
  });
}

function assertChargeablePlan(plan: PlanRow) {
  if (plan.price_cents <= 0) {
    throw new BillingServiceError(
      "validation",
      "Este plano não possui valor de cobrança configurado.",
    );
  }
}

/**
 * Reivindica o lease por UPDATE condicional do snapshot observado. O banco
 * decide o vencedor por status, plano, vínculo remoto e estado dos dois leases;
 * apenas o dono recebe o token e pode persistir a operação.
 */
async function claimCheckoutLease(
  supabase: Supabase,
  current: SubscriptionRow,
  payload: Database["public"]["Tables"]["subscriptions"]["Update"],
  now: Date,
): Promise<SubscriptionRow | null> {
  const staleCutoff = new Date(
    now.getTime() - staleCheckoutLockMs,
  ).toISOString();

  const buildBaseQuery = () => {
    let query = supabase
      .from("subscriptions")
      .update(payload)
      .eq("id", current.id)
      .eq("gateway", "asaas")
      .eq("status", current.status)
      .eq("plan_id", current.plan_id)
      .in("status", [...currentSubscriptionStatuses])
      .is("trial_finalization_locked_at", null)
      .is("trial_finalization_lease_token", null);

    query = current.gateway_subscription_id === null
      ? query.is("gateway_subscription_id", null)
      : query.eq("gateway_subscription_id", current.gateway_subscription_id);

    return query;
  };

  const { data: unlocked, error: unlockedError } = await buildBaseQuery()
    .is("checkout_locked_at", null)
    .is("checkout_lease_token", null)
    .select("*")
    .maybeSingle();

  if (unlockedError) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível obter o controle da alteração da assinatura. Tente novamente.",
    );
  }

  if (unlocked) {
    return unlocked;
  }

  const { data: stale, error: staleError } = await buildBaseQuery()
    .lt("checkout_locked_at", staleCutoff)
    .select("*")
    .maybeSingle();

  if (staleError) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível recuperar o controle da alteração da assinatura. Tente novamente.",
    );
  }

  return stale ?? null;
}

async function claimPaidCheckout(
  supabase: Supabase,
  current: SubscriptionRow,
  plan: PlanRow,
  billingType: BillingType,
  now: Date,
): Promise<SubscriptionRow | null> {
  const timestamp = now.toISOString();

  const payload: Database["public"]["Tables"]["subscriptions"]["Update"] = {
    plan_id: plan.id,
    billing_type: billingType,
    contracted_price_cents: plan.price_cents,
    contracted_currency: plan.currency,
    contracted_interval: plan.interval,
    next_due_date: current.next_due_date ?? tomorrowDateOnly(),
    checkout_locked_at: timestamp,
    checkout_lease_token: randomUUID(),
    checkout_attempted_at: timestamp,
    checkout_attempts: (current.checkout_attempts ?? 0) + 1,
    checkout_error: null,
  };

  return claimCheckoutLease(supabase, current, payload, now);
}

async function claimPlanChangeLease(
  supabase: Supabase,
  current: SubscriptionRow,
  now: Date,
): Promise<SubscriptionRow | null> {
  const payload: Database["public"]["Tables"]["subscriptions"]["Update"] = {
    checkout_locked_at: now.toISOString(),
    checkout_lease_token: randomUUID(),
  };

  return claimCheckoutLease(supabase, current, payload, now);
}

async function releaseCheckoutLease(
  supabase: Supabase,
  subscriptionId: string,
  fencing: SubscriptionFencing,
  error?: unknown,
): Promise<boolean> {
  const payload: Database["public"]["Tables"]["subscriptions"]["Update"] = {
    [fencing.column === "checkout_lease_token"
      ? "checkout_locked_at"
      : "trial_finalization_locked_at"]: null,
    [fencing.column]: null,
  };

  if (error !== undefined && fencing.column === "checkout_lease_token") {
    payload.checkout_error = failureMessage(error);
  }

  let query = supabase
    .from("subscriptions")
    .update(payload)
    .eq("id", subscriptionId)
    .in("status", [...currentSubscriptionStatuses]);

  query = fencing.column === "checkout_lease_token"
    ? query.eq("checkout_lease_token", fencing.token)
    : query.eq("trial_finalization_lease_token", fencing.token);

  const { data, error: updateError } = await query
    .select("id")
    .maybeSingle();

  return !updateError && Boolean(data);
}

async function throwCheckoutClaimConflict(
  supabase: Supabase,
  subscriptionId: string,
): Promise<never> {
  const current = await findSubscriptionById(supabase, subscriptionId);

  if (!current || isTerminalStatus(current.status)) {
    throw new BillingServiceError(
      "conflict",
      "A contratação foi encerrada por outra operação. Atualize a página para continuar.",
    );
  }

  if (current.status !== "pending") {
    throw new BillingServiceError(
      "conflict",
      "Esta barbearia já possui uma assinatura. Use a troca de plano ou o cancelamento.",
    );
  }

  throw new BillingServiceError(
    "conflict",
    "Já existe uma contratação em andamento para esta barbearia. Atualize a página para continuar.",
  );
}

export async function startSubscription(input: {
  barbershopId: string;
  planId: string;
  billingType: BillingType;
  holderName: string;
  document: string;
  email?: string | null;
  phone?: string | null;
}): Promise<{ message: string; trialEndsAt?: string }> {
  const supabase = createAdminClient();
  await requireLegacyBillingShop(supabase, input.barbershopId);
  const plan = await findActivePlan(supabase, input.planId);

  assertChargeablePlan(plan);

  if (input.billingType !== "boleto" && input.billingType !== "pix") {
    throw new BillingServiceError("validation", "Escolha boleto ou Pix.");
  }

  await assertNoPendingRemoteCleanup(supabase, input.barbershopId);

  const current = await findCurrentSubscription(supabase, input.barbershopId);

  if (current && current.status !== "pending") {
    throw new BillingServiceError(
      "conflict",
      "Esta barbearia já possui uma assinatura. Use a troca de plano ou o cancelamento.",
    );
  }

  const history = await listSubscriptionHistory(
    supabase,
    input.barbershopId,
  );
  const hasTrialHistory = history.some((row) => row.trial_ends_at !== null);
  const canStartTrial = plan.trial_days > 0 && !hasTrialHistory;

  if (canStartTrial) {
    if (current) {
      throw new BillingServiceError(
        "conflict",
        "Já existe uma contratação em andamento para esta barbearia.",
      );
    }

    // O trial é totalmente local nesta etapa. Nenhum cliente, assinatura ou
    // cobrança é criado no Asaas antes do encerramento dos dias gratuitos.
    await saveLocalBillingCustomer(supabase, input);

    const startedAt = new Date();
    const trialEndsAt = addDays(startedAt, plan.trial_days);

    const { data, error } = await supabase
      .from("subscriptions")
      .insert({
        barbershop_id: input.barbershopId,
        plan_id: plan.id,
        status: "trialing",
        current_period_start: startedAt.toISOString(),
        current_period_end: trialEndsAt.toISOString(),
        trial_started_at: startedAt.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        contracted_price_cents: plan.price_cents,
        contracted_currency: plan.currency,
        contracted_interval: plan.interval,
        cancel_at_period_end: false,
        gateway: "asaas",
        gateway_subscription_id: null,
        billing_type: input.billingType,
        gateway_status: "pending_creation",
        external_reference: randomUUID(),
        next_due_date: dateOnlyInSaoPaulo(trialEndsAt),
      })
      .select("*")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        throw new BillingServiceError(
          "conflict",
          "Já existe um teste gratuito ou uma contratação em andamento. Atualize a página para continuar.",
        );
      }

      throw new BillingServiceError(
        "gateway",
        "Não foi possível iniciar o teste gratuito agora.",
      );
    }

    return {
      message: `Teste gratuito de ${plan.trial_days} dias iniciado. Nenhuma cobrança será feita antes de ${trialEndLabel(trialEndsAt)}.`,
      trialEndsAt: trialEndsAt.toISOString(),
    };
  }

  if (
    current?.trial_ends_at &&
    (!current.trial_finalized_at || !current.gateway_subscription_id)
  ) {
    throw new BillingServiceError(
      "conflict",
      "O período de teste terminou e a primeira cobrança está sendo preparada. Tente novamente em instantes.",
    );
  }

  let local: SubscriptionRow | null = null;
  let checkoutFencing: SubscriptionFencing | null = null;

  // Toda alteração de uma assinatura pending reivindica a linha antes de
  // qualquer chamada ao Asaas. Isso inclui retomada de checkout e assinatura
  // originada de trial já finalizado; trials ainda em finalização foram
  // recusados acima e mantêm seu lease independente.
  if (current) {
    const now = new Date();
    local = await claimPaidCheckout(
      supabase,
      current,
      plan,
      input.billingType,
      now,
    );

    if (!local) {
      return throwCheckoutClaimConflict(supabase, current.id);
    }

    if (!local.checkout_lease_token) {
      throw new BillingServiceError(
        "gateway",
        "Não foi possível confirmar o controle de contratação. Tente novamente.",
      );
    }

    checkoutFencing = {
      column: "checkout_lease_token",
      token: local.checkout_lease_token,
    };
  }

  try {
    // Revalida após o claim. A leitura inicial evita trabalho desnecessário; o
    // lease condicional impede corrida com outro checkout e protege o worker.
    await assertNoPendingRemoteCleanup(supabase, input.barbershopId);
    const customerId = await resolveBillingCustomer(supabase, input);

    if (!local) {
      if (current) {
        // Defesa adicional para qualquer caminho futuro que chegue aqui com
        // uma linha existente: nunca atualiza a assinatura sem primeiro
        // adquirir o lease e propagar o token até a persistência remota.
        const claimed = await claimPaidCheckout(
          supabase,
          current,
          plan,
          input.billingType,
          new Date(),
        );

        if (!claimed?.checkout_lease_token) {
          return throwCheckoutClaimConflict(supabase, current.id);
        }

        local = claimed;
        checkoutFencing = {
          column: "checkout_lease_token",
          token: claimed.checkout_lease_token,
        };
      } else {
        const lockTimestamp = new Date().toISOString();
        const leaseToken = randomUUID();

        const { data, error } = await supabase
          .from("subscriptions")
          .insert({
            barbershop_id: input.barbershopId,
            plan_id: plan.id,
            status: "pending",
            billing_type: input.billingType,
            trial_started_at: null,
            trial_ends_at: null,
            contracted_price_cents: plan.price_cents,
            contracted_currency: plan.currency,
            contracted_interval: plan.interval,
            gateway: "asaas",
            gateway_subscription_id: null,
            gateway_status: "pending_creation",
            external_reference: randomUUID(),
            next_due_date: tomorrowDateOnly(),
            checkout_locked_at: lockTimestamp,
            checkout_lease_token: leaseToken,
            checkout_attempted_at: lockTimestamp,
            checkout_attempts: 1,
            checkout_error: null,
          })
          .select("*")
          .single();

        if (error || !data) {
          if (error?.code === "23505") {
            // Outra execução inseriu a contratação primeiro. Não chamar o
            // Asaas é parte da garantia: a vaga já está ocupada.
            throw new BillingServiceError(
              "conflict",
              "Já existe uma contratação em andamento. Atualize a página para continuar.",
            );
          }

          throw new BillingServiceError(
            "gateway",
            "Não foi possível iniciar a contratação agora.",
          );
        }

        local = data;
        checkoutFencing = {
          column: "checkout_lease_token",
          token: leaseToken,
        };
      }
    }

    await applyPlanToRemote(
      supabase,
      local,
      plan,
      customerId,
      checkoutFencing ?? undefined,
    );

    if (checkoutFencing) {
      const released = await releaseCheckoutLease(
        supabase,
        local.id,
        checkoutFencing,
      );

      if (!released) {
        throw new BillingServiceError(
          "pending_confirmation",
          "A assinatura foi criada, mas o controle de contratação não foi liberado. Atualize a página em instantes.",
        );
      }
    }

    return {
      message:
        plan.trial_days > 0 && hasTrialHistory
          ? "O período de teste desta barbearia já foi utilizado. Assinatura criada; o plano será ativado após a confirmação do primeiro pagamento."
          : "Assinatura criada. O plano será ativado após a confirmação do primeiro pagamento.",
    };
  } catch (error) {
    if (checkoutFencing && local) {
      await releaseCheckoutLease(supabase, local.id, checkoutFencing, error);
    }

    throw error;
  }
}

export async function changePlan(input: {
  barbershopId: string;
  planId: string;
}): Promise<{ message: string }> {
  const supabase = createAdminClient();
  await requireLegacyBillingShop(supabase, input.barbershopId);
  const plan = await findActivePlan(supabase, input.planId);

  assertChargeablePlan(plan);

  const current = await findCurrentSubscription(supabase, input.barbershopId);

  if (!current) {
    throw new BillingServiceError(
      "not_found",
      "Não há assinatura ativa ou pendente para alterar.",
    );
  }

  if (current.plan_id === plan.id) {
    throw new BillingServiceError(
      "validation",
      "Este já é o plano atual da assinatura.",
    );
  }

  await assertNoPendingRemoteCleanup(supabase, input.barbershopId);

  if (
    current.status === "trialing" &&
    !current.gateway_subscription_id
  ) {
    // Durante o trial a troca é apenas local: não cria assinatura nem cobrança
    // no Asaas. O valor contratado é atualizado para a primeira fatura futura.
    const { data: updated, error } = await supabase
      .from("subscriptions")
      .update({
        plan_id: plan.id,
        contracted_price_cents: plan.price_cents,
        contracted_currency: plan.currency,
        contracted_interval: plan.interval,
      })
      .eq("id", current.id)
      .eq("gateway", "asaas")
      .eq("status", "trialing")
      .is("gateway_subscription_id", null)
      .is("trial_finalization_locked_at", null)
      .is("trial_finalization_lease_token", null)
      .is("checkout_locked_at", null)
      .is("checkout_lease_token", null)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new BillingServiceError(
        "gateway",
        "Não foi possível alterar o plano do teste gratuito.",
      );
    }

    if (!updated) {
      throw new BillingServiceError(
        "conflict",
        "O teste gratuito foi encerrado ou está sendo finalizado. Atualize a página e tente novamente.",
      );
    }

    return {
      message:
        "Plano do teste gratuito alterado. O novo valor será usado somente na primeira cobrança após o período gratuito.",
    };
  }

  if (current.trial_ends_at && !current.trial_finalized_at) {
    throw new BillingServiceError(
      "conflict",
      "O período de teste terminou e a primeira cobrança está sendo preparada. Tente novamente em instantes.",
    );
  }

  if (
    current.trial_finalization_locked_at ||
    current.trial_finalization_lease_token
  ) {
    throw new BillingServiceError(
      "conflict",
      "A finalização do teste gratuito ainda está em andamento. Tente novamente em instantes.",
    );
  }

  // A outbox é consultada novamente após o claim para reduzir a janela entre
  // a validação inicial e a chamada remota.
  const claimed = await claimPlanChangeLease(supabase, current, new Date());

  if (!claimed?.checkout_lease_token) {
    throw new BillingServiceError(
      "conflict",
      "A assinatura está sendo processada por outra operação. Atualize a página e tente novamente.",
    );
  }

  const fencing: SubscriptionFencing = {
    column: "checkout_lease_token",
    token: claimed.checkout_lease_token,
  };

  try {
    await assertNoPendingRemoteCleanup(supabase, input.barbershopId);
    const customerId = await resolveCustomerForExistingSubscription(
      supabase,
      input.barbershopId,
    );

    await applyPlanToRemote(supabase, claimed, plan, customerId, fencing);
  } catch (error) {
    await releaseCheckoutLease(supabase, claimed.id, fencing, error);
    throw error;
  }

  const released = await releaseCheckoutLease(supabase, claimed.id, fencing);

  if (!released) {
    throw new BillingServiceError(
      "pending_confirmation",
      "O plano foi enviado, mas o controle da alteração não pôde ser liberado. Atualize a página em instantes.",
    );
  }

  return {
    message:
      "Plano alterado. As próximas cobranças já usam o novo valor; o pagamento pendente também será atualizado.",
  };
}

export async function cancelSubscription(input: {
  barbershopId: string;
  reason?: string | null;
}): Promise<{ message: string }> {
  const supabase = createAdminClient();
  await requireLegacyBillingShop(supabase, input.barbershopId);
  const cancelReason = normalizeCancelReason(input.reason);
  let current = await findCurrentSubscription(supabase, input.barbershopId);

  if (!current) {
    throw new BillingServiceError(
      "not_found",
      "Não há assinatura ativa ou pendente para cancelar.",
    );
  }

  if (current.status === "trialing" && !current.gateway_subscription_id) {
    // O trial é local: não existe assinatura remota para remover. A transição
    // condicional disputa o mesmo estado com a rotina de finalização. Se a
    // rotina reivindicar o registro primeiro, este fluxo relê o estado e
    // segue pelo cancelamento remoto em vez de deixar uma cobrança órfã.
    const { data: canceled, error } = await supabase
      .from("subscriptions")
      .update({
        status: "canceled",
        gateway_status: "inactive",
        cancel_at_period_end: false,
        canceled_at: new Date().toISOString(),
        cancel_reason: cancelReason,
        trial_finalization_locked_at: null,
        trial_finalization_lease_token: null,
      })
      .eq("id", current.id)
      .eq("gateway", "asaas")
      .eq("status", "trialing")
      .is("gateway_subscription_id", null)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new BillingServiceError(
        "gateway",
        "Não foi possível cancelar o teste gratuito no banco. Tente novamente.",
      );
    }

    if (canceled) {
      const { error: paymentsError } = await supabase
        .from("payments")
        .update({ status: "cancelled" })
        .eq("subscription_id", current.id)
        .in("status", ["pending", "overdue"]);

      if (paymentsError) {
        throw new BillingServiceError(
          "gateway",
          "O teste foi cancelado, mas não foi possível atualizar as cobranças locais. Tente novamente.",
        );
      }

      return {
        message:
          "Teste gratuito cancelado. Nenhuma cobrança foi criada no Asaas.",
      };
    }

    const { data: refreshed, error: refreshError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", current.id)
      .eq("gateway", "asaas")
      .maybeSingle();

    if (refreshError || !refreshed) {
      throw new BillingServiceError(
        "gateway",
        "Não foi possível confirmar o estado do teste gratuito. Tente novamente.",
      );
    }

    if (
      refreshed.status === "canceled" &&
      !refreshed.gateway_subscription_id
    ) {
      // Outra aba/execução pode ter vencido a corrida. Preserva o motivo já
      // gravado e registra o motivo desta tentativa apenas se ainda estiver
      // vazio, sem reabrir a assinatura cancelada.
      if (cancelReason && !refreshed.cancel_reason) {
        const { error: reasonError } = await supabase
          .from("subscriptions")
          .update({ cancel_reason: cancelReason })
          .eq("id", current.id)
          .eq("gateway", "asaas")
          .is("cancel_reason", null);

        if (reasonError) {
          throw new BillingServiceError(
            "gateway",
            "O teste foi cancelado, mas não foi possível registrar o motivo. Tente novamente.",
          );
        }
      }

      const { error: paymentsError } = await supabase
        .from("payments")
        .update({ status: "cancelled" })
        .eq("subscription_id", current.id)
        .in("status", ["pending", "overdue"]);

      if (paymentsError) {
        throw new BillingServiceError(
          "gateway",
          "O teste foi cancelado, mas não foi possível atualizar as cobranças locais. Tente novamente.",
        );
      }

      return {
        message:
          "Teste gratuito cancelado. Nenhuma cobrança foi criada no Asaas.",
      };
    }

    if (
      refreshed.status === "trialing" &&
      !refreshed.gateway_subscription_id
    ) {
      throw new BillingServiceError(
        "conflict",
        "O teste gratuito foi alterado por outra operação. Atualize a página e tente novamente.",
      );
    }

    if (
      refreshed.status === "pending" &&
      !refreshed.gateway_subscription_id &&
      isFreshLock(refreshed.trial_finalization_locked_at)
    ) {
      throw new BillingServiceError(
        "conflict",
        "A primeira cobrança está sendo preparada no Asaas. Aguarde alguns instantes e tente novamente.",
      );
    }

    requireAsaasSubscription(refreshed);
    current = refreshed;
  }

  if (
    current.trial_ends_at &&
    !current.gateway_subscription_id &&
    isFreshLock(current.trial_finalization_locked_at)
  ) {
    throw new BillingServiceError(
      "conflict",
      "A primeira cobrança está sendo preparada no Asaas. Aguarde alguns instantes e tente novamente.",
    );
  }

  // A intenção de compensação é persistida na MESMA transação da transição
  // local. A RPC faz lock da assinatura, grava o job durável, invalida o
  // token/lease de checkout e atualiza remote_cleanup_pending. Se a chamada
  // falhar, nada é considerado cancelado.
  const { data: cancelData, error: cancelError } = await supabase.rpc(
    "cancel_subscription_with_cleanup",
    {
      p_subscription_id: current.id,
      p_barbershop_id: input.barbershopId,
      p_cancel_reason: cancelReason,
    },
  );

  if (cancelError) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível cancelar a assinatura no banco. Tente novamente.",
    );
  }

  const canceled = parseCancelWithCleanupResult(cancelData);

  if (!canceled) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível confirmar o cancelamento da assinatura. Tente novamente.",
    );
  }

  const { error: paymentsError } = await supabase
    .from("payments")
    .update({ status: "cancelled" })
    .eq("subscription_id", canceled.subscriptionId)
    .in("status", ["pending", "overdue"]);

  // O processamento síncrono é apenas uma resposta rápida. A outbox já
  // garante que o job será retomado mesmo se esta tentativa falhar.
  let jobStatus: string | null = null;

  if (canceled.jobId) {
    try {
      await processRemoteCleanupJobs({
        jobIds: [canceled.jobId],
        limit: 1,
        supabase,
      });
    } catch {
      // A fonte durável permanece intacta para a próxima execução.
    }

    try {
      const { data: job } = await supabase
        .from("billing_remote_cleanup_jobs")
        .select("status")
        .eq("id", canceled.jobId)
        .maybeSingle();

      jobStatus = job?.status ?? null;
    } catch {
      jobStatus = null;
    }
  }

  if (paymentsError) {
    throw new BillingServiceError(
      "gateway",
      "A assinatura foi cancelada, mas não foi possível atualizar as cobranças locais. Tente novamente.",
    );
  }

  if (canceled.jobId && jobStatus !== "completed") {
    if (jobStatus === "manual_review") {
      return {
        message:
          "Assinatura cancelada. A remoção da recorrência no Asaas precisa de revisão manual e novas contratações permanecem bloqueadas até a conclusão.",
      };
    }

    return {
      message:
        "Assinatura cancelada. A remoção da recorrência no Asaas foi registrada e será confirmada automaticamente; novas contratações ficam bloqueadas até a conclusão.",
    };
  }

  return {
    message:
      "Assinatura cancelada. Novas cobranças não serão geradas e as cobranças pendentes foram removidas pelo Asaas.",
  };
}
