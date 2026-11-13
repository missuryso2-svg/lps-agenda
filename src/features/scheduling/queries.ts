import "server-only";

import {
  activeAppointmentStatuses,
  type AgendaAppointment,
  type AgendaBlock,
  type AgendaData,
  type AgendaTimeline,
  type AgendaTimelineItem,
  type AgendaView,
  type AgendaWeekDay,
  type AvailabilitySnapshot,
  type CustomerOption,
  type SchedulingOptions,
} from "@/features/scheduling/types";
import {
  computeAvailableSlots,
  instantRangeToLocalMinutes,
  intersectRanges,
  localRangesToLabels,
  subtractRanges,
  type TimeRange,
} from "@/features/scheduling/availability";
import {
  addDaysToDateString,
  getDateRange,
  localDateString,
  localDateTimeToUtc,
  todayInTimeZone,
  weekdayFromDateString,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { timeToMinutes } from "@/lib/validation/schedule";
import type { Database } from "@/types/database";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];

function rangesFromBusinessHours(
  rows: Array<{
    weekday: number;
    opens_at: string;
    closes_at: string;
    is_active: boolean;
  }>,
  weekday: number,
): TimeRange[] {
  return rows
    .filter((row) => row.weekday === weekday && row.is_active)
    .map((row) => ({
      start: timeToMinutes(row.opens_at),
      end: timeToMinutes(row.closes_at),
    }));
}

function rangesFromWorkingHours(
  rows: Array<{
    barber_id: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
    is_active: boolean;
  }>,
  barberId: string,
  weekday: number,
): TimeRange[] {
  return rows
    .filter(
      (row) =>
        row.barber_id === barberId &&
        row.weekday === weekday &&
        row.is_active,
    )
    .map((row) => ({
      start: timeToMinutes(row.starts_at),
      end: timeToMinutes(row.ends_at),
    }));
}

