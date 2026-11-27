export function InvoiceFilters({
  month,
  state,
  optionalMonth = false,
}: {
  month: string;
  state: string;
  optionalMonth?: boolean;
}) {
  return (
    <form method="get" className="fa-filters">
      <label>
        Competência
        <input
          type="month"
          name="mes"
          required={!optionalMonth}
          defaultValue={month}
        />
      </label>
      <label>
        Situação
        <select name="situacao" defaultValue={state}>
          <option value="">Todas</option>
          <option value="pending">Pendentes</option>
          <option value="overdue">Vencidas</option>
          <option value="paid">Pagas</option>
          <option value="cancelled">Canceladas</option>
        </select>
      </label>
      <button className="fa-primary">Filtrar</button>
    </form>
  );
}
