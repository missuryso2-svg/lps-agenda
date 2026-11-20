"use client";

import { ArrowUpRight, Menu } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const links = [
  { href: "/#recursos", label: "Recursos" },
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#planos", label: "Planos" },
  { href: "/barbearia/barbearia-aurora", label: "Demonstração" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="LPS Agenda — início">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Principal">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-1.5 lg:flex">
          <ThemeToggle />
          <Button asChild variant="ghost" className="text-[13px]">
            <Link href="/login">Entrar</Link>
          </Button>
          <Button asChild variant="gold" className="gap-1.5">
            <Link href="/cadastro">
              Criar conta
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[86%] sm:max-w-sm">
              <SheetHeader className="border-b pb-4">
                <SheetTitle>
                  <Link href="/" aria-label="LPS Agenda — início">
                    <Logo />
                  </Link>
                </SheetTitle>
              </SheetHeader>

              <nav className="flex flex-col px-2" aria-label="Menu">
                {links.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-lg px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      {link.label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>

              <div className="mt-auto flex flex-col gap-2 border-t p-4">
                <SheetClose asChild>
                  <Button asChild variant="outline" size="xl">
                    <Link href="/login">Entrar</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild variant="gold" size="xl">
                    <Link href="/cadastro">
                      Criar conta
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
