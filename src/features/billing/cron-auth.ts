import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const minSecretLength = 32;

/**
 * Segredos válidos da rotina de billing. O segredo dedicado tem precedência,
 * mas o CRON_SECRET padrão da Vercel também é aceito. Isso permite configurar
 * os dois no mesmo projeto sem que o header automático da Vercel seja rejeitado.
 * Segredos curtos falham fechado.
 */
export function getBillingCronSecrets(): string[] {
  return [process.env.BILLING_CRON_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length >= minSecretLength);
}

export function getBillingCronSecret(): string | null {
  return getBillingCronSecrets()[0] ?? null;
}

export function verifyBillingCronRequest(headers: Headers): boolean {
  const expectedSecrets = getBillingCronSecrets();

  if (expectedSecrets.length === 0) {
    return false;
  }

  const authorization = headers.get("authorization");
  const bearer =
    authorization?.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : null;
  const received =
    bearer ?? headers.get("x-billing-cron-secret")?.trim() ?? null;

  if (!received) {
    return false;
  }

  const receivedDigest = createHash("sha256").update(received).digest();

  return expectedSecrets.some((expected) =>
    timingSafeEqual(
      receivedDigest,
      createHash("sha256").update(expected).digest(),
    ),
  );
}
