import type { Database } from "@/types/database";

export type AppointmentStatus =
  Database["public"]["Enums"]["appointment_status"];

export const activeAppointmentStatuses: AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "in_progress",
];

export type AppointmentAction =
  | "confirm"
  | "start"
  | "complete"
  | "no_show"
  | "cancel";

export type AppointmentTransition = {
  from: AppointmentStatus[];
  to: AppointmentStatus;
  label: string;
  successMessage: string;
};

export const appointmentTransitions: Record<
  AppointmentAction,
  AppointmentTransition
> = {
  confirm: {
    from: ["scheduled"],
    to: "confirmed",
    label: "Confirmar",
    successMessage: "Agendamento confirmado.",
  },
  start: {
    from: ["scheduled", "confirmed"],
    to: "in_progress",
    label: "Iniciar atendimento",
    successMessage: "Atendimento iniciado.",
  },
  complete: {
    from: ["scheduled", "confirmed", "in_progress"],
    to: "completed",
    label: "Concluir",
    successMessage: "Atendimento concluído.",
  },
  no_show: {
    from: ["scheduled", "confirmed"],
    to: "no_show",
    label: "Registrar ausência",
    successMessage: "Ausência registrada.",
  },
  cancel: {
    from: ["scheduled", "confirmed"],
    to: "cancelled",
    label: "Cancelar",
    successMessage: "Agendamento cancelado e horário liberado.",
  },
};

export function allowedAppointmentActions(
  status: AppointmentStatus,
): AppointmentAction[] {
  return (Object.keys(appointmentTransitions) as AppointmentAction[]).filter(
    (action) => appointmentTransitions[action].from.includes(status),
  );
}

export function canRescheduleAppointment(status: AppointmentStatus): boolean {
  return status === "scheduled" || status === "confirmed";
}

export type AgendaRange = {
  start: string;
  end: string;
};

export type AgendaAppointment = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  barberId: string;
  barberName: string;
  serviceId: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  priceCents: number;
  durationMinutes: number | null;
  notes: string | null;
  cancelReason: string | null;
};

export type AgendaBlock = {
  id: string;
  barberId: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export type AgendaTimelineItem =
  | { kind: "appointment"; appointment: AgendaAppointment }
  | { kind: "block"; block: AgendaBlock };

export type AgendaTimeline = {
  barberId: string;
  barberName: string;
  openRanges: AgendaRange[];
  freeRanges: AgendaRange[];
  items: AgendaTimelineItem[];
};

export type AgendaWeekDay = {
  date: string;
  weekday: number;
  isToday: boolean;
  appointments: AgendaAppointment[];
};

export type AgendaView = "day" | "week";

export type AgendaData = {
  date: string;
  view: AgendaView;
  barberId: string | null;
  timeZone: string;
  appointments: AgendaAppointment[];
  timelines: AgendaTimeline[];
  weekDays: AgendaWeekDay[];
};

export type SchedulingBarberOption = {
  id: string;
  name: string;
};

export type SchedulingServiceOption = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
};

export type SchedulingAssignment = {
  barberId: string;
  serviceId: string;
};

export type SchedulingOptions = {
  services: SchedulingServiceOption[];
  barbers: SchedulingBarberOption[];
  assignments: SchedulingAssignment[];
};

export type CustomerOption = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
};

export type AvailableSlot = {
  time: string;
  startsAt: string;
  endsAt: string;
};

export type AvailabilitySnapshot = {
  date: string;
  timeZone: string;
  serviceId: string;
  serviceName: string;
  barberId: string;
  barberName: string;
  durationMinutes: number;
  priceCents: number;
  slots: AvailableSlot[];
  reason: string | null;
};

export type AvailabilityActionResult =
  | { status: "success"; availability: AvailabilitySnapshot }
  | { status: "error"; message: string };

export type CustomerSearchResult =
  | { status: "success"; customers: CustomerOption[] }
  | { status: "error"; message: string };
