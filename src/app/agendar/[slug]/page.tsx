import {
  CalendarDays,
  Clock3,
  MapPin,
  Phone,
  Scissors,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { hasGuideContent } from "@/features/monetization/placement";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { ConfigRequiredPage } from "@/components/config-required-page";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BookingWizard } from "@/features/public-booking/components/booking-wizard";
import { isPublicBookingConfigured } from "@/features/public-booking/config";
import {
  barbershopAddressLines,
  businessHoursByDay,
  safeHttpUrl,
} from "@/features/public-booking/format";
import { getPublicBookingPage } from "@/features/public-booking/queries";
import { publicSlugSchema } from "@/lib/validation/public-booking";
import { formatCurrencyFromCents, initialsFromName } from "@/lib/format";

type PublicBookingPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PublicBookingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const parsed = publicSlugSchema.safeParse(slug);

  if (!parsed.success || !isPublicBookingConfigured()) {
    return {
      title: "Agendar horário",
      robots: { index: false, follow: false },
    };
  }

  const result = await getPublicBookingPage(parsed.data);

  if (result.status !== "ready") {
    return {
      title: "Agendar horário",
      robots: { index: false, follow: false },
    };
  }

  const shop = result.data.barbershop;

  return {
    title: `Agendar — ${shop.name}`,
    description:
      shop.description?.trim() ||
      `Consulte horários e agende online na ${shop.name}.`,
  };
}

