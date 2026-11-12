import {
  CalendarCheck2,
  CalendarClock,
  CalendarOff,
  Clock3,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";

import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getBarbers,
  getBarberWorkingHours,
  getBlockedSlots,
  getBusinessHours,
} from "@/features/dashboard/queries";
import { ScheduleTabs } from "@/features/schedule/components/schedule-tabs";
import {
  isCurrentUserPlatformAdmin,
  requireDashboardContext,
} from "@/lib/auth/dal";
import { canManageShop } from "@/lib/auth/permissions";
import { timeToMinutes } from "@/lib/validation/schedule";

export const metadata: Metadata = {
  title: "Horários",
};

export default async function SchedulePage() {
  const context = await requireDashboardContext();
  const shop = context.active.barbershop;
  const canManage =
    canManageShop(context.active.role) ||
    isCurrentUserPlatformAdmin(context.user);

  const [businessHours, workingHours, blockedSlots, barbers] = await Promise.all(
    [
      getBusinessHours(shop.id),
      getBarberWorkingHours(shop.id),
      getBlockedSlots(shop.id),
      getBarbers(shop.id),
    ],
  );

  const openDays = businessHours.filter((row) => row.is_active);
  const weeklyMinutes = openDays.reduce((total, row) => {
    const start = timeToMinutes(row.opens_at);
    const end = timeToMinutes(row.closes_at);

    return Number.isNaN(start) || Number.isNaN(end) || end <= start
      ? total
      : total + end - start;
  }, 0);
  const scheduledBarbers = new Set(
    workingHours
      .filter((row) => row.is_active)
      .map((row) => row.barber_id),
  );

  const scheduleBarbers = barbers.map((barber) => ({
    id: barber.id,
    name: barber.name,
    is_active: barber.is_active,
  }));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title="Horários e disponibilidade"
        description="Defina quando a barbearia abre, a jornada individual de cada profissional e os períodos indisponíveis. Essas regras serão a base do próximo mecanismo de agendamento."
        actions={
          <Badge variant="outline" className="w-fit">
            <Clock3 className="size-3.5 text-gold" />
            Fuso {shop.timezone || "America/Sao_Paulo"}
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Dias abertos"
          value={`${openDays.length} de 7`}
          hint="Dias com funcionamento ativo"
          icon={CalendarCheck2}
          tone="gold"
        />
        <StatCard
          label="Carga semanal"
          value={`${Math.floor(weeklyMinutes / 60)}h${String(
            weeklyMinutes % 60,
          ).padStart(2, "0")}`}
          hint="Somatório das faixas abertas"
          icon={CalendarClock}
        />
        <StatCard
          label="Profissionais com jornada"
          value={`${scheduledBarbers.size} de ${barbers.length}`}
          hint="Com ao menos um dia ativo"
          icon={UsersRound}
        />
        <StatCard
          label="Bloqueios cadastrados"
          value={String(blockedSlots.length)}
          hint="Inclui períodos encerrados"
          icon={CalendarOff}
          tone="muted"
        />
      </div>

      <Card>
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle>Configuração semanal</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Alterações em {shop.name} são gravadas no Supabase e revalidadas para
            toda a equipe. A jornada precisa caber no funcionamento da
            barbearia.
          </p>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <ScheduleTabs
            businessHours={businessHours}
            workingHours={workingHours}
            blockedSlots={blockedSlots}
            barbers={scheduleBarbers}
            timeZone={shop.timezone || "America/Sao_Paulo"}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <NoticeCard icon={Clock3} title="Horários locais da barbearia">
          O funcionamento e a jornada usam horários locais, sem conversão
          indevida para UTC. Apenas os bloqueios são gravados como instantes,
          convertidos pelo fuso da barbearia.
        </NoticeCard>
        <NoticeCard icon={ShieldCheck} title="Permissões de horários" tone="gold">
          Proprietários e administradores da plataforma configuram horários e
          bloqueios. A equipe consulta em modo somente leitura, e a RLS aplica a
          mesma regra no banco.
        </NoticeCard>
      </div>
    </div>
  );
}
