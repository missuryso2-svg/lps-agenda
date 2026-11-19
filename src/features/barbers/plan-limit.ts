import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type PlanBarberLimit = {
  planName: string;
  maxBarbers: number | null;
};

/**
 * Lê o limite do plano vigente da barbearia. A fonte de verdade é o banco:
 * a assinatura atual aponta para o plano e o plano define max_barbers.
 *
 * O trial manual usa o Básico desde o cadastro. A projeção mantém o limite
 * do trial histórico e a política legada para lojas sem assinatura.
 * Planos sem limite (max_barbers nulo) também liberam a operação.
 */
export async function getPlanBarberLimit(
  supabase: Supabase,
  barbershopId: string,
): Promise<PlanBarberLimit | null> {
  const { data, error } = await supabase.rpc("get_shop_professional_limit", { p_shop: barbershopId });
  if (error) throw new Error("Não foi possível consultar o limite de profissionais.");
  const plan = data?.[0];
  return plan ? { planName: plan.plan_name, maxBarbers: plan.max_barbers } : null;
}

export function barberLimitMessage(limit: PlanBarberLimit): string {
  const total = limit.maxBarbers ?? 0;
  const professionals = total === 1 ? "profissional ativo" : "profissionais ativos";

  return `O plano ${limit.planName} permite até ${total} ${professionals}. Desative um profissional ou faça upgrade do plano para continuar.`;
}
