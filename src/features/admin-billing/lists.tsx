import Link from "next/link";
import {
  adminPath,
  instant,
  labels,
  money,
  originLabels,
  period,
} from "./validation";
import { size, type Invoice, type Shop } from "./data";
import { PixForm } from "./forms";

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
export function Badge({ value }: { value: string | null }) {
  return (
    <span className="fa-badge" data-state={value}>
      {value ? (labels[value] ?? originLabels[value] ?? value) : "—"}
    </span>
  );
}
export function Paging({
  next,
  first,
}: {
  next?: string | null;
  first?: string | null;
}) {
  return (
    <nav className="fa-paging" aria-label="Paginação">
      {first && <Link href={first}>Voltar ao início da lista</Link>}
      {next && <Link href={next}>Próxima página →</Link>}
    </nav>
  );
}
export function Shops({ rows }: { rows: Shop[] }) {
  if (!rows.length)
    return (
      <p className="fa-empty">
        Nenhuma barbearia encontrada para estes filtros.
      </p>
    );
  return (
    <div className="fa-table">
      <table>
        <caption className="sr-only">Barbearias e assinaturas</caption>
        <thead>
          <tr>
            <th>Barbearia / contato</th>
            <th>Origem / plano</th>
            <th>Situação / fim do trial</th>
            <th>Mensalidade</th>
            <th>Último Pix conferido</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, size).map((s) => (
            <tr key={s.shop}>
              <td>
                <Link href={adminPath + "/barbearias/" + s.shop}>{s.name}</Link>
                <small>
                  {s.owner ?? "Proprietário não informado"} ·{" "}
                  {s.contact ?? "Sem contato"}
                </small>
              </td>
              <td>
                <Badge value={s.origin} />
                <small>{s.plan}</small>
              </td>
              <td>
                <Badge value={s.status} />
                {s.suspended && <Badge value="suspended" />}
                {s.trial_end && <small>{instant(s.trial_end)}</small>}
              </td>
              <td>{money(s.monthly_cents)}</td>
              <td>{instant(s.last_verified_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Invoices({ rows, actor }: { rows: Invoice[]; actor: string }) {
  if (!rows.length)
    return <p className="fa-empty">Nenhuma mensalidade encontrada.</p>;
  return (
    <div className="fa-records">
      {rows.slice(0, size).map((p) => (
        <article key={p.id} className="fa-record">
          <header>
            <div>
              <Link href={adminPath + "/barbearias/" + p.shop}>
                {p.shop_name}
              </Link>
              <h3>Competência {period(p.month)}</h3>
            </div>
            <div>
              <b>{money(p.total_cents)}</b> <Badge value={p.state} />
            </div>
          </header>
          <Facts
            values={{
              Plano: p.plan,
              Original: money(p.original_cents),
              Ajuste: money(p.adjustment_cents),
              Vencimento: instant(p.due_at),
              Crédito: instant(p.paid_at),
              Conferência: instant(p.verified_at),
              ...(p.reason ? { "Motivo do ajuste": p.reason } : {}),
            }}
          />
          {["pending", "overdue"].includes(p.state) && p.total_cents > 0 && (
            <PixForm row={p} actor={actor} />
          )}
        </article>
      ))}
    </div>
  );
}
