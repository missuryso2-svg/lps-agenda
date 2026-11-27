import "./browser-safe-zod";
import { z } from "zod";

export const MAX_SERVICE_PRICE_CENTS = 100_000_000;

/**
 * Converte um preço digitado em reais para centavos.
 * Aceita "45", "45,90", "45.90", "1.234,56" e "R$ 45,90".
 * Retorna null quando o valor é inválido ou está fora do limite do banco.
 */
export function parsePriceToCents(value: string): number | null {
  const raw = value
    .trim()
    .replace(/^R\$\s?/i, "")
    .replace(/\s+/g, "");

  if (!raw || !/^\d[\d.,]*$/.test(raw)) {
    return null;
  }

  let normalized: string;

  if (raw.includes(",")) {
    const valid =
      /^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$/.test(raw) ||
      /^\d+(?:,\d{1,2})?$/.test(raw);

    if (!valid) {
      return null;
    }

    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(".")) {
    const parts = raw.split(".");

    if (parts.some((part) => part.length === 0)) {
      return null;
    }

    if (parts.length > 2) {
      if (!/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
        return null;
      }

      normalized = raw.replace(/\./g, "");
    } else {
      const [integerPart, decimalPart] = parts;

      if (
        /^\d+$/.test(integerPart) &&
        /^\d{1,2}$/.test(decimalPart)
      ) {
        normalized = `${integerPart}.${decimalPart}`;
      } else if (
        /^\d{1,3}$/.test(integerPart) &&
        /^\d{3}$/.test(decimalPart)
      ) {
        normalized = `${integerPart}${decimalPart}`;
      } else {
        return null;
      }
    }
  } else {
    normalized = raw;
  }

  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    return null;
  }

  const cents = Math.round(amount * 100);

  if (cents < 0 || cents > MAX_SERVICE_PRICE_CENTS) {
    return null;
  }

  return cents;
}

export function formatCentsToPriceInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Normaliza o nome para comparação de duplicidade:
 * ignora caixa, acentos e espaços repetidos.
 */
export function normalizeServiceName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const priceField = z
  .string()
  .trim()
  .min(1, "Informe o preço do serviço.")
  .max(20, "Preço inválido.")
  .refine((value) => parsePriceToCents(value) !== null, {
    message: "Informe um preço válido, como 45,90.",
  });

const descriptionField = z
  .string()
  .trim()
  .max(800, "A descrição deve ter no máximo 800 caracteres.");

const isActiveField = z.boolean();

export const serviceFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe um nome com ao menos 2 caracteres.")
    .max(120, "O nome deve ter no máximo 120 caracteres."),
  description: descriptionField,
  price: priceField,
  durationMinutes: z
    .number({ error: "Informe a duração em minutos." })
    .int("A duração deve ser um número inteiro.")
    .min(5, "A duração mínima é de 5 minutos.")
    .max(600, "A duração máxima é de 600 minutos."),
  isActive: isActiveField,
});

export const serviceIdSchema = z.uuid("Identificador de serviço inválido.");

export const serviceActiveSchema = z.boolean({
  error: "Informe um status válido para o serviço.",
});

export type ServiceFormValues = z.infer<typeof serviceFormSchema>;
