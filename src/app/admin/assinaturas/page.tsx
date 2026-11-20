import Link from "next/link";
import {
  overview,
  selectedMonth,
  type PageProps,
} from "@/features/admin-billing/data";
import { adminPath, money, period } from "@/features/admin-billing/validation";

export default async function Overview({ searchParams }: PageProps) {
  const m = selectedMonth(await searchParams),
    data = await overview(m);
  const counts = [
    ["Barbearias cadastradas", data.shops],
    ["Contratos manuais ativos", data.active],
    ["Contratos manuais pendentes", data.pending],
    ["Contratos manuais em atraso", data.past_due],
  ] as const;
  return (
    <>
      <h1>Visão financeira</h1>
      <form className="fa-filters">
        <label>
          Competência
          <input type="month" name="mes" defaultValue={m} required />
        </label>
        <button>Aplicar</button>
      </form>
      <h2>Mensalidades de {period(m)}</h2>
      <div className="fa-metrics fa-money">
        <div className="fa-metric">
          <span>Recebido</span>
          <strong>{money(data.received_cents)}</strong>
        </div>
        <div className="fa-metric">
          <span>Em aberto</span>
          <strong>{money(data.open_cents)}</strong>
        </div>
      </div>
      <div className="fa-paging">
        <Link href={adminPath + "/mensalidades?mes=" + m + "&situacao=pending"}>
          {data.pending_invoices} pendentes
        </Link>
        <Link href={adminPath + "/mensalidades?mes=" + m + "&situacao=overdue"}>
          {data.overdue_invoices} vencidas
        </Link>
      </div>
      <small>
        As contagens de pendentes e vencidas seguem a situação registrada de
        cada mensalidade.
      </small>
      <h2>Carteira atual</h2>
      <div className="fa-metrics">
        {counts.map(([label, n]) => (
          <div className="fa-metric" key={label}>
            <span>{label}</span>
            <strong>{n}</strong>
          </div>
        ))}
      </div>
      <p className="fa-paging">
        <Link href={adminPath + "/barbearias"}>Consultar barbearias →</Link>
      </p>
    </>
  );
}
