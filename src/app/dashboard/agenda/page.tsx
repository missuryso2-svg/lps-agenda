import {
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";

import {
  AppointmentStatusBadge,
  PrototypeBadge,
} from "@/components/dashboard/status-badge";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { PrototypeAction } from "@/components/prototype-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireDashboardContext } from "@/lib/auth/dal";
import { getAgendaForToday } from "@/features/dashboard/queries";
import {
  formatCurrencyFromCents,
  formatDateBR,
  formatTimeBR,
} from "@/lib/format";

export const metadata: Metadata = {
  title: "Agenda",
};

export default async function AgendaPage() {
  const context = await requireDashboardContext();
  const shop = context.active.barbershop;
  const appointments = await getAgendaForToday(shop.id, shop.timezone);

  const confirmed = appointments.filter(
    (item) => item.status === "confirmed" || item.status === "scheduled",
  ).length;
  const inProgress = appointments.filter(
    (item) => item.status === "in_progress",
  ).length;
  const completed = appointments.filter(
    (item) => item.status === "completed",
  ).length;
  const cancelled = appointments.filter(
    (item) => item.status === "cancelled" || item.status === "no_show",
  ).length;

  const dayTotal = appointments
    .filter((item) => item.status !== "cancelled")
    .reduce((total, item) => total + item.priceCents, 0);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title="Agenda do dia"
        description="Os compromissos reais da barbearia, organizados por horário e profissional. A leitura já respeita o isolamento por barbearia."
        actions={
          <>
            <div className="hidden items-center gap-1.5 rounded-lg border border-border/80 bg-card p-1 sm:flex">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled
                aria-label="Dia anterior"
                title="Navegação por data entra na próxima etapa"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="px-1 text-[11px] font-medium">
                Hoje · {formatDateBR(new Date(), shop.timezone)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled
                aria-label="Próximo dia"
                title="Navegação por data entra na próxima etapa"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <PrototypeAction
              triggerLabel="Novo agendamento"
              triggerVariant="gold"
              triggerSize="lg"
              title="Novo agendamento"
              description="A criação de agendamento pelo painel é o próximo passo da agenda. Nesta fundação, apenas a leitura dos registros está habilitada."
              steps={[
                {
                  title: "Cliente, serviço e profissional",
                  description:
                    "Seleção validada contra o catálogo e a equipe da barbearia ativa.",
                },
                {
                  title: "Janela de atendimento",
                  description:
                    "Cruzamento de expediente, jornada do profissional e bloqueios.",
                },
                {
                  title: "Proteção contra sobreposição",
                  description:
                    "A constraint appointments_no_overlap impede dois atendimentos no mesmo horário do profissional.",
                },
              ]}
              footnote="Nenhuma integração externa é simulada e nenhum registro é gravado por este modal."
            />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Na agenda"
          value={String(appointments.length)}
          hint="Todos os status do dia"
          icon={CalendarCheck2}
          tone="gold"
        />
        <StatCard
          label="Aguardando"
          value={String(confirmed)}
          hint="Agendados ou confirmados"
          icon={Clock3}
        />
        <StatCard
          label="Em atendimento"
          value={String(inProgress)}
          hint={`${completed} concluído(s) hoje`}
          icon={ListChecks}
        />
        <StatCard
          label="Cancelados / faltas"
          value={String(cancelled)}
          hint={`Previsão do dia: ${formatCurrencyFromCents(dayTotal)}`}
          icon={XCircle}
          tone="muted"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Compromissos de hoje
              <PrototypeBadge label="Somente leitura" />
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateBR(new Date(), shop.timezone)} · {shop.timezone}
            </p>
          </div>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {appointments.length} registro(s)
          </span>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {appointments.length > 0 ? (
            <div className="px-4 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Horário</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">
                        {formatTimeBR(item.startsAt, shop.timezone)}
                        <span className="ml-1 text-muted-foreground">
                          – {formatTimeBR(item.endsAt, shop.timezone)}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.customerName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.serviceName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.barberName}
                      </TableCell>
                      <TableCell>
                        <AppointmentStatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyFromCents(item.priceCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="px-4 pb-4">
              <DashboardEmpty
                icon={CalendarPlus}
                title="Nenhum compromisso registrado hoje"
                description="A agenda está pronta para receber os primeiros horários. Enquanto a criação não é habilitada, os registros podem ser inseridos diretamente no banco para teste interno."
                action={
                  <PrototypeAction
                    triggerLabel="Ver o que entra na próxima etapa"
                    triggerSize="sm"
                    title="Fluxo de agendamento"
                    description="A interface de criação será conectada na próxima etapa, com validações no servidor e no banco."
                    steps={[
                      {
                        title: "Disponibilidade real",
                        description:
                          "Horários livres calculados por profissional e serviço.",
                      },
                      {
                        title: "Confirmação",
                        description:
                          "Status do atendimento e comunicação com o cliente.",
                      },
                      {
                        title: "Auditoria",
                        description:
                          "Cada criação e mudança fica registrada em audit_logs.",
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
        <NoticeCard icon={ShieldCheck} title="Leitura protegida por RLS" tone="gold">
          A consulta usa a sessão do usuário e o vínculo ativo. Mesmo que o
          identificador de outra barbearia seja enviado manualmente, o banco não
          devolve os registros.
        </NoticeCard>
        <NoticeCard icon={CalendarPlus} title="Criação ainda não habilitada">
          A agenda atual é somente leitura. Navegação por data, edição de
          status, bloqueios e criação de horários entram na próxima etapa do
          produto.
        </NoticeCard>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-gold" />
        Fuso da barbearia: {shop.timezone}. Os horários são exibidos no horário
        local da operação.
      </div>
    </div>
  );
}
