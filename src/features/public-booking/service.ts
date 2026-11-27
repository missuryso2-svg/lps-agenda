import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isDateWithinPublicWindow,
  publicBookingDateWindow,
} from "@/features/public-booking/constants";
import { getBarbershopBookingAccess } from "@/features/scheduling/booking-access";
import {
  findPublicShop,
  type PublicShopLookup,
} from "@/features/public-booking/queries";
import type {
  PublicAvailabilityOutcome,
  PublicBookingOutcome,
  PublicCancelOutcome,
} from "@/features/public-booking/types";
import { loadAvailability } from "@/features/scheduling/queries";
import type { Database } from "@/types/database";
import { normalizePhoneDigits } from "@/lib/validation/customers";

type Supabase = SupabaseClient<Database>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const shopUnavailableMessage =
  "Agendamentos estão temporariamente indisponíveis. Entre em contato diretamente com a barbearia.";

const genericError =
  "Não foi possível concluir a reserva agora. Tente novamente em instantes.";

const unavailableSlotMessage =
  "O horário selecionado não está mais disponível. Escolha outro horário.";

function dateWindowMessage(min: string, max: string): string {
  return `Escolha uma data entre ${min.split("-").reverse().join("/")} e ${max
    .split("-")
    .reverse()
    .join("/")}.`;
}

function shopFailureMessage(status: Exclude<PublicShopLookup["status"], "ok">) {
  if (status === "inactive") {
    return shopUnavailableMessage;
  }

  if (status === "not_found") {
    return "Barbearia não encontrada. Confira o link de agendamento.";
  }

  return genericError;
}

export async function loadPublicAvailability({
  supabase,
  slug,
  serviceId,
  barberId,
  date,
  now = new Date(),
}: {
  supabase: Supabase;
  slug: string;
  serviceId: string;
  barberId: string;
  date: string;
  now?: Date;
}): Promise<PublicAvailabilityOutcome> {
  const shopLookup = await findPublicShop(supabase, slug);

  if (shopLookup.status !== "ok") {
    return {
      ok: false,
      message: shopFailureMessage(shopLookup.status),
    };
  }

  const shop = shopLookup.shop;

  const bookingAccess = await getBarbershopBookingAccess(shop.id, supabase);

  if (!bookingAccess.allowed) {
    return { ok: false, message: shopUnavailableMessage };
  }

  if (!isDateWithinPublicWindow(date, shop.timezone, now)) {
    const { min, max } = publicBookingDateWindow(shop.timezone, now);

    return {
      ok: false,
      message: dateWindowMessage(min, max),
    };
  }

  const availability = await loadAvailability({
    supabase,
    barbershopId: shop.id,
    timeZone: shop.timezone,
    serviceId,
    barberId,
    date,
    now,
  });

  if (!availability.ok) {
    return { ok: false, message: availability.message };
  }

  return { ok: true, availability: availability.data };
}

function insertErrorMessage(
  error: { code?: string } | null,
): {
  code: "conflict" | "token" | "booking_blocked" | "error";
  message: string;
} {
  if (error?.code === "23P01") {
    return {
      code: "conflict",
      message:
        "Este horário acabou de ser reservado por outra pessoa. Escolha outro horário.",
    };
  }

  if (error?.code === "23505") {
    return {
      code: "token",
      message:
        "Não foi possível gerar o código desta reserva. Tente novamente.",
    };
  }

  if (error?.code === "P0001") {
    return {
      code: "booking_blocked",
      message: shopUnavailableMessage,
    };
  }

  return { code: "error", message: genericError };
}

