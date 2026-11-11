import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { ConfigAlert } from "@/components/config-alert";
import { Button } from "@/components/ui/button";
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
    <div>
      <div className="mb-8 flex flex-col items-start gap-3 lg:hidden">
        <Logo showTagline={false} />
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-gold">
        Novo acesso
      </p>
      <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-[-0.03em]">
        Crie uma nova senha.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Escolha uma senha forte. O link de recuperação é de uso único e expira em
        até uma hora.
      </p>

      {!configured ? (
        <div className="mt-6">
          <ConfigAlert />
        </div>
      ) : null}

      {configured && !user ? (
        <div className="mt-7 rounded-2xl border border-gold/30 bg-gold-soft/40 p-6">
          <span className="grid size-10 place-items-center rounded-full bg-gold/15 text-gold">
            <KeyRound className="size-4" />
          </span>
          <h2 className="mt-4 font-display text-xl tracking-tight">
            Link expirado ou inválido
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Sua sessão de recuperação não está ativa. Solicite um novo link para
            redefinir a senha com segurança.
          </p>
          <Button asChild variant="outline" size="xl" className="mt-5 w-full">
            <Link href="/recuperar-senha">Solicitar novo link</Link>
          </Button>
        </div>
      ) : null}

      {configured && user ? (
        <div className="mt-7">
          <p className="mb-4 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Redefinindo o acesso de{" "}
            <span className="font-medium text-foreground">{user.email}</span>
          </p>
          <ResetPasswordForm />
        </div>
      ) : null}

      <p className="mt-7 text-center text-sm text-muted-foreground">
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
