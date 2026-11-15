import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

const currentSubscriptionStatuses = [
  "pending",
  "trialing",
  "active",
  "past_due",
] as const;

export type PlanBarberLimit = {
  planName: string;
  maxBarbers: number | null;
};

/**
 * Lê o limite do plano vigente da barbearia. A fonte de verdade é o banco:
 * a assinatura atual aponta para o plano e o plano define max_barbers.
 *
 * Durante o trial a assinatura está em `trialing` e aponta para o plano
 * contratado, portanto o mesmo limite é aplicado desde o primeiro dia.
 * Barbearias sem assinatura vigente continuam operando sem limite nesta fase.
 * Planos sem limite (max_barbers nulo) também liberam a operação.
 */
export async function getPlanBarberLimit(
  supabase: Supabase,
  barbershopId: string,
): Promise<PlanBarberLimit | null> {
  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("plan_id")
    .eq("barbershop_id", barbershopId)
    .in("status", [...currentSubscriptionStatuses])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError || !subscription) {
    return null;
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("name, max_barbers")
    .eq("id", subscription.plan_id)
    .maybeSingle();

  if (planError || !plan) {
    return null;
  }

  return {
    planName: plan.name,
    maxBarbers: plan.max_barbers,
  };
}

export function barberLimitMessage(limit: PlanBarberLimit): string {
  const total = limit.maxBarbers ?? 0;
  const professionals = total === 1 ? "profissional ativo" : "profissionais ativos";

  return `O plano ${limit.planName} permite até ${total} ${professionals}. Desative um profissional ou faça upgrade do plano para continuar.`;
}
