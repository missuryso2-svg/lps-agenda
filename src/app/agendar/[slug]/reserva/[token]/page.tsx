import {
  ArrowLeft,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MapPin,
  Scissors,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { AppointmentStatusBadge } from "@/components/dashboard/status-badge";
import { ConfigRequiredPage } from "@/components/config-required-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CancelReservationButton } from "@/features/public-booking/components/cancel-reservation-button";
import { isPublicBookingConfigured } from "@/features/public-booking/config";
import { barbershopAddressLines } from "@/features/public-booking/format";
import { getPublicReservation } from "@/features/public-booking/queries";
import type { AppointmentStatus } from "@/features/public-booking/types";
import {
  formatCurrencyFromCents,
  formatDateBR,
  formatTimeBR,
} from "@/lib/format";
import {
  publicSlugSchema,
  publicTokenSchema,
} from "@/lib/validation/public-booking";

type ReservationPageProps = {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ novo?: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sua reserva",
  robots: { index: false, follow: false },
};

const statusMessages: Record<AppointmentStatus, string> = {
  scheduled:
    "Sua reserva foi registrada. A barbearia pode confirmar o horário pelo painel.",
  confirmed: "Horário confirmado pela barbearia.",
  in_progress: "O atendimento está em andamento.",
  completed: "Atendimento concluído. Obrigado pela visita!",
  cancelled: "Esta reserva foi cancelada e o horário já está liberado.",
  no_show: "A barbearia registrou ausência neste horário.",
};

export default async function ReservationPage({
  params,
  searchParams,
}: ReservationPageProps) {
  const [{ slug, token }, query] = await Promise.all([params, searchParams]);
  const parsedSlug = publicSlugSchema.safeParse(slug);
  const parsedToken = publicTokenSchema.safeParse(token);

  if (!parsedSlug.success || !parsedToken.success) {
    notFound();
  }

  if (!isPublicBookingConfigured()) {
    return (
      <ConfigRequiredPage
        title="Consulta de reserva indisponível"
        description="O servidor ainda não foi conectado ao Supabase com a credencial administrativa necessária para consultar a reserva."
      />
    );
  }

  const result = await getPublicReservation(parsedSlug.data, parsedToken.data);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <ReservationMessagePage
        title="Não foi possível consultar a reserva"
        description="Tivemos um problema ao ler os dados agora. Tente novamente em alguns instantes."
      />
    );
  }

  const reservation = result.data;
  const shop = reservation.barbershop;
  const addressLines = barbershopAddressLines(shop);
  const isNew = query.novo === "1";
  const active =
    reservation.status === "scheduled" ||
    reservation.status === "confirmed" ||
    reservation.status === "in_progress";
  const statusMessage = statusMessages[reservation.status];

  return (
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" aria-label="LPS Agenda — início">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:inline">
            Consulta de reserva
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-16 pt-4 sm:px-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
          <Link href={`/agendar/${shop.slug}`}>
            <ArrowLeft className="size-3.5" />
            {shop.name}
          </Link>
        </Button>

        {isNew && active ? (
          <Alert className="mb-5 border-emerald-500/30 bg-emerald-500/5 p-4">
            <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" />
            <AlertTitle>Reserva confirmada</AlertTitle>
            <AlertDescription>
              Guarde o endereço desta página. Ele é o seu código privado para
              consultar ou cancelar a reserva antes do horário.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="overflow-hidden rounded-[1.75rem] border border-border/80 bg-card shadow-premium">
            <div className="border-b border-border/70 bg-[oklch(0.17_0.006_65)] px-5 py-6 text-white sm:px-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-gold">
                    Sua reserva
                  </p>
                  <h1 className="mt-2 font-display text-3xl leading-tight tracking-[-0.03em]">
                    {shop.name}
                  </h1>
                </div>
                <AppointmentStatusBadge status={reservation.status} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/55">
                {statusMessage}
              </p>
            </div>

            <div className="space-y-5 px-5 py-6 sm:px-7">
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail
                  icon={Scissors}
                  label="Serviço"
                  value={reservation.serviceName}
                />
                <Detail
                  icon={UserRound}
                  label="Profissional"
                  value={reservation.barberName}
                />
                <Detail
                  icon={CalendarDays}
                  label="Data"
                  value={formatDateBR(
                    reservation.startsAt,
                    shop.timezone,
                  )}
                />
                <Detail
                  icon={Clock3}
                  label="Horário"
                  value={`${formatTimeBR(
                    reservation.startsAt,
                    shop.timezone,
                  )} – ${formatTimeBR(reservation.endsAt, shop.timezone)}`}
                />
              </div>

              <div className="flex items-end justify-between gap-3 rounded-xl border border-gold/25 bg-gold-soft/25 px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Valor do serviço
                  </p>
                  <p className="mt-1 font-display text-2xl tracking-tight">
                    {formatCurrencyFromCents(reservation.priceCents)}
                  </p>
                </div>
                <p className="text-right text-[10px] leading-relaxed text-muted-foreground">
                  Pagamento combinado
                  <br />
                  diretamente na barbearia
                </p>
              </div>

              {addressLines.length > 0 || shop.phone ? (
                <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Onde encontrar
                  </p>
                  {addressLines.length > 0 ? (
                    <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs leading-relaxed">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-gold" />
                      {addressLines.join(" · ")}
                    </p>
                  ) : null}
                  {shop.phone ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Telefone: {shop.phone}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 border-t border-border/70 pt-4">
                {reservation.canCancel ? (
                  <CancelReservationButton
                    slug={shop.slug}
                    token={reservation.token}
                    serviceName={reservation.serviceName}
                    dateLabel={formatDateBR(
                      reservation.startsAt,
                      shop.timezone,
                    )}
                    timeLabel={formatTimeBR(
                      reservation.startsAt,
                      shop.timezone,
                    )}
                  />
                ) : null}
                {active ? (
                  <Button asChild variant="outline" size="lg">
                    <Link href={`/agendar/${shop.slug}`}>
                      <CalendarDays className="size-4" />
                      Agendar outro horário
                    </Link>
                  </Button>
                ) : (
                  <Button asChild variant="gold" size="lg">
                    <Link href={`/agendar/${shop.slug}`}>
                      <CalendarX2 className="size-4" />
                      Fazer nova reserva
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border/80 bg-card p-5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">
                <LockKeyhole className="size-3" />
                Link privado
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Este endereço funciona como uma chave da reserva. Não o
                compartilhe em redes públicas. Quem tiver o link consegue ver o
                horário e cancelar a reserva.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/20 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Cliente
              </p>
              <p className="mt-1.5 text-sm font-medium">
                {reservation.customerName}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                A barbearia consegue localizar sua reserva por este nome e pelo
                telefone informado no agendamento.
              </p>
            </div>

            <div className="rounded-2xl border border-gold/20 bg-gold-soft/25 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">
                Precisa mudar?
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                O cancelamento pelo link fica disponível até o horário de início
                do atendimento. Depois disso, fale diretamente com a barbearia.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="size-3 text-gold" />
        {label}
      </p>
      <p className="mt-1.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function ReservationMessagePage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
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
