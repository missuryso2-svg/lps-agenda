import type { Metadata } from "next";
import { requireFinancialAdmin } from "@/lib/auth/financial-admin";
import { FinanceNav } from "@/features/admin-billing/navigation";
import "./finance.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Administração financeira · LPS Solutions",
  robots: { index: false, follow: false },
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, level } = await requireFinancialAdmin();
  return (
    <div className="fa-shell">
      <a href="#finance-main" className="fa-skip">
        Ir para o conteúdo
      </a>
      <aside className="fa-rail">
        <header className="fa-brand">
          <span aria-hidden="true">LPS</span>
          <div>
            LPS Solutions<small>Administração financeira</small>
          </div>
        </header>
        <FinanceNav manager={level === "manager"} />
        <footer>
          <strong>
            {level === "manager" ? "Gestor financeiro" : "Operador financeiro"}
          </strong>
          <span>{user.email ?? user.id}</span>
        </footer>
      </aside>
      <main id="finance-main" className="fa-main">
        {children}
      </main>
    </div>
  );
}
