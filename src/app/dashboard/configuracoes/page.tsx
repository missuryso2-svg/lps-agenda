import { ExternalLink, Globe2, QrCode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { BarbershopSettingsForm } from "@/features/settings/components/barbershop-settings-form";
import { BarbershopLogoCard } from "@/features/settings/components/barbershop-logo-card";
import { barbershopLogoVersion, publicBarbershopLogoUrl } from "@/features/barbershop/logo";
import { safeHttpUrl } from "@/features/public-booking/format";
import { requireOwnerDashboardContext } from "@/lib/auth/dal";
import { roleLabels } from "@/lib/auth/permissions";
import { formatDateBR } from "@/lib/format";
import type { Database } from "@/types/database";
import "@/components/dashboard/account-j2.css";

export const metadata: Metadata = { title: "Configurações" };

const statusLabels: Record<Database["public"]["Enums"]["barbershop_status"], string> = {
  active: "Ativa",
  inactive: "Inativa",
  suspended: "Suspensa",
};

export default async function SettingsPage() {
  const { active, user } = await requireOwnerDashboardContext();
  const shop = active.barbershop;
  const logoUrl = safeHttpUrl(publicBarbershopLogoUrl(shop.id, shop.logo_url));

  return (
    <section className="j2-c3">
      <PageHeader
        className="j2-c3-heading"
        title="Configurações"
        description="Atualize como a barbearia aparece no painel e no agendamento online."
        actions={(
          <Button asChild variant="outline">
            <Link href={"/agendar/" + shop.slug} target="_blank" rel="noopener noreferrer">
              Abrir página pública <ExternalLink aria-hidden />
            </Link>
          </Button>
        )}
      />

      <div className="j2-c3-two-columns">
        <section className="j2-c3-panel" aria-labelledby="profile-heading">
          <h3 id="profile-heading">Perfil da barbearia</h3>
          <BarbershopSettingsForm
            key={shop.id}
            defaultValues={{
              name: shop.name,
              description: shop.description ?? "",
              phone: shop.phone ?? "",
              city: shop.address_city ?? "",
              state: shop.address_state ?? "",
            }}
          />
        </section>

        <aside className="j2-c3-settings-side" aria-label="Identidade e publicação">
          <BarbershopLogoCard
            key={shop.id}
            shopId={shop.id}
            shopName={shop.name}
            logoUrl={logoUrl}
            logoVersion={barbershopLogoVersion(shop.logo_url)}
            canManage={active.role === "owner"}
          />

          <section className="j2-c3-panel" aria-labelledby="public-heading">
            <h3 className="flex items-center gap-2" id="public-heading">
              <Globe2 className="size-5 text-gold" aria-hidden /> Página pública
            </h3>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2 min-w-0">
                <dt className="j2-c3-meta">Endereço</dt>
                <dd className="break-all font-mono">/agendar/{shop.slug}</dd>
              </div>
              <div>
                <dt className="j2-c3-meta">Status da barbearia</dt>
                <dd>{statusLabels[shop.status]}</dd>
              </div>
              <div className="min-w-0">
                <dt className="j2-c3-meta">Fuso da agenda</dt>
                <dd className="break-words">{shop.timezone}</dd>
              </div>
              <div className="col-span-2">
                <dt className="j2-c3-meta">Criada em</dt>
                <dd>{formatDateBR(shop.created_at, shop.timezone)}</dd>
              </div>
            </dl>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/dashboard/qr"><QrCode aria-hidden /> QR Code de agendamento</Link>
            </Button>
          </section>

          <section className="j2-c3-panel" aria-labelledby="account-heading">
            <h3 id="account-heading">Sua conta</h3>
            <p className="mt-2 break-all text-sm">{user.email ?? "E-mail não informado"}</p>
            <p className="j2-c3-meta">{roleLabels[active.role]}</p>
          </section>
        </aside>
      </div>
    </section>
  );
}
