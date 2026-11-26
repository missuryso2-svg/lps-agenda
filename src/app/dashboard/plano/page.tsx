import type { Metadata } from "next";
import Link from "next/link";
import { Check, UsersRound } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { SubscriptionStatusBadge } from "@/components/dashboard/status-badge";
import { getPlanBarberLimit } from "@/features/barbers/plan-limit";
import { BillingManager } from "@/features/billing/components/billing-manager";
import { LegacyInvoices } from "@/features/billing/components/legacy-invoices";
import { getBillingPageData, getLegacyInvoices, getOwnerManualPlan } from "@/features/billing/queries";
import type { BillingPlan } from "@/features/billing/types";
import { getPlans } from "@/features/dashboard/queries";
import { CommercialContact } from "@/features/marketing/commercial-plans";
import { commercialPlans, commercialWhatsApp } from "@/features/marketing/commercial";
import { getOwnerAutomaticTrial } from "@/features/premium-trial/queries";
import { automaticTrialDisplay } from "@/features/premium-trial/display";
import { getBarbershopBookingAccess } from "@/features/scheduling/booking-access";
import { requireOwnerDashboardContext } from "@/lib/auth/dal";
import { formatCurrencyFromCents, formatDateBR } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import "@/components/dashboard/account-j2.css";

export const metadata: Metadata = { title: "Plano e assinatura", robots: { index: false } };

function professionalLimit(maximum: number | null) {
  return maximum === null ? "Sem limite de profissionais no catálogo"
    : maximum === 1 ? "1 profissional ativo" : "Até " + maximum + " profissionais ativos";
}

