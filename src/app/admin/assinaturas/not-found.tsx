import Link from "next/link";
import { adminPath } from "@/features/admin-billing/validation";
export default function NotFound() {
  return (
    <section>
      <h1>Consulta indisponível</h1>
      <p>Confira o identificador, os filtros e o período informados.</p>
      <Link href={adminPath}>Voltar à visão geral</Link>
    </section>
  );
}
