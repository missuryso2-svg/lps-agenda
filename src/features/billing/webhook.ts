import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AsaasWebhookEvent,
  AsaasWebhookPayment,
  AsaasWebhookSubscription,
} from "@/lib/asaas/webhook";
import type { Database, Json } from "@/types/database";

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
  "PAYMENT_REFUND_DENIED",
]);

const processableSubscriptionEvents = new Set([
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_UPDATED",
  "SUBSCRIPTION_INACTIVATED",
  "SUBSCRIPTION_DELETED",
]);

// Somente estes eventos, acompanhados do status efetivo correspondente no
// objeto payment, podem confirmar uma cobrança.
const paymentConfirmationEvents = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
]);

const chargebackEvents = new Set([
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
]);

const refundEventsRequiringRefundedStatus = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
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
    case "PAYMENT_AWAITING_RISK_ANALYSIS":
    case "PAYMENT_APPROVED_BY_RISK_ANALYSIS":
    case "PAYMENT_AUTHORIZED":
      return "pending";
    case "PAYMENT_RESTORED":
      return "pending";
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
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

function usesSupportedBillingType(payment: AsaasWebhookPayment): boolean {
  const billingType = payment.billingType?.toUpperCase();

  return (
    billingType === undefined ||
    billingType === "PIX" ||
    billingType === "BOLETO"
  );
}

function canConfirmPayment(
  event: string,
  payment: AsaasWebhookPayment,
): boolean {
  const status = payment.status.toUpperCase();

  return (
    usesSupportedBillingType(payment) &&
    paymentConfirmationEvents.has(event) &&
    ((event === "PAYMENT_CONFIRMED" && status === "CONFIRMED") ||
      (event === "PAYMENT_RECEIVED" && status === "RECEIVED"))
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
      return payment.externalReference &&
        payment.externalReference !== data.external_reference
        ? null
        : data;
    }
  }

  const externalReference = payment.externalReference;

  if (externalReference && uuidPattern.test(externalReference)) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("gateway", "asaas")
      .eq("external_reference", externalReference)
      .maybeSingle();

    if (error) {
      throw new BillingWebhookError(
        "Não foi possível consultar a assinatura do pagamento.",
      );
    }

    if (
      data &&
      payment.subscription &&
      data.gateway_subscription_id &&
      data.gateway_subscription_id !== payment.subscription
    ) {
      return null;
    }

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
      .eq("gateway", "asaas")
      .eq("external_reference", externalReference)
      .maybeSingle();

    return byReference ?? null;
  }

  return null;
}

type PaymentTransition = {
  status: PaymentStatus;
  updateState: boolean;
  updateDetails: boolean;
  restoredFromEvent: string | null;
};

type UpsertPaymentResult =
  | { kind: "ignored" }
  | {
      kind: "processed";
      paymentId: string;
    };

type AsaasEventTimestamp = {
  basis: "wall_clock" | "utc";
  value: string;
  stored: string;
};