export default async function PublicBookingPage({
  params,
}: PublicBookingPageProps) {
  const { slug } = await params;
  const parsed = publicSlugSchema.safeParse(slug);

  if (!parsed.success) {
    notFound();
  }

  if (!isPublicBookingConfigured()) {
    return (
      <ConfigRequiredPage
        title="Agendamento online indisponível"
        description="O servidor ainda não foi conectado ao Supabase com a credencial administrativa necessária para o fluxo público."
      />
    );
  }

  const result = await getPublicBookingPage(parsed.data);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "inactive") {
    return (
      <PublicMessagePage
        title="Agendamento indisponível"
        description="Esta barbearia não está aceitando reservas online neste momento. Entre em contato diretamente para confirmar os horários."
      />
    );
  }

  if (result.status === "booking_blocked") {
    return (
      <PublicMessagePage
        title="Agendamentos temporariamente indisponíveis"
        description="No momento não é possível criar novas reservas online. Entre em contato diretamente com a barbearia."
      />
    );
  }

  if (result.status === "error") {
    return (
      <PublicMessagePage
        title="Não foi possível abrir a agenda"
        description="Tivemos um problema ao consultar os dados desta barbearia. Tente novamente em alguns instantes."
      />
    );
  }

  const { barbershop: shop, services, barbers, businessHours, dateWindow } =
    result.data;
  const addressLines = barbershopAddressLines(shop);
  const hours = businessHoursByDay(businessHours);
  const coverUrl = safeHttpUrl(shop.coverUrl);
  const logoUrl = safeHttpUrl(shop.logoUrl);

  return (
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" aria-label="LPS Agenda — início">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:inline">
            Agendamento online
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[oklch(0.17_0.006_65)] text-white">
          {coverUrl ? (
            <div
              aria-hidden
              className="absolute inset-0 bg-cover bg-center opacity-25"
              style={{ backgroundImage: `url(${coverUrl})` }}
            />
          ) : null}
          <div className="surface-grain pointer-events-none absolute inset-0 opacity-25" />
          <div className="pointer-events-none absolute -left-24 top-0 size-[26rem] rounded-full bg-gold/15 blur-[120px]" />
          <div className="pointer-events-none absolute -right-16 bottom-0 size-[22rem] rounded-full border border-gold/15" />

          <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-5 pb-14 pt-10 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:pb-20 lg:pt-14">
            <div className="animate-rise">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar className="size-12 rounded-xl after:rounded-xl">
                  {logoUrl ? <AvatarImage src={logoUrl} alt="" /> : null}
                  <AvatarFallback className="rounded-xl bg-gold font-display text-sm text-gold-foreground">
                    {initialsFromName(shop.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                  <Sparkles className="size-3" />
                  Reserva sem login
                </span>
              </div>

              <h1 className="mt-5 font-display text-4xl leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-[4rem]">
                {shop.name}
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base">
                {shop.description?.trim() ||
                  "Escolha o serviço, o profissional e o melhor horário para você. A disponibilidade é conferida na agenda real da barbearia."}
              </p>

              <div className="mt-6 flex flex-col gap-2 text-xs text-white/55 sm:flex-row sm:flex-wrap sm:gap-x-5">
                {addressLines.length > 0 ? (
                  <span className="inline-flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-gold" />
                    {addressLines.join(" · ")}
                  </span>
                ) : null}
                {shop.phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5 text-gold" />
                    {shop.phone}
                  </span>
                ) : null}
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                <Button asChild variant="gold" size="lg">
                  <a href="#agendar">
                    <CalendarDays className="size-4" />
                    Escolher horário
                  </a>
                </Button>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/45">
                  <ShieldCheck className="size-3 text-gold" />
                  Dados usados apenas para a reserva
                </span>
              </div>
            </div>

            <div className="animate-rise-slow rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-gold">
                    Funcionamento
                  </p>
                  <p className="mt-1 font-display text-lg">Horários da casa</p>
                </div>
                <span className="grid size-9 place-items-center rounded-xl border border-gold/30 bg-gold/10 text-gold">
                  <Clock3 className="size-4" />
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {hours.map((day) => (
                  <div
                    key={day.weekday}
                    className="flex items-center justify-between gap-3 text-[11px]"
                  >
                    <span className="text-white/45">{day.label}</span>
                    <span className="text-right font-medium text-white/80">
                      {day.hours}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
                  Serviços
                </p>
                <h2 className="mt-2 font-display text-3xl leading-tight tracking-[-0.03em]">
                  Escolha o cuidado.
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Preço e duração são lidos do catálogo da barbearia e
                  conferidos novamente ao confirmar.
                </p>
              </div>

              <div className="grid gap-3">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-2xl border border-border/80 bg-card p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-gold/25 bg-gold-soft/40 text-gold">
                        <Scissors className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{service.name}</p>
                        {service.description ? (
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            {service.description}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-3 text-gold" />
                            {service.durationMinutes} min
                          </span>
                          <span className="font-medium text-foreground">
                            {formatCurrencyFromCents(service.priceCents)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div id="agendar" className="scroll-mt-24">
              <BookingWizard
                slug={shop.slug}
                timezone={shop.timezone}
                services={services}
                barbers={barbers}
                minDate={dateWindow.min}
                maxDate={dateWindow.max}
              />
            </div>
          </div>
        </section>

        {barbers.length > 0 ? (
          <section className="border-y border-border/70 bg-muted/20">
            <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
                Equipe
              </p>
              <h2 className="mt-2 font-display text-3xl leading-tight tracking-[-0.03em]">
                Quem vai cuidar de você.
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {barbers.map((barber) => (
                  <div
                    key={barber.id}
                    className="flex items-start gap-3 rounded-2xl border border-border/80 bg-card p-4"
                  >
                    <Avatar className="size-10">
                      {safeHttpUrl(barber.avatarUrl) ? (
                        <AvatarImage src={safeHttpUrl(barber.avatarUrl) ?? ""} alt="" />
                      ) : null}
                      <AvatarFallback className="bg-primary font-display text-xs text-gold">
                        {initialsFromName(barber.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {barber.name}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {barber.bio?.trim() ||
                          "Profissional da equipe, disponível para os serviços associados."}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-gold/20 bg-gold-soft/25 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-gold/30 bg-background text-gold">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  Sua reserva tem um código privado.
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Depois de confirmar, guarde o link da página da reserva para
                  consultar os detalhes ou cancelar antes do horário.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="lg">
              <a href="#agendar">Voltar ao formulário</a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-6 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            {shop.name} · agendamento online com LPS Agenda
          </p>
          <div className="flex items-center gap-4">
            {hasGuideContent(result.data) ? (
              <a
                href={`/agendar/${shop.slug}/sobre`}
                rel="noreferrer"
                className="hover:text-foreground"
              >
                Sobre a barbearia
              </a>
            ) : null}
            <Link href="/termos" className="hover:text-foreground">
              Termos
            </Link>
            <Link href="/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/" className="hover:text-foreground">
              Conhecer o LPS Agenda
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PublicMessagePage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="LPS Agenda — início">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16 sm:px-8">
        <div className="w-full max-w-xl rounded-3xl border border-border/80 bg-card p-7 text-center shadow-premium sm:p-10">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-gold/25 bg-gold-soft/40 text-gold">
            <CalendarDays className="size-5" />
          </span>
          <h1 className="mt-5 font-display text-3xl tracking-tight">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          <Button asChild variant="gold" size="lg" className="mt-6">
            <Link href="/">Voltar ao início</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
