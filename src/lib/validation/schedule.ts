import "./browser-safe-zod";
import { z } from "zod";

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const WEEKDAY_NAME_FALLBACK = "Dia inválido";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeWithSecondsPattern = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export const timeSchema = z
  .string()
  .trim()
  .regex(timePattern, "Informe um horário válido no formato HH:MM.");

export const weekdaySchema = z
  .number({ error: "Informe um dia da semana válido." })
  .int("Informe um dia da semana válido.")
  .min(0, "Informe um dia da semana válido.")
  .max(6, "Informe um dia da semana válido.");

export const dateFieldSchema = z
  .string()
  .trim()
  .regex(datePattern, "Informe uma data válida.")
  .refine(isValidDateString, "Informe uma data válida.");

/**
 * Converte HH:MM (ou HH:MM:SS vindo do Postgres) em minutos desde a meia-noite.
 * Retorna NaN quando o valor é inválido.
 */
export function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());

  if (!match) {
    return Number.NaN;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");

  if (hour > 23 || minute > 59 || second > 59) {
    return Number.NaN;
  }

  return hour * 60 + minute;
}

export function normalizeTime(value: string): string {
  const match = /^(\d{2}):(\d{2})/.exec(value.trim());

  if (!match) {
    return value.trim();
  }

  return `${match[1]}:${match[2]}`;
}

export function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && endA > startB;
}

export function isValidDateString(value: string): boolean {
  const match = datePattern.exec(value.trim());

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));

  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

function addClosingOrderIssue(
  value: { opensAt: string; closesAt: string },
  ctx: z.RefinementCtx,
) {
  const opensAt = timeToMinutes(value.opensAt);
  const closesAt = timeToMinutes(value.closesAt);

  if (Number.isNaN(opensAt) || Number.isNaN(closesAt)) {
    return;
  }

  if (closesAt <= opensAt) {
    ctx.addIssue({
      code: "custom",
      path: ["closesAt"],
      message: "O fechamento deve ser posterior à abertura.",
    });
  }
}

function assertAllWeekdays(
  days: Array<{ weekday: number }>,
  ctx: z.RefinementCtx,
) {
  const seen = new Set<number>();

  days.forEach((day, index) => {
    if (seen.has(day.weekday)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "weekday"],
        message: "Este dia da semana está repetido.",
      });
      return;
    }

    seen.add(day.weekday);
  });

  for (const weekday of WEEKDAYS) {
    if (!seen.has(weekday)) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "Inclua os sete dias da semana.",
      });
      return;
    }
  }
}

export const businessHoursDaySchema = z
  .object({
    weekday: weekdaySchema,
    isActive: z.boolean(),
    opensAt: timeSchema,
    closesAt: timeSchema,
  })
  .superRefine(addClosingOrderIssue);

export const weeklyBusinessHoursSchema = z.object({
  days: z
    .array(businessHoursDaySchema)
    .length(7, "Inclua os sete dias da semana.")
    .superRefine(assertAllWeekdays),
});

export const barberWorkingHoursDaySchema = z
  .object({
    weekday: weekdaySchema,
    isActive: z.boolean(),
    startsAt: timeSchema,
    endsAt: timeSchema,
  })
  .superRefine((value, ctx) => {
    addClosingOrderIssue(
      { opensAt: value.startsAt, closesAt: value.endsAt },
      ctx,
    );
  });

export const weeklyBarberWorkingHoursSchema = z.object({
  barberId: z.uuid("Selecione um profissional válido."),
  days: z
    .array(barberWorkingHoursDaySchema)
    .length(7, "Inclua os sete dias da semana.")
    .superRefine(assertAllWeekdays),
});

export const blockedSlotFormSchema = z
  .object({
    barberId: z.union([z.uuid("Selecione um profissional válido."), z.literal("")]),
    date: dateFieldSchema,
    allDay: z.boolean(),
    startsAt: z.string().trim(),
    endsAt: z.string().trim(),
    reason: z
      .string()
      .trim()
      .max(500, "O motivo deve ter no máximo 500 caracteres."),
  })
  .superRefine((value, ctx) => {
    if (value.allDay) {
      return;
    }

    if (!timePattern.test(value.startsAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "Informe um horário inicial válido no formato HH:MM.",
      });
    }

    if (!timePattern.test(value.endsAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Informe um horário final válido no formato HH:MM.",
      });
    }

    if (!timePattern.test(value.startsAt) || !timePattern.test(value.endsAt)) {
      return;
    }

    if (timeToMinutes(value.endsAt) <= timeToMinutes(value.startsAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "O horário final deve ser posterior ao inicial.",
      });
    }
  });

export const blockedSlotIdSchema = z.uuid("Identificador de bloqueio inválido.");

export type BusinessHoursDayValues = z.infer<typeof businessHoursDaySchema>;
export type WeeklyBusinessHoursValues = z.infer<
  typeof weeklyBusinessHoursSchema
>;
export type BarberWorkingHoursDayValues = z.infer<
  typeof barberWorkingHoursDaySchema
>;
export type WeeklyBarberWorkingHoursValues = z.infer<
  typeof weeklyBarberWorkingHoursSchema
>;
export type BlockedSlotFormValues = z.infer<typeof blockedSlotFormSchema>;

/**
 * Aceita horários com segundos vindos do Postgres e devolve HH:MM para os
 * formulários. O valor é preservado quando não é um horário reconhecido.
 */
export function toTimeInput(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return timeWithSecondsPattern.test(value.trim())
    ? normalizeTime(value)
    : value.trim();
}
