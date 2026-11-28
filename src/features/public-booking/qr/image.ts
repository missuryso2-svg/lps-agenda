import QRCode from "qrcode";

export async function bookingQrImage(url: string) {
  // Black and white with opaque pixels. Keep the print resolution and quiet
  // zone while avoiding the RGBA representation and adaptive PNG filtering.
  const rendererOpts = { colorType: 0, filterType: 0, deflateStrategy: 0, deflateLevel: 9 };
  const image = await QRCode.toBuffer(url, {
    margin: 4,
    scale: 16,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
    rendererOpts,
  });
  return "data:image/png;base64," + image.toString("base64");
}
