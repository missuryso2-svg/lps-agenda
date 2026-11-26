import {
  ArrowRight, CalendarDays, CalendarPlus, Scissors, ShieldCheck, Users, UsersRound, Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppointmentList } from "@/components/dashboard/appointment-list";
import { OperationHeading, OperationMetrics } from "@/components/dashboard/operation-page";
import { Button } from "@/components/ui/button";
import { getAgendaForToday, getBarbers, getDashboardOverview, getTeam } from "@/features/dashboard/queries";
import { requireDashboardContext } from "@/lib/auth/dal";
import { canManageShop } from "@/lib/auth/permissions";
import { formatCurrencyFromCents, formatDateBR } from "@/lib/format";

export const metadata: Metadata = { title: "Visão geral" };

type DashboardPageProps = {
  searchParams: Promise<{ acesso?: string }>;
};

export default async function DashboardOverviewPage({ searchParams }: DashboardPageProps) {
  const [params, context] = await Promise.all([searchParams, requireDashboardContext()]);
  const { active, user } = context;
  const shop = active.barbershop;
  const canManage = canManageShop(active.role) || user.app_metadata?.lps_role === "platform_admin";

  const [overview, today, team, barbers] = await Promise.all([
    getDashboardOverview(shop.id, shop.timezone, { includeRevenue: canManage }),
    getAgendaForToday(shop.id, shop.timezone),
    getTeam(shop.id),
    getBarbers(shop.id),
  ]);

  const activeBarbers = barbers.filter(barber => barber.is_active).length;
  const hasTeam = team.length > 0 || activeBarbers > 0;
  const shortcuts = [
    { href: "/dashboard/clientes", title: "Clientes", icon: Users },
    { href: "/dashboard/servicos", title: "Serviços", icon: Scissors },
    { href: "/dashboard/equipe", title: "Equipe", icon: UsersRound },
    canManage
      ? { href: "/dashboard/financeiro", title: "Financeiro", icon: Wallet }
      : { href: "/dashboard/agenda", title: "Agenda", icon: CalendarDays },
  ];

  return (
    <div className="j2-operation">
      <OperationHeading
        title="Hoje na barbearia"
        description={formatDateBR(new Date(), shop.timezone) + " · " + shop.name}
        actions={
          <Button asChild variant="gold" className="j2-operation-primary">
            <Link href="/dashboard/agenda?new=1"><CalendarPlus aria-hidden /> Novo agendamento</Link>
          </Button>
        }
      />

      {params.acesso === "restrito" && (
        <div className="j2-operation-callout" role="status">
          <ShieldCheck size={18} aria-hidden />
          <div>
            <strong>Área restrita ao proprietário</strong>
            <p>As páginas de gestão estão disponíveis para o proprietário ou o administrador da plataforma.</p>
          </div>
        </div>
      )}

      {(!hasTeam || overview.activeServices === 0) && (
        <div className="j2-operation-callout">
          <CalendarDays size={18} aria-hidden />
          <div>
            <strong>Prepare sua agenda</strong>
            <p>Cadastre os serviços e os profissionais que vão atender.</p>
            <span className="j2-inline-actions">
              <Link href="/dashboard/servicos">Serviços</Link>
              <Link href="/dashboard/equipe">Equipe</Link>
            </span>
          </div>
        </div>
      )}

      <OperationMetrics
        label="Indicadores da barbearia"
        entries={[
          { label: "Agendamentos hoje", value: String(overview.todayAppointments), note: "Inclui atendimentos concluídos" },
          { label: "Clientes ativos", value: String(overview.activeCustomers) },
          { label: "Serviços ativos", value: String(overview.activeServices) },
          canManage
            ? { label: "Receita do mês", value: formatCurrencyFromCents(overview.monthRevenueCents), note: "Recebimentos da barbearia" }
            : { label: "Equipe", value: String(activeBarbers || team.length) },
        ]}
      />

      <div className="j2-overview-columns">
        <section className="j2-operation-panel" aria-labelledby="today-heading">
          <header>
            <div>
              <h2 id="today-heading">Agenda de hoje</h2>
              <p>{shop.timezone}</p>
            </div>
            <Link href="/dashboard/agenda" className="j2-operation-link">Abrir agenda <ArrowRight size={16} aria-hidden /></Link>
          </header>
          {today.length > 0 ? (
            <AppointmentList items={today} timeZone={shop.timezone} showPrice={canManage} />
          ) : (
            <div className="j2-operation-empty">
              <strong>Nenhum agendamento para hoje</strong>
              <p>Consulte os horários disponíveis na agenda.</p>
            </div>
          )}
        </section>

        <section className="j2-operation-panel" aria-labelledby="upcoming-heading">
          <header><h2 id="upcoming-heading">Próximos compromissos</h2></header>
          {overview.upcoming.length > 0 ? (
            <AppointmentList items={overview.upcoming} timeZone={shop.timezone} showDate />
          ) : (
            <div className="j2-operation-empty">
              <strong>Agenda livre</strong>
              <p>Nenhum compromisso futuro registrado.</p>
            </div>
          )}
        </section>
      </div>

      <section className="j2-shortcuts" aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading">Atalhos da operação</h2>
        <ul>
          {shortcuts.map(({ href, title, icon: Icon }) => (
            <li key={href}><Link href={href}><Icon size={17} aria-hidden /> {title}<ArrowRight size={15} aria-hidden /></Link></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
