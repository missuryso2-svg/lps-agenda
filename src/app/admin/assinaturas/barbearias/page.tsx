import {
  directory,
  pageURL,
  param,
  size,
  type PageProps,
} from "@/features/admin-billing/data";
import { adminPath, originLabels } from "@/features/admin-billing/validation";
import { Shops, Paging } from "@/features/admin-billing/lists";

export default async function Directory({ searchParams }: PageProps) {
  const q = await searchParams,
    rows = await directory(q),
    path = adminPath + "/barbearias";
  return (
    <>
      <h1>Barbearias</h1>
      <form className="fa-filters">
        <label>
          Início do nome
          <input
            name="nome"
            maxLength={80}
            defaultValue={param(q, "nome") ?? ""}
          />
        </label>
        <label>
          Origem
          <select name="origem" defaultValue={param(q, "origem") ?? ""}>
            <option value="">Todas</option>
            {Object.entries(originLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button>Filtrar</button>
      </form>
      <Shops rows={rows} />
      <Paging
        first={(q.apos && pageURL(path, q, { apos: null })) || null}
        next={
          rows.length > size
            ? pageURL(path, q, { apos: rows[size - 1].shop })
            : null
        }
      />
    </>
  );
}
