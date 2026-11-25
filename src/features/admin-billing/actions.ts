"use server";

import { revalidatePath } from "next/cache";
import { financialSession } from "@/lib/auth/financial-admin";
import { adminPath, instant, labels, operation } from "./validation";

export type Outcome = { ok: boolean; message: string };
function failure(message: string): Outcome {
  return { ok: false, message };
}

export async function submitFinancialOperation(
  input: unknown,
): Promise<Outcome> {
  try {
    const session = await financialSession();
    if (session.status === "anonymous")
      return failure("Sessão expirada. Entre novamente.");
    if (session.status !== "authorized")
      return failure("Acesso financeiro negado.");
    const parsed = operation.safeParse(input);
    if (!parsed.success)
      return failure("Revise os dados e as confirmações obrigatórias.");
    const v = parsed.data,
      db = session.db;
    let response;
    switch (v.kind) {
      case "agreement":
        response = await db.rpc("finance_agreement", {
          op: v.op,
          shop: v.shop,
          reference: v.reference,
          reason: v.reason,
          terms: {
            plan_id: v.plan,
            monthly_cents: v.amount,
            currency: "BRL",
            terms: v.terms,
            coverage_start: v.coverage,
            first_month: v.first_month + "-01",
            first_due: v.due,
            renewal_day: v.renewal_day,
            due_day: v.due_day,
            due_month_offset: v.offset,
            due_time: v.time,
            zone: v.zone,
          },
        });
        break;
      case "invoice":
        response = await db.rpc("finance_invoice", {
          op: v.op,
          shop: v.shop,
          contract: v.contract,
          competence: v.month + "-01",
        });
        break;
      case "pix":
        response = await db.rpc("finance_confirm_pix", {
          op: v.op,
          shop: v.shop,
          contract: v.contract,
          invoice: v.invoice,
          received_cents: v.amount,
          credited_at: v.credit,
          checked: v.checked,
          reference: v.reference || null,
        });
        break;
      case "contract":
        response = await db.rpc("finance_contract_action", {
          op: v.op,
          shop: v.shop,
          contract: v.contract,
          command: v.command,
          reason: v.reason,
        });
        break;
      case "operator":
        if (session.level !== "manager" || session.user.id === v.target)
          return failure("Acesso financeiro negado.");
        response = await db.rpc("finance_operator", {
          target: v.target,
          permission: v.permission,
          reason: v.reason,
        });
        break;
    }
    if (response.error) {
      const code = response.error.code;
      if (code === "LP031" && v.kind === "agreement")
        return failure("A equipe ativa excede o limite do plano escolhido. Escolha um plano que comporte os profissionais ativos.");
      if (code === "42501") return failure("Acesso financeiro negado.");
      if (code === "55000" && v.kind === "pix")
        return failure(
          "Parcela já encerrada. Atualize a mensalidade e confira o histórico.",
        );
      if (code === "55000" && v.kind === "agreement")
        return failure(
          "Esta barbearia já possui um contrato vigente, um teste ainda válido ou uma conciliação pendente. Atualize os dados antes de tentar novamente.",
        );
      if (code === "23505" && v.kind === "pix")
        return failure(
          "Referência já registrada. Confira a conciliação antes de continuar.",
        );
      if (code === "23505" && v.kind === "agreement")
        return failure(
          "Esta barbearia já possui um contrato vigente. Nenhum contrato duplicado foi criado.",
        );
      if (code === "55000" || code === "23505")
        return failure(
          "O estado atual impede a operação. Atualize os dados e confira o histórico.",
        );
      if (["22023", "23514", "23503", "P0002", "22008", "22007"].includes(code))
        return failure(
          "Dados incompatíveis com a operação. Confira valor, competência e situação.",
        );
      return failure(
        "Resultado incerto. Consulte o histórico antes de repetir a mesma operação.",
      );
    }
    const receipt = response.data;
    if (!receipt)
      return failure("Resultado indisponível. Consulte o histórico.");
    let message =
      "Permissão registrada. Registro " +
      (typeof receipt === "string" ? receipt : "");
    if (typeof receipt === "object" && !Array.isArray(receipt)) {
      if (v.kind === "pix")
        message =
          "Pix conferido em " +
          instant(String(receipt.verified_at)) +
          ". Cobertura vigente confirmada: " +
          (receipt.coverage_confirmed ? "sim." : "não.");
      if (v.kind === "agreement")
        message =
          "Contrato registrado com sucesso. Contrato " +
          receipt.contract +
          " · " +
          (labels[String(receipt.state)] ?? String(receipt.state)) +
          (receipt.state === "pending" ? ". Aguardando pagamento." : ".");
      if (v.kind === "invoice")
        message = "Mensalidade registrada. Parcela " + receipt.invoice;
      if (v.kind === "contract")
        message =
          (receipt.action === "cancel"
            ? "Cancelamento registrado"
            : labels[String(receipt.action)] + " registrada") +
          ". Situação: " +
          labels[String(receipt.after)] +
          (receipt.suspended ? " · Suspensa" : "");
    }
    revalidatePath(adminPath, "layout");
    return { ok: true, message };
  } catch {
    return failure(
      "Serviço indisponível. O resultado pode estar pendente. Consulte o histórico antes de tentar novamente.",
    );
  }
}
