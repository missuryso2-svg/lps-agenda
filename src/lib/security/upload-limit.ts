import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, hashRateLimitKey } from "@/features/public-booking/rate-limit";

/** Called only after owner authorization. Shared tenant budget prevents IP spoofing bypass. */
export async function limitImageMutation(shopId: string): Promise<Response | null> {
  try {
    const result = await checkRateLimit(createAdminClient(), "images:" + hashRateLimitKey(shopId), {
      limit: 30, windowSeconds: 300,
    });
    if (result.status === "allowed") return null;
    if (result.status === "limited") return Response.json(
      { message: "Muitas alterações de imagem. Aguarde cinco minutos e tente novamente." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "300" } },
    );
  } catch { /* A limiter outage must not enable expensive uploads. */ }
  return Response.json(
    { message: "Não foi possível validar o limite de imagens. Tente novamente em instantes." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
