import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { LandingPage } from "@/features/marketing/landing-page";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <LandingPage />
      </main>
      <SiteFooter />
    </>
  );
}
