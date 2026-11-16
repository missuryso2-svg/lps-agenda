import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AsaasWebhookEvent,
  AsaasWebhookPayment,
  AsaasWebhookSubscription,
} from "@/lib/asaas/webhook";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type PaymentStatus = Database["public"]["Enums"]["payment_status"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export type BillingWebhookOutcome = "processed" | "ignored";

export class BillingWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingWebhookError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const processablePaymentEvents = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_AWAITING_RISK_ANALYSIS",
  "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_AUTHORIZED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_ANTICIPATED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "PAYMENT_DUNNING_RECEIVED",
]);

const processableSubscriptionEvents = new Set([
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_UPDATED",
  "SUBSCRIPTION_INACTIVATED",
  "SUBSCRIPTION_DELETED",
]);

// Somente estes eventos podem confirmar o pagamento e ativar o plano. Eventos
// genéricos como PAYMENT_UPDATED podem carregar status "pago" no objeto de
// pagamento, mas não são confirmação financeira suficiente para ativar.
const paymentConfirmationEvents = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
]);

const mutableSubscriptionStatuses = [
  "pending",
  "trialing",
  "active",
  "past_due",
] as const;

function toCents(value: number): number | null {
  const cents = Math.round(value * 100);

  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 100_000_000
    ? cents
    : null;
}

function normalizedDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toTimestamp(value: string | null | undefined): string | null {
  const date = normalizedDate(value);

  if (!date) {
    return null;
  }

  const parsed = new Date(`${date}T12:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function addInterval(
  dateOnly: string,
  interval: "month" | "year",
): string | null {
  const date = new Date(`${dateOnly}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (interval === "year") {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  } else {
    date.setUTCMonth(date.getUTCMonth() + 1);
  }

  return date.toISOString();
}

function statusFromAsaasPayment(status: string): PaymentStatus | null {
  switch (status.toUpperCase()) {
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
    case "AUTHORIZED":
    case "APPROVED_BY_RISK_ANALYSIS":
      return "pending";
    case "CONFIRMED":
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
    case "DUNNING_RECEIVED":
      return "paid";
    case "OVERDUE":
      return "overdue";
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
    case "REFUND_IN_PROGRESS":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "refunded";
    case "DELETED":
      return "cancelled";
    case "FAILED":
    case "REPROVED_BY_RISK_ANALYSIS":
    case "CREDIT_CARD_CAPTURE_REFUSED":
      return "failed";
    default:
      return null;
  }
}

function statusFromEvent(event: string): PaymentStatus | null {
  switch (event) {
    case "PAYMENT_CREATED":
    case "PAYMENT_UPDATED":
    case "PAYMENT_RESTORED":
    case "PAYMENT_AWAITING_RISK_ANALYSIS":
    case "PAYMENT_APPROVED_BY_RISK_ANALYSIS":
    case "PAYMENT_AUTHORIZED":
      return "pending";
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
    case "PAYMENT_DUNNING_RECEIVED":
      return "paid";
    case "PAYMENT_OVERDUE":
      return "overdue";
    case "PAYMENT_REFUNDED":
    case "PAYMENT_PARTIALLY_REFUNDED":
    case "PAYMENT_REFUND_IN_PROGRESS":
    case "PAYMENT_RECEIVED_IN_CASH_UNDONE":
    case "PAYMENT_CHARGEBACK_REQUESTED":
    case "PAYMENT_CHARGEBACK_DISPUTE":
    case "PAYMENT_AWAITING_CHARGEBACK_REVERSAL":
      return "refunded";
    case "PAYMENT_DELETED":
      return "cancelled";
    case "PAYMENT_REPROVED_BY_RISK_ANALYSIS":
    case "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED":
      return "failed";
    default:
      return null;
  }
}

function canConfirmPayment(
  event: string,
  payment: AsaasWebhookPayment,
): boolean {
  return (
    paymentConfirmationEvents.has(event) &&
    payment.status.toUpperCase() !== "RECEIVED_IN_CASH"
  );
}

function methodFromBillingType(
  billingType: string | null | undefined,
): PaymentMethod | null {
  switch (billingType?.toUpperCase()) {
    case "BOLETO":
      return "boleto";
    case "PIX":
      return "pix";
    case "CREDIT_CARD":
      return "credit_card";
    case "DEBIT_CARD":
      return "debit_card";
    case "TRANSFER":
      return "bank_transfer";
    case "RECEIVED_IN_CASH":
      return "cash";
    case "DEPOSIT":
      return "other";
    default:
      return null;
  }
}

async function findLocalSubscriptionForPayment(
  supabase: Supabase,
  payment: AsaasWebhookPayment,
): Promise<SubscriptionRow | null> {
  if (payment.subscription) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("gateway", "asaas")
      .eq("gateway_subscription_id", payment.subscription)
      .maybeSingle();

    if (error) {
      throw new BillingWebhookError(
        "Não foi possível consultar a assinatura do pagamento.",
      );
    }

    if (data) {
      return data;
    }
  }

  const externalReference = payment.externalReference;

  if (externalReference && uuidPattern.test(externalReference)) {
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("external_reference", externalReference)
      .maybeSingle();

    return data ?? null;
  }

  return null;
}

