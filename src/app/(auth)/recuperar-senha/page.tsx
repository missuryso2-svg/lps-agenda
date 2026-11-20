import type { Metadata } from "next";
import Link from "next/link";

import { ConfigAlert } from "@/components/config-alert";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { isSupabaseConfigured } from "@/lib/env/public";

export const metadata: Metadata = {
  title: "Recuperar senha",
  description: "Solicite um link para redefinir a senha da sua conta LPS Agenda.",
};

export default function ForgotPasswordPage() {
  const configured = isSupabaseConfigured();

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-gold">
        Recuperação de acesso
      </p>
      <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-[-0.03em]">
        Esqueceu a senha?
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Informe o e-mail da sua conta. Se ele existir, enviaremos um link seguro
        para criar uma nova senha.
      </p>

      {!configured ? (
        <div className="mt-6">
          <ConfigAlert />
        </div>
      ) : null}

      <div className="mt-7">
        <ForgotPasswordForm disabled={!configured} />
      </div>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        Lembrou a senha?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline decoration-gold/60 underline-offset-4 transition-colors hover:text-gold"
        >
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
