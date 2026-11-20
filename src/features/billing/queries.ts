import "server-only";
import { canResumeCheckout } from "./legacy-checkout";
import { z } from "zod";

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

const manualPlanSchema = z.object({
  plan: z.string().nullable(),
  trial_start: z.string().nullable(),
  trial_end: z.string().nullable(),
  days_left: z.number().int().min(0).max(7),
  trial_state: z.enum(["running", "canceled", "ended"]).nullable(),
  next_step: z.literal("contact_lps"),
  access: z.enum(["normal", "grace", "blocked"]),
  reason: z.string(),
  // Migration 26 extends this projection. Older databases only report trial/access.
  status: z.enum(["pending","trialing","active","past_due","canceled","expired"]).nullish(),
  agreement: z.object({
    monthly_cents: z.number().int().nonnegative(),
    period_start: z.string(), period_end: z.string(),
    first_due_at: z.string(), outstanding_due_at: z.string().nullable(),
  }).nullish(),
});

export async function getOwnerManualPlan(shop: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_owner_manual_trial", { p_shop: shop });
  if (error) throw new Error("Não foi possível consultar o plano.");
  return data === null ? null : manualPlanSchema.parse(data);
}

const currentSubscriptionStatuses = [
  "pending",
  "trialing",
  "active",
  "past_due",
] as const;

const checkoutLeaseMs = 5 * 60 * 1000;

function leaseIsActive(lockedAt: string | null, token: string | null): boolean {
  if (!lockedAt) {
    return Boolean(token);
  }

  const timestamp = new Date(lockedAt).getTime();

  return !Number.isFinite(timestamp) || Date.now() - timestamp < checkoutLeaseMs;
}

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
    invoices,
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
    readLegacyInvoices(supabase, barbershopId),
    supabase
      .from("subscriptions")
      .select("id, status, trial_ends_at, canceled_at, cancel_reason")
      .eq("barbershop_id", barbershopId)
      .order("created_at", { ascending: false }),
  ]);

  if (subscriptionResult.error || (subscriptionResult.data && subscriptionResult.data.gateway !== "asaas")) {
    throw new Error("Não foi possível identificar a origem da assinatura.");
  }
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
      contractedCurrency: row.contracted_currency,
      contractedInterval: row.contracted_interval,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      canceledAt: row.canceled_at,
      hasRemoteSubscription: Boolean(row.gateway_subscription_id),
      canResumeCheckout: canResumeCheckout(row),
      billingMutationInProgress:
        leaseIsActive(row.checkout_locked_at, row.checkout_lease_token) ||
        Boolean(
          row.trial_finalization_locked_at ||
            row.trial_finalization_lease_token,
        ),
      remoteCleanupPending: Boolean(row.remote_cleanup_pending),
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

async function readLegacyInvoices(supabase: Awaited<ReturnType<typeof createClient>>, barbershopId: string): Promise<BillingInvoice[]> {
  const invoicesResult = await supabase
      .from("payments")
      .select(
        "id, amount_cents, status, method, due_date, paid_at, invoice_url, created_at",
      )
      .eq("barbershop_id", barbershopId)
      .eq("gateway", "asaas")
      .eq("scope", "platform_subscription")
      .order("created_at", { ascending: false })
      .limit(12);
  if (invoicesResult.error) throw new Error("Histórico de mensalidades indisponível.");
  return (invoicesResult.data ?? []).map((row) => ({
    id: row.id,
    amountCents: row.amount_cents,
    status: row.status,
    method: row.method,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    invoiceUrl: row.invoice_url,
    createdAt: row.created_at,
  }));
}

export async function getLegacyInvoices(shop: string) {
  return readLegacyInvoices(await createClient(), shop);
}
