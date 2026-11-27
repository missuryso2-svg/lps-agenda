import Link from "next/link";
import { ArrowRight, Banknote, Clock3, Store } from "lucide-react";

import { overview, selectedMonth, type PageProps } from "@/features/admin-billing/data";
import { FinanceHeading } from "@/features/admin-billing/presentation";
import { adminPath, money, period } from "@/features/admin-billing/validation";

export default async function Overview({ searchParams }: PageProps) {
  const m = selectedMonth(await searchParams);
  const data = await overview(m);
  const counts = [
    ["Barbearias cadastradas", data.shops],
    ["Contratos manuais ativos", data.active],
    ["Contratos manuais pendentes", data.pending],
    ["Contratos manuais em atraso", data.past_due],
  ] as const;
  const bills = adminPath + "/mensalidades?mes=" + m + "&situacao=";

  return (
    <>
      <FinanceHeading title="Visão financeira" description="Acompanhe recebimentos, mensalidades e a carteira de barbearias.">
        <Link className="fa-button" href={adminPath + "/barbearias"}>
          <Store size={17} aria-hidden /> Consultar barbearias
        </Link>
      </FinanceHeading>

      <section className="fa-panel fa-panel-main" aria-labelledby="monthly-heading">
        <header className="fa-section-head">
          <div>
            <h2 id="monthly-heading">Mensalidades de {period(m)}</h2>
            <p>Por competência das assinaturas manuais. Em aberto inclui parcelas pendentes e vencidas.</p>
          </div>
          <form method="get" className="fa-filters fa-filters-inline">
            <label>
              Competência
              <input type="month" name="mes" defaultValue={m} required />
            </label>
            <button>Aplicar</button>
          </form>
        </header>
        <dl className="fa-metrics fa-money">
          <div className="fa-metric fa-received">
            <dt><Banknote size={19} aria-hidden /> Recebido</dt>
            <dd>{money(data.received_cents)}</dd>
          </div>
          <div className="fa-metric">
            <dt><Clock3 size={18} aria-hidden /> Em aberto</dt>
            <dd>{money(data.open_cents)}</dd>
          </div>
        </dl>
        <ul className="fa-shortcuts">
          <li><Link href={bills + "pending"}>{data.pending_invoices} {data.pending_invoices === 1 ? "pendente" : "pendentes"} <ArrowRight size={16} aria-hidden /></Link></li>
          <li><Link href={bills + "overdue"}>{data.overdue_invoices} {data.overdue_invoices === 1 ? "vencida" : "vencidas"} <ArrowRight size={16} aria-hidden /></Link></li>
        </ul>
      </section>

      <section className="fa-panel" aria-labelledby="portfolio-heading">
        <header className="fa-section-head">
          <div>
            <h2 id="portfolio-heading">Carteira atual</h2>
            <p>Situação registrada dos contratos manuais.</p>
          </div>
          <Link href={adminPath + "/barbearias?origem=trial"}>Consultar trials <ArrowRight size={16} aria-hidden /></Link>
        </header>
        <dl className="fa-metrics fa-portfolio">
          {counts.map(([label, n]) => (
            <div className="fa-metric" key={label}>
              <dt>{label}</dt>
              <dd>{n}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
