"use client";
export default function FinanceError({ reset }: { reset: () => void }) {
  return (
    <section role="alert">
      <h1>Consulta indisponível</h1>
      <p>Não foi possível carregar os dados financeiros.</p>
      <button onClick={reset}>Tentar novamente</button>
    </section>
  );
}
