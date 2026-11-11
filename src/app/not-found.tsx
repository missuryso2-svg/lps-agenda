import { ArrowLeft, CalendarX2, Compass } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="LPS Agenda — início">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-5 pb-20 sm:px-8">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-gold">
              Erro 404
            </p>
            <h1 className="mt-3 font-display text-5xl leading-[0.98] tracking-[-0.04em] sm:text-6xl">
              Esta página
              <span className="block italic text-muted-foreground">
                saiu do expediente.
              </span>
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
              O endereço não existe, foi movido ou pertence a um recurso que
              ainda não faz parte desta fundação. Confira o link e tente
              novamente.
            </p>

            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="gold" size="xl">
                <Link href="/">
                  <ArrowLeft className="size-4" />
                  Voltar ao início
                </Link>
              </Button>
              <Button asChild variant="outline" size="xl">
                <Link href="/dashboard">
                  <Compass className="size-4" />
                  Ir para o painel
                </Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gold/10 blur-3xl" />
            <div className="rounded-[1.8rem] border border-border/80 bg-card p-7 shadow-premium sm:p-9">
              <span className="grid size-12 place-items-center rounded-2xl border border-gold/30 bg-gold-soft/50 text-gold">
                <CalendarX2 className="size-5" />
              </span>
              <p className="mt-6 font-display text-7xl leading-none tracking-tighter text-foreground/15">
                404
              </p>
              <h2 className="mt-3 font-display text-2xl tracking-tight">
                Nada agendado por aqui.
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Se você chegou por um link da demonstração, a única barbearia
                pública desta versão é a{" "}
                <Link
                  href="/barbearia/barbearia-aurora"
                  className="font-medium text-foreground underline decoration-gold/50 underline-offset-4 hover:text-gold"
                >
                  Barbearia Aurora
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
