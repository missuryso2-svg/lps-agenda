import { cleanWebp, inspectRaster, InvalidImage, type RasterInfo } from "./image-container";
import { rasterFormat } from "./image-signature";

export const maxUploadImageBytes = 2 * 1024 * 1024;
export const maxUploadImagePixels = 16_000_000;

export type ImageProfile = {
  fit: "cover" | "inside";
  side: number;
  maxOutputBytes: number;
  quality: readonly [number, ...number[]];
};

export type ImageProcessor = (bytes: Buffer, raster: RasterInfo, profile: ImageProfile) => Promise<Buffer>;

export class ImageDecoderUnavailable extends Error {
  constructor() {
    super("O processador de imagens está indisponível.");
    this.name = "ImageDecoderUnavailable";
  }
}

export class ImageBodyTooLarge extends InvalidImage {}

export async function readImageBody(
  body: ReadableStream<Uint8Array> | null,
  length: string | null,
  maxBytes: number,
): Promise<Buffer> {
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    await body?.cancel().catch(() => {});
    throw new ImageBodyTooLarge();
  }
  if (!body) throw new InvalidImage();
  const reader = body.getReader();
  let bytes: Buffer = Buffer.alloc(0);
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      const nextSize = size + part.value.length;
      if (nextSize > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ImageBodyTooLarge();
      }
      if (nextSize > bytes.length) {
        const grown = Buffer.allocUnsafe(Math.min(maxBytes, Math.max(nextSize, bytes.length * 2, 16 * 1024)));
        bytes.copy(grown, 0, 0, size);
        bytes = grown;
      }
      bytes.set(part.value, size);
      size = nextSize;
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new InvalidImage();
  return bytes.subarray(0, size);
}

export async function processUploadImage(bytes: Uint8Array, mime: string, profile: ImageProfile): Promise<Buffer> {
  if (!bytes.length || bytes.length > maxUploadImageBytes) throw new InvalidImage();
  const contentType = mime.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== `image/${rasterFormat(bytes) ?? "unsupported"}` ||
      !["image/jpeg", "image/png", "image/webp"].includes(contentType)) throw new InvalidImage();
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const raster = inspectRaster(input, maxUploadImagePixels);

  // Wrangler supplies this server-only setting. A missing binding is an
  // outage in this mode, and must never fall back to loading native code.
  const { processImage } = process.env.LPS_IMAGE_PROCESSOR === "cloudflare"
    ? await import("./image-processor-cloudflare")
    : await import("./image-processor-node");
  const result = await processImage(input, raster, profile);
  try {
    if (result.length > profile.maxOutputBytes) throw new InvalidImage();
    const output = cleanWebp(result, profile.side ** 2);
    const { width, height } = inspectRaster(output, profile.side ** 2);
    const { width: originalWidth, height: originalHeight } = raster.oriented;
    const scale = Math.min(1, profile.side / Math.max(originalWidth, originalHeight));
    const expectedWidth = profile.fit === "inside" ? Math.round(originalWidth * scale) : Math.min(profile.side, originalWidth);
    const expectedHeight = profile.fit === "inside" ? Math.round(originalHeight * scale) : Math.min(profile.side, originalHeight);
    const tolerance = profile.fit === "inside" && scale < 1 ? 1 : 0;
    if (width > profile.side || height > profile.side ||
        Math.abs(width - Math.max(1, expectedWidth)) > tolerance ||
        Math.abs(height - Math.max(1, expectedHeight)) > tolerance) throw new InvalidImage();
    return output;
  } catch {
    // A malformed, oversized or misshapen response from the decoder is
    // never an upload candidate; keep the current Storage reference.
    throw new ImageDecoderUnavailable();
  }
}
