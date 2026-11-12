import { z } from "zod";

const phoneField = z
  .string()
  .trim()
  .max(24, "O telefone deve ter no máximo 24 caracteres.")
  .refine((value) => value.length === 0 || value.length >= 8, {
    message: "Informe um telefone válido ou deixe em branco.",
  });

const bioField = z
  .string()
  .trim()
  .max(800, "A descrição deve ter no máximo 800 caracteres.");

export const barberFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe um nome com ao menos 2 caracteres.")
    .max(120, "O nome deve ter no máximo 120 caracteres."),
  phone: phoneField,
  bio: bioField,
  isActive: z.boolean(),
  serviceIds: z
    .array(z.uuid("Identificador de serviço inválido."))
    .max(200, "Selecione no máximo 200 serviços.")
    .transform((ids) => [...new Set(ids)]),
});

export const barberIdSchema = z.uuid("Identificador de profissional inválido.");

export const barberActiveSchema = z.boolean({
  error: "Informe um status válido para o profissional.",
});

export type BarberFormValues = z.infer<typeof barberFormSchema>;
