/** Reject non-raster formats before invoking native decoders. Metadata is still checked afterwards. */
export function rasterFormat(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  const header = Buffer.from(bytes.subarray(0, 12));
  if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpeg";
  if (header.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "png";
  if (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}
