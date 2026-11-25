import "server-only";

import { processUploadImage, readImageBody, type ImageProfile } from "@/lib/security/image-decoder";
import { MAX_BARBERSHOP_LOGO_BYTES } from "./logo-policy";

export const maxBarbershopLogoBytes = MAX_BARBERSHOP_LOGO_BYTES;
const profile: ImageProfile = {
  fit: "inside",
  side: 1200,
  maxOutputBytes: maxBarbershopLogoBytes,
  quality: [84, 76, 68, 60],
};

export function normalizeBarbershopLogo(bytes: Uint8Array, mime: string) {
  return processUploadImage(bytes, mime, profile);
}

export async function boundedBarbershopLogo(request: Request) {
  const bytes = await readImageBody(request.body, request.headers.get("content-length"), maxBarbershopLogoBytes);
  return normalizeBarbershopLogo(bytes, request.headers.get("content-type") ?? "");
}
