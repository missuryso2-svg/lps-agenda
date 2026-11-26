import type {
  PublicBarbershop,
  PublicBusinessHour,
} from "@/features/public-booking/types";
import { weekdayLabel } from "@/lib/format";

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Keep private and signed Storage paths outside the anonymous projection. */
export function publicLegacyImageUrl(value: string | null): string | null {
  const safe = safeHttpUrl(value);
  if (!safe) return null;

  try {
    const url = new URL(safe);
    const path = decodeURIComponent(url.pathname).toLowerCase().replaceAll("\\", "/");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    if (/(?:^|\/)barber-photos(?:\/|$)|\/storage\/v1\/(?:object|render\/image)\/(?:sign|authenticated)(?:\/|$)/.test(path)) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function barbershopAddressLines(
  shop: Pick<
    PublicBarbershop,
    | "addressStreet"
    | "addressNumber"
    | "addressComplement"
    | "addressDistrict"
    | "addressCity"
    | "addressState"
    | "addressZip"
  >,
): string[] {
  const street = [shop.addressStreet, shop.addressNumber]
    .filter(Boolean)
    .join(", ");
  const city = [shop.addressCity, shop.addressState]
    .filter(Boolean)
    .join(" / ");
  const lines = [
    street,
    shop.addressComplement,
    shop.addressDistrict,
    [city, shop.addressZip].filter(Boolean).join(" · "),
  ]
    .map((line) => line?.trim() ?? "")
    .filter(Boolean);

  return lines;
}

export type BusinessHoursDay = {
  weekday: number;
  label: string;
  hours: string;
};

export function businessHoursByDay(
  hours: PublicBusinessHour[],
): BusinessHoursDay[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const ranges = hours
      .filter((hour) => hour.weekday === weekday)
      .map(
        (hour) =>
          `${hour.opensAt.slice(0, 5)} às ${hour.closesAt.slice(0, 5)}`,
      );

    return {
      weekday,
      label: weekdayLabel(weekday),
      hours: ranges.length > 0 ? ranges.join(" · ") : "Fechado",
    };
  });
}
