import "server-only";

import { loadImageDecoder } from "@/lib/security/image-decoder";
import { rasterFormat } from "@/lib/security/image-signature";
import {
  MAX_BARBERSHOP_LOGO_BYTES,
  MAX_BARBERSHOP_LOGO_PIXELS,
} from "./logo-policy";

export const maxBarbershopLogoBytes = MAX_BARBERSHOP_LOGO_BYTES;

export async function normalizeBarbershopLogo(
  bytes: Uint8Array,
  contentType: string,
): Promise<Buffer> {
  const mime = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const expectedFormat = rasterFormat(bytes);

  if (bytes.length > maxBarbershopLogoBytes || !expectedFormat || mime !== `image/${expectedFormat}`) {
    throw new Error("invalid logo");
  }

  const sharpOptions = {
    limitInputPixels: MAX_BARBERSHOP_LOGO_PIXELS,
    failOn: "warning",
  } as const;
  const sharp = await loadImageDecoder();
  const metadata = await sharp(bytes, sharpOptions).metadata();

  if (
    metadata.format !== expectedFormat ||
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > MAX_BARBERSHOP_LOGO_PIXELS ||
    (metadata.pages ?? 1) !== 1
  ) {
    throw new Error("invalid logo");
  }

  for (const quality of [84, 76, 68, 60]) {
    const optimized = await sharp(bytes, sharpOptions)
      .rotate()
      .resize(1200, 1200, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality, alphaQuality: 100, effort: 4 })
      .toBuffer();

    if (optimized.length > 0 && optimized.length <= maxBarbershopLogoBytes) {
      return optimized;
    }
  }

  throw new Error("logo too large after normalization");
}

export async function boundedBarbershopLogo(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBarbershopLogoBytes) {
      throw new Error("too large");
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing logo");

  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > maxBarbershopLogoBytes) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(part.value);
  }

  return normalizeBarbershopLogo(
    Buffer.concat(chunks),
    request.headers.get("content-type") ?? "",
  );
}
