import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { ConfigRequiredPage } from "@/components/config-required-page";
import { getMemberships } from "@/lib/auth/dal";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabasePublicEnv } from "@/lib/env/public";
import { manualTrialOnboardingEnabled } from "@/lib/env/server";
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form";

export const metadata: Metadata = {
  title: "Configure sua barbearia",
  description: "Crie a barbearia e o vínculo de proprietário no LPS Agenda.",
};

export const dynamic = "force-dynamic";

const steps = [
  {
    number: "01",
    title: "Conta criada",
    description: "Seu perfil já existe e o e-mail foi confirmado.",
    done: true,
  },
  {
    number: "02",
    title: "Sua barbearia",
    description: "Nome, endereço público e fuso horário.",
    done: false,
  },
  {
    number: "03",
    title: "Painel",
    description: "Agenda, equipe e configurações liberados.",
    done: false,
  },
];

export default async function OnboardingPage() {
  if (!getSupabasePublicEnv()) {
    return (
      <ConfigRequiredPage
        title="Configure o Supabase para criar sua barbearia"
        description="O onboarding grava a barbearia e o vínculo de proprietário no PostgreSQL. Sem um projeto Supabase configurado, esta etapa não pode ser concluída."
      />
    );
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?proximo=/onboarding");
  }

  const memberships = await getMemberships(user.id);

  if (memberships.length > 0) {
    redirect("/dashboard");
  }

  const name =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Bem-vindo";

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="LPS Agenda — início">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {user.email}
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-start lg:gap-16 lg:pt-14">
        <div className="animate-rise max-w-lg">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-gold">
            Primeiro acesso
          </p>
          <h1 className="mt-3 font-display text-4xl leading-[1.04] tracking-[-0.03em] sm:text-5xl">
            Olá, {name.split(" ")[0]}.
            <span className="block text-muted-foreground">
              Vamos configurar sua barbearia.
            </span>
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Escolha como sua barbearia aparece para os clientes. Você poderá ajustar essas informações depois.
          </p>

          <ol className="mt-9 space-y-1">
            {steps.map((step, index) => (
              <li key={step.number} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full border text-[11px] font-semibold ${
                      step.done
                        ? "border-gold/40 bg-gold text-gold-foreground"
                        : index === 1
                          ? "border-gold/40 bg-gold-soft text-foreground"
                          : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {step.done ? <Check className="size-3.5" /> : step.number}
                  </span>
                  {index < steps.length - 1 ? (
                    <span className="my-1 h-7 w-px bg-border" />
                  ) : null}
                </div>
                <div className="pb-3">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-7 rounded-2xl border border-border/80 bg-card/60 p-4">
            <p className="flex items-center gap-2 text-xs font-medium">
              <ShieldCheck className="size-4 text-gold" />
              O que acontece ao continuar
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Você terá acesso ao painel de proprietário. A contratação de um plano pago depende de um acordo com a LPS Solutions.
            </p>
          </div>


        </div>

        <div className="animate-rise-slow rounded-3xl border border-border/80 bg-card p-6 shadow-premium sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-border/70 pb-5">
            <div>
              <h2 className="font-display text-xl tracking-tight">
                Dados da barbearia
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Você poderá editar estas informações depois.
              </p>
            </div>
            <span className="rounded-full border border-gold/25 bg-gold-soft/50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground">
              Etapa 2 de 3
            </span>
          </div>

          <OnboardingForm manualUserId={manualTrialOnboardingEnabled() ? user.id : null} />

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
            Já tem uma barbearia?
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-0.5 font-medium text-foreground underline decoration-gold/50 underline-offset-4 hover:text-gold"
            >
              Ir para o painel
              <ArrowRight className="size-3" />
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
