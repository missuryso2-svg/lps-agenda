import "./browser-safe-zod";
import { z } from "zod";

export const BILLING_TYPES = ["boleto", "pix"] as const;

export type BillingType = (typeof BILLING_TYPES)[number];

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  boleto: "Boleto",
  pix: "Pix",
};

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);

  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  function checkDigit(length: number): number {
    let sum = 0;

    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }

    const remainder = (sum * 10) % 11;

    return remainder === 10 ? 0 : remainder;
  }

  return (
    checkDigit(9) === Number(digits[9]) &&
    checkDigit(10) === Number(digits[10])
  );
}

export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value);

  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) {
    return false;
  }

  function checkDigit(length: number): number {
    let sum = 0;
    let weight = length - 7;

    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weight;
      weight -= 1;

      if (weight === 1) {
        weight = 9;
      }
    }

    const remainder = sum % 11;

    return remainder < 2 ? 0 : 11 - remainder;
  }

  return (
    checkDigit(12) === Number(digits[12]) &&
    checkDigit(13) === Number(digits[13])
  );
}

export function isValidDocument(value: string): boolean {
  const digits = onlyDigits(value);

  return (
    (digits.length === 11 && isValidCpf(digits)) ||
    (digits.length === 14 && isValidCnpj(digits))
  );
}

export function personTypeFromDocument(
  value: string,
): "individual" | "company" {
  return onlyDigits(value).length === 14 ? "company" : "individual";
}

export function maskDocument(value: string): string {
  const digits = onlyDigits(value);

  if (digits.length === 11) {
    return `***.***.***-${digits.slice(-2)}`;
  }

  if (digits.length === 14) {
    return `**.***.***/****-${digits.slice(-2)}`;
  }

  return "—";
}

export function billingTypeFromValue(value: string): BillingType | null {
  return value === "boleto" || value === "pix" ? value : null;
}

const holderNameSchema = z
  .string()
  .trim()
  .min(2, "Informe o nome do pagador.")
  .max(120, "O nome do pagador deve ter no máximo 120 caracteres.");

const documentSchema = z
  .string()
  .trim()
  .min(1, "Informe o CPF ou CNPJ do pagador.")
  .transform(onlyDigits)
  .refine(
    (value) => value.length === 11 || value.length === 14,
    "Informe um CPF ou CNPJ válido.",
  )
  .refine(
    (value) =>
      (value.length === 11 && isValidCpf(value)) ||
      (value.length === 14 && isValidCnpj(value)),
    "Informe um CPF ou CNPJ válido.",
  );

const billingTypeSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .refine(
    (value): value is BillingType =>
      BILLING_TYPES.includes(value as BillingType),
    "Escolha boleto ou Pix.",
  );

export const startSubscriptionSchema = z.object({
  planId: z.uuid("Selecione um plano válido."),
  billingType: billingTypeSchema,
  holderName: holderNameSchema,
  document: documentSchema,
});

export const changePlanSchema = z.object({
  planId: z.uuid("Selecione um plano válido."),
});

export const cancelSubscriptionSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, "O motivo deve ter no máximo 500 caracteres.")
    .default(""),
});

export type StartSubscriptionInput = z.infer<typeof startSubscriptionSchema>;
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
export type CancelSubscriptionInput = z.infer<
  typeof cancelSubscriptionSchema
>;
