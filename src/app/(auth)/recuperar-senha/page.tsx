import type { Metadata } from "next";
import Link from "next/link";

import { ConfigAlert } from "@/components/config-alert";
import { AccountHeading } from "@/features/auth/components/account-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { isSupabaseConfigured } from "@/lib/env/public";

export const metadata: Metadata = {
  title: "Recuperar senha",
  description: "Solicite um link para redefinir a senha da sua conta LPS Agenda.",
};

export default function ForgotPasswordPage() {
  const configured = isSupabaseConfigured();

  return (
    <>
      <AccountHeading title="Recupere sua senha.">
        Informe seu e-mail. Se houver uma conta, você receberá um link para criar uma nova senha.
      </AccountHeading>
      {!configured && <ConfigAlert />}
      <ForgotPasswordForm disabled={!configured} />
      <div className="account-alternatives">
        <Link className="account-link" href="/login">Voltar para o login</Link>
      </div>
    </>
  );
}
