import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ConfigAlert } from "@/components/config-alert";
import { AccountHeading, AccountShell } from "@/features/auth/components/account-shell";
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form";
import { getMemberships } from "@/lib/auth/dal";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabasePublicEnv } from "@/lib/env/public";
import { manualTrialOnboardingEnabled } from "@/lib/env/server";

export const metadata: Metadata = {
  title: "Configure sua barbearia",
  description: "Crie a barbearia e o vínculo de proprietário no LPS Agenda.",
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  if (!getSupabasePublicEnv()) {
    return (
      <AccountShell>
        <AccountHeading title="Configuração indisponível.">
          Conecte o Supabase para criar sua barbearia neste ambiente.
        </AccountHeading>
        <ConfigAlert />
        <div className="account-alternatives">
          <Link href="/login" className="account-link">Ir para o login</Link>
        </div>
      </AccountShell>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login?proximo=/onboarding");

  const memberships = await getMemberships(user.id);
  if (memberships.length > 0) redirect("/dashboard");

  const name =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Bem-vindo";

  return (
    <AccountShell
      email={user.email}
      onboardingAside={
        <section className="account-onboarding-intro" aria-labelledby="onboarding-title">
          <p className="account-step-label">Primeiro acesso · Etapa 2 de 3</p>
          <h1 id="onboarding-title">Configure sua barbearia.</h1>
          <p>Olá, {name.split(" ")[0]}. Escolha como sua barbearia aparece para os clientes.</p>
          <ol className="account-steps" aria-label="Progresso da configuração">
            <li data-complete>
              <span className="account-step-marker"><Check size={15} aria-hidden /></span>
              <span>Conta <span className="sr-only">concluída</span></span>
            </li>
            <li aria-current="step">
              <span className="account-step-marker" aria-hidden>2</span>
              <span>Barbearia</span>
            </li>
            <li>
              <span className="account-step-marker" aria-hidden>3</span>
              <span>Painel</span>
            </li>
          </ol>
        </section>
      }
    >
      <header className="account-heading account-onboarding-heading">
        <h2>Dados da barbearia</h2>
        <p>Você poderá editar estas informações no painel.</p>
      </header>
      <OnboardingForm manualUserId={manualTrialOnboardingEnabled() ? user.id : null} />
      <div className="account-alternatives">
        <p>A contratação de um plano pago depende de acordo com a LPS Solutions.</p>
        <Link href="/dashboard" className="account-link">Ir para o painel <ArrowRight size={16} aria-hidden /></Link>
      </div>
    </AccountShell>
  );
}
