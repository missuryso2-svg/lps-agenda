import { QrCode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { OperationHeading, OperationMetrics } from "@/components/dashboard/operation-page";
import { Button } from "@/components/ui/button";
import { AgendaBoard } from "@/features/scheduling/components/agenda-board";
import {
  getAgendaPageData,
  getInitialCustomerOptions,
  getSchedulingOptions,
} from "@/features/scheduling/queries";
import { getBarbershopBookingAccess } from "@/features/scheduling/booking-access";
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

  const [data, options, customers, bookingAccess] = await Promise.all([
    getAgendaPageData({
      barbershopId: shop.id,
      timeZone,
      date,
      view,
      barberId,
    }),
    getSchedulingOptions(shop.id),
    getInitialCustomerOptions(shop.id),
    getBarbershopBookingAccess(shop.id).catch(() => null),
  ]);

  const canManage =
    canOperateShop(context.active.role) ||
    isCurrentUserPlatformAdmin(context.user);
  const canCreateAppointments = canManage && bookingAccess?.allowed === true;

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

  return (
    <div className="j2-operation">
      <OperationHeading
        title={data.view === "week" ? "Agenda semanal" : "Agenda diária"}
        description="Consulte atendimentos, bloqueios e horários livres por profissional."
        actions={
          <Button asChild variant="outline" className="j2-operation-secondary">
            <Link href="/dashboard/qr"><QrCode aria-hidden /> QR Code de agendamento</Link>
          </Button>
        }
      />
      <OperationMetrics
        label="Resumo do período"
        entries={[
          { label: "Aguardando", value: String(awaiting), note: "Agendados ou confirmados" },
          { label: "Em atendimento", value: String(inProgress), note: completed + " concluído(s)" },
          { label: "Cancelados e faltas", value: String(cancelled) },
          { label: "Previsão do período", value: formatCurrencyFromCents(expectedRevenue), note: "Agendamentos válidos" },
        ]}
      />
      <AgendaBoard
        key={[date, view, barberId].join("/")}
        data={data}
        options={options}
        initialCustomers={customers}
        canManage={canManage}
        canCreateAppointments={canCreateAppointments}
        today={today}
        openNewOnMount={params.new === "1"}
      />
    </div>
  );
}