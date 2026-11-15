import { CreditCard, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { BillingManager } from "@/features/billing/components/billing-manager";
import { getBillingPageData } from "@/features/billing/queries";
import { requireOwnerDashboardContext } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Plano e assinatura",
};

export default async function PlanPage() {
  const context = await requireOwnerDashboardContext();
  const shop = context.active.barbershop;
  const data = await getBillingPageData(shop.id);
  const canManage = context.active.role === "owner";

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Gestão"
        title="Plano e assinatura"
        description="Comece com 7 dias grátis e gerencie a mensalidade do LPS Agenda. A assinatura é criada no Asaas Sandbox somente ao final do teste e o plano é ativado após a confirmação do pagamento."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-gold/25 bg-gold-soft/30 px-3 py-2 text-[11px] text-muted-foreground">
            <CreditCard className="size-3.5 text-gold" />
            Boleto ou Pix
          </div>
        }
      />

      <BillingManager data={data} timezone={shop.timezone} canManage={canManage} />

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Sparkles className="size-3.5 text-gold" />
        A mensalidade da plataforma é separada do financeiro dos serviços da
        barbearia.
      </div>
    </div>
  );
}
