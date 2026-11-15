import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AsaasError,
  createAsaasCustomer,
  createAsaasSubscription,
  deleteAsaasSubscription,
  findAsaasCustomerByDocument,
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
  onlyDigits,
  personTypeFromDocument,
  type BillingType,
} from "@/lib/validation/billing";

type Supabase = SupabaseClient<Database>;
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type PlanRow = Database["public"]["Tables"]["plans"]["Row"];

const currentSubscriptionStatuses = [
  "pending",
  "trialing",
  "active",
  "past_due",
] as const;

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

async function persistRemoteSubscription(
  supabase: Supabase,
  local: SubscriptionRow,
  plan: PlanRow,
  remote: AsaasSubscription,
): Promise<SubscriptionRow> {
  const gatewayStatus =
    mapGatewayStatus(remote.status) ??
    (local.gateway_status === "pending_creation"
      ? "active"
      : local.gateway_status);

  const { data, error } = await supabase
    .from("subscriptions")
    .update({
      plan_id: plan.id,
      billing_type: local.billing_type,
      contracted_price_cents: plan.price_cents,
      contracted_currency: plan.currency,
      contracted_interval: plan.interval,
      gateway: "asaas",
      gateway_subscription_id: remote.id,
      gateway_status: gatewayStatus,
      next_due_date: normalizedDate(remote.nextDueDate) ?? local.next_due_date,
    })
    .eq("id", local.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new BillingServiceError(
      "gateway",
      "Não foi possível salvar a assinatura no banco.",
    );
  }

  return data;
}

