import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfigAlert } from "@/components/config-alert";
import { AccountHeading } from "@/features/auth/components/account-shell";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabasePublicEnv } from "@/lib/env/public";

export const metadata: Metadata = {
  title: "Redefinir senha",
  description: "Crie uma nova senha para sua conta LPS Agenda.",
};

export default async function ResetPasswordPage() {
  const configured = getSupabasePublicEnv() !== null;
  const user = configured ? await getCurrentUser() : null;

  return (
    <>
      <AccountHeading title="Crie uma nova senha.">
        O link de recuperação é de uso único e expira em até uma hora.
      </AccountHeading>
      {!configured && <ConfigAlert />}
      {configured && !user && (
        <section className="account-result account-expired" aria-labelledby="reset-expired-title">
          <KeyRound size={22} aria-hidden />
          <h2 id="reset-expired-title">Link expirado ou inválido</h2>
          <p>Sua sessão de recuperação não está ativa. Solicite um novo link para redefinir a senha.</p>
          <Link href="/recuperar-senha" className="account-link">Solicitar novo link</Link>
        </section>
      )}
      {configured && user && (
        <>
          <p className="account-identity">Conta <strong>{user.email}</strong></p>
          <ResetPasswordForm />
        </>
      )}
      <div className="account-alternatives">
        <Link href="/login" className="account-link">Voltar para o login</Link>
      </div>
    </>
  );
}
