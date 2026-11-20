"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialsFromName } from "@/lib/format";
import type { ManagedBarber } from "../types";

export function photoSrc(id: string, value: string | null) {
  if (!value) return undefined;
  if (value.startsWith("https://")) return value;
  return (
    "/api/equipe/foto/" +
    id +
    "?v=" +
    encodeURIComponent(value.split("/").pop() ?? "")
  );
}

export function BarberPhoto({ barber }: { barber: ManagedBarber }) {
  const router = useRouter();
  const [current, setCurrent] = useState(barber.avatar_url);
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function clear() {
    setFile(null);
    setPreview("");
    if (input.current) input.current.value = "";
  }
  async function save(remove: boolean) {
    if (!remove && !file) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await fetch("/api/equipe/foto/" + barber.id, {
        method: remove ? "DELETE" : "POST",
        headers: {
          "x-photo-version": encodeURIComponent(current ?? ""),
          ...(!remove && file ? { "content-type": file.type } : {}),
        },
        body: remove ? undefined : file,
      });
      const data = await result.json();
      setMessage(data.message);
      if (result.ok) {
        setCurrent(data.key);
        clear();
        router.refresh();
      }
    } catch {
      setMessage(
        "Não foi possível salvar a foto. Reabra o perfil para conferir.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border p-4"
      aria-label="Foto do profissional"
    >
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarImage
            src={preview || photoSrc(barber.id, current)}
            alt={barber.name}
          />
          <AvatarFallback>{initialsFromName(barber.name)}</AvatarFallback>
        </Avatar>
        <div>
          <label className="font-medium text-sm" htmlFor="barber-photo">
            Foto do profissional
          </label>
          <p className="text-xs text-muted-foreground">
            Visível à equipe. JPG, PNG ou WebP de até 2 MB.
          </p>
        </div>
      </div>
      <Input
        ref={input}
        id="barber-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(ev) => {
          const selected = ev.target.files?.[0];
          clear();
          setMessage("");
          if (!selected) return;
          if (
            selected.size > 2097152 ||
            !["image/jpeg", "image/png", "image/webp"].includes(selected.type)
          ) {
            setMessage("Selecione uma imagem válida de até 2 MB.");
            return;
          }
          setFile(selected);
          setPreview(URL.createObjectURL(selected));
        }}
      />
      <div className="flex flex-wrap gap-2">
        {file && (
          <Button
            type="button"
            size="sm"
            onClick={() => save(false)}
            disabled={busy}
          >
            Salvar foto
          </Button>
        )}
        {current && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => save(true)}
            disabled={busy}
          >
            Remover foto
          </Button>
        )}
      </div>
      <p role="status" className="text-xs">
        {message}
      </p>
    </section>
  );
}
