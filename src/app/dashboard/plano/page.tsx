import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { SubscriptionStatusBadge } from "@/components/dashboard/status-badge";
import { BillingManager } from "@/features/billing/components/billing-manager";
import { LegacyInvoices } from "@/features/billing/components/legacy-invoices";
import {
  getBillingPageData,
  getLegacyInvoices,
  getOwnerManualPlan,
} from "@/features/billing/queries";
import {
  CommercialContact,
  CommercialPlans,
} from "@/features/marketing/commercial-plans";
import { getBarbershopBookingAccess } from "@/features/scheduling/booking-access";
import { requireOwnerDashboardContext } from "@/lib/auth/dal";
import { formatCurrencyFromCents, formatDateBR } from "@/lib/format";

export const metadata: Metadata = {
  title: "Plano e assinatura",
  robots: { index: false },
};

export default async function PlanPage() {
  const { active } = await requireOwnerDashboardContext();
  const shop = active.barbershop;
  const owner = active.role === "owner";
  if (!owner && (await getBarbershopBookingAccess(shop.id)).manual) {
    return (
      <PageHeader
        title="Plano e assinatura"
        description="Consulte o proprietário para informações sobre a assinatura."
      />
    );
  }
  const manual = owner ? await getOwnerManualPlan(shop.id) : null;
  if (manual) {
    const invoices = await getLegacyInvoices(shop.id);
    const date = (value: string) =>
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: shop.timezone,
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value));
    const agreement = manual.agreement;
    const days =
      manual.days_left === 1
        ? "1 dia restante"
        : `${manual.days_left} dias restantes`;
    return (
      <section className="space-y-6">
        <PageHeader
          eyebrow="Plano e assinatura"
          title={manual.plan ?? "Assinatura manual"}
          description="Contratação assistida pela LPS Solutions, com confirmação manual do Pix."
        />
        <div className="grid max-w-3xl gap-4 rounded-xl border bg-card p-5 sm:p-7">
          <h3 className="flex flex-wrap items-center gap-3 text-lg font-semibold">
            Detalhes da assinatura{" "}
            {manual.status && (
              <SubscriptionStatusBadge status={manual.status} />
            )}
          </h3>
          {manual.trial_start && manual.trial_end && (
            <p className="text-sm">
              {manual.trial_state === "running"
                ? `Teste gratuito · ${days}`
                : manual.trial_state === "canceled"
                  ? "Teste cancelado"
                  : `Teste encerrado · ${days}`}{" "}
              · {date(manual.trial_start)} a {date(manual.trial_end)}
            </p>
          )}
          {agreement && (
            <dl className="grid gap-4 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt>Mensalidade contratada</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatCurrencyFromCents(agreement.monthly_cents)}
                </dd>
              </div>
              <div>
                <dt>
                  {manual.reason === "paid"
                    ? "Cobertura paga"
                    : "Período contratual"}
                </dt>
                <dd>
                  {date(agreement.period_start)} a {date(agreement.period_end)}
                </dd>
              </div>
              <div>
                <dt>Primeiro vencimento acordado</dt>
                <dd>{date(agreement.first_due_at)}</dd>
              </div>
              {agreement.outstanding_due_at && (
                <div>
                  <dt>Vencimento mais antigo em aberto</dt>
                  <dd>{date(agreement.outstanding_due_at)}</dd>
                </div>
              )}
            </dl>
          )}
          <p className="text-sm">
            {manual.reason === "mixed_origin"
              ? "Assinatura em conciliação. Consulte a LPS Solutions."
              : manual.reason === "suspended"
                ? "Contrato suspenso."
                : manual.access === "grace"
                  ? "Novos agendamentos disponíveis durante a carência."
                  : manual.access === "blocked"
                    ? "Novos agendamentos estão bloqueados. Sua agenda e as reservas anteriores continuam disponíveis para consulta."
                    : "Novos agendamentos disponíveis."}
          </p>
          <p className="border-t pt-4 text-sm">
            Combine a contratação e o pagamento diretamente com a LPS Solutions.
            A equipe financeira confere o crédito antes de confirmar a
            mensalidade.
          </p>
          <div>
            <CommercialContact />
          </div>
        </div>
        {invoices.length > 0 && (
          <LegacyInvoices invoices={invoices} timezone={shop.timezone} />
        )}
      </section>
    );
  }
  const data = await getBillingPageData(shop.id);
  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow="Gestão"
        title="Plano e assinatura"
        description={
          data.subscription
            ? "Consulte as condições e as mensalidades da sua assinatura Asaas existente."
            : "Conheça os planos e solicite uma proposta para sua barbearia."
        }
      />
      {data.subscription ? (
        <BillingManager
          data={{ ...data, subscription: data.subscription }}
          timezone={shop.timezone}
          canManage={owner}
        />
      ) : (
        <>
          <div>
            <h2 className="text-2xl font-semibold">Planos para sua equipe</h2>
            <CommercialPlans />
          </div>
          {data.hasUsedTrial && (
            <p className="text-sm text-muted-foreground">
              Esta barbearia já utilizou um teste no modelo legado.
            </p>
          )}
          {data.lastCanceled && (
            <p className="rounded-xl border p-4 text-sm">
              Última assinatura Asaas cancelada em{" "}
              {formatDateBR(data.lastCanceled.canceledAt, shop.timezone)}.{" "}
              {data.lastCanceled.cancelReason}
            </p>
          )}
          {data.invoices.length > 0 && (
            <LegacyInvoices invoices={data.invoices} timezone={shop.timezone} />
          )}
        </>
      )}
    </section>
  );
}