export async function createPublicBooking({
  supabase,
  input,
  now = new Date(),
  token,
}: {
  supabase: Supabase;
  input: {
    slug: string;
    serviceId: string;
    barberId: string;
    date: string;
    time: string;
    fullName: string;
    phone: string;
    email: string;
  };
  now?: Date;
  token?: string;
}): Promise<PublicBookingOutcome> {
  const shopLookup = await findPublicShop(supabase, input.slug);

  if (shopLookup.status !== "ok") {
    return {
      ok: false,
      code: shopLookup.status === "inactive" ? "inactive" : "not_found",
      message: shopFailureMessage(shopLookup.status),
    };
  }

  const shop = shopLookup.shop;

  const bookingAccess = await getBarbershopBookingAccess(shop.id, supabase);

  if (!bookingAccess.allowed) {
    return {
      ok: false,
      code: "booking_blocked",
      message: shopUnavailableMessage,
    };
  }

  if (!isDateWithinPublicWindow(input.date, shop.timezone, now)) {
    const { min, max } = publicBookingDateWindow(shop.timezone, now);

    return {
      ok: false,
      code: "invalid_date",
      message: dateWindowMessage(min, max),
      field: "date",
    };
  }

  const availability = await loadAvailability({
    supabase,
    barbershopId: shop.id,
    timeZone: shop.timezone,
    serviceId: input.serviceId,
    barberId: input.barberId,
    date: input.date,
    now,
  });

  if (!availability.ok) {
    return {
      ok: false,
      code: "unavailable",
      message: availability.message,
      field: "serviceId",
    };
  }

  const slot = availability.data.slots.find((item) => item.time === input.time);

  if (!slot) {
    return {
      ok: false,
      code: "unavailable",
      message: availability.data.reason ?? unavailableSlotMessage,
      field: "time",
    };
  }

  const phone = normalizePhoneDigits(input.phone);
  const { data: customerId, error: customerError } = await supabase.rpc(
    "find_or_create_public_customer",
    {
      p_barbershop_id: shop.id,
      p_full_name: input.fullName,
      p_phone: phone,
      p_email: input.email.length > 0 ? input.email : null,
    },
  );

  if (
    customerError ||
    typeof customerId !== "string" ||
    !uuidPattern.test(customerId)
  ) {
    return {
      ok: false,
      code: "customer",
      message: genericError,
    };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const publicToken = token ?? randomUUID();
    const { error } = await supabase.from("appointments").insert({
      barbershop_id: shop.id,
      customer_id: customerId,
      barber_id: input.barberId,
      service_id: input.serviceId,
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      status: "scheduled",
      price_cents: availability.data.priceCents,
      notes: null,
      public_token: publicToken,
      created_by: null,
    });

    if (!error) {
      return {
        ok: true,
        token: publicToken,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      };
    }

    if (error.code === "23505" && token === undefined && attempt === 0) {
      continue;
    }

    const mapped = insertErrorMessage(error);

    return {
      ok: false,
      code: mapped.code,
      message: mapped.message,
      field: mapped.code === "conflict" ? "time" : undefined,
    };
  }

  return {
    ok: false,
    code: "token",
    message: genericError,
  };
}

export async function cancelPublicReservation({
  supabase,
  slug,
  token,
  now = new Date(),
}: {
  supabase: Supabase;
  slug: string;
  token: string;
  now?: Date;
}): Promise<PublicCancelOutcome> {
  const shopLookup = await findPublicShop(supabase, slug, {
    requireActive: false,
  });

  if (shopLookup.status !== "ok") {
    return {
      ok: false,
      code: "not_found",
      message:
        "Reserva não encontrada. Confira o link recebido ou fale com a barbearia.",
    };
  }

  const shop = shopLookup.shop;
  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id, status, starts_at")
    .eq("barbershop_id", shop.id)
    .eq("public_token", token)
    .maybeSingle();

  if (appointmentError) {
    return { ok: false, code: "error", message: genericError };
  }

  if (!appointment) {
    return {
      ok: false,
      code: "not_found",
      message:
        "Reserva não encontrada. Confira o link recebido ou fale com a barbearia.",
    };
  }

  if (
    appointment.status !== "scheduled" &&
    appointment.status !== "confirmed"
  ) {
    return {
      ok: false,
      code: "not_cancellable",
      message: "Esta reserva não pode mais ser cancelada pelo link público.",
    };
  }

  if (new Date(appointment.starts_at).getTime() <= now.getTime()) {
    return {
      ok: false,
      code: "not_cancellable",
      message:
        "O horário desta reserva já começou. Fale diretamente com a barbearia.",
    };
  }

  const { data: updated, error } = await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      cancel_reason: "Cancelada pelo cliente na página pública",
    })
    .eq("id", appointment.id)
    .eq("barbershop_id", shop.id)
    .eq("public_token", token)
    .gt("starts_at", now.toISOString())
    .in("status", ["scheduled", "confirmed"])
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, code: "error", message: genericError };
  }

  if (!updated) {
    return {
      ok: false,
      code: "not_cancellable",
      message:
        "A reserva foi alterada enquanto o cancelamento era processado. Atualize a página e tente novamente.",
    };
  }

  return { ok: true };
}
