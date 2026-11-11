import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Button } from "@/components/ui/button";

const highlights = [
  "Agenda, equipe, clientes e financeiro",
  "Permissões validadas no banco de dados",
  "Isolamento entre barbearias com RLS",
];

export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[0.92fr_1.08fr]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.185_0.006_65)] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="pointer-events-none absolute -left-24 top-20 size-96 rounded-full bg-gold/15 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-28 -right-20 size-[26rem] rounded-full border border-gold/15" />
        <div className="pointer-events-none absolute -bottom-20 -right-10 size-[20rem] rounded-full border border-white/5" />
        <div className="pointer-events-none absolute bottom-0 left-0 select-none font-display text-[16rem] leading-none text-white/[0.025]">
          LPS
        </div>

        <div className="relative">
          <Link href="/" aria-label="LPS Agenda — início">
            <Logo tone="inverse" />
          </Link>
        </div>

        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
            <ShieldCheck className="size-3.5" />
            Operação segura
          </span>

          <h2 className="mt-6 font-display text-[2.65rem] leading-[1.06] tracking-[-0.03em]">
            A sua barbearia
            <span className="block italic text-gold">no ritmo certo.</span>
          </h2>

          <p className="mt-5 text-sm leading-relaxed text-white/55">
            Uma plataforma feita para quem vive a barbearia todos os dias. Sem
            excesso de telas, sem atalhos de segurança.
          </p>

          <ul className="mt-8 space-y-3.5">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-white/65">
                <span className="grid size-5 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                  <Check className="size-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between border-t border-white/10 pt-5 text-[10px] uppercase tracking-[0.18em] text-white/35">
          <span>LPS Solutions</span>
          <span>Produto em desenvolvimento</span>
        </div>
      </aside>

      <div className="flex min-h-svh flex-col">
        <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" className="lg:hidden" aria-label="LPS Agenda — início">
            <Logo showTagline={false} />
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/">
                <ArrowLeft className="size-3.5" />
                Voltar ao site
              </Link>
            </Button>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-8">
          <div className="w-full max-w-[27rem] animate-rise">{children}</div>
        </main>

        <footer className="px-5 pb-6 text-center text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:px-8">
          © {new Date().getFullYear()} LPS Solutions · Fundação v0.1
        </footer>
      </div>
    </div>
  );
}
