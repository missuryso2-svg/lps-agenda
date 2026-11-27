"use client";

export default function FinanceError({ reset }: { reset: () => void }) {
  return (
    <section className="fa-panel fa-state" role="alert">
      <h1>Consulta indisponível</h1>
      <p>Não foi possível carregar os dados financeiros.</p>
      <button className="fa-primary" onClick={reset}>Tentar novamente</button>
    </section>
  );
}
