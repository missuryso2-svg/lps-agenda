import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase, type FakeRow } from "./helpers/fake-supabase";

const SHOP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BARBER_A1 = "11111111-1111-4111-8111-111111111111";
const BARBER_A2 = "22222222-2222-4222-8222-222222222222";
const BARBER_B1 = "33333333-3333-4333-8333-333333333333";
const BLOCK_A1 = "44444444-4444-4444-8444-444444444444";
const BLOCK_B1 = "55555555-5555-4555-8555-555555555555";
const USER_A = "66666666-6666-4666-8666-666666666666";

const state = vi.hoisted(() => ({
  context: null as unknown,
  db: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({
  getActiveDashboardContext: vi.fn(async () => state.context),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => state.db),
}));

import {
  createBlockedSlotAction,
  deleteBlockedSlotAction,
  saveBarberWorkingHoursAction,
  saveBusinessHoursAction,
  updateBlockedSlotAction,
} from "@/features/schedule/actions";
import { timeToMinutes, WEEKDAYS } from "@/lib/validation/schedule";

function makeContext(
  role: "owner" | "staff",
  shopId = SHOP_A,
  appMetadata: Record<string, unknown> = {},
) {
  return {
    user: { id: USER_A, app_metadata: appMetadata },
    profile: null,
    memberships: [],
    active: {
      barbershop_id: shopId,
      barbershop: {
        id: shopId,
        name: "Barbearia Teste",
        slug: "barbearia-teste",
        timezone: "America/Sao_Paulo",
      },
      role,
      is_active: true,
    },
  };
}

function useDb(seed: Record<string, FakeRow[]> = {}): FakeSupabase {
  const fake = new FakeSupabase(seed);
  state.db = fake;
  return fake;
}

function barberRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: BARBER_A1,
    barbershop_id: SHOP_A,
    name: "Rafael",
    is_active: true,
    display_order: 0,
    ...overrides,
  };
}

function businessHourRow(overrides: FakeRow = {}): FakeRow {
  return {
    barbershop_id: SHOP_A,
    weekday: 1,
    opens_at: "09:00:00",
    closes_at: "18:00:00",
    is_active: true,
    ...overrides,
  };
}

function workingHourRow(overrides: FakeRow = {}): FakeRow {
  return {
    barbershop_id: SHOP_A,
    barber_id: BARBER_A1,
    weekday: 1,
    starts_at: "09:00:00",
    ends_at: "18:00:00",
    is_active: true,
    ...overrides,
  };
}

function blockedSlotRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: BLOCK_A1,
    barbershop_id: SHOP_A,
    barber_id: null,
    starts_at: "2026-11-20T12:00:00.000Z",
    ends_at: "2026-11-20T15:00:00.000Z",
    reason: "Compromisso",
    ...overrides,
  };
}

function weeklyDays(
  options: {
    activeWeekdays?: number[];
    opensAt?: string;
    closesAt?: string;
  } = {},
) {
  const active = new Set(
    options.activeWeekdays ?? [1, 2, 3, 4, 5, 6],
  );

  return WEEKDAYS.map((weekday) => ({
    weekday,
    isActive: active.has(weekday),
    opensAt: options.opensAt ?? "09:00",
    closesAt: options.closesAt ?? "18:00",
  }));
}

function weeklyWorkingDays(
  options: {
    activeWeekdays?: number[];
    startsAt?: string;
    endsAt?: string;
  } = {},
) {
  const active = new Set(
    options.activeWeekdays ?? [1, 2, 3, 4, 5, 6],
  );

  return WEEKDAYS.map((weekday) => ({
    weekday,
    isActive: active.has(weekday),
    startsAt: options.startsAt ?? "09:00",
    endsAt: options.endsAt ?? "18:00",
  }));
}

function businessHoursSeed(
  overrides: (weekday: number) => FakeRow = () => ({}),
) {
  return WEEKDAYS.map((weekday) =>
    businessHourRow({
      id: `business-${weekday}`,
      weekday,
      is_active: weekday !== 0,
      ...overrides(weekday),
    }),
  );
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  state.context = makeContext("owner");
  state.db = new FakeSupabase();
});

