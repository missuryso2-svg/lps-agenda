import { ArrowLeft, Settings2, Terminal } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { ConfigAlert } from "@/components/config-alert";
import { Button } from "@/components/ui/button";

export function ConfigRequiredPage({
  title = "Conecte o Supabase para continuar",
  description = "O painel e a autenticação usam um projeto Supabase. Configure as variáveis de ambiente para habilitar esta área.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="LPS Agenda — início">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16 sm:px-8">
        <div className="w-full max-w-xl">
          <div className="rounded-3xl border border-border/80 bg-card p-7 shadow-premium sm:p-9">
            <span className="grid size-12 place-items-center rounded-2xl border border-gold/25 bg-gold-soft/60 text-gold">
              <Settings2 className="size-5" />
            </span>
            <h1 className="mt-5 font-display text-3xl leading-[1.1] tracking-[-0.03em]">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>

            <ConfigAlert className="mt-6" />

            <div className="mt-6 rounded-2xl border border-border/80 bg-muted/25 p-4">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Terminal className="size-3.5 text-gold" />
                Passos no terminal
              </p>
              <ol className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                <li>
                  1. Copie <code className="font-mono text-foreground">.env.example</code>{" "}
                  para <code className="font-mono text-foreground">.env.local</code>.
                </li>
                <li>
                  2. Preencha a URL e a chave anônima do projeto Supabase.
                </li>
                <li>
                  3. Rode as migrações de{" "}
                  <code className="font-mono text-foreground">supabase/migrations</code>.
                </li>
                <li>4. Reinicie o servidor de desenvolvimento.</li>
              </ol>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline" size="xl" className="flex-1">
                <Link href="/">
                  <ArrowLeft className="size-4" />
                  Voltar ao site
                </Link>
              </Button>
              <Button asChild variant="ghost" size="xl" className="flex-1">
                <Link href="/login">Ir para o login</Link>
              </Button>
            </div>
          </div>

          <p className="mt-5 text-center text-[11px] text-muted-foreground">
            Consulte o README do projeto para o passo a passo completo e as
            variáveis necessárias.
          </p>
        </div>
      </main>
    </div>
  );
}
