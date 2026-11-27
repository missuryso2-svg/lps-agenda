import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { SolutionsLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { FinanceNav } from "@/features/admin-billing/navigation";
import { requireFinancialAdmin } from "@/lib/auth/financial-admin";
import "./finance.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Administração financeira · LPS Solutions",
  robots: { index: false, follow: false },
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { user, level } = await requireFinancialAdmin();
  return (
    <div className="fa-shell">
      <a href="#finance-main" className="fa-skip">Ir para o conteúdo</a>
      <aside className="fa-rail">
        <header className="fa-brand">
          <div>
            <SolutionsLogo />
            <p>Painel financeiro</p>
          </div>
          <ThemeToggle className="fa-theme" />
        </header>
        <FinanceNav manager={level === "manager"} />
        <footer className="fa-account">
          <ShieldCheck size={17} aria-hidden />
          <div>
            <strong>{level === "manager" ? "Gestor financeiro" : "Operador financeiro"}</strong>
            <span>{user.email ?? user.id}</span>
          </div>
        </footer>
      </aside>
      <main id="finance-main" className="fa-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
