import { z } from "zod";

export const CUSTOMER_NAME_MAX = 120;
export const CUSTOMER_EMAIL_MAX = 254;
export const CUSTOMER_NOTES_MAX = 2000;

const emailValueSchema = z
  .string()
  .email("Informe um e-mail válido.");

/**
 * Remove formatação e o código do país, devolvendo apenas os dígitos
 * nacionais do telefone. Exemplos:
 * "(11) 98765-4321" -> "11987654321"
 * "+55 11 98765-4321" -> "11987654321"
 */
export function normalizePhoneDigits(value: string): string {
  let digits = value.replace(/\D/g, "");

  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  ) {
    digits = digits.slice(2);
  }

  return digits;
}

/**
 * Valida um telefone brasileiro com DDD. Aceita fixo (10 dígitos) e
 * celular (11 dígitos). O primeiro dígito do número local não pode ser 0/1.
 */
export function isValidBrazilianPhone(value: string): boolean {
  const digits = normalizePhoneDigits(value);

  if (digits.length !== 10 && digits.length !== 11) {
    return false;
  }

  const areaCode = Number(digits.slice(0, 2));
  const firstLocalDigit = digits[2];

  return (
    areaCode >= 11 &&
    areaCode <= 99 &&
    firstLocalDigit !== undefined &&
    firstLocalDigit >= "2" &&
    firstLocalDigit <= "9"
  );
}

/**
 * Variações comuns de armazenamento legado do telefone. Cadastros novos
 * usam somente dígitos, mas a checagem de duplicidade também reconhece
 * números formatados que tenham sido gravados antes desta etapa.
 */
export function phoneLookupVariants(value: string): string[] {
  const digits = normalizePhoneDigits(value);

  if (!digits) {
    return [];
  }

  const variants = new Set<string>([
    digits,
    `55${digits}`,
    `+55${digits}`,
  ]);

  if (digits.length === 10 || digits.length === 11) {
    const areaCode = digits.slice(0, 2);
    const local = digits.slice(2);
    const prefix = local.slice(0, local.length - 4);
    const suffix = local.slice(-4);

    variants.add(`(${areaCode}) ${prefix}-${suffix}`);
    variants.add(`(${areaCode}) ${prefix}${suffix}`);
    variants.add(`${areaCode} ${prefix}-${suffix}`);
    variants.add(`${areaCode}${prefix}${suffix}`);
    variants.add(`${prefix}-${suffix}`);
  }

  return [...variants];
}

export const customerFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Informe o nome completo do cliente.")
    .max(
      CUSTOMER_NAME_MAX,
      `O nome deve ter no máximo ${CUSTOMER_NAME_MAX} caracteres.`,
    )
    .transform((value) => value.replace(/\s+/g, " ")),
  phone: z
    .string()
    .trim()
    .min(1, "Informe o telefone do cliente.")
    .max(24, "O telefone deve ter no máximo 24 caracteres.")
    .transform(normalizePhoneDigits)
    .refine(isValidBrazilianPhone, "Informe um telefone válido com DDD."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(
      CUSTOMER_EMAIL_MAX,
      `O e-mail deve ter no máximo ${CUSTOMER_EMAIL_MAX} caracteres.`,
    )
    .refine(
      (value) => value.length === 0 || emailValueSchema.safeParse(value).success,
      "Informe um e-mail válido.",
    ),
  notes: z
    .string()
    .trim()
    .max(
      CUSTOMER_NOTES_MAX,
      `As observações devem ter no máximo ${CUSTOMER_NOTES_MAX} caracteres.`,
    ),
});

export const customerIdSchema = z.uuid(
  "Identificador de cliente inválido.",
);

export const customerActiveSchema = z.boolean({
  error: "Informe uma situação válida para o cliente.",
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;
