import { rasterFormat } from "./image-signature";

type Size = { width: number; height: number };
export type RasterInfo = Size & {
  format: NonNullable<ReturnType<typeof rasterFormat>>;
  oriented: Size;
};

export class InvalidImage extends Error {
  constructor() {
    super("Imagem inválida.");
    this.name = "InvalidImage";
  }
}

function invalid(): never {
  throw new InvalidImage();
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function validSize(width: number, height: number, maxPixels: number): Size {
  if (!width || !height || width > maxPixels / height) invalid();
  return { width, height };
}

// Only IFD0 orientation is needed. The codec still handles color and orientation.
function exifOrientation(bytes: Buffer): number {
  const tiff = bytes.subarray(bytes.toString("ascii", 0, 6) === "Exif\0\0" ? 6 : 0);
  if (tiff.length < 8) return 1;
  const order = tiff.toString("ascii", 0, 2);
  if (order !== "II" && order !== "MM") return 1;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.length);
  const little = order === "II";
  if (view.getUint16(2, little) !== 42) return 1;
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset + 2 > tiff.length) return 1;
  const count = view.getUint16(offset, little);
  if (offset + 2 + count * 12 > tiff.length) return 1;
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    if (view.getUint16(entry, little) === 0x112 &&
        view.getUint16(entry + 2, little) === 3 &&
        view.getUint32(entry + 4, little) === 1) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function png(bytes: Buffer, maxPixels: number) {
  if (bytes.length < 33 || bytes.readUInt32BE(8) !== 13 || bytes.toString("latin1", 12, 16) !== "IHDR") invalid();
  const size = validSize(bytes.readUInt32BE(16), bytes.readUInt32BE(20), maxPixels);
  const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (!depths[bytes[25]]?.includes(bytes[24]) || bytes[26] || bytes[27] || bytes[28] > 1) invalid();
  let orientation = 1;
  let data = false;
  let afterData = false;
  let chunkCount = 0;
  for (let start = 8; start <= bytes.length - 12;) {
    if (++chunkCount > 4096) invalid();
    const length = bytes.readUInt32BE(start);
    const payload = start + 8;
    const end = payload + length;
    if (end + 4 > bytes.length) invalid();
    const type = bytes.toString("latin1", start + 4, payload);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type) || ["acTL", "fcTL", "fdAT"].includes(type)) invalid();
    if (/^[A-Z]/.test(type) && !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)) invalid();
    if (type === "IHDR" && start !== 8) invalid();
    if (type === "eXIf") orientation = exifOrientation(bytes.subarray(payload, end));
    let crc = 0xffffffff;
    for (let i = start + 4; i < end; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 255];
    if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(end)) invalid();
    if (type === "IDAT") {
      if (afterData) invalid();
      data ||= length > 0;
    } else if (data) {
      afterData = true;
    }
    if (type === "IEND") {
      if (!data || length !== 0 || end + 4 !== bytes.length) invalid();
      return { size, orientation };
    }
    start = end + 4;
  }
  return invalid();
}

function jpeg(bytes: Buffer, maxPixels: number) {
  let size: Size | undefined;
  let orientation = 1;
  let scan = false;
  let insideScan = false;
  let scanData = false;
  let segments = 0;
  let offset = 2; // SOI was verified by rasterFormat.
  while (offset < bytes.length) {
    if (insideScan) {
      // Entropy-coded scans use stuffing (FF00) and restart markers (FFD0–D7).
      const nextMarker = bytes.indexOf(0xff, offset);
      if (nextMarker < 0) invalid();
      scanData ||= nextMarker > offset;
      offset = nextMarker;
    } else if (bytes[offset] !== 0xff) invalid();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (insideScan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) {
      scanData ||= marker === 0;
      continue;
    }
    if (insideScan && !scanData) invalid();
    insideScan = false;
    if (++segments > 4096) invalid();
    if (marker === 0xd9) {
      if (!scan || !size || offset !== bytes.length) invalid();
      return { size, orientation };
    }
    const app = marker >= 0xe0 && marker <= 0xef;
    const frame = marker === 0xc0 || marker === 0xc1 || marker === 0xc2;
    if (!app && !frame && ![0xc4, 0xda, 0xdb, 0xdd, 0xfe].includes(marker)) invalid();
    if (offset + 2 > bytes.length) invalid();
    const length = bytes.readUInt16BE(offset);
    const payload = offset + 2;
    const end = offset + length;
    if (length < 2 || end > bytes.length) invalid();
    if (frame) {
      if (size || length < 11 || length !== 8 + 3 * bytes[payload + 5]) invalid();
      size = validSize(bytes.readUInt16BE(payload + 3), bytes.readUInt16BE(payload + 1), maxPixels);
    }
    if (marker === 0xe1 && bytes.toString("latin1", payload, Math.min(payload + 6, end)) === "Exif\0\0")
      orientation = exifOrientation(bytes.subarray(payload, end));
    if (marker === 0xe2 && bytes.toString("latin1", payload, Math.min(payload + 4, end)) === "MPF\0") invalid();
    if (marker === 0xda) {
      if (!size || length < 8 || length !== 6 + 2 * bytes[payload]) invalid();
      scan = insideScan = true;
      scanData = false;
    }
    offset = end;
  }
  return invalid();
}

