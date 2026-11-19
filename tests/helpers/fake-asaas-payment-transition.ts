import { randomUUID } from "node:crypto";

import { FakeSupabase, type FakeRow } from "./fake-supabase";

function metadataString(row: FakeRow, key: string): string | null {
  const metadata = row.metadata;

  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = Object.entries(metadata).find(([name]) => name === key)?.[1];
  return typeof value === "string" ? value : null;
}

function datePart(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;
}

function fakePeriodEnd(dueDate: string, interval: unknown): string {
  const date = new Date(`${dueDate}T12:00:00.000Z`);

  if (interval === "year") {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  } else {
    date.setUTCMonth(date.getUTCMonth() + 1);
  }

  return date.toISOString();
}

function syncFakeSubscription(db: FakeSupabase, paymentId: string): boolean {
  const payment = db.getRows("payments").find(
    (row) =>
      row.id === paymentId &&
      row.gateway === "asaas" &&
      row.scope === "platform_subscription",
  );

  if (!payment || typeof payment.subscription_id !== "string") {
    return false;
  }

  const subscription = db.getRows("subscriptions").find(
    (row) =>
      row.id === payment.subscription_id &&
      row.barbershop_id === payment.barbershop_id,
  );

  if (
    !subscription ||
    subscription.status === "canceled" ||
    subscription.status === "expired" ||
    (subscription.status === "trialing" &&
      subscription.gateway_subscription_id === null)
  ) {
    return false;
  }

  const dueDate = datePart(payment.due_date);
  const relatedPayments = db.getRows("payments").filter(
    (row) =>
      row.id !== payment.id &&
      row.subscription_id === subscription.id &&
      row.barbershop_id === subscription.barbershop_id &&
      row.scope === "platform_subscription",
  );
  const hasLaterBlocker = (candidateDueDate: string) =>
    relatedPayments.some((row) => {
      const otherDueDate = datePart(row.due_date);

      return (
        otherDueDate !== null &&
        otherDueDate >= candidateDueDate &&
        (["overdue", "failed", "refunded"].includes(String(row.status)) ||
          (row.status === "pending" && otherDueDate === candidateDueDate))
      );
    });
  const hasLaterPaid = (candidateDueDate: string) =>
    relatedPayments.some((row) => {
      const otherDueDate = datePart(row.due_date);
      return (
        row.status === "paid" &&
        otherDueDate !== null &&
        otherDueDate >= candidateDueDate
      );
    });
  const writeSubscription = (payload: FakeRow) => {
    const triggered = db.applyUpdateHook("subscriptions", subscription, payload);
    db.setRows(
      "subscriptions",
      db.getRows("subscriptions").map((row) =>
        row.id === subscription.id
          ? { ...row, ...triggered, updated_at: new Date().toISOString() }
          : row,
      ),
    );
    return true;
  };

  if (payment.status === "paid") {
    const stateEvent =
      metadataString(payment, "asaas_payment_state_event") ??
      metadataString(payment, "asaas_event");
    const providerStatus = metadataString(payment, "asaas_status")?.toUpperCase();
    const stateStatus = metadataString(payment, "asaas_payment_state_status");
    const restoredFrom = metadataString(payment, "asaas_restored_from_event");
    const previousLocalStatus = metadataString(
      payment,
      "asaas_previous_local_status",
    );
    const chargebackRestoration = [
      "PAYMENT_CHARGEBACK_REQUESTED",
      "PAYMENT_CHARGEBACK_DISPUTE",
      "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
    ].includes(restoredFrom ?? "");
    const validConfirmation =
      stateStatus === "paid" &&
      ((stateEvent === "PAYMENT_CONFIRMED" &&
        providerStatus === "CONFIRMED" &&
        (!restoredFrom || chargebackRestoration)) ||
        (stateEvent === "PAYMENT_RECEIVED" &&
          providerStatus === "RECEIVED" &&
          (!restoredFrom || chargebackRestoration)) ||
        (stateEvent === "PAYMENT_REFUND_DENIED" &&
          ["CONFIRMED", "RECEIVED"].includes(providerStatus ?? "") &&
          restoredFrom === "PAYMENT_REFUND_IN_PROGRESS"));

    if (!validConfirmation) {
      return false;
    }

    const status = String(subscription.status);
    const startDate = datePart(subscription.current_period_start);
    const endDate = datePart(subscription.current_period_end);
    let nextStatus = status;
    let nextStart = subscription.current_period_start;
    let nextEnd = subscription.current_period_end;

    if (status === "past_due") {
      if (!dueDate) {
        return false;
      }

      if (!startDate && !endDate) {
        if (previousLocalStatus !== "overdue" && previousLocalStatus !== "failed") {
          return false;
        }
      } else if (dueDate !== startDate && dueDate !== endDate) {
        return false;
      }

      if (hasLaterBlocker(dueDate)) {
        return false;
      }

      if (dueDate === endDate || (!startDate && !endDate)) {
        const plan = db.getRows("plans").find(
          (row) => row.id === subscription.plan_id,
        );
        nextStart = `${dueDate}T12:00:00.000Z`;
        nextEnd = fakePeriodEnd(dueDate, plan?.interval);
      }

      nextStatus = "active";
    } else if (["pending", "trialing", "active"].includes(status)) {
      if (dueDate) {
        if (
          (status === "pending" || status === "trialing") &&
          endDate !== null &&
          dueDate < endDate
        ) {
          return false;
        }

        if (
          (status === "pending" || status === "trialing") &&
          startDate !== null &&
          dueDate < startDate
        ) {
          return false;
        }

        if (hasLaterBlocker(dueDate)) {
          return false;
        }

        if (
          subscription.current_period_start === null ||
          `${dueDate}T12:00:00.000Z` > String(subscription.current_period_start)
        ) {
          const plan = db.getRows("plans").find(
            (row) => row.id === subscription.plan_id,
          );
          nextStart = `${dueDate}T12:00:00.000Z`;
          nextEnd = fakePeriodEnd(dueDate, plan?.interval);
        }
      }

      if (status === "pending" || status === "trialing") {
        nextStatus = "active";
      }
    } else {
      return false;
    }

    const nextGatewayStatus =
      subscription.gateway_status === "pending_creation"
        ? "active"
        : subscription.gateway_status;

    if (
      nextStatus === subscription.status &&
      nextStart === subscription.current_period_start &&
      nextEnd === subscription.current_period_end &&
      nextGatewayStatus === subscription.gateway_status
    ) {
      return false;
    }

    return writeSubscription({
      status: nextStatus,
      current_period_start: nextStart,
      current_period_end: nextEnd,
      gateway_status: nextGatewayStatus,
    });
  }

  if (["overdue", "failed", "refunded"].includes(String(payment.status))) {
    if (dueDate && hasLaterPaid(dueDate)) {
      return false;
    }

    if (!["pending", "trialing", "active"].includes(String(subscription.status))) {
      return false;
    }

    return writeSubscription({ status: "past_due" });
  }

  return false;
}

