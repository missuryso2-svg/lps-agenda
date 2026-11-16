import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";

type Supabase = SupabaseClient<Database>;
type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];

export type BookingAccessState = "normal" | "grace" | "blocked";

export type BarbershopBookingAccess = {
  allowed: boolean;
  state: BookingAccessState;
  subscriptionStatus: SubscriptionStatus | null;
  pastDueSince: string | null;
  gracePeriodEndsAt: string | null;
  secondsRemaining: number | null;
};

export class BookingAccessUnavailableError extends Error {
  constructor() {
    super("Não foi possível verificar a autorização para novos agendamentos.");
    this.name = "BookingAccessUnavailableError";
  }
}

const subscriptionStatuses = new Set<SubscriptionStatus>([
  "pending",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

function isRecord(value: Json | null): value is { [key: string]: Json | undefined } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function parseBookingAccess(value: Json | null): BarbershopBookingAccess {
  if (!isRecord(value)) {
    throw new BookingAccessUnavailableError();
  }

  const statusValue = value.subscription_status;
  const isValidStatus =
    statusValue === null ||
    (typeof statusValue === "string" &&
      subscriptionStatuses.has(statusValue as SubscriptionStatus));
  const secondsRemaining = value.seconds_remaining;
  const state = value.state;

  if (
    typeof value.allowed !== "boolean" ||
    !isValidStatus ||
    (state !== "normal" && state !== "grace" && state !== "blocked") ||
    (secondsRemaining !== null &&
      secondsRemaining !== undefined &&
      (typeof secondsRemaining !== "number" ||
        !Number.isFinite(secondsRemaining)))
  ) {
    throw new BookingAccessUnavailableError();
  }

  return {
    allowed: value.allowed,
    state,
    subscriptionStatus:
      typeof statusValue === "string"
        ? (statusValue as SubscriptionStatus)
        : null,
    pastDueSince: nullableString(value.past_due_since),
    gracePeriodEndsAt: nullableString(value.grace_period_ends_at),
    secondsRemaining:
      typeof secondsRemaining === "number" ? secondsRemaining : null,
  };
}

/**
 * A decisão vem de uma RPC server-only calculada com o relógio do PostgreSQL.
 * Clientes autenticados não executam essa RPC diretamente; o ID recebido deve
 * ser derivado de um contexto autorizado ou de um slug público já resolvido.
 */
export async function getBarbershopBookingAccess(
  barbershopId: string,
  supabase: Supabase = createAdminClient(),
): Promise<BarbershopBookingAccess> {
  const { data, error } = await supabase.rpc(
    "get_barbershop_booking_access",
    { p_barbershop_id: barbershopId },
  );

  if (error) {
    throw new BookingAccessUnavailableError();
  }

  return parseBookingAccess(data);
}

export function bookingBlockedMessage(): string {
  return "Novos agendamentos estão bloqueados por uma pendência da assinatura. Acesse Plano e assinatura para regularizar o pagamento.";
}
