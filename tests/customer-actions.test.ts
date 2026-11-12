import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase, type FakeRow } from "./helpers/fake-supabase";

const SHOP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER_A1 = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_A2 = "22222222-2222-4222-8222-222222222222";
const CUSTOMER_A3 = "33333333-3333-4333-8333-333333333333";
const CUSTOMER_B1 = "44444444-4444-4444-8444-444444444444";
const USER_A = "55555555-5555-4555-8555-555555555555";

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
  createCustomerAction,
  setCustomerActiveAction,
  updateCustomerAction,
} from "@/features/customers/actions";
import {
  getCustomerStats,
  getCustomersPage,
} from "@/features/dashboard/queries";

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

function setupDb(seed: Record<string, FakeRow[]> = {}): FakeSupabase {
  const fake = new FakeSupabase(seed);
  state.db = fake;
  return fake;
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
    created_at: "2026-11-03T12:00:00.000Z",
    updated_at: "2026-11-03T12:00:00.000Z",
    ...overrides,
  };
}

const validCustomer = {
  fullName: "Ana Souza",
  phone: "(11) 98765-4321",
  email: "ana@example.com",
  notes: "Prefere manhã",
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  state.context = makeContext("owner");
  state.db = new FakeSupabase();
});

describe("cadastro de clientes", () => {
  it("cria o cliente com o barbershop_id da sessão e normaliza os dados", async () => {
    const db = setupDb();

    const result = await createCustomerAction({
      fullName: "  Ana   Souza ",
      phone: "+55 (11) 98765-4321",
      email: " ANA@EXAMPLE.COM ",
      notes: " Prefere manhã ",
    });

    expect(result.status).toBe("success");
    const rows = db.getRows("customers");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      barbershop_id: SHOP_A,
      full_name: "Ana Souza",
      phone: "11987654321",
      email: "ana@example.com",
      notes: "Prefere manhã",
      is_active: true,
    });
    expect(rows[0]?.birth_date).toBeUndefined();
  });

  it("exige nome e telefone válidos", async () => {
    const db = setupDb();

    const result = await createCustomerAction({
      fullName: "",
      phone: "",
      email: "",
      notes: "",
    });

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.fullName).toBeTruthy();
    expect(result.fieldErrors?.phone).toBeTruthy();
    expect(db.getRows("customers")).toHaveLength(0);
  });

  it("rejeita telefone e e-mail inválidos", async () => {
    const db = setupDb();

    const result = await createCustomerAction({
      fullName: "Ana Souza",
      phone: "123",
      email: "sem-arroba",
      notes: "",
    });

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.phone).toBeTruthy();
    expect(result.fieldErrors?.email).toBeTruthy();
    expect(db.getRows("customers")).toHaveLength(0);
  });

  it("impede telefone duplicado na mesma barbearia mesmo com outra formatação", async () => {
    const db = setupDb({
      customers: [
        customerRow({
          id: CUSTOMER_A2,
          full_name: "Outra pessoa",
          phone: "(11) 98765-4321",
        }),
      ],
    });

    const result = await createCustomerAction(validCustomer);

    expect(result.status).toBe("error");
    expect(result.message).toContain("telefone");
    expect(result.fieldErrors?.phone).toBeTruthy();
    expect(db.getRows("customers")).toHaveLength(1);
  });

  it("impede e-mail duplicado sem diferenciar maiúsculas de minúsculas", async () => {
    const db = setupDb({
      customers: [
        customerRow({
          id: CUSTOMER_A2,
          full_name: "Outra pessoa",
          email: "ANA@EXAMPLE.COM",
        }),
      ],
    });

    const result = await createCustomerAction(validCustomer);

    expect(result.status).toBe("error");
    expect(result.message).toContain("e-mail");
    expect(result.fieldErrors?.email).toBeTruthy();
    expect(db.getRows("customers")).toHaveLength(1);
  });

  it("permite o mesmo telefone e e-mail em outra barbearia", async () => {
    const db = setupDb({
      customers: [
        customerRow({
          id: CUSTOMER_B1,
          barbershop_id: SHOP_B,
        }),
      ],
    });

    const result = await createCustomerAction(validCustomer);

    expect(result.status).toBe("success");
    expect(db.getRows("customers")).toHaveLength(2);
    expect(
      db.getRows("customers").filter((row) => row.barbershop_id === SHOP_A),
    ).toHaveLength(1);
  });

  it("bloqueia o cadastro sem sessão ativa", async () => {
    const db = setupDb();
    state.context = null;

    const result = await createCustomerAction(validCustomer);

    expect(result.status).toBe("error");
    expect(result.message).toContain("sessão");
    expect(db.getRows("customers")).toHaveLength(0);
  });

  it("permite que staff cadastre clientes, conforme a RLS operacional", async () => {
    const db = setupDb();
    state.context = makeContext("staff");

    const result = await createCustomerAction(validCustomer);

    expect(result.status).toBe("success");
    expect(db.getRows("customers")).toHaveLength(1);
    expect(db.getRows("customers")[0]?.barbershop_id).toBe(SHOP_A);
  });
});

