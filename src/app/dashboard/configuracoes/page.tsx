import {
  CalendarDays,
  ExternalLink,
  Globe2,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrototypeBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarbershopSettingsForm } from "@/features/settings/components/barbershop-settings-form";
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

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Gestão"
        title="Configurações"
        description="Os dados que identificam a barbearia no LPS Agenda. Alterações são validadas no servidor e gravadas conforme as permissões do banco."
        actions={
          <Button asChild variant="outline" size="lg">
            <Link href="/barbearia/barbearia-aurora" target="_blank">
              <ExternalLink className="size-4" />
              Ver demonstração pública
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle>Dados da barbearia</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Nome, descrição e localização usados no painel e na futura página
              pública.
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
                  /barbearia/{shop.slug}
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
                <PrototypeBadge label="Página pública em breve" />
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  A página pública real por slug será conectada na próxima
                  etapa. Hoje, a demonstração disponível é a Barbearia Aurora,
                  com dados fictícios.
                </p>
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
