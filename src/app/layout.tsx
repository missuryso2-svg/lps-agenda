import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
  ),
  title: {
    default: "LPS Agenda — Gestão premium para barbearias",
    template: "%s · LPS Agenda",
  },
  description:
    "Organize horários, serviços e equipe da sua barbearia com o LPS Agenda.",
  applicationName: "LPS Agenda",
  authors: [{ name: "LPS Solutions" }],
  keywords: [
    "barbearia",
    "agenda para barbearia",
    "software para barbearia",
    "gestão de barbearia",
    "LPS Solutions",
  ],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "LPS Agenda",
    title: "LPS Agenda — Gestão premium para barbearias",
    description:
      "Agenda online, gestão de profissionais e acompanhamento dos atendimentos da barbearia.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#101112" },
  ],
  colorScheme: "light dark",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Per-request nonce requires dynamic HTML; never cache/reuse it across users.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-svh antialiased">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
