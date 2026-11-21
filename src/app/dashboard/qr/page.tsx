import type { Metadata } from "next";
import QRCode from "qrcode";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireDashboardContext } from "@/lib/auth/dal";
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
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agenda"
        title="QR Code de agendamento"
        description={shop.name}
      />
      {address && image ? (
        <BookingQr
          name={shop.name}
          slug={shop.slug}
          address={address}
          image={image}
          logo={printableLogo(
            shop.logo_url,
            address.url,
            process.env.NEXT_PUBLIC_SUPABASE_URL,
          )}
        />
      ) : (
        <p className="rounded-xl border bg-card p-5">{printOriginMessage}</p>
      )}
    </div>
  );
}
