import { describe, expect, it } from "vitest";

import {
  computeAvailableSlots,
  instantRangeToLocalMinutes,
  intersectRanges,
  localRangesToLabels,
  mergeRanges,
  minutesToTime,
  subtractRanges,
} from "@/features/scheduling/availability";

const TIME_ZONE = "America/Sao_Paulo";
const DATE = "2099-06-01";

function localTime(time: string) {
  return new Date(`${DATE}T${time}:00-03:00`);
}

describe("operações de faixas de horário", () => {
  it("une faixas sobrepostas e contíguas, descartando inválidas", () => {
    expect(
      mergeRanges([
        { start: 600, end: 720 },
        { start: 540, end: 600 },
        { start: 700, end: 780 },
        { start: 900, end: 900 },
        { start: Number.NaN, end: 800 },
      ]),
    ).toEqual([{ start: 540, end: 780 }]);
  });

  it("calcula a interseção entre funcionamento e jornada", () => {
    expect(
      intersectRanges(
        [
          { start: 540, end: 720 },
          { start: 780, end: 1080 },
        ],
        [
          { start: 600, end: 900 },
          { start: 1000, end: 1100 },
        ],
      ),
    ).toEqual([
      { start: 600, end: 720 },
      { start: 780, end: 900 },
      { start: 1000, end: 1080 },
    ]);
  });

  it("subtrai períodos ocupados preservando as bordas", () => {
    expect(
      subtractRanges(
        [
          { start: 540, end: 720 },
          { start: 780, end: 1080 },
        ],
        [
          { start: 600, end: 660 },
          { start: 800, end: 840 },
        ],
      ),
    ).toEqual([
      { start: 540, end: 600 },
      { start: 660, end: 720 },
      { start: 780, end: 800 },
      { start: 840, end: 1080 },
    ]);
  });

  it("converte instantes para minutos locais recortando o dia civil", () => {
    const range = instantRangeToLocalMinutes(
      {
        start: "2099-06-02T02:00:00.000Z",
        end: "2099-06-02T05:00:00.000Z",
      },
      DATE,
      TIME_ZONE,
    );

    expect(range).toEqual({ start: 23 * 60, end: 24 * 60 });
  });

  it("formata faixas locais incluindo o fim do dia", () => {
    expect(
      localRangesToLabels([
        { start: 540, end: 720 },
        { start: 1380, end: 1440 },
      ]),
    ).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "23:00", end: "24:00" },
    ]);
    expect(minutesToTime(1440)).toBe("24:00");
  });
});

describe("motor de disponibilidade", () => {
  const base = {
    date: DATE,
    timeZone: TIME_ZONE,
    durationMinutes: 30,
    businessRanges: [{ start: 540, end: 1080 }],
    workingRanges: [{ start: 540, end: 1080 }],
    busy: [],
    now: new Date("2099-06-01T00:00:00-03:00"),
  };

  it("gera horários no passo de 15 minutos respeitando a duração", () => {
    const slots = computeAvailableSlots(base);

    expect(slots).toHaveLength(35);
    expect(slots[0]).toMatchObject({
      time: "09:00",
      startsAt: "2099-06-01T12:00:00.000Z",
      endsAt: "2099-06-01T12:30:00.000Z",
    });
    expect(slots.at(-1)?.time).toBe("17:30");
    expect(
      slots.every((slot) => {
        const start = new Date(slot.startsAt).getTime();
        const end = new Date(slot.endsAt).getTime();
        return end - start === 30 * 60_000;
      }),
    ).toBe(true);
  });

  it("remove horários que sobrepõem bloqueios ou agendamentos ativos", () => {
    const slots = computeAvailableSlots({
      ...base,
      busy: [
        {
          start: localTime("12:00"),
          end: localTime("13:00"),
        },
      ],
    });
    const times = slots.map((slot) => slot.time);

    expect(times).toContain("11:30");
    expect(times).not.toContain("11:45");
    expect(times).not.toContain("12:00");
    expect(times).not.toContain("12:45");
    expect(times).toContain("13:00");
  });

  it("corta horários passados usando o instante atual", () => {
    const slots = computeAvailableSlots({
      ...base,
      now: localTime("10:00"),
    });

    expect(slots[0]?.time).toBe("10:15");
    expect(slots.map((slot) => slot.time)).not.toContain("10:00");
  });

  it("não oferece horários quando não há interseção de expediente", () => {
    expect(
      computeAvailableSlots({
        ...base,
        businessRanges: [{ start: 540, end: 720 }],
        workingRanges: [{ start: 780, end: 1080 }],
      }),
    ).toEqual([]);
  });

  it("não oferece horários quando a duração excede a janela contínua", () => {
    expect(
      computeAvailableSlots({
        ...base,
        durationMinutes: 90,
        businessRanges: [{ start: 540, end: 600 }],
        workingRanges: [{ start: 540, end: 600 }],
      }),
    ).toEqual([]);
  });

  it("respeita a borda final exata da jornada", () => {
    const slots = computeAvailableSlots({
      ...base,
      durationMinutes: 60,
      businessRanges: [{ start: 540, end: 600 }],
      workingRanges: [{ start: 540, end: 600 }],
    });

    expect(slots).toHaveLength(1);
    expect(slots[0]?.time).toBe("09:00");
  });

  it("ignora durações inválidas", () => {
    expect(
      computeAvailableSlots({ ...base, durationMinutes: 0 }),
    ).toEqual([]);
    expect(
      computeAvailableSlots({ ...base, durationMinutes: Number.NaN }),
    ).toEqual([]);
  });
});
