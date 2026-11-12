const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const weekdayLabels = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

const shortWeekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export function formatCurrencyFromCents(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

export function formatPhoneBR(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const digits = value.replace(/\D/g, "");

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return value;
}

export function formatDateBR(
  value: string | Date | null | undefined,
  timeZone = "America/Sao_Paulo",
): string {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  }).format(date);
}

export function formatDateTimeBR(
  value: string | Date | null | undefined,
  timeZone = "America/Sao_Paulo",
): string {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export function formatTimeBR(
  value: string | Date | null | undefined,
  timeZone = "America/Sao_Paulo",
): string {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export function formatDateOnlyBR(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return formatDateBR(value);
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function weekdayLabel(weekday: number): string {
  return weekdayLabels[weekday] ?? "—";
}

export function shortWeekdayLabel(weekday: number): string {
  return shortWeekdayLabels[weekday] ?? "—";
}

export function initialsFromName(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "LA";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? "0";
    return Number.parseInt(value, 10);
  };

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
    second: lookup("second"),
  };
}

function getOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

function zonedTimeToUtc(parts: ZonedParts, timeZone: string): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  const firstOffset = getOffsetMs(new Date(utcGuess), timeZone);
  const firstResult = new Date(utcGuess - firstOffset);
  const secondOffset = getOffsetMs(firstResult, timeZone);

  if (secondOffset !== firstOffset) {
    return new Date(utcGuess - secondOffset);
  }

  return firstResult;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDateInput(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (!match) {
    throw new Error("Data inválida.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error("Data inválida.");
  }

  return { year, month, day };
}

/**
 * Converte data e horário locais da barbearia para o instante UTC correspondente.
 * Use sempre o fuso da barbearia para não deslocar horários de funcionamento.
 */
export function localDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const { year, month, day } = parseDateInput(date);
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());

  if (!match) {
    throw new Error("Horário inválido.");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    throw new Error("Horário inválido.");
  }

  return zonedTimeToUtc(
    { year, month, day, hour, minute, second },
    timeZone,
  );
}

export function addDaysToDateString(value: string, days: number): string {
  const { year, month, day } = parseDateInput(value);
  const next = new Date(Date.UTC(year, month - 1, day + days));

  return [
    next.getUTCFullYear(),
    pad2(next.getUTCMonth() + 1),
    pad2(next.getUTCDate()),
  ].join("-");
}

/**
 * Início e fim (exclusivo) de uma data civil no fuso da barbearia.
 */
export function getDateRange(
  date: string,
  timeZone: string,
): { start: Date; end: Date } {
  const start = localDateTimeToUtc(date, "00:00", timeZone);
  const end = localDateTimeToUtc(
    addDaysToDateString(date, 1),
    "00:00",
    timeZone,
  );

  return { start, end };
}

export function localDateString(
  value: string | Date,
  timeZone: string,
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Data inválida.");
  }

  const parts = getZonedParts(date, timeZone);

  return [parts.year, pad2(parts.month), pad2(parts.day)].join("-");
}

export function localTimeString(
  value: string | Date,
  timeZone: string,
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Data inválida.");
  }

  const parts = getZonedParts(date, timeZone);

  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function isFullDayRange(
  startsAt: string | Date,
  endsAt: string | Date,
  timeZone: string,
): boolean {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const end = endsAt instanceof Date ? endsAt : new Date(endsAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  const range = getDateRange(localDateString(start, timeZone), timeZone);

  return (
    start.getTime() === range.start.getTime() &&
    end.getTime() === range.end.getTime()
  );
}

/**
 * Início e fim (exclusivo) do dia civil no fuso da barbearia.
 */
export function getDayRange(
  date: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const parts = getZonedParts(date, timeZone);

  const start = zonedTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );

  const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const end = zonedTimeToUtc(
    {
      year: nextDay.getUTCFullYear(),
      month: nextDay.getUTCMonth() + 1,
      day: nextDay.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );

  return { start, end };
}

/**
 * Início e fim (exclusivo) do mês civil no fuso da barbearia.
 */
export function getMonthRange(
  date: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const parts = getZonedParts(date, timeZone);

  const start = zonedTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );

  const end = zonedTimeToUtc(
    {
      year: parts.month === 12 ? parts.year + 1 : parts.year,
      month: parts.month === 12 ? 1 : parts.month + 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );

  return { start, end };
}

export function todayInTimeZone(timeZone: string): string {
  const parts = getZonedParts(new Date(), timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
