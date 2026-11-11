"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function DashboardError({
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
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl border border-border/80 bg-card p-7 text-center shadow-premium sm:p-9">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-destructive/25 bg-destructive/10 text-destructive">
          <CircleAlert className="size-5" />
        </span>
        <h2 className="mt-5 font-display text-2xl tracking-tight">
          Não foi possível carregar esta área
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          O painel encontrou um erro inesperado ao consultar os dados. Tente
          novamente; se o problema persistir, verifique a configuração do
          Supabase e as migrações.
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
            <Link href="/dashboard">Voltar à visão geral</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
