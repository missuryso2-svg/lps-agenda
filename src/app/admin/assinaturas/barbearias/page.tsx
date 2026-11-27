import Link from "next/link";
import { Search } from "lucide-react";

import { directory, pageURL, param, size, type PageProps } from "@/features/admin-billing/data";
import { Paging, Shops } from "@/features/admin-billing/lists";
import { FinanceHeading } from "@/features/admin-billing/presentation";
import { adminPath, originLabels } from "@/features/admin-billing/validation";

export default async function Directory({ searchParams }: PageProps) {
  const q = await searchParams;
  const rows = await directory(q);
  const path = adminPath + "/barbearias";
  const name = param(q, "nome");
  const origin = param(q, "origem");
  const trial = param(q, "teste");

  return (
    <>
      <FinanceHeading title="Barbearias" description="Consulte contratos, cobertura e benefícios ativos ou encerrados." />
      <section className="fa-panel" aria-label="Carteira de barbearias">
        <form method="get" className="fa-filters">
          <label className="fa-search">
            Início do nome
            <input name="nome" maxLength={80} defaultValue={name ?? ""} placeholder="Nome da barbearia" />
          </label>
          <label>
            Origem
            <select name="origem" defaultValue={origin ?? ""}>
              <option value="">Todas</option>
              {Object.entries(originLabels).filter(([value]) => value !== "automatic_trial").map(([value, label]) => (
                <option key={value} value={value}>{value === "trial" ? "Trials" : label}</option>
              ))}
            </select>
          </label>
          <label>
            Situação do trial
            <select name="teste" defaultValue={trial ?? ""}>
              <option value="">Todas</option>
              <option value="active">Vigentes</option>
              <option value="expired">Expirados</option>
              <option value="ending_soon">Vencem em até três dias</option>
              <option value="last_day">Último dia</option>
            </select>
          </label>
          <button className="fa-primary"><Search size={16} aria-hidden /> Filtrar</button>
          {(name || origin || trial) && <Link className="fa-button fa-clear" href={path}>Limpar filtros</Link>}
        </form>
        <p className="fa-result-count">{Math.min(rows.length, size)} {rows.length === 1 ? "barbearia nesta página" : "barbearias nesta página"}</p>
        <Shops rows={rows} />
        <Paging
          first={q.apos ? pageURL(path, q, { apos: null }) : null}
          next={rows.length > size ? pageURL(path, q, { apos: rows[size - 1].shop }) : null}
        />
      </section>
    </>
  );
}