function sanitizeSearch(value: string): string {
  return value
    .replace(/[%,()\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function weekStartDate(date: string): string {
  const weekday = weekdayFromDateString(date);

  if (Number.isNaN(weekday)) {
    throw new Error("Data inválida.");
  }

  const daysSinceMonday = (weekday + 6) % 7;

  return addDaysToDateString(date, -daysSinceMonday);
}

async function resolveAppointments(
  supabase: Supabase,
  rows: AppointmentRow[],
): Promise<AgendaAppointment[]> {
  if (rows.length === 0) {
    return [];
  }

  const customerIds = [...new Set(rows.map((row) => row.customer_id))];
  const barberIds = [...new Set(rows.map((row) => row.barber_id))];
  const serviceIds = [...new Set(rows.map((row) => row.service_id))];

  const [customersResult, barbersResult, servicesResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, full_name, phone")
      .in("id", customerIds),
    supabase.from("barbers").select("id, name").in("id", barberIds),
    supabase
      .from("services")
      .select("id, name, duration_minutes")
      .in("id", serviceIds),
  ]);

  const customers = new Map(
    (customersResult.data ?? []).map((item) => [
      item.id,
      { name: item.full_name, phone: item.phone },
    ]),
  );
  const barbers = new Map(
    (barbersResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const services = new Map(
    (servicesResult.data ?? []).map((item) => [
      item.id,
      { name: item.name, durationMinutes: item.duration_minutes },
    ]),
  );

  return rows.map((row) => {
    const customer = customers.get(row.customer_id);
    const service = services.get(row.service_id);
    const storedMinutes = Math.round(
      (new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) /
        60_000,
    );

    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: customer?.name ?? "Cliente",
      customerPhone: customer?.phone ?? null,
      barberId: row.barber_id,
      barberName: barbers.get(row.barber_id) ?? "Profissional",
      serviceId: row.service_id,
      serviceName: service?.name ?? "Serviço",
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      priceCents: row.price_cents,
      durationMinutes:
        Number.isFinite(storedMinutes) && storedMinutes > 0
          ? storedMinutes
          : (service?.durationMinutes ?? null),
      notes: row.notes,
      cancelReason: row.cancel_reason,
    };
  });
}

export async function getSchedulingOptions(
  barbershopId: string,
): Promise<SchedulingOptions> {
  const supabase = await createClient();

  const [servicesResult, barbersResult, assignmentsResult] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, duration_minutes, price_cents")
      .eq("barbershop_id", barbershopId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("barbers")
      .select("id, name")
      .eq("barbershop_id", barbershopId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("barber_services")
      .select("barber_id, service_id")
      .eq("barbershop_id", barbershopId),
  ]);

  return {
    services: (servicesResult.data ?? []).map((service) => ({
      id: service.id,
      name: service.name,
      durationMinutes: service.duration_minutes,
      priceCents: service.price_cents,
    })),
    barbers: (barbersResult.data ?? []).map((barber) => ({
      id: barber.id,
      name: barber.name,
    })),
    assignments: (assignmentsResult.data ?? []).map((assignment) => ({
      barberId: assignment.barber_id,
      serviceId: assignment.service_id,
    })),
  };
}

export async function getInitialCustomerOptions(
  barbershopId: string,
): Promise<CustomerOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, email")
    .eq("barbershop_id", barbershopId)
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(12);

  if (error || !data) {
    return [];
  }

  return data.map((customer) => ({
    id: customer.id,
    fullName: customer.full_name,
    phone: customer.phone,
    email: customer.email,
  }));
}

export async function searchCustomerOptions(
  barbershopId: string,
  search: string,
): Promise<CustomerOption[]> {
  const supabase = await createClient();
  const term = sanitizeSearch(search);
  let query = supabase
    .from("customers")
    .select("id, full_name, phone, email")
    .eq("barbershop_id", barbershopId)
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(20);

  if (term) {
    const conditions = [
      `full_name.ilike.%${term}%`,
      `email.ilike.%${term}%`,
    ];
    const digits = term.replace(/\D/g, "");

    if (digits.length >= 3) {
      conditions.push(`phone.ilike.%${digits}%`);
    }

    query = query.or(conditions.join(","));
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map((customer) => ({
    id: customer.id,
    fullName: customer.full_name,
    phone: customer.phone,
    email: customer.email,
  }));
}

export async function getAgendaPageData({
  barbershopId,
  timeZone,
  date,
  view,
  barberId,
}: {
  barbershopId: string;
  timeZone: string;
  date: string;
  view: AgendaView;
  barberId: string | null;
}): Promise<AgendaData> {
  const supabase = await createClient();
  const barbersResult = await supabase
    .from("barbers")
    .select("id, name")
    .eq("barbershop_id", barbershopId)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (barbersResult.error) {
    throw new Error("Não foi possível consultar os profissionais.");
  }

  const barbers = barbersResult.data ?? [];
  const selectedBarberId = barbers.some((barber) => barber.id === barberId)
    ? barberId
    : null;
  const rangeStartDate = view === "week" ? weekStartDate(date) : date;
  const rangeEndDate = addDaysToDateString(
    rangeStartDate,
    view === "week" ? 7 : 1,
  );
  const rangeStart = localDateTimeToUtc(rangeStartDate, "00:00", timeZone);
  const rangeEnd = localDateTimeToUtc(rangeEndDate, "00:00", timeZone);

  let appointmentsQuery = supabase
    .from("appointments")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .lt("starts_at", rangeEnd.toISOString())
    .gt("ends_at", rangeStart.toISOString());

  if (selectedBarberId) {
    appointmentsQuery = appointmentsQuery.eq("barber_id", selectedBarberId);
  }

  const appointmentsResult = await appointmentsQuery.order("starts_at", {
    ascending: true,
  });

  if (appointmentsResult.error) {
    throw new Error("Não foi possível consultar a agenda.");
  }

  const appointments = await resolveAppointments(
    supabase,
    appointmentsResult.data ?? [],
  );
  const today = todayInTimeZone(timeZone);
  const weekDays: AgendaWeekDay[] =
    view === "week"
      ? Array.from({ length: 7 }, (_, index) => {
          const day = addDaysToDateString(rangeStartDate, index);
          const weekday = weekdayFromDateString(day);

          return {
            date: day,
            weekday,
            isToday: day === today,
            appointments: appointments.filter(
              (appointment) =>
                localDateString(appointment.startsAt, timeZone) === day,
            ),
          };
        })
      : [];

  let timelines: AgendaTimeline[] = [];

  if (view === "day") {
    const weekday = weekdayFromDateString(date);
    const [businessHoursResult, workingHoursResult, blocksResult] =
      await Promise.all([
        supabase
          .from("business_hours")
          .select("weekday, opens_at, closes_at, is_active")
          .eq("barbershop_id", barbershopId)
          .eq("weekday", weekday),
        supabase
          .from("barber_working_hours")
          .select("barber_id, weekday, starts_at, ends_at, is_active")
          .eq("barbershop_id", barbershopId)
          .eq("weekday", weekday),
        supabase
          .from("blocked_slots")
          .select("id, barber_id, starts_at, ends_at, reason")
          .eq("barbershop_id", barbershopId)
          .lt("starts_at", rangeEnd.toISOString())
          .gt("ends_at", rangeStart.toISOString())
          .order("starts_at", { ascending: true }),
      ]);

    if (
      businessHoursResult.error ||
      workingHoursResult.error ||
      blocksResult.error
    ) {
      throw new Error("Não foi possível consultar a disponibilidade da agenda.");
    }

    const businessRanges = rangesFromBusinessHours(
      businessHoursResult.data ?? [],
      weekday,
    );
    const blocks: AgendaBlock[] = (blocksResult.data ?? []).map((block) => ({
      id: block.id,
      barberId: block.barber_id,
      startsAt: block.starts_at,
      endsAt: block.ends_at,
      reason: block.reason,
    }));
    const visibleBarbers = selectedBarberId
      ? barbers.filter((barber) => barber.id === selectedBarberId)
      : barbers;

    timelines = visibleBarbers.map((barber) => {
      const workingRanges = rangesFromWorkingHours(
        workingHoursResult.data ?? [],
        barber.id,
        weekday,
      );
      const openRanges = intersectRanges(businessRanges, workingRanges);
      const barberAppointments = appointments.filter(
        (appointment) => appointment.barberId === barber.id,
      );
      const barberBlocks = blocks.filter(
        (block) => block.barberId === null || block.barberId === barber.id,
      );
      const busyLocalRanges = [
        ...barberAppointments
          .filter((appointment) =>
            activeAppointmentStatuses.includes(appointment.status),
          )
          .map((appointment) =>
            instantRangeToLocalMinutes(
              { start: appointment.startsAt, end: appointment.endsAt },
              date,
              timeZone,
            ),
          ),
        ...barberBlocks.map((block) =>
          instantRangeToLocalMinutes(
            { start: block.startsAt, end: block.endsAt },
            date,
            timeZone,
          ),
        ),
      ].filter((range): range is TimeRange => range !== null);

      const items: AgendaTimelineItem[] = [
        ...barberAppointments.map((appointment) => ({
          kind: "appointment" as const,
          appointment,
        })),
        ...barberBlocks.map((block) => ({ kind: "block" as const, block })),
      ].sort(
        (left, right) =>
          new Date(
            left.kind === "appointment"
              ? left.appointment.startsAt
              : left.block.startsAt,
          ).getTime() -
          new Date(
            right.kind === "appointment"
              ? right.appointment.startsAt
              : right.block.startsAt,
          ).getTime(),
      );

      return {
        barberId: barber.id,
        barberName: barber.name,
        openRanges: localRangesToLabels(openRanges),
        freeRanges: localRangesToLabels(
          subtractRanges(openRanges, busyLocalRanges),
        ),
        items,
      };
    });
  }

  return {
    date,
    view,
    barberId: selectedBarberId,
    timeZone,
    appointments,
    timelines,
    weekDays,
  };
}

type AvailabilityResult =
  | { ok: true; data: AvailabilitySnapshot }
  | { ok: false; message: string };

/**
 * Carrega e valida tudo o que o motor de disponibilidade precisa. É usada
 * tanto pela consulta de horários quanto pela gravação, sempre com o
 * barbershop_id da sessão e sem confiar em preços/durações do navegador.
 */
export async function loadAvailability({
  supabase,
  barbershopId,
  timeZone,
  serviceId,
  barberId,
  date,
  excludeAppointmentId,
  now = new Date(),
}: {
  supabase: Supabase;
  barbershopId: string;
  timeZone: string;
  serviceId: string;
  barberId: string;
  date: string;
  excludeAppointmentId?: string;
  now?: Date;
}): Promise<AvailabilityResult> {
  const weekday = weekdayFromDateString(date);

  if (Number.isNaN(weekday)) {
    return { ok: false, message: "Informe uma data válida." };
  }

  const [serviceResult, barberResult, linkResult] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, duration_minutes, price_cents, is_active")
      .eq("id", serviceId)
      .eq("barbershop_id", barbershopId)
      .maybeSingle(),
    supabase
      .from("barbers")
      .select("id, name, is_active")
      .eq("id", barberId)
      .eq("barbershop_id", barbershopId)
      .maybeSingle(),
    supabase
      .from("barber_services")
      .select("barber_id, service_id")
      .eq("barbershop_id", barbershopId)
      .eq("barber_id", barberId)
      .eq("service_id", serviceId)
      .maybeSingle(),
  ]);

  if (serviceResult.error || barberResult.error || linkResult.error) {
    return {
      ok: false,
      message: "Não foi possível consultar a disponibilidade agora.",
    };
  }

  if (!serviceResult.data) {
    return { ok: false, message: "Serviço não encontrado nesta barbearia." };
  }

  if (!serviceResult.data.is_active) {
    return { ok: false, message: "Este serviço está inativo." };
  }

  if (!barberResult.data) {
    return { ok: false, message: "Profissional não encontrado nesta barbearia." };
  }

  if (!barberResult.data.is_active) {
    return { ok: false, message: "Este profissional está inativo." };
  }

  if (!linkResult.data) {
    return {
      ok: false,
      message: "Este profissional não realiza o serviço selecionado.",
    };
  }

  const day = getDateRange(date, timeZone);
  const dayStart = day.start.toISOString();
  const dayEnd = day.end.toISOString();

  const [
    businessHoursResult,
    workingHoursResult,
    blocksResult,
    appointmentsResult,
  ] = await Promise.all([
    supabase
      .from("business_hours")
      .select("weekday, opens_at, closes_at, is_active")
      .eq("barbershop_id", barbershopId)
      .eq("weekday", weekday),
    supabase
      .from("barber_working_hours")
      .select("barber_id, weekday, starts_at, ends_at, is_active")
      .eq("barbershop_id", barbershopId)
      .eq("barber_id", barberId)
      .eq("weekday", weekday),
    supabase
      .from("blocked_slots")
      .select("id, barber_id, starts_at, ends_at")
      .eq("barbershop_id", barbershopId)
      .lt("starts_at", dayEnd)
      .gt("ends_at", dayStart),
    supabase
      .from("appointments")
      .select("id, starts_at, ends_at, status")
      .eq("barbershop_id", barbershopId)
      .eq("barber_id", barberId)
      .in("status", activeAppointmentStatuses)
      .lt("starts_at", dayEnd)
      .gt("ends_at", dayStart),
  ]);

  if (
    businessHoursResult.error ||
    workingHoursResult.error ||
    blocksResult.error ||
    appointmentsResult.error
  ) {
    return {
      ok: false,
      message: "Não foi possível consultar a disponibilidade agora.",
    };
  }

  const businessRanges = rangesFromBusinessHours(
    businessHoursResult.data ?? [],
    weekday,
  );
  const workingRanges = rangesFromWorkingHours(
    workingHoursResult.data ?? [],
    barberId,
    weekday,
  );
  const busy = [
    ...(blocksResult.data ?? [])
      .filter(
        (block) => block.barber_id === null || block.barber_id === barberId,
      )
      .map((block) => ({ start: block.starts_at, end: block.ends_at })),
    ...(appointmentsResult.data ?? [])
      .filter((appointment) => appointment.id !== excludeAppointmentId)
      .map((appointment) => ({
        start: appointment.starts_at,
        end: appointment.ends_at,
      })),
  ];
  const slots = computeAvailableSlots({
    date,
    timeZone,
    durationMinutes: serviceResult.data.duration_minutes,
    businessRanges,
    workingRanges,
    busy,
    now,
  });

  let reason: string | null = null;

  if (day.end.getTime() <= now.getTime()) {
    reason = "Esta data já passou. Escolha uma data futura.";
  } else if (businessRanges.length === 0) {
    reason = "A barbearia não funciona neste dia.";
  } else if (workingRanges.length === 0) {
    reason = "O profissional não trabalha neste dia.";
  } else if (intersectRanges(businessRanges, workingRanges).length === 0) {
    reason =
      "A jornada do profissional não coincide com o funcionamento da barbearia neste dia.";
  } else if (slots.length === 0) {
    const longestOpenRange = intersectRanges(
      businessRanges,
      workingRanges,
    ).reduce(
      (longest, range) => Math.max(longest, range.end - range.start),
      0,
    );

    reason =
      longestOpenRange < serviceResult.data.duration_minutes
        ? "Não há uma janela contínua suficiente para a duração deste serviço."
        : "Não há horários livres neste dia para o profissional selecionado.";
  }

  return {
    ok: true,
    data: {
      date,
      timeZone,
      serviceId,
      serviceName: serviceResult.data.name,
      barberId,
      barberName: barberResult.data.name,
      durationMinutes: serviceResult.data.duration_minutes,
      priceCents: serviceResult.data.price_cents,
      slots,
      reason,
    },
  };
}
