import { describe, expect, it } from "vitest";

import {
  loginSchema,
  passwordSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import {
  createBarbershopSchema,
  slugSchema,
  updateBarbershopSchema,
} from "@/lib/validation/barbershop";
import {
  customerActiveSchema,
  customerFormSchema,
  customerIdSchema,
  isValidBrazilianPhone,
  normalizePhoneDigits,
  phoneLookupVariants,
} from "@/lib/validation/customers";
import {
  blockedSlotFormSchema,
  timeToMinutes,
  WEEKDAYS,
  weeklyBusinessHoursSchema,
} from "@/lib/validation/schedule";
import {
  appointmentFormSchema,
  availabilityQuerySchema,
  cancelAppointmentSchema,
  customerSearchQuerySchema,
  rescheduleAppointmentSchema,
} from "@/lib/validation/appointments";
import {
  publicAvailabilityQuerySchema,
  publicBookingSchema,
  publicCancelSchema,
  publicReservationLookupSchema,
  publicTokenSchema,
} from "@/lib/validation/public-booking";

describe("validação de autenticação", () => {
  it("aceita um login com e-mail e senha preenchidos", () => {
    const result = loginSchema.safeParse({
      email: "  pessoa@exemplo.com ",
      password: "senha123",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("pessoa@exemplo.com");
    }
  });

  it("rejeita e-mail inválido", () => {
    const result = loginSchema.safeParse({
      email: "sem-arroba",
      password: "senha123",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("e-mail válido");
    }
  });

  it("exige letra e número na senha", () => {
    expect(passwordSchema.safeParse("apenasletras").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
    expect(passwordSchema.safeParse("senha123").success).toBe(true);
  });

  it("rejeita cadastro com confirmação divergente", () => {
    const result = signUpSchema.safeParse({
      fullName: "Pessoa Exemplo",
      email: "pessoa@exemplo.com",
      password: "senha123",
      confirmPassword: "senha124",
      acceptTerms: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("senhas não conferem"),
        ),
      ).toBe(true);
    }
  });

  it("exige aceite dos termos no cadastro", () => {
    const result = signUpSchema.safeParse({
      fullName: "Pessoa Exemplo",
      email: "pessoa@exemplo.com",
      password: "senha123",
      confirmPassword: "senha123",
      acceptTerms: false,
    });

    expect(result.success).toBe(false);
  });

  it("valida a redefinição de senha", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "novaSenha1",
        confirmPassword: "novaSenha1",
      }).success,
    ).toBe(true);

    expect(
      resetPasswordSchema.safeParse({
        password: "novaSenha1",
        confirmPassword: "outraSenha1",
      }).success,
    ).toBe(false);
  });
});

