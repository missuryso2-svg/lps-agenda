import type { Metadata, Viewport } from "next";

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
    "Agenda, equipe, clientes e financeiro em uma plataforma multiempresa feita para barbearias que levam a operação a sério.",
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
      "Uma fundação multiempresa para agenda, equipe, clientes e financeiro da sua barbearia.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#191817" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-svh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
