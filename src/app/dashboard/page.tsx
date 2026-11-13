import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Check,
  Clock3,
  Scissors,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppointmentList } from "@/components/dashboard/appointment-list";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireDashboardContext } from "@/lib/auth/dal";
import { canManageShop } from "@/lib/auth/permissions";
import {
  getAgendaForToday,
  getBarbers,
  getDashboardOverview,
  getTeam,
} from "@/features/dashboard/queries";
import { formatDateBR, formatCurrencyFromCents } from "@/lib/format";

export const metadata: Metadata = {
  title: "Visão geral",
};

type DashboardPageProps = {
  searchParams: Promise<{ acesso?: string }>;
};

export default async function DashboardOverviewPage({
  searchParams,
}: DashboardPageProps) {
  const [params, context] = await Promise.all([
    searchParams,
    requireDashboardContext(),
  ]);

  const { active, user, profile } = context;
  const shop = active.barbershop;
  const canManage =
    canManageShop(active.role) || user.app_metadata?.lps_role === "platform_admin";

  const [overview, today, team, barbers] = await Promise.all([
    getDashboardOverview(shop.id, shop.timezone, {
      includeRevenue: canManage,
    }),
    getAgendaForToday(shop.id, shop.timezone),
    getTeam(shop.id),
    getBarbers(shop.id),
  ]);

  const firstName =
    profile?.full_name?.trim().split(/\s+/)[0] ||
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim().split(/\s+/)[0]
      : "") ||
    user.email?.split("@")[0] ||
    "bem-vindo";

  const activeBarbers = barbers.filter((barber) => barber.is_active).length;
  const hasTeam = team.length > 0 || activeBarbers > 0;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Visão geral"
        title={`Olá, ${firstName}.`}
        description={`Este é o pulso de ${shop.name}. Os indicadores refletem os dados reais gravados no seu espaço.`}
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href="/dashboard/agenda">
                <CalendarDays className="size-4" />
                Abrir agenda
              </Link>
            </Button>
            <Button asChild variant="gold" size="lg">
              <Link href="/dashboard/agenda?new=1">
                <CalendarPlus className="size-4" />
                Novo agendamento
              </Link>
            </Button>
          </>
        }
      />

      {params.acesso === "restrito" ? (
        <Alert className="border-gold/30 bg-gold-soft/30">
          <ShieldCheck className="text-gold" />
          <AlertTitle>Área restrita ao proprietário</AlertTitle>
          <AlertDescription>
            Seu vínculo atual é de equipe. As páginas de gestão ficam
            disponíveis apenas para o proprietário da barbearia ou para o
            administrador da plataforma.
          </AlertDescription>
        </Alert>
      ) : null}

      {!hasTeam || overview.activeServices === 0 ? (
        <Card className="border-gold/20 bg-gold-soft/20">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-gold/30 bg-gold-soft/60 text-gold">
                <Sparkles className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  Sua base está pronta. Falta preencher a operação.
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Cadastre serviços e profissionais para que a agenda e os
                  indicadores comecem a ganhar vida.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/servicos">
                  <Scissors className="size-3.5" />
                  Serviços
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/equipe">
                  <UserPlus className="size-3.5" />
                  Equipe
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Agendamentos hoje"
          value={String(overview.todayAppointments)}
          hint={`${today.length} registro(s) na agenda de hoje`}
          icon={CalendarDays}
          tone="gold"
        />
        <StatCard
          label="Clientes ativos"
          value={String(overview.activeCustomers)}
          hint="Base disponível para atendimento"
          icon={Users}
        />
        <StatCard
          label="Serviços ativos"
          value={String(overview.activeServices)}
          hint="Catálogo publicado no painel"
          icon={Scissors}
        />
        {canManage ? (
          <StatCard
            label="Receita do mês"
            value={formatCurrencyFromCents(overview.monthRevenueCents)}
            hint="Pagamentos com status pago"
            icon={Wallet}
          />
        ) : (
          <StatCard
            label="Equipe"
            value={String(activeBarbers || team.length)}
            hint="Pessoas com acesso à operação"
            icon={UsersRound}
          />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70 pb-4">
            <div>
              <CardTitle>Agenda de hoje</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateBR(new Date(), shop.timezone)} · fuso{" "}
                {shop.timezone}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link href="/dashboard/agenda">
                Ver tudo
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {today.length > 0 ? (
              <AppointmentList
                items={today}
                timeZone={shop.timezone}
                showPrice={canManage}
              />
            ) : (
              <DashboardEmpty
                icon={CalendarPlus}
                title="Nenhum agendamento para hoje"
                description="Crie o primeiro compromisso do dia; ele aparecerá aqui em ordem de horário, com serviço, profissional e status."
                action={
                  <Button asChild variant="gold" size="sm">
                    <Link href="/dashboard/agenda?new=1">
                      <CalendarPlus className="size-4" />
                      Novo agendamento
                    </Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle>Próximos horários</CardTitle>
              <p className="text-xs text-muted-foreground">
                Os seis compromissos mais próximos da operação.
              </p>
            </CardHeader>
            <CardContent>
              {overview.upcoming.length > 0 ? (
                <AppointmentList
                  items={overview.upcoming}
                  timeZone={shop.timezone}
                  compact
                />
              ) : (
                <DashboardEmpty
                  className="border-0 bg-transparent py-6"
                  icon={Clock3}
                  title="Agenda livre"
                  description="Nenhum compromisso futuro registrado neste momento."
                />
              )}
            </CardContent>
          </Card>

          <NoticeCard icon={ShieldCheck} title="Isolamento por barbearia" tone="gold">
            Todas as consultas desta página incluem o vínculo ativo com{" "}
            <strong className="font-medium text-foreground">{shop.name}</strong>.
            A RLS impede leitura de qualquer outra barbearia, mesmo que alguém
            altere manualmente uma requisição.
          </NoticeCard>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle>Atalhos da operação</CardTitle>
          <p className="text-xs text-muted-foreground">
            O necessário para organizar o dia, sem ruído visual.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction
            href="/dashboard/clientes"
            icon={Users}
            title="Clientes"
            description="Contatos e histórico"
          />
          <QuickAction
            href="/dashboard/servicos"
            icon={Scissors}
            title="Serviços"
            description="Preços e duração"
          />
          <QuickAction
            href="/dashboard/equipe"
            icon={UsersRound}
            title="Equipe"
            description="Papéis e profissionais"
          />
          {canManage ? (
            <QuickAction
              href="/dashboard/financeiro"
              icon={Wallet}
              title="Financeiro"
              description="Recebimentos do mês"
            />
          ) : (
            <QuickAction
              href="/dashboard/agenda"
              icon={CalendarDays}
              title="Agenda"
              description="Compromissos de hoje"
            />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Check className="size-3.5 text-gold" />
        Fundação v0.1 · dados reais, agenda interna ativa, cobrança e reserva
        pública ainda inativas.
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border/80 bg-card px-3.5 py-3 transition-colors hover:border-gold/30 hover:bg-gold-soft/20"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border/80 bg-muted/35 text-muted-foreground transition-colors group-hover:border-gold/30 group-hover:text-gold">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{title}</span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowRight className="size-3.5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
