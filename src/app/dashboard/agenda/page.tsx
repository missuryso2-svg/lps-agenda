import {
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  ListChecks,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";

import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { AgendaBoard } from "@/features/scheduling/components/agenda-board";
import {
  getAgendaPageData,
  getInitialCustomerOptions,
  getSchedulingOptions,
} from "@/features/scheduling/queries";
import {
  isCurrentUserPlatformAdmin,
  requireDashboardContext,
} from "@/lib/auth/dal";
import { canOperateShop } from "@/lib/auth/permissions";
import {
  formatCurrencyFromCents,
  todayInTimeZone,
} from "@/lib/format";
import { isValidDateString } from "@/lib/validation/schedule";

export const metadata: Metadata = {
  title: "Agenda",
};

type AgendaPageProps = {
  searchParams: Promise<{
    date?: string;
    view?: string;
    barber?: string;
    new?: string;
  }>;
};

export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const [params, context] = await Promise.all([
    searchParams,
    requireDashboardContext(),
  ]);

  const shop = context.active.barbershop;
  const timeZone = shop.timezone || "America/Sao_Paulo";
  const today = todayInTimeZone(timeZone);
  const requestedDate = (params.date ?? "").trim();
  const date = isValidDateString(requestedDate) ? requestedDate : today;
  const view = params.view === "week" ? "week" : "day";
  const barberId = (params.barber ?? "").trim().slice(0, 64) || null;

  const [data, options, customers] = await Promise.all([
    getAgendaPageData({
      barbershopId: shop.id,
      timeZone,
      date,
      view,
      barberId,
    }),
    getSchedulingOptions(shop.id),
    getInitialCustomerOptions(shop.id),
  ]);

  const canManage =
    canOperateShop(context.active.role) ||
    isCurrentUserPlatformAdmin(context.user);

  const visibleAppointments =
    data.view === "week"
      ? data.weekDays.flatMap((day) => day.appointments)
      : data.appointments;
  const awaiting = visibleAppointments.filter(
    (appointment) =>
      appointment.status === "scheduled" ||
      appointment.status === "confirmed",
  ).length;
  const inProgress = visibleAppointments.filter(
    (appointment) => appointment.status === "in_progress",
  ).length;
  const completed = visibleAppointments.filter(
    (appointment) => appointment.status === "completed",
  ).length;
  const cancelled = visibleAppointments.filter(
    (appointment) =>
      appointment.status === "cancelled" || appointment.status === "no_show",
  ).length;
  const expectedRevenue = visibleAppointments
    .filter(
      (appointment) =>
        appointment.status !== "cancelled" &&
        appointment.status !== "no_show",
    )
    .reduce((total, appointment) => total + appointment.priceCents, 0);

  const periodLabel =
    data.view === "week" ? "nesta semana" : "neste dia";

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title={data.view === "week" ? "Agenda semanal" : "Agenda diária"}
        description="Visualize compromissos, bloqueios e horários livres por profissional. A disponibilidade é calculada no servidor e a gravação é protegida contra sobreposição no banco."
        actions={
          <Badge variant="outline" className="w-fit">
            <CalendarCheck2 className="size-3.5 text-gold" />
            {visibleAppointments.length} agendamento(s) {periodLabel}
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Aguardando"
          value={String(awaiting)}
          hint="Agendados ou confirmados"
          icon={Clock3}
          tone="gold"
        />
        <StatCard
          label="Em atendimento"
          value={String(inProgress)}
          hint={`${completed} concluído(s) no período`}
          icon={ListChecks}
        />
        <StatCard
          label="Cancelados / faltas"
          value={String(cancelled)}
          hint="Horários liberados após o cancelamento"
          icon={XCircle}
          tone="muted"
        />
        <StatCard
          label="Previsão do período"
          value={formatCurrencyFromCents(expectedRevenue)}
          hint="Agendamentos não cancelados nem ausentes"
          icon={CheckCircle2}
        />
      </div>

      <AgendaBoard
        data={data}
        options={options}
        initialCustomers={customers}
        canManage={canManage}
        today={today}
        openNewOnMount={params.new === "1"}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <NoticeCard icon={ShieldCheck} title="Conflitos bloqueados no banco">
          A constraint <code>appointments_no_overlap</code> usa{" "}
          <code>EXCLUDE USING GIST</code> sobre o intervalo e o profissional.
          Duas gravações simultâneas não produzem sobreposição, mesmo que ambas
          tenham consultado a disponibilidade antes.
        </NoticeCard>
        <NoticeCard icon={Clock3} title="Uma única regra de disponibilidade">
          Funcionamento da barbearia, jornada, bloqueios, duração do serviço,
          agendamentos ativos, horário atual e fuso são cruzados pela mesma
          função no servidor, usada na consulta e na gravação.
        </NoticeCard>
        <NoticeCard icon={CalendarPlus} title="Histórico preservado" tone="gold">
          Cancelar libera o horário e mantém o registro com motivo opcional.
          Concluir e registrar ausência encerram o atendimento sem apagar o
          histórico.
        </NoticeCard>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-gold" />
        Fuso da barbearia: {timeZone}. Todos os horários exibidos seguem o
        horário local da operação.
      </div>
    </div>
  );
}
