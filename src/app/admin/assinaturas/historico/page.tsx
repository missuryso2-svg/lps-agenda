import Link from "next/link";
import { History as HistoryIcon, Search } from "lucide-react";
import { activity, param, pageURL, size, type PageProps } from "@/features/admin-billing/data";
import { Facts, Paging } from "@/features/admin-billing/lists";
import { FinanceHeading } from "@/features/admin-billing/presentation";
import { adminPath, instant, labels } from "@/features/admin-billing/validation";

const actions = [
  "agreement", "issue", "confirm_pix", "suspend", "resume", "cancel",
  "manual_billing.agreement", "manual_billing.invoice", "manual_billing.past_due", "manual_billing.extension",
];

export default async function History({ searchParams }: PageProps) {
  const q = await searchParams;
  const rows = await activity(q);
  const path = adminPath + "/historico";
  const last = rows[size - 1];
  return (
    <>
      <FinanceHeading title="Histórico financeiro" description="Consulte decisões administrativas e eventos financeiros registrados." />
      <section className="fa-panel" aria-label="Registros administrativos">
        <form method="get" className="fa-filters">
          <label>
            Fonte
            <select name="fonte" defaultValue={param(q, "fonte") ?? "journal"}>
              <option value="journal">Decisões humanas</option>
              <option value="events">Eventos financeiros</option>
            </select>
          </label>
          <label>Barbearia (UUID)<input name="barbearia" maxLength={36} defaultValue={param(q, "barbearia") ?? ""} /></label>
          <label>Operador (UUID)<input name="operador" maxLength={36} defaultValue={param(q, "operador") ?? ""} /></label>
          <label>
            Ação
            <select name="acao" defaultValue={param(q, "acao") ?? ""}>
              <option value="">Todas</option>
              {actions.map(action => <option key={action} value={action}>{labels[action] ?? action}</option>)}
            </select>
          </label>
          <label>De (UTC)<input type="date" name="de" defaultValue={param(q, "de") ?? ""} /></label>
          <label>Até (UTC)<input type="date" name="ate" defaultValue={param(q, "ate") ?? ""} /></label>
          <button className="fa-primary"><Search size={16} aria-hidden /> Filtrar</button>
        </form>
        {!rows.length && <p className="fa-empty">Nenhum registro para estes filtros.</p>}
        {rows.length > 0 && (
          <div className="fa-records">
            {rows.slice(0, size).map(entry => (
              <article key={entry.id} className="fa-record fa-audit">
                <header>
                  <div><h3><HistoryIcon size={17} aria-hidden /> {labels[entry.action] ?? entry.action}</h3></div>
                  <time dateTime={entry.at}>{instant(entry.at)}</time>
                </header>
                <Facts values={{
                  Barbearia: <Link prefetch={false} href={adminPath + "/barbearias/" + entry.shop}>{entry.shop}</Link>,
                  "Responsável (UUID)": entry.actor ?? "Processamento interno",
                  Resultado: labels[entry.state ?? ""] ?? entry.state ?? (entry.action === "issue" ? "Mensalidade emitida" : "Evento registrado"),
                  ...(entry.reason && { Justificativa: entry.reason }),
                }} />
                {(entry.contract || entry.invoice) && (
                  <details className="fa-disclosure">
                    <summary>Identificadores da operação</summary>
                    <Facts values={{ Contrato: entry.contract, Mensalidade: entry.invoice }} />
                  </details>
                )}
              </article>
            ))}
          </div>
        )}
        <Paging
          first={q.apos ? pageURL(path, q, { apos: null, antes: null }) : null}
          next={rows.length > size ? pageURL(path, q, { apos: last.id, antes: last.at }) : null}
        />
      </section>
    </>
  );
}
