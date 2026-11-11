import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/env/public";
import { createClient } from "@/lib/supabase/server";

/**
 * Usuário validado no servidor via Supabase Auth.
 * Não confie em dados de sessão lidos apenas no cliente.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user;
});
