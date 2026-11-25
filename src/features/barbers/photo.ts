import { loadImageDecoder } from "@/lib/security/image-decoder";
import { rasterFormat } from "@/lib/security/image-signature";

export const maxPhotoBytes = 2 * 1024 * 1024;
const formats = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function normalizePhoto(bytes: Uint8Array, mime: string) {
  if (
    !bytes.length ||
    bytes.length > maxPhotoBytes ||
    !Object.hasOwn(formats, mime) ||
    rasterFormat(bytes) !== formats[mime as keyof typeof formats]
  )
    throw new Error("invalid photo");
  const sharp = await loadImageDecoder();
  const image = sharp(bytes, {
    limitInputPixels: 16_000_000,
    failOn: "warning",
  });
  const meta = await image.metadata();
  if (
    meta.format !== formats[mime as keyof typeof formats] ||
    (meta.pages ?? 1) !== 1
  )
    throw new Error("invalid photo");
  return image
    .rotate()
    .resize(480, 480, { fit: "cover", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

export async function boundedPhoto(request: Request) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxPhotoBytes))
    throw new Error("too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing photo");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > maxPhotoBytes) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(part.value);
  }
  return normalizePhoto(
    Buffer.concat(chunks),
    request.headers.get("content-type") ?? "",
  );
}