describe("horários da barbearia", () => {
  it("cria os sete dias com o barbershop_id da sessão", async () => {
    const db = useDb();

    const result = await saveBusinessHoursAction({
      days: weeklyDays(),
    });

    expect(result.status).toBe("success");
    const rows = db.getRows("business_hours");
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.barbershop_id === SHOP_A)).toBe(true);
    expect(
      rows.find((row) => row.weekday === 0)?.is_active,
    ).toBe(false);
    expect(rows.find((row) => row.weekday === 1)).toMatchObject({
      opens_at: "09:00",
      closes_at: "18:00",
      is_active: true,
    });
  });

  it("edita a faixa existente sem duplicar o dia", async () => {
    const db = useDb({ business_hours: businessHoursSeed() });

    const result = await saveBusinessHoursAction({
      days: weeklyDays({ opensAt: "10:00", closesAt: "19:30" }),
    });

    expect(result.status).toBe("success");
    expect(
      db
        .getRows("business_hours")
        .filter((row) => row.weekday === 1),
    ).toHaveLength(1);
    expect(
      db
        .getRows("business_hours")
        .find((row) => row.weekday === 1),
    ).toMatchObject({
      opens_at: "10:00",
      closes_at: "19:30",
    });
  });

  it("remove faixas duplicadas legadas ao salvar o dia", async () => {
    const db = useDb({
      business_hours: [
        businessHourRow({ id: "business-a", weekday: 1 }),
        businessHourRow({
          id: "business-b",
          weekday: 1,
          opens_at: "13:00:00",
          closes_at: "19:00:00",
        }),
      ],
    });

    const result = await saveBusinessHoursAction({
      days: weeklyDays(),
    });

    expect(result.status).toBe("success");
    const mondayRows = db
      .getRows("business_hours")
      .filter((row) => row.weekday === 1);
    expect(mondayRows).toHaveLength(1);
    expect(mondayRows[0]?.opens_at).toBe("09:00");
  });

  it("rejeita fechamento anterior à abertura sem gravar", async () => {
    const db = useDb();

    const result = await saveBusinessHoursAction({
      days: weeklyDays({ opensAt: "18:00", closesAt: "09:00" }),
    });

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.["days.1.closesAt"]).toBeTruthy();
    expect(db.getRows("business_hours")).toHaveLength(0);
  });

  it("impede reduzir o funcionamento e deixar jornada existente fora", async () => {
    const db = useDb({
      business_hours: businessHoursSeed(),
      barbers: [barberRow()],
      barber_working_hours: [
        workingHourRow({ starts_at: "08:00:00", ends_at: "12:00:00" }),
      ],
    });

    const result = await saveBusinessHoursAction({
      days: weeklyDays({ opensAt: "09:00", closesAt: "18:00" }),
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("Rafael");
    expect(
      db
        .getRows("business_hours")
        .find((row) => row.weekday === 1)?.opens_at,
    ).toBe("09:00:00");
  });

  it("bloqueia alteração dos horários para staff", async () => {
    const db = useDb();
    state.context = makeContext("staff");

    const result = await saveBusinessHoursAction({
      days: weeklyDays(),
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("proprietário");
    expect(db.getRows("business_hours")).toHaveLength(0);
  });
});

describe("jornada dos profissionais", () => {
  it("grava a jornada semanal do profissional da barbearia ativa", async () => {
    const db = useDb({
      business_hours: businessHoursSeed(),
      barbers: [barberRow()],
    });

    const result = await saveBarberWorkingHoursAction({
      barberId: BARBER_A1,
      days: weeklyWorkingDays({ startsAt: "10:00", endsAt: "17:00" }),
    });

    expect(result.status).toBe("success");
    const rows = db.getRows("barber_working_hours");
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.barbershop_id === SHOP_A)).toBe(true);
    expect(rows.every((row) => row.barber_id === BARBER_A1)).toBe(true);
    expect(rows.find((row) => row.weekday === 1)).toMatchObject({
      starts_at: "10:00",
      ends_at: "17:00",
      is_active: true,
    });
    expect(rows.find((row) => row.weekday === 0)?.is_active).toBe(false);
  });

  it("rejeita jornada fora do funcionamento da barbearia", async () => {
    const db = useDb({
      business_hours: businessHoursSeed(),
      barbers: [barberRow()],
    });

    const result = await saveBarberWorkingHoursAction({
      barberId: BARBER_A1,
      days: weeklyWorkingDays({ startsAt: "08:00", endsAt: "12:00" }),
    });

    expect(result.status).toBe("error");
    expect(result.fieldErrors).toMatchObject({
      "days.1.startsAt": expect.any(Array),
    });
    expect(db.getRows("barber_working_hours")).toHaveLength(0);
  });

  it("rejeita jornada em dia fechado da barbearia", async () => {
    const db = useDb({
      business_hours: businessHoursSeed((weekday) =>
        weekday === 1 ? { is_active: false } : {},
      ),
      barbers: [barberRow()],
    });

    const result = await saveBarberWorkingHoursAction({
      barberId: BARBER_A1,
      days: weeklyWorkingDays(),
    });

    expect(result.status).toBe("error");
    expect(db.getRows("barber_working_hours")).toHaveLength(0);
  });

  it("rejeita intervalo invertido", async () => {
    const db = useDb({
      business_hours: businessHoursSeed(),
      barbers: [barberRow()],
    });

    const result = await saveBarberWorkingHoursAction({
      barberId: BARBER_A1,
      days: weeklyWorkingDays({ startsAt: "18:00", endsAt: "09:00" }),
    });

    expect(result.status).toBe("error");
    expect(db.getRows("barber_working_hours")).toHaveLength(0);
  });

  it("não aceita profissional de outra barbearia", async () => {
    const db = useDb({
      business_hours: businessHoursSeed(),
      barbers: [barberRow({ id: BARBER_B1, barbershop_id: SHOP_B })],
    });

    const result = await saveBarberWorkingHoursAction({
      barberId: BARBER_B1,
      days: weeklyWorkingDays(),
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("não pertence");
    expect(db.getRows("barber_working_hours")).toHaveLength(0);
  });

  it("bloqueia escrita para staff", async () => {
    const db = useDb({
      business_hours: businessHoursSeed(),
      barbers: [barberRow()],
    });
    state.context = makeContext("staff");

    const result = await saveBarberWorkingHoursAction({
      barberId: BARBER_A1,
      days: weeklyWorkingDays(),
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("proprietário");
    expect(db.getRows("barber_working_hours")).toHaveLength(0);
  });
});

describe("bloqueios e indisponibilidades", () => {
  it("cria bloqueio de dia inteiro convertendo o fuso da barbearia", async () => {
    const db = useDb({ barbers: [barberRow()] });

    const result = await createBlockedSlotAction({
      barberId: "",
      date: "2026-11-20",
      allDay: true,
      startsAt: "09:00",
      endsAt: "12:00",
      reason: "Férias",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("blocked_slots")[0]).toMatchObject({
      barbershop_id: SHOP_A,
      barber_id: null,
      starts_at: "2026-11-20T03:00:00.000Z",
      ends_at: "2026-11-21T03:00:00.000Z",
      reason: "Férias",
      created_by: USER_A,
    });
  });

  it("cria bloqueio por intervalo para um profissional", async () => {
    const db = useDb({ barbers: [barberRow()] });

    const result = await createBlockedSlotAction({
      barberId: BARBER_A1,
      date: "2026-11-20",
      allDay: false,
      startsAt: "09:00",
      endsAt: "12:00",
      reason: "",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("blocked_slots")[0]).toMatchObject({
      barber_id: BARBER_A1,
      starts_at: "2026-11-20T12:00:00.000Z",
      ends_at: "2026-11-20T15:00:00.000Z",
      reason: null,
    });
  });

  it("rejeita horário final anterior ao inicial", async () => {
    const db = useDb({ barbers: [barberRow()] });

    const result = await createBlockedSlotAction({
      barberId: BARBER_A1,
      date: "2026-11-20",
      allDay: false,
      startsAt: "12:00",
      endsAt: "09:00",
      reason: "",
    });

    expect(result.status).toBe("error");
    expect(db.getRows("blocked_slots")).toHaveLength(0);
  });

  it("detecta sobreposição do mesmo profissional", async () => {
    const db = useDb({
      barbers: [barberRow()],
      blocked_slots: [
        blockedSlotRow({ barber_id: BARBER_A1 }),
      ],
    });

    const result = await createBlockedSlotAction({
      barberId: BARBER_A1,
      date: "2026-11-20",
      allDay: false,
      startsAt: "11:00",
      endsAt: "13:00",
      reason: "",
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("sobrepõe");
    expect(db.getRows("blocked_slots")).toHaveLength(1);
  });

  it("permite o mesmo intervalo para profissionais diferentes", async () => {
    const db = useDb({
      barbers: [barberRow(), barberRow({ id: BARBER_A2, name: "Marina" })],
      blocked_slots: [blockedSlotRow({ barber_id: BARBER_A1 })],
    });

    const result = await createBlockedSlotAction({
      barberId: BARBER_A2,
      date: "2026-11-20",
      allDay: false,
      startsAt: "11:00",
      endsAt: "13:00",
      reason: "",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("blocked_slots")).toHaveLength(2);
  });

  it("impede bloqueio geral que sobrepõe bloqueio de profissional", async () => {
    const db = useDb({
      barbers: [barberRow()],
      blocked_slots: [blockedSlotRow({ barber_id: BARBER_A1 })],
    });

    const result = await createBlockedSlotAction({
      barberId: "",
      date: "2026-11-20",
      allDay: false,
      startsAt: "11:00",
      endsAt: "13:00",
      reason: "",
    });

    expect(result.status).toBe("error");
    expect(db.getRows("blocked_slots")).toHaveLength(1);
  });

  it("impede bloqueio de profissional que sobrepõe bloqueio geral", async () => {
    const db = useDb({
      barbers: [barberRow()],
      blocked_slots: [blockedSlotRow({ barber_id: null })],
    });

    const result = await createBlockedSlotAction({
      barberId: BARBER_A1,
      date: "2026-11-20",
      allDay: false,
      startsAt: "11:00",
      endsAt: "13:00",
      reason: "",
    });

    expect(result.status).toBe("error");
    expect(db.getRows("blocked_slots")).toHaveLength(1);
  });

  it("não considera o próprio bloqueio como conflito ao editar", async () => {
    const db = useDb({
      barbers: [barberRow()],
      blocked_slots: [blockedSlotRow({ barber_id: BARBER_A1 })],
    });

    const result = await updateBlockedSlotAction(BLOCK_A1, {
      barberId: BARBER_A1,
      date: "2026-11-20",
      allDay: false,
      startsAt: "11:00",
      endsAt: "14:00",
      reason: "Atualizado",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("blocked_slots")[0]).toMatchObject({
      starts_at: "2026-11-20T14:00:00.000Z",
      ends_at: "2026-11-20T17:00:00.000Z",
      reason: "Atualizado",
    });
  });

  it("exclui bloqueio da barbearia ativa", async () => {
    const db = useDb({
      blocked_slots: [blockedSlotRow()],
    });

    const result = await deleteBlockedSlotAction(BLOCK_A1);

    expect(result.status).toBe("success");
    expect(db.getRows("blocked_slots")).toHaveLength(0);
  });

  it("não exclui bloqueio de outra barbearia", async () => {
    const db = useDb({
      blocked_slots: [
        blockedSlotRow({
          id: BLOCK_B1,
          barbershop_id: SHOP_B,
        }),
      ],
    });

    const result = await deleteBlockedSlotAction(BLOCK_B1);

    expect(result.status).toBe("error");
    expect(db.getRows("blocked_slots")).toHaveLength(1);
  });

  it("não edita bloqueio de outra barbearia", async () => {
    const db = useDb({
      blocked_slots: [
        blockedSlotRow({
          id: BLOCK_B1,
          barbershop_id: SHOP_B,
        }),
      ],
    });

    const result = await updateBlockedSlotAction(BLOCK_B1, {
      barberId: "",
      date: "2026-11-21",
      allDay: true,
      startsAt: "",
      endsAt: "",
      reason: "Tentativa",
    });

    expect(result.status).toBe("error");
    expect(db.getRows("blocked_slots")[0]).toMatchObject({
      barbershop_id: SHOP_B,
      reason: "Compromisso",
    });
  });

  it("não cria bloqueio para profissional de outra barbearia", async () => {
    const db = useDb({
      barbers: [barberRow({ id: BARBER_B1, barbershop_id: SHOP_B })],
    });

    const result = await createBlockedSlotAction({
      barberId: BARBER_B1,
      date: "2026-11-20",
      allDay: false,
      startsAt: "09:00",
      endsAt: "10:00",
      reason: "",
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("não pertence");
    expect(db.getRows("blocked_slots")).toHaveLength(0);
  });

  it("bloqueia criação para staff", async () => {
    const db = useDb({ barbers: [barberRow()] });
    state.context = makeContext("staff");

    const result = await createBlockedSlotAction({
      barberId: BARBER_A1,
      date: "2026-11-20",
      allDay: false,
      startsAt: "09:00",
      endsAt: "10:00",
      reason: "",
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("proprietário");
    expect(db.getRows("blocked_slots")).toHaveLength(0);
  });
});

describe("helpers de horário", () => {
  it("converte horários com e sem segundos em minutos", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("09:30:00")).toBe(570);
    expect(timeToMinutes("25:00")).toBeNaN();
    expect(timeToMinutes("09:60")).toBeNaN();
  });
});
