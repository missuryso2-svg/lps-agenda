import { createHash } from "node:crypto";

import { bookingAddress } from "@/features/public-booking/qr/address";
import type { PublicBookingPageData } from "@/features/public-booking/types";

type Settings = Record<string, string | undefined>;

const publisherPattern = /^ca-pub-(?!0{16}$)\d{16}$/;
const slotPattern = /^(?!0{10}$)\d{10}$/;
const cmpIdPattern = /^[1-9]\d{0,3}$/;

function compareStableJson(left: unknown[], right: unknown[]): number {
  const leftJson = JSON.stringify(left);
  const rightJson = JSON.stringify(right);

  return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
}

/**
 * The information page is independent from advertising. It is available only
 * when it can show actual public business information, but this is not a claim
 * that the content meets AdSense's approval or value requirements.
 */
export function hasGuideContent(data: PublicBookingPageData): boolean {
  const { barbershop, services, businessHours } = data;

  return (
    barbershop.status === "active" &&
    Boolean(barbershop.name.trim()) &&
    Boolean(barbershop.description?.trim()) &&
    services.length > 0 &&
    services.some(
      (service) => Boolean(service.name.trim()) && Boolean(service.description?.trim()),
    ) &&
    businessHours.length > 0
  );
}

/**
 * Revision of every shop-controlled field displayed on the standalone guide.
 * A content edit invalidates the manual per-shop review entry.
 */
export function contentRevision(data: PublicBookingPageData): string {
  const services = data.services
    .map((service) => [
      service.name,
      service.description ?? "",
      service.durationMinutes,
    ])
    .sort(compareStableJson);
  const businessHours = data.businessHours
    .map((hours) => [hours.weekday, hours.opensAt, hours.closesAt])
    .sort(compareStableJson);

  return createHash("sha256")
    .update(
      JSON.stringify({
        slug: data.barbershop.slug,
        name: data.barbershop.name,
        description: data.barbershop.description ?? "",
        services,
        businessHours,
      }),
    )
    .digest("hex");
}

function hasReviewedRevision(data: PublicBookingPageData, reviewed: string | undefined) {
  const requiredEntry = `${data.barbershop.slug}@${contentRevision(data)}`;

  return (reviewed ?? "")
    .split(",")
    .some((entry) => entry.trim() === requiredEntry);
}

/**
 * Fail-closed server-side gate. Even a complete configuration is insufficient
 * without production, exact-origin approval, current content review, privacy
 * sign-off, and a deployed/verified certified CMP integration.
 */
export function adPlacement(
  data: PublicBookingPageData,
  env: Settings,
  appUrl: string | undefined,
) {
  if (
    env.NODE_ENV !== "production" ||
    env.ADSENSE_ENABLED !== "true" ||
    env.ADSENSE_DOMAIN_APPROVED !== "true" ||
    env.ADSENSE_PRIVACY_REVIEWED !== "true" ||
    env.ADSENSE_CMP_READY !== "true" ||
    !hasGuideContent(data) ||
    !hasReviewedRevision(data, env.ADSENSE_REVIEWED_SHOPS)
  ) {
    return null;
  }

  const address = bookingAddress(appUrl, data.barbershop.slug, false);

  if (!address) {
    return null;
  }

  const origin = new URL(address.url).origin;

  if (env.ADSENSE_APPROVED_ORIGIN !== origin) {
    return null;
  }

  const publisher = env.ADSENSE_PUBLISHER_ID ?? "";
  const slot = env.ADSENSE_BOOKING_SLOT ?? "";
  const cmp = env.ADSENSE_CMP_ID ?? "";

  if (
    !publisherPattern.test(publisher) ||
    !slotPattern.test(slot) ||
    !cmpIdPattern.test(cmp)
  ) {
    return null;
  }

  return { publisher, slot, cmp, origin };
}
