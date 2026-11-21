"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveDashboardContext } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { timeSchema } from "@/lib/validation/schedule";
import { actionError, actionSuccess } from "@/lib/actions";

const pauseSchema = z
  .object({
    barber: z.uuid(),
    weekday: z.number().int().min(0).max(6),
    start: timeSchema,
    end: timeSchema,
    enabled: z.boolean(),
  })
  .refine((v) => v.start < v.end);
export async function saveBarberBreak(values: unknown) {
  const ctx = await getActiveDashboardContext();
  if (ctx?.active.role !== "owner")
    return actionError("Apenas o proprietário pode alterar as pausas.");
  const parsed = pauseSchema.safeParse(values);
  if (!parsed.success)
    return actionError(
      "Selecione o profissional e um intervalo com início anterior ao fim.",
    );
  const { barber, weekday, start, end, enabled } = parsed.data;
  const db = await createClient();
  const { error } = await db
    .from("barber_breaks")
    .upsert(
      {
        barbershop_id: ctx.active.barbershop_id,
        barber_id: barber,
        weekday,
        starts_at: start,
        ends_at: end,
        is_active: enabled,
      },
      { onConflict: "barbershop_id,barber_id,weekday" },
    );
  if (error)
    return actionError(
      error.code === "23P01"
        ? "Há um atendimento no período. Ajuste a pausa ou reagende o cliente."
        : error.code === "23514"
          ? "A pausa deve estar dentro do expediente da barbearia e do profissional."
          : "Não foi possível salvar a pausa.",
    );
  revalidatePath("/dashboard/horarios");
  revalidatePath("/dashboard/agenda");
  return actionSuccess("Pausa salva.");
}

export async function readBookingNotice(id: string) {
  const ctx = await getActiveDashboardContext();
  if (!ctx || !z.uuid().safeParse(id).success)
    return actionError("Notificação indisponível.");
  const db = await createClient();
  const { data, error } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString(), status: "read" })
    .eq("id", id)
    .eq("user_id", ctx.user.id)
    .eq("barbershop_id", ctx.active.barbershop_id)
    .not("appointment_id", "is", null)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return actionError("Não foi possível marcar a notificação como lida.");
  revalidatePath("/dashboard", "layout");
  return actionSuccess("Notificação lida.");
}
