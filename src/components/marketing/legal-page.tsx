import Link from "next/link";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

export type LegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export function LegalPage({
  eyebrow,
  title,
  intro,
  updatedAt,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="surface-grain pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 lg:py-20">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-gold">
              {eyebrow}
            </p>
            <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.02] tracking-[-0.04em] sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {intro}
            </p>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Última atualização: {updatedAt}
            </p>
          </div>
        </section>

        <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[13rem_1fr] lg:gap-14 lg:py-20">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Nesta página
            </p>
            <nav className="mt-3 flex flex-col gap-1.5" aria-label="Seções">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="rounded-lg py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {section.title}
                </a>
              ))}
            </nav>
            <div className="mt-6 rounded-xl border border-gold/20 bg-gold-soft/25 p-3">
              <p className="text-[11px] font-medium">Documento de fundação</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Este texto descreve a versão atual do produto e será revisado
                antes da operação comercial.
              </p>
            </div>
          </aside>

          <article className="min-w-0 space-y-10">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28">
                <h2 className="font-display text-2xl tracking-tight">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-3">
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-relaxed text-muted-foreground"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
                {section.bullets && section.bullets.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
                      >
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-gold" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            <div className="rounded-2xl border border-border/80 bg-card p-5">
              <p className="text-sm font-medium">Precisa falar com a LPS?</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Os canais oficiais de atendimento serão publicados junto com a
                operação comercial. Para conhecer o produto, volte à{" "}
                <Link
                  href="/"
                  className="font-medium text-foreground underline decoration-gold/50 underline-offset-4 hover:text-gold"
                >
                  página inicial
                </Link>{" "}
                ou abra a{" "}
                <Link
                  href="/barbearia/barbearia-aurora"
                  className="font-medium text-foreground underline decoration-gold/50 underline-offset-4 hover:text-gold"
                >
                  demonstração
                </Link>
                .
              </p>
            </div>
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
