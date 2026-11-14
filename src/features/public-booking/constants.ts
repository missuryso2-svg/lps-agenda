import { addDaysToDateString, todayInTimeZone } from "@/lib/format";

/**
 * Janela máxima de reserva pública. Evita que links públicos sejam usados para
 * bloquear horários muito distantes no futuro sem acompanhamento da barbearia.
 */
export const PUBLIC_BOOKING_HORIZON_DAYS = 60;

export function publicBookingDateWindow(
  timeZone: string,
  now = new Date(),
): { min: string; max: string } {
  const min = todayInTimeZone(timeZone, now);

  return {
    min,
    max: addDaysToDateString(min, PUBLIC_BOOKING_HORIZON_DAYS),
  };
}

export function isDateWithinPublicWindow(
  date: string,
  timeZone: string,
  now = new Date(),
): boolean {
  const { min, max } = publicBookingDateWindow(timeZone, now);

  return date >= min && date <= max;
}
