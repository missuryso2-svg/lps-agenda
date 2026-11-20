import type { Metadata } from "next";
import Link from "next/link";

import { ConfigAlert } from "@/components/config-alert";
import { Button } from "@/components/ui/button";
import { SignUpForm } from "@/features/auth/components/signup-form";
import { isSupabaseConfigured } from "@/lib/env/public";

export const metadata: Metadata = {
  title: "Criar conta",
  description:
    "Crie sua conta no LPS Agenda e configure a operação da sua barbearia.",
};

export default function SignUpPage() {
  const configured = isSupabaseConfigured();

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-gold">
        Comece pelo essencial
      </p>
      <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-[-0.03em]">
        Crie sua conta.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Use seu e-mail para acessar o painel. A contratação de um plano é combinada separadamente com a LPS Solutions.
      </p>

      {!configured ? (
        <div className="mt-6">
          <ConfigAlert />
        </div>
      ) : null}

      <div className="mt-7">
        <SignUpForm disabled={!configured} />
      </div>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        Já tem uma conta?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline decoration-gold/60 underline-offset-4 transition-colors hover:text-gold"
        >
          Entrar
        </Link>
      </p>

      <div className="mt-8 text-center">
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link href="/barbearia/barbearia-aurora">
            Ver demonstração antes de criar conta
          </Link>
        </Button>
      </div>
    </div>
  );
}
