import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getAsaasEnv, isAsaasConfigured } from "@/lib/env/server";

const originalEnv = {
  ASAAS_ENV: process.env.ASAAS_ENV,
  ASAAS_API_KEY: process.env.ASAAS_API_KEY,
  ASAAS_WEBHOOK_TOKEN: process.env.ASAAS_WEBHOOK_TOKEN,
};

const validToken = "8f3c2a1e-7b4d-4c9a-9e2f-1a6b8c0d3e5f";

function restore(name: keyof typeof originalEnv) {
  const value = originalEnv[name];

  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

beforeEach(() => {
  process.env.ASAAS_ENV = "sandbox";
  process.env.ASAAS_API_KEY = "sandbox-api-key";
  process.env.ASAAS_WEBHOOK_TOKEN = validToken;
});

afterEach(() => {
  restore("ASAAS_ENV");
  restore("ASAAS_API_KEY");
  restore("ASAAS_WEBHOOK_TOKEN");
});

describe("validação do ASAAS_WEBHOOK_TOKEN", () => {
  it("aceita token entre 32 e 255 caracteres sem espaços", () => {
    expect(getAsaasEnv().webhookToken).toBe(validToken);
    expect(isAsaasConfigured()).toBe(true);
  });

  it("rejeita token com menos de 32 caracteres", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = validToken.slice(0, 31);

    expect(isAsaasConfigured()).toBe(false);
    expect(() => getAsaasEnv()).toThrow("Asaas Sandbox");
  });

  it("rejeita token com mais de 255 caracteres", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = `${validToken}${"9f3a".repeat(60)}`;

    expect(isAsaasConfigured()).toBe(false);
  });

  it("rejeita token com espaço em branco", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = `${validToken.slice(0, 18)} ${validToken.slice(18)}`;

    expect(isAsaasConfigured()).toBe(false);
  });

  it("rejeita caracteres repetidos", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = "a".repeat(40);

    expect(isAsaasConfigured()).toBe(false);
  });

  it("rejeita sequências numéricas e alfanuméricas simples", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = "0123456789abcdef".repeat(3);
    expect(isAsaasConfigured()).toBe(false);

    process.env.ASAAS_WEBHOOK_TOKEN = "9876543210".repeat(4);
    expect(isAsaasConfigured()).toBe(false);

    process.env.ASAAS_WEBHOOK_TOKEN = "abc123".repeat(6);
    expect(isAsaasConfigured()).toBe(false);
  });

  it("continua exigindo ASAAS_ENV=sandbox", () => {
    process.env.ASAAS_ENV = "production";

    expect(isAsaasConfigured()).toBe(false);
  });
});
