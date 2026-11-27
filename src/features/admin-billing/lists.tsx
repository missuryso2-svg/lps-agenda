import Link from "next/link";
import { ArrowDownRight, ArrowRight } from "lucide-react";
import {
  adminPath,
  instant,
  labels,
  manualAgreementEligibility,
  money,
  originLabels,
  period,
} from "./validation";
import { size, type Invoice, type Shop } from "./data";
import { PixForm } from "./forms";

const trialLabels: Record<string, string> = {
  running: "Trial vigente",
  ended: "Trial encerrado",
  converted: "Convertido com Pix conferido",
};

export function Facts({ values }: { values: Record<string, React.ReactNode> }) {
  return (
    <dl className="fa-facts">
      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Badge({ value, label }: { value: string | null; label?: string }) {
  return (
    <span className="fa-badge" data-state={value}>
      {label ?? (value ? labels[value] ?? originLabels[value] ?? value : "—")}
    </span>
  );
}

export function TrialStatus({ shop }: { shop: Shop }) {
  const state = shop.automatic_trial_state;
  if (!state) return null;
  const days = shop.automatic_trial_days;

  return (
    <>
      <Badge value={state} label={state === "ended" && shop.status === "expired" ? "Trial expirado" : trialLabels[state]} />
      {state === "running" && days != null && (
        <small>{days === 1 ? "Último dia · 1 dia restante" : days + " dias restantes"}</small>
      )}
      {state === "ended" && shop.origin === "manual" && shop.status === "pending" && (
        <small>Conversão aguarda conferência do Pix</small>
      )}
    </>
  );
}

export function Paging({ next, first }: { next?: string | null; first?: string | null }) {
  if (!next && !first) return null;
  return (
    <nav className="fa-paging" aria-label="Paginação">
      {first && <Link className="fa-button" prefetch={false} href={first}>Voltar ao início da lista</Link>}
      {next && <Link className="fa-button" prefetch={false} href={next}>Próxima página <ArrowRight size={16} aria-hidden /></Link>}
    </nav>
  );
}

export function Shops({ rows }: { rows: Shop[] }) {
  if (!rows.length) {
    return <p className="fa-empty">Nenhuma barbearia encontrada para estes filtros.</p>;
  }

  return (
    <>
      <p className="fa-scroll-hint"><ArrowDownRight size={15} aria-hidden /> Deslize a tabela para ver cobertura e ações.</p>
      <div className="fa-table" role="region" aria-label="Tabela de barbearias" tabIndex={0}>
        <table>
          <caption className="sr-only">Barbearias e assinaturas</caption>
          <thead>
            <tr>
              <th scope="col">Barbearia</th>
              <th scope="col">Plano e origem</th>
              <th scope="col">Situação</th>
              <th scope="col">Cobertura</th>
              <th scope="col">Último Pix</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, size).map(shop => {
              const eligibility = manualAgreementEligibility(shop);
              const href = adminPath + "/barbearias/" + shop.shop;
              const currentTrial = shop.origin === "trial";
              return (
                <tr key={shop.shop}>
                  <th scope="row">
                    <Link prefetch={false} href={href}>{shop.name}</Link>
                    {shop.owner && <small>{shop.owner}</small>}
                  </th>
                  <td>
                    <strong>{(currentTrial && shop.automatic_trial ? shop.automatic_trial_plan : shop.plan) ?? "—"}</strong>
                    <small>{originLabels[currentTrial && shop.automatic_trial ? "automatic_trial" : shop.origin] ?? shop.origin}</small>
                    {shop.monthly_cents != null && <small className="fa-currency">{money(shop.monthly_cents)} / mês</small>}
                  </td>
                  <td>
                    {(!currentTrial || !shop.automatic_trial_state) && <Badge value={shop.suspended ? "suspended" : shop.status} />}
                    <TrialStatus shop={shop} />
                  </td>
                  <td>
                    <small>Início</small>{instant(currentTrial ? shop.trial_start : shop.coverage_start ?? shop.current_period_start)}
                    <small>Fim</small>{instant(currentTrial ? shop.trial_end : shop.current_period_end)}
                  </td>
                  <td>{instant(shop.last_verified_at)}</td>
                  <td className="fa-actions">
                    <Link prefetch={false} className="fa-button" href={href + (eligibility.eligible ? "#aplicar-assinatura" : "")}>
                      {eligibility.eligible
                        ? "Aplicar assinatura manual"
                        : shop.origin === "reconcile" || shop.origin === "asaas"
                          ? "Conferir conciliação"
                          : "Administrar assinatura"}
                      <ArrowRight size={15} aria-hidden />
                    </Link>
                    <small>{eligibility.message}</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Invoices({ rows, actor }: { rows: Invoice[]; actor: string }) {
  if (!rows.length) return <p className="fa-empty">Nenhuma mensalidade encontrada.</p>;

  return (
    <div className="fa-records">
      {rows.slice(0, size).map(invoice => (
        <article key={invoice.id} className="fa-record">
          <header>
            <div>
              <Link prefetch={false} href={adminPath + "/barbearias/" + invoice.shop}>{invoice.shop_name}</Link>
              <h3>Competência {period(invoice.month)}</h3>
            </div>
            <div className="fa-invoice-value">
              <strong className="fa-currency">{money(invoice.total_cents)}</strong>
              <Badge value={invoice.state} />
            </div>
          </header>
          <Facts
            values={{
              Vencimento: instant(invoice.due_at),
              "Crédito no extrato": instant(invoice.paid_at),
              Conferência: instant(invoice.verified_at),
              Plano: invoice.plan,
              "Valor original": money(invoice.original_cents),
              Ajuste: money(invoice.adjustment_cents),
              ...(invoice.reason ? { "Motivo do ajuste": invoice.reason } : {}),
            }}
          />
          {["pending", "overdue"].includes(invoice.state) && invoice.total_cents > 0 && (
            <PixForm row={invoice} actor={actor} />
          )}
        </article>
      ))}
    </div>
  );
}
