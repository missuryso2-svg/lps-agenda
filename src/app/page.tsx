import type { Metadata } from "next";
import { connection } from "next/server";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { automaticTrialAvailable } from "@/features/premium-trial/queries";
import { LandingPage } from "@/features/marketing/landing-page";

const title = "Agenda online e gestão para barbearias";
const description =
  "Organize horários, profissionais e clientes. Conheça os planos Básico, Profissional e Premium do LPS Agenda e consulte as condições com a LPS Solutions.";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "LPS Agenda",
    url: "/",
    title: `${title} · LPS Agenda`,
    description,
    images: [
      {
        url: "/images/barbearia.webp",
        width: 1536,
        height: 1024,
        alt: "Barbeiro atendendo um cliente na barbearia",
      },
    ],
  },
};

export default async function HomePage() {
  await connection();
  const trialAvailable = await automaticTrialAvailable();
  return (
    <div className="j2-site">
      <a className="j2-skip" href="#conteudo">Ir para o conteúdo</a>
      <SiteHeader landing />
      <main id="conteudo" tabIndex={-1}>
        <LandingPage trialAvailable={trialAvailable} />
      </main>
      <SiteFooter />
    </div>
  );
}
