import { requireFinancialAdmin } from "@/lib/auth/financial-admin";
import { operators, pageURL, size, type PageProps } from "@/features/admin-billing/data";
import { OperatorForm } from "@/features/admin-billing/forms";
import { Badge, Facts, Paging } from "@/features/admin-billing/lists";
import { FinanceHeading } from "@/features/admin-billing/presentation";
import { adminPath, instant, labels } from "@/features/admin-billing/validation";

export default async function Operators({ searchParams }: PageProps) {
  const { user } = await requireFinancialAdmin(true);
  const q = await searchParams;
  const rows = await operators(q);
  const path = adminPath + "/operadores";
  return (
    <>
      <FinanceHeading title="Operadores financeiros" description="Gerencie o acesso de operadores e gestores ao painel financeiro." />
      <section className="fa-panel" aria-labelledby="access-heading">
        <h2 id="access-heading">Permissões</h2>
        <p className="fa-muted">Operadores executam rotinas financeiras. Gestores também administram as concessões de acesso.</p>
        <OperatorForm actor={user.id} />
      </section>
      <section className="fa-panel" aria-labelledby="grants-heading">
        <h2 id="grants-heading">Concessões</h2>
        <div className="fa-records">
          {rows.slice(0, size).map(row => (
            <article key={row.id} className="fa-record">
              <header>
                <h3>{labels[row.level]}{row.user_id === user.id ? " · Sua conta" : ""}</h3>
                <Badge value={row.revoked_at ? "revoked" : "active"} label={row.revoked_at ? "Revogado" : "Ativo"} />
              </header>
              <Facts values={{
                "Usuário Auth": row.user_id,
                Concessão: instant(row.granted_at),
                ...(row.revoked_at && { Revogação: instant(row.revoked_at) }),
              }} />
              {!row.revoked_at && <OperatorForm actor={user.id} target={row.user_id} />}
            </article>
          ))}
        </div>
        {!rows.length && <p className="fa-empty">Nenhuma concessão nesta página.</p>}
        <Paging
          first={q.apos ? path : null}
          next={rows.length > size ? pageURL(path, q, { apos: rows[size - 1].id }) : null}
        />
      </section>
    </>
  );
}