export async function ensureRemoteSubscription(
  supabase: Supabase,
  local: SubscriptionRow,
  plan: PlanRow,
  customerId: string,
): Promise<SubscriptionRow> {
  if (local.gateway_subscription_id) {
    return local;
  }

  let recovered: AsaasSubscription | null = null;

  try {
    const matches = await listAsaasSubscriptionsByExternalReference(
      local.external_reference,
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
    return persistRemoteSubscription(supabase, local, plan, recovered);
  }

  if (local.billing_type !== "boleto" && local.billing_type !== "pix") {
    throw new BillingServiceError("validation", "Escolha boleto ou Pix.");
  }

  let remote: AsaasSubscription;

  try {
    remote = await createAsaasSubscription({
      customer: customerId,
      billingType: asaasBillingType(local.billing_type),
      valueCents: plan.price_cents,
      nextDueDate: local.next_due_date ?? tomorrowDateOnly(),
      cycle: asaasCycle(plan.interval),
      description: subscriptionDescription(plan),
      externalReference: local.external_reference,
    });
  } catch (error) {
    if (isAsaasTransientError(error)) {
      try {
        const matches = await listAsaasSubscriptionsByExternalReference(
          local.external_reference,
        );

        if (matches[0]) {
          return persistRemoteSubscription(supabase, local, plan, matches[0]);
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

  return persistRemoteSubscription(supabase, local, plan, remote);
}

async function applyPlanToRemote(
  supabase: Supabase,
  local: SubscriptionRow,
  plan: PlanRow,
  customerId: string,
): Promise<SubscriptionRow> {
  if (!local.gateway_subscription_id) {
    return ensureRemoteSubscription(supabase, local, plan, customerId);
  }

  if (local.billing_type !== "boleto" && local.billing_type !== "pix") {
    throw new BillingServiceError("validation", "Escolha boleto ou Pix.");
  }

  try {
    const remote = await updateAsaasSubscription(local.gateway_subscription_id, {
      billingType: asaasBillingType(local.billing_type),
      valueCents: plan.price_cents,
      cycle: asaasCycle(plan.interval),
      description: subscriptionDescription(plan),
      updatePendingPayments: true,
    });

    return persistRemoteSubscription(supabase, local, plan, remote);
  } catch (error) {
    if (error instanceof AsaasError && error.kind === "not_found") {
      const cleared: SubscriptionRow = {
        ...local,
        gateway_subscription_id: null,
        gateway_status: "pending_creation",
      };

      const { error: clearError } = await supabase
        .from("subscriptions")
        .update({
          gateway_subscription_id: null,
          gateway_status: "pending_creation",
        })
        .eq("id", local.id);

      if (clearError) {
        throw new BillingServiceError(
          "gateway",
          "Não foi possível recuperar a assinatura no gateway.",
        );
      }

      return ensureRemoteSubscription(supabase, cleared, plan, customerId);
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
  const plan = await findActivePlan(supabase, input.planId);

  assertChargeablePlan(plan);

  if (input.billingType !== "boleto" && input.billingType !== "pix") {
    throw new BillingServiceError("validation", "Escolha boleto ou Pix.");
  }

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
    current &&
    current.trial_ends_at &&
    !current.gateway_subscription_id
  ) {
    throw new BillingServiceError(
      "conflict",
      "O período de teste terminou e a primeira cobrança está sendo preparada. Tente novamente em instantes.",
    );
  }

  const customerId = await resolveBillingCustomer(supabase, input);

  let local: SubscriptionRow;

  if (current) {
    const { data, error } = await supabase
      .from("subscriptions")
      .update({
        plan_id: plan.id,
        billing_type: input.billingType,
        contracted_price_cents: plan.price_cents,
        contracted_currency: plan.currency,
        contracted_interval: plan.interval,
        next_due_date: current.next_due_date ?? tomorrowDateOnly(),
      })
      .eq("id", current.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new BillingServiceError(
        "gateway",
        "Não foi possível atualizar a contratação em andamento.",
      );
    }

    local = data;
  } else {
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
        gateway_status: "pending_creation",
        external_reference: randomUUID(),
        next_due_date: tomorrowDateOnly(),
      })
      .select("*")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
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
  }

  await applyPlanToRemote(supabase, local, plan, customerId);

  return {
    message:
      plan.trial_days > 0 && hasTrialHistory
        ? "O período de teste desta barbearia já foi utilizado. Assinatura criada; o plano será ativado após a confirmação do primeiro pagamento."
        : "Assinatura criada. O plano será ativado após a confirmação do primeiro pagamento.",
  };
}

export async function changePlan(input: {
  barbershopId: string;
  planId: string;
}): Promise<{ message: string }> {
  const supabase = createAdminClient();
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
      .eq("status", "trialing")
      .is("gateway_subscription_id", null)
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

  if (current.trial_ends_at && !current.gateway_subscription_id) {
    throw new BillingServiceError(
      "conflict",
      "O período de teste terminou e a primeira cobrança está sendo preparada. Tente novamente em instantes.",
    );
  }

  const customerId = await resolveCustomerForExistingSubscription(
    supabase,
    input.barbershopId,
  );

  await applyPlanToRemote(supabase, current, plan, customerId);

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
      })
      .eq("id", current.id)
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

  let remoteId = current.gateway_subscription_id;

  if (!remoteId) {
    try {
      const matches = await listAsaasSubscriptionsByExternalReference(
        current.external_reference,
      );
      remoteId = matches[0]?.id ?? null;
    } catch (error) {
      if (isAsaasTransientError(error)) {
        throw new BillingServiceError(
          "pending_confirmation",
          "Não foi possível confirmar o cancelamento no Asaas. Tente novamente em instantes.",
        );
      }

      throw mapAsaasError(error);
    }
  }

  if (remoteId) {
    try {
      await deleteAsaasSubscription(remoteId);
    } catch (error) {
      if (!(error instanceof AsaasError && error.kind === "not_found")) {
        throw mapAsaasError(error);
      }
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
      "O cancelamento foi enviado ao Asaas, mas não foi possível atualizar as cobranças locais. Tente novamente.",
    );
  }

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      gateway_status: "inactive",
      cancel_at_period_end: false,
      canceled_at: new Date().toISOString(),
      cancel_reason: cancelReason,
    })
    .eq("id", current.id);

  if (error) {
    throw new BillingServiceError(
      "gateway",
      "O cancelamento foi enviado ao Asaas, mas não foi possível atualizar o banco. Tente novamente.",
    );
  }

  return {
    message:
      "Assinatura cancelada. Novas cobranças não serão geradas e as cobranças pendentes foram removidas pelo Asaas.",
  };
}
