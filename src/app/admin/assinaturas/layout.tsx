import type { Metadata } from "next";
import { requireFinancialAdmin } from "@/lib/auth/financial-admin";
import { FinanceNav } from "@/features/admin-billing/navigation";
import { SolutionsLogo } from "@/components/brand/logo";
import { ShieldCheck } from "lucide-react";
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
          <SolutionsLogo />
          <small>Administração financeira</small>
        </header>
        <FinanceNav manager={level === "manager"} />
        <footer>
          <strong>
            <ShieldCheck size={16} aria-hidden="true" />
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
