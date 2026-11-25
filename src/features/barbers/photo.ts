import {
  maxUploadImageBytes,
  processUploadImage,
  readImageBody,
  type ImageProfile,
} from "@/lib/security/image-decoder";

export const maxPhotoBytes = maxUploadImageBytes;
const profile: ImageProfile = {
  fit: "cover",
  side: 480,
  maxOutputBytes: 512 * 1024,
  quality: [82],
};

export function normalizePhoto(bytes: Uint8Array, mime: string) {
  return processUploadImage(bytes, mime, profile);
}

export async function boundedPhoto(request: Request) {
  const bytes = await readImageBody(request.body, request.headers.get("content-length"), maxPhotoBytes);
  return normalizePhoto(bytes, request.headers.get("content-type") ?? "");
}
