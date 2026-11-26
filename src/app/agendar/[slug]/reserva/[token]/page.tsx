import { ArrowLeft, CalendarDays, CheckCircle2, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { AppointmentStatusBadge } from "@/components/dashboard/status-badge";
import { CancelReservationButton } from "@/features/public-booking/components/cancel-reservation-button";
import { isPublicBookingConfigured } from "@/features/public-booking/config";
import { barbershopAddressLines } from "@/features/public-booking/format";
import { getPublicReservation } from "@/features/public-booking/queries";
import type { AppointmentStatus } from "@/features/public-booking/types";
import { formatCurrencyFromCents, formatDateBR, formatTimeBR } from "@/lib/format";
import { publicSlugSchema, publicTokenSchema } from "@/lib/validation/public-booking";
import "@/features/public-booking/booking-j2.css";

type PageProps = {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ novo?: string }>;
};

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sua reserva",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const statusMessages: Record<AppointmentStatus, string> = {
  scheduled: "Sua reserva foi registrada. A barbearia pode confirmar o horário pelo painel.",
  confirmed: "Horário confirmado pela barbearia.",
  in_progress: "O atendimento está em andamento.",
  completed: "Atendimento concluído. Obrigado pela visita!",
  cancelled: "Esta reserva foi cancelada e o horário já está liberado.",
  no_show: "A barbearia registrou ausência neste horário.",
};

function Header() {
  return (
    <header className="j2-book-header">
      <Link href="/" aria-label="LPS Agenda — início"><Logo /></Link>
      <ThemeToggle />
    </header>
  );
}

function ReservationUnavailable() {
  return (
    <div className="j2-book">
      <Header />
      <main className="j2-book-wrap">
        <section className="j2-book-panel j2-book-unavailable">
          <CalendarDays size={28} aria-hidden />
          <h1>Não foi possível consultar a reserva</h1>
          <p>Confira o link ou tente novamente em alguns instantes.</p>
        </section>
      </main>
    </div>
  );
}

export default async function ReservationPage({ params, searchParams }: PageProps) {
  const [{ slug, token }, query] = await Promise.all([params, searchParams]);
  const parsedSlug = publicSlugSchema.safeParse(slug);
  const parsedToken = publicTokenSchema.safeParse(token);
  if (!parsedSlug.success || !parsedToken.success) notFound();
  if (!isPublicBookingConfigured()) return <ReservationUnavailable />;

  const result = await getPublicReservation(parsedSlug.data, parsedToken.data);
  if (result.status === "not_found") notFound();
  if (result.status === "error") return <ReservationUnavailable />;

  const reservation = result.data;
  const shop = reservation.barbershop;
  const active = ["scheduled", "confirmed", "in_progress"].includes(reservation.status);
  const isNew = query.novo === "1" && active;
  const address = barbershopAddressLines(shop);
  const date = formatDateBR(reservation.startsAt, shop.timezone);
  const start = formatTimeBR(reservation.startsAt, shop.timezone);
  const end = formatTimeBR(reservation.endsAt, shop.timezone);
  const duration = Math.round((Date.parse(reservation.endsAt) - Date.parse(reservation.startsAt)) / 60000);

  return (
    <div className="j2-book">
      <Header />
      <main className="j2-book-wrap">
        <Link href={"/agendar/" + shop.slug} className="j2-book-back"><ArrowLeft size={16} aria-hidden /> Voltar à agenda</Link>
        <article className="j2-book-panel j2-book-confirmation" aria-labelledby="reservation-title">
          <header>
            {isNew && <CheckCircle2 className="j2-book-confirmed-icon" size={34} aria-hidden />}
            <h1 id="reservation-title">{isNew ? "Seu agendamento foi realizado com sucesso!" : "Sua reserva"}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{shop.name}</p>
              <AppointmentStatusBadge status={reservation.status} />
            </div>
            <p className="j2-book-meta">{statusMessages[reservation.status]}</p>
          </header>

          <section className="j2-book-summary" aria-label="Detalhes da reserva">
            <dl>
              <div><dt>Serviço</dt><dd>{reservation.serviceName}</dd></div>
              <div><dt>Profissional</dt><dd>{reservation.barberName}</dd></div>
              <div><dt>Data</dt><dd>{date}</dd></div>
              <div><dt>Horário</dt><dd>{start} até {end}</dd></div>
              <div><dt>Duração</dt><dd>{duration} min</dd></div>
              <div><dt>Valor</dt><dd>{formatCurrencyFromCents(reservation.priceCents)}</dd></div>
            </dl>
          </section>
          {address.length > 0 && <p className="j2-book-meta">Localização · {address.join(" · ")}</p>}
          {shop.phone && <p className="j2-book-meta">Telefone da barbearia · {shop.phone}</p>}
          <div className="j2-book-message">
            <p className="flex items-center gap-2 font-semibold"><LockKeyhole size={16} aria-hidden /> Guarde seu link privado</p>
            <p className="j2-book-meta mt-1">Use este endereço para consultar a reserva. Quando disponível, o cancelamento pode ser feito nesta página.</p>
          </div>
          <div className="j2-book-confirmation-actions">
            {reservation.canCancel && (
              <CancelReservationButton
                slug={shop.slug} token={reservation.token}
                serviceName={reservation.serviceName} dateLabel={date} timeLabel={start}
              />
            )}
            <Link href={"/agendar/" + shop.slug} className="j2-book-primary">
              {active ? "Agendar outro horário" : "Fazer nova reserva"}
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
}
