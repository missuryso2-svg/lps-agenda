import sharp from "sharp";
import { crc32 } from "node:zlib";

export function pngChunk(type, contents) {
  const bytes = Buffer.alloc(contents.length + 12);
  bytes.writeUInt32BE(contents.length);
  bytes.write(type, 4, 4, "ascii");
  contents.copy(bytes, 8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, bytes.length - 4)), bytes.length - 4);
  return bytes;
}

export async function uploadImages() {
  const width = 1280, height = 640;
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    const border = x < 256 || x >= 1024;
    pixels.set(border ? [185, 40, 20, 102] : [35, 180, 20, 102], i * 4);
  }
  const image = sharp(pixels, { raw: { width, height, channels: 4 } });
  const png = await image.clone().png().toBuffer();
  const jpeg = await image.clone().jpeg({ progressive: true }).withMetadata({ orientation: 6 }).toBuffer();
  const webp = await image.clone().webp().toBuffer();
  const frames = Buffer.concat([Buffer.alloc(16, 255), Buffer.alloc(16, 30)]);
  const animatedWebp = await sharp(frames, {
    raw: { width: 2, height: 4, channels: 4, pageHeight: 2 },
  }).webp({ delay: [100, 100] }).toBuffer();
  const oversizedPixels = await sharp({
    create: { width: 4096, height: 4096, channels: 3, background: "red" },
  }).png().toBuffer();
  const brokenPng = Buffer.from(png);
  brokenPng[brokenPng.indexOf("IDAT") + 4] ^= 1;
  return { png, jpeg, webp, animatedWebp, oversizedPixels, brokenPng };
}
