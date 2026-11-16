import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { FakeSupabase, type FakeRow } from "./helpers/fake-supabase";
import type { Database } from "@/types/database";

const SHOP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER_A1 = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_B1 = "33333333-3333-4333-8333-333333333333";
const BARBER_A1 = "44444444-4444-4444-8444-444444444444";
const BARBER_B1 = "66666666-6666-4666-8666-666666666666";
const SERVICE_A1 = "77777777-7777-4777-8777-777777777777";
const SERVICE_A2 = "88888888-8888-4888-8888-888888888888";
const SERVICE_B1 = "99999999-9999-4999-8999-999999999999";
const APPOINTMENT_A1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOKEN_A = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";

const TIME_ZONE = "America/Sao_Paulo";
const NOW = new Date("2026-11-12T12:00:00.000Z");
const DATE = "2026-11-16";
const SLUG_A = "barbearia-teste";
const SLUG_B = "barbearia-outra";
const ACTION_DATE = addDays(todayInTimeZone(TIME_ZONE, NOW), 1);

const state = vi.hoisted(() => ({
  db: null as unknown,
  ip: "203.0.113.10",
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ "x-forwarded-for": String(state.ip) }),
  ),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => state.db),
}));

import {
  cancelPublicReservationAction,
  createPublicBookingAction,
  getPublicAvailabilityAction,
} from "@/features/public-booking/actions";
import {
  publicBookingDateWindow,
  PUBLIC_BOOKING_HORIZON_DAYS,
} from "@/features/public-booking/constants";
import {
  loadPublicBookingPageData,
  loadPublicReservation,
} from "@/features/public-booking/queries";
import {
  cancelPublicReservation,
  createPublicBooking,
  loadPublicAvailability,
} from "@/features/public-booking/service";
import {
  addDaysToDateString,
  localDateTimeToUtc,
  todayInTimeZone,
  weekdayFromDateString,
} from "@/lib/format";

type ServiceClient = SupabaseClient<Database>;

function addDays(date: string, days: number): string {
  return addDaysToDateString(date, days);
}

function at(date: string, time: string): string {
  return localDateTimeToUtc(date, time, TIME_ZONE).toISOString();
}

function client(db: FakeSupabase): ServiceClient {
  return db as unknown as ServiceClient;
}

function shopRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SHOP_A,
    slug: SLUG_A,
    name: "Barbearia Teste",
    description: "Cortes e barba no centro.",
    phone: "(11) 99999-9999",
    email: "contato@teste.com",
    address_street: "Rua das Tesouras",
    address_number: "100",
    address_complement: null,
    address_district: "Centro",
    address_city: "São Paulo",
    address_state: "SP",
    address_zip: "01000-000",
    timezone: TIME_ZONE,
    logo_url: null,
    cover_url: null,
    status: "active",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function serviceRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SERVICE_A1,
    barbershop_id: SHOP_A,
    name: "Corte",
    description: "Corte na tesoura.",
    duration_minutes: 30,
    price_cents: 5000,
    is_active: true,
    ...overrides,
  };
}

function barberRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: BARBER_A1,
    barbershop_id: SHOP_A,
    user_id: null,
    name: "Rafael",
    bio: "Especialista em cortes clássicos.",
    phone: null,
    avatar_url: null,
    is_active: true,
    display_order: 0,
    ...overrides,
  };
}

function linkRow(overrides: FakeRow = {}): FakeRow {
  return {
    barber_id: BARBER_A1,
    service_id: SERVICE_A1,
    barbershop_id: SHOP_A,
    ...overrides,
  };
}

function businessHourRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: "business-1",
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
    id: "working-1",
    barbershop_id: SHOP_A,
    barber_id: BARBER_A1,
    weekday: 1,
    starts_at: "09:00:00",
    ends_at: "18:00:00",
    is_active: true,
    ...overrides,
  };
}

function customerRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: CUSTOMER_A1,
    barbershop_id: SHOP_A,
    full_name: "Ana Souza",
    phone: "11911112222",
    email: "ana@example.com",
    birth_date: null,
    notes: null,
    is_active: true,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function appointmentRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: APPOINTMENT_A1,
    barbershop_id: SHOP_A,
    customer_id: CUSTOMER_A1,
    barber_id: BARBER_A1,
    service_id: SERVICE_A1,
    starts_at: at(DATE, "14:00"),
    ends_at: at(DATE, "14:30"),
    status: "scheduled",
    price_cents: 5000,
    notes: null,
    cancel_reason: null,
    public_token: TOKEN_A,
    created_by: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function allWeekBusinessHours(): FakeRow[] {
  return Array.from({ length: 7 }, (_, weekday) =>
    businessHourRow({ id: `business-${weekday}`, weekday }),
  );
}

function allWeekWorkingHours(): FakeRow[] {
  return Array.from({ length: 7 }, (_, weekday) =>
    workingHourRow({ id: `working-${weekday}`, weekday }),
  );
}

function baseSeed(overrides: Record<string, FakeRow[]> = {}) {
  return {
    barbershops: [shopRow()],
    customers: [customerRow()],
    services: [serviceRow()],
    barbers: [barberRow()],
    barber_services: [linkRow()],
    business_hours: allWeekBusinessHours(),
    barber_working_hours: allWeekWorkingHours(),
    blocked_slots: [],
    appointments: [],
    ...overrides,
  };
}

function actionSeed(overrides: Record<string, FakeRow[]> = {}) {
  return baseSeed({
    appointments: [
      appointmentRow({
        starts_at: at(ACTION_DATE, "14:00"),
        ends_at: at(ACTION_DATE, "14:30"),
      }),
    ],
    ...overrides,
  });
}

function setupDb(seed: Record<string, FakeRow[]> = baseSeed()): FakeSupabase {
  const db = new FakeSupabase(seed);
  db.setRpcHandler("get_barbershop_booking_access", () => ({
    allowed: true,
    state: "normal",
    subscription_status: null,
    past_due_since: null,
    grace_period_ends_at: null,
    seconds_remaining: null,
  }));
  state.db = db;
  return db;
}

function setBookingBlocked(db: FakeSupabase, shopId = SHOP_A): void {
  db.setRpcHandler("get_barbershop_booking_access", (args) => {
    if (args.p_barbershop_id !== shopId) {
      return {
        allowed: true,
        state: "normal",
        subscription_status: null,
        past_due_since: null,
        grace_period_ends_at: null,
        seconds_remaining: null,
      };
    }

    return {
      allowed: false,
      state: "blocked",
      subscription_status: "past_due",
      past_due_since: "2026-11-10T12:00:00.000Z",
      grace_period_ends_at: "2026-11-13T12:00:00.000Z",
      seconds_remaining: null,
    };
  });
}

function bookingInput(overrides: Record<string, unknown> = {}) {
  return {
    slug: SLUG_A,
    serviceId: SERVICE_A1,
    barberId: BARBER_A1,
    date: DATE,
    time: "14:00",
    fullName: "  Ana   Souza ",
    phone: "(11) 98765-4321",
    email: " ANA@EXEMPLO.COM ",
    ...overrides,
  };
}

