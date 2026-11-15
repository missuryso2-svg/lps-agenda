import "server-only";

import { isAsaasConfigured } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";
import { maskDocument, type BillingType } from "@/lib/validation/billing";
import type { Database } from "@/types/database";
import type {
  BillingCustomerView,
  BillingInvoice,
  BillingPageData,
  BillingPlan,
  BillingSubscriptionView,
} from "./types";

const currentSubscriptionStatuses = [
  "pending",
  "trialing",
  "active",
  "past_due",
] as const;

function toBillingType(
  value: Database["public"]["Enums"]["payment_method"] | null,
): BillingType | null {
  return value === "boleto" || value === "pix" ? value : null;
}

export async function getBillingPageData(
  barbershopId: string,
): Promise<BillingPageData> {
  const supabase = await createClient();

  const [
    plansResult,
    subscriptionResult,
    customerResult,
    invoicesResult,
    historyResult,
  ] = await Promise.all([
    supabase
      .from("plans")
      .select(
        "id, code, name, description, price_cents, interval, features, max_barbers, currency, trial_days",
      )
      .eq("is_active", true)
      .order("price_cents", { ascending: true }),
    supabase
      .from("subscriptions")
      .select("*")
      .eq("barbershop_id", barbershopId)
      .in("status", [...currentSubscriptionStatuses])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("billing_customers")
      .select(
        "holder_name, person_type, document_digits, gateway_customer_id",
      )
      .eq("barbershop_id", barbershopId)
      .maybeSingle(),
    supabase
      .from("payments")
      .select(
        "id, amount_cents, status, method, due_date, paid_at, invoice_url, created_at",
      )
      .eq("barbershop_id", barbershopId)
      .eq("scope", "platform_subscription")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("subscriptions")
      .select("id, status, trial_ends_at, canceled_at, cancel_reason")
      .eq("barbershop_id", barbershopId)
      .order("created_at", { ascending: false }),
  ]);

  const plans = (plansResult.data ?? []) as BillingPlan[];

  let subscription: BillingSubscriptionView | null = null;

  if (subscriptionResult.data) {
    const row = subscriptionResult.data;
    const { data: plan } = await supabase
      .from("plans")
      .select(
        "id, code, name, description, price_cents, interval, features, max_barbers, currency, trial_days",
      )
      .eq("id", row.plan_id)
      .maybeSingle();

    subscription = {
      id: row.id,
      planId: row.plan_id,
      status: row.status,
      billingType: toBillingType(row.billing_type),
      gatewayStatus: row.gateway_status,
      nextDueDate: row.next_due_date,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      trialStartedAt: row.trial_started_at,
      trialEndsAt: row.trial_ends_at,
      contractedPriceCents: row.contracted_price_cents,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      canceledAt: row.canceled_at,
      hasRemoteSubscription: Boolean(row.gateway_subscription_id),
      plan: (plan as BillingPlan | null) ?? null,
    };
  }

  let customer: BillingCustomerView | null = null;

  if (customerResult.data) {
    const row = customerResult.data;

    customer = {
      holderName: row.holder_name,
      documentMasked: maskDocument(row.document_digits),
      personType: row.person_type,
      hasGatewayCustomer: Boolean(row.gateway_customer_id),
    };
  }

  const invoices: BillingInvoice[] = (invoicesResult.data ?? []).map((row) => ({
    id: row.id,
    amountCents: row.amount_cents,
    status: row.status,
    method: row.method,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    invoiceUrl: row.invoice_url,
    createdAt: row.created_at,
  }));

  const history = historyResult.data ?? [];
  const hasUsedTrial = history.some((row) => row.trial_ends_at !== null);
  const lastCanceledRow = history.find(
    (row) => row.status === "canceled" && row.canceled_at,
  );

  return {
    plans,
    subscription,
    customer,
    invoices,
    asaasConfigured: isAsaasConfigured(),
    // Fail closed: se o histórico não pôde ser lido, não oferece um novo trial.
    // O trial é único por barbearia, mas uma contratação paga anterior sem
    // teste gratuito não impede o primeiro trial.
    trialAvailable:
      !historyResult.error &&
      !subscription &&
      !hasUsedTrial &&
      plans.some((plan) => plan.trial_days > 0),
    hasUsedTrial,
    lastCanceled:
      !historyResult.error && lastCanceledRow?.canceled_at
        ? {
            canceledAt: lastCanceledRow.canceled_at,
            cancelReason: lastCanceledRow.cancel_reason ?? null,
          }
        : null,
  };
}
