"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Lock, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { AppointmentStatusBadge, appointmentLabels } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppointmentDetailsDialog } from "@/features/scheduling/components/appointment-details-dialog";
import { CancelAppointmentDialog } from "@/features/scheduling/components/cancel-appointment-dialog";
import { NewAppointmentDialog } from "@/features/scheduling/components/new-appointment-dialog";
import { RescheduleAppointmentDialog } from "@/features/scheduling/components/reschedule-appointment-dialog";
import type {
  AgendaAppointment, AgendaData, AgendaTimeline, AgendaView, CustomerOption, SchedulingOptions,
} from "@/features/scheduling/types";
import {
  addDaysToDateString, formatDateOnlyBR, formatTimeBR, initialsFromName,
  shortWeekdayLabel, weekdayFromDateString, weekdayLabel,
} from "@/lib/format";

function agendaHref(date: string, view: AgendaView, barberId: string | null) {
  const params = new URLSearchParams({ date });
  if (view === "week") params.set("view", "week");
  if (barberId) params.set("barber", barberId);
  return "/dashboard/agenda?" + params.toString();
}

function weekLabel(data: AgendaData) {
  const first = data.weekDays[0];
  const last = data.weekDays.at(-1);
  return first && last
    ? formatDateOnlyBR(first.date) + " – " + formatDateOnlyBR(last.date)
    : formatDateOnlyBR(data.date);
}

type SelectAppointment = (appointment: AgendaAppointment, trigger: HTMLButtonElement) => void;

