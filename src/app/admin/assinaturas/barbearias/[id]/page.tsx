import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";

import { requireFinancialAdmin } from "@/lib/auth/financial-admin";
import {
  directory, invoices, recentActivity, plans, size, pageURL, param, type PageProps,
} from "@/features/admin-billing/data";
import { AgreementForm, ContractForms } from "@/features/admin-billing/forms";
import { Badge, Facts, Invoices, Paging, TrialStatus } from "@/features/admin-billing/lists";
import { InvoiceFilters } from "@/features/admin-billing/invoice-filters";
import { FinanceHeading } from "@/features/admin-billing/presentation";
import { adminPath, instant, money, labels, period, manualAgreementEligibility } from "@/features/admin-billing/validation";

export default async function Detail({
  params,
  searchParams,
}: PageProps & { params: Promise<{ id: string }> }) {
  const { user } = await requireFinancialAdmin();
  const { id } = await params;
  const q = await searchParams;
  const [shop] = await directory({}, id);
  if (!shop) notFound();

  const agreement = manualAgreementEligibility(shop);
  const [bills, trail, catalog] = await Promise.all([
    invoices(q, id),
    recentActivity(id),
    agreement.eligible ? plans() : Promise.resolve([]),
  ]);
  const path = adminPath + "/barbearias/" + id;
  const history = adminPath + "/historico?barbearia=" + id;
  const automatic = shop.automatic_trial;

  return (
    <>
      <Link className="fa-back" href={adminPath + "/barbearias"}><ArrowLeft size={16} aria-hidden /> Barbearias</Link>
      <FinanceHeading title={shop.name}>
        <div className="fa-badges">
          <Badge value={shop.origin === "trial" && automatic ? "automatic_trial" : shop.origin} />
          {shop.suspended ? <Badge value="suspended" /> : (
            !(shop.origin === "trial" && automatic) && shop.status && <Badge value={shop.status} />
          )}
        </div>
      </FinanceHeading>

      <div className="fa-detail-grid">
        <section className="fa-panel" aria-labelledby="contract-heading">
          <h2 id="contract-heading">Cadastro e assinatura</h2>
          <Facts values={{
            Proprietário: shop.owner,
            Contato: shop.contact,
            Plano: shop.plan,
            "Mensalidade contratada": money(shop.monthly_cents),
            "Início da cobertura": instant(shop.coverage_start ?? shop.current_period_start),
            "Fim do período atual": instant(shop.current_period_end),
            "Competência inicial": period(shop.first_competence),
            "Primeiro vencimento": instant(shop.first_due_at),
            "Dia de renovação": shop.renewal_anchor_day,
            "Dia de vencimento": shop.due_day,
            "Fuso do contrato": shop.contract_timezone,
            "Último Pix conferido": instant(shop.last_verified_at),
          }} />
          <details className="fa-disclosure">
            <summary>Identificadores do cadastro</summary>
            <Facts values={{ Barbearia: id, Contrato: shop.contract }} />
          </details>
        </section>
        {shop.trial_start && (
          <section className="fa-panel fa-trial" aria-labelledby="trial-heading">
            <h2 id="trial-heading">{automatic ? "Trial automático" : "Trial manual"}</h2>
            {automatic ? <TrialStatus shop={shop} /> : <Badge value={shop.origin === "trial" ? shop.status : null} />}
            <Facts values={{
              ...(automatic && { "Plano do benefício": shop.automatic_trial_plan }),
              Início: instant(shop.trial_start),
              Encerramento: instant(shop.trial_end),
            }} />
          </section>
        )}
      </div>

      <section className="fa-panel" aria-labelledby="operations-heading">
        <header className="fa-section-head">
          <div><h2 id="operations-heading">Operações do contrato</h2><p>O acordo, a emissão e a conferência do crédito são operações separadas.</p></div>
        </header>
        {agreement.eligible && catalog.length > 0 ? (
          <AgreementForm shop={shop} actor={user.id} plans={catalog} />
        ) : (
          <p className="fa-guidance" role="status">
            {agreement.eligible ? "Nenhum plano ativo está disponível no catálogo para aplicar uma assinatura." : agreement.message}
          </p>
        )}
        {shop.origin === "manual" && <ContractForms shop={shop} actor={user.id} />}
      </section>

      <section className="fa-panel" aria-labelledby="shop-invoices-heading">
        <h2 id="shop-invoices-heading">Mensalidades</h2>
        <InvoiceFilters optionalMonth month={param(q, "mes") ?? ""} state={param(q, "situacao") ?? ""} />
        <Invoices rows={bills} actor={user.id} />
        <Paging
          first={q.parcela ? pageURL(path, q, { parcela: null }) : null}
          next={bills.length > size ? pageURL(path, q, { parcela: bills[size - 1].id }) : null}
        />
      </section>

      <section className="fa-panel" aria-labelledby="recent-heading">
        <header className="fa-section-head">
          <div><h2 id="recent-heading">Amostra do histórico financeiro</h2></div>
          <Link href={history}>Consultar histórico completo <ArrowRight size={16} aria-hidden /></Link>
        </header>
        {!trail.history.length && !trail.events.length && <p className="fa-empty">Nenhum registro financeiro.</p>}
        {(trail.history.length > 0 || trail.events.length > 0) && (
          <ul className="fa-timeline">
            {trail.history.map(entry => (
              <li key={entry.op}>
                <strong>{labels[entry.result.action ?? entry.action] ?? entry.action}</strong>
                <time dateTime={entry.at}>{instant(entry.at)}</time>
                {entry.reason && <p>{entry.reason}</p>}
              </li>
            ))}
            {trail.events.map(entry => (
              <li key={entry.id}>
                <strong>{labels[entry.action] ?? entry.action}</strong>
                <time dateTime={entry.at}>{instant(entry.at)}</time>
                {entry.state && <p>{labels[entry.state] ?? entry.state}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