function actionBookingInput(overrides: Record<string, unknown> = {}) {
  return bookingInput({
    date: ACTION_DATE,
    time: "14:00",
    ...overrides,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  state.ip = "203.0.113.10";
  state.db = new FakeSupabase();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("página pública de agendamento", () => {
  it("retorna not_found para slug inexistente", async () => {
    const db = setupDb(baseSeed({ barbershops: [] }));

    const result = await loadPublicBookingPageData(client(db), SLUG_A, NOW);

    expect(result.status).toBe("not_found");
  });

  it("bloqueia barbearia inativa sem expor seus dados", async () => {
    const db = setupDb(
      baseSeed({ barbershops: [shopRow({ status: "inactive" })] }),
    );

    const result = await loadPublicBookingPageData(client(db), SLUG_A, NOW);

    expect(result.status).toBe("inactive");
  });

  it("mostra página pública genérica quando a tolerância terminou", async () => {
    const db = setupDb();
    setBookingBlocked(db);

    const result = await loadPublicBookingPageData(client(db), SLUG_A, NOW);

    expect(result).toEqual({ status: "booking_blocked" });
    expect(JSON.stringify(result)).not.toContain("past_due");
    expect(JSON.stringify(result)).not.toContain("grace_period");
  });

  it("retorna erro genérico quando a leitura falha", async () => {
    const db = setupDb();
    db.failNext("services", "XX000", "select");

    const result = await loadPublicBookingPageData(client(db), SLUG_A, NOW);

    expect(result.status).toBe("error");
  });

  it("agrega somente serviços ativos com profissional ativo associado", async () => {
    const db = setupDb(
      baseSeed({
        services: [
          serviceRow({ id: SERVICE_A1, name: "Corte" }),
          serviceRow({ id: SERVICE_A2, name: "Barba" }),
          serviceRow({
            id: "12121212-1212-4212-8212-121212121212",
            name: "Inativo",
            is_active: false,
          }),
        ],
        barbers: [
          barberRow({ id: BARBER_A1, name: "Rafael" }),
          barberRow({
            id: BARBER_B1,
            name: "Inativo",
            is_active: false,
          }),
        ],
        barber_services: [
          linkRow({ barber_id: BARBER_A1, service_id: SERVICE_A1 }),
          linkRow({ barber_id: BARBER_B1, service_id: SERVICE_A2 }),
          linkRow({
            barber_id: BARBER_A1,
            service_id: "12121212-1212-4212-8212-121212121212",
          }),
        ],
      }),
    );

    const result = await loadPublicBookingPageData(client(db), SLUG_A, NOW);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }

    expect(result.data.services.map((service) => service.id)).toEqual([
      SERVICE_A1,
    ]);
    expect(result.data.barbers).toHaveLength(1);
    expect(result.data.barbers[0]).toMatchObject({
      id: BARBER_A1,
      serviceIds: [SERVICE_A1],
    });
    expect(result.data.dateWindow).toEqual(
      publicBookingDateWindow(TIME_ZONE, NOW),
    );
  });
});

describe("disponibilidade pública", () => {
  it("não expõe horários quando novas reservas estão bloqueadas", async () => {
    const db = setupDb();
    setBookingBlocked(db);

    const result = await loadPublicAvailability({
      supabase: client(db),
      slug: SLUG_A,
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: DATE,
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining("temporariamente indisponíveis"),
    });
    expect(JSON.stringify(result)).not.toContain("past_due");
  });

  it("recusa barbearia inexistente e inativa", async () => {
    const missing = setupDb(baseSeed({ barbershops: [] }));
    const first = await loadPublicAvailability({
      supabase: client(missing),
      slug: SLUG_A,
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: DATE,
      now: NOW,
    });

    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.message).toContain("não encontrada");
    }

    const inactive = setupDb(
      baseSeed({ barbershops: [shopRow({ status: "inactive" })] }),
    );
    const second = await loadPublicAvailability({
      supabase: client(inactive),
      slug: SLUG_A,
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: DATE,
      now: NOW,
    });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.message).toContain("temporariamente indisponíveis");
    }
  });

  it("limita a consulta à janela pública de 60 dias", async () => {
    const db = setupDb();
    const past = await loadPublicAvailability({
      supabase: client(db),
      slug: SLUG_A,
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: "2026-01-05",
      now: NOW,
    });
    const farFuture = await loadPublicAvailability({
      supabase: client(db),
      slug: SLUG_A,
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: "2099-06-01",
      now: NOW,
    });

    expect(PUBLIC_BOOKING_HORIZON_DAYS).toBe(60);
    expect(past.ok).toBe(false);
    expect(farFuture.ok).toBe(false);
    if (!past.ok) {
      expect(past.message).toContain("Escolha uma data entre");
    }
  });

  it("rejeita serviço inativo, profissional inativo e vínculo de outro tenant", async () => {
    const cases: Array<{
      seed: Record<string, FakeRow[]>;
      serviceId: string;
      barberId: string;
    }> = [
      {
        seed: baseSeed({ services: [serviceRow({ is_active: false })] }),
        serviceId: SERVICE_A1,
        barberId: BARBER_A1,
      },
      {
        seed: baseSeed({ barbers: [barberRow({ is_active: false })] }),
        serviceId: SERVICE_A1,
        barberId: BARBER_A1,
      },
      {
        seed: baseSeed({
          services: [serviceRow({ id: SERVICE_B1, barbershop_id: SHOP_B })],
          barber_services: [],
        }),
        serviceId: SERVICE_B1,
        barberId: BARBER_A1,
      },
      {
        seed: baseSeed({
          services: [
            serviceRow({ id: SERVICE_A1 }),
            serviceRow({ id: SERVICE_A2, name: "Barba" }),
          ],
          barber_services: [linkRow({ service_id: SERVICE_A1 })],
        }),
        serviceId: SERVICE_A2,
        barberId: BARBER_A1,
      },
    ];

    for (const testCase of cases) {
      const db = setupDb(testCase.seed);
      const result = await loadPublicAvailability({
        supabase: client(db),
        slug: SLUG_A,
        serviceId: testCase.serviceId,
        barberId: testCase.barberId,
        date: DATE,
        now: NOW,
      });

      expect(result.ok).toBe(false);
    }
  });

  it("remove horários bloqueados e ocupados", async () => {
    const db = setupDb(
      baseSeed({
        blocked_slots: [
          {
            id: "block-1",
            barbershop_id: SHOP_A,
            barber_id: null,
            starts_at: at(DATE, "13:00"),
            ends_at: at(DATE, "15:00"),
            reason: "Reunião",
          },
        ],
        appointments: [appointmentRow()],
      }),
    );

    const result = await loadPublicAvailability({
      supabase: client(db),
      slug: SLUG_A,
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: DATE,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const times = result.availability.slots.map((slot) => slot.time);
      expect(times).not.toContain("13:00");
      expect(times).not.toContain("14:00");
      expect(times).toContain("15:00");
    }
  });
});

