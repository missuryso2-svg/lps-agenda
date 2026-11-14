import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

type RateLimitRule = {
  limit: number;
  windowSeconds: number;
};

export const publicBookingRateLimits = {
  availabilityIp: { limit: 60, windowSeconds: 5 * 60 },
  createBookingIp: { limit: 10, windowSeconds: 15 * 60 },
  createBookingPhone: { limit: 5, windowSeconds: 60 * 60 },
  cancelIp: { limit: 10, windowSeconds: 10 * 60 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitCheck =
  | { status: "allowed" }
  | { status: "limited" }
  | { status: "error" };

/**
 * IPs podem vir de proxies diferentes. O primeiro item de
 * x-forwarded-for é o cliente original; sem cabeçalho, usamos "unknown".
 * O valor nunca é persistido em texto puro.
 */
export async function getClientIp(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  const candidate =
    forwarded?.split(",")[0]?.trim() ||
    store.get("x-real-ip")?.trim() ||
    "unknown";

  return candidate.slice(0, 64);
}

export function hashRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * A função SQL incrementa e decide na mesma transação. Se ela não estiver
 * disponível, devolvemos "error" para que a action possa falhar de forma
 * segura nas escritas e apenas registrar o problema nas leituras.
 */
export async function checkRateLimit(
  supabase: Supabase,
  bucket: string,
  rule: RateLimitRule,
): Promise<RateLimitCheck> {
  const { data, error } = await supabase.rpc("consume_booking_rate_limit", {
    p_bucket: bucket,
    p_window_seconds: rule.windowSeconds,
    p_limit: rule.limit,
  });

  if (error) {
    return { status: "error" };
  }

  return data === true ? { status: "allowed" } : { status: "limited" };
}