function PlanCatalog({
  plans,
  activeCount,
  current,
}: {
  plans: BillingPlan[];
  activeCount: number | null;
  current?: string | null;
}) {
  const hasCommercialChannel = Boolean(commercialWhatsApp(process.env.LPS_COMMERCIAL_WHATSAPP, "geral"));
  return (
    <section className="space-y-3" aria-labelledby="catalog-heading">
      <h3 id="catalog-heading" className="j2-c3-card-title">Compare os planos</h3>
      <p className="j2-c3-meta">Preços de referência do catálogo. A LPS Solutions confirma os valores e as condições no acordo.</p>
      {plans.length ? (
        <div className="j2-c3-catalog">
          {plans.map(plan => {
            const features = Array.isArray(plan.features)
              ? plan.features.filter((feature): feature is string => typeof feature === "string")
              : [];
            const incompatible = activeCount !== null && plan.max_barbers !== null && activeCount > plan.max_barbers;
            const inquiry = commercialPlans.find(item => item.code === plan.code)?.code ?? "geral";
            return (
              <article key={plan.id} className={"j2-c3-panel j2-c3-plan-card" + (plan.name === current ? " j2-c3-current-plan" : "")}>
                <h4>{plan.name}<span className="sr-only"> no catálogo</span></h4>
                {plan.name === current && <p className="j2-c3-meta">Plano atual</p>}
                <p className="mt-3 text-xl font-semibold tabular-nums">
                  {formatCurrencyFromCents(plan.price_cents, plan.currency)}{" "}
                  <span className="j2-c3-meta">{plan.interval === "year" ? "por ano" : "por mês"}</span>
                </p>
                <p className="mt-2 flex items-start gap-2 text-sm font-medium">
                  <UsersRound className="size-4 shrink-0" aria-hidden />
                  {professionalLimit(plan.max_barbers)}
                </p>
                {incompatible && (
                  <p className="mt-3 rounded-md border p-2 text-sm">
                    Você tem {activeCount} profissionais ativos. Para contratar {plan.name}, ajuste a equipe ao limite do plano em{" "}
                    <Link className="underline underline-offset-4" href="/dashboard/equipe">Equipe</Link>.
                  </p>
                )}
                {features.length > 0 && (
                  <details className="mt-4 border-t pt-3">
                    <summary className="cursor-pointer py-2 text-sm font-semibold">Recursos do catálogo</summary>
                    <ul className="mt-2 space-y-2 text-sm">
                      {features.map((feature, index) => (
                        <li className="flex items-start gap-2" key={feature + index}>
                          <Check className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {hasCommercialChannel && (
                  <div className="mt-3">
                    <CommercialContact inquiry={inquiry} label={"Consultar " + plan.name} highlighted={false} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : <p className="j2-c3-panel j2-c3-meta">Nenhum plano disponível no catálogo neste momento.</p>}
    </section>
  );
}

export default async function PlanPage() {
  const { active } = await requireOwnerDashboardContext();
  const shop = active.barbershop;
  const owner = active.role === "owner";
  if (!owner && (await getBarbershopBookingAccess(shop.id)).manual) {
    return (
      <PageHeader title="Plano e assinatura" description="Consulte o proprietário para informações sobre a assinatura." />
    );
  }

  const manual = owner ? await getOwnerManualPlan(shop.id) : null;
  const db = await createClient();
  const activeBarbers = db.from("barbers").select("id", { count: "exact", head: true })
    .eq("barbershop_id", shop.id).eq("is_active", true);

  if (manual) {
    const [invoices, limit, plans, automatic, { count: activeCount }] = await Promise.all([
      getLegacyInvoices(shop.id),
      getPlanBarberLimit(db, shop.id),
      getPlans(),
      manual.trial_state ? getOwnerAutomaticTrial(shop.id).catch(() => null) : null,
      activeBarbers,
    ]);
    const automaticDisplay = automatic ? automaticTrialDisplay(automatic, shop.timezone) : null;
    const agreement = manual.agreement;
    const status = manual.status === "trialing" && manual.trial_state === "ended" ? "expired" : manual.status;
    const coverage =
      manual.reason === "mixed_origin" ? "Assinatura em conciliação. Consulte a LPS Solutions."
        : manual.reason === "suspended" ? "Contrato suspenso."
        : manual.access === "grace" ? "Novos agendamentos disponíveis durante a carência."
        : manual.access === "blocked" ? "Novos agendamentos estão bloqueados. As reservas anteriores continuam disponíveis."
        : "Novos agendamentos disponíveis.";

    return (
      <section className="j2-c3 j2-c3-plan">
        <PageHeader className="j2-c3-heading" title="Plano e assinatura" description="Acompanhe a cobertura e as condições da sua barbearia." />
        <div className="j2-c3-two-columns">
          <section className="j2-c3-panel" aria-labelledby="subscription-heading">
            <p className="j2-c3-meta">Plano atual</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h3 id="subscription-heading">{manual.plan ?? "Assinatura manual"}</h3>
              {status && <SubscriptionStatusBadge status={status} />}
            </div>
            {limit && <p className="mt-3 text-sm font-semibold">{professionalLimit(limit.maxBarbers)}</p>}
            {automaticDisplay && (
              <p className="j2-c3-meta mt-2">
                {automaticDisplay.expired ? "Período gratuito encerrado em " : "Período gratuito até "}{automaticDisplay.endsOn}
              </p>
            )}
            {!automaticDisplay && manual.trial_end && (
              <p className="j2-c3-meta mt-2">
                {manual.trial_state === "running" ? "Teste gratuito" : manual.trial_state === "canceled" ? "Teste cancelado" : "Teste encerrado"}
                {" · "}{formatDateBR(manual.trial_end, shop.timezone)}
              </p>
            )}
            <p className="j2-c3-meta mt-3">{coverage}</p>
          </section>

          <section id="contratacao-manual" className="j2-c3-panel scroll-mt-24" aria-labelledby="agreement-heading">
            <h3 id="agreement-heading">Contratação manual</h3>
            {agreement && (
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="j2-c3-meta">Mensalidade contratada</dt><dd className="font-semibold">{formatCurrencyFromCents(agreement.monthly_cents)}</dd></div>
                <div><dt className="j2-c3-meta">Primeiro vencimento</dt><dd>{formatDateBR(agreement.first_due_at, shop.timezone)}</dd></div>
                <div><dt className="j2-c3-meta">{manual.reason === "paid" ? "Cobertura paga" : "Período contratual"}</dt><dd>{formatDateBR(agreement.period_start, shop.timezone)} até {formatDateBR(agreement.period_end, shop.timezone)}</dd></div>
                {agreement.outstanding_due_at && <div><dt className="j2-c3-meta">Vencimento mais antigo em aberto</dt><dd>{formatDateBR(agreement.outstanding_due_at, shop.timezone)}</dd></div>}
              </dl>
            )}
            {automaticDisplay && !automaticDisplay.expired && (
              <p className="mt-3 rounded-md border p-3 text-sm">
                Se você contratar antes do fim, o registro confirmado do acordo encerra o período grátis imediatamente. Novos agendamentos podem ficar bloqueados até a conferência do Pix e o início da cobertura contratada.
              </p>
            )}
            <p className="j2-c3-meta my-3">Combine o plano e o pagamento com a LPS Solutions. A mensalidade só é confirmada após a conferência do Pix. O período grátis não gera cobrança automática.</p>
            <CommercialContact />
          </section>
        </div>
        <PlanCatalog plans={plans} activeCount={activeCount} current={manual.plan} />
        {invoices.length > 0 && <LegacyInvoices invoices={invoices} timezone={shop.timezone} />}
      </section>
    );
  }

  const [data, { count: activeCount }] = await Promise.all([
    getBillingPageData(shop.id),
    activeBarbers,
  ]);
  return (
    <section className="j2-c3 j2-c3-plan">
      <PageHeader className="j2-c3-heading" title="Plano e assinatura"
        description={data.subscription ? "Condições e pagamentos da assinatura Asaas existente." : "Compare o catálogo e solicite uma proposta para a sua barbearia."}
      />
      {data.subscription ? (
        <>
          <BillingManager data={{ ...data, subscription: data.subscription }} timezone={shop.timezone} canManage={owner} />
          <section id="contratacao-manual" className="j2-c3-panel scroll-mt-24">
            <h3>Atendimento comercial</h3>
            {data.subscription.plan && <p className="j2-c3-meta my-3">{professionalLimit(data.subscription.plan.max_barbers)}</p>}
            <CommercialContact />
          </section>
        </>
      ) : (
        <>
          <PlanCatalog plans={data.plans} activeCount={activeCount} />
          <section id="contratacao-manual" className="j2-c3-panel scroll-mt-24">
            <h3>Contratação manual</h3>
            <p className="j2-c3-meta my-3">Combine a proposta e a mensalidade com a LPS Solutions. O pagamento é confirmado após a conferência do Pix.</p>
            <CommercialContact />
          </section>
          {data.hasUsedTrial && <p className="j2-c3-meta">Esta barbearia já utilizou um teste no modelo legado.</p>}
          {data.lastCanceled && (
            <p className="j2-c3-panel j2-c3-meta">
              Última assinatura Asaas cancelada em {formatDateBR(data.lastCanceled.canceledAt, shop.timezone)}. {data.lastCanceled.cancelReason}
            </p>
          )}
          {data.invoices.length > 0 && <LegacyInvoices invoices={data.invoices} timezone={shop.timezone} />}
        </>
      )}
    </section>
  );
}
