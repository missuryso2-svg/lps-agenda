export default function Loading() {
  return (
    <section className="fa-panel" aria-busy="true">
      <p role="status">Carregando dados financeiros…</p>
      <div className="fa-skeleton" aria-hidden />
    </section>
  );
}