function metadataRecord(metadata: Json): Record<string, Json> {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const result: Record<string, Json> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

function metadataString(metadata: Json, key: string): string | null {
  const value = metadataRecord(metadata)[key];
  return typeof value === "string" ? value : null;
}

function paymentStateEvent(payment: PaymentRow): string | null {
  return (
    metadataString(payment.metadata, "asaas_payment_state_event") ??
    metadataString(payment.metadata, "asaas_event")
  );
}

function asaasEventTimestamp(event: AsaasWebhookEvent): AsaasEventTimestamp | null {
  const value = event.dateCreated?.trim();

  if (!value) {
    return null;
  }

  const normalized = value.includes(" ") && !value.includes("T")
    ? value.replace(" ", "T")
    : value;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);

  if (hasTimezone) {
    const timestamp = Date.parse(normalized);

    if (!Number.isFinite(timestamp)) {
      return null;
    }

    const utc = new Date(timestamp).toISOString();

    return { basis: "utc", value: utc, stored: `utc:${utc}` };
  }

  // Asaas documents dateCreated as `YYYY-MM-DD HH:mm:ss` without a timezone.
  // Preserve it as a wall-clock value instead of inventing UTC or Sao Paulo.
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/.exec(
    normalized,
  );

  if (!match) {
    return null;
  }

  const valueWithoutZone = `${match[1]}T${match[2]}.${(match[3] ?? "").padEnd(3, "0")}`;
  const parsed = new Date(`${valueWithoutZone}Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 19) !== valueWithoutZone.slice(0, 19)
  ) {
    return null;
  }

  return {
    basis: "wall_clock",
    value: valueWithoutZone,
    stored: `wall_clock:${valueWithoutZone}`,
  };
}

function compareEventTimestamps(
  incoming: AsaasEventTimestamp,
  storedValue: string,
): -1 | 0 | 1 | null {
  const separator = storedValue.indexOf(":");

  if (separator < 0) {
    return null;
  }

  const storedBasis = storedValue.slice(0, separator);
  const storedTimestamp = storedValue.slice(separator + 1);

  if (storedBasis !== incoming.basis) {
    return null;
  }

  return incoming.value === storedTimestamp
    ? 0
    : incoming.value < storedTimestamp
      ? -1
      : 1;
}

function isOlderPaymentEvent(
  event: AsaasWebhookEvent,
  existing: PaymentRow,
): boolean {
  const incomingTimestamp = asaasEventTimestamp(event);
  const storedTimestamp = metadataString(
    existing.metadata,
    "asaas_event_created_at",
  );

  if (!incomingTimestamp || !storedTimestamp) {
    return false;
  }

  const comparison = compareEventTimestamps(incomingTimestamp, storedTimestamp);

  // Quando um evento não traz timezone e o outro traz, não é seguro inferir
  // ordem absoluta; rejeite o candidato e mantenha a regra financeira atual.
  return comparison === -1 || comparison === null;
}

function isStrictlyLaterThanPaymentState(
  event: AsaasWebhookEvent,
  existing: PaymentRow,
): boolean {
  const incomingTimestamp = asaasEventTimestamp(event);
  const previousTimestamp = metadataString(
    existing.metadata,
    "asaas_payment_state_created_at",
  );

  return Boolean(
    incomingTimestamp &&
      previousTimestamp &&
      compareEventTimestamps(incomingTimestamp, previousTimestamp) === 1,
  );
}

function refundDenialRestorationSource(
  event: AsaasWebhookEvent,
  payment: AsaasWebhookPayment,
  existing: PaymentRow | null,
): string | null {
  const providerStatus = payment.status.toUpperCase();

  if (
    event.event !== "PAYMENT_REFUND_DENIED" ||
    existing?.status !== "refunded" ||
    !usesSupportedBillingType(payment) ||
    (providerStatus !== "CONFIRMED" && providerStatus !== "RECEIVED") ||
    paymentStateEvent(existing) !== "PAYMENT_REFUND_IN_PROGRESS" ||
    !isStrictlyLaterThanPaymentState(event, existing)
  ) {
    return null;
  }

  return "PAYMENT_REFUND_IN_PROGRESS";
}

function chargebackRestorationSource(
  event: AsaasWebhookEvent,
  payment: AsaasWebhookPayment,
  existing: PaymentRow | null,
): string | null {
  if (
    existing?.status !== "refunded" ||
    !canConfirmPayment(event.event, payment)
  ) {
    return null;
  }

  const previousEvent = paymentStateEvent(existing);

  if (
    (previousEvent === "PAYMENT_CHARGEBACK_REQUESTED" ||
      previousEvent === "PAYMENT_CHARGEBACK_DISPUTE" ||
      previousEvent === "PAYMENT_AWAITING_CHARGEBACK_REVERSAL") &&
    isStrictlyLaterThanPaymentState(event, existing)
  ) {
    return previousEvent;
  }

  return null;
}

function canAdvanceChargeback(
  previousEvent: string | null,
  nextEvent: string,
): boolean {
  if (previousEvent === nextEvent) {
    return true;
  }

  if (previousEvent === "PAYMENT_CHARGEBACK_REQUESTED") {
    return (
      nextEvent === "PAYMENT_CHARGEBACK_DISPUTE" ||
      nextEvent === "PAYMENT_AWAITING_CHARGEBACK_REVERSAL"
    );
  }

  return (
    previousEvent === "PAYMENT_CHARGEBACK_DISPUTE" &&
    nextEvent === "PAYMENT_AWAITING_CHARGEBACK_REVERSAL"
  );
}

function isMutablePaymentStatus(status: PaymentStatus): boolean {
  return status === "pending" || status === "overdue" || status === "failed";
}

function paymentTransitionForEvent(
  event: AsaasWebhookEvent,
  payment: AsaasWebhookPayment,
  existing: PaymentRow | null,
): PaymentTransition | null {
  if (event.event === "PAYMENT_DUNNING_RECEIVED") {
    // O evento confirma a negativação do devedor, não o recebimento financeiro.
    return null;
  }

  const refundDenialSource = refundDenialRestorationSource(
    event,
    payment,
    existing,
  );

  if (event.event === "PAYMENT_REFUND_DENIED") {
    return refundDenialSource
      ? {
          status: "paid",
          updateState: true,
          updateDetails: false,
          restoredFromEvent: refundDenialSource,
        }
      : null;
  }

  if (paymentConfirmationEvents.has(event.event)) {
    if (!canConfirmPayment(event.event, payment)) {
      return null;
    }

    if (existing?.status === "cancelled") {
      return null;
    }

    let restoredFromEvent: string | null = null;

    if (existing?.status === "refunded") {
      restoredFromEvent = chargebackRestorationSource(
        event,
        payment,
        existing,
      );

      if (!restoredFromEvent) {
        return null;
      }
    }

    return {
      status: "paid",
      updateState: true,
      updateDetails: false,
      restoredFromEvent,
    };
  }

  // PAYMENT_UPDATED só comunica alterações à cobrança. Seu status no payload
  // não é confirmação de pagamento nem autorização para reabrir um estado.
  if (event.event === "PAYMENT_UPDATED") {
    if (!existing) {
      return {
        status: "pending",
        updateState: true,
        updateDetails: true,
        restoredFromEvent: null,
      };
    }

    if (!isMutablePaymentStatus(existing.status)) {
      return null;
    }

    return {
      status: existing.status,
      updateState: false,
      updateDetails: true,
      restoredFromEvent: null,
    };
  }

  // Uma confirmação sem o status financeiro correspondente, ou um evento de
  // recuperação sem status efetivo, não pode criar nem alterar pagamento.
  if (paymentConfirmationEvents.has(event.event)) {
    return null;
  }

  const requestedStatus = statusFromEvent(event.event);

  if (!requestedStatus) {
    return null;
  }

  const providerStatus = statusFromAsaasPayment(payment.status);

  if (
    event.event === "PAYMENT_RESTORED" &&
    payment.status.toUpperCase() !== "PENDING"
  ) {
    return null;
  }

  if (requestedStatus === "overdue" && providerStatus !== "overdue") {
    return null;
  }

  if (requestedStatus === "failed" && providerStatus !== "failed") {
    return null;
  }

  if (
    refundEventsRequiringRefundedStatus.has(event.event) &&
    providerStatus !== "refunded"
  ) {
    return null;
  }

  if (
    chargebackEvents.has(event.event) &&
    existing?.status === "paid" &&
    metadataString(existing.metadata, "asaas_restored_from_event")
  ) {
    const incomingTimestamp = asaasEventTimestamp(event);
    const restoredTimestamp = metadataString(
      existing.metadata,
      "asaas_payment_state_created_at",
    );
    const comparison = incomingTimestamp && restoredTimestamp
      ? compareEventTimestamps(incomingTimestamp, restoredTimestamp)
      : null;

    if (
      !incomingTimestamp ||
      !restoredTimestamp ||
      comparison !== 1
    ) {
      return null;
    }
  }

  if (!existing) {
    return {
      status: requestedStatus,
      updateState: true,
      updateDetails: false,
      restoredFromEvent: null,
    };
  }

  const previousStateEvent = paymentStateEvent(existing);

  if (requestedStatus === existing.status) {
    if (requestedStatus === "refunded") {
      if (chargebackEvents.has(event.event)) {
        if (!canAdvanceChargeback(previousStateEvent, event.event)) {
          return null;
        }
      } else if (event.event === "PAYMENT_REFUNDED") {
        if (
          previousStateEvent !== "PAYMENT_REFUNDED" &&
          previousStateEvent !== "PAYMENT_PARTIALLY_REFUNDED" &&
          previousStateEvent !== "PAYMENT_REFUND_IN_PROGRESS"
        ) {
          return null;
        }
      } else if (event.event === "PAYMENT_PARTIALLY_REFUNDED") {
        if (
          previousStateEvent !== "PAYMENT_PARTIALLY_REFUNDED" &&
          previousStateEvent !== "PAYMENT_REFUND_IN_PROGRESS"
        ) {
          return null;
        }
      } else if (
        event.event === "PAYMENT_REFUND_IN_PROGRESS" &&
        previousStateEvent !== "PAYMENT_REFUND_IN_PROGRESS"
      ) {
        return null;
      } else if (
        event.event === "PAYMENT_RECEIVED_IN_CASH_UNDONE" &&
        previousStateEvent !== "PAYMENT_RECEIVED_IN_CASH_UNDONE"
      ) {
        return null;
      }
    }

    return {
      status: requestedStatus,
      updateState: true,
      updateDetails: false,
      restoredFromEvent: null,
    };
  }

  if (requestedStatus === "pending") {
    return event.event === "PAYMENT_RESTORED" &&
      existing.status === "cancelled"
      ? {
          status: "pending",
          updateState: true,
          updateDetails: false,
          restoredFromEvent: null,
        }
      : null;
  }

  if (requestedStatus === "overdue" && existing.status === "pending") {
    return {
      status: "overdue",
      updateState: true,
      updateDetails: false,
      restoredFromEvent: null,
    };
  }

  if (
    requestedStatus === "failed" &&
    (existing.status === "pending" || existing.status === "overdue")
  ) {
    return {
      status: "failed",
      updateState: true,
      updateDetails: false,
      restoredFromEvent: null,
    };
  }

  if (requestedStatus === "refunded") {
    if (existing.status === "cancelled") {
      return null;
    }

    return {
      status: "refunded",
      updateState: true,
      updateDetails: false,
      restoredFromEvent: null,
    };
  }

  if (
    requestedStatus === "cancelled" &&
    isMutablePaymentStatus(existing.status)
  ) {
    return {
      status: "cancelled",
      updateState: true,
      updateDetails: false,
      restoredFromEvent: null,
    };
  }

  return null;
}

function paymentMetadataForEvent(
  existing: PaymentRow | null,
  event: AsaasWebhookEvent,
  payment: AsaasWebhookPayment,
  transition: PaymentTransition,
): Json {
  const metadata: Record<string, Json> = {
    ...metadataRecord(existing?.metadata ?? {}),
    asaas_event: event.event,
    asaas_status: payment.status,
    asaas_event_id: event.id,
  };
  const eventTimestamp = asaasEventTimestamp(event);

  if (eventTimestamp) {
    metadata.asaas_event_created_at = eventTimestamp.stored;
  }

  if (
    payment.netValue !== undefined &&
    (!existing ||
      transition.updateDetails ||
      paymentConfirmationEvents.has(event.event))
  ) {
    metadata.net_value_cents = Math.round(payment.netValue * 100);
  }

  if (transition.updateState) {
    metadata.asaas_payment_state_event = event.event;
    metadata.asaas_payment_state_status = transition.status;
    metadata.asaas_payment_state_provider_status = payment.status;
    metadata.asaas_previous_local_status = existing?.status ?? "new";

    if (eventTimestamp) {
      metadata.asaas_payment_state_created_at = eventTimestamp.stored;
    } else {
      delete metadata.asaas_payment_state_created_at;
    }

    if (transition.restoredFromEvent) {
      metadata.asaas_restored_from_event = transition.restoredFromEvent;
    } else {
      delete metadata.asaas_restored_from_event;
    }
  }

  return metadata;
}

async function upsertPayment(
  supabase: Supabase,
  event: AsaasWebhookEvent,
  subscription: SubscriptionRow,
  payment: AsaasWebhookPayment,
): Promise<UpsertPaymentResult> {
  const amountCents = toCents(payment.value);

  if (amountCents === null || amountCents <= 0) {
    throw new BillingWebhookError("O evento trouxe um valor de pagamento inválido.");
  }

  const dueDate = normalizedDate(payment.dueDate);

  for (let attempt = 0; attempt < 3; attempt += 1) {
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

    if (
      existing &&
      (existing.scope !== "platform_subscription" ||
        existing.subscription_id !== subscription.id ||
        existing.barbershop_id !== subscription.barbershop_id)
    ) {
      // A chave do gateway é global. Não reassocia nem atualiza uma cobrança
      // que já pertença a outro pagamento ou tenant.
      return { kind: "ignored" };
    }

    if (existing && isOlderPaymentEvent(event, existing)) {
      return { kind: "ignored" };
    }

    const eventTimestamp = asaasEventTimestamp(event);
    const storedEventTimestamp = existing
      ? metadataString(existing.metadata, "asaas_event_created_at")
      : null;

    if (existing && storedEventTimestamp && !eventTimestamp) {
      return { kind: "ignored" };
    }

    const transition = paymentTransitionForEvent(event, payment, existing);

    if (!transition) {
      return { kind: "ignored" };
    }

    const paidAt =
      transition.status === "paid"
        ? existing?.status === "paid"
          ? existing.paid_at
          : (existing?.paid_at ??
            toTimestamp(
              payment.confirmedDate ??
                payment.paymentDate ??
                payment.clientPaymentDate,
            ) ??
            new Date().toISOString())
        : (existing?.paid_at ?? null);
    const metadata = paymentMetadataForEvent(
      existing,
      event,
      payment,
      transition,
    );
    const synchronizeSubscription =
      transition.updateState &&
      (transition.status === "paid" ||
        transition.status === "overdue" ||
        transition.status === "failed" ||
        transition.status === "refunded");

    const { data: paymentId, error: transitionError } = await supabase.rpc(
      "apply_asaas_payment_transition",
      {
        p_barbershop_id: subscription.barbershop_id,
        p_subscription_id: subscription.id,
        p_gateway_payment_id: payment.id,
        p_amount_cents:
          transition.updateDetails || !existing
            ? amountCents
            : existing.amount_cents,
        p_status: transition.status,
        p_method: transition.updateDetails
          ? (methodFromBillingType(payment.billingType) ?? existing?.method ?? null)
          : (existing?.method ?? methodFromBillingType(payment.billingType)),
        p_due_date: transition.updateDetails
          ? (dueDate ?? existing?.due_date ?? null)
          : (existing?.due_date ?? dueDate),
        p_paid_at: paidAt,
        p_invoice_url: transition.updateDetails
          ? (payment.invoiceUrl ?? existing?.invoice_url ?? null)
          : (existing?.invoice_url ?? payment.invoiceUrl ?? null),
        p_metadata: metadata,
        p_expected_status: existing?.status ?? null,
        p_expected_updated_at: existing?.updated_at ?? null,
        p_expected_metadata: existing?.metadata ?? null,
        p_sync_subscription: synchronizeSubscription,
      },
    );

    if (transitionError) {
      throw new BillingWebhookError(
        "Não foi possível gravar a cobrança e sincronizar a assinatura.",
      );
    }

    if (paymentId) {
      return { kind: "processed", paymentId };
    }

    // O CAS perdeu para outra entrega ou uma inserção concorrente. Releia o
    // estado e recalcule a transição antes de tentar novamente.
  }

  throw new BillingWebhookError(
    "O pagamento mudou durante o processamento do evento. Tente novamente.",
  );
}

async function applyPaymentEvent(
  supabase: Supabase,
  event: AsaasWebhookEvent,
  payment: AsaasWebhookPayment,
): Promise<BillingWebhookOutcome> {
  if (event.event === "PAYMENT_DUNNING_RECEIVED") {
    return "ignored";
  }

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

  const result = await upsertPayment(supabase, event, subscription, payment);

  if (result.kind === "ignored") {
    return "ignored";
  }

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
    .eq("gateway", "asaas")
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

    return applyPaymentEvent(supabase, event, event.payment);
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
