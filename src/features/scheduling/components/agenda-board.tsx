"use client";

import {
  Ban,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Lock,
  Plus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AppointmentStatusBadge } from "@/components/dashboard/status-badge";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppointmentDetailsDialog } from "@/features/scheduling/components/appointment-details-dialog";
import { CancelAppointmentDialog } from "@/features/scheduling/components/cancel-appointment-dialog";
import { NewAppointmentDialog } from "@/features/scheduling/components/new-appointment-dialog";
import { RescheduleAppointmentDialog } from "@/features/scheduling/components/reschedule-appointment-dialog";
import type {
  AgendaAppointment,
  AgendaData,
  AgendaTimeline,
  AgendaView,
  CustomerOption,
  SchedulingOptions,
} from "@/features/scheduling/types";
import {
  addDaysToDateString,
  formatDateOnlyBR,
  formatTimeBR,
  initialsFromName,
  shortWeekdayLabel,
  weekdayFromDateString,
  weekdayLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function agendaHref({
  date,
  view,
  barberId,
}: {
  date: string;
  view: AgendaView;
  barberId: string | null;
}) {
  const params = new URLSearchParams();
  params.set("date", date);

  if (view === "week") {
    params.set("view", "week");
  }

  if (barberId) {
    params.set("barber", barberId);
  }

  return `/dashboard/agenda?${params.toString()}`;
}

function weekLabel(data: AgendaData) {
  const first = data.weekDays[0];
  const last = data.weekDays.at(-1);

  if (!first || !last) {
    return formatDateOnlyBR(data.date);
  }

  return `${formatDateOnlyBR(first.date)} – ${formatDateOnlyBR(last.date)}`;
}

function AppointmentCard({
  appointment,
  timeZone,
  onSelect,
  compact = false,
}: {
  appointment: AgendaAppointment;
  timeZone: string;
  onSelect: (appointment: AgendaAppointment) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(appointment)}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl border border-border/80 bg-card p-3 text-left transition-colors outline-none hover:border-gold/40 hover:bg-gold-soft/20 focus-visible:ring-3 focus-visible:ring-ring/50",
        appointment.status === "cancelled" && "opacity-65",
        compact && "p-2.5",
      )}
      aria-label={`${appointment.customerName}, ${appointment.serviceName}, ${formatTimeBR(
        appointment.startsAt,
        timeZone,
      )}, ${appointment.status}`}
    >
      <span className="w-11 shrink-0 rounded-lg border border-border/80 bg-muted/30 py-1.5 text-center">
        <span className="block font-mono text-[11px] font-semibold leading-none">
          {formatTimeBR(appointment.startsAt, timeZone)}
        </span>
        <span className="mt-1 block text-[9px] text-muted-foreground">
          {formatTimeBR(appointment.endsAt, timeZone)}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-xs font-semibold">
            {appointment.customerName}
          </span>
          <AppointmentStatusBadge status={appointment.status} />
        </span>
        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
          {appointment.serviceName}
          {appointment.durationMinutes
            ? ` · ${appointment.durationMinutes} min`
            : ""}
        </span>
        {!compact ? (
          <span className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock3 className="size-3" />
            {appointment.barberName}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function BarberTimeline({
  timeline,
  timeZone,
  onSelect,
}: {
  timeline: AgendaTimeline;
  timeZone: string;
  onSelect: (appointment: AgendaAppointment) => void;
}) {
  const appointments = timeline.items.filter(
    (item) => item.kind === "appointment",
  );
  const blocks = timeline.items.filter((item) => item.kind === "block");

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70 pb-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/25 bg-gold-soft/40 text-[10px] font-semibold text-gold">
            {initialsFromName(timeline.barberName)}
          </span>
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">
              {timeline.barberName}
            </CardTitle>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {appointments.length} compromisso(s) · {blocks.length} bloqueio(s)
            </p>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {timeline.freeRanges.length > 0
            ? `${timeline.freeRanges.length} faixa(s) livre(s)`
            : "Sem horários livres"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3 pt-3.5">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Horários disponíveis
          </p>
          {timeline.freeRanges.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {timeline.freeRanges.map((range) => (
                <span
                  key={`${range.start}-${range.end}`}
                  className="rounded-md border border-emerald-500/25 bg-card px-1.5 py-1 font-mono text-[10px] tabular-nums"
                >
                  {range.start}–{range.end}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {timeline.openRanges.length > 0
                ? "Toda a janela de atendimento está ocupada."
                : "O profissional não possui expediente neste dia."}
            </p>
          )}
        </div>

        {timeline.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/80 bg-muted/15 px-3 py-5 text-center text-[11px] text-muted-foreground">
            Nenhum compromisso. Os períodos acima estão livres para
            agendamento.
          </p>
        ) : (
          <div className="space-y-2">
            {timeline.items.map((item) =>
              item.kind === "appointment" ? (
                <AppointmentCard
                  key={`appointment-${item.appointment.id}`}
                  appointment={item.appointment}
                  timeZone={timeZone}
                  onSelect={onSelect}
                />
              ) : (
                <div
                  key={`block-${item.block.id}`}
                  className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    <Lock className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium">
                      Bloqueio ·{" "}
                      {formatTimeBR(item.block.startsAt, timeZone)} –{" "}
                      {formatTimeBR(item.block.endsAt, timeZone)}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {item.block.reason ?? "Indisponibilidade sem motivo informado."}
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AgendaBoard({
  data,
  options,
  initialCustomers,
  canManage,
  today,
  openNewOnMount = false,
}: {
  data: AgendaData;
  options: SchedulingOptions;
  initialCustomers: CustomerOption[];
  canManage: boolean;
  today: string;
  openNewOnMount?: boolean;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [newOpen, setNewOpen] = useState(openNewOnMount);
  const [newKey, setNewKey] = useState(0);
  const [selected, setSelected] = useState<AgendaAppointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AgendaAppointment | null>(
    null,
  );
  const [rescheduleTarget, setRescheduleTarget] =
    useState<AgendaAppointment | null>(null);

  const previousDate = addDaysToDateString(
    data.date,
    data.view === "week" ? -7 : -1,
  );
  const nextDate = addDaysToDateString(
    data.date,
    data.view === "week" ? 7 : 1,
  );
  const selectedWeekday = weekdayFromDateString(data.date);
  const dateDescription =
    data.view === "week"
      ? weekLabel(data)
      : `${weekdayLabel(selectedWeekday)} · ${formatDateOnlyBR(data.date)}`;

  const openNew = () => {
    setNewKey((value) => value + 1);
    setNewOpen(true);
  };

  const handleNewOpenChange = (open: boolean) => {
    setNewOpen(open);

    if (!open && openNewOnMount) {
      router.replace(
        agendaHref({
          date: data.date,
          view: data.view,
          barberId: data.barberId,
        }),
        { scroll: false },
      );
    }
  };

  const totalWeekAppointments = data.weekDays.reduce(
    (total, day) => total + day.appointments.length,
    0,
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/80 bg-card p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex w-fit items-center rounded-lg border border-border/80 bg-muted/30 p-1">
              <Link
                href={agendaHref({
                  date: data.date,
                  view: "day",
                  barberId: data.barberId,
                })}
                scroll={false}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
                  data.view === "day"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Dia
              </Link>
              <Link
                href={agendaHref({
                  date: data.date,
                  view: "week",
                  barberId: data.barberId,
                })}
                scroll={false}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
                  data.view === "week"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Semana
              </Link>
            </div>

            <div className="flex items-center gap-1">
              <Button asChild variant="outline" size="icon-sm">
                <Link
                  href={agendaHref({
                    date: previousDate,
                    view: data.view,
                    barberId: data.barberId,
                  })}
                  scroll={false}
                  aria-label="Período anterior"
                >
                  <ChevronLeft className="size-3.5" />
                </Link>
              </Button>
              <div className="min-w-36 px-2 text-center">
                <p className="text-xs font-medium">{dateDescription}</p>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  {data.view === "week" ? "Semana" : "Dia"}
                </p>
              </div>
              <Button asChild variant="outline" size="icon-sm">
                <Link
                  href={agendaHref({
                    date: nextDate,
                    view: data.view,
                    barberId: data.barberId,
                  })}
                  scroll={false}
                  aria-label="Próximo período"
                >
                  <ChevronRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={data.barberId ?? "all"}
              onValueChange={(value) => {
                startNavigation(() => {
                  router.push(
                    agendaHref({
                      date: data.date,
                      view: data.view,
                      barberId: value === "all" ? null : value,
                    }),
                    { scroll: false },
                  );
                });
              }}
              disabled={isNavigating}
            >
              <SelectTrigger
                className="h-9 w-full rounded-xl sm:w-44"
                aria-label="Filtrar por profissional"
              >
                <UsersRound className="size-3.5 text-gold" />
                <SelectValue placeholder="Todos os profissionais" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os profissionais</SelectItem>
                {options.barbers.map((barber) => (
                  <SelectItem key={barber.id} value={barber.id}>
                    {barber.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button asChild variant="outline" className="h-9">
              <Link
                href={agendaHref({
                  date: today,
                  view: data.view,
                  barberId: data.barberId,
                })}
                scroll={false}
              >
                <CalendarDays className="size-3.5" />
                Hoje
              </Link>
            </Button>

            {canManage ? (
              <Button
                type="button"
                variant="gold"
                className="h-9"
                onClick={openNew}
              >
                <Plus className="size-4" />
                Novo agendamento
              </Button>
            ) : (
              <Badge variant="outline" className="w-fit text-muted-foreground">
                Somente leitura
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3 text-gold" />
            Fuso: {data.timeZone}
          </span>
          <span className="inline-flex items-center gap-1">
            <Ban className="size-3 text-amber-600" />
            Bloqueios removem horários sem apagar registros
          </span>
          <span>
            {data.view === "week"
              ? `${totalWeekAppointments} agendamento(s) no período`
              : `${data.appointments.length} agendamento(s) no dia`}
          </span>
        </div>
      </div>

      {data.view === "day" ? (
        data.timelines.length === 0 ? (
          <DashboardEmpty
            icon={UsersRound}
            title="Nenhum profissional ativo"
            description="Ative ou cadastre profissionais para visualizar a agenda diária e os horários disponíveis."
            action={
              canManage ? (
                <Button type="button" variant="gold" onClick={openNew}>
                  <CalendarPlus className="size-4" />
                  Novo agendamento
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.timelines.map((timeline) => (
              <BarberTimeline
                key={timeline.barberId}
                timeline={timeline}
                timeZone={data.timeZone}
                onSelect={setSelected}
              />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {totalWeekAppointments === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-card/45 px-4 py-3 text-center text-[11px] text-muted-foreground">
              Nenhum agendamento nesta semana. Escolha um dia com horários
              livres para criar o primeiro.
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            {data.weekDays.map((day) => (
              <Card
                key={day.date}
                className={cn(
                  "min-w-0 overflow-hidden",
                  day.isToday && "border-gold/40 shadow-gold",
                )}
              >
                <CardHeader className="border-b border-border/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {shortWeekdayLabel(day.weekday)}
                      </p>
                      <CardTitle className="mt-0.5 text-xs">
                        {formatDateOnlyBR(day.date)}
                      </CardTitle>
                    </div>
                    {day.isToday ? (
                      <Badge
                        variant="outline"
                        className="border-gold/30 bg-gold-soft/45 text-[9px]"
                      >
                        Hoje
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        {day.appointments.length}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 p-2.5">
                  {day.appointments.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/70 px-2 py-5 text-center text-[10px] text-muted-foreground">
                      Sem agendamentos
                    </p>
                  ) : (
                    day.appointments.map((appointment) => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        timeZone={data.timeZone}
                        onSelect={setSelected}
                        compact
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            A visão semanal carrega apenas os sete dias exibidos, já filtrados
            pela barbearia ativa e pelo profissional selecionado.
          </p>
        </div>
      )}

      <NewAppointmentDialog
        key={`new-appointment-${newKey}`}
        open={newOpen}
        onOpenChange={handleNewOpenChange}
        options={options}
        initialCustomers={initialCustomers}
        defaultDate={data.date}
        today={today}
        timeZone={data.timeZone}
      />

      <AppointmentDetailsDialog
        appointment={selected}
        timeZone={data.timeZone}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        onCancelRequest={(appointment) => {
          setSelected(null);
          setCancelTarget(appointment);
        }}
        onRescheduleRequest={(appointment) => {
          setSelected(null);
          setRescheduleTarget(appointment);
        }}
      />

      <CancelAppointmentDialog
        key={`cancel-${cancelTarget?.id ?? "none"}`}
        appointment={cancelTarget}
        timeZone={data.timeZone}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
          }
        }}
      />

      <RescheduleAppointmentDialog
        key={`reschedule-${rescheduleTarget?.id ?? "none"}`}
        appointment={rescheduleTarget}
        timeZone={data.timeZone}
        today={today}
        onOpenChange={(open) => {
          if (!open) {
            setRescheduleTarget(null);
          }
        }}
      />
    </div>
  );
}
