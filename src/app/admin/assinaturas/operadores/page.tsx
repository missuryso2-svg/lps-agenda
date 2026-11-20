import { requireFinancialAdmin } from "@/lib/auth/financial-admin";
import {
  operators,
  pageURL,
  size,
  type PageProps,
} from "@/features/admin-billing/data";
import { OperatorForm } from "@/features/admin-billing/forms";
import { Paging } from "@/features/admin-billing/lists";
import {
  adminPath,
  instant,
  labels,
} from "@/features/admin-billing/validation";
export default async function Operators({ searchParams }: PageProps) {
  const { user } = await requireFinancialAdmin(true),
    q = await searchParams,
    rows = await operators(q),
    path = adminPath + "/operadores";
  return (
    <>
      <h1>Operadores financeiros</h1>
      <OperatorForm actor={user.id} />
      <h2>Concessões</h2>
      <div className="fa-records">
        {rows.slice(0, size).map((r) => (
          <article key={r.id} className="fa-record">
            <header>
              <h3>
                {labels[r.level]}
                {r.user_id === user.id ? " · Sua conta" : ""}
              </h3>
              <span>{r.revoked_at ? "Revogado" : "Ativo"}</span>
            </header>
            <p>{r.user_id}</p>
            <small>Concessão em {instant(r.granted_at)}</small>
            {r.revoked_at ? (
              <small>Revogação em {instant(r.revoked_at)}</small>
            ) : (
              <OperatorForm actor={user.id} target={r.user_id} />
            )}
          </article>
        ))}
      </div>
      {!rows.length && (
        <p className="fa-empty">Nenhuma concessão nesta página.</p>
      )}
      <Paging
        first={q.apos ? path : null}
        next={
          rows.length > size
            ? pageURL(path, q, { apos: rows[size - 1].id })
            : null
        }
      />
    </>
  );
}
