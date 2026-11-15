import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase, type FakeRow } from "./helpers/fake-supabase";

const SHOP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SERVICE_A1 = "11111111-1111-4111-8111-111111111111";
const SERVICE_A2 = "22222222-2222-4222-8222-222222222222";
const SERVICE_B1 = "33333333-3333-4333-8333-333333333333";
const BARBER_A1 = "44444444-4444-4444-8444-444444444444";
const BARBER_B1 = "55555555-5555-4555-8555-555555555555";
const APPOINTMENT_A1 = "66666666-6666-4666-8666-666666666666";
const PLAN_ID = "99999999-9999-4999-8999-999999999999";
const SUBSCRIPTION_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const BARBER_A2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

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
  createBarberAction,
  deleteBarberAction,
  setBarberActiveAction,
  updateBarberAction,
} from "@/features/barbers/actions";
import {
  createServiceAction,
  deleteServiceAction,
  setServiceActiveAction,
  updateServiceAction,
} from "@/features/services/actions";
import {
  normalizeServiceName,
  parsePriceToCents,
} from "@/lib/validation/services";

function makeContext(
  role: "owner" | "staff",
  shopId = SHOP_A,
  appMetadata: Record<string, unknown> = {},
) {
  return {
    user: { app_metadata: appMetadata },
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

function serviceRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SERVICE_A1,
    barbershop_id: SHOP_A,
    name: "Corte",
    description: "",
    duration_minutes: 30,
    price_cents: 4500,
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
    phone: null,
    bio: null,
    avatar_url: null,
    is_active: true,
    display_order: 0,
    ...overrides,
  };
}

function planRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: PLAN_ID,
    code: "basico",
    name: "Básico",
    description: "Entrada",
    price_cents: 4990,
    interval: "month",
    features: [],
    max_barbers: 1,
    is_active: true,
    currency: "BRL",
    trial_days: 7,
    ...overrides,
  };
}

function subscriptionRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SUBSCRIPTION_ID,
    barbershop_id: SHOP_A,
    plan_id: PLAN_ID,
    status: "active",
    created_at: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

const validService = {
  name: "Corte clássico",
  description: "Acabamento com tesoura.",
  price: "45,90",
  durationMinutes: 30,
  isActive: true,
};

const validBarber = {
  name: "Rafael",
  phone: "(11) 99999-9999",
  bio: "Especialista em degradê.",
  isActive: true,
  serviceIds: [SERVICE_A1],
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  state.context = makeContext("owner");
  state.db = new FakeSupabase();
});

