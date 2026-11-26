import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo, SolutionsLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";

import "./account.css";

export function AccountShell({
  children,
  onboardingAside,
  email,
}: {
  children: ReactNode;
  onboardingAside?: ReactNode;
  email?: string;
}) {
  return (
    <div className="account-experience">
      <a className="account-skip" href="#conteudo">Ir para o conteúdo</a>
      <header className="account-header">
        <div className="account-wrap">
          <Link className="account-brand" href="/" aria-label="LPS Agenda — início">
            <Logo />
          </Link>
          <div className="account-header-actions">
            {email ? (
              <span className="account-header-email">{email}</span>
            ) : (
              <Link className="account-back" href="/">
                <ArrowLeft size={16} aria-hidden /> Voltar ao site
              </Link>
            )}
            <ThemeToggle className="account-theme" />
          </div>
        </div>
      </header>

      <main
        id="conteudo"
        tabIndex={-1}
        className="account-wrap account-layout"
        data-onboarding={onboardingAside ? "" : undefined}
      >
        {onboardingAside ?? (
          <aside className="account-editorial" aria-hidden="true">
            <div className="account-photo" />
            <p>Agenda, equipe e serviços<br />em um só lugar.</p>
          </aside>
        )}
        <div className="account-panel">{children}</div>
      </main>

      <footer className="account-footer account-wrap">
        <p>© {new Date().getFullYear()} LPS Solutions</p>
        <span className="account-footer-mark"><SolutionsLogo /></span>
      </footer>
    </div>
  );
}

export function AccountHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="account-heading">
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  );
}
