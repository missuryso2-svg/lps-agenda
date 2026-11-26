"use server";

import { z } from "zod";
import { getActiveDashboardContext } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export async function claimAutomaticTrialWelcome(shop: string): Promise<boolean> {
  if (!z.uuid().safeParse(shop).success) return false;
  const context = await getActiveDashboardContext();
  if (context?.active.role !== "owner" || context.active.barbershop_id !== shop) return false;

  const db = await createClient();
  const { data, error } = await db.rpc("claim_automatic_trial_welcome", { p_shop: shop });
  return !error && data === true;
}
