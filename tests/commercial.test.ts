import { describe, expect, it } from "vitest";
import {
  commercialPlans,
  commercialWhatsApp,
  type Inquiry,
} from "@/features/marketing/commercial";

describe("consulta comercial", () => {
  const testNumber = "12025550123"; // Fictional NANP subscriber reserved for examples.
  it.each([
    ["basico", "Básico", "1 profissional"],
    ["profissional", "Profissional", "até 5 profissionais"],
    ["premium", "Premium", "até 10 profissionais"],
    ["geral", "LPS Agenda", "gestão da minha barbearia"],
  ] as const)(
    "gera texto público e codificado para %s",
    (kind, name, detail) => {
      const href = commercialWhatsApp(testNumber, kind)!;
      const url = new URL(href);
      expect(url.origin).toBe("https://wa.me");
      expect(url.pathname).toBe("/" + testNumber);
      expect([...url.searchParams.keys()]).toEqual(["text"]);
      const message = url.searchParams.get("text")!;
      expect(message).toContain(name);
      expect(message).toContain(detail);
      expect(message).not.toMatch(/@|https?:|\d{3}|R\$|token|CPF/i);
      expect(href).toContain("%C3");
    },
  );
  it.each([
    undefined,
    "",
    " ",
    "+12025550123",
    "12025550123 ",
    "12025550123\n",
    "0012025550123",
    "55123",
    "5500111111111",
    "999123456789",
    "https://example.test",
    "//example.test",
    "12025550123?text=alterado",
    "12025550123/extra",
  ])("rejeita configuração inválida %j", (number) => {
    expect(commercialWhatsApp(number, "geral")).toBeNull();
  });
  it("ignora mensagens ou destinos externos", () => {
    for (const kind of ["toString", "__proto__", "https://example.test"])
      expect(commercialWhatsApp(testNumber, kind as Inquiry)).toBeNull();
  });
  it("limita o catálogo aos três tamanhos de equipe sem preços", () => {
    expect(commercialPlans.map((p) => [p.name, p.limit])).toEqual([
      ["Básico", "1 profissional ativo"],
      ["Profissional", "Até 5 profissionais ativos"],
      ["Premium", "Até 10 profissionais ativos"],
    ]);
    expect(JSON.stringify(commercialPlans)).not.toMatch(
      /price|R\$|avançados|prioritári/i,
    );
    expect(commercialWhatsApp("5511998765432", "premium")).toContain(
      "https://wa.me/55",
    );
  });
});
