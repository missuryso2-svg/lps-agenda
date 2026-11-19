"use server";

import { revalidatePath } from "next/cache";

import {
  actionError,
  actionSuccess,
  fieldErrorsFrom,
  type ActionState,
} from "@/lib/actions";
import { authorizeAppointmentManagement } from "@/lib/auth/management";
import { getSupabasePublicEnv } from "@/lib/env/public";
import { createClient } from "@/lib/supabase/server";
import {
  appointmentFormSchema,
  appointmentIdSchema,
  availabilityQuerySchema,
  cancelAppointmentSchema,
  customerSearchQuerySchema,
  rescheduleAppointmentSchema,
} from "@/lib/validation/appointments";
import {
  appointmentTransitions,
  type AppointmentAction,
  type AppointmentStatus,
  type AvailabilityActionResult,
  type CustomerSearchResult,
} from "@/features/scheduling/types";
import { getBarbershopBookingAccess } from "@/features/scheduling/booking-access";
import {
  loadAvailability,
  searchCustomerOptions,
} from "@/features/scheduling/queries";
import type { Database } from "@/types/database";

const configMissing =
  "Supabase não configurado neste ambiente. Preencha o .env e reinicie o servidor.";

const genericError =
  "Não foi possível concluir a operação agora. Tente novamente.";

const unavailableSlotMessage =
  "O horário selecionado não está mais disponível. Atualize os horários e escolha outra opção.";
const bookingBlockedMessage =
  "Novos agendamentos estão bloqueados por uma pendência da assinatura. Acesse Plano e assinatura para regularizar o pagamento.";
const bookingAccessUnavailableMessage =
  "Não foi possível verificar se a barbearia pode aceitar novos agendamentos. Tente novamente.";

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

const statusLabels: Record<AppointmentStatus, string> = {
  scheduled: "agendado",
  confirmed: "confirmado",
  in_progress: "em atendimento",
  completed: "concluído",
  cancelled: "cancelado",
  no_show: "não compareceu",
};

function shopTimeZone(context: {
  active: { barbershop: { timezone: string | null } };
}): string {
  return context.active.barbershop.timezone || DEFAULT_TIME_ZONE;
}

function revalidateAppointments() {
  revalidatePath("/dashboard", "layout");
}

async function bookingRestriction(barbershopId: string): Promise<string | null> {
  try {
    const access = await getBarbershopBookingAccess(barbershopId);
    if (access.allowed) return null;
    return access.manual ? "Novos horários indisponíveis. Consulte Plano e assinatura." : bookingBlockedMessage;
  } catch {
    return bookingAccessUnavailableMessage;
  }
}

function appointmentMutationMessage(error: { code?: string } | null): string {
  switch (error?.code) {
    case "23P01":
      return "Este horário acabou de ser reservado por outro usuário. Atualize a agenda e escolha outro horário.";
    case "23503":
      return "Cliente, serviço ou profissional não pertencem a esta barbearia.";
    case "23514":
      return "O período do agendamento não respeita os limites permitidos.";
    case "P0001":
      return "Novos agendamentos estão bloqueados. Consulte Plano e assinatura.";
    case "42501":
      return "Você não tem permissão para alterar a agenda desta barbearia.";
    default:
      return genericError;
  }
}

