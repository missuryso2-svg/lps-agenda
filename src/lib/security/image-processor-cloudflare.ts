import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ImageBodyTooLarge, ImageDecoderUnavailable, readImageBody, type ImageProcessor } from "./image-decoder";
import { InvalidImage } from "./image-container";

function inputStream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

type UploadImagesBinding = {
  info(input: ReadableStream<Uint8Array>): Promise<{ format: string; width?: number; height?: number }>;
  input(input: ReadableStream<Uint8Array>): {
    transform(options: { width: number; height: number; fit: "cover" | "scale-down"; gravity?: "center" }): {
      output(options: { format: "image/webp"; quality: number; anim: false }): Promise<{ response(): Response }>;
    };
  };
};

declare global {
  interface CloudflareEnv {
    UPLOAD_IMAGES?: UploadImagesBinding;
  }
}

function isUnsupportedImage(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === 9412 || error.code === 9520;
}

export const processImage: ImageProcessor = async (bytes, raster, profile) => {
  try {
    const binding = getCloudflareContext().env.UPLOAD_IMAGES;
    if (!binding) throw new ImageDecoderUnavailable();
    const info = await binding.info(inputStream(bytes));
    const rawSize = info.width === raster.width && info.height === raster.height;
    const orientedSize = info.width === raster.oriented.width && info.height === raster.oriented.height;
    if (info.format !== `image/${raster.format}` || (!rawSize && !orientedSize)) throw new InvalidImage();
    const { width, height } = raster.oriented;
    for (const quality of profile.quality) {
      const result = await binding.input(inputStream(bytes))
        .transform(profile.fit === "cover" ? {
          width: Math.min(width, profile.side), height: Math.min(height, profile.side),
          fit: "cover", gravity: "center",
        } : { width: profile.side, height: profile.side, fit: "scale-down" })
        .output({ format: "image/webp", quality, anim: false });
      const response = result.response();
      if (!response.ok || response.headers.get("content-type") !== "image/webp") {
        await response.body?.cancel().catch(() => {});
        throw new ImageDecoderUnavailable();
      }
      try {
        return await readImageBody(response.body, response.headers.get("content-length"), profile.maxOutputBytes);
      } catch (error) {
        if (!(error instanceof ImageBodyTooLarge)) throw new ImageDecoderUnavailable();
      }
    }
    throw new InvalidImage();
  } catch (error) {
    if (error instanceof InvalidImage || isUnsupportedImage(error)) throw new InvalidImage();
    throw new ImageDecoderUnavailable();
  }
};
