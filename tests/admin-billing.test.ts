import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";
import {
  canIssueManualInvoice,
  manualAgreementEligibility,
  operation,
  period,
  money,
} from "@/features/admin-billing/validation";
import { AgreementForm } from "@/features/admin-billing/forms";
import { Shops } from "@/features/admin-billing/lists";
import type { Shop } from "@/features/admin-billing/data";
import { OperationForm } from "@/features/admin-billing/operation-form";

vi.mock("@/features/admin-billing/actions", () => ({
  submitFinancialOperation: vi.fn(),
}));
vi.mock("server-only", () => ({}));
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

const shopState = {
  origin: "none",
  contract: null,
  status: null,
  trial_end: null,
  current_period_end: null,
  suspended: false,
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

describe("elegibilidade de contratos manuais", () => {
  it("permite o primeiro contrato de uma barbearia realmente sem assinatura", () => {
    expect(manualAgreementEligibility(shopState).eligible).toBe(true);
    expect(manualAgreementEligibility(shopState).message).toBe(
      "Nenhuma assinatura cadastrada.",
    );
  });

  it.each(["expired", "canceled"])(
    "permite conversão de teste encerrado (%s)",
    (status) => {
      expect(
        manualAgreementEligibility({
          ...shopState,
          origin: "trial",
          status,
          trial_end: "2026-01-01T00:00:00.000Z",
        }, Date.parse("2026-02-01T00:00:00.000Z")).eligible,
      ).toBe(true);
    },
  );

  it("não encerra nem converte um teste ainda vigente", () => {
    const result = manualAgreementEligibility({
      ...shopState,
      origin: "trial",
      status: "trialing",
      trial_end: "2026-12-01T00:00:00.000Z",
    }, Date.parse("2026-11-23T00:00:00.000Z"));

    expect(result.eligible).toBe(false);
    expect(result.message).toContain("não será encerrado");
  });

  it("não cria duplicata para contrato manual pendente", () => {
    const result = manualAgreementEligibility({
      ...shopState,
      origin: "manual",
      contract: id,
      status: "pending",
    });
    expect(result.eligible).toBe(false);
    expect(result.message).toContain("contrato pendente");
    expect(result.message).toContain("Aguardando pagamento");
  });

  it.each(["active", "past_due"])(
    "não cria duplicata para contrato manual %s",
    (status) => {
      const result = manualAgreementEligibility({
        ...shopState,
        origin: "manual",
        contract: id,
        status,
      });
      expect(result.eligible).toBe(false);
      expect(result.message).toBe("Esta barbearia já possui um contrato vigente.");
    },
  );

  it("permite nova contratação após contrato manual cancelado, sujeita à validação do banco", () => {
    const result = manualAgreementEligibility({
      ...shopState,
      origin: "manual",
      contract: id,
      status: "canceled",
      current_period_end: "2026-12-01T00:00:00.000Z",
    }, Date.parse("2026-11-23T00:00:00.000Z"));
    expect(result.eligible).toBe(true);
    expect(result.message).toContain("validará o início da nova cobertura");
  });

  it("bloqueia origem Asaas, conciliação e concessão suspensa", () => {
    expect(
      manualAgreementEligibility({ ...shopState, origin: "asaas" }).message,
    ).toContain("conciliação");
    expect(
      manualAgreementEligibility({ ...shopState, origin: "reconcile" }).eligible,
    ).toBe(false);
    expect(
      manualAgreementEligibility({
        ...shopState,
        origin: "manual",
        status: "active",
        suspended: true,
      }).eligible,
    ).toBe(false);
  });

  it("emite mensalidade apenas depois do início da cobertura", () => {
    const now = Date.parse("2026-11-23T12:00:00.000Z");
    const pending = {
      ...shopState,
      origin: "manual",
      contract: id,
      status: "pending",
      coverage_start: "2026-11-23T12:01:00.000Z",
      current_period_start: "2026-11-23T12:01:00.000Z",
    };
    expect(canIssueManualInvoice(pending, now)).toBe(false);
    expect(
      canIssueManualInvoice({
        ...pending,
        coverage_start: "2026-11-23T11:59:00.000Z",
      }, now),
    ).toBe(true);
  });
});

describe("formulário de aplicação manual", () => {
  it("identifica a barbearia, mostra os campos financeiros e exige revisão", () => {
    const shop = {
      shop: id,
      name: "Barbearia Aurora",
      owner: "Maria",
      contact: null,
      plan: null,
      origin: "none",
      contract: null,
      status: null,
      monthly_cents: null,
      trial_start: null,
      trial_end: null,
      last_verified_at: null,
      coverage_start: null,
      first_competence: null,
      first_due_at: null,
      due_day: null,
      renewal_anchor_day: null,
      contract_timezone: null,
      current_period_start: null,
      current_period_end: null,
      suspended: false,
    };
    const html = renderToStaticMarkup(
      createElement(AgreementForm, {
        shop,
        actor: id,
        plans: [
          { id, name: "Básico" },
          { id: "711eddb3-16a8-4588-a89e-b571a9c41a67", name: "Profissional" },
          { id: "811eddb3-16a8-4588-a89e-b571a9c41a67", name: "Premium" },
        ],
      }),
    );

    expect(html).toContain("Aplicar assinatura manual");
    expect(html).toContain("Barbearia Aurora");
    expect(html).toContain("Mensalidade negociada (R$)");
    expect(html).toContain("Primeira competência");
    expect(html).toContain("Fuso do contrato (IANA)");
    expect(html).toContain("Condições comerciais");
    expect(html).toContain("Básico");
    expect(html).toContain("Profissional");
    expect(html).toContain("Premium");
    expect(html).toContain("Revisar dados");
    expect(html).not.toContain("Confirmar operação");
  });

  it("mostra ação e motivo por barbearia na listagem financeira", () => {
    const rows: Shop[] = [
      {
        shop: id,
        name: "Barbearia sem contrato",
        owner: "Maria",
        contact: null,
        plan: null,
        origin: "none",
        contract: null,
        status: null,
        monthly_cents: null,
        trial_start: null,
        trial_end: null,
        last_verified_at: null,
        coverage_start: null,
        first_competence: null,
        first_due_at: null,
        due_day: null,
        renewal_anchor_day: null,
        contract_timezone: null,
        current_period_start: null,
        current_period_end: null,
        suspended: false,
      },
      {
        shop: "711eddb3-16a8-4588-a89e-b571a9c41a67",
        name: "Barbearia com contrato",
        owner: "João",
        contact: null,
        plan: "Básico",
        origin: "manual",
        contract: "811eddb3-16a8-4588-a89e-b571a9c41a67",
        status: "active",
        monthly_cents: 4990,
        trial_start: null,
        trial_end: null,
        last_verified_at: null,
        coverage_start: null,
        first_competence: null,
        first_due_at: null,
        due_day: null,
        renewal_anchor_day: null,
        contract_timezone: null,
        current_period_start: null,
        current_period_end: null,
        suspended: false,
      },
    ];
    const html = renderToStaticMarkup(createElement(Shops, { rows }));

    expect(html).toContain("Ações");
    expect(html).toContain("Aplicar assinatura manual");
    expect(html).toContain("/admin/assinaturas/barbearias/" + id + "#aplicar-assinatura");
    expect(html).toContain("Administrar assinatura");
    expect(html).toContain("Esta barbearia já possui um contrato vigente.");
  });
});
