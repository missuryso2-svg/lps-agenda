import type { Metadata } from "next";
import "@/components/dashboard/account-j2.css";
import QRCode from "qrcode";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireDashboardContext } from "@/lib/auth/dal";
import { publicBarbershopLogoUrl } from "@/features/barbershop/logo";
import {
  bookingAddress,
  printableLogo,
  printOriginMessage,
} from "@/features/public-booking/qr/address";
import { BookingQr } from "@/features/public-booking/qr/booking-qr";
export const metadata: Metadata = { title: "QR Code de agendamento" };
export default async function BookingQrPage() {
  const {
    active: { barbershop: shop },
  } = await requireDashboardContext();
  const address = bookingAddress(
    process.env.NEXT_PUBLIC_APP_URL,
    shop.slug,
    process.env.NODE_ENV === "development",
  );
  const image = address
    ? await QRCode.toDataURL(address.url, {
        margin: 4,
        scale: 16,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      })
    : null;
  const displayLogo = publicBarbershopLogoUrl(shop.id, shop.logo_url);
  return (
    <section className="j2-c3">
      <PageHeader
        className="j2-c3-heading"
        title="QR Code de agendamento"
        description="Divulgue a agenda nas redes sociais e facilite a reserva no estabelecimento."
      />
      {address && image ? (
        <BookingQr
          name={shop.name}
          slug={shop.slug}
          address={address}
          image={image}
          displayLogo={displayLogo}
          logo={printableLogo(
            displayLogo,
            address.url,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
          )}
        />
      ) : (
        <section className="j2-c3-panel">
          <h3>Endereço de divulgação indisponível</h3>
          <p className="j2-c3-meta mt-2">{printOriginMessage}</p>
        </section>
      )}
    </section>
  );
}
