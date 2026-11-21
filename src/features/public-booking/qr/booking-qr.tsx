"use client";
import { useState } from "react";
import Image from "next/image";
import { Copy, Download, FileDown, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { printOriginMessage } from "./address";

export function BookingQr({
  name,
  slug,
  address,
  image,
  logo,
}: {
  name: string;
  slug: string;
  address: { url: string; local: boolean };
  image: string;
  logo: string | null;
}) {
  const [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false);
  const qr = (
    <Image
      unoptimized
      src={image}
      alt={"QR Code de agendamento de " + name}
      width={600}
      height={600}
      className="mx-auto aspect-square h-auto w-full max-w-[28rem] rounded-lg bg-white [image-rendering:pixelated]"
    />
  );
  async function downloadPoster() {
    setBusy(true);
    try {
      const { makePoster } = await import("./poster");
      const pdf = await makePoster(name, address.url, image, logo);
      const href = URL.createObjectURL(pdf),
        download = document.createElement("a");
      download.href = href;
      download.download = slug + "-agendamento.pdf";
      download.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 60000);
      setFeedback("Cartaz A4 preparado.");
    } catch {
      setFeedback("Não foi possível gerar o cartaz. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-6 rounded-2xl border bg-card p-4 sm:p-7 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-center">
      {qr}
      <div className="min-w-0 space-y-5">
        <h2 className="font-display text-2xl">
          Peça ao cliente para escanear e agendar seu próximo horário.
        </h2>
        {address.local && (
          <p className="text-sm text-muted-foreground">
            Prévia local. {printOriginMessage}
          </p>
        )}
        <a
          className="block break-all text-sm underline"
          href={address.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {address.url}
        </a>
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="gold">
                <Maximize />
                Mostrar QR Code
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90svh] overflow-auto">
              <DialogHeader>
                <DialogTitle>{name}</DialogTitle>
                <DialogDescription>
                  Escaneie e agende seu horário.
                </DialogDescription>
              </DialogHeader>
              {qr}
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address.url);
                setFeedback("Link copiado.");
              } catch {
                setFeedback("Selecione o endereço acima e copie o link.");
              }
            }}
          >
            <Copy />
            Copiar link
          </Button>
          <Button asChild variant="outline">
            <a download={slug + "-qr.png"} href={image}>
              <Download />
              Baixar QR Code
            </a>
          </Button>
          <Button
            disabled={busy || address.local}
            variant="outline"
            onClick={downloadPoster}
          >
            <FileDown />
            {busy ? "Gerando PDF…" : "Baixar PDF para imprimir"}
          </Button>
        </div>
        <p role="status" className="text-sm">
          {feedback}
        </p>
      </div>
    </section>
  );
}
