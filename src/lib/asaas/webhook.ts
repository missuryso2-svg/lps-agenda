import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { getAsaasEnv } from "@/lib/env/server";
import type { Json } from "@/types/database";

const asaasPaymentSchema = z
  .object({
    id: z.string().min(1).max(120),
    customer: z.string().min(1).max(120).optional(),
    subscription: z.string().min(1).max(120).nullable().optional(),
    value: z.number().finite().nonnegative().max(10_000_000),
    netValue: z.number().finite().nonnegative().max(10_000_000).optional(),
    status: z.string().min(1).max(60),
    billingType: z.string().max(40).nullable().optional(),
    dueDate: z.string().max(10).nullable().optional(),
    confirmedDate: z.string().max(10).nullable().optional(),
    paymentDate: z.string().max(10).nullable().optional(),
    clientPaymentDate: z.string().max(10).nullable().optional(),
    invoiceUrl: z.string().max(500).nullable().optional(),
    externalReference: z.string().max(120).nullable().optional(),
    deleted: z.boolean().optional(),
  })
  .passthrough();

const asaasSubscriptionSchema = z
  .object({
    id: z.string().min(1).max(120),
    customer: z.string().min(1).max(120).nullable().optional(),
    status: z.string().min(1).max(40).optional(),
    nextDueDate: z.string().max(10).nullable().optional(),
    value: z.number().finite().nonnegative().max(10_000_000).optional(),
    cycle: z.string().max(20).nullable().optional(),
    billingType: z.string().max(40).nullable().optional(),
    externalReference: z.string().max(120).nullable().optional(),
    deleted: z.boolean().optional(),
  })
  .passthrough();

export const asaasWebhookSchema = z
  .object({
    id: z.string().min(1).max(200),
    event: z.string().min(1).max(120),
    payment: asaasPaymentSchema.optional(),
    subscription: asaasSubscriptionSchema.optional(),
  })
  .passthrough();

export type AsaasWebhookEvent = z.infer<typeof asaasWebhookSchema>;
export type AsaasWebhookPayment = z.infer<typeof asaasPaymentSchema>;
export type AsaasWebhookSubscription = z.infer<typeof asaasSubscriptionSchema>;

const sensitiveKeys = new Set([
  "creditcard",
  "creditcardnumber",
  "creditcardtoken",
  "cardnumber",
  "cvv",
  "securitycode",
]);

function sanitizeValue(value: unknown): Json {
  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value === "object") {
    const result: Record<string, Json> = {};

    for (const [key, item] of Object.entries(value)) {
      if (sensitiveKeys.has(key.toLowerCase())) {
        continue;
      }

      result[key] = sanitizeValue(item);
    }

    return result;
  }

  return null;
}

/**
 * O webhook do Asaas pode trazer dados de cartão (últimos dígitos e token).
 * Nesta fase só boleto/Pix são suportados, mas o evento é persistido antes de
 * ser classificado. A sanitização remove qualquer campo de cartão do payload.
 */
export function sanitizeAsaasWebhookPayload(payload: unknown): Json {
  return sanitizeValue(payload);
}

/**
 * Compara o header `asaas-access-token` em tempo constante.
 * O token do webhook nunca é a API Key do Asaas.
 */
export function verifyAsaasWebhookToken(received: string | null): boolean {
  if (!received) {
    return false;
  }

  const expected = getAsaasEnv().webhookToken;
  const receivedDigest = createHash("sha256").update(received).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();

  return timingSafeEqual(receivedDigest, expectedDigest);
}
