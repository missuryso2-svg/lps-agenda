import type { Database, Json } from "@/types/database";
import type { BillingType } from "@/lib/validation/billing";

export type BillingPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  interval: Database["public"]["Enums"]["billing_interval"];
  features: Json;
  max_barbers: number | null;
  currency: string;
  trial_days: number;
};

export type BillingSubscriptionView = {
  id: string;
  planId: string;
  status: Database["public"]["Enums"]["subscription_status"];
  billingType: BillingType | null;
  gatewayStatus: string;
  nextDueDate: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  contractedPriceCents: number | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  hasRemoteSubscription: boolean;
  plan: BillingPlan | null;
};

export type BillingLastCancellation = {
  canceledAt: string;
  cancelReason: string | null;
};

export type BillingCustomerView = {
  holderName: string;
  documentMasked: string;
  personType: string;
  hasGatewayCustomer: boolean;
};

export type BillingInvoice = {
  id: string;
  amountCents: number;
  status: Database["public"]["Enums"]["payment_status"];
  method: Database["public"]["Enums"]["payment_method"] | null;
  dueDate: string | null;
  paidAt: string | null;
  invoiceUrl: string | null;
  createdAt: string;
};

export type BillingPageData = {
  plans: BillingPlan[];
  subscription: BillingSubscriptionView | null;
  customer: BillingCustomerView | null;
  invoices: BillingInvoice[];
  asaasConfigured: boolean;
  trialAvailable: boolean;
  hasUsedTrial: boolean;
  lastCanceled: BillingLastCancellation | null;
};
