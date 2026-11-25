import "server-only";

import sharp from "sharp";
import {
  MAX_BARBERSHOP_LOGO_BYTES,
  MAX_BARBERSHOP_LOGO_PIXELS,
} from "./logo-policy";

export const maxBarbershopLogoBytes = MAX_BARBERSHOP_LOGO_BYTES;
function detectedFormat(bytes: Uint8Array) {
  const header = Buffer.from(bytes.subarray(0, 12));
  if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpeg";
  if (header.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "png";
  if (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export async function normalizeBarbershopLogo(
  bytes: Uint8Array,
  contentType: string,
): Promise<Buffer> {
  const mime = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const expectedFormat = detectedFormat(bytes);

  if (bytes.length > maxBarbershopLogoBytes || !expectedFormat || mime !== `image/${expectedFormat}`) {
    throw new Error("invalid logo");
  }

  const sharpOptions = {
    limitInputPixels: MAX_BARBERSHOP_LOGO_PIXELS,
    failOn: "warning",
  } as const;
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
