import type { Metadata } from "next";
import Link from "next/link";

import { ConfigAlert } from "@/components/config-alert";
import { FormError } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { LoginForm } from "@/features/auth/components/login-form";
import { isSupabaseConfigured } from "@/lib/env/public";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse o painel da sua barbearia no LPS Agenda.",
};

type LoginPageProps = {
  searchParams: Promise<{
    erro?: string;
    proximo?: string;
    aviso?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-gold">
        Bem-vindo de volta
      </p>
      <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-[-0.03em]">
        Entre na sua conta.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Acesse a agenda, a equipe e a operação da sua barbearia em um só lugar.
      </p>

      <div className="mt-6 space-y-4">
        {params.erro ? <FormError message={params.erro} /> : null}
        {params.aviso ? <FormError message={params.aviso} /> : null}
        {!configured ? <ConfigAlert /> : null}
      </div>

      <div className="mt-7">
        <LoginForm
          nextPath={params.proximo}
          disabled={!configured}
        />
      </div>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link
          href="/cadastro"
          className="font-medium text-foreground underline decoration-gold/60 underline-offset-4 transition-colors hover:text-gold"
        >
          Criar conta
        </Link>
      </p>

      <div className="mt-8 flex flex-col items-center gap-2 border-t border-border/70 pt-6 text-center">
        <p className="text-[11px] text-muted-foreground">
          Quer conhecer a experiência antes de criar uma conta?
        </p>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link href="/barbearia/barbearia-aurora">
            Abrir demonstração da Barbearia Aurora
          </Link>
        </Button>
      </div>
    </div>
  );
}
