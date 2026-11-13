import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase, type FakeRow } from "./helpers/fake-supabase";

const SHOP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER_A1 = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_A2 = "22222222-2222-4222-8222-222222222222";
const CUSTOMER_B1 = "33333333-3333-4333-8333-333333333333";
const BARBER_A1 = "44444444-4444-4444-8444-444444444444";
const BARBER_B1 = "66666666-6666-4666-8666-666666666666";
const SERVICE_A1 = "77777777-7777-4777-8777-777777777777";
const SERVICE_A2 = "88888888-8888-4888-8888-888888888888";
const SERVICE_B1 = "99999999-9999-4999-8999-999999999999";
const APPOINTMENT_A1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const APPOINTMENT_B1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const DATE = "2099-06-01";
const TIME_ZONE = "America/Sao_Paulo";
const NOW = new Date("2026-11-12T12:00:00.000Z");

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
  cancelAppointmentAction,
  completeAppointmentAction,
  confirmAppointmentAction,
  createAppointmentAction,
  getAppointmentAvailabilityAction,
  markAppointmentNoShowAction,
  rescheduleAppointmentAction,
  searchAppointmentCustomersAction,
  startAppointmentAction,
} from "@/features/scheduling/actions";
import { localDateTimeToUtc } from "@/lib/format";

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
        timezone: TIME_ZONE,
      },
      role,
      is_active: true,
    },
  };
}

function at(date: string, time: string): string {
  return localDateTimeToUtc(date, time, TIME_ZONE).toISOString();
}

function customerRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: CUSTOMER_A1,
    barbershop_id: SHOP_A,
    full_name: "Ana Souza",
    phone: "11987654321",
    email: "ana@example.com",
    birth_date: null,
    notes: null,
    is_active: true,
    ...overrides,
  };
}

function serviceRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SERVICE_A1,
    barbershop_id: SHOP_A,
    name: "Corte",
    description: null,
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
    bio: null,
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
    created_by: USER_A,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function baseSeed(overrides: Record<string, FakeRow[]> = {}) {
  return {
    customers: [customerRow()],
    services: [serviceRow()],
    barbers: [barberRow()],
    barber_services: [linkRow()],
    business_hours: [businessHourRow()],
    barber_working_hours: [workingHourRow()],
    blocked_slots: [],
    appointments: [],
    ...overrides,
  };
}

function setupDb(seed: Record<string, FakeRow[]> = baseSeed()): FakeSupabase {
  const fake = new FakeSupabase(seed);
  state.db = fake;
  return fake;
}

function booking(overrides: Record<string, unknown> = {}) {
  return {
    customerId: CUSTOMER_A1,
    serviceId: SERVICE_A1,
    barberId: BARBER_A1,
    date: DATE,
    time: "14:00",
    notes: "",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  state.context = makeContext("owner");
  state.db = new FakeSupabase();
});

