import { ImageDecoderUnavailable, maxUploadImagePixels, type ImageProcessor } from "./image-decoder";
import { InvalidImage } from "./image-container";

export const processImage: ImageProcessor = async (bytes, raster, profile) => {
  const sharp = await import("sharp").then(module => module.default).catch(() => {
    throw new ImageDecoderUnavailable();
  });
  const createImage = () => sharp(bytes, { limitInputPixels: maxUploadImagePixels, failOn: "warning" });
  const metadata = await createImage().metadata();
  if (metadata.format !== raster.format || metadata.width !== raster.width ||
      metadata.height !== raster.height || (metadata.pages ?? 1) !== 1) throw new InvalidImage();

  for (const quality of profile.quality) {
    const output = await createImage()
      .rotate()
      .resize(profile.side, profile.side, { fit: profile.fit, withoutEnlargement: true })
      .webp(profile.fit === "inside" ? { quality, alphaQuality: 100, effort: 4 } : { quality })
      .toBuffer();
    if (output.length <= profile.maxOutputBytes) return output;
  }
  throw new InvalidImage();
};
