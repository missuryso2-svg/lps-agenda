import "server-only";

import { getSupabasePublicEnv } from "@/lib/env/public";
import { getServiceRoleKey } from "@/lib/env/server";

/**
 * O fluxo público usa service role apenas no servidor. Sem essa credencial,
 * a página não deve tentar consultar o banco.
 */
export function isPublicBookingConfigured(): boolean {
  if (!getSupabasePublicEnv()) {
    return false;
  }

  try {
    getServiceRoleKey();
    return true;
  } catch {
    return false;
  }
}
