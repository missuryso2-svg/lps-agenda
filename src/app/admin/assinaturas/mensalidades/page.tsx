import { requireFinancialAdmin } from "@/lib/auth/financial-admin";
import {
  invoices,
  pageURL,
  param,
  selectedMonth,
  size,
  type PageProps,
} from "@/features/admin-billing/data";
import { Invoices, Paging } from "@/features/admin-billing/lists";
import { InvoiceFilters } from "@/features/admin-billing/invoice-filters";
import { adminPath } from "@/features/admin-billing/validation";
export default async function Bills({ searchParams }: PageProps) {
  const { user } = await requireFinancialAdmin(),
    q = await searchParams,
    m = selectedMonth(q);
  const rows = await invoices(q, null),
    path = adminPath + "/mensalidades";
  return (
    <>
      <h1>Mensalidades</h1>
      <InvoiceFilters month={m} state={param(q, "situacao") ?? ""} />
      <Invoices rows={rows} actor={user.id} />
      <Paging
        first={q.parcela ? pageURL(path, q, { parcela: null }) : null}
        next={
          rows.length > size
            ? pageURL(path, q, { parcela: rows[size - 1].id, mes: m })
            : null
        }
      />
    </>
  );
}