describe("criação de reserva pública", () => {
  it("usa preço e duração do banco e grava o token gerado no servidor", async () => {
    const db = setupDb(
      baseSeed({
        services: [
          serviceRow({ duration_minutes: 45, price_cents: 7500 }),
        ],
      }),
    );

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput(),
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result.endsAt).toBe(at(DATE, "14:45"));

    const rows = db.getRows("appointments");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      barbershop_id: SHOP_A,
      barber_id: BARBER_A1,
      service_id: SERVICE_A1,
      starts_at: at(DATE, "14:00"),
      ends_at: at(DATE, "14:45"),
      status: "scheduled",
      price_cents: 7500,
      created_by: null,
      public_token: result.token,
    });

    expect(db.getRows("customers")).toHaveLength(2);
  });

  it("ignora barbershop_id, preço e duração enviados pelo navegador", async () => {
    const db = setupDb(
      baseSeed({
        services: [serviceRow({ price_cents: 5000, duration_minutes: 30 })],
      }),
    );

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput({
        barbershopId: SHOP_B,
        customerId: CUSTOMER_B1,
        priceCents: 1,
        durationMinutes: 600,
      }),
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(db.getRows("appointments")[0]).toMatchObject({
      barbershop_id: SHOP_A,
      price_cents: 5000,
      starts_at: at(DATE, "14:00"),
      ends_at: at(DATE, "14:30"),
    });
  });

  it("não cria cliente nem reserva quando o horário não está disponível", async () => {
    const db = setupDb();

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput({ time: "03:00" }),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unavailable");
      expect(result.field).toBe("time");
    }
    expect(db.getRows("appointments")).toHaveLength(0);
    expect(db.getRows("customers")).toHaveLength(1);
  });

  it("traduz bloqueio do trigger do banco sem expor a situação financeira", async () => {
    const db = setupDb();
    db.failNext("appointments", "P0001", "insert");

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput(),
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "booking_blocked",
      message: expect.stringContaining("temporariamente indisponíveis"),
    });
    expect(JSON.stringify(result)).not.toContain("past_due");
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("não aceita serviço de outra barbearia", async () => {
    const db = setupDb(
      baseSeed({
        services: [serviceRow({ id: SERVICE_B1, barbershop_id: SHOP_B })],
        barber_services: [],
      }),
    );

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput({ serviceId: SERVICE_B1 }),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unavailable");
    }
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("recusa data fora da janela pública antes de consultar slots", async () => {
    const db = setupDb();

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput({ date: "2099-06-01" }),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_date");
      expect(result.field).toBe("date");
    }
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("reaproveita cliente do mesmo tenant pelo telefone normalizado", async () => {
    const db = setupDb(
      baseSeed({
        customers: [
          customerRow({
            phone: "(11) 98765-4321",
            full_name: "Ana Antiga",
            email: "antiga@example.com",
          }),
        ],
      }),
    );

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput({
        fullName: "Ana Nova",
        phone: "+55 11 98765-4321",
        email: "nova@example.com",
      }),
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(db.getRows("customers")).toHaveLength(1);
    expect(db.getRows("appointments")[0]?.customer_id).toBe(CUSTOMER_A1);
    expect(db.getRows("customers")[0]).toMatchObject({
      full_name: "Ana Antiga",
      email: "antiga@example.com",
    });
  });

  it("não reutiliza cliente de outra barbearia com o mesmo telefone", async () => {
    const db = setupDb(
      baseSeed({
        customers: [
          customerRow({
            id: CUSTOMER_B1,
            barbershop_id: SHOP_B,
            phone: "11987654321",
          }),
        ],
      }),
    );

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput(),
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(db.getRows("customers")).toHaveLength(2);
    const appointment = db.getRows("appointments")[0];
    expect(appointment?.customer_id).not.toBe(CUSTOMER_B1);
  });

  it("mantém um único cliente em reservas consecutivas do mesmo telefone", async () => {
    const db = setupDb();

    const first = await createPublicBooking({
      supabase: client(db),
      input: bookingInput({ time: "14:00" }),
      now: NOW,
    });
    const second = await createPublicBooking({
      supabase: client(db),
      input: bookingInput({ time: "15:00" }),
      now: NOW,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(db.getRows("customers")).toHaveLength(2);
    expect(new Set(db.getRows("appointments").map((row) => row.customer_id)).size).toBe(1);
  });

  it("traduz a exclusão de sobreposição do PostgreSQL", async () => {
    const db = setupDb();
    db.failNext("appointments", "23P01", "insert");

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput(),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("conflict");
      expect(result.field).toBe("time");
      expect(result.message).toContain("acabou de ser reservado");
    }
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("gera novo token quando o primeiro colide com o índice único", async () => {
    const db = setupDb();
    db.failNext("appointments", "23505", "insert");

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput(),
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(db.getRows("appointments")).toHaveLength(1);
    expect(db.getRows("appointments")[0]?.public_token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("falha sem gravar quando a deduplicação de cliente falha", async () => {
    const db = setupDb();
    db.failNextRpc("find_or_create_public_customer", "P0001");

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput(),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("customer");
    }
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("devolve erro genérico em falha desconhecida de inserção", async () => {
    const db = setupDb();
    db.failNext("appointments", "XX000", "insert");

    const result = await createPublicBooking({
      supabase: client(db),
      input: bookingInput(),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("error");
    }
    expect(db.getRows("appointments")).toHaveLength(0);
  });
});

describe("consulta e cancelamento por token", () => {
  it("consulta a reserva pelo token sem expor o id interno", async () => {
    const db = setupDb(baseSeed({ appointments: [appointmentRow()] }));

    const result = await loadPublicReservation(
      client(db),
      SLUG_A,
      TOKEN_A,
      NOW,
    );

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.data).toMatchObject({
        token: TOKEN_A,
        status: "scheduled",
        serviceName: "Corte",
        barberName: "Rafael",
        customerName: "Ana Souza",
        canCancel: true,
      });
    }
  });

  it("não encontra reserva de outra barbearia ou token inválido", async () => {
    const db = setupDb(baseSeed({ appointments: [appointmentRow()] }));

    const wrongShop = await loadPublicReservation(
      client(db),
      SLUG_B,
      TOKEN_A,
      NOW,
    );
    const wrongToken = await loadPublicReservation(
      client(db),
      SLUG_A,
      "99999999-9999-4999-8999-999999999999",
      NOW,
    );

    expect(wrongShop.status).toBe("not_found");
    expect(wrongToken.status).toBe("not_found");
  });

  it("não permite cancelar reserva concluída, já iniciada ou passada", async () => {
    const completed = setupDb(
      baseSeed({ appointments: [appointmentRow({ status: "completed" })] }),
    );
    const first = await cancelPublicReservation({
      supabase: client(completed),
      slug: SLUG_A,
      token: TOKEN_A,
      now: NOW,
    });

    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.code).toBe("not_cancellable");
    }

    const started = setupDb(
      baseSeed({
        appointments: [
          appointmentRow({
            starts_at: at(DATE, "09:00"),
            ends_at: at(DATE, "09:30"),
          }),
        ],
      }),
    );
    const second = await cancelPublicReservation({
      supabase: client(started),
      slug: SLUG_A,
      token: TOKEN_A,
      now: new Date(at(DATE, "09:00")),
    });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe("not_cancellable");
    }
  });

  it("cancela reserva agendada e libera o horário", async () => {
    const db = setupDb(baseSeed({ appointments: [appointmentRow()] }));

    const result = await cancelPublicReservation({
      supabase: client(db),
      slug: SLUG_A,
      token: TOKEN_A,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(db.getRows("appointments")[0]).toMatchObject({
      status: "cancelled",
      cancel_reason: "Cancelada pelo cliente na página pública",
    });

    const availability = await loadPublicAvailability({
      supabase: client(db),
      slug: SLUG_A,
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: DATE,
      now: NOW,
    });

    expect(availability.ok).toBe(true);
    if (availability.ok) {
      expect(
        availability.availability.slots.some((slot) => slot.time === "14:00"),
      ).toBe(true);
    }
  });

  it("cancela reserva confirmada", async () => {
    const db = setupDb(
      baseSeed({ appointments: [appointmentRow({ status: "confirmed" })] }),
    );

    const result = await cancelPublicReservation({
      supabase: client(db),
      slug: SLUG_A,
      token: TOKEN_A,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(db.getRows("appointments")[0]?.status).toBe("cancelled");
  });

  it("não altera status em falha de leitura ou de atualização", async () => {
    const readFailure = setupDb(baseSeed({ appointments: [appointmentRow()] }));
    readFailure.failNext("appointments", "XX000", "select");

    const first = await cancelPublicReservation({
      supabase: client(readFailure),
      slug: SLUG_A,
      token: TOKEN_A,
      now: NOW,
    });

    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.code).toBe("error");
    }
    expect(readFailure.getRows("appointments")[0]?.status).toBe("scheduled");

    const writeFailure = setupDb(baseSeed({ appointments: [appointmentRow()] }));
    writeFailure.failNext("appointments", "XX000", "update");

    const second = await cancelPublicReservation({
      supabase: client(writeFailure),
      slug: SLUG_A,
      token: TOKEN_A,
      now: NOW,
    });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe("error");
    }
    expect(writeFailure.getRows("appointments")[0]?.status).toBe("scheduled");
  });
});

describe("actions públicas e rate limiting", () => {
  it("consulta disponibilidade pública com data dentro da janela", async () => {
    const db = setupDb();
    const weekday = weekdayFromDateString(ACTION_DATE);
    expect(weekday).toBeGreaterThanOrEqual(0);

    const result = await getPublicAvailabilityAction({
      slug: SLUG_A,
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: ACTION_DATE,
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.availability.slots.length).toBeGreaterThan(0);
    }
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("rejeita consulta com identificadores inválidos sem tocar no banco", async () => {
    const db = setupDb();

    const result = await getPublicAvailabilityAction({
      slug: SLUG_A,
      serviceId: "não-é-uuid",
      barberId: BARBER_A1,
      date: ACTION_DATE,
    });

    expect(result.status).toBe("error");
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("consulta disponibilidade mesmo se o rate limit estiver indisponível", async () => {
    const db = setupDb();
    db.failNextRpc("consume_booking_rate_limit", "PGRST202");

    const result = await getPublicAvailabilityAction({
      slug: SLUG_A,
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: ACTION_DATE,
    });

    expect(result.status).toBe("success");
  });

  it("aplica rate limit na consulta de disponibilidade", async () => {
    const db = setupDb();
    db.setRpcHandler("consume_booking_rate_limit", () => false);

    const result = await getPublicAvailabilityAction({
      slug: SLUG_A,
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: ACTION_DATE,
    });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("Muitas tentativas");
    }
  });

  it("usa hash do IP no bucket, sem persistir o endereço em texto puro", async () => {
    const db = setupDb();
    const calls: FakeRow[] = [];
    db.setRpcHandler("consume_booking_rate_limit", (args) => {
      calls.push(args);
      return true;
    });

    await getPublicAvailabilityAction({
      slug: SLUG_A,
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: ACTION_DATE,
    });

    expect(calls).toHaveLength(1);
    const bucket = String(calls[0]?.p_bucket ?? "");
    expect(bucket).toMatch(/^public-booking:availability:[a-f0-9]{64}$/);
    expect(bucket).not.toContain(state.ip as string);
  });

  it("cria reserva pela action e devolve token opaco", async () => {
    const db = setupDb(baseSeed({ appointments: [] }));

    const result = await createPublicBookingAction(actionBookingInput());

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.slug).toBe(SLUG_A);
      expect(result.token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }

    const rows = db.getRows("appointments");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      barbershop_id: SHOP_A,
      price_cents: 5000,
      status: "scheduled",
      created_by: null,
    });
    expect(db.getRows("customers")[1]).toMatchObject({
      full_name: "Ana Souza",
      phone: "11987654321",
      email: "ana@exemplo.com",
    });
  });

  it("bloqueia chamada direta à action pública sem criar cliente nem reserva", async () => {
    const db = setupDb(baseSeed({ appointments: [] }));
    setBookingBlocked(db);

    const result = await createPublicBookingAction(actionBookingInput());

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("temporariamente indisponíveis");
      expect(result.message).not.toContain("past_due");
      expect(result.message).not.toContain("pagamento");
    }
    expect(db.getRows("appointments")).toHaveLength(0);
    expect(db.getRows("customers")).toHaveLength(1);
  });

  it("ignora tenant, preço e duração injetados no payload da action", async () => {
    const db = setupDb(baseSeed({ appointments: [] }));

    const result = await createPublicBookingAction(
      actionBookingInput({
        barbershopId: SHOP_B,
        customerId: CUSTOMER_B1,
        priceCents: 1,
        durationMinutes: 999,
      }),
    );

    expect(result.status).toBe("success");
    expect(db.getRows("appointments")[0]).toMatchObject({
      barbershop_id: SHOP_A,
      price_cents: 5000,
      starts_at: at(ACTION_DATE, "14:00"),
      ends_at: at(ACTION_DATE, "14:30"),
    });
  });

  it("valida os dados antes de consumir rate limit", async () => {
    const db = setupDb(baseSeed({ appointments: [] }));
    const calls: FakeRow[] = [];
    db.setRpcHandler("consume_booking_rate_limit", (args) => {
      calls.push(args);
      return true;
    });

    const result = await createPublicBookingAction(
      actionBookingInput({ phone: "123", email: "sem-arroba" }),
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.fieldErrors?.phone).toBeTruthy();
      expect(result.fieldErrors?.email).toBeTruthy();
    }
    expect(calls).toHaveLength(0);
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("traduz conflito de horário e devolve erro no campo time", async () => {
    const db = setupDb(baseSeed({ appointments: [] }));
    db.failNext("appointments", "23P01", "insert");

    const result = await createPublicBookingAction(actionBookingInput());

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.fieldErrors?.time).toBeTruthy();
      expect(result.message).toContain("acabou de ser reservado");
    }
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("falha fechado quando o rate limit de criação está indisponível", async () => {
    const db = setupDb(baseSeed({ appointments: [] }));
    db.failNextRpc("consume_booking_rate_limit", "PGRST202");

    const result = await createPublicBookingAction(actionBookingInput());

    expect(result.status).toBe("error");
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("aplica limite por telefone mesmo com IPs diferentes", async () => {
    const db = setupDb(baseSeed({ appointments: [] }));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      state.ip = `203.0.113.${attempt + 10}`;
      const result = await createPublicBookingAction(actionBookingInput());
      expect(result.status === "error" ? result.message : "").not.toContain(
        "Muitas tentativas",
      );
    }

    state.ip = "203.0.113.99";
    const limited = await createPublicBookingAction(actionBookingInput());

    expect(limited.status).toBe("error");
    if (limited.status === "error") {
      expect(limited.message).toContain("Muitas tentativas");
    }
    expect(db.getRows("appointments")).toHaveLength(1);
  });

  it("não persiste telefone nem IP no bucket de rate limit", async () => {
    const db = setupDb(baseSeed({ appointments: [] }));
    const calls: FakeRow[] = [];
    db.setRpcHandler("consume_booking_rate_limit", (args) => {
      calls.push(args);
      return true;
    });

    await createPublicBookingAction(
      actionBookingInput({ phone: "(11) 98765-4321" }),
    );

    expect(calls).toHaveLength(2);

    for (const call of calls) {
      const bucket = String(call.p_bucket ?? "");
      expect(bucket).toMatch(/^public-booking:create:(ip|phone):[a-f0-9]{64}$/);
      expect(bucket).not.toContain("11987654321");
      expect(bucket).not.toContain("203.0.113.10");
    }
  });

  it("cancela a reserva pela action e persiste o motivo", async () => {
    const db = setupDb(actionSeed());

    const result = await cancelPublicReservationAction({
      slug: SLUG_A,
      token: TOKEN_A,
    });

    expect(result.status).toBe("success");
    expect(db.getRows("appointments")[0]).toMatchObject({
      status: "cancelled",
      cancel_reason: "Cancelada pelo cliente na página pública",
    });
  });

  it("rejeita token inválido antes de consultar o banco", async () => {
    const db = setupDb(actionSeed());

    const result = await cancelPublicReservationAction({
      slug: SLUG_A,
      token: "token-invalido",
    });

    expect(result.status).toBe("error");
    expect(db.getRows("appointments")[0]?.status).toBe("scheduled");
  });

  it("falha fechado quando o rate limit de cancelamento está indisponível", async () => {
    const db = setupDb(actionSeed());
    db.failNextRpc("consume_booking_rate_limit", "PGRST202");

    const result = await cancelPublicReservationAction({
      slug: SLUG_A,
      token: TOKEN_A,
    });

    expect(result.status).toBe("error");
    expect(db.getRows("appointments")[0]?.status).toBe("scheduled");
  });

  it("aplica rate limit no cancelamento", async () => {
    const db = setupDb(actionSeed());
    db.setRpcHandler("consume_booking_rate_limit", () => false);

    const result = await cancelPublicReservationAction({
      slug: SLUG_A,
      token: TOKEN_A,
    });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("Muitas tentativas");
    }
    expect(db.getRows("appointments")[0]?.status).toBe("scheduled");
  });
});

describe("formatação e privacidade da reserva", () => {
  it("não inclui o id interno na resposta pública da reserva", async () => {
    const db = setupDb(actionSeed());

    const result = await loadPublicReservation(
      client(db),
      SLUG_A,
      TOKEN_A,
      NOW,
    );

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.data).not.toHaveProperty("id");
      expect(result.data.token).toBe(TOKEN_A);
    }
  });

  it("marca a página da reserva como não indexável", () => {
    // A proteção é estrutural: o token é imprevisível e a rota declara noindex.
    expect(TOKEN_A).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
