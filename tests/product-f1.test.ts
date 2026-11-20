import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { customerWhatsApp } from "@/features/customers/whatsapp";
import { normalizePhoto } from "@/features/barbers/photo";

describe("contato individual", () => {
  it.each(["(71) 99955-5390", "5571999555390", "+55 71 99955-5390"])(
    "normaliza %s",
    (value) =>
      expect(customerWhatsApp(value)).toBe("https://wa.me/5571999555390"),
  );
  it.each([
    null,
    "",
    "123",
    "https://wa.me/5571999555390",
    "71 99955-5390 ramal 10",
  ])("omite telefone inválido", (value) =>
    expect(customerWhatsApp(value)).toBeNull(),
  );
});
describe("foto privada", () => {
  it("decodifica e recodifica a imagem, limitando dimensões", async () => {
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "black" },
    })
      .png()
      .toBuffer();
    const out = await normalizePhoto(input, "image/png");
    expect(await sharp(out).metadata()).toMatchObject({
      format: "webp",
      width: 480,
      height: 480,
    });
    await expect(normalizePhoto(input, "image/jpeg")).rejects.toThrow();
  });
  it("recusa bytes inválidos, SVG e excesso de tamanho", async () => {
    for (const bytes of [
      Buffer.from("not a photo"),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      Buffer.alloc(2097153),
    ])
      await expect(normalizePhoto(bytes, "image/png")).rejects.toThrow();
  });
});
