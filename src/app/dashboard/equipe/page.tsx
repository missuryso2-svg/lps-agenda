import {
  Building2,
  CalendarDays,
  Mail,
  Scissors,
  ShieldCheck,
  UserCheck,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { PrototypeAction } from "@/components/prototype-action";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBarbers, getTeam } from "@/features/dashboard/queries";
import { requireDashboardContext } from "@/lib/auth/dal";
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
    context.user.app_metadata?.lps_role === "platform_admin";

  const [team, barbers] = await Promise.all([
    getTeam(shop.id),
    getBarbers(shop.id),
  ]);

  const activeMembers = team.filter((member) => member.is_active);
  const activeBarbers = barbers.filter((barber) => barber.is_active);
  const owners = activeMembers.filter((member) => member.role === "owner");

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title="Equipe"
        description="Quem tem acesso ao painel e quem atende atrás da cadeira. Os papéis são aplicados pelo banco de dados, não apenas pela interface."
        actions={
          canManage ? (
            <PrototypeAction
              triggerLabel="Convidar pessoa"
              triggerVariant="gold"
              triggerSize="lg"
              title="Convite de equipe"
              description="O convite por e-mail ainda não está conectado. Nesta fundação, o vínculo de equipe é criado diretamente no banco com papel de equipe."
              steps={[
                {
                  title: "Convite seguro",
                  description:
                    "Geração de token com expiração e vínculo com a barbearia.",
                },
                {
                  title: "Papel definido no servidor",
                  description:
                    "O convite cria apenas vínculos de equipe; promoção a proprietário é restrita.",
                },
                {
                  title: "Aceite e auditoria",
                  description:
                    "O aceite registra o vínculo e deixa trilha em audit_logs.",
                },
              ]}
              footnote="Nenhum e-mail é enviado nesta versão. O botão é um protótipo identificado."
            />
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pessoas com acesso"
          value={String(activeMembers.length)}
          hint={`${team.length} vínculo(s) no total`}
          icon={UsersRound}
          tone="gold"
        />
        <StatCard
          label="Proprietários"
          value={String(owners.length)}
          hint="Máximo de um proprietário ativo por barbearia"
          icon={ShieldCheck}
        />
        <StatCard
          label="Profissionais ativos"
          value={String(activeBarbers.length)}
          hint="Disponíveis para a agenda"
          icon={Scissors}
        />
        <StatCard
          label="Acesso de equipe"
          value={String(activeMembers.filter((member) => member.role === "staff").length)}
          hint="Papel operacional, sem gestão"
          icon={UserCheck}
          tone="muted"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle>Acessos ao painel</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Vínculos de {shop.name} com o papel e o status de cada pessoa.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {team.length > 0 ? (
              <ul className="divide-y divide-border/70">
                {team.map((member) => {
                  const name =
                    member.profile?.full_name ??
                    member.profile?.email?.split("@")[0] ??
                    "Pessoa da equipe";

                  return (
                    <li
                      key={member.id}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-primary font-display text-xs text-primary-foreground">
                            {initialsFromName(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            <Mail className="size-3" />
                            {member.profile?.email ?? "E-mail não disponível"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-11 sm:pl-0">
                        <Badge
                          variant="outline"
                          className={
                            member.role === "owner"
                              ? "border-gold/35 bg-gold-soft/45 text-foreground"
                              : "border-border bg-muted/40 text-muted-foreground"
                          }
                        >
                          {roleLabels[member.role]}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            member.is_active
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-border bg-muted/50 text-muted-foreground"
                          }
                        >
                          {member.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                        <span className="hidden text-[10px] text-muted-foreground md:inline">
                          desde {formatDateBR(member.created_at, shop.timezone)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-4">
                <DashboardEmpty
                  icon={UsersRound}
                  title="Nenhum vínculo de equipe"
                  description="O proprietário que criou a barbearia deve aparecer aqui. Se a lista estiver vazia, confira o vínculo em barbershop_members no banco."
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle>Profissionais de atendimento</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Registros usados pela agenda. Podem ou não ter acesso ao painel.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {barbers.length > 0 ? (
                <ul className="divide-y divide-border/70">
                  {barbers.map((barber) => (
                    <li
                      key={barber.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border/80 bg-muted/40 font-display text-[10px] font-semibold">
                        {initialsFromName(barber.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {barber.name}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {barber.bio ?? "Sem descrição profissional"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          barber.is_active
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-border bg-muted/50 text-muted-foreground"
                        }
                      >
                        {barber.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4">
                  <DashboardEmpty
                    className="border-0 bg-transparent py-6"
                    icon={Scissors}
                    title="Nenhum profissional cadastrado"
                    description="Os profissionais são vinculados aos serviços e aos agendamentos."
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {canManage ? (
            <PrototypeAction
              triggerLabel="Adicionar profissional"
              triggerVariant="outline"
              triggerClassName="w-full"
              title="Novo profissional"
              description="O cadastro de profissionais será conectado na próxima etapa. Nenhum registro é criado por este modal."
              steps={[
                {
                  title: "Perfil de atendimento",
                  description:
                    "Nome, bio, telefone e ordem de exibição.",
                },
                {
                  title: "Jornada de trabalho",
                  description:
                    "Horários por dia da semana, usados no cálculo de disponibilidade.",
                },
                {
                  title: "Serviços habilitados",
                  description:
                    "Relação entre o profissional e o catálogo da barbearia.",
                },
              ]}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NoticeCard icon={ShieldCheck} title="Proteção contra autopromoção" tone="gold">
          Um usuário não pode alterar o próprio papel. Promoções e transferências
          exigem proprietário ou administrador da plataforma, com validação no
          banco.
        </NoticeCard>
        <NoticeCard icon={CalendarDays} title="Equipe e agenda conectadas">
          Os profissionais cadastrados aqui serão a base para disponibilidade,
          bloqueios e atribuição de agendamentos nas próximas etapas.
        </NoticeCard>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Building2 className="size-3.5 text-gold" />
        Barbearia ativa: {shop.name} · {shop.slug}
      </div>
    </div>
  );
}