describe("validação de barbearia", () => {
  it("normaliza o slug para minúsculas", () => {
    const result = createBarbershopSchema.safeParse({
      name: "Barbearia Aurora",
      slug: "Barbearia-Aurora",
      phone: "",
      timezone: "America/Sao_Paulo",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe("barbearia-aurora");
    }
  });

  it.each(["ab", "-aurora", "aurora-", "aurora--corte", "aurora corte"])(
    "rejeita o identificador %s",
    (slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    },
  );

  it("normaliza a sigla do estado para maiúsculas", () => {
    const result = updateBarbershopSchema.safeParse({
      name: "Barbearia Aurora",
      description: "Uma barbearia de bairro.",
      phone: "(11) 99999-9999",
      city: "São Paulo",
      state: "sp",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.state).toBe("SP");
    }
  });

  it("rejeita descrição acima de 1000 caracteres", () => {
    const result = updateBarbershopSchema.safeParse({
      name: "Barbearia Aurora",
      description: "a".repeat(1001),
      phone: "",
      city: "",
      state: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("validação de horários", () => {
  const week = WEEKDAYS.map((weekday) => ({
    weekday,
    isActive: weekday !== 0,
    opensAt: "09:00",
    closesAt: "18:00",
  }));

  it("aceita os sete dias com domingo fechado", () => {
    expect(weeklyBusinessHoursSchema.safeParse({ days: week }).success).toBe(
      true,
    );
  });

  it("rejeita fechamento anterior à abertura", () => {
    const days = week.map((day) => ({
      ...day,
      opensAt: "18:00",
      closesAt: "09:00",
    }));

    expect(weeklyBusinessHoursSchema.safeParse({ days }).success).toBe(false);
  });

  it("rejeita dias repetidos ou ausentes", () => {
    const duplicated = week.map((day, index) => ({
      ...day,
      weekday: index === 0 ? 1 : day.weekday,
    }));

    expect(
      weeklyBusinessHoursSchema.safeParse({ days: duplicated }).success,
    ).toBe(false);
    expect(
      weeklyBusinessHoursSchema.safeParse({ days: week.slice(0, 6) }).success,
    ).toBe(false);
  });

  it("rejeita horário com formato inválido", () => {
    const days = week.map((day) => ({
      ...day,
      opensAt: "9:00",
    }));

    expect(weeklyBusinessHoursSchema.safeParse({ days }).success).toBe(false);
  });

  it("valida bloqueio por intervalo", () => {
    expect(
      blockedSlotFormSchema.safeParse({
        barberId: "",
        date: "2026-11-20",
        allDay: false,
        startsAt: "09:00",
        endsAt: "12:00",
        reason: "",
      }).success,
    ).toBe(true);

    expect(
      blockedSlotFormSchema.safeParse({
        barberId: "",
        date: "2026-11-20",
        allDay: false,
        startsAt: "12:00",
        endsAt: "09:00",
        reason: "",
      }).success,
    ).toBe(false);
  });

  it("aceita bloqueio de dia inteiro sem validar os horários", () => {
    expect(
      blockedSlotFormSchema.safeParse({
        barberId: "",
        date: "2026-11-20",
        allDay: true,
        startsAt: "",
        endsAt: "",
        reason: "Férias",
      }).success,
    ).toBe(true);
  });

  it("rejeita data impossível e motivo acima do limite", () => {
    expect(
      blockedSlotFormSchema.safeParse({
        barberId: "",
        date: "2026-02-30",
        allDay: true,
        startsAt: "",
        endsAt: "",
        reason: "",
      }).success,
    ).toBe(false);

    expect(
      blockedSlotFormSchema.safeParse({
        barberId: "",
        date: "2026-11-20",
        allDay: true,
        startsAt: "",
        endsAt: "",
        reason: "a".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("converte horários com segundos em minutos", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("09:30:00")).toBe(570);
    expect(timeToMinutes("24:00")).toBeNaN();
  });
});

describe("validação de clientes", () => {
  const validCustomer = {
    fullName: "  Ana   Souza ",
    phone: "+55 (11) 98765-4321",
    email: " ANA@EXEMPLO.COM ",
    notes: " Prefere atendimento pela manhã. ",
  };

  it("normaliza nome, telefone, e-mail e observações", () => {
    const result = customerFormSchema.safeParse(validCustomer);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        fullName: "Ana Souza",
        phone: "11987654321",
        email: "ana@exemplo.com",
        notes: "Prefere atendimento pela manhã.",
      });
    }
  });

  it("aceita telefone fixo e celular com DDD", () => {
    expect(isValidBrazilianPhone("(11) 3456-7890")).toBe(true);
    expect(isValidBrazilianPhone("+55 21 99876-5432")).toBe(true);
    expect(isValidBrazilianPhone("11987654321")).toBe(true);
  });

  it.each([
    "",
    "123",
    "0800 123 4567",
    "(00) 98765-4321",
    "(10) 98765-4321",
    "(11) 18765-4321",
    "telefone",
  ])("rejeita o telefone %s", (phone) => {
    const result = customerFormSchema.safeParse({
      ...validCustomer,
      phone,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("telefone");
    }
  });

  it("remove o código do país e a formatação do telefone", () => {
    expect(normalizePhoneDigits("+55 (11) 98765-4321")).toBe("11987654321");
    expect(normalizePhoneDigits("55 11 98765 4321")).toBe("11987654321");
    expect(normalizePhoneDigits("(11) 98765-4321")).toBe("11987654321");
  });

  it("gera variações formatadas para detectar duplicidade legada", () => {
    const variants = phoneLookupVariants("(11) 98765-4321");

    expect(variants).toContain("11987654321");
    expect(variants).toContain("5511987654321");
    expect(variants).toContain("+5511987654321");
    expect(variants).toContain("(11) 98765-4321");
    expect(variants).toContain("11 98765-4321");
    expect(variants).toContain("98765-4321");
    expect(phoneLookupVariants("")).toEqual([]);
  });

  it("exige nome com pelo menos dois caracteres", () => {
    const result = customerFormSchema.safeParse({
      ...validCustomer,
      fullName: " A ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("nome completo");
    }
  });

  it("rejeita nome acima de 120 caracteres", () => {
    expect(
      customerFormSchema.safeParse({
        ...validCustomer,
        fullName: "a".repeat(121),
      }).success,
    ).toBe(false);
  });

  it("rejeita e-mail inválido quando informado", () => {
    expect(
      customerFormSchema.safeParse({
        ...validCustomer,
        email: "sem-arroba",
      }).success,
    ).toBe(false);
  });

  it("aceita e-mail vazio como opcional", () => {
    const result = customerFormSchema.safeParse({
      ...validCustomer,
      email: "   ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("");
    }
  });

  it("rejeita observações acima de 2000 caracteres", () => {
    expect(
      customerFormSchema.safeParse({
        ...validCustomer,
        notes: "a".repeat(2001),
      }).success,
    ).toBe(false);
  });

  it("rejeita identificador de cliente inválido", () => {
    expect(customerIdSchema.safeParse("nao-e-uuid").success).toBe(false);
    expect(
      customerIdSchema.safeParse("11111111-1111-4111-8111-111111111111")
        .success,
    ).toBe(true);
  });

  it("exige boolean no estado de arquivamento", () => {
    expect(customerActiveSchema.safeParse(true).success).toBe(true);
    expect(customerActiveSchema.safeParse("false").success).toBe(false);
  });
});

describe("validação de agendamentos", () => {
  const validAppointment = {
    customerId: "11111111-1111-4111-8111-111111111111",
    serviceId: "22222222-2222-4222-8222-222222222222",
    barberId: "33333333-3333-4333-8333-333333333333",
    date: " 2099-06-01 ",
    time: " 09:30 ",
    notes: "  Prefere máquina 2  ",
  };

  it("normaliza data, horário e observações do agendamento", () => {
    const result = appointmentFormSchema.safeParse(validAppointment);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        customerId: validAppointment.customerId,
        serviceId: validAppointment.serviceId,
        barberId: validAppointment.barberId,
        date: "2099-06-01",
        time: "09:30",
        notes: "Prefere máquina 2",
      });
    }
  });

  it("usa observações vazias como padrão", () => {
    const result = appointmentFormSchema.safeParse({
      ...validAppointment,
      notes: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("");
    }
  });

  it.each(["not-a-uuid", "", "11111111-1111-4111-8111"])(
    "rejeita identificador inválido %s",
    (customerId) => {
      expect(
        appointmentFormSchema.safeParse({
          ...validAppointment,
          customerId,
        }).success,
      ).toBe(false);
    },
  );

  it.each(["2026-02-30", "01/06/2099", "2099-6-1", ""])(
    "rejeita data inválida %s",
    (date) => {
      expect(
        appointmentFormSchema.safeParse({
          ...validAppointment,
          date,
        }).success,
      ).toBe(false);
    },
  );

  it.each(["24:00", "9:30", "09:60", ""])(
    "rejeita horário inválido %s",
    (time) => {
      expect(
        appointmentFormSchema.safeParse({
          ...validAppointment,
          time,
        }).success,
      ).toBe(false);
    },
  );

  it("rejeita observações acima de 2000 caracteres", () => {
    expect(
      appointmentFormSchema.safeParse({
        ...validAppointment,
        notes: "a".repeat(2001),
      }).success,
    ).toBe(false);
  });

  it("valida o reagendamento com data e horário obrigatórios", () => {
    expect(
      rescheduleAppointmentSchema.safeParse({
        date: "2099-06-02",
        time: "10:15",
      }).success,
    ).toBe(true);
    expect(
      rescheduleAppointmentSchema.safeParse({
        date: "2099-06-02",
      }).success,
    ).toBe(false);
  });

  it("aceita motivo de cancelamento vazio e limita a 500 caracteres", () => {
    const empty = cancelAppointmentSchema.safeParse({});
    expect(empty.success).toBe(true);
    if (empty.success) {
      expect(empty.data.reason).toBe("");
    }

    expect(
      cancelAppointmentSchema.safeParse({ reason: "   " }).success,
    ).toBe(true);
    expect(
      cancelAppointmentSchema.safeParse({ reason: "a".repeat(501) }).success,
    ).toBe(false);
  });

  it("valida a consulta de disponibilidade e o identificador excluído", () => {
    expect(
      availabilityQuerySchema.safeParse({
        serviceId: validAppointment.serviceId,
        barberId: validAppointment.barberId,
        date: "2099-06-01",
      }).success,
    ).toBe(true);

    expect(
      availabilityQuerySchema.safeParse({
        serviceId: validAppointment.serviceId,
        barberId: validAppointment.barberId,
        date: "2099-06-01",
        excludeAppointmentId: "não-é-uuid",
      }).success,
    ).toBe(false);
  });

  it("limita a busca de clientes a 80 caracteres", () => {
    expect(customerSearchQuerySchema.safeParse("  Ana  ").success).toBe(true);
    expect(customerSearchQuerySchema.safeParse("a".repeat(81)).success).toBe(
      false,
    );
  });
});

describe("validação do agendamento público", () => {
  const validPublicBooking = {
    slug: "barbearia-teste",
    serviceId: "22222222-2222-4222-8222-222222222222",
    barberId: "33333333-3333-4333-8333-333333333333",
    date: " 2099-06-01 ",
    time: " 14:30 ",
    fullName: "  Ana   Souza ",
    phone: "+55 (11) 98765-4321",
    email: " ANA@EXEMPLO.COM ",
  };

  it("normaliza nome, telefone, e-mail, data e horário", () => {
    const result = publicBookingSchema.safeParse(validPublicBooking);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        slug: "barbearia-teste",
        serviceId: validPublicBooking.serviceId,
        barberId: validPublicBooking.barberId,
        date: "2099-06-01",
        time: "14:30",
        fullName: "Ana Souza",
        phone: "11987654321",
        email: "ana@exemplo.com",
      });
    }
  });

  it("aceita e-mail vazio como opcional e remove campos desconhecidos", () => {
    const result = publicBookingSchema.safeParse({
      ...validPublicBooking,
      email: "   ",
      barbershopId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      priceCents: 1,
      durationMinutes: 600,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("");
      expect(result.data).not.toHaveProperty("barbershopId");
      expect(result.data).not.toHaveProperty("priceCents");
      expect(result.data).not.toHaveProperty("durationMinutes");
    }
  });

  it.each([
    { slug: "ab" },
    { slug: "barbearia aurora" },
    { serviceId: "nao-e-uuid" },
    { barberId: "" },
    { date: "2026-02-30" },
    { date: "01/06/2099" },
    { time: "24:00" },
    { time: "9:30" },
    { fullName: " A " },
    { phone: "123" },
    { phone: "(11) 18765-4321" },
    { email: "sem-arroba" },
    { fullName: "a".repeat(121) },
  ])("rejeita dados inválidos: %o", (override) => {
    expect(
      publicBookingSchema.safeParse({
        ...validPublicBooking,
        ...override,
      }).success,
    ).toBe(false);
  });

  it("valida a consulta pública de disponibilidade", () => {
    expect(
      publicAvailabilityQuerySchema.safeParse({
        slug: "barbearia-teste",
        serviceId: validPublicBooking.serviceId,
        barberId: validPublicBooking.barberId,
        date: "2099-06-01",
      }).success,
    ).toBe(true);

    expect(
      publicAvailabilityQuerySchema.safeParse({
        slug: "barbearia-teste",
        serviceId: validPublicBooking.serviceId,
        barberId: validPublicBooking.barberId,
        date: "",
      }).success,
    ).toBe(false);
  });

  it("aceita apenas UUID na consulta e no cancelamento por token", () => {
    const token = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";

    expect(publicTokenSchema.safeParse(token).success).toBe(true);
    expect(publicTokenSchema.safeParse("token-invalido").success).toBe(false);
    expect(
      publicReservationLookupSchema.safeParse({
        slug: "barbearia-teste",
        token,
      }).success,
    ).toBe(true);
    expect(
      publicCancelSchema.safeParse({
        slug: "barbearia-teste",
        token: "123",
      }).success,
    ).toBe(false);
  });
});
