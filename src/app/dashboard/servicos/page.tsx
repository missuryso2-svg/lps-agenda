import {
  Banknote,
  CheckCircle2,
  CircleOff,
  Clock3,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";

import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title="Serviços"
        description="Cadastre, edite e organize o catálogo da barbearia. Preço, duração e disponibilidade definem como cada serviço aparece na agenda."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Serviços ativos"
          value={String(activeServices.length)}
          hint={`${services.length} registro(s) no catálogo`}
          icon={Scissors}
          tone="gold"
        />
        <StatCard
          label="Preço médio"
          value={
            activeServices.length > 0
              ? formatCurrencyFromCents(averagePrice)
              : "—"
          }
          hint="Considera apenas serviços ativos"
          icon={Banknote}
        />
        <StatCard
          label="Duração média"
          value={activeServices.length > 0 ? `${averageDuration} min` : "—"}
          hint="Tempo médio de cadeira"
          icon={Clock3}
        />
        <StatCard
          label="Inativos"
          value={String(services.length - activeServices.length)}
          hint="Fora da operação no momento"
          icon={CircleOff}
          tone="muted"
        />
      </div>

      <Card>
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle>Catálogo da barbearia</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Serviços cadastrados para {shop.name}. A busca filtra por nome e as
            alterações são gravadas no Supabase.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <ServicesManager services={services} canManage={canManage} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <NoticeCard icon={CheckCircle2} title="Preço preservado">
          Cada agendamento guarda o preço praticado no momento da criação. Uma
          alteração futura no catálogo não reescreve o histórico financeiro.
        </NoticeCard>
        <NoticeCard icon={ShieldCheck} title="Permissões do catálogo" tone="gold">
          Proprietários e administradores da plataforma gerenciam o catálogo. A
          equipe consulta os dados em modo somente leitura, e a RLS reforça essa
          regra no banco.
        </NoticeCard>
      </div>
    </div>
  );
}
