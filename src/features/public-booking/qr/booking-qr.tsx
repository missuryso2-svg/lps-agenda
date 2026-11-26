"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Copy, Download, FileDown, Maximize, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initialsFromName } from "@/lib/format";

export function BookingQr({
  name,
  slug,
  address,
  image,
  logo,
  displayLogo,
}: {
  name: string;
  slug: string;
  address: { url: string; local: boolean };
  image: string;
  logo: string | null;
  displayLogo: string | null;
}) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  const qr = (
    <Image
      unoptimized
      src={image}
      alt={"QR Code de agendamento de " + name}
      width={600}
      height={600}
      className="mx-auto aspect-square h-auto w-full max-w-[20rem] rounded-lg bg-white [image-rendering:pixelated]"
    />
  );

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address.url);
      setFeedback("Link copiado.");
    } catch {
      setFeedback("Selecione o endereço de agendamento acima para copiar o link.");
    }
  }

  async function shareAddress() {
    if (typeof navigator.share !== "function") {
      await copyAddress();
      return;
    }
    try {
      await navigator.share({ title: "Agendamento de " + name, url: address.url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        await copyAddress();
      }
    }
  }

  async function downloadPoster() {
    setBusy(true);
    try {
      const { makePoster } = await import("./poster");
      const pdf = await makePoster(name, address.url, image, logo);
      const href = URL.createObjectURL(pdf);
      const download = document.createElement("a");
      download.href = href;
      download.download = slug + "-agendamento.pdf";
      download.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
      setFeedback("Cartaz A4 preparado.");
    } catch {
      setFeedback("Não foi possível gerar o cartaz. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="j2-c3-two-columns">
      <section className="j2-c3-panel" aria-labelledby="qr-preview">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted font-semibold">
            {displayLogo ? (
              <Image unoptimized src={displayLogo} alt="" width={48} height={48} className="size-full object-contain" />
            ) : <span aria-hidden>{initialsFromName(name)}</span>}
          </span>
          <h3 id="qr-preview" className="min-w-0 break-words">{name}</h3>
        </div>
        <div className="j2-c3-qr-stage">{qr}</div>
        <Button className="mt-4" variant="outline" onClick={() => dialog.current?.showModal()}>
          <Maximize aria-hidden /> Mostrar QR Code
        </Button>
        <dialog ref={dialog} className="j2-c3-qr-dialog" aria-labelledby="full-qr-heading" aria-describedby="full-qr-description">
          <h4 id="full-qr-heading">{name}</h4>
          <p id="full-qr-description" className="j2-c3-meta mb-4">Escaneie e escolha seu horário.</p>
          {qr}
          <form method="dialog">
            <Button className="mt-4" variant="outline">Fechar</Button>
          </form>
        </dialog>
      </section>

      <section className="j2-c3-panel" aria-labelledby="qr-sharing">
        <h3 id="qr-sharing">Link de agendamento</h3>
        <a className="mt-3 inline-flex min-h-11 max-w-full items-center gap-2 text-sm underline underline-offset-4"
          href={address.url} target="_blank" rel="noopener noreferrer">
          <span className="min-w-0 break-all">{address.url}</span><ArrowUpRight className="size-4 shrink-0" aria-hidden />
        </a>
        <div className="my-3 flex flex-wrap gap-2">
          <Button variant="gold" onClick={copyAddress}><Copy aria-hidden /> Copiar link</Button>
          <Button variant="outline" onClick={shareAddress}><Share2 aria-hidden /> Compartilhar</Button>
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button asChild variant="outline">
            <a download={slug + "-qr.png"} href={image}><Download aria-hidden /> Baixar QR Code <span className="sr-only">em PNG</span></a>
          </Button>
          <Button disabled={busy || address.local} variant="outline" onClick={downloadPoster}>
            <FileDown aria-hidden /> {busy ? "Gerando PDF…" : "Baixar PDF para imprimir"}
          </Button>
        </div>
        <p role="status" className="j2-c3-meta mt-3 min-h-6">{feedback}</p>
        {address.local && <p className="j2-c3-meta">Prévia local. O cartaz para impressão usa o endereço público configurado.</p>}
        <div className="mt-3 space-y-2 border-t pt-4">
          <h4>Onde usar</h4>
          <p className="j2-c3-meta">Compartilhe o link no perfil ou nas mensagens. Use o PNG em posts e stories e o cartaz A4 na recepção ou no espelho.</p>
        </div>
      </section>
    </div>
  );
}