describe("CRUD de serviços", () => {
  it("cadastra um serviço com preço convertido para centavos", async () => {
    const db = useDb();

    const result = await createServiceAction(validService);

    expect(result.status).toBe("success");
    const rows = db.getRows("services");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      barbershop_id: SHOP_A,
      name: "Corte clássico",
      duration_minutes: 30,
      price_cents: 4590,
      is_active: true,
    });
  });

  it("impede serviço com nome repetido, ignorando caixa e acentos", async () => {
    const db = useDb({
      services: [serviceRow({ name: "Corte" })],
    });

    const result = await createServiceAction({
      ...validService,
      name: "côrte",
    });

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.name?.[0]).toContain("Já existe");
    expect(db.getRows("services")).toHaveLength(1);
  });

  it("edita um serviço da barbearia ativa", async () => {
    const db = useDb({ services: [serviceRow()] });

    const result = await updateServiceAction(SERVICE_A1, {
      ...validService,
      name: "Corte premium",
      price: "59,90",
      durationMinutes: 45,
      isActive: false,
    });

    expect(result.status).toBe("success");
    expect(db.getRows("services")[0]).toMatchObject({
      name: "Corte premium",
      price_cents: 5990,
      duration_minutes: 45,
      is_active: false,
    });
  });

  it("exclui um serviço sem agendamentos", async () => {
    const db = useDb({ services: [serviceRow()] });

    const result = await deleteServiceAction(SERVICE_A1);

    expect(result.status).toBe("success");
    expect(db.getRows("services")).toHaveLength(0);
  });

  it("bloqueia a exclusão quando existe agendamento vinculado", async () => {
    const db = useDb({
      services: [serviceRow()],
      appointments: [
        {
          id: APPOINTMENT_A1,
          barbershop_id: SHOP_A,
          service_id: SERVICE_A1,
          barber_id: BARBER_A1,
          customer_id: "77777777-7777-4777-8777-777777777777",
          starts_at: "2026-11-11T12:00:00.000Z",
          ends_at: "2026-11-11T12:30:00.000Z",
          status: "scheduled",
        },
      ],
    });

    const result = await deleteServiceAction(SERVICE_A1);

    expect(result.status).toBe("error");
    expect(result.message).toContain("agendamentos");
    expect(db.getRows("services")).toHaveLength(1);
  });

  it("ativa e desativa um serviço", async () => {
    const db = useDb({ services: [serviceRow({ is_active: true })] });

    const result = await setServiceActiveAction(SERVICE_A1, false);

    expect(result.status).toBe("success");
    expect(db.getRows("services")[0].is_active).toBe(false);
  });

  it.each([
    ["preço negativo", { ...validService, price: "-10" }],
    ["preço inválido", { ...validService, price: "abc" }],
    ["preço acima do limite", { ...validService, price: "1000000,01" }],
    ["duração zero", { ...validService, durationMinutes: 0 }],
    ["duração fracionada", { ...validService, durationMinutes: 30.5 }],
    ["nome curto", { ...validService, name: "A" }],
  ])("rejeita %s sem gravar", async (_label, payload) => {
    const db = useDb();

    const result = await createServiceAction(payload);

    expect(result.status).toBe("error");
    expect(db.getRows("services")).toHaveLength(0);
  });

  it("não atualiza serviço de outra barbearia", async () => {
    const db = useDb({
      services: [serviceRow({ id: SERVICE_B1, barbershop_id: SHOP_B })],
    });

    const result = await updateServiceAction(SERVICE_B1, validService);

    expect(result.status).toBe("error");
    expect(result.message).toContain("não encontrado");
    expect(db.getRows("services")[0]).toMatchObject({
      barbershop_id: SHOP_B,
      name: "Corte",
    });
  });

  it("não exclui serviço de outra barbearia", async () => {
    const db = useDb({
      services: [serviceRow({ id: SERVICE_B1, barbershop_id: SHOP_B })],
    });

    const result = await deleteServiceAction(SERVICE_B1);

    expect(result.status).toBe("error");
    expect(db.getRows("services")).toHaveLength(1);
  });
});

