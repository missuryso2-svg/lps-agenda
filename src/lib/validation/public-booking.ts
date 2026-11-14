import { z } from "zod";

import { slugSchema } from "@/lib/validation/barbershop";
import {
  CUSTOMER_EMAIL_MAX,
  CUSTOMER_NAME_MAX,
  isValidBrazilianPhone,
  normalizePhoneDigits,
} from "@/lib/validation/customers";
import { dateFieldSchema, timeSchema } from "@/lib/validation/schedule";

const emailValueSchema = z.string().email("Informe um e-mail válido.");

export const publicSlugSchema = slugSchema;

export const publicTokenSchema = z.uuid("Código de reserva inválido.");

export const publicServiceIdSchema = z.uuid("Selecione um serviço válido.");

export const publicBarberIdSchema = z.uuid("Selecione um profissional válido.");

export const publicBookingSchema = z.object({
  slug: publicSlugSchema,
  serviceId: publicServiceIdSchema,
  barberId: publicBarberIdSchema,
  date: dateFieldSchema,
  time: timeSchema,
  fullName: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(
      CUSTOMER_NAME_MAX,
      `O nome deve ter no máximo ${CUSTOMER_NAME_MAX} caracteres.`,
    )
    .transform((value) => value.replace(/\s+/g, " ")),
  phone: z
    .string()
    .trim()
    .min(1, "Informe seu telefone.")
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
      (value) =>
        value.length === 0 || emailValueSchema.safeParse(value).success,
      "Informe um e-mail válido.",
    )
    .default(""),
});

export const publicAvailabilityQuerySchema = z.object({
  slug: publicSlugSchema,
  serviceId: publicServiceIdSchema,
  barberId: publicBarberIdSchema,
  date: dateFieldSchema,
});

export const publicReservationLookupSchema = z.object({
  slug: publicSlugSchema,
  token: publicTokenSchema,
});

export const publicCancelSchema = publicReservationLookupSchema;

export type PublicBookingFormValues = z.infer<typeof publicBookingSchema>;
export type PublicAvailabilityQuery = z.infer<
  typeof publicAvailabilityQuerySchema
>;
export type PublicReservationLookup = z.infer<
  typeof publicReservationLookupSchema
>;
