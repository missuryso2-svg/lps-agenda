import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  PaymentStatusBadge,
  SubscriptionStatusBadge,
} from "@/components/dashboard/status-badge";
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
import { getFinancialOverview } from "@/features/dashboard/queries";
import { requireOwnerDashboardContext } from "@/lib/auth/dal";
import {
  formatCurrencyFromCents,
  formatDateBR,
  formatDateOnlyBR,
} from "@/lib/format";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Financeiro",
};

const methodLabels: Record<
  Database["public"]["Enums"]["payment_method"],
  string
> = {
  boleto: "Boleto",
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  cash: "Dinheiro",
  bank_transfer: "Transferência",
  other: "Outro",
};

export default async function FinancialPage() {
  const context = await requireOwnerDashboardContext();
  const shop = context.active.barbershop;
  const financial = await getFinancialOverview(shop.id, shop.timezone);
  const subscription = financial.subscription;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Gestão"
        title="Financeiro"
        description="Uma visão sóbria do mês da barbearia. Os valores vêm dos pagamentos de serviços; a mensalidade do LPS Agenda é gerenciada em Plano e assinatura."
        actions={
          <PrototypeAction
            triggerLabel="Exportar relatório"
            triggerSize="lg"
            title="Exportação de relatório"
            description="A exportação em CSV/PDF ainda não está habilitada. Nesta versão, os dados podem ser consultados diretamente no banco."
            steps={[
              {
                title: "Período e filtros",
                description:
                  "Seleção de intervalo, status e forma de pagamento.",
              },
              {
                title: "Arquivo",
                description:
                  "Geração no servidor, com controle de acesso por papel.",
              },
              {
                title: "Privacidade",
                description:
                  "Exportações financeiras ficam restritas ao proprietário.",
              },
            ]}
            footnote="O botão é um protótipo identificado e não gera arquivos."
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Recebido no mês"
          value={formatCurrencyFromCents(financial.paidCents)}
          hint={`${financial.paidCount} pagamento(s) com status pago`}
          icon={Wallet}
          tone="gold"
        />
        <StatCard
          label="Pendente"
          value={formatCurrencyFromCents(financial.pendingCents)}
          hint={`${financial.pendingCount} cobrança(s) aguardando`}
          icon={CalendarClock}
        />
        <StatCard
          label="Pagamentos no mês"
          value={String(financial.paidCount + financial.pendingCount)}
          hint="Criados no período atual"
          icon={ReceiptText}
        />
        <StatCard
          label="Assinatura"
          value={subscription?.plan?.name ?? "Sem plano"}
          hint={
            subscription
              ? "Mensalidade do LPS Agenda"
              : "Sem plano contratado"
          }
          icon={CreditCard}
          tone="muted"
        />
      </div>

      {subscription ? (
        <Card className="border-gold/20 bg-gold-soft/20">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                Plano {subscription.plan?.name ?? "vinculado"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {subscription.subscription.current_period_end
                  ? `Período atual até ${formatDateBR(subscription.subscription.current_period_end, shop.timezone)}.`
                  : "Período atual ainda não definido."}{" "}
                Cobrança recorrente via Asaas Sandbox.
              </p>
            </div>
            <SubscriptionStatusBadge status={subscription.subscription.status} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle>Recebimentos de serviços</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Últimos dez pagamentos de serviços da barbearia. A mensalidade do LPS
            Agenda não entra nesta lista.
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {financial.recent.length > 0 ? (
            <div className="px-4 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referência</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financial.recent.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {payment.id.slice(0, 8)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          criado em{" "}
                          {formatDateBR(payment.created_at, shop.timezone)}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs font-medium tabular-nums">
                        {formatCurrencyFromCents(payment.amount_cents)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {payment.method
                          ? methodLabels[payment.method]
                          : "Não informada"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateOnlyBR(payment.due_date)}
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={payment.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="px-4 pb-4">
              <DashboardEmpty
                icon={ReceiptText}
                title="Nenhum pagamento de serviço registrado"
                description="A receita dos serviços da barbearia é registrada manualmente nesta fase. A mensalidade do LPS Agenda fica separada em Plano e assinatura."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/plano">Gerenciar assinatura</Link>
                  </Button>
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <NoticeCard icon={ShieldCheck} title="Acesso restrito ao proprietário" tone="gold">
          A página exige vínculo de proprietário (ou administrador da
          plataforma). A RLS limita a leitura dos pagamentos à barbearia ativa.
        </NoticeCard>
        <NoticeCard icon={LockKeyhole} title="Nenhuma chave no navegador">
          A cobrança da assinatura usa exclusivamente variáveis de servidor.
          Nenhuma chave do Asaas ou do Supabase administrativo é enviada ao
          cliente.
        </NoticeCard>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-gold" />
        Financeiro da barbearia · mensalidade do LPS Agenda separada em Plano e
        assinatura.
      </div>
    </div>
  );
}