describe("CRUD de profissionais", () => {
  it("cadastra profissional e associa os serviços da mesma barbearia", async () => {
    const db = useDb({
      services: [
        serviceRow({ id: SERVICE_A1, name: "Corte" }),
        serviceRow({ id: SERVICE_A2, name: "Barba" }),
      ],
    });

    const result = await createBarberAction({
      ...validBarber,
      serviceIds: [SERVICE_A1, SERVICE_A2],
    });

    expect(result.status).toBe("success");
    expect(db.getRows("barbers")).toHaveLength(1);

    const assignments = db.getRows("barber_services");
    expect(assignments).toHaveLength(2);
    expect(assignments.map((row) => row.service_id).sort()).toEqual(
      [SERVICE_A1, SERVICE_A2].sort(),
    );
    expect(assignments.every((row) => row.barbershop_id === SHOP_A)).toBe(true);
  });

  it("edita dados e substitui as associações de serviços", async () => {
    const db = useDb({
      services: [
        serviceRow({ id: SERVICE_A1, name: "Corte" }),
        serviceRow({ id: SERVICE_A2, name: "Barba" }),
      ],
      barbers: [barberRow()],
      barber_services: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          barber_id: BARBER_A1,
          service_id: SERVICE_A1,
          barbershop_id: SHOP_A,
        },
      ],
    });

    const result = await updateBarberAction(BARBER_A1, {
      ...validBarber,
      name: "Rafael Silva",
      serviceIds: [SERVICE_A2],
    });

    expect(result.status).toBe("success");
    expect(db.getRows("barbers")[0].name).toBe("Rafael Silva");

    const assignments = db.getRows("barber_services");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      barber_id: BARBER_A1,
      service_id: SERVICE_A2,
      barbershop_id: SHOP_A,
    });
  });

  it("remove associações duplicadas enviadas pelo formulário", async () => {
    const db = useDb({
      services: [serviceRow({ id: SERVICE_A1 })],
    });

    const result = await createBarberAction({
      ...validBarber,
      serviceIds: [SERVICE_A1, SERVICE_A1, SERVICE_A1],
    });

    expect(result.status).toBe("success");
    expect(db.getRows("barber_services")).toHaveLength(1);
  });

  it("impede associar serviço de outra barbearia", async () => {
    const db = useDb({
      services: [
        serviceRow({ id: SERVICE_A1, name: "Corte" }),
        serviceRow({
          id: SERVICE_B1,
          barbershop_id: SHOP_B,
          name: "Serviço externo",
        }),
      ],
    });

    const result = await createBarberAction({
      ...validBarber,
      serviceIds: [SERVICE_B1],
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("não pertencem");
    expect(db.getRows("barbers")).toHaveLength(0);
    expect(db.getRows("barber_services")).toHaveLength(0);
  });

  it("exclui profissional sem agendamentos", async () => {
    const db = useDb({ barbers: [barberRow()] });

    const result = await deleteBarberAction(BARBER_A1);

    expect(result.status).toBe("success");
    expect(db.getRows("barbers")).toHaveLength(0);
  });

  it("bloqueia a exclusão de profissional com agendamento", async () => {
    const db = useDb({
      barbers: [barberRow()],
      appointments: [
        {
          id: APPOINTMENT_A1,
          barbershop_id: SHOP_A,
          service_id: SERVICE_A1,
          barber_id: BARBER_A1,
          customer_id: "77777777-7777-4777-8777-777777777777",
          starts_at: "2026-11-11T12:00:00.000Z",
          ends_at: "2026-11-11T12:30:00.000Z",
          status: "scheduled",
        },
      ],
    });

    const result = await deleteBarberAction(BARBER_A1);

    expect(result.status).toBe("error");
    expect(result.message).toContain("agendamentos");
    expect(db.getRows("barbers")).toHaveLength(1);
  });

  it("ativa e desativa um profissional", async () => {
    const db = useDb({ barbers: [barberRow({ is_active: true })] });

    const result = await setBarberActiveAction(BARBER_A1, false);

    expect(result.status).toBe("success");
    expect(db.getRows("barbers")[0].is_active).toBe(false);
  });

  it("não edita profissional de outra barbearia", async () => {
    const db = useDb({
      services: [serviceRow({ id: SERVICE_A1 })],
      barbers: [barberRow({ id: BARBER_B1, barbershop_id: SHOP_B })],
    });

    const result = await updateBarberAction(BARBER_B1, validBarber);

    expect(result.status).toBe("error");
    expect(result.message).toContain("não encontrado");
    expect(db.getRows("barbers")[0].name).toBe("Rafael");
  });
});