async function findLocalSubscriptionForEvent(
  supabase: Supabase,
  subscription: AsaasWebhookSubscription,
): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("gateway", "asaas")
    .eq("gateway_subscription_id", subscription.id)
    .maybeSingle();

  if (error) {
    throw new BillingWebhookError(
      "Não foi possível consultar a assinatura do evento.",
    );
  }

  if (data) {
    return data;
  }

  const externalReference = subscription.externalReference;

  if (externalReference && uuidPattern.test(externalReference)) {
    const { data: byReference } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("external_reference", externalReference)
      .maybeSingle();

    return byReference ?? null;
  }

  return null;
}

function paymentMetadata(event: string, payment: AsaasWebhookPayment) {
  const metadata: Record<string, string | number> = {
    asaas_event: event,
    asaas_status: payment.status,
  };

  if (payment.netValue !== undefined) {
    metadata.net_value_cents = Math.round(payment.netValue * 100);
  }

  return metadata;
}

async function upsertPayment(
  supabase: Supabase,
  event: string,
  subscription: SubscriptionRow,
  payment: AsaasWebhookPayment,
  canConfirm: boolean,
): Promise<{ nextStatus: PaymentStatus; row: PaymentRow }> {
  const amountCents = toCents(payment.value);

  if (amountCents === null || amountCents <= 0) {
    throw new BillingWebhookError("O evento trouxe um valor de pagamento inválido.");
  }

  const paymentStatus = statusFromAsaasPayment(payment.status);
  const eventStatus = statusFromEvent(event);

  const { data: existing, error } = await supabase
    .from("payments")
    .select("*")
    .eq("gateway", "asaas")
    .eq("gateway_payment_id", payment.id)
    .maybeSingle();

  if (error) {
    throw new BillingWebhookError(
      "Não foi possível consultar o pagamento do evento.",
    );
  }

  let nextStatus = paymentStatus ?? eventStatus ?? "pending";

  if (nextStatus === "paid" && !canConfirm) {
    // Preserva estornos, cancelamentos e atrasos do próprio evento. Para os
    // demais casos, mantém o estado existente e nunca promove a pago fora dos
    // eventos de confirmação.
    nextStatus =
      eventStatus &&
      eventStatus !== "paid" &&
      eventStatus !== "pending"
        ? eventStatus
        : (existing?.status ?? "pending");
  }

  const dueDate = normalizedDate(payment.dueDate);
  const paidAt =
    nextStatus === "paid"
      ? (toTimestamp(
          payment.confirmedDate ??
            payment.paymentDate ??
            payment.clientPaymentDate,
        ) ??
        existing?.paid_at ??
        new Date().toISOString())
      : (existing?.paid_at ?? null);

  if (existing) {
    let finalStatus = nextStatus;

    // Eventos at-least-once podem chegar fora de ordem. Nunca rebaixa um
    // pagamento já confirmado/estornado para pendente/vencido por atraso.
    if (
      (nextStatus === "pending" ||
        nextStatus === "overdue" ||
        nextStatus === "failed") &&
      (existing.status === "paid" || existing.status === "refunded")
    ) {
      finalStatus = existing.status;
    }

    if (
      existing.status === "cancelled" &&
      (nextStatus === "pending" ||
        nextStatus === "overdue" ||
        nextStatus === "failed") &&
      event !== "PAYMENT_RESTORED"
    ) {
      finalStatus = existing.status;
    }

    if (nextStatus === "cancelled" && existing.status === "paid") {
      finalStatus = existing.status;
    }

    const { data: updated, error: updateError } = await supabase
      .from("payments")
      .update({
        amount_cents:
          finalStatus === "paid" || finalStatus === "refunded"
            ? existing.amount_cents
            : amountCents,
        status: finalStatus,
        method: methodFromBillingType(payment.billingType) ?? existing.method,
        due_date: dueDate ?? existing.due_date,
        paid_at: paidAt,
        invoice_url: payment.invoiceUrl ?? existing.invoice_url,
        metadata: paymentMetadata(event, payment),
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new BillingWebhookError(
        "Não foi possível atualizar o pagamento do evento.",
      );
    }

    return { nextStatus: finalStatus, row: updated };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("payments")
    .insert({
      barbershop_id: subscription.barbershop_id,
      subscription_id: subscription.id,
      appointment_id: null,
      amount_cents: amountCents,
      status: nextStatus,
      method: methodFromBillingType(payment.billingType),
      scope: "platform_subscription",
      due_date: dueDate,
      paid_at: paidAt,
      gateway: "asaas",
      gateway_payment_id: payment.id,
      invoice_url: payment.invoiceUrl ?? null,
      metadata: paymentMetadata(event, payment),
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      throw new BillingWebhookError(
        "O pagamento já está sendo processado por outro evento.",
      );
    }

    throw new BillingWebhookError(
      "Não foi possível registrar o pagamento do evento.",
    );
  }

  return { nextStatus, row: inserted };
}

async function hasLaterPaidPayment(
  supabase: Supabase,
  subscriptionId: string,
  dueDate: string | null,
): Promise<boolean> {
  if (!dueDate) {
    return false;
  }

  const { data, error } = await supabase
    .from("payments")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .eq("status", "paid")
    .gte("due_date", dueDate)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new BillingWebhookError(
      "Não foi possível verificar pagamentos posteriores da assinatura.",
    );
  }

  return Boolean(data);
}

async function syncSubscriptionFromPayment(
  supabase: Supabase,
  subscription: SubscriptionRow,
  payment: AsaasWebhookPayment,
  status: PaymentStatus,
  canConfirm: boolean,
): Promise<void> {
  if (subscription.status === "canceled" || subscription.status === "expired") {
    return;
  }

  if (status === "paid") {
    if (!canConfirm) {
      return;
    }

    const dueDate = normalizedDate(payment.dueDate);
    const { data: plan } = await supabase
      .from("plans")
      .select("interval")
      .eq("id", subscription.plan_id)
      .maybeSingle();

    let periodStart = subscription.current_period_start;
    let periodEnd = subscription.current_period_end;

    if (dueDate) {
      const candidateStart = new Date(`${dueDate}T12:00:00.000Z`);
      const currentStart = subscription.current_period_start
        ? new Date(subscription.current_period_start)
        : null;

      // Entrega at-least-once pode repetir um evento antigo depois de um
      // pagamento mais recente. O período só avança, nunca retrocede.
      if (
        !Number.isNaN(candidateStart.getTime()) &&
        (currentStart === null ||
          Number.isNaN(currentStart.getTime()) ||
          candidateStart.getTime() > currentStart.getTime())
      ) {
        periodStart = candidateStart.toISOString();
        periodEnd = addInterval(dueDate, plan?.interval ?? "month");
      }
    }

    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        gateway_status:
          subscription.gateway_status === "pending_creation"
            ? "active"
            : subscription.gateway_status,
      })
      .eq("id", subscription.id)
      .in("status", [...mutableSubscriptionStatuses]);

    if (error) {
      throw new BillingWebhookError(
        "Não foi possível ativar a assinatura após o pagamento.",
      );
    }

    return;
  }

  if (status === "failed") {
    if (
      subscription.status === "pending" ||
      subscription.status === "active"
    ) {
      if (
        await hasLaterPaidPayment(
          supabase,
          subscription.id,
          normalizedDate(payment.dueDate),
        )
      ) {
        return;
      }

      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("id", subscription.id)
        .in("status", ["pending", "active"]);

      if (error) {
        throw new BillingWebhookError(
          "Não foi possível atualizar o status após a falha do pagamento.",
        );
      }
    }

    return;
  }

  if (status === "overdue") {
    if (
      await hasLaterPaidPayment(
        supabase,
        subscription.id,
        normalizedDate(payment.dueDate),
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("id", subscription.id)
      .in("status", [...mutableSubscriptionStatuses]);

    if (error) {
      throw new BillingWebhookError(
        "Não foi possível atualizar o status da assinatura vencida.",
      );
    }

    return;
  }

  if (
    status === "refunded" &&
    (subscription.status === "active" || subscription.status === "trialing")
  ) {
    if (
      await hasLaterPaidPayment(
        supabase,
        subscription.id,
        normalizedDate(payment.dueDate),
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("id", subscription.id)
      .in("status", ["active", "trialing"]);

    if (error) {
      throw new BillingWebhookError(
        "Não foi possível atualizar o status após o estorno.",
      );
    }
  }
}

async function applyPaymentEvent(
  supabase: Supabase,
  event: string,
  payment: AsaasWebhookPayment,
): Promise<BillingWebhookOutcome> {
  const subscription = await findLocalSubscriptionForPayment(supabase, payment);

  if (!subscription) {
    return "ignored";
  }

  // Durante o trial não existe assinatura remota. Qualquer evento financeiro
  // que chegue por externalReference é antigo ou inválido e não pode criar
  // cobrança, ativar o plano ou alterar o estado do teste.
  if (
    subscription.status === "trialing" &&
    !subscription.gateway_subscription_id
  ) {
    return "ignored";
  }

  const canConfirm = canConfirmPayment(event, payment);
  const { nextStatus } = await upsertPayment(
    supabase,
    event,
    subscription,
    payment,
    canConfirm,
  );

  await syncSubscriptionFromPayment(
    supabase,
    subscription,
    payment,
    nextStatus,
    canConfirm,
  );

  return "processed";
}

async function applySubscriptionEvent(
  supabase: Supabase,
  event: string,
  subscription: AsaasWebhookSubscription,
): Promise<BillingWebhookOutcome> {
  const local = await findLocalSubscriptionForEvent(supabase, subscription);

  if (!local) {
    return "ignored";
  }

  // Estados terminais nunca voltam a ficar ativos por um evento atrasado.
  // SUBSCRIPTION_DELETED continua permitido para concluir o cancelamento e
  // limpar cobranças pendentes de forma idempotente.
  if (
    (local.status === "canceled" || local.status === "expired") &&
    event !== "SUBSCRIPTION_DELETED"
  ) {
    return "ignored";
  }

  const updates: Database["public"]["Tables"]["subscriptions"]["Update"] = {};

  if (!local.gateway_subscription_id) {
    updates.gateway_subscription_id = subscription.id;
  }

  const gatewayStatus =
    subscription.status === "ACTIVE"
      ? "active"
      : subscription.status === "INACTIVE"
        ? "inactive"
        : subscription.status === "EXPIRED"
          ? "expired"
          : null;

  if (gatewayStatus) {
    updates.gateway_status = gatewayStatus;
  }

  const nextDueDate = normalizedDate(subscription.nextDueDate);
  if (nextDueDate) {
    updates.next_due_date = nextDueDate;
  }

  if (event === "SUBSCRIPTION_DELETED") {
    if (local.status !== "canceled") {
      updates.status = "canceled";
      updates.canceled_at = new Date().toISOString();
      updates.cancel_reason =
        local.cancel_reason ?? "Assinatura removida no Asaas.";
    }

    updates.cancel_at_period_end = false;
    updates.gateway_status = "inactive";

    const { error: paymentsError } = await supabase
      .from("payments")
      .update({ status: "cancelled" })
      .eq("subscription_id", local.id)
      .in("status", ["pending", "overdue"]);

    if (paymentsError) {
      throw new BillingWebhookError(
        "Não foi possível cancelar as cobranças locais da assinatura.",
      );
    }
  } else if (event === "SUBSCRIPTION_INACTIVATED") {
    updates.cancel_at_period_end = true;
  } else if (gatewayStatus === "expired" && local.status !== "canceled") {
    updates.status = "expired";
  }

  if (Object.keys(updates).length === 0) {
    return "ignored";
  }

  let updateQuery = supabase
    .from("subscriptions")
    .update(updates)
    .eq("id", local.id);

  // Um SUBSCRIPTION_DELETED pode concluir uma transição terminal já iniciada.
  // Os demais eventos só podem alterar linhas ainda correntes; a condição no
  // próprio UPDATE fecha a corrida entre a leitura acima e um cancelamento.
  if (event !== "SUBSCRIPTION_DELETED") {
    updateQuery = updateQuery.in("status", [...mutableSubscriptionStatuses]);
  }

  const { data: updated, error } = await updateQuery
    .select("id")
    .maybeSingle();

  if (error) {
    throw new BillingWebhookError(
      "Não foi possível sincronizar a assinatura do evento.",
    );
  }

  if (!updated) {
    return "ignored";
  }

  return "processed";
}

export async function processAsaasEvent(
  supabase: Supabase,
  event: AsaasWebhookEvent,
): Promise<BillingWebhookOutcome> {
  if (processablePaymentEvents.has(event.event)) {
    if (!event.payment) {
      throw new BillingWebhookError(
        "O evento de cobrança não trouxe os dados do pagamento.",
      );
    }

    return applyPaymentEvent(supabase, event.event, event.payment);
  }

  if (processableSubscriptionEvents.has(event.event)) {
    if (!event.subscription) {
      throw new BillingWebhookError(
        "O evento de assinatura não trouxe os dados da assinatura.",
      );
    }

    return applySubscriptionEvent(supabase, event.event, event.subscription);
  }

  // Eventos desconhecidos ou sem efeito financeiro são persistidos e ignorados.
  return "ignored";
}