describe("edição e arquivamento de clientes", () => {
  it("edita os dados do cliente da barbearia ativa sem alterar o tenant", async () => {
    const db = setupDb({
      customers: [
        customerRow({
          birth_date: "1990-01-01",
          created_at: "2026-10-01T12:00:00.000Z",
        }),
      ],
    });

    const result = await updateCustomerAction(CUSTOMER_A1, {
      fullName: "Ana Clara Souza",
      phone: "(11) 91234-5678",
      email: "ana.clara@example.com",
      notes: "Atualizado",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("customers")[0]).toMatchObject({
      barbershop_id: SHOP_A,
      full_name: "Ana Clara Souza",
      phone: "11912345678",
      email: "ana.clara@example.com",
      notes: "Atualizado",
      birth_date: "1990-01-01",
      created_at: "2026-10-01T12:00:00.000Z",
    });
  });

  it("não edita cliente de outra barbearia", async () => {
    const db = setupDb({
      customers: [
        customerRow({
          id: CUSTOMER_B1,
          barbershop_id: SHOP_B,
          full_name: "Cliente B",
        }),
      ],
    });

    const result = await updateCustomerAction(CUSTOMER_B1, validCustomer);

    expect(result.status).toBe("error");
    expect(result.message).toContain("não encontrado");
    expect(db.getRows("customers")[0]).toMatchObject({
      barbershop_id: SHOP_B,
      full_name: "Cliente B",
    });
  });

  it("ignora o próprio registro na checagem de duplicidade ao editar", async () => {
    const db = setupDb({ customers: [customerRow()] });

    const result = await updateCustomerAction(CUSTOMER_A1, {
      ...validCustomer,
      fullName: "Ana Souza Editada",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("customers")[0]?.full_name).toBe("Ana Souza Editada");
  });

  it("detecta duplicidade com outro cliente ao editar", async () => {
    const db = setupDb({
      customers: [
        customerRow(),
        customerRow({
          id: CUSTOMER_A2,
          full_name: "Outra pessoa",
          phone: "21988887777",
          email: "outra@example.com",
        }),
      ],
    });

    const result = await updateCustomerAction(CUSTOMER_A1, {
      ...validCustomer,
      phone: "(21) 98888-7777",
    });

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.phone).toBeTruthy();
    expect(db.getRows("customers")[0]?.phone).toBe("11987654321");
  });

  it("arquiva e reativa sem excluir o cadastro", async () => {
    const db = setupDb({ customers: [customerRow()] });

    const archived = await setCustomerActiveAction(CUSTOMER_A1, false);

    expect(archived.status).toBe("success");
    expect(db.getRows("customers")).toHaveLength(1);
    expect(db.getRows("customers")[0]?.is_active).toBe(false);

    const restored = await setCustomerActiveAction(CUSTOMER_A1, true);

    expect(restored.status).toBe("success");
    expect(db.getRows("customers")).toHaveLength(1);
    expect(db.getRows("customers")[0]?.is_active).toBe(true);
  });

  it("não arquiva cliente de outra barbearia", async () => {
    const db = setupDb({
      customers: [
        customerRow({
          id: CUSTOMER_B1,
          barbershop_id: SHOP_B,
        }),
      ],
    });

    const result = await setCustomerActiveAction(CUSTOMER_B1, false);

    expect(result.status).toBe("error");
    expect(db.getRows("customers")[0]?.is_active).toBe(true);
  });

  it("permite que staff edite clientes da barbearia ativa", async () => {
    const db = setupDb({ customers: [customerRow()] });
    state.context = makeContext("staff");

    const result = await updateCustomerAction(CUSTOMER_A1, {
      ...validCustomer,
      notes: "Atendimento preferencial",
    });

    expect(result.status).toBe("success");
    expect(db.getRows("customers")[0]?.notes).toBe("Atendimento preferencial");
  });
});

describe("listagem, busca e paginação de clientes", () => {
  function seedCustomers() {
    return setupDb({
      customers: [
        customerRow({
          id: CUSTOMER_A1,
          full_name: "Ana Souza",
          phone: "11987654321",
          email: "ana@example.com",
          created_at: "2026-11-03T12:00:00.000Z",
        }),
        customerRow({
          id: CUSTOMER_A2,
          full_name: "Bruno Lima",
          phone: "21988887777",
          email: "bruno@example.com",
          is_active: false,
          created_at: "2026-11-02T12:00:00.000Z",
        }),
        customerRow({
          id: CUSTOMER_A3,
          full_name: "Carla Mendes",
          phone: "31977776666",
          email: "carla@example.com",
          created_at: "2026-11-01T12:00:00.000Z",
        }),
        customerRow({
          id: CUSTOMER_B1,
          barbershop_id: SHOP_B,
          full_name: "Diana Outra",
          phone: "11987654321",
          email: "ana@example.com",
          created_at: "2026-11-04T12:00:00.000Z",
        }),
      ],
    });
  }

  it("lista apenas a barbearia ativa e pagina no servidor", async () => {
    seedCustomers();

    const firstPage = await getCustomersPage({
      barbershopId: SHOP_A,
      status: "all",
      pageSize: 2,
    });

    expect(firstPage.error).toBe(false);
    expect(firstPage.total).toBe(3);
    expect(firstPage.totalPages).toBe(2);
    expect(firstPage.rows).toHaveLength(2);
    expect(firstPage.rows.every((row) => row.id !== CUSTOMER_B1)).toBe(true);
    expect(firstPage.rows[0]?.full_name).toBe("Ana Souza");

    const secondPage = await getCustomersPage({
      barbershopId: SHOP_A,
      status: "all",
      page: 2,
      pageSize: 2,
    });

    expect(secondPage.rows).toHaveLength(1);
    expect(secondPage.page).toBe(2);
  });

  it("busca por nome dentro da barbearia ativa", async () => {
    seedCustomers();

    const result = await getCustomersPage({
      barbershopId: SHOP_A,
      search: "Ana",
      status: "all",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe(CUSTOMER_A1);
  });

  it("busca por telefone mesmo com formatação e sem vazar outro tenant", async () => {
    seedCustomers();

    const result = await getCustomersPage({
      barbershopId: SHOP_A,
      search: "(11) 98765-4321",
      status: "all",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe(CUSTOMER_A1);
  });

  it("busca por e-mail", async () => {
    seedCustomers();

    const result = await getCustomersPage({
      barbershopId: SHOP_A,
      search: "carla@",
      status: "all",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe(CUSTOMER_A3);
  });

  it("filtra ativos e arquivados", async () => {
    seedCustomers();

    const active = await getCustomersPage({
      barbershopId: SHOP_A,
      status: "active",
    });
    const archived = await getCustomersPage({
      barbershopId: SHOP_A,
      status: "archived",
    });

    expect(active.total).toBe(2);
    expect(active.rows.every((row) => row.is_active)).toBe(true);
    expect(archived.total).toBe(1);
    expect(archived.rows[0]?.id).toBe(CUSTOMER_A2);
  });

  it("calcula estatísticas somente da barbearia ativa", async () => {
    seedCustomers();

    const stats = await getCustomerStats(SHOP_A);

    expect(stats).toEqual({ active: 2, archived: 1, total: 3 });
  });

  it("sinaliza erro de consulta sem inventar registros", async () => {
    const db = seedCustomers();
    db.failNext("customers", "42501");

    const result = await getCustomersPage({
      barbershopId: SHOP_A,
      status: "all",
    });

    expect(result.error).toBe(true);
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
