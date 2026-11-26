import { ArrowDown, CalendarDays, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { isBarbershopLogoObject } from "@/features/barbershop/logo-policy";
import { hasGuideContent } from "@/features/monetization/placement";
import { BookingWizard } from "@/features/public-booking/components/booking-wizard";
import { isPublicBookingConfigured } from "@/features/public-booking/config";
import { barbershopAddressLines, businessHoursByDay, publicLegacyImageUrl, safeHttpUrl } from "@/features/public-booking/format";
import { getPublicBookingPage } from "@/features/public-booking/queries";
import { formatPhoneBR, initialsFromName } from "@/lib/format";
import { publicSlugSchema } from "@/lib/validation/public-booking";
import "@/features/public-booking/booking-j2.css";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const parsed = publicSlugSchema.safeParse((await params).slug);
  if (parsed.success && isPublicBookingConfigured()) {
    const result = await getPublicBookingPage(parsed.data);
    if (result.status === "ready") {
      const { barbershop } = result.data;
      return {
        title: "Agendar — " + barbershop.name,
        description: barbershop.description?.trim() || "Consulte horários e agende na " + barbershop.name + ".",
      };
    }
  }

  return { title: "Agendar horário", robots: { index: false, follow: false } };
}

function BookingHeader({ details }: { details?: boolean }) {
  return (
    <header className="j2-book-header">
      <Link href="/" aria-label="LPS Agenda — início"><Logo /></Link>
      <div>
        {details && <a href="#informacoes">Informações</a>}
        <ThemeToggle />
      </div>
    </header>
  );
}

function UnavailablePage({ temporary = false }: { temporary?: boolean }) {
  return (
    <div className="j2-book">
      <BookingHeader />
      <main className="j2-book-wrap">
        <section className="j2-book-panel j2-book-unavailable">
          <CalendarDays size={28} aria-hidden />
          <h1>{temporary ? "Agendamentos temporariamente indisponíveis" : "Não foi possível abrir a agenda"}</h1>
          <p>
            {temporary
              ? "No momento, entre em contato diretamente com a barbearia para consultar os horários."
              : "Tente novamente em alguns instantes."}
          </p>
        </section>
      </main>
    </div>
  );
}

export default async function PublicBookingPage({ params }: PageProps) {
  const parsed = publicSlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();
  if (!isPublicBookingConfigured()) return <UnavailablePage />;

  const result = await getPublicBookingPage(parsed.data);
  if (result.status === "not_found") notFound();
  if (result.status === "inactive" || result.status === "booking_blocked") return <UnavailablePage temporary />;
  if (result.status === "error") return <UnavailablePage />;

  const { barbershop: shop, services, barbers, businessHours, dateWindow } = result.data;
  const address = barbershopAddressLines(shop);
  const hours = businessHoursByDay(businessHours);
  const cover = publicLegacyImageUrl(shop.coverUrl);
  // Local QA Storage uses HTTP exclusively for its validated public logo bucket.
  const storageOrigin = safeHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const storage = storageOrigin ? new URL(storageOrigin) : null;
  const localPrefix = storage?.protocol === "http:" && ["127.0.0.1", "localhost"].includes(storage.hostname)
    ? storage.origin + "/storage/v1/object/public/barbershop-logos/"
    : null;
  const localLogo = localPrefix && shop.logoUrl?.startsWith(localPrefix) &&
    isBarbershopLogoObject(shop.id, shop.logoUrl.slice(localPrefix.length)) ? shop.logoUrl : null;
  const logo = publicLegacyImageUrl(shop.logoUrl) ?? localLogo;
  const phone = shop.phone?.replace(/\D/g, "");
  const hasContact = Boolean(shop.phone || address.length);

  return (
    <div className="j2-book">
      <BookingHeader details />
      <main className="j2-book-wrap" id="conteudo">
        <section className="j2-book-hero" aria-labelledby="shop-heading">
          {cover && <Image className="j2-book-cover" src={cover} alt="" fill unoptimized fetchPriority="high" referrerPolicy="no-referrer" />}
          <div className="j2-book-identity">
            <div className="j2-book-logo">
              {logo ? <Image src={logo} width={72} height={72} alt="" unoptimized referrerPolicy="no-referrer" />
                : <span aria-hidden>{initialsFromName(shop.name)}</span>}
            </div>
            <div>
              <h1 id="shop-heading">{shop.name}</h1>
              {address.length > 0 && <p className="j2-book-location"><MapPin size={16} aria-hidden />{address.join(" · ")}</p>}
            </div>
          </div>
          {shop.description?.trim() && <p className="j2-book-description">{shop.description.trim()}</p>}
          <a className="j2-book-light-link" href="#agendar">Ver horários e serviços <ArrowDown size={16} aria-hidden /></a>
        </section>

        <div className="j2-book-layout">
          <section id="agendar" aria-label="Agendamento online" className="j2-book-anchor">
            <BookingWizard
              slug={shop.slug}
              shopName={shop.name}
              timezone={shop.timezone}
              services={services}
              barbers={barbers}
              minDate={dateWindow.min}
              maxDate={dateWindow.max}
              openWeekdays={[...new Set(businessHours.map(hour => hour.weekday))]}
            />
          </section>

          <aside className="j2-book-panel j2-book-info j2-book-anchor" id="informacoes" aria-labelledby="information-heading">
            <h2 id="information-heading">Informações da barbearia</h2>
            {hasContact && (
              <div className="j2-book-contact">
                {address.length > 0 && <div><MapPin size={18} aria-hidden /><address>{address.join(" · ")}</address></div>}
                {shop.phone && <div><Phone size={18} aria-hidden />
                  {phone && phone.length >= 10
                    ? <a href={"tel:+" + (phone.length <= 11 ? "55" + phone : phone)}>{formatPhoneBR(shop.phone)}</a>
                    : <span>{shop.phone}</span>}
                </div>}
              </div>
            )}
            <div className="j2-book-hours">
              <h3>Horário de funcionamento</h3>
              {businessHours.length ? (
                <dl>{hours.map(day => (
                  <div key={day.weekday}><dt>{day.label}</dt><dd>{day.hours}</dd></div>
                ))}</dl>
              ) : <p>Horários de funcionamento ainda não informados.</p>}
            </div>
          </aside>
        </div>
      </main>

      <footer className="j2-book-footer">
        <span>Agendamento online por <Link href="/">LPS Agenda</Link></span>
        <nav aria-label="Links da página pública">
          {hasGuideContent(result.data) && <a href={"/agendar/" + shop.slug + "/sobre"}>Sobre a barbearia</a>}
          <Link href="/termos">Termos</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
      </footer>
    </div>
  );
}
