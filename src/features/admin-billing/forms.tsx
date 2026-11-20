import { OperationForm, type Field } from "./operation-form";
import type { Shop, Invoice } from "./data";
import { instant, labels, money, period } from "./validation";

const reason: Field = {
  name: "reason",
  label: "Justificativa",
  type: "textarea",
  maxLength: 300,
};
const amount: Field = {
  name: "amount",
  label: "Valor recebido (R$)",
  placeholder: "0,00",
};
const select = (
  name: string,
  label: string,
  options: { value: string; label: string }[],
): Field => ({ name, label, type: "select", options });
export function AgreementForm({
  shop,
  actor,
  plans,
}: {
  shop: Shop;
  actor: string;
  plans: { id: string; name: string }[];
}) {
  return (
    <OperationForm
      kind="agreement"
      actor={actor}
      ids={{ shop: shop.shop }}
      title="Registrar acordo comercial"
      context={{ Barbearia: shop.name, Identificador: shop.shop }}
      note="Informe o preço negociado. O acordo aguarda cobertura paga."
      fields={[
        select(
          "plan",
          "Plano contratado",
          plans.map((p) => ({ value: p.id, label: p.name })),
        ),
        { ...amount, label: "Mensalidade negociada (R$)" },
        {
          name: "coverage",
          label: "Início da cobertura (UTC)",
          type: "datetime-local",
        },
        { name: "first_month", label: "Primeira competência", type: "month" },
        {
          name: "due",
          label: "Primeiro vencimento (UTC)",
          type: "datetime-local",
        },
        {
          name: "renewal_day",
          label: "Dia de renovação",
          type: "number",
          min: 1,
          max: 31,
        },
        {
          name: "due_day",
          label: "Dia de vencimento",
          type: "number",
          min: 1,
          max: 31,
        },
        {
          name: "offset",
          label: "Deslocamento do vencimento em meses",
          type: "number",
          initial: "0",
          min: -32768,
          max: 32767,
        },
        { name: "time", label: "Hora local do vencimento", type: "time" },
        {
          name: "zone",
          label: "Fuso do contrato (IANA)",
          initial: "America/Sao_Paulo",
        },
        {
          name: "terms",
          label: "Condições comerciais",
          type: "textarea",
          maxLength: 4000,
        },
        {
          name: "reference",
          label: "Referência administrativa",
          maxLength: 120,
        },
        reason,
      ]}
    />
  );
}
export function ContractForms({ shop, actor }: { shop: Shop; actor: string }) {
  if (
    !shop.contract ||
    !["active", "pending", "past_due"].includes(shop.status ?? "")
  )
    return null;
  const ids = { shop: shop.shop, contract: shop.contract };
  const context = {
    Barbearia: shop.name,
    Contrato: shop.contract,
    Plano: shop.plan ?? "—",
    Mensalidade: money(shop.monthly_cents),
    Situação:
      (labels[shop.status!] ?? shop.status) +
      (shop.suspended ? " · Suspensa" : ""),
  };
  const commands = shop.suspended
    ? ["resume", "cancel"]
    : ["suspend", "cancel"];
  return (
    <>
      <OperationForm
        actor={actor}
        kind="invoice"
        title="Emitir competência"
        ids={ids}
        context={context}
        note="A emissão registra uma mensalidade no LPS Agenda. Não gera cobrança bancária automática."
        fields={[
          { name: "month", label: "Competência a emitir", type: "month" },
        ]}
      />
      <OperationForm
        actor={actor}
        kind="contract"
        title="Administrar contrato"
        ids={ids}
        context={context}
        fields={[
          select(
            "command",
            "Operação",
            commands.map((value) => ({ value, label: labels[value] })),
          ),
          reason,
        ]}
      />
    </>
  );
}
export function PixForm({ row, actor }: { row: Invoice; actor: string }) {
  return (
    <OperationForm
      kind="pix"
      title="Conferir Pix"
      note="Consulte o extrato da LPS Solutions antes de registrar o crédito. A conferência é manual."
      actor={actor}
      ids={{ shop: row.shop, contract: row.contract, invoice: row.id }}
      expectedCents={row.total_cents}
      context={{
        Barbearia: row.shop_name,
        Plano: row.plan ?? "—",
        Contrato: row.contract,
        Competência: period(row.month),
        "Valor integral": money(row.total_cents),
        Vencimento: instant(row.due_at),
        Situação: labels[row.state],
      }}
      fields={[
        amount,
        {
          name: "credit",
          label: "Data e hora do crédito (UTC)",
          type: "datetime-local",
        },
        {
          name: "reference",
          label: "Referência bancária ou administrativa (opcional)",
          optional: true,
          maxLength: 120,
        },
        {
          name: "checked",
          type: "checkbox",
          label:
            "Confirmo que conferi o crédito deste valor no extrato bancário da LPS Solutions.",
        },
      ]}
    />
  );
}
export function OperatorForm({
  actor,
  target,
}: {
  actor: string;
  target?: string;
}) {
  if (target === actor) return null;
  return (
    <OperationForm
      actor={actor}
      kind="operator"
      title={target ? "Revogar acesso" : "Conceder acesso"}
      ids={target ? { target, permission: "revoke" } : {}}
      context={target ? { "Usuário Auth": target } : {}}
      fields={
        target
          ? [reason]
          : [
              {
                name: "target",
                label: "UUID do usuário existente no Supabase Auth",
              },
              select("permission", "Permissão", [
                { value: "operator", label: "Operador financeiro" },
                { value: "manager", label: "Gestor financeiro" },
              ]),
              reason,
            ]
      }
    />
  );
}