const webpMetadata = new Set(["ICCP", "EXIF", "XMP "]);

function webp(bytes: Buffer, maxPixels: number) {
  if (bytes.length < 20 || bytes.readUInt32LE(4) !== bytes.length - 8) invalid();
  let canvas: Size | undefined;
  let size: Size | undefined;
  let orientation = 1;
  const chunks: { type: string; start: number; end: number }[] = [];
  const seen = new Set<string>();
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) invalid();
    const type = bytes.toString("latin1", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const payload = offset + 8;
    const end = payload + length + (length & 1);
    if (end > bytes.length || seen.has(type) || (length & 1 && bytes[end - 1] !== 0)) invalid();
    if (type === "VP8X") {
      if (offset !== 12 || length !== 10 || bytes[payload] & 0xc3 || bytes.readUIntLE(payload + 1, 3) !== 0) invalid();
      canvas = validSize(bytes.readUIntLE(payload + 4, 3) + 1, bytes.readUIntLE(payload + 7, 3) + 1, maxPixels);
    } else if (type === "VP8 " || type === "VP8L") {
      if (size) invalid();
      if (type === "VP8 ") {
        if (length < 11 || bytes[payload] & 1 || bytes.readUIntBE(payload + 3, 3) !== 0x9d012a) invalid();
        const firstPartition = bytes.readUIntLE(payload, 3) >>> 5;
        if (!firstPartition || firstPartition > length - 10) invalid();
        size = validSize(bytes.readUInt16LE(payload + 6) & 0x3fff, bytes.readUInt16LE(payload + 8) & 0x3fff, maxPixels);
      } else {
        if (length < 6 || bytes[payload] !== 0x2f || seen.has("ALPH")) invalid();
        const bits = bytes.readUInt32LE(payload + 1);
        if (bits >>> 29) invalid();
        size = validSize((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, maxPixels);
      }
    } else if (type === "ALPH") {
      if (!canvas || size || length < 2) invalid();
    } else if (webpMetadata.has(type)) {
      if (!canvas || !length) invalid();
      if (type === "EXIF") orientation = exifOrientation(bytes.subarray(payload, payload + length));
    } else {
      // Reject ANIM, ANMF, and unknown chunks even if the animation flag is clear.
      invalid();
    }
    seen.add(type);
    chunks.push({ type, start: offset, end });
    offset = end;
  }
  if (!size || (canvas && (canvas.width !== size.width || canvas.height !== size.height))) invalid();
  return { size, orientation, chunks };
}

/** Structural preflight only: the selected engine must still decode and re-encode pixels. */
export function inspectRaster(bytes: Buffer, maxPixels: number): RasterInfo {
  const format = rasterFormat(bytes);
  if (!format) return invalid();
  const { size, orientation } = { jpeg, png, webp }[format](bytes, maxPixels);
  const oriented = orientation >= 5
    ? { width: size.height, height: size.width }
    : size;
  return { ...size, format, oriented };
}

/** Strip metadata without touching encoded pixels or alpha. Validate the complete output container. */
export function cleanWebp(bytes: Buffer, maxPixels: number): Buffer {
  if (rasterFormat(bytes) !== "webp") return invalid();
  const { chunks } = webp(bytes, maxPixels);
  const imageChunks = chunks.filter(({ type }) => !webpMetadata.has(type));
  if (imageChunks.length === chunks.length) return bytes;
  const output = Buffer.concat([bytes.subarray(0, 12), ...imageChunks.map(({ start, end }) => bytes.subarray(start, end))]);
  output.writeUInt32LE(output.length - 8, 4);
  if (imageChunks[0].type === "VP8X") output[20] &= ~0x2c; // ICC, EXIF, XMP.
  return output;
}
