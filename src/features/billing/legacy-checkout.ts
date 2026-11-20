import type { Database } from "@/types/database";

type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];

export function recoverableLegacy(row: Subscription) {
  if (row.gateway !== "asaas" || !row.external_reference) return false;
  if (row.gateway_subscription_id) return true;
  return (
    row.gateway_status === "pending_creation" &&
    ((row.checkout_attempts > 0 && Boolean(row.checkout_attempted_at)) ||
      Boolean(row.trial_started_at && row.trial_ends_at))
  );
}

export function canResumeCheckout(row: Subscription) {
  return (
    row.status === "pending" &&
    recoverableLegacy(row) &&
    (!row.trial_ends_at ||
      Boolean(row.trial_finalized_at && row.gateway_subscription_id)) &&
    row.contracted_price_cents !== null &&
    row.contracted_price_cents > 0 &&
    Boolean(row.contracted_interval && row.contracted_currency)
  );
}