/**
 * Executa a RPC como um contrato em memória. Não simula SELECT FOR UPDATE,
 * foreign-key key-share, isolamentos, deadlocks nem rollback transacional.
 */
export function installFakeAsaasPaymentTransitionRpc(db: FakeSupabase): void {
  db.addUniqueConstraint("payments", ["gateway", "gateway_payment_id"]);

  db.setRpcHandler("apply_asaas_payment_transition", (args) => {
    const paymentsBefore = db.getRows("payments").map((row) => ({ ...row }));
    const subscriptionsBefore = db
      .getRows("subscriptions")
      .map((row) => ({ ...row }));
    const gatewayPaymentId = args.p_gateway_payment_id;
    const payment = db.getRows("payments").find(
      (row) =>
        row.gateway === "asaas" &&
        row.gateway_payment_id === gatewayPaymentId,
    );

    if (payment) {
      if (
        payment.scope !== "platform_subscription" ||
        payment.subscription_id !== args.p_subscription_id ||
        payment.barbershop_id !== args.p_barbershop_id ||
        args.p_expected_status === null ||
        payment.status !== args.p_expected_status ||
        payment.updated_at !== args.p_expected_updated_at ||
        JSON.stringify(payment.metadata) !== JSON.stringify(args.p_expected_metadata)
      ) {
        return null;
      }
    } else if (
      args.p_expected_status !== null ||
      args.p_expected_updated_at !== null ||
      args.p_expected_metadata !== null
    ) {
      return null;
    }

    const paymentId = typeof payment?.id === "string" ? payment.id : randomUUID();
    const timestamp = new Date().toISOString();
    const nextPayment: FakeRow = {
      ...payment,
      id: paymentId,
      barbershop_id: args.p_barbershop_id,
      subscription_id: args.p_subscription_id,
      appointment_id: null,
      amount_cents: args.p_amount_cents,
      status: args.p_status,
      method: args.p_method,
      scope: "platform_subscription",
      due_date: args.p_due_date,
      paid_at: args.p_paid_at,
      gateway: "asaas",
      gateway_payment_id: gatewayPaymentId,
      invoice_url: args.p_invoice_url,
      metadata: args.p_metadata,
      created_at: payment?.created_at ?? timestamp,
      updated_at: timestamp,
    };
    const nextPayments = payment
      ? paymentsBefore.map((row) =>
          row.id === payment.id ? nextPayment : row,
        )
      : [...paymentsBefore, nextPayment];
    const uniqueError = db.uniqueViolation("payments", nextPayments);

    if (uniqueError) {
      return null;
    }

    try {
      db.setRows("payments", nextPayments);

      if (args.p_sync_subscription === true) {
        syncFakeSubscription(db, paymentId);
      }

      return paymentId;
    } catch (error) {
      db.setRows("payments", paymentsBefore);
      db.setRows("subscriptions", subscriptionsBefore);
      throw error;
    }
  });
}
