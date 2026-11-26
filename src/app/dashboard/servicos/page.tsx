import type { Metadata } from "next";

import { ManagementHeading, ManagementSection } from "@/components/dashboard/management-page";
import { OperationMetrics } from "@/components/dashboard/operation-page";
import { getServices } from "@/features/dashboard/queries";
import { ServicesManager } from "@/features/services/components/services-manager";
import {
  isCurrentUserPlatformAdmin,
  requireDashboardContext,
} from "@/lib/auth/dal";
import { canManageShop } from "@/lib/auth/permissions";
import { formatCurrencyFromCents } from "@/lib/format";

export const metadata: Metadata = {
  title: "Serviços",
};

export default async function ServicesPage() {
  const context = await requireDashboardContext();
  const shop = context.active.barbershop;
  const canManage =
    canManageShop(context.active.role) ||
    isCurrentUserPlatformAdmin(context.user);
  const services = await getServices(shop.id);

  const activeServices = services.filter((service) => service.is_active);
  const averagePrice =
    activeServices.length > 0
      ? Math.round(
          activeServices.reduce(
            (total, service) => total + service.price_cents,
            0,
          ) / activeServices.length,
        )
      : 0;
  const averageDuration =
    activeServices.length > 0
      ? Math.round(
          activeServices.reduce(
            (total, service) => total + service.duration_minutes,
            0,
          ) / activeServices.length,
        )
      : 0;

  return (
    <div className="j2-operation j2-management">
      <ManagementHeading title="Serviços" description="Gerencie o preço, a duração e a disponibilidade dos serviços oferecidos." />
      <OperationMetrics label="Resumo do catálogo" entries={[
        { label: "Ativos", value: String(activeServices.length), note: services.length + " no catálogo" },
        { label: "Preço médio", value: activeServices.length ? formatCurrencyFromCents(averagePrice) : "—" },
        { label: "Duração média", value: activeServices.length ? averageDuration + " min" : "—" },
        { label: "Inativos", value: String(services.length - activeServices.length) },
      ]} />
      <ManagementSection id="catalogo-servicos" title="Catálogo da barbearia">
        <ServicesManager services={services} canManage={canManage} />
      </ManagementSection>
    </div>
  );
}
