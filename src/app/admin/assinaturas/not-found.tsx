import Link from "next/link";
import { adminPath } from "@/features/admin-billing/validation";

export default function NotFound() {
  return (
    <section className="fa-panel fa-state">
      <h1>Consulta indisponível</h1>
      <p>Confira o identificador, os filtros e o período informados.</p>
      <Link className="fa-button" href={adminPath}>Voltar à visão geral</Link>
    </section>
  );
}