describe("limites de profissionais por plano", () => {
  it("impede criar profissional ativo quando o plano atingiu o limite", async () => {
    const db = useDb({
      plans: [planRow({ max_barbers: 1 })],
      subscriptions: [subscriptionRow()],
      services: [serviceRow()],
      barbers: [barberRow()],
    });

    const result = await createBarberAction(validBarber);

    expect(result.status).toBe("error");
    expect(result.message).toContain("permite até 1");
    expect(db.getRows("barbers")).toHaveLength(1);
  });

  it("permite cadastrar profissional inativo mesmo com o limite cheio", async () => {
    const db = useDb({
      plans: [planRow({ max_barbers: 1 })],
      subscriptions: [subscriptionRow()],
      services: [serviceRow()],
      barbers: [barberRow()],
    });

    const result = await createBarberAction({
      ...validBarber,
      name: "Bruno",
      isActive: false,
    });

    expect(result.status).toBe("success");
    expect(db.getRows("barbers")).toHaveLength(2);
    expect(db.getRows("barbers")[1]?.is_active).toBe(false);
  });

  it("impede reativar profissional quando todas as vagas estão ocupadas", async () => {
    const db = useDb({
      plans: [planRow({ max_barbers: 1 })],
      subscriptions: [subscriptionRow()],
      barbers: [
        barberRow(),
        barberRow({ id: BARBER_A2, name: "Bruno", is_active: false }),
      ],
    });

    const result = await setBarberActiveAction(BARBER_A2, true);

    expect(result.status).toBe("error");
    expect(result.message).toContain("permite até 1");
    expect(
      db.getRows("barbers").find((row) => row.id === BARBER_A2)?.is_active,
    ).toBe(false);
  });

  it("impede editar um profissional inativo para ativo sem vaga", async () => {
    const db = useDb({
      plans: [planRow({ max_barbers: 1 })],
      subscriptions: [subscriptionRow()],
      services: [serviceRow()],
      barbers: [
        barberRow(),
        barberRow({ id: BARBER_A2, name: "Bruno", is_active: false }),
      ],
    });

    const result = await updateBarberAction(BARBER_A2, {
      ...validBarber,
      name: "Bruno",
      isActive: true,
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("permite até 1");
    expect(
      db.getRows("barbers").find((row) => row.id === BARBER_A2)?.is_active,
    ).toBe(false);
  });

  it("permite reativar quando o plano ainda tem vaga", async () => {
    const db = useDb({
      plans: [planRow({ name: "Profissional", max_barbers: 5 })],
      subscriptions: [subscriptionRow()],
      barbers: [
        barberRow(),
        barberRow({ id: BARBER_A2, name: "Bruno", is_active: false }),
      ],
    });

    const result = await setBarberActiveAction(BARBER_A2, true);

    expect(result.status).toBe("success");
    expect(
      db.getRows("barbers").find((row) => row.id === BARBER_A2)?.is_active,
    ).toBe(true);
  });

  it("ignora limite injetado no formulário e usa o plano do banco", async () => {
    const db = useDb({
      plans: [planRow({ max_barbers: 1 })],
      subscriptions: [subscriptionRow()],
      services: [serviceRow()],
      barbers: [barberRow()],
    });

    const result = await createBarberAction({
      ...validBarber,
      maxBarbers: 99,
      max_barbers: 99,
      planLimit: 99,
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("permite até 1");
    expect(db.getRows("barbers")).toHaveLength(1);
  });

  it("mantém a operação sem limite quando não há assinatura vigente", async () => {
    const db = useDb({
      services: [serviceRow()],
      barbers: [
        barberRow(),
        barberRow({ id: BARBER_A2, name: "Bruno" }),
      ],
    });

    const result = await createBarberAction({
      ...validBarber,
      name: "Carlos",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("barbers")).toHaveLength(3);
  });

  it("não bloqueia quando o plano define max_barbers nulo", async () => {
    const db = useDb({
      plans: [planRow({ max_barbers: null })],
      subscriptions: [subscriptionRow()],
      services: [serviceRow()],
      barbers: [barberRow()],
    });

    const result = await createBarberAction({
      ...validBarber,
      name: "Bruno",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("barbers")).toHaveLength(2);
  });
});

describe("permissões e isolamento", () => {
  it("bloqueia usuário não autenticado", async () => {
    const db = useDb();
    state.context = null;

    const result = await createServiceAction(validService);

    expect(result.status).toBe("error");
    expect(result.message).toContain("sessão expirou");
    expect(db.getRows("services")).toHaveLength(0);
  });

  it("bloqueia staff em mutações de catálogo", async () => {
    const db = useDb();
    state.context = makeContext("staff");

    const result = await createServiceAction(validService);

    expect(result.status).toBe("error");
    expect(result.message).toContain("Somente o proprietário");
    expect(db.getRows("services")).toHaveLength(0);
  });

  it("bloqueia staff em mutações de equipe", async () => {
    const db = useDb({
      services: [serviceRow({ id: SERVICE_A1 })],
    });
    state.context = makeContext("staff");

    const result = await createBarberAction(validBarber);

    expect(result.status).toBe("error");
    expect(db.getRows("barbers")).toHaveLength(0);
  });

  it("permite administrador da plataforma mesmo com papel staff", async () => {
    const db = useDb();
    state.context = makeContext("staff", SHOP_A, {
      lps_role: "platform_admin",
    });

    const result = await createServiceAction(validService);

    expect(result.status).toBe("success");
    expect(db.getRows("services")).toHaveLength(1);
  });

  it("remove associações apenas dentro da barbearia ativa", async () => {
    const db = useDb({
      services: [
        serviceRow({ id: SERVICE_A1, name: "Corte" }),
        serviceRow({ id: SERVICE_A2, name: "Barba" }),
      ],
    });

    await createBarberAction({
      ...validBarber,
      serviceIds: [SERVICE_A1, SERVICE_A2],
    });

    expect(
      db
        .getRows("barber_services")
        .every((row) => row.barbershop_id === SHOP_A),
    ).toBe(true);
  });

  it("ignora barbershop_id injetado no cadastro de serviço", async () => {
    const db = useDb();

    const result = await createServiceAction({
      ...validService,
      barbershop_id: SHOP_B,
    });

    expect(result.status).toBe("success");
    expect(db.getRows("services")[0]).toMatchObject({
      barbershop_id: SHOP_A,
      name: "Corte clássico",
    });
  });

  it("ignora barbershop_id injetado no cadastro de profissional", async () => {
    const db = useDb({
      services: [serviceRow({ id: SERVICE_A1 })],
    });

    const result = await createBarberAction({
      ...validBarber,
      barbershop_id: SHOP_B,
    });

    expect(result.status).toBe("success");
    expect(db.getRows("barbers")[0].barbershop_id).toBe(SHOP_A);
    expect(
      db
        .getRows("barber_services")
        .every((row) => row.barbershop_id === SHOP_A),
    ).toBe(true);
  });

  it("não exclui profissional de outra barbearia", async () => {
    const db = useDb({
      barbers: [barberRow({ id: BARBER_B1, barbershop_id: SHOP_B })],
    });

    const result = await deleteBarberAction(BARBER_B1);

    expect(result.status).toBe("error");
    expect(result.message).toContain("não encontrado");
    expect(db.getRows("barbers")).toHaveLength(1);
  });
});

describe("normalização de preço e nome", () => {
  it.each([
    ["45", 4500],
    ["45,90", 4590],
    ["45.90", 4590],
    ["1.234,56", 123456],
    ["1.234", 123400],
    ["R$ 80,00", 8000],
    ["1000000", 100000000],
  ])("converte %s em %i centavos", (input, expected) => {
    expect(parsePriceToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "-10", "10,999", "1.23.4", "1000000,01"])(
    "rejeita o preço %s",
    (input) => {
      expect(parsePriceToCents(input)).toBeNull();
    },
  );

  it("normaliza nome para comparar duplicidade", () => {
    expect(normalizeServiceName("  Côrte   Clássico ")).toBe(
      "corte classico",
    );
  });
});
