import "server-only";

import { cache } from "react";
import { z } from "zod";
import { getSupabasePublicEnv } from "@/lib/env/public";
import { createClient } from "@/lib/supabase/server";

const trialSchema = z.object({
  started_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  observed_at: z.iso.datetime({ offset: true }),
  running: z.boolean(),
  welcome_available: z.boolean(),
});

export const automaticTrialAvailable = cache(async () => {
  if (!getSupabasePublicEnv()) return false;
  try {
    const db = await createClient();
    const { data, error } = await db
      .rpc("automatic_premium_trial_available")
      .abortSignal(AbortSignal.timeout(750));
    return !error && data === true;
  } catch {
    return false;
  }
});

export const getOwnerAutomaticTrial = cache(async (shop: string) => {
  const db = await createClient();
  const { data, error } = await db.rpc("get_owner_automatic_trial", { p_shop: shop });
  if (error) throw error;
  const trial = trialSchema.nullable().safeParse(data);
  if (!trial.success) throw trial.error;
  return trial.data;
});
