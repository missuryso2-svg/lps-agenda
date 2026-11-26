import type { Metadata } from "next";
import Link from "next/link";

import { ConfigAlert } from "@/components/config-alert";
import { AccountError } from "@/features/auth/components/account-form";
import { AccountHeading } from "@/features/auth/components/account-shell";
import { LoginForm } from "@/features/auth/components/login-form";
import { isSupabaseConfigured } from "@/lib/env/public";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse o painel da sua barbearia no LPS Agenda.",
};

type LoginPageProps = {
  searchParams: Promise<{ erro?: string; proximo?: string; aviso?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <>
      <AccountHeading title="Entre na sua conta.">
        Acesse a agenda, a equipe e a operação da sua barbearia.
      </AccountHeading>
      <AccountError message={params.erro} />
      <AccountError message={params.aviso} />
      {!configured && <ConfigAlert />}
      <LoginForm nextPath={params.proximo} disabled={!configured} />
      <div className="account-alternatives">
        <p>Ainda não tem conta? <Link className="account-link" href="/cadastro">Criar conta</Link></p>
        <Link className="account-link account-secondary-link" href="/barbearia/barbearia-aurora">
          Abrir demonstração da Barbearia Aurora
        </Link>
      </div>
    </>
  );
}
