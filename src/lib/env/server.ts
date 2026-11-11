import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY é obrigatória no servidor."),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
});

export function getServiceRoleKey(): string {
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    throw new Error(
      "Supabase admin não configurado. Defina SUPABASE_SERVICE_ROLE_KEY no servidor.",
    );
  }

  return parsed.data.SUPABASE_SERVICE_ROLE_KEY;
}

export function getAppUrl(): string {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (value) {
    try {
      return new URL(value).origin;
    } catch {
      // Cai no fallback local abaixo.
    }
  }

  return "http://localhost:3000";
}
