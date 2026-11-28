"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/env/public";
import { authCookieOptions } from "@/lib/supabase/auth-cookie-options";
import type { Database } from "@/types/database";

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Cliente Supabase para o navegador. Usa apenas a chave anônima.
 * Nunca importe service role ou segredos neste módulo.
 */
export function createClient(): SupabaseClient<Database> {
  const env = getSupabasePublicEnv();

  if (!env) {
    throw new Error(
      "Supabase não configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookieOptions: authCookieOptions },
    );
  }

  return browserClient;
}
