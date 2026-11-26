import "./browser-safe-zod";
import { z } from "zod";

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "O identificador deve ter ao menos 3 caracteres.")
  .max(60, "O identificador deve ter no máximo 60 caracteres.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use letras minúsculas, números e hífens. Não comece nem termine com hífen.",
  );

const phoneField = z
  .string()
  .trim()
  .max(24, "O telefone deve ter no máximo 24 caracteres.");

export const createBarbershopSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da barbearia.")
    .max(120, "O nome deve ter no máximo 120 caracteres."),
  slug: slugSchema,
  phone: phoneField,
  timezone: z.string().trim().min(1, "Selecione o fuso horário."),
});

export const updateBarbershopSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da barbearia.")
    .max(120, "O nome deve ter no máximo 120 caracteres."),
  description: z
    .string()
    .trim()
    .max(1000, "A descrição deve ter no máximo 1000 caracteres."),
  phone: phoneField,
  city: z.string().trim().max(120, "Cidade muito longa."),
  state: z
    .string()
    .trim()
    .max(2, "Use a sigla com 2 letras.")
    .transform((value) => value.toUpperCase())
    .refine((value) => value === "" || /^[A-Z]{2}$/.test(value), {
      message: "Use a sigla do estado em maiúsculas, como SP.",
    }),
});

export type CreateBarbershopInput = z.infer<typeof createBarbershopSchema>;
export type UpdateBarbershopInput = z.infer<typeof updateBarbershopSchema>;
