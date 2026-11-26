import type { Metadata } from "next";
import Link from "next/link";

import { ConfigAlert } from "@/components/config-alert";
import { AccountHeading } from "@/features/auth/components/account-shell";
import { SignUpForm } from "@/features/auth/components/signup-form";
import { trialOffer, trialTerms } from "@/features/marketing/plan-benefits";
import { isSupabaseConfigured } from "@/lib/env/public";

export const metadata: Metadata = {
  title: "Criar conta",
  description: "Crie sua conta no LPS Agenda e configure a operação da sua barbearia.",
};

export default function SignUpPage() {
  const configured = isSupabaseConfigured();

  return (
    <>
      <AccountHeading title="Crie sua conta.">
        Confirme seu e-mail para acessar o painel e configurar sua barbearia.
      </AccountHeading>
      {!configured && <ConfigAlert />}
      <SignUpForm disabled={!configured} />
      <div className="account-alternatives">
        <p>Já tem uma conta? <Link className="account-link" href="/login">Entrar</Link></p>
        <Link className="account-link account-secondary-link" href="/barbearia/barbearia-aurora">
          Ver demonstração antes de criar conta
        </Link>
      </div>
      <details className="account-commercial">
        <summary>Condições comerciais e de teste</summary>
        <p>A contratação de um plano é combinada separadamente com a LPS Solutions.</p>
        <p>{trialOffer} {trialTerms}</p>
      </details>
    </>
  );
}
