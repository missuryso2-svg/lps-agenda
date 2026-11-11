import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "@/lib/env/public";
import type { Database } from "@/types/database";

/**
 * Cliente Supabase por requisição (Server Components, Server Actions e Route Handlers).
 * A sessão é lida/gravada pelos cookies do Next.js.
 */
export async function createClient(): Promise<SupabaseClient<Database>> {
  const env = getSupabasePublicEnv();

  if (!env) {
    throw new Error(
      "Supabase não configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components não podem gravar cookies. O proxy renova a sessão.
          }
        },
      },
    },
  );
}
