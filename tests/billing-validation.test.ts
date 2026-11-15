import { describe, expect, it } from "vitest";

import {
  BILLING_TYPES,
  billingTypeFromValue,
  cancelSubscriptionSchema,
  isValidCnpj,
  isValidCpf,
  isValidDocument,
  maskDocument,
  onlyDigits,
  personTypeFromDocument,
  startSubscriptionSchema,
} from "@/lib/validation/billing";

const PLAN_ID = "11111111-1111-4111-8111-111111111111";

describe("documentos de cobrança", () => {
  it("valida CPF e CNPJ pelos dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);

    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000180")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);

    expect(isValidDocument("529.982.247-25")).toBe(true);
    expect(isValidDocument("11.222.333/0001-81")).toBe(true);
    expect(isValidDocument("123")).toBe(false);
  });

  it("deriva o tipo de pessoa e mascara o documento", () => {
    expect(personTypeFromDocument("52998224725")).toBe("individual");
    expect(personTypeFromDocument("11222333000181")).toBe("company");

    expect(maskDocument("52998224725")).toBe("***.***.***-25");
    expect(maskDocument("11222333000181")).toBe("**.***.***/****-81");
    expect(maskDocument("123")).toBe("—");
  });

  it("normaliza apenas dígitos e restringe boleto/Pix", () => {
    expect(onlyDigits("(11) 99999-9999")).toBe("11999999999");
    expect(BILLING_TYPES).toEqual(["boleto", "pix"]);
    expect(billingTypeFromValue("pix")).toBe("pix");
    expect(billingTypeFromValue("BOLETO")).toBeNull();
    expect(billingTypeFromValue("credit_card")).toBeNull();
  });
});

describe("contratação da assinatura", () => {
  const valid = {
    planId: PLAN_ID,
    billingType: "pix",
    holderName: "Maria da Silva",
    document: "529.982.247-25",
  };

  it("aceita boleto ou Pix e normaliza o documento", () => {
    const parsed = startSubscriptionSchema.safeParse(valid);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.document).toBe("52998224725");
    expect(parsed.success && parsed.data.billingType).toBe("pix");

    const boleto = startSubscriptionSchema.safeParse({
      ...valid,
      billingType: " BOLETO ",
    });

    expect(boleto.success).toBe(true);
    expect(boleto.success && boleto.data.billingType).toBe("boleto");
  });

  it("recusa cartão, plano inválido, nome curto e documento inválido", () => {
    expect(
      startSubscriptionSchema.safeParse({
        ...valid,
        billingType: "credit_card",
      }).success,
    ).toBe(false);

    expect(
      startSubscriptionSchema.safeParse({
        ...valid,
        planId: "plano",
      }).success,
    ).toBe(false);

    expect(
      startSubscriptionSchema.safeParse({
        ...valid,
        holderName: "M",
      }).success,
    ).toBe(false);

    expect(
      startSubscriptionSchema.safeParse({
        ...valid,
        document: "111.111.111-11",
      }).success,
    ).toBe(false);
  });

  it("não aceita campos de cartão no contrato de entrada", () => {
    const parsed = startSubscriptionSchema.safeParse({
      ...valid,
      creditCardNumber: "4111111111111111",
      cvv: "123",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && "creditCardNumber" in parsed.data).toBe(false);
    expect(parsed.success && "cvv" in parsed.data).toBe(false);
  });

  it("descarta preço, limite e trial enviados pelo frontend", () => {
    const parsed = startSubscriptionSchema.safeParse({
      ...valid,
      price_cents: 100,
      max_barbers: 99,
      trial_days: 365,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && "price_cents" in parsed.data).toBe(false);
    expect(parsed.success && "max_barbers" in parsed.data).toBe(false);
    expect(parsed.success && "trial_days" in parsed.data).toBe(false);
  });
});

describe("cancelamento da assinatura", () => {
  it("aceita motivo opcional, remove espaços e limita a 500 caracteres", () => {
    const empty = cancelSubscriptionSchema.safeParse({});
    const trimmed = cancelSubscriptionSchema.safeParse({
      reason: "  vou pausar o negócio  ",
    });

    expect(empty.success).toBe(true);
    expect(empty.success && empty.data.reason).toBe("");
    expect(trimmed.success).toBe(true);
    expect(trimmed.success && trimmed.data.reason).toBe("vou pausar o negócio");

    expect(
      cancelSubscriptionSchema.safeParse({ reason: "x".repeat(501) }).success,
    ).toBe(false);
    expect(
      cancelSubscriptionSchema.safeParse({ reason: "x".repeat(500) }).success,
    ).toBe(true);
  });
});
