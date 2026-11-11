import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "NEXT_PUBLIC_SUPABASE_URL deve ser uma URL válida.",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY é obrigatória."),
});

export type SupabasePublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Retorna null quando o ambiente ainda não foi configurado.
 * Assim a interface pública, a demo e o build funcionam sem credenciais.
 */
export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  return parsed.success ? parsed.data : null;
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicEnv() !== null;
}
