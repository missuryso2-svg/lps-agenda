"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="LPS Agenda — início">
          <Logo />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 items-center justify-center px-5 pb-16 sm:px-8">
        <div className="w-full rounded-3xl border border-border/80 bg-card p-7 text-center shadow-premium sm:p-9">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-destructive/25 bg-destructive/10 text-destructive">
            <CircleAlert className="size-5" />
          </span>
          <h1 className="mt-5 font-display text-3xl tracking-tight">
            Algo saiu do ritmo.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Um erro inesperado interrompeu esta página. Você pode tentar
            novamente ou voltar para o início.
          </p>
          {error.digest ? (
            <p className="mt-3 font-mono text-[10px] text-muted-foreground">
              Referência: {error.digest}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button type="button" variant="gold" size="xl" onClick={reset}>
              <RotateCcw className="size-4" />
              Tentar novamente
            </Button>
            <Button asChild variant="outline" size="xl">
              <Link href="/">Voltar ao início</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
