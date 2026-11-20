import { CalendarDays, CreditCard, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { BillingManager } from "@/features/billing/components/billing-manager";
import { getBarbershopBookingAccess } from "@/features/scheduling/booking-access";
import {
  getBillingPageData,
  getOwnerManualPlan,
} from "@/features/billing/queries";
import { requireOwnerDashboardContext } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Plano e assinatura",
};

export default async function PlanPage() {
  const context = await requireOwnerDashboardContext();
  const shop = context.active.barbershop;
  const canManage = context.active.role === "owner";
  if (!canManage && (await getBarbershopBookingAccess(shop.id)).manual) {
    return (
      <PageHeader
        title="Plano e assinatura"
        description="Consulte o proprietário para informações sobre a assinatura."
      />
    );
  }
  const manual = canManage ? await getOwnerManualPlan(shop.id) : null;
  if (manual) {
    const format = (value: string) =>
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: shop.timezone,
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value));
    const days =
      manual.days_left === 1
        ? "1 dia restante"
        : `${manual.days_left} dias restantes`;
    const trialLabel =
      manual.trial_state === "running"
        ? "Teste gratuito"
        : manual.trial_state === "canceled"
          ? "Teste cancelado"
          : "Teste encerrado";
    return (
      <section className="space-y-6">
        <PageHeader
          eyebrow="Plano e assinatura"
          title={manual.plan ?? "Assinatura manual"}
          description={
            manual.trial_state ? `${trialLabel} · ${days}` : "Assinatura manual"
          }
        />
        <div className="grid max-w-3xl gap-4 rounded-xl border border-border bg-card p-5 sm:p-7">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="size-5 text-gold" /> Detalhes da assinatura
          </h3>
          {manual.trial_start && manual.trial_end && (
            <p className="text-sm text-muted-foreground">
              Período de teste de {format(manual.trial_start)} até{" "}
              {format(manual.trial_end)}.
            </p>
          )}
          {manual.access === "blocked" && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Novos agendamentos estão bloqueados. Sua agenda e as reservas
              anteriores continuam disponíveis para consulta.
            </p>
          )}
          <p className="border-t border-border pt-4 text-sm">
            Combine a contratação e o pagamento diretamente com a LPS Solutions.
            Não há cobrança automática.
          </p>
        </div>
      </section>
    );
  }
  const data = await getBillingPageData(shop.id);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Gestão"
        title="Plano e assinatura"
        description="Consulte seu plano, compare os recursos para sua equipe e acompanhe o histórico de mensalidades."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-gold/25 bg-gold-soft/30 px-3 py-2 text-[11px] text-muted-foreground">
            <CreditCard className="size-3.5 text-gold" />
            Boleto ou Pix
          </div>
        }
      />

      <BillingManager
        data={data}
        timezone={shop.timezone}
        canManage={canManage}
      />

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Sparkles className="size-3.5 text-gold" />A mensalidade da plataforma é
        separada do financeiro dos serviços da barbearia.
      </div>
    </div>
  );
}
