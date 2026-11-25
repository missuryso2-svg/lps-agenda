import "server-only";

import { createHash } from "node:crypto";

import {
  BARBERSHOP_LOGO_BUCKET,
  isBarbershopLogoObject,
} from "./logo-policy";

export { BARBERSHOP_LOGO_BUCKET, isBarbershopLogoObject };

export function barbershopLogoVersion(reference: string | null | undefined) {
  return createHash("sha256")
    .update(reference ?? "", "utf8")
    .digest("base64url");
}

/** Converts the stored tenant-scoped key to a public URL for the isolated logo bucket. */
export function publicBarbershopLogoUrl(
  shopId: string,
  reference: string | null | undefined,
): string | null {
  if (!reference) return null;

  // Keep already-recorded public URLs readable. New writes are restricted by
  // the database trigger/RPC to a path in barbershop-logos.
  if (/^https?:\/\//i.test(reference)) return reference;
  if (!isBarbershopLogoObject(shopId, reference)) return null;

  try {
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!projectUrl) return null;
    const origin = new URL(projectUrl).origin;
    const path = reference
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");

    return `${origin}/storage/v1/object/public/${BARBERSHOP_LOGO_BUCKET}/${path}`;
  } catch {
    return null;
  }
}
