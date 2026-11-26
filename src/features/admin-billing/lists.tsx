import Link from "next/link";
import {
  adminPath,
  instant,
  labels,
  money,
  originLabels,
  period,
  manualAgreementEligibility,
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
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, size).map((s) => {
            const eligibility = manualAgreementEligibility(s);
            return (
            <tr key={s.shop}>
              <td>
                <Link href={adminPath + "/barbearias/" + s.shop}>{s.name}</Link>
                <small>
                  {s.owner ?? "Proprietário não informado"} ·{" "}
                  {s.contact ?? "Sem contato"}
                </small>
              </td>
              <td>
                <Badge value={s.origin === "trial" && s.automatic_trial ? "automatic_trial" : s.origin} />
                {s.automatic_trial && <small>{s.origin === "trial" ? s.automatic_trial_plan : "Trial automático · " + s.automatic_trial_plan}</small>}
                {s.origin !== "trial" || !s.automatic_trial ? <small>{s.plan}</small> : null}
              </td>
              <td>
                <Badge value={s.origin === "trial" && s.automatic_trial_state === "ended" ? "expired" : s.status} />
                {s.suspended && <Badge value="suspended" />}
                {s.trial_end && <small>{instant(s.trial_end)}</small>}
                {s.automatic_trial_state && <small>{{
                  running: (s.automatic_trial_days ?? 0) + " dia(s) restante(s)",
                  ended: "Período grátis encerrado",
                  converted: "Convertido com Pix conferido",
                }[s.automatic_trial_state]}</small>}
              </td>
              <td>{money(s.monthly_cents)}</td>
              <td>{instant(s.last_verified_at)}</td>
              <td className="fa-actions">
                <Link
                  href={adminPath + "/barbearias/" + s.shop + (eligibility.eligible ? "#aplicar-assinatura" : "")}
                  data-primary={eligibility.eligible}
                >
                  {eligibility.eligible
                    ? "Aplicar assinatura manual"
                    : s.origin === "reconcile" || s.origin === "asaas"
                      ? "Conferir conciliação"
                      : "Administrar assinatura"}
                </Link>
                <small>{eligibility.message}</small>
              </td>
            </tr>
            );
          })}
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
