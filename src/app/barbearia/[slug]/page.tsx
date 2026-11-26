import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  FlaskConical,
  MapPin,
  Phone,
  Scissors,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { PrototypeAction } from "@/components/prototype-action";
import { Button } from "@/components/ui/button";
import {
  demoBarbershops,
  getDemoBarbershop,
} from "@/features/public-barbershop/demo-data";
import { premiumTrialCTA } from "@/features/premium-trial/copy";
import { automaticTrialAvailable } from "@/features/premium-trial/queries";
import { formatCurrencyFromCents, initialsFromName } from "@/lib/format";

type PublicBarbershopPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return demoBarbershops.map((shop) => ({ slug: shop.slug }));
}

export async function generateMetadata({
  params,
}: PublicBarbershopPageProps): Promise<Metadata> {
  const { slug } = await params;
  const shop = getDemoBarbershop(slug);

  if (!shop) {
    return { title: "Barbearia não encontrada" };
  }

  return {
    title: `${shop.name} — demonstração`,
    description: `${shop.tagline} Página de demonstração com dados fictícios, criada para apresentar a experiência pública do LPS Agenda.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function PublicBarbershopPage({
  params,
}: PublicBarbershopPageProps) {
  const { slug } = await params;
  const shop = getDemoBarbershop(slug);

  if (!shop) {
    notFound();
  }

  const trialAvailable = await automaticTrialAvailable();

  return (
    <>
      <SiteHeader />

      <div className="border-b border-gold/25 bg-gold-soft/35">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-5 py-2.5 text-[11px] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <FlaskConical className="size-3.5 text-gold" />
            Ambiente de demonstração — barbearia, equipe, preços e avaliações
            fictícios.
          </p>
          <Link
            href="/cadastro"
            className="inline-flex items-center gap-1 text-muted-foreground underline decoration-gold/40 underline-offset-4 transition-colors hover:text-foreground"
          >
            {trialAvailable ? premiumTrialCTA : "Criar a página da minha barbearia"}
            <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </div>

      <main className="flex-1">
        <section className="relative overflow-hidden bg-[oklch(0.17_0.006_65)] text-white">
          <div className="surface-grain pointer-events-none absolute inset-0 opacity-25" />
          <div className="pointer-events-none absolute -left-24 top-0 size-[28rem] rounded-full bg-gold/15 blur-[120px]" />
          <div className="pointer-events-none absolute -right-20 bottom-0 size-[24rem] rounded-full border border-gold/15" />

          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:pb-24 lg:pt-20">
            <div className="animate-rise">
              <div className="inline-flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                  <Sparkles className="size-3" />
                  Demonstração
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-white/50">
                  <MapPin className="size-3" />
                  {shop.neighborhood} · {shop.city}
                </span>
              </div>

              <h1 className="mt-6 font-display text-[3.2rem] leading-[0.98] tracking-[-0.04em] sm:text-6xl lg:text-[4.4rem]">
                {shop.name}
                <span className="mt-2 block italic text-gold">
                  {shop.tagline}
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base">
                {shop.description}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <PrototypeAction
                  triggerLabel="Agendar horário"
                  triggerVariant="gold"
                  triggerSize="xl"
                  title="Agendamento online em construção"
                  description="Esta é uma demonstração visual. O agendamento online ainda não está disponível e nenhum horário será reservado."
                  steps={[
                    {
                      title: "Escolha do serviço",
                      description:
                        "O cliente verá duração, preço e profissionais habilitados.",
                    },
                    {
                      title: "Horários disponíveis",
                      description:
                        "Disponibilidade calculada a partir do expediente e da agenda real.",
                    },
                    {
                      title: "Confirmação",
                      description:
                        "Reserva com status, lembrete e histórico para a barbearia.",
                    },
                  ]}
                  footnote="O botão é um protótipo identificado no ambiente de demonstração. Nenhum dado é coletado."
                />
                <Button
                  asChild
                  variant="outline"
                  size="xl"
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="#servicos">
                    Ver serviços
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>

              <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-6">
                {shop.stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="font-display text-2xl text-gold sm:text-3xl">
                      {stat.value}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/40">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-rise-slow relative">
              <div className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-gold/10 blur-2xl" />
              <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.06] p-2 backdrop-blur-sm">
                <div className="rounded-[1.25rem] border border-white/10 bg-[oklch(0.195_0.007_65)] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-gold">
                        Hoje na Aurora
                      </p>
                      <p className="mt-1 font-display text-xl">Sua visita</p>
                    </div>
                    <span className="grid size-9 place-items-center rounded-xl border border-gold/30 bg-gold/10 text-gold">
                      <CalendarDays className="size-4" />
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {shop.hours.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-white/50">{item.label}</span>
                        <span className="font-medium text-white/85">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
                      <ShieldCheck className="size-3" />
                      Experiência LPS Agenda
                    </p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">
                      Página pública, serviços e equipe em uma apresentação
                      consistente — preparada para receber o agendamento real na
                      próxima etapa.
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {["Corte na tesoura", "Barba na navalha", "Atendimento por hora"].map(
                      (item) => (
                        <span
                          key={item}
                          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-white/55"
                        >
                          <Check className="size-2.5 text-gold" />
                          {item}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="servicos" className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
                Serviços
              </p>
              <h2 className="mt-2 font-display text-3xl leading-tight tracking-[-0.03em] sm:text-4xl">
                Cuidado com tempo e técnica.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Valores e durações ilustrativos, apresentados como o cliente
                final veria na página da barbearia.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 py-1.5 text-[10px] text-muted-foreground">
              <FlaskConical className="size-3 text-gold" />
              Dados fictícios
            </span>
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-2">
            {shop.services.map((service, index) => (
              <div
                key={service.name}
                className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 transition-colors hover:border-gold/30 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-9 place-items-center rounded-xl border border-gold/25 bg-gold-soft/40 text-gold">
                    <Scissors className="size-4" />
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-xl tracking-tight">
                  {service.name}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {service.description}
                </p>
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/70 pt-4">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock3 className="size-3.5 text-gold" />
                    {service.durationMinutes} min
                  </span>
                  <span className="font-display text-lg tracking-tight">
                    {formatCurrencyFromCents(service.priceCents)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border/70 bg-muted/20">
          <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
                  Equipe
                </p>
                <h2 className="mt-2 font-display text-3xl leading-tight tracking-[-0.03em] sm:text-4xl">
                  Quem cuida do seu corte.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Profissionais com estilos complementares, apresentados com
                  clareza para o cliente escolher com quem se identifica.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border/80 bg-card px-3.5 py-2.5 text-[11px] text-muted-foreground">
                  <UsersRound className="size-4 text-gold" />
                  Perfis fictícios desta demonstração
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {shop.team.map((member, index) => (
                  <div
                    key={member.name}
                    className={
                      index === 0
                        ? "rounded-2xl border border-gold/25 bg-card p-5 shadow-premium sm:col-span-2 sm:flex sm:items-start sm:gap-4"
                        : "rounded-2xl border border-border/80 bg-card p-5"
                    }
                  >
                    <span
                      className={
                        index === 0
                          ? "grid size-14 shrink-0 place-items-center rounded-2xl bg-primary font-display text-lg text-gold"
                          : "grid size-11 place-items-center rounded-xl border border-border/80 bg-muted/40 font-display text-sm"
                      }
                    >
                      {initialsFromName(member.name)}
                    </span>
                    <div className={index === 0 ? "mt-4 sm:mt-0" : "mt-3"}>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
                        {member.role}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {member.bio}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-premium sm:p-8">
              <span className="grid size-10 place-items-center rounded-xl border border-gold/25 bg-gold-soft/40 text-gold">
                <Clock3 className="size-4" />
              </span>
              <h2 className="mt-5 font-display text-2xl tracking-tight">
                Horários de funcionamento
              </h2>
              <div className="mt-5 space-y-3">
                {shop.hours.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 text-sm last:border-0 last:pb-0"
                  >
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
                Horários ilustrativos. A disponibilidade real dependerá da
                agenda e da jornada de cada profissional.
              </p>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card p-6 shadow-premium sm:p-8">
              <div className="surface-grain pointer-events-none absolute inset-0 opacity-60" />
              <div className="relative">
                <span className="grid size-10 place-items-center rounded-xl border border-gold/25 bg-gold-soft/40 text-gold">
                  <MapPin className="size-4" />
                </span>
                <h2 className="mt-5 font-display text-2xl tracking-tight">
                  Onde encontrar
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {shop.address}
                </p>
                <div className="mt-5 flex flex-col gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Phone className="size-3.5 text-gold" />
                    {shop.phone}
                    <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60">
                      ilustrativo
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Scissors className="size-3.5 text-gold" />
                    Atendimento com hora marcada
                  </span>
                </div>
                <div className="mt-6 rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center">
                  <MapPin className="mx-auto size-5 text-gold" />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Mapa e rota serão exibidos na versão pública completa.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-muted/20">
          <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
                  Experiência
                </p>
                <h2 className="mt-2 font-display text-3xl leading-tight tracking-[-0.03em] sm:text-4xl">
                  O que a casa promete.
                </h2>
              </div>
              <span className="inline-flex w-fit items-center gap-1.5 text-[10px] text-muted-foreground">
                <FlaskConical className="size-3 text-gold" />
                Avaliações ilustrativas
              </span>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {shop.reviews.map((review) => (
                <figure
                  key={review.name}
                  className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6"
                >
                  <div className="flex items-center gap-0.5 text-gold">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star
                        key={index}
                        className="size-3.5 fill-current"
                        aria-hidden
                      />
                    ))}
                    <span className="sr-only">Avaliação ilustrativa de 5 estrelas</span>
                  </div>
                  <blockquote className="mt-4 text-sm leading-relaxed text-foreground/85">
                    “{review.text}”
                  </blockquote>
                  <figcaption className="mt-5 border-t border-border/70 pt-4">
                    <p className="text-xs font-medium">{review.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {review.context}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
          <div className="relative overflow-hidden rounded-[2rem] border border-gold/20 bg-[oklch(0.17_0.006_65)] px-6 py-12 text-white sm:px-10 lg:px-14">
            <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-gold/15 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
                  <Sparkles className="size-3" />
                  LPS Agenda
                </p>
                <h2 className="mt-3 max-w-2xl font-display text-3xl leading-tight tracking-[-0.03em] sm:text-4xl">
                  Sua barbearia também pode ter uma presença assim.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55">
                  Esta é uma página de demonstração criada com dados fictícios.
                  O LPS Agenda está sendo construído para transformar a operação
                  real da sua barbearia em uma experiência clara e segura.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                <Button asChild variant="gold" size="xl">
                  <Link href="/cadastro">
                    Criar minha conta
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="xl"
                  className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/">Conhecer o LPS Agenda</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
