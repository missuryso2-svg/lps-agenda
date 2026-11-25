import {
  CalendarDays,
  ExternalLink,
  Globe2,
  QrCode,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarbershopSettingsForm } from "@/features/settings/components/barbershop-settings-form";
import { BarbershopLogoCard } from "@/features/settings/components/barbershop-logo-card";
import {
  barbershopLogoVersion,
  publicBarbershopLogoUrl,
} from "@/features/barbershop/logo";
import { safeHttpUrl } from "@/features/public-booking/format";
import { requireOwnerDashboardContext } from "@/lib/auth/dal";
import { roleLabels } from "@/lib/auth/permissions";
import { formatDateBR } from "@/lib/format";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Configurações",
};

const barbershopStatusLabels: Record<
  Database["public"]["Enums"]["barbershop_status"],
  string
> = {
  active: "Ativa",
  inactive: "Inativa",
  suspended: "Suspensa",
};

export default async function SettingsPage() {
  const context = await requireOwnerDashboardContext();
  const shop = context.active.barbershop;
  const logoUrl = safeHttpUrl(publicBarbershopLogoUrl(shop.id, shop.logo_url));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Gestão"
        title="Configurações"
        description="Os dados que identificam a barbearia no LPS Agenda. Alterações são validadas no servidor e gravadas conforme as permissões do banco."
        actions={
          <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/dashboard/qr"><QrCode/>QR Code de agendamento</Link></Button>
          <Button asChild variant="outline" size="lg">
            <Link href={`/agendar/${shop.slug}`} target="_blank">
              <ExternalLink className="size-4" />
              Abrir página pública
            </Link>
          </Button></div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle>Dados da barbearia</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Nome, descrição e localização usados no painel e na página pública
              de agendamento.
            </p>
          </CardHeader>
          <CardContent className="pt-5">
            <BarbershopSettingsForm
              timezone={shop.timezone}
              defaultValues={{
                name: shop.name,
                description: shop.description ?? "",
                phone: shop.phone ?? "",
                city: shop.address_city ?? "",
                state: shop.address_state ?? "",
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-5">
          <BarbershopLogoCard
            key={shop.id}
            shopId={shop.id}
            shopName={shop.name}
            logoUrl={logoUrl}
            logoVersion={barbershopLogoVersion(shop.logo_url)}
            canManage={context.active.role === "owner"}
          />
          <Card>
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe2 className="size-4 text-gold" />
                Identidade pública
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Identificador
                </p>
                <code className="mt-1 block overflow-x-auto rounded-lg border border-border/80 bg-muted/30 px-2.5 py-1.5 font-mono text-[11px]">
                  /agendar/{shop.slug}
                </code>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Fuso horário
                </p>
                <p className="mt-1 text-xs">{shop.timezone}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Status da barbearia
                </p>
                <p className="mt-1 text-xs">
                  {barbershopStatusLabels[shop.status]}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Criada em
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs">
                  <CalendarDays className="size-3.5 text-gold" />
                  {formatDateBR(shop.created_at, shop.timezone)}
                </p>
              </div>
              <div className="border-t border-border/70 pt-3">
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-[9px] uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300"
                >
                  <ExternalLink className="size-2.5" />
                  Agendamento online ativo
                </Badge>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  A página pública consulta serviços, profissionais e horários
                  reais. Cada reserva gera um link privado para o cliente
                  consultar ou cancelar antes do atendimento.
                </p>
                <Link
                  href={`/agendar/${shop.slug}`}
                  target="_blank"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium underline decoration-gold/50 underline-offset-4 hover:text-gold"
                >
                  Ver página pública
                  <ExternalLink className="size-3" />
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="size-4 text-gold" />
                Sua conta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  E-mail
                </p>
                <p className="mt-1 truncate text-xs">
                  {context.user.email ?? "Não informado"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Papel nesta barbearia
                </p>
                <p className="mt-1 text-xs">{roleLabels[context.active.role]}</p>
              </div>
            </CardContent>
          </Card>

          <NoticeCard icon={ShieldCheck} title="Somente o proprietário edita" tone="gold">
            A server action confere o vínculo antes de gravar e a RLS repete a
            validação no banco. A interface não é a única barreira.
          </NoticeCard>

          <NoticeCard icon={LockKeyhole} title="Campos sensíveis">
            O identificador público e o fuso horário não podem ser alterados
            livremente nesta etapa. Essa restrição evita quebrar links e
            cálculos de agenda.
          </NoticeCard>
        </div>
      </div>
    </div>
  );
}
