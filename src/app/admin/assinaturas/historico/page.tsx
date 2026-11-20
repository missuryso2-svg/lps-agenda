import Link from "next/link";
import {
  activity,
  param,
  pageURL,
  size,
  type PageProps,
} from "@/features/admin-billing/data";
import { Facts, Paging } from "@/features/admin-billing/lists";
import {
  adminPath,
  instant,
  labels,
} from "@/features/admin-billing/validation";
export default async function History({ searchParams }: PageProps) {
  const q = await searchParams,
    rows = await activity(q),
    path = adminPath + "/historico";
  const last = rows[size - 1];
  return (
    <>
      <h1>Histórico financeiro</h1>
      <form className="fa-filters">
        <label>
          Fonte
          <select name="fonte" defaultValue={param(q, "fonte") ?? "journal"}>
            <option value="journal">Decisões humanas</option>
            <option value="events">Eventos financeiros</option>
          </select>
        </label>
        <label>
          Barbearia (UUID)
          <input name="barbearia" defaultValue={param(q, "barbearia") ?? ""} />
        </label>
        <label>
          Operador (UUID)
          <input name="operador" defaultValue={param(q, "operador") ?? ""} />
        </label>
        <label>
          Ação
          <select name="acao" defaultValue={param(q, "acao") ?? ""}>
            <option value="">Todas</option>
            {[
              "agreement",
              "issue",
              "confirm_pix",
              "suspend",
              "resume",
              "cancel",
              "manual_billing.agreement",
              "manual_billing.invoice",
              "manual_billing.past_due",
              "manual_billing.extension",
            ].map((a) => (
              <option key={a} value={a}>
                {labels[a] ?? "Atraso contratual"}
              </option>
            ))}
          </select>
        </label>
        <label>
          De (UTC)
          <input type="date" name="de" defaultValue={param(q, "de") ?? ""} />
        </label>
        <label>
          Até (UTC)
          <input type="date" name="ate" defaultValue={param(q, "ate") ?? ""} />
        </label>
        <button>Filtrar</button>
      </form>
      {!rows.length && (
        <p className="fa-empty">Nenhum evento para estes filtros.</p>
      )}
      <div className="fa-records">
        {rows.slice(0, size).map((r) => (
          <article key={r.id} className="fa-record">
            <header>
              <h3>{labels[r.action] ?? r.action}</h3>
              <small>{instant(r.at)}</small>
            </header>
            <Facts
              values={{
                Barbearia: (
                  <Link href={adminPath + "/barbearias/" + r.shop}>
                    {r.shop}
                  </Link>
                ),
                Responsável: r.actor ?? "Processamento interno",
                Contrato: r.contract,
                Mensalidade: r.invoice,
                Resultado:
                  labels[r.state ?? ""] ??
                  r.state ??
                  (r.action === "issue"
                    ? "Mensalidade emitida"
                    : "Evento registrado"),
                Justificativa: r.reason,
              }}
            />
          </article>
        ))}
      </div>
      <Paging
        first={q.apos ? pageURL(path, q, { apos: null, antes: null }) : null}
        next={
          rows.length > size
            ? pageURL(path, q, { apos: last.id, antes: last.at })
            : null
        }
      />
    </>
  );
}
