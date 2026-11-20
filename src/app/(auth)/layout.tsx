import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo, SolutionsLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[0.95fr_1.05fr]">
      <aside className="relative isolate hidden overflow-hidden bg-[#101112] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Image
          src="/images/barbearia.webp"
          fill
          sizes="48vw"
          alt=""
          className="-z-20 object-cover object-[65%_center]"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-black via-black/35 to-black/55" />
        <Link href="/" aria-label="LPS Agenda — início" className="w-fit">
          <Logo tone="inverse" />
        </Link>
        <div>
          <h2 className="max-w-md text-5xl leading-[1.03] font-semibold tracking-[-.055em] xl:text-6xl">
            Sua barbearia.
            <br />
            Seu ritmo.
            <br />
            <span className="text-[#ffdb16]">Sua agenda.</span>
          </h2>
          <div className="mt-10 border-t border-white/25 pt-6">
            <SolutionsLogo />
          </div>
        </div>
      </aside>
      <div className="flex min-h-svh min-w-0 flex-col">
        <header className="flex items-center justify-between gap-2 px-5 py-5 sm:px-8">
          <Link href="/" className="lg:hidden" aria-label="LPS Agenda — início">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <ArrowLeft /> Voltar ao site
              </Link>
            </Button>
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-[29rem] animate-rise rounded-2xl sm:border sm:bg-card sm:p-8">
            {children}
          </div>
        </main>
        <footer className="px-5 py-5 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} LPS Solutions
        </footer>
      </div>
    </div>
  );
}