describe("criação de agendamentos", () => {
  it("cria um agendamento válido com preço e duração do serviço no banco", async () => {
    const db = setupDb(
      baseSeed({
        services: [serviceRow({ price_cents: 7500 })],
      }),
    );

    const result = await createAppointmentAction(
      booking({ notes: "  Cliente prefere máquina 2  " }),
    );

    expect(result.status).toBe("success");
    const rows = db.getRows("appointments");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      barbershop_id: SHOP_A,
      customer_id: CUSTOMER_A1,
      barber_id: BARBER_A1,
      service_id: SERVICE_A1,
      starts_at: at(DATE, "14:00"),
      ends_at: at(DATE, "14:30"),
      status: "scheduled",
      price_cents: 7500,
      notes: "Cliente prefere máquina 2",
      created_by: USER_A,
    });
  });

  it("rejeita cliente inexistente ou inativo sem gravar", async () => {
    const missing = setupDb(
      baseSeed({ customers: [] }),
    );
    const first = await createAppointmentAction(booking());
    expect(first.status).toBe("error");
    expect(first.fieldErrors?.customerId).toBeTruthy();
    expect(missing.getRows("appointments")).toHaveLength(0);

    const inactive = setupDb(
      baseSeed({ customers: [customerRow({ is_active: false })] }),
    );
    const second = await createAppointmentAction(booking());
    expect(second.status).toBe("error");
    expect(inactive.getRows("appointments")).toHaveLength(0);
  });

  it("não aceita cliente de outra barbearia", async () => {
    const db = setupDb(
      baseSeed({
        customers: [customerRow({ id: CUSTOMER_B1, barbershop_id: SHOP_B })],
      }),
    );

    const result = await createAppointmentAction(
      booking({ customerId: CUSTOMER_B1 }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.customerId).toBeTruthy();
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("rejeita serviço inexistente, inativo ou de outro tenant", async () => {
    const cases = [
      baseSeed({ services: [] }),
      baseSeed({ services: [serviceRow({ is_active: false })] }),
      baseSeed({
        services: [serviceRow({ id: SERVICE_B1, barbershop_id: SHOP_B })],
      }),
    ];

    for (const seed of cases) {
      const db = setupDb(seed);
      const result = await createAppointmentAction(
        booking({ serviceId: seed.services[0]?.id ?? SERVICE_A1 }),
      );
      expect(result.status).toBe("error");
      expect(db.getRows("appointments")).toHaveLength(0);
    }
  });

  it("rejeita profissional inexistente, inativo ou de outro tenant", async () => {
    const cases = [
      baseSeed({ barbers: [] }),
      baseSeed({ barbers: [barberRow({ is_active: false })] }),
      baseSeed({
        barbers: [barberRow({ id: BARBER_B1, barbershop_id: SHOP_B })],
      }),
    ];

    for (const seed of cases) {
      const db = setupDb(seed);
      const result = await createAppointmentAction(
        booking({ barberId: seed.barbers[0]?.id ?? BARBER_A1 }),
      );
      expect(result.status).toBe("error");
      expect(db.getRows("appointments")).toHaveLength(0);
    }
  });

  it("rejeita serviço não associado ao profissional", async () => {
    const db = setupDb(
      baseSeed({
        services: [
          serviceRow({ id: SERVICE_A1, name: "Corte" }),
          serviceRow({ id: SERVICE_A2, name: "Barba" }),
        ],
        barber_services: [linkRow({ service_id: SERVICE_A1 })],
      }),
    );

    const result = await createAppointmentAction(
      booking({ serviceId: SERVICE_A2 }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("não realiza o serviço");
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("rejeita horário fora do funcionamento da barbearia", async () => {
    const db = setupDb(
      baseSeed({
        business_hours: [
          businessHourRow({ opens_at: "09:00:00", closes_at: "10:00:00" }),
        ],
      }),
    );

    const result = await createAppointmentAction(booking({ time: "14:00" }));

    expect(result.status).toBe("error");
    expect(result.message).toContain("não está mais disponível");
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("rejeita horário fora da jornada individual", async () => {
    const db = setupDb(
      baseSeed({
        barber_working_hours: [
          workingHourRow({ starts_at: "09:00:00", ends_at: "10:00:00" }),
        ],
      }),
    );

    const result = await createAppointmentAction(booking({ time: "14:00" }));

    expect(result.status).toBe("error");
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("rejeita horário durante bloqueio", async () => {
    const db = setupDb(
      baseSeed({
        blocked_slots: [
          {
            id: "block-1",
            barbershop_id: SHOP_A,
            barber_id: null,
            starts_at: at(DATE, "13:30"),
            ends_at: at(DATE, "15:00"),
            reason: "Reunião",
          },
        ],
      }),
    );

    const result = await createAppointmentAction(booking());

    expect(result.status).toBe("error");
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("rejeita data passada", async () => {
    const pastDate = "2020-06-01";
    const db = setupDb(
      baseSeed({
        business_hours: [
          businessHourRow({
            id: "business-past",
            weekday: 1,
          }),
        ],
        appointments: [],
      }),
    );

    const result = await createAppointmentAction(
      booking({ date: pastDate }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("já passou");
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("rejeita serviço cuja duração não cabe na janela contínua", async () => {
    const db = setupDb(
      baseSeed({
        services: [serviceRow({ duration_minutes: 90 })],
        business_hours: [
          businessHourRow({ opens_at: "09:00:00", closes_at: "10:00:00" }),
        ],
        barber_working_hours: [
          workingHourRow({ starts_at: "09:00:00", ends_at: "10:00:00" }),
        ],
      }),
    );

    const result = await createAppointmentAction(booking({ time: "09:00" }));

    expect(result.status).toBe("error");
    expect(result.message).toContain("duração");
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("rejeita sobreposição com agendamento ativo", async () => {
    const db = setupDb(
      baseSeed({
        appointments: [appointmentRow()],
      }),
    );

    const result = await createAppointmentAction(booking());

    expect(result.status).toBe("error");
    expect(db.getRows("appointments")).toHaveLength(1);
  });

  it("permite o horário quando o agendamento anterior foi cancelado", async () => {
    const db = setupDb(
      baseSeed({
        appointments: [appointmentRow({ status: "cancelled" })],
      }),
    );

    const result = await createAppointmentAction(booking());

    expect(result.status).toBe("success");
    expect(db.getRows("appointments")).toHaveLength(2);
  });

  it("recusa a segunda tentativa para o mesmo horário", async () => {
    const db = setupDb();

    const first = await createAppointmentAction(booking());
    const second = await createAppointmentAction(booking());

    expect(first.status).toBe("success");
    expect(second.status).toBe("error");
    expect(db.getRows("appointments")).toHaveLength(1);
  });

  it("traduz a exclusão do banco quando a corrida acontece após a consulta", async () => {
    const db = setupDb();
    db.failNext("appointments", "23P01", "insert");

    const result = await createAppointmentAction(booking());

    expect(result.status).toBe("error");
    expect(result.message).toContain("acabou de ser reservado");
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("permite criação por staff dentro da própria barbearia", async () => {
    const db = setupDb();
    state.context = makeContext("staff");

    const result = await createAppointmentAction(booking());

    expect(result.status).toBe("success");
    expect(db.getRows("appointments")[0]?.barbershop_id).toBe(SHOP_A);
  });

  it("bloqueia criação sem sessão ativa", async () => {
    const db = setupDb();
    state.context = null;

    const result = await createAppointmentAction(booking());

    expect(result.status).toBe("error");
    expect(result.message).toContain("sessão");
    expect(db.getRows("appointments")).toHaveLength(0);
  });

  it("valida observações acima do limite antes de gravar", async () => {
    const db = setupDb();

    const result = await createAppointmentAction(
      booking({ notes: "x".repeat(2001) }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.notes).toBeTruthy();
    expect(db.getRows("appointments")).toHaveLength(0);
  });
});

describe("consulta de disponibilidade e clientes", () => {
  it("retorna os horários livres reais do profissional", async () => {
    setupDb();

    const result = await getAppointmentAvailabilityAction({
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: DATE,
    });

    expect(result.status).toBe("success");

    if (result.status === "success") {
      expect(result.availability.slots[0]?.time).toBe("09:00");
      expect(result.availability.slots).toContainEqual({
        time: "14:00",
        startsAt: at(DATE, "14:00"),
        endsAt: at(DATE, "14:30"),
      });
      expect(result.availability.reason).toBeNull();
    }
  });

  it("explica quando o dia não possui janela compatível", async () => {
    setupDb(
      baseSeed({
        services: [serviceRow({ duration_minutes: 120 })],
        business_hours: [
          businessHourRow({ opens_at: "09:00:00", closes_at: "10:00:00" }),
        ],
        barber_working_hours: [
          workingHourRow({ starts_at: "09:00:00", ends_at: "10:00:00" }),
        ],
      }),
    );

    const result = await getAppointmentAvailabilityAction({
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: DATE,
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.availability.slots).toEqual([]);
      expect(result.availability.reason).toContain("duração");
    }
  });

  it("não expõe serviço de outra barbearia na disponibilidade", async () => {
    setupDb(
      baseSeed({
        services: [serviceRow({ id: SERVICE_B1, barbershop_id: SHOP_B })],
      }),
    );

    const result = await getAppointmentAvailabilityAction({
      serviceId: SERVICE_B1,
      barberId: BARBER_A1,
      date: DATE,
    });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("Serviço não encontrado");
    }
  });

  it("pesquisa apenas clientes ativos da barbearia ativa", async () => {
    const db = setupDb(
      baseSeed({
        customers: [
          customerRow(),
          customerRow({
            id: CUSTOMER_A2,
            full_name: "Ana Arquivada",
            phone: "21999998888",
            email: "arquivada@example.com",
            is_active: false,
          }),
          customerRow({
            id: CUSTOMER_B1,
            barbershop_id: SHOP_B,
            full_name: "Ana de Outra Loja",
            phone: "31999998888",
            email: "outra@example.com",
          }),
        ],
      }),
    );

    const result = await searchAppointmentCustomersAction("Ana");

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.customers).toHaveLength(1);
      expect(result.customers[0]?.id).toBe(CUSTOMER_A1);
    }
    expect(db.getRows("customers")).toHaveLength(3);
  });
});

describe("transições de status", () => {
  it("confirma um agendamento agendado", async () => {
    const db = setupDb(baseSeed({ appointments: [appointmentRow()] }));

    const result = await confirmAppointmentAction(APPOINTMENT_A1);

    expect(result.status).toBe("success");
    expect(db.getRows("appointments")[0]?.status).toBe("confirmed");
  });

  it("inicia um atendimento confirmado", async () => {
    const db = setupDb(
      baseSeed({ appointments: [appointmentRow({ status: "confirmed" })] }),
    );

    const result = await startAppointmentAction(APPOINTMENT_A1);

    expect(result.status).toBe("success");
    expect(db.getRows("appointments")[0]?.status).toBe("in_progress");
  });

  it("conclui um atendimento em andamento", async () => {
    const db = setupDb(
      baseSeed({ appointments: [appointmentRow({ status: "in_progress" })] }),
    );

    const result = await completeAppointmentAction(APPOINTMENT_A1);

    expect(result.status).toBe("success");
    expect(db.getRows("appointments")[0]?.status).toBe("completed");
  });

  it("registra ausência de um agendamento confirmado", async () => {
    const db = setupDb(
      baseSeed({ appointments: [appointmentRow({ status: "confirmed" })] }),
    );

    const result = await markAppointmentNoShowAction(APPOINTMENT_A1);

    expect(result.status).toBe("success");
    expect(db.getRows("appointments")[0]?.status).toBe("no_show");
  });

  it("cancela com motivo, preserva o histórico e libera o horário", async () => {
    const db = setupDb(baseSeed({ appointments: [appointmentRow()] }));

    const result = await cancelAppointmentAction(APPOINTMENT_A1, {
      reason: "Cliente pediu para remarcar",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("appointments")[0]).toMatchObject({
      status: "cancelled",
      cancel_reason: "Cliente pediu para remarcar",
    });

    const availability = await getAppointmentAvailabilityAction({
      serviceId: SERVICE_A1,
      barberId: BARBER_A1,
      date: DATE,
    });

    expect(availability.status).toBe("success");
    if (availability.status === "success") {
      expect(
        availability.availability.slots.some((slot) => slot.time === "14:00"),
      ).toBe(true);
    }
  });

  it("cancela com motivo vazio e grava null", async () => {
    const db = setupDb(baseSeed({ appointments: [appointmentRow()] }));
    state.context = makeContext("staff");

    const result = await cancelAppointmentAction(APPOINTMENT_A1, {
      reason: "   ",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("appointments")[0]).toMatchObject({
      status: "cancelled",
      cancel_reason: null,
    });
  });

  it("impede transições incompatíveis com o status atual", async () => {
    const db = setupDb(
      baseSeed({ appointments: [appointmentRow({ status: "cancelled" })] }),
    );

    const result = await confirmAppointmentAction(APPOINTMENT_A1);

    expect(result.status).toBe("error");
    expect(result.message).toContain("Não é possível");
    expect(db.getRows("appointments")[0]?.status).toBe("cancelled");
  });

  it("não altera agendamento de outra barbearia", async () => {
    const db = setupDb(
      baseSeed({
        appointments: [
          appointmentRow({
            id: APPOINTMENT_B1,
            barbershop_id: SHOP_B,
          }),
        ],
      }),
    );

    const result = await confirmAppointmentAction(APPOINTMENT_B1);

    expect(result.status).toBe("error");
    expect(result.message).toContain("não encontrado");
    expect(db.getRows("appointments")[0]?.status).toBe("scheduled");
  });
});

describe("reagendamento", () => {
  it("move o agendamento preservando serviço, profissional e status", async () => {
    const db = setupDb(
      baseSeed({ appointments: [appointmentRow({ status: "confirmed" })] }),
    );

    const result = await rescheduleAppointmentAction(APPOINTMENT_A1, {
      date: DATE,
      time: "15:00",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("appointments")[0]).toMatchObject({
      starts_at: at(DATE, "15:00"),
      ends_at: at(DATE, "15:30"),
      status: "confirmed",
      service_id: SERVICE_A1,
      barber_id: BARBER_A1,
    });
  });

  it("rejeita reagendamento para horário ocupado e preserva o registro", async () => {
    const db = setupDb(
      baseSeed({
        appointments: [
          appointmentRow(),
          appointmentRow({
            id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            starts_at: at(DATE, "15:00"),
            ends_at: at(DATE, "15:30"),
          }),
        ],
      }),
    );

    const result = await rescheduleAppointmentAction(APPOINTMENT_A1, {
      date: DATE,
      time: "15:00",
    });

    expect(result.status).toBe("error");
    expect(db.getRows("appointments")[0]).toMatchObject({
      starts_at: at(DATE, "14:00"),
      ends_at: at(DATE, "14:30"),
    });
  });

  it("não reagenda atendimento concluído", async () => {
    const db = setupDb(
      baseSeed({ appointments: [appointmentRow({ status: "completed" })] }),
    );

    const result = await rescheduleAppointmentAction(APPOINTMENT_A1, {
      date: DATE,
      time: "15:00",
    });

    expect(result.status).toBe("error");
    expect(db.getRows("appointments")[0]?.starts_at).toBe(at(DATE, "14:00"));
  });

  it("não reagenda agendamento de outra barbearia", async () => {
    const db = setupDb(
      baseSeed({
        appointments: [
          appointmentRow({
            id: APPOINTMENT_B1,
            barbershop_id: SHOP_B,
          }),
        ],
      }),
    );

    const result = await rescheduleAppointmentAction(APPOINTMENT_B1, {
      date: DATE,
      time: "15:00",
    });

    expect(result.status).toBe("error");
    expect(db.getRows("appointments")[0]?.starts_at).toBe(at(DATE, "14:00"));
  });

  it("traduz conflito de exclusão durante a atualização", async () => {
    const db = setupDb(
      baseSeed({ appointments: [appointmentRow({ status: "confirmed" })] }),
    );
    db.failNext("appointments", "23P01", "update");

    const result = await rescheduleAppointmentAction(APPOINTMENT_A1, {
      date: DATE,
      time: "15:00",
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("acabou de ser reservado");
  });
});
