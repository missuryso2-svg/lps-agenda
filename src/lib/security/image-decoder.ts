export class ImageDecoderUnavailable extends Error {
  constructor() {
    super("O processador de imagens está indisponível.");
    this.name = "ImageDecoderUnavailable";
  }
}

/** Load the native decoder only after authorization and cheap input checks. */
export async function loadImageDecoder() {
  try {
    return (await import("sharp")).default;
  } catch {
    throw new ImageDecoderUnavailable();
  }
}
