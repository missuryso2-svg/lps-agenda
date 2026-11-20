import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";
import { operation, period, money } from "@/features/admin-billing/validation";
import { OperationForm } from "@/features/admin-billing/operation-form";

vi.mock("@/features/admin-billing/actions", () => ({
  submitFinancialOperation: vi.fn(),
}));
const id = "611eddb3-16a8-4588-a89e-b571a9c41a67";
const pix = {
  kind: "pix",
  op: id,
  shop: id,
  contract: id,
  invoice: id,
  amount: "43,21",
  credit: "2026-01-01T10:02",
  reference: "",
  checked: true,
  confirmed: true,
};

describe("entrada administrativa de Pix", () => {
  it.each([
    ["0,01", 1],
    ["43,2", 4320],
    ["43,21", 4321],
    ["21474836,47", 2147483647],
  ])("converte %s em centavos", (amount, expected) => {
    expect(operation.parse({ ...pix, amount })).toMatchObject({
      amount: expected,
      credit: "2026-01-01T10:02:00Z",
    });
  });
  it.each(["", "0", "1e2", "1.01", "1.000,10", "1,001", "-1", "21474836,48"])(
    "recusa valor inválido %s",
    (amount) => {
      expect(operation.safeParse({ ...pix, amount }).success).toBe(false);
    },
  );
  it.each([
    { checked: false },
    { checked: "on" },
    { confirmed: false },
    { op: "1" },
    { credit: "2026-02-30T12:00" },
  ])("recusa confirmação incompleta", (change) => {
    expect(operation.safeParse({ ...pix, ...change }).success).toBe(false);
  });
  it("mostra BRL e competência civil", () => {
    expect(money(4321)).toContain("43,21");
    expect(period("2026-01-01")).toBe("01/2026");
  });
  it("renderiza declaração obrigatória inicialmente desmarcada, revisão antes da confirmação", () => {
    const html = renderToStaticMarkup(
      createElement(OperationForm, {
        kind: "pix",
        actor: id,
        title: "Conferir Pix",
        ids: { invoice: id },
        context: {},
        fields: [
          { type: "checkbox", name: "checked", label: "Conferi o extrato" },
        ],
      }),
    );
    expect(html).toMatch(/type="checkbox"[^>]*required/);
    expect(html).not.toMatch(/ checked(?:=|\s|>)/);
    expect(html).toContain("Revisar dados");
    expect(html).not.toContain("Confirmar operação");
  });
});
