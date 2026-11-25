"use client";

import { ImagePlus, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  BARBERSHOP_LOGO_MIME_TYPES,
  MAX_BARBERSHOP_LOGO_BYTES,
  MAX_BARBERSHOP_LOGO_PIXELS,
} from "@/features/barbershop/logo-policy";
import { initialsFromName } from "@/lib/format";

type LogoResponse = {
  message?: string;
  logoUrl?: string | null;
  version?: string;
};

type SelectedLogo = { file: File; previewUrl: string };

type Props = {
  shopId: string;
  shopName: string;
  logoUrl: string | null;
  logoVersion: string;
  canManage: boolean;
};

export function BarbershopLogoCard({
  shopId,
  shopName,
  logoUrl: initialLogoUrl,
  logoVersion: initialLogoVersion,
  canManage,
}: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const selectionId = useRef(0);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [logoVersion, setLogoVersion] = useState(initialLogoVersion);
  const [selection, setSelection] = useState<SelectedLogo | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(
    () => () => {
      selectionId.current++;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  function clearSelection() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setSelection(null);
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    setError(null);
    setStatus(null);
    if (!selected) return;
    const id = ++selectionId.current;
    clearSelection();

    if (!BARBERSHOP_LOGO_MIME_TYPES.includes(selected.type as (typeof BARBERSHOP_LOGO_MIME_TYPES)[number])) {
      setError("Use um arquivo PNG, JPG ou WebP.");
      return;
    }
    if (selected.size === 0 || selected.size > MAX_BARBERSHOP_LOGO_BYTES) {
      setError("A logo deve ter no máximo 2 MB.");
      return;
    }

    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(selected);
        const validDimensions =
          bitmap.width > 0 &&
          bitmap.height > 0 &&
          bitmap.width * bitmap.height <= MAX_BARBERSHOP_LOGO_PIXELS;
        bitmap.close();
        if (selectionId.current !== id) return;
        if (!validDimensions) {
          setError("A imagem excede o limite de dimensões permitido.");
          return;
        }
      } catch {
        if (selectionId.current !== id) return;
        setError("Não foi possível ler a imagem selecionada.");
        return;
      }
    }

    const previewUrl = URL.createObjectURL(selected);
    previewUrlRef.current = previewUrl;
    setSelection({ file: selected, previewUrl });
  }

  async function send(method: "POST" | "DELETE") {
    if (pending) return;
    if (method === "POST" && !selection) {
      setError("Escolha uma imagem para enviar.");
      return;
    }

    selectionId.current++;
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/barbershop/logo", {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "x-logo-shop": shopId,
          "x-logo-version": logoVersion,
          ...(method === "POST" && selection
            ? { "content-type": selection.file.type }
            : {}),
        },
        ...(method === "POST" && selection ? { body: selection.file } : {}),
      });
      const result = (await response.json().catch(() => ({}))) as LogoResponse;

      if (!response.ok) {
        if (response.status === 409) {
          if (result.version !== undefined) {
            setLogoUrl(result.logoUrl ?? null);
            setLogoVersion(result.version);
          }
          clearSelection();
          router.refresh();
        }
        setError(result.message ?? "Não foi possível salvar a logo.");
        toast.error(result.message ?? "Não foi possível salvar a logo.");
        return;
      }

      setLogoUrl(result.logoUrl ?? null);
      setLogoVersion(result.version ?? logoVersion);
      clearSelection();
      setStatus(result.message ?? "Logo atualizada.");
      toast.success(result.message ?? "Logo atualizada.");
      router.refresh();
    } catch {
      setError("Serviço indisponível. Atualize a página antes de tentar novamente.");
      toast.error("Não foi possível confirmar a alteração da logo.");
    } finally {
      setPending(false);
    }
  }

  function removeLogo() {
    if (!logoUrl || pending) return;
    if (!window.confirm(`Remover a logo de ${shopName}?`)) return;
    void send("DELETE");
  }

  const preview = selection?.previewUrl ?? logoUrl;

  return (
    <section className="rounded-xl border border-border/80 bg-card p-5 shadow-premium sm:p-6" aria-labelledby="barbershop-logo-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="barbershop-logo-title" className="font-heading text-base font-semibold">
            Logo da barbearia
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Envie a identidade visual da sua barbearia. A imagem é otimizada sem recorte e exibida na página pública.
          </p>
        </div>
        <span className="rounded-full border border-gold/30 bg-gold-soft/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
          PNG · JPG · WebP
        </span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.85fr)] sm:items-center">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {selection ? "Pré-visualização antes de salvar" : "Logo atual"}
          </p>
          <div className="barbershop-logo-surface grid h-40 w-full place-items-center overflow-hidden rounded-2xl border border-border/70 sm:h-48">
            {preview ? (
              // The file is normalized to WebP before public storage; keeping it
              // unoptimized here preserves transparent backgrounds.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt={`Logo da barbearia ${shopName}`}
                className="max-h-full max-w-full object-contain p-5"
              />
            ) : (
              <span className="font-display text-4xl text-gold" aria-hidden="true">
              {initialsFromName(shopName)}
              </span>
            )}
          </div>
          {selection ? (
            <p className="break-all text-[11px] text-muted-foreground">
              {selection.file.name} · {(selection.file.size / 1024).toFixed(0)} KB
            </p>
          ) : !logoUrl && (
            <p className="text-[11px] text-muted-foreground">
              Sem logo, a página pública usa as iniciais da barbearia.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept={BARBERSHOP_LOGO_MIME_TYPES.join(",")}
            aria-label="Selecionar logo da barbearia"
            disabled={!canManage || pending}
            onChange={selectFile}
          />
          <Button
            type="button"
            variant={logoUrl ? "outline" : "gold"}
            size="lg"
            disabled={!canManage || pending}
            onClick={() => input.current?.click()}
          >
            <ImagePlus className="size-4" />
            {logoUrl ? "Alterar logo" : "Enviar logo"}
          </Button>
          {selection ? (
            <>
              <Button
                type="button"
                variant="gold"
                size="lg"
                disabled={!canManage || pending}
                onClick={() => void send("POST")}
              >
                {pending ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Enviando logo…
                  </>
                ) : (
                  "Salvar pré-visualização"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={clearSelection}
              >
                <RotateCcw className="size-4" />
                Descartar pré-visualização
              </Button>
            </>
          ) : null}
          {logoUrl ? (
            <Button
              type="button"
              variant="destructive"
              size="lg"
              disabled={!canManage || pending || Boolean(selection)}
              onClick={removeLogo}
            >
              <Trash2 className="size-4" />
              {pending && !selection ? "Removendo logo…" : "Remover logo"}
            </Button>
          ) : null}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Arquivo de até 2 MB. Apenas o proprietário pode enviar, trocar ou remover.
          </p>
          {!canManage ? (
            <p role="status" className="text-xs text-muted-foreground">
              A edição da logo é restrita ao proprietário desta barbearia.
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-200">
          {status}
        </p>
      ) : null}
    </section>
  );
}
