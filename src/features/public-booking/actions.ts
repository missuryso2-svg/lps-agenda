"use server";

import { revalidatePath } from "next/cache";

import {
  actionError,
  actionSuccess,
  fieldErrorsFrom,
  type ActionState,
} from "@/lib/actions";
import { getSupabasePublicEnv } from "@/lib/env/public";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  publicAvailabilityQuerySchema,
  publicBookingSchema,
  publicCancelSchema,
} from "@/lib/validation/public-booking";
import {
  checkRateLimit,
  getClientIp,
  hashRateLimitKey,
  publicBookingRateLimits,
} from "@/features/public-booking/rate-limit";
import {
  cancelPublicReservation,
  createPublicBooking,
  loadPublicAvailability,
} from "@/features/public-booking/service";
import type {
  PublicAvailabilityActionResult,
  PublicBookingActionResult,
} from "@/features/public-booking/types";

const configMissing =
  "Supabase não configurado neste ambiente. Preencha o .env e reinicie o servidor.";

const genericError =
  "Não foi possível concluir a operação agora. Tente novamente em instantes.";

const rateLimited =
  "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";

function bookingError(
  message: string,
  fieldErrors?: Record<string, string[] | undefined>,
): PublicBookingActionResult {
  return { status: "error", message, fieldErrors };
}

function revalidatePublicReservation(slug: string, token: string) {
  revalidatePath(`/agendar/${slug}/reserva/${token}`);
}

function revalidateDashboard() {
  revalidatePath("/dashboard", "layout");
}

export async function getPublicAvailabilityAction(
  values: unknown,
): Promise<PublicAvailabilityActionResult> {
  if (!getSupabasePublicEnv()) {
    return { status: "error", message: configMissing };
  }

  const parsed = publicAvailabilityQuerySchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Selecione serviço, profissional e data para ver os horários.",
    };
  }

  try {
    const supabase = createAdminClient();
    const ipHash = hashRateLimitKey(await getClientIp());
    const limit = await checkRateLimit(
      supabase,
      `public-booking:availability:${ipHash}`,
      publicBookingRateLimits.availabilityIp,
    );

    if (limit.status === "limited") {
      return { status: "error", message: rateLimited };
    }

    if (limit.status === "error") {
      // Leitura não deve derrubar a página; a escrita continua protegida.
      console.error("[public-booking] rate limit unavailable (availability)");
    }

    const result = await loadPublicAvailability({
      supabase,
      ...parsed.data,
    });

    if (!result.ok) {
      return { status: "error", message: result.message };
    }

    return { status: "success", availability: result.availability };
  } catch {
    return { status: "error", message: genericError };
  }
}

export async function createPublicBookingAction(
  values: unknown,
): Promise<PublicBookingActionResult> {
  if (!getSupabasePublicEnv()) {
    return bookingError(configMissing);
  }

  const parsed = publicBookingSchema.safeParse(values);

  if (!parsed.success) {
    return bookingError(
      "Revise os dados da reserva.",
      fieldErrorsFrom(parsed.error),
    );
  }

  try {
    const supabase = createAdminClient();
    const ipHash = hashRateLimitKey(await getClientIp());
    const phoneHash = hashRateLimitKey(parsed.data.phone);

    const ipLimit = await checkRateLimit(
      supabase,
      `public-booking:create:ip:${ipHash}`,
      publicBookingRateLimits.createBookingIp,
    );

    if (ipLimit.status === "limited") {
      return bookingError(rateLimited);
    }

    if (ipLimit.status === "error") {
      console.error("[public-booking] rate limit unavailable (create ip)");
      return bookingError(genericError);
    }

    const phoneLimit = await checkRateLimit(
      supabase,
      `public-booking:create:phone:${phoneHash}`,
      publicBookingRateLimits.createBookingPhone,
    );

    if (phoneLimit.status === "limited") {
      return bookingError(rateLimited);
    }

    if (phoneLimit.status === "error") {
      console.error("[public-booking] rate limit unavailable (create phone)");
      return bookingError(genericError);
    }

    const result = await createPublicBooking({
      supabase,
      input: parsed.data,
    });

    if (!result.ok) {
      if (result.field) {
        return bookingError(result.message, {
          [result.field]: [result.message],
        });
      }

      return bookingError(result.message);
    }

    revalidatePublicReservation(parsed.data.slug, result.token);
    revalidateDashboard();

    return {
      status: "success",
      message: "Reserva confirmada.",
      slug: parsed.data.slug,
      token: result.token,
    };
  } catch {
    return bookingError(genericError);
  }
}

export async function cancelPublicReservationAction(
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsed = publicCancelSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Reserva inválida. Confira o link recebido ou fale com a barbearia.",
    );
  }

  try {
    const supabase = createAdminClient();
    const ipHash = hashRateLimitKey(await getClientIp());
    const limit = await checkRateLimit(
      supabase,
      `public-booking:cancel:${ipHash}`,
      publicBookingRateLimits.cancelIp,
    );

    if (limit.status === "limited") {
      return actionError(rateLimited);
    }

    if (limit.status === "error") {
      console.error("[public-booking] rate limit unavailable (cancel)");
      return actionError(genericError);
    }

    const result = await cancelPublicReservation({
      supabase,
      slug: parsed.data.slug,
      token: parsed.data.token,
    });

    if (!result.ok) {
      return actionError(result.message);
    }

    revalidatePublicReservation(parsed.data.slug, parsed.data.token);
    revalidateDashboard();

    return actionSuccess(
      "Reserva cancelada e horário liberado. Até a próxima!",
    );
  } catch {
    return actionError(genericError);
  }
}
