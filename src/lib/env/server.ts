import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY é obrigatória no servidor."),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
});

const simpleSequenceBase = "0123456789abcdefghijklmnopqrstuvwxyz";
const simpleSequences = [
  simpleSequenceBase.repeat(8),
  [...simpleSequenceBase].reverse().join("").repeat(8),
];

/**
 * O Asaas recusa tokens óbvios. Além de repetições, rejeitamos sequências
 * contínuas do alfabeto alfanumérico, que são o caso mais comum de token fraco.
 */
function isSimpleWebhookToken(value: string): boolean {
  if (/^(.{1,16})\1+$/.test(value)) {
    return true;
  }

  const normalized = value.toLowerCase();

  return simpleSequences.some((sequence) => sequence.includes(normalized));
}

const asaasWebhookTokenSchema = z
  .string()
  .min(32, "ASAAS_WEBHOOK_TOKEN deve ter entre 32 e 255 caracteres.")
  .max(255, "ASAAS_WEBHOOK_TOKEN deve ter entre 32 e 255 caracteres.")
  .refine((value) => !/\s/.test(value), {
    message: "ASAAS_WEBHOOK_TOKEN não pode conter espaços em branco.",
  })
  .refine((value) => !isSimpleWebhookToken(value), {
    message: "ASAAS_WEBHOOK_TOKEN não pode ser uma sequência simples.",
  });

/**
 * Nesta fase a integração só pode apontar para o Sandbox do Asaas.
 * Qualquer outro valor falha fechado para evitar cobrança real.
 */
const asaasEnvSchema = z.object({
  ASAAS_ENV: z.literal("sandbox").default("sandbox"),
  ASAAS_API_KEY: z.string().trim().min(1),
  ASAAS_WEBHOOK_TOKEN: asaasWebhookTokenSchema,
});

export type AsaasServerEnv = {
  environment: "sandbox";
  apiKey: string;
  webhookToken: string;
};

function readAsaasEnv() {
  return {
    ASAAS_ENV: process.env.ASAAS_ENV?.trim() || "sandbox",
    ASAAS_API_KEY: process.env.ASAAS_API_KEY,
    ASAAS_WEBHOOK_TOKEN: process.env.ASAAS_WEBHOOK_TOKEN,
  };
}

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

export function getAsaasEnv(): AsaasServerEnv {
  const parsed = asaasEnvSchema.safeParse(readAsaasEnv());

  if (!parsed.success) {
    throw new Error(
      "Asaas Sandbox não configurado. Defina ASAAS_ENV=sandbox, ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN no servidor.",
    );
  }

  return {
    environment: "sandbox",
    apiKey: parsed.data.ASAAS_API_KEY,
    webhookToken: parsed.data.ASAAS_WEBHOOK_TOKEN,
  };
}

export function isAsaasConfigured(): boolean {
  return asaasEnvSchema.safeParse(readAsaasEnv()).success;
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