function AppointmentRow({
  appointment,
  timeZone,
  onSelect,
  showBarber = false,
}: {
  appointment: AgendaAppointment;
  timeZone: string;
  onSelect: SelectAppointment;
  showBarber?: boolean;
}) {
  const start = formatTimeBR(appointment.startsAt, timeZone);
  const end = formatTimeBR(appointment.endsAt, timeZone);

  return (
    <button
      type="button"
      className="j2-agenda-row"
      aria-haspopup="dialog"
      aria-label={[appointment.customerName, appointment.serviceName, appointment.barberName, start, appointmentLabels[appointment.status]].join(", ")}
      onClick={event => onSelect(appointment, event.currentTarget)}
    >
      <span className="j2-list-time">
        <time dateTime={appointment.startsAt}>{start}</time>
        <span>{end}</span>
      </span>
      <span className="j2-agenda-row-copy">
        <strong>{appointment.customerName}</strong>
        <span>{appointment.serviceName}{appointment.durationMinutes ? " · " + appointment.durationMinutes + " min" : ""}</span>
        {showBarber && <span>{appointment.barberName}</span>}
        <AppointmentStatusBadge status={appointment.status} />
      </span>
      <ChevronRight size={16} className="j2-agenda-row-arrow" aria-hidden />
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
  onSelect: SelectAppointment;
}) {
  const appointments = timeline.items.filter(item => item.kind === "appointment").length;
  const blocks = timeline.items.length - appointments;

  return (
    <section className="j2-operation-panel j2-agenda-timeline" aria-label={"Agenda de " + timeline.barberName}>
      <header>
        <span className="j2-agenda-initials" aria-hidden>{initialsFromName(timeline.barberName)}</span>
        <div>
          <h2>{timeline.barberName}</h2>
          <p>{appointments} compromisso(s) · {blocks} bloqueio(s)</p>
        </div>
      </header>
      <div className="j2-agenda-availability">
        <strong>Horários disponíveis</strong>
        {timeline.freeRanges.length ? (
          <ul aria-label={"Faixas livres de " + timeline.barberName}>
            {timeline.freeRanges.map(range => <li key={range.start + "-" + range.end}>{range.start}–{range.end}</li>)}
          </ul>
        ) : (
          <p>{timeline.openRanges.length ? "Sem horários livres neste dia." : "Sem expediente neste dia."}</p>
        )}
      </div>
      {timeline.items.length ? (
        <ul className="j2-agenda-entries">
          {timeline.items.map(item => item.kind === "appointment" ? (
            <li key={"appointment-" + item.appointment.id}>
              <AppointmentRow appointment={item.appointment} timeZone={timeZone} onSelect={onSelect} />
            </li>
          ) : (
            <li className="j2-agenda-block" key={"block-" + item.block.id}>
              <span className="j2-list-time">
                <time dateTime={item.block.startsAt}>{formatTimeBR(item.block.startsAt, timeZone)}</time>
                <span>{formatTimeBR(item.block.endsAt, timeZone)}</span>
              </span>
              <div>
                <strong><Lock size={15} aria-hidden /> Bloqueio</strong>
                <p>{item.block.reason ?? "Indisponibilidade sem motivo informado."}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="j2-operation-empty">Nenhum compromisso neste dia.</p>}
    </section>
  );
}

export function AgendaBoard({
  data,
  options,
  initialCustomers,
  canManage,
  canCreateAppointments,
  today,
  openNewOnMount = false,
}: {
  data: AgendaData;
  options: SchedulingOptions;
  initialCustomers: CustomerOption[];
  canManage: boolean;
  canCreateAppointments: boolean;
  today: string;
  openNewOnMount?: boolean;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [newOpen, setNewOpen] = useState(openNewOnMount);
  const [newKey, setNewKey] = useState(0);
  const query = useSearchParams();
  const bookingId = query.get("atendimento");
  const [selectedRow, setSelected] = useState<AgendaAppointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AgendaAppointment | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<AgendaAppointment | null>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const newButton = useRef<HTMLButtonElement | null>(null);
  const periodLink = useRef<HTMLAnchorElement | null>(null);
  const selected = selectedRow ?? data.appointments.find(appointment => appointment.id === bookingId) ?? null;
  const weekly = data.view === "week";
  const period = weekly ? 7 : 1;
  const previousDate = addDaysToDateString(data.date, -period);
  const nextDate = addDaysToDateString(data.date, period);
  const dateDescription = weekly ? weekLabel(data) : weekdayLabel(weekdayFromDateString(data.date)) + " · " + formatDateOnlyBR(data.date);
  const hrefFor = (date: string, view = data.view) => agendaHref(date, view, data.barberId);

  function restoreFocus(trigger?: HTMLButtonElement | null) {
    requestAnimationFrame(() => {
      if (trigger?.isConnected && !trigger.disabled) trigger.focus();
      else periodLink.current?.focus();
    });
  }

  const selectAppointment: SelectAppointment = (appointment, trigger) => {
    lastTrigger.current = trigger;
    setSelected(appointment);
  };

  function closeDetails() {
    setSelected(null);
    if (bookingId) {
      const url = new URL(window.location.href);
      url.searchParams.delete("atendimento");
      window.history.replaceState(null, "", url);
    }
  }

  function openNew() {
    if (!canCreateAppointments) return;
    setNewKey(value => value + 1);
    setNewOpen(true);
  }

  function handleNewOpenChange(open: boolean) {
    setNewOpen(open && canCreateAppointments);
    if (!open) {
      restoreFocus(newButton.current);
      if (openNewOnMount) router.replace(hrefFor(data.date), { scroll: false });
    }
  }

  return (
    <div className="j2-agenda">
      <div className="j2-agenda-toolbar">
        <div className="j2-agenda-controls">
          <nav className="j2-agenda-view" aria-label="Modo de exibição da agenda">
            <Link ref={periodLink} href={hrefFor(data.date, "day")} scroll={false} aria-current={!weekly ? "page" : undefined}>Dia</Link>
            <Link href={hrefFor(data.date, "week")} scroll={false} aria-current={weekly ? "page" : undefined}>Semana</Link>
          </nav>
          <nav className="j2-agenda-period" aria-label="Navegação do período">
            <Link href={hrefFor(previousDate)} scroll={false} aria-label="Período anterior"><ChevronLeft size={19} aria-hidden /></Link>
            <strong>{dateDescription}</strong>
            <Link href={hrefFor(nextDate)} scroll={false} aria-label="Próximo período"><ChevronRight size={19} aria-hidden /></Link>
          </nav>
        </div>
        <div className="j2-agenda-filters">
          <Select
            value={data.barberId ?? "all"}
            onValueChange={value => startNavigation(() => {
              router.push(agendaHref(data.date, data.view, value === "all" ? null : value), { scroll: false });
            })}
            disabled={isNavigating}
          >
            <SelectTrigger className="j2-agenda-professional" aria-label="Filtrar por profissional">
              <UsersRound size={16} aria-hidden /><SelectValue placeholder="Todos os profissionais" />
            </SelectTrigger>
            <SelectContent className="j2-panel-menu">
              <SelectItem value="all">Todos os profissionais</SelectItem>
              {options.barbers.map(barber => <SelectItem key={barber.id} value={barber.id}>{barber.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" className="j2-operation-secondary">
            <Link href={hrefFor(today)} scroll={false}><CalendarDays aria-hidden /> Hoje</Link>
          </Button>
          {canManage ? (
            <Button ref={newButton} type="button" variant="gold" className="j2-operation-primary" onClick={openNew} disabled={!canCreateAppointments}>
              <Plus aria-hidden /> Agendar cliente presencial
            </Button>
          ) : <p className="j2-agenda-readonly">Somente leitura</p>}
          <span role="status" className="sr-only">{isNavigating ? "Atualizando agenda..." : ""}</span>
        </div>
        <div className="j2-agenda-toolbar-footer">
          <span>Fuso: {data.timeZone}</span>
          <Link href="/dashboard/horarios" className="j2-operation-link">Expediente e bloqueios</Link>
        </div>
      </div>

      {!weekly ? (
        data.timelines.length ? (
          <div className="j2-agenda-day">
            {data.timelines.map(timeline => (
              <BarberTimeline key={timeline.barberId} timeline={timeline} timeZone={data.timeZone} onSelect={selectAppointment} />
            ))}
          </div>
        ) : (
          <div className="j2-operation-panel j2-operation-empty">
            <strong>Nenhum profissional ativo</strong>
            <p>Cadastre ou ative um profissional para consultar o expediente.</p>
            <Link href="/dashboard/equipe" className="j2-operation-link">Abrir equipe</Link>
          </div>
        )
      ) : (
        <div className="j2-agenda-week">
          {data.weekDays.map(day => (
            <section key={day.date} className="j2-operation-panel j2-week-day" data-today={day.isToday ? "" : undefined}>
              <header>
                <div>
                  <p>{shortWeekdayLabel(day.weekday)}</p>
                  <h2><Link href={hrefFor(day.date, "day")} scroll={false}>{formatDateOnlyBR(day.date)}</Link></h2>
                </div>
                {day.isToday && <span>Hoje</span>}
              </header>
              {day.appointments.length ? (
                <ul className="j2-agenda-entries">
                  {day.appointments.map(appointment => (
                    <li key={appointment.id}>
                      <AppointmentRow appointment={appointment} timeZone={data.timeZone} onSelect={selectAppointment} showBarber />
                    </li>
                  ))}
                </ul>
              ) : <p className="j2-operation-empty">Sem agendamentos</p>}
            </section>
          ))}
        </div>
      )}

      <NewAppointmentDialog
        key={"new-appointment-" + newKey}
        open={newOpen && canCreateAppointments}
        onOpenChange={handleNewOpenChange}
        options={options}
        initialCustomers={initialCustomers}
        defaultDate={data.date}
        today={today}
        timeZone={data.timeZone}
      />
      <AppointmentDetailsDialog
        key={selected?.id ?? "closed"}
        appointment={selected}
        timeZone={data.timeZone}
        canCreateAppointments={canCreateAppointments}
        onOpenChange={open => {
          if (!open) {
            closeDetails();
            restoreFocus(lastTrigger.current);
          }
        }}
        onCancelRequest={appointment => {
          closeDetails();
          setCancelTarget(appointment);
        }}
        onRescheduleRequest={appointment => {
          closeDetails();
          setRescheduleTarget(appointment);
        }}
      />
      <CancelAppointmentDialog
        key={"cancel-" + (cancelTarget?.id ?? "none")}
        appointment={cancelTarget}
        timeZone={data.timeZone}
        onOpenChange={open => {
          if (!open) {
            setCancelTarget(null);
            restoreFocus(lastTrigger.current);
          }
        }}
      />
      <RescheduleAppointmentDialog
        key={"reschedule-" + (rescheduleTarget?.id ?? "none")}
        appointment={rescheduleTarget}
        timeZone={data.timeZone}
        today={today}
        onOpenChange={open => {
          if (!open) {
            setRescheduleTarget(null);
            restoreFocus(lastTrigger.current);
          }
        }}
      />
    </div>
  );
}