export async function createAppointmentAction(
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const authorization = await authorizeAppointmentManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = appointmentFormSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os dados do agendamento.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const timeZone = shopTimeZone(authorization.context);
  const supabase = await createClient();

  const blocked = await bookingRestriction(barbershopId);
  if (blocked) return actionError(blocked);

  const customerPromise = supabase
    .from("customers")
    .select("id")
    .eq("id", parsed.data.customerId)
    .eq("barbershop_id", barbershopId)
    .eq("is_active", true)
    .maybeSingle();

  const availability = await loadAvailability({
    supabase,
    barbershopId,
    timeZone,
    serviceId: parsed.data.serviceId,
    barberId: parsed.data.barberId,
    date: parsed.data.date,
  });

  const customerResult = await customerPromise;

  if (customerResult.error) {
    return actionError(genericError);
  }

  if (!customerResult.data) {
    return actionError(
      "Selecione um cliente ativo cadastrado nesta barbearia.",
      {
        customerId: ["Cliente não encontrado ou inativo nesta barbearia."],
      },
    );
  }

  if (!availability.ok) {
    return actionError(availability.message, {
      serviceId: [availability.message],
    });
  }

  const slot = availability.data.slots.find(
    (item) => item.time === parsed.data.time,
  );

  if (!slot) {
    return actionError(availability.data.reason ?? unavailableSlotMessage, {
      time: [availability.data.reason ?? unavailableSlotMessage],
    });
  }

  const { error } = await supabase.from("appointments").insert({
    barbershop_id: barbershopId,
    customer_id: parsed.data.customerId,
    barber_id: parsed.data.barberId,
    service_id: parsed.data.serviceId,
    starts_at: slot.startsAt,
    ends_at: slot.endsAt,
    status: "scheduled",
    price_cents: availability.data.priceCents,
    notes: parsed.data.notes.length > 0 ? parsed.data.notes : null,
    created_by: authorization.context.user.id,
  });

  if (error) {
    return actionError(appointmentMutationMessage(error));
  }

  revalidateAppointments();
  return actionSuccess("Agendamento criado com sucesso.");
}

export async function rescheduleAppointmentAction(
  id: unknown,
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = appointmentIdSchema.safeParse(id);

  if (!parsedId.success) {
    return actionError(
      "Agendamento inválido. Atualize a página e tente novamente.",
    );
  }

  const authorization = await authorizeAppointmentManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = rescheduleAppointmentSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise a nova data e o novo horário.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const timeZone = shopTimeZone(authorization.context);
  const supabase = await createClient();

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id, barber_id, service_id, status")
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .maybeSingle();

  if (appointmentError) {
    return actionError(genericError);
  }

  if (!appointment) {
    return actionError("Agendamento não encontrado nesta barbearia.");
  }

  if (appointment.status !== "scheduled" && appointment.status !== "confirmed") {
    return actionError(
      `Um agendamento ${statusLabels[appointment.status]} não pode ser reagendado.`,
    );
  }

  const blocked = await bookingRestriction(barbershopId);
  if (blocked) return actionError(blocked);

  const availability = await loadAvailability({
    supabase,
    barbershopId,
    timeZone,
    serviceId: appointment.service_id,
    barberId: appointment.barber_id,
    date: parsed.data.date,
    excludeAppointmentId: appointment.id,
  });

  if (!availability.ok) {
    return actionError(availability.message, {
      date: [availability.message],
    });
  }

  const slot = availability.data.slots.find(
    (item) => item.time === parsed.data.time,
  );

  if (!slot) {
    return actionError(availability.data.reason ?? unavailableSlotMessage, {
      time: [availability.data.reason ?? unavailableSlotMessage],
    });
  }

  const { data: updated, error } = await supabase
    .from("appointments")
    .update({
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
    })
    .eq("id", appointment.id)
    .eq("barbershop_id", barbershopId)
    .eq("status", appointment.status)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(appointmentMutationMessage(error));
  }

  if (!updated) {
    return actionError(
      "O agendamento foi alterado por outro usuário. Atualize a agenda e tente novamente.",
    );
  }

  revalidateAppointments();
  return actionSuccess("Agendamento reagendado com sucesso.");
}

