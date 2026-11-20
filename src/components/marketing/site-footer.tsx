import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Logo, SolutionsLogo } from "@/components/brand/logo";

const productLinks = [
  { href: "/#recursos", label: "Recursos" },
  { href: "/#planos", label: "Planos" },
  { href: "/barbearia/barbearia-aurora", label: "Demonstração" },
  { href: "/login", label: "Entrar" },
];

const companyLinks = [
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#faq", label: "Perguntas frequentes" },
  { href: "/cadastro", label: "Criar conta" },
];

const legalLinks = [
  { href: "/termos", label: "Termos de uso" },
  { href: "/privacidade", label: "Privacidade" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-white/15 bg-[#141617] text-white">
      <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div>
            <Logo tone="inverse" />
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-white/55">
              Agenda, equipe e serviços em um só lugar para quem vive o dia a dia da barbearia.
            </p>

          </div>

          <FooterColumn title="Produto" links={productLinks} />
          <FooterColumn title="Plataforma" links={companyLinks} />
          <FooterColumn title="Legal" links={legalLinks} />
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-6 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-white/65">
            © {new Date().getFullYear()} LPS Solutions. Todos os direitos
            reservados.
          </p>
          <SolutionsLogo />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ffdb16]">
        {title}
      </h3>
      <ul className="mt-5 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="group inline-flex items-center gap-1 text-sm text-white/60 transition-colors hover:text-white"
            >
              {link.label}
              <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
