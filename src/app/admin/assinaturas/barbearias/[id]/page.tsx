import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFinancialAdmin } from "@/lib/auth/financial-admin";
import {
  directory,
  invoices,
  recentActivity,
  plans,
  size,
  pageURL,
  param,
  type PageProps,
} from "@/features/admin-billing/data";
import { AgreementForm, ContractForms } from "@/features/admin-billing/forms";
import { Facts, Invoices, Paging, Badge } from "@/features/admin-billing/lists";
import { InvoiceFilters } from "@/features/admin-billing/invoice-filters";
import {
  adminPath,
  instant,
  money,
  labels,
  period,
  manualAgreementEligibility,
} from "@/features/admin-billing/validation";

export default async function Detail({
  params,
  searchParams,
}: PageProps & { params: Promise<{ id: string }> }) {
  const { user } = await requireFinancialAdmin(),
    { id } = await params,
    q = await searchParams;
  const [shop] = await directory({}, id);
  if (!shop) notFound();
  const agreement = manualAgreementEligibility(shop);
  const canAgree = agreement.eligible;
  const [bills, trail, catalog] = await Promise.all([
    invoices(q, id),
    recentActivity(id),
    canAgree ? plans() : Promise.resolve([]),
  ]);
  const path = adminPath + "/barbearias/" + id,
    history = adminPath + "/historico?barbearia=" + id;
  return (
    <>
      <Link href={adminPath + "/barbearias"}>← Barbearias</Link>
      <h1>{shop.name}</h1>
      <div className="fa-panel">
        <Badge value={shop.origin === "trial" && shop.automatic_trial ? "automatic_trial" : shop.origin} />{" "}
        <Badge value={shop.origin === "trial" && shop.automatic_trial_state === "ended" ? "expired" : shop.status} />{" "}
        {shop.suspended && <Badge value="suspended" />}
        <Facts
          values={{
            Barbearia: id,
            Proprietário: shop.owner,
            Contato: shop.contact,
            Contrato: shop.contract,
            Plano: shop.plan,
            "Mensalidade contratada": money(shop.monthly_cents),
            "Início da cobertura": instant(shop.coverage_start),
            "Competência inicial": period(shop.first_competence),
            "Primeiro vencimento": instant(shop.first_due_at),
            "Dia de renovação": shop.renewal_anchor_day,
            "Dia de vencimento": shop.due_day,
            Fuso: shop.contract_timezone,
            "Início do período": instant(shop.current_period_start),
            "Fim do período": instant(shop.current_period_end),
            "Início do trial": instant(shop.trial_start),
            "Fim do trial": instant(shop.trial_end),
            ...(shop.automatic_trial && {
              "Origem do benefício": "Trial automático",
              "Plano do benefício": shop.automatic_trial_plan ?? null,
              "Dias restantes": shop.automatic_trial_days ?? null,
              "Situação do benefício": shop.automatic_trial_state === "converted"
                ? "Convertido com Pix conferido"
                : shop.automatic_trial_state === "running" ? "Vigente" : "Encerrado",
            }),
            "Último Pix conferido": instant(shop.last_verified_at),
          }}
        />
      </div>
      {shop.origin === "none" && !shop.contract && (
        <p className="fa-empty">Nenhuma assinatura cadastrada.</p>
      )}
      {canAgree && catalog.length > 0 ? (
        <AgreementForm shop={shop} actor={user.id} plans={catalog} />
      ) : canAgree ? (
        <p className="fa-guidance" role="status">
          Nenhum plano ativo está disponível no catálogo para aplicar uma assinatura.
        </p>
      ) : (
        <p className="fa-guidance" role="status">
          {agreement.message}
        </p>
      )}
      {shop.origin === "manual" && (
        <ContractForms shop={shop} actor={user.id} />
      )}
      <h2>Mensalidades</h2>
      <InvoiceFilters
        optionalMonth
        month={param(q, "mes") ?? ""}
        state={param(q, "situacao") ?? ""}
      />
      <Invoices rows={bills} actor={user.id} />
      <Paging
        first={q.parcela ? pageURL(path, q, { parcela: null }) : null}
        next={
          bills.length > size
            ? pageURL(path, q, { parcela: bills[size - 1].id })
            : null
        }
      />
      <h2>Amostra do histórico financeiro</h2>
      {!trail.history.length && !trail.events.length && (
        <p className="fa-empty">Nenhum registro financeiro.</p>
      )}
      <ul>
        {trail.history.map((j) => (
          <li key={j.op}>
            {instant(j.at)} · {labels[j.result.action ?? j.action] ?? j.action}{" "}
            · {j.reason ?? j.actor}
          </li>
        ))}
        {trail.events.map((e) => (
          <li key={e.id}>
            {instant(e.at)} · {labels[e.action] ?? e.action} ·{" "}
            {labels[e.state ?? ""] ?? e.state}
          </li>
        ))}
      </ul>
      <p className="fa-paging">
        <Link href={history}>Consultar histórico completo</Link>
      </p>
    </>
  );
}
