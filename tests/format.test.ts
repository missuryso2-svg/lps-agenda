import { describe, expect, it } from "vitest";

import {
  addDaysToDateString,
  formatCurrencyFromCents,
  formatDateOnlyBR,
  formatPhoneBR,
  getDateRange,
  getDayRange,
  getMonthRange,
  initialsFromName,
  isFullDayRange,
  localDateString,
  localDateTimeToUtc,
  localTimeString,
  shortWeekdayLabel,
  weekdayFromDateString,
  weekdayLabel,
} from "@/lib/format";
import { slugify } from "@/lib/slug";

describe("slug", () => {
  it("remove acentos e normaliza separadores", () => {
    expect(slugify("  Barbearia Aurora  ")).toBe("barbearia-aurora");
    expect(slugify("Corte & Barba — São Paulo")).toBe("corte-barba-sao-paulo");
    expect(slugify("---Ação---")).toBe("acao");
  });

  it("limita a 60 caracteres sem terminar em hífen", () => {
    const slug = slugify("a".repeat(58) + " palavra");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("formatação", () => {
  it("formata moeda em real e respeita a moeda do catálogo", () => {
    expect(formatCurrencyFromCents(7000)).toContain("70,00");
    expect(formatCurrencyFromCents(0)).toContain("0,00");
    expect(formatCurrencyFromCents(4990, "BRL")).toContain("49,90");
    expect(formatCurrencyFromCents(100, "USD")).toContain("1,00");
  });

  it("formata telefone brasileiro", () => {
    expect(formatPhoneBR("11999999999")).toBe("(11) 99999-9999");
    expect(formatPhoneBR("1133334444")).toBe("(11) 3333-4444");
    expect(formatPhoneBR(null)).toBe("—");
  });

  it("gera iniciais com fallback", () => {
    expect(initialsFromName("Rafael Moraes")).toBe("RM");
    expect(initialsFromName("Marina")).toBe("M");
    expect(initialsFromName("")).toBe("LA");
  });

  it("formata data sem fuso indevido", () => {
    expect(formatDateOnlyBR("2026-11-08")).toBe("08/11/2026");
    expect(formatDateOnlyBR(null)).toBe("—");
  });

  it("mantém rótulos de dias em português", () => {
    expect(weekdayLabel(1)).toBe("Segunda-feira");
    expect(shortWeekdayLabel(6)).toBe("Sáb");
  });
});

describe("intervalos no fuso da barbearia", () => {
  it("calcula o dia civil em São Paulo", () => {
    const { start, end } = getDayRange(
      new Date("2026-11-08T15:30:00.000Z"),
      "America/Sao_Paulo",
    );

    expect(start.toISOString()).toBe("2026-11-08T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-09T03:00:00.000Z");
  });

  it("calcula o mês civil em São Paulo", () => {
    const { start, end } = getMonthRange(
      new Date("2026-11-15T12:00:00.000Z"),
      "America/Sao_Paulo",
    );

    expect(start.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });

  it("converte data e horário locais para UTC", () => {
    expect(
      localDateTimeToUtc("2026-11-20", "09:00", "America/Sao_Paulo").toISOString(),
    ).toBe("2026-11-20T12:00:00.000Z");
    expect(
      localDateTimeToUtc(
        "2026-11-20",
        "09:30:15",
        "America/Sao_Paulo",
      ).toISOString(),
    ).toBe("2026-11-20T12:30:15.000Z");
    expect(() =>
      localDateTimeToUtc("2026-02-30", "09:00", "America/Sao_Paulo"),
    ).toThrow();
  });

  it("soma dias civis atravessando mês e ano", () => {
    expect(addDaysToDateString("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateString("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("calcula o intervalo de uma data local", () => {
    const range = getDateRange("2026-11-20", "America/Sao_Paulo");

    expect(range.start.toISOString()).toBe("2026-11-20T03:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-21T03:00:00.000Z");
  });

  it("extrai data e horário locais de um instante", () => {
    const instant = "2026-11-20T12:30:00.000Z";

    expect(localDateString(instant, "America/Sao_Paulo")).toBe("2026-11-20");
    expect(localTimeString(instant, "America/Sao_Paulo")).toBe("09:30");
    expect(localDateString(instant, "UTC")).toBe("2026-11-20");
  });

  it("obtém o dia da semana de uma data civil sem deslocar o fuso", () => {
    expect(weekdayFromDateString("2026-11-20")).toBe(5);
    expect(weekdayFromDateString(" 2026-11-22 ")).toBe(0);
    expect(weekdayFromDateString("2099-06-01")).toBe(1);
    expect(weekdayFromDateString("2026-02-30")).toBe(1);
    expect(weekdayFromDateString("data-inválida")).toBeNaN();
  });

  it("reconhece bloqueios de dia inteiro no fuso da barbearia", () => {
    expect(
      isFullDayRange(
        "2026-11-20T03:00:00.000Z",
        "2026-11-21T03:00:00.000Z",
        "America/Sao_Paulo",
      ),
    ).toBe(true);
    expect(
      isFullDayRange(
        "2026-11-20T12:00:00.000Z",
        "2026-11-20T15:00:00.000Z",
        "America/Sao_Paulo",
      ),
    ).toBe(false);
  });
});
