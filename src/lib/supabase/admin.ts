import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceRoleKey } from "@/lib/env/server";
import { getSupabasePublicEnv } from "@/lib/env/public";
import type { Database } from "@/types/database";

/**
 * Cliente administrativo. Bypassa RLS por design.
 * Use somente em rotas/actions server-side confiáveis (webhooks, cobrança, jobs).
 * Jamais importe este arquivo em um Client Component.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const env = getSupabasePublicEnv();

  if (!env) {
    throw new Error(
      "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    getServiceRoleKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          "X-Client-Info": "lps-agenda-admin",
        },
      },
    },
  );
}