async function transitionAppointment(
  id: unknown,
  action: AppointmentAction,
  cancelValues?: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = appointmentIdSchema.safeParse(id);

  if (!parsedId.success) {
    return actionError(
      "Agendamento inválido. Atualize a página e tente novamente.",
    );
  }

  const authorization = await authorizeAppointmentManagement();

  if (authorization.error) {
    return authorization.error;
  }

  let cancelReason: string | null = null;

  if (action === "cancel") {
    const parsedCancel = cancelAppointmentSchema.safeParse(cancelValues ?? {});

    if (!parsedCancel.success) {
      return actionError(
        "Revise o motivo do cancelamento.",
        fieldErrorsFrom(parsedCancel.error),
      );
    }

    cancelReason =
      parsedCancel.data.reason.length > 0 ? parsedCancel.data.reason : null;
  }

  const transition = appointmentTransitions[action];
  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id, status")
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .maybeSingle();

  if (appointmentError) {
    return actionError(genericError);
  }

  if (!appointment) {
    return actionError("Agendamento não encontrado nesta barbearia.");
  }

  if (!transition.from.includes(appointment.status)) {
    return actionError(
      `Não é possível ${transition.label.toLocaleLowerCase(
        "pt-BR",
      )} um agendamento ${statusLabels[appointment.status]}.`,
    );
  }

  const update: Database["public"]["Tables"]["appointments"]["Update"] = {
    status: transition.to,
  };

  if (action === "cancel") {
    update.cancel_reason = cancelReason;
  }

  const { data: updated, error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", appointment.id)
    .eq("barbershop_id", barbershopId)
    .eq("status", appointment.status)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(appointmentMutationMessage(error));
  }

  if (!updated) {
    return actionError(
      "O status deste agendamento mudou enquanto a operação era realizada. Atualize a agenda e tente novamente.",
    );
  }

  revalidateAppointments();
  return actionSuccess(transition.successMessage);
}

export async function confirmAppointmentAction(
  id: unknown,
): Promise<ActionState> {
  return transitionAppointment(id, "confirm");
}

export async function startAppointmentAction(
  id: unknown,
): Promise<ActionState> {
  return transitionAppointment(id, "start");
}

export async function completeAppointmentAction(
  id: unknown,
): Promise<ActionState> {
  return transitionAppointment(id, "complete");
}

export async function markAppointmentNoShowAction(
  id: unknown,
): Promise<ActionState> {
  return transitionAppointment(id, "no_show");
}

export async function cancelAppointmentAction(
  id: unknown,
  values: unknown,
): Promise<ActionState> {
  return transitionAppointment(id, "cancel", values);
}

export async function getAppointmentAvailabilityAction(
  values: unknown,
): Promise<AvailabilityActionResult> {
  if (!getSupabasePublicEnv()) {
    return { status: "error", message: configMissing };
  }

  const authorization = await authorizeAppointmentManagement();

  if (authorization.error) {
    return {
      status: "error",
      message: authorization.error.message ?? genericError,
    };
  }

  const parsed = availabilityQuerySchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Selecione serviço, profissional e data para consultar os horários.",
    };
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();
  const blocked = await bookingRestriction(barbershopId);
  if (blocked) return { status: "error", message: blocked };
  let excludeAppointmentId: string | undefined;

  if (parsed.data.excludeAppointmentId) {
    const { data: excluded, error } = await supabase
      .from("appointments")
      .select("id")
      .eq("id", parsed.data.excludeAppointmentId)
      .eq("barbershop_id", barbershopId)
      .maybeSingle();

    if (error) {
      return { status: "error", message: genericError };
    }

    if (excluded) {
      excludeAppointmentId = excluded.id;
    }
  }

  const availability = await loadAvailability({
    supabase,
    barbershopId,
    timeZone: shopTimeZone(authorization.context),
    serviceId: parsed.data.serviceId,
    barberId: parsed.data.barberId,
    date: parsed.data.date,
    excludeAppointmentId,
  });

  if (!availability.ok) {
    return { status: "error", message: availability.message };
  }

  return { status: "success", availability: availability.data };
}

export async function searchAppointmentCustomersAction(
  values: unknown,
): Promise<CustomerSearchResult> {
  if (!getSupabasePublicEnv()) {
    return { status: "error", message: configMissing };
  }

  const authorization = await authorizeAppointmentManagement();

  if (authorization.error) {
    return {
      status: "error",
      message: authorization.error.message ?? genericError,
    };
  }

  const parsed = customerSearchQuerySchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "A busca deve ter no máximo 80 caracteres.",
    };
  }

  const customers = await searchCustomerOptions(
    authorization.context.active.barbershop_id,
    parsed.data,
  );

  return { status: "success", customers };
}
