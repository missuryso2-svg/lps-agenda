import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";
import { contentSecurityPolicy } from "@/lib/security/csp";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce, process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NODE_ENV === "development");
  // Forwarded to the renderer, also when Auth refresh recreates the response.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", policy);
  request.headers.delete("Content-Security-Policy-Report-Only");
  const response = await updateSession(request);
  const enforce = process.env.CSP_ENFORCE === "true";
  // Next mirrors response headers back to the renderer. The baseline is set in
  // next.config, so it cannot replace the full nonce-bearing request policy.
  if (enforce) response.headers.set("Content-Security-Policy", policy);
  else response.headers.set("Content-Security-Policy-Report-Only", policy);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
