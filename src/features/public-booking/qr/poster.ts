import { PDFDocument, PageSizes } from "pdf-lib";

function loadQr(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadLogo(url: string) {
  const response = await fetch(url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    signal: AbortSignal.timeout(3000),
  });
  if (
    !response.ok ||
    !/^image\/(png|jpeg|webp)$/.test(
      response.headers.get("content-type") ?? "",
    ) ||
    Number(response.headers.get("content-length")) > 2_000_000
  )
    return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2_000_000) {
      await reader.cancel();
      return null;
    }
    parts.push(new Uint8Array(value));
  }
  return createImageBitmap(
    new Blob(parts, { type: response.headers.get("content-type") ?? "" }),
  );
}

export async function makePoster(
  name: string,
  url: string,
  png: string,
  logoUrl: string | null,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1654;
  canvas.height = 2339;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = "#141414";
  const center = canvas.width / 2;
  function lines(text: string, y: number, font: string, spacing: number) {
    if (!ctx) return;
    ctx.font = font;
    let line = "";
    for (const word of text.split(/\s+/u)) {
      const candidate = line ? line + " " + word : word;
      if (ctx.measureText(candidate).width <= 1400) {
        line = candidate;
        continue;
      }
      if (line) {
        ctx.fillText(line, center, y);
        y += spacing;
        line = "";
      }
      for (const char of word) {
        if (ctx.measureText(line + char).width > 1400) {
          ctx.fillText(line, center, y);
          y += spacing;
          line = "";
        }
        line += char;
      }
    }
    if (line) ctx.fillText(line, center, y);
  }
  const [qr, logo] = await Promise.all([
    loadQr(png),
    logoUrl ? loadLogo(logoUrl).catch(() => null) : null,
  ]);
  if (logo) {
    const scale = Math.min(240 / logo.width, 125 / logo.height);
    ctx.drawImage(
      logo,
      center - (logo.width * scale) / 2,
      82,
      logo.width * scale,
      logo.height * scale,
    );
    logo.close();
  }
  lines(
    name,
    logo ? 275 : 205,
    name.length > 55
      ? "bold 40px Arial, sans-serif"
      : "bold 58px Arial, sans-serif",
    60,
  );
  ctx.font = "bold 82px Arial, sans-serif";
  ctx.fillText("Escaneie e agende seu horário", center, 565, 1450);
  // The source uses 16 pixels per module, including its four-module quiet zone.
  const modules = qr.naturalWidth / 16;
  const side = modules * Math.floor(1200 / modules);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, Math.floor((canvas.width - side) / 2), 665, side, side);
  lines(url, 1940, "38px Arial, sans-serif", 50);
  ctx.fillStyle = "#f8cd18";
  ctx.fillRect(center - 54, 2160, 108, 8);
  ctx.fillStyle = "#262626";
  ctx.font = "bold 42px Arial, sans-serif";
  ctx.fillText("LPS Agenda", center, 2250);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG indisponível"))),
      "image/png",
    ),
  );
  const pdf = await PDFDocument.create();
  pdf.setTitle("Agendamento · " + name);
  const page = pdf.addPage(PageSizes.A4);
  const poster = await pdf.embedPng(await blob.arrayBuffer());
  page.drawImage(poster, {
    x: 0,
    y: 0,
    width: page.getWidth(),
    height: page.getHeight(),
  });
  return new Blob([new Uint8Array(await pdf.save()).buffer], {
    type: "application/pdf",
  });
}
