import {
  Banknote,
  CheckCircle2,
  CircleOff,
  Clock3,
  Scissors,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { PrototypeAction } from "@/components/prototype-action";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getServices } from "@/features/dashboard/queries";
import { requireDashboardContext } from "@/lib/auth/dal";
import { formatCurrencyFromCents } from "@/lib/format";

export const metadata: Metadata = {
  title: "Serviços",
};

export default async function ServicesPage() {
  const context = await requireDashboardContext();
  const shop = context.active.barbershop;
  const services = await getServices(shop.id);

  const activeServices = services.filter((service) => service.is_active);
  const averagePrice =
    activeServices.length > 0
      ? Math.round(
          activeServices.reduce(
            (total, service) => total + service.price_cents,
            0,
          ) / activeServices.length,
        )
      : 0;
  const averageDuration =
    activeServices.length > 0
      ? Math.round(
          activeServices.reduce(
            (total, service) => total + service.duration_minutes,
            0,
          ) / activeServices.length,
        )
      : 0;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title="Serviços"
        description="Preço, duração e disponibilidade do catálogo. Os agendamentos preservam o valor praticado no momento do atendimento."
        actions={
          <PrototypeAction
            triggerLabel="Novo serviço"
            triggerVariant="gold"
            triggerSize="lg"
            title="Cadastro de serviço"
            description="O catálogo já pode ser lido pelo painel. O formulário de criação e edição será conectado na próxima etapa."
            steps={[
              {
                title: "Identidade do serviço",
                description:
                  "Nome, descrição e tempo de execução entre 5 e 600 minutos.",
              },
              {
                title: "Preço em centavos",
                description:
                  "Valores armazenados como inteiros para evitar erro de arredondamento.",
              },
              {
                title: "Profissionais habilitados",
                description:
                  "Relação entre serviços e profissionais da equipe.",
              },
            ]}
            footnote="Nada é gravado ao abrir o modal. O botão está identificado como protótipo."
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Serviços ativos"
          value={String(activeServices.length)}
          hint={`${services.length} registro(s) no catálogo`}
          icon={Scissors}
          tone="gold"
        />
        <StatCard
          label="Preço médio"
          value={
            activeServices.length > 0
              ? formatCurrencyFromCents(averagePrice)
              : "—"
          }
          hint="Considera apenas serviços ativos"
          icon={Banknote}
        />
        <StatCard
          label="Duração média"
          value={activeServices.length > 0 ? `${averageDuration} min` : "—"}
          hint="Tempo médio de cadeira"
          icon={Clock3}
        />
        <StatCard
          label="Inativos"
          value={String(services.length - activeServices.length)}
          hint="Fora da operação no momento"
          icon={CircleOff}
          tone="muted"
        />
      </div>

      <Card>
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle>Catálogo da barbearia</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Serviços cadastrados para {shop.name}. A ordenação prioriza os itens
            ativos e depois o nome.
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {services.length > 0 ? (
            <div className="px-4 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-xs font-medium">{service.name}</p>
                          <p className="mt-0.5 max-w-md truncate text-[10px] text-muted-foreground">
                            {service.description ?? "Sem descrição"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {service.duration_minutes} min
                      </TableCell>
                      <TableCell className="text-xs font-medium tabular-nums">
                        {formatCurrencyFromCents(service.price_cents)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            service.is_active
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-border bg-muted/50 text-muted-foreground"
                          }
                        >
                          {service.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="px-4 pb-4">
              <DashboardEmpty
                icon={Scissors}
                title="Nenhum serviço cadastrado"
                description="O catálogo é a base da agenda: nome, duração e preço definem cada horário. Cadastre o primeiro serviço para começar."
                action={
                  <PrototypeAction
                    triggerLabel="Ver estrutura do serviço"
                    triggerSize="sm"
                    title="Serviço na próxima etapa"
                    description="O modelo de dados já contempla catálogo, preço, duração e vínculo com profissionais."
                    steps={[
                      {
                        title: "Preço histórico",
                        description:
                          "O agendamento guarda price_cents no momento da marcação.",
                      },
                      {
                        title: "Duração",
                        description:
                          "Entre 5 e 600 minutos, com constraint no banco.",
                      },
                      {
                        title: "Equipe",
                        description:
                          "barber_services define quais profissionais executam cada serviço.",
                      },
                    ]}
                  />
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <NoticeCard icon={CheckCircle2} title="Preço preservado">
          Cada agendamento guarda o preço praticado no momento da criação. Uma
          alteração futura no catálogo não reescreve o histórico financeiro.
        </NoticeCard>
        <NoticeCard icon={Sparkles} title="Edição em breve" tone="gold">
          A página já lê o catálogo real. Criação, edição, ativação e vínculo com
          profissionais serão entregues na próxima etapa.
        </NoticeCard>
      </div>
    </div>
  );
}
