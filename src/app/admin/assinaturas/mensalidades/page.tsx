import { requireFinancialAdmin } from "@/lib/auth/financial-admin";
import { invoices, pageURL, param, selectedMonth, size, type PageProps } from "@/features/admin-billing/data";
import { Invoices, Paging } from "@/features/admin-billing/lists";
import { InvoiceFilters } from "@/features/admin-billing/invoice-filters";
import { FinanceHeading } from "@/features/admin-billing/presentation";
import { adminPath } from "@/features/admin-billing/validation";

export default async function Bills({ searchParams }: PageProps) {
  const { user } = await requireFinancialAdmin();
  const q = await searchParams;
  const month = selectedMonth(q);
  const rows = await invoices(q, null);
  const path = adminPath + "/mensalidades";

  return (
    <>
      <FinanceHeading title="Mensalidades" description="Consulte parcelas emitidas e registre a conferência de créditos no extrato bancário." />
      <section className="fa-panel" aria-label="Mensalidades por competência">
        <InvoiceFilters month={month} state={param(q, "situacao") ?? ""} />
        <p className="fa-result-count">{Math.min(rows.length, size)} {rows.length === 1 ? "mensalidade nesta página" : "mensalidades nesta página"}</p>
        <Invoices rows={rows} actor={user.id} />
        <Paging
          first={q.parcela ? pageURL(path, q, { parcela: null }) : null}
          next={rows.length > size ? pageURL(path, q, { parcela: rows[size - 1].id, mes: month }) : null}
        />
      </section>
    </>
  );
}
