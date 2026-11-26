import type { Metadata } from "next";

import { ManagementHeading, ManagementSection } from "@/components/dashboard/management-page";
import { OperationMetrics } from "@/components/dashboard/operation-page";
import { PrototypeAction } from "@/components/prototype-action";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getPlanBarberLimit } from "@/features/barbers/plan-limit";
import { createClient } from "@/lib/supabase/server";
import { BarbersManager } from "@/features/barbers/components/barbers-manager";
import {
  getBarberServiceAssignments,
  getBarbers,
  getServices,
  getTeam,
} from "@/features/dashboard/queries";
import {
  isCurrentUserPlatformAdmin,
  requireDashboardContext,
} from "@/lib/auth/dal";
import { canManageShop, roleLabels } from "@/lib/auth/permissions";
import { formatDateBR, initialsFromName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Equipe",
};

export default async function TeamPage() {
  const context = await requireDashboardContext();
  const shop = context.active.barbershop;
  const canManage =
    canManageShop(context.active.role) ||
    isCurrentUserPlatformAdmin(context.user);

  const db = await createClient();
  const planCodes = ["basico", "profissional", "premium"] as const;
  const [team, barbers, services, assignments, ratings, currentLimit, catalog] = await Promise.all([
    getTeam(shop.id),
    getBarbers(shop.id),
    getServices(shop.id),
    getBarberServiceAssignments(shop.id),
    context.active.role === "owner"
      ? db.rpc("rating_summary", { shop: shop.id })
      : null,
    getPlanBarberLimit(db, shop.id).catch(() => undefined),
    db.from("plans").select("code,name,max_barbers").in("code", planCodes),
  ]);

  const servicesByBarber = new Map<string, string[]>();

  for (const assignment of assignments) {
    const current = servicesByBarber.get(assignment.barber_id) ?? [];
    current.push(assignment.service_id);
    servicesByBarber.set(assignment.barber_id, current);
  }

  const managedBarbers = barbers.map((barber) => ({
    id: barber.id,
    name: barber.name,
    phone: barber.phone,
    bio: barber.bio,
    avatar_url: barber.avatar_url,
    is_active: barber.is_active,
    display_order: barber.display_order,
    serviceIds: servicesByBarber.get(barber.id) ?? [],
  }));

  const catalogServices = services.map((service) => ({
    id: service.id,
    name: service.name,
    price_cents: service.price_cents,
    duration_minutes: service.duration_minutes,
    is_active: service.is_active,
  }));

  const activeMembers = team.filter((member) => member.is_active);
  const activeBarbers = barbers.filter((barber) => barber.is_active);
  const owners = activeMembers.filter((member) => member.role === "owner");

  return (
    <div className="j2-operation j2-management">
      <ManagementHeading title="Equipe" description="Organize quem atende, os serviços de cada profissional e os acessos ao painel." />
      <OperationMetrics label="Resumo da equipe" entries={[
        { label: "Profissionais ativos", value: String(activeBarbers.length), note: "Disponíveis na agenda" },
        { label: "Pessoas com acesso", value: String(activeMembers.length), note: team.length + " vínculos" },
        { label: "Proprietários", value: String(owners.length) },
        { label: "Acessos de equipe", value: String(activeMembers.filter(member => member.role === "staff").length) },
      ]} />

      <ManagementSection id="limites-equipe" title="Capacidade da equipe">
        <div className="j2-management-limit">
          <div>
            <strong>{currentLimit?.planName ?? "Plano da barbearia"}</strong>
            <p>{currentLimit === undefined
              ? "Não foi possível consultar o limite atual."
              : currentLimit === null
                ? activeBarbers.length + " ativos · sem plano associado"
                : currentLimit.maxBarbers === null
                  ? activeBarbers.length + " ativos · sem limite definido no plano"
                  : activeBarbers.length + " de " + currentLimit.maxBarbers + " profissionais ativos"}</p>
            {currentLimit?.maxBarbers != null && (
              <progress max={currentLimit.maxBarbers} value={Math.min(activeBarbers.length, currentLimit.maxBarbers)} aria-label="Utilização do limite de profissionais" />
            )}
          </div>
          {catalog.error ? <p>Não foi possível carregar o catálogo de limites.</p> : (
            <dl aria-label="Limites do catálogo">
              {planCodes.map(code => {
                const plan = catalog.data.find(entry => entry.code === code);
                return plan ? (
                  <div key={code}><dt>{plan.name}</dt><dd>{plan.max_barbers ?? "Sem limite"}</dd></div>
                ) : null;
              })}
            </dl>
          )}
        </div>
      </ManagementSection>

      <BarbersManager
        barbers={managedBarbers}
        services={catalogServices}
        canManage={canManage}
        canEditPhoto={context.active.role === "owner"}
      />

      {ratings && (
        <ManagementSection id="avaliacoes-equipe" title="Avaliações dos atendimentos" description="Notas informadas pelos clientes e registradas pela equipe.">
          {ratings.error ? (
            <p className="j2-operation-empty">Não foi possível carregar as avaliações.</p>
          ) : (
            <dl className="j2-management-rating">
              {[{ id: null, name: "Barbearia" }, ...barbers].map(barber => {
                const row = ratings.data?.find(entry => entry.barber_id === barber.id);
                return (
                  <div key={barber.id ?? "shop"}>
                    <dt>{barber.name}</dt>
                    <dd>{row?.votes ? row.average_score?.toLocaleString("pt-BR") + " / 10" : "Sem notas"}</dd>
                    <dd>{row?.votes ?? 0} {row?.votes === 1 ? "avaliação" : "avaliações"}</dd>
                  </div>
                );
              })}
            </dl>
          )}
        </ManagementSection>
      )}

      <ManagementSection
        id="acessos-equipe"
        title="Acessos ao painel"
        actions={canManage ? (
          <PrototypeAction
            triggerLabel="Convidar pessoa"
            triggerVariant="outline"
            triggerSize="sm"
            title="Convite de equipe"
            description="O convite por e-mail ainda não está conectado."
            steps={[
              { title: "Convite seguro", description: "Token com expiração e vínculo com a barbearia." },
              { title: "Papel da equipe", description: "O convite prevê vínculo de equipe. Promoção a proprietário é restrita." },
              { title: "Aceite e auditoria", description: "O aceite prevê registro do vínculo e trilha de auditoria." },
            ]}
            footnote="Protótipo. Nenhum e-mail é enviado."
          />
        ) : undefined}
      >
        {team.length ? (
          <ul className="j2-management-access-list">
            {team.map(member => {
              const name = member.profile?.full_name ?? member.profile?.email?.split("@")[0] ?? "Pessoa da equipe";
              return (
                <li key={member.id}>
                  <Avatar aria-hidden><AvatarFallback>{initialsFromName(name)}</AvatarFallback></Avatar>
                  <div><strong>{name}</strong><p>{member.profile?.email ?? "E-mail não disponível"}</p></div>
                  <div><strong>{roleLabels[member.role]}</strong><p>{member.is_active ? "Ativo" : "Inativo"} · desde {formatDateBR(member.created_at, shop.timezone)}</p></div>
                </li>
              );
            })}
          </ul>
        ) : <p className="j2-operation-empty">Nenhum vínculo de equipe encontrado.</p>}
      </ManagementSection>
    </div>
  );
}