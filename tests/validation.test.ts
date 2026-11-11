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
