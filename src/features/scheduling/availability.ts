import type { AvailableSlot } from "@/features/scheduling/types";
import {
  addDaysToDateString,
  getDateRange,
  localDateTimeToUtc,
  localTimeString,
} from "@/lib/format";
import { timeToMinutes } from "@/lib/validation/schedule";

/**
 * Intervalo em minutos desde a meia-noite local da barbearia.
 * O fim pode ser 1440 para representar o fim do dia civil.
 */
export type TimeRange = {
  start: number;
  end: number;
};

export type InstantRange = {
  start: string | Date;
  end: string | Date;
};

export const DEFAULT_SLOT_STEP_MINUTES = 15;

export function minutesToTime(minutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Math.round(minutes)));

  if (safe === 24 * 60) {
    return "24:00";
  }

  const hour = Math.floor(safe / 60);
  const minute = safe % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function normalizeRanges(ranges: TimeRange[]): TimeRange[] {
  return ranges
    .filter(
      (range) =>
        Number.isFinite(range.start) &&
        Number.isFinite(range.end) &&
        range.start >= 0 &&
        range.end <= 24 * 60 &&
        range.end > range.start,
    )
    .sort((left, right) => left.start - right.start);
}

/**
 * Une faixas sobrepostas ou contíguas para evitar horários duplicados.
 */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const normalized = normalizeRanges(ranges);
  const merged: TimeRange[] = [];

  for (const range of normalized) {
    const last = merged.at(-1);

    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

/**
 * Interseção entre funcionamento da barbearia e jornada do profissional.
 */
export function intersectRanges(
  left: TimeRange[],
  right: TimeRange[],
): TimeRange[] {
  const first = mergeRanges(left);
  const second = mergeRanges(right);
  const intersections: TimeRange[] = [];

  for (const a of first) {
    for (const b of second) {
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);

      if (end > start) {
        intersections.push({ start, end });
      }
    }
  }

  return mergeRanges(intersections);
}

/**
 * Remove dos períodos abertos os intervalos ocupados.
 */
export function subtractRanges(
  openRanges: TimeRange[],
  busyRanges: TimeRange[],
): TimeRange[] {
  const open = mergeRanges(openRanges);
  const busy = mergeRanges(busyRanges);
  const free: TimeRange[] = [];

  for (const range of open) {
    let cursor = range.start;

    for (const occupied of busy) {
      if (occupied.end <= cursor) {
        continue;
      }

      if (occupied.start >= range.end) {
        break;
      }

      if (occupied.start > cursor) {
        free.push({ start: cursor, end: Math.min(occupied.start, range.end) });
      }

      cursor = Math.max(cursor, occupied.end);

      if (cursor >= range.end) {
        break;
      }
    }

    if (cursor < range.end) {
      free.push({ start: cursor, end: range.end });
    }
  }

  return free;
}

/**
 * Converte um intervalo de instantes para minutos locais dentro de uma data
 * civil. Intervalos que atravessam a meia-noite são recortados no dia.
 */
export function instantRangeToLocalMinutes(
  range: InstantRange,
  date: string,
  timeZone: string,
): TimeRange | null {
  const day = getDateRange(date, timeZone);
  const start = new Date(range.start);
  const end = new Date(range.end);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const clampedStart = new Date(
    Math.max(start.getTime(), day.start.getTime()),
  );
  const clampedEnd = new Date(Math.min(end.getTime(), day.end.getTime()));

  if (clampedEnd.getTime() <= clampedStart.getTime()) {
    return null;
  }

  const startMinutes =
    clampedStart.getTime() === day.start.getTime()
      ? 0
      : timeToMinutes(localTimeString(clampedStart, timeZone));
  const endMinutes =
    clampedEnd.getTime() === day.end.getTime()
      ? 24 * 60
      : timeToMinutes(localTimeString(clampedEnd, timeZone));

  if (
    Number.isNaN(startMinutes) ||
    Number.isNaN(endMinutes) ||
    endMinutes <= startMinutes
  ) {
    return null;
  }

  return { start: startMinutes, end: endMinutes };
}

function rangeEndInstant(
  date: string,
  endMinutes: number,
  timeZone: string,
): Date {
  if (endMinutes >= 24 * 60) {
    return localDateTimeToUtc(
      addDaysToDateString(date, 1),
      "00:00",
      timeZone,
    );
  }

  return localDateTimeToUtc(date, minutesToTime(endMinutes), timeZone);
}

/**
 * Calcula os horários realmente disponíveis, respeitando funcionamento,
 * jornada, duração, bloqueios, agendamentos ativos, data atual e passos de
 * 15 minutos. Esta é a única implementação usada pela agenda e pelas actions.
 */
export function computeAvailableSlots({
  date,
  timeZone,
  durationMinutes,
  businessRanges,
  workingRanges,
  busy,
  now = new Date(),
  stepMinutes = DEFAULT_SLOT_STEP_MINUTES,
}: {
  date: string;
  timeZone: string;
  durationMinutes: number;
  businessRanges: TimeRange[];
  workingRanges: TimeRange[];
  busy: InstantRange[];
  now?: Date;
  stepMinutes?: number;
}): AvailableSlot[] {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return [];
  }

  const openRanges = intersectRanges(businessRanges, workingRanges);

  if (openRanges.length === 0) {
    return [];
  }

  const busyRanges = busy
    .map((range) => ({
      start: new Date(range.start),
      end: new Date(range.end),
    }))
    .filter(
      (range) =>
        !Number.isNaN(range.start.getTime()) &&
        !Number.isNaN(range.end.getTime()) &&
        range.end.getTime() > range.start.getTime(),
    );

  const safeStep =
    Number.isFinite(stepMinutes) && stepMinutes > 0
      ? Math.max(5, Math.round(stepMinutes))
      : DEFAULT_SLOT_STEP_MINUTES;
  const slots: AvailableSlot[] = [];
  const seen = new Set<string>();

  for (const range of openRanges) {
    const endInstant = rangeEndInstant(date, range.end, timeZone);

    for (
      let start = range.start;
      start + durationMinutes <= range.end;
      start += safeStep
    ) {
      const time = minutesToTime(start);

      if (seen.has(time)) {
        continue;
      }

      const startsAt = localDateTimeToUtc(date, time, timeZone);

      if (startsAt.getTime() <= now.getTime()) {
        continue;
      }

      const endsAt = new Date(
        startsAt.getTime() + durationMinutes * 60 * 1000,
      );

      if (endsAt.getTime() > endInstant.getTime()) {
        continue;
      }

      const overlaps = busyRanges.some(
        (busyRange) =>
          startsAt.getTime() < busyRange.end.getTime() &&
          endsAt.getTime() > busyRange.start.getTime(),
      );

      if (overlaps) {
        continue;
      }

      seen.add(time);
      slots.push({
        time,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
    }
  }

  return slots;
}

export function localRangesToLabels(ranges: TimeRange[]): Array<{
  start: string;
  end: string;
}> {
  return mergeRanges(ranges).map((range) => ({
    start: minutesToTime(range.start),
    end: minutesToTime(range.end),
  }));
}
