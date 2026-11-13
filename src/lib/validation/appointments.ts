import { z } from "zod";

import { dateFieldSchema, timeSchema } from "@/lib/validation/schedule";

const appointmentNotesSchema = z
  .string()
  .trim()
  .max(2000, "As observações devem ter no máximo 2000 caracteres.")
  .default("");

export const appointmentCustomerIdSchema = z.uuid(
  "Selecione um cliente válido.",
);

export const appointmentServiceIdSchema = z.uuid(
  "Selecione um serviço válido.",
);

export const appointmentBarberIdSchema = z.uuid(
  "Selecione um profissional válido.",
);

export const appointmentIdSchema = z.uuid("Identificador de agendamento inválido.");

export const appointmentFormSchema = z.object({
  customerId: appointmentCustomerIdSchema,
  serviceId: appointmentServiceIdSchema,
  barberId: appointmentBarberIdSchema,
  date: dateFieldSchema,
  time: timeSchema,
  notes: appointmentNotesSchema,
});

export const rescheduleAppointmentSchema = z.object({
  date: dateFieldSchema,
  time: timeSchema,
});

export const cancelAppointmentSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, "O motivo deve ter no máximo 500 caracteres.")
    .default(""),
});

export const availabilityQuerySchema = z.object({
  serviceId: appointmentServiceIdSchema,
  barberId: appointmentBarberIdSchema,
  date: dateFieldSchema,
  excludeAppointmentId: appointmentIdSchema.optional(),
});

export const customerSearchQuerySchema = z
  .string()
  .trim()
  .max(80, "A busca deve ter no máximo 80 caracteres.");

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;
export type RescheduleAppointmentValues = z.infer<
  typeof rescheduleAppointmentSchema
>;
export type CancelAppointmentValues = z.infer<typeof cancelAppointmentSchema>;
export type AvailabilityQueryValues = z.infer<typeof availabilityQuerySchema>;
