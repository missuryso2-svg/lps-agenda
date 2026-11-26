import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptText } from "lucide-react";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaymentStatusBadge } from "@/components/dashboard/status-badge";
import { getFinancialOverview } from "@/features/dashboard/queries";
import { requireOwnerDashboardContext } from "@/lib/auth/dal";
import { formatCurrencyFromCents, formatDateBR, formatDateOnlyBR } from "@/lib/format";
import type { Database } from "@/types/database";
import "@/components/dashboard/account-j2.css";

export const metadata: Metadata = { title: "Financeiro" };

const methodLabels: Record<Database["public"]["Enums"]["payment_method"], string> = {
  boleto: "Boleto",
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  cash: "Dinheiro",
  bank_transfer: "Transferência",
  other: "Outro",
};

export default async function FinancialPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string | string[] }>;
}) {
  const [{ active: { barbershop: shop } }, { periodo }] = await Promise.all([
    requireOwnerDashboardContext(),
    searchParams,
  ]);
  const previous = periodo === "anterior";
  const financial = await getFinancialOverview(shop.id, shop.timezone, previous);
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: "long", year: "numeric", timeZone: shop.timezone,
  }).format(financial.period.start);
  const weeks = financial.receivedByWeek;
  const showChart = weeks.filter(value => value > 0).length > 1;

  return (
    <section className="j2-c3">
      <PageHeader
        className="j2-c3-heading"
        title="Financeiro"
        description="Acompanhe os recebimentos e os atendimentos da sua barbearia."
        actions={<Link className="text-sm underline underline-offset-4" href="/dashboard/plano">Plano e assinatura</Link>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold capitalize">{month}</p>
        <nav className="j2-c3-period flex flex-wrap gap-2" aria-label="Período financeiro">
          <Link className="rounded-md border px-3 py-2 text-sm" href="/dashboard/financeiro" aria-current={!previous ? "page" : undefined}>
            Este mês
          </Link>
          <Link className="rounded-md border px-3 py-2 text-sm" href="/dashboard/financeiro?periodo=anterior" aria-current={previous ? "page" : undefined}>
            Mês anterior
          </Link>
        </nav>
      </div>

      <dl className="j2-c3-metrics" aria-label="Resumo do período">
        <div>
          <dt className="text-sm font-semibold">Recebido</dt>
          <dd>{formatCurrencyFromCents(financial.paidCents)}</dd>
          <dd className="j2-c3-meta mt-1">{financial.paidCount} pagamento(s) confirmado(s)</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold">A receber</dt>
          <dd>{formatCurrencyFromCents(financial.pendingCents)}</dd>
          <dd className="j2-c3-meta mt-1">{financial.pendingCount} cobrança(s) pendente(s) ou vencida(s)</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold">Pagamentos no período</dt>
          <dd>{financial.paidCount + financial.pendingCount}</dd>
          <dd className="j2-c3-meta mt-1">Pagos, pendentes e vencidos</dd>
        </div>
      </dl>

      {showChart && (
        <figure className="j2-c3-panel">
          <figcaption className="j2-c3-card-title">Recebido por faixa de dias</figcaption>
          <div className="mt-3 space-y-2">
            {weeks.slice(0, Math.ceil(Number(new Intl.DateTimeFormat("pt-BR", {
              day: "numeric", timeZone: shop.timezone,
            }).format(new Date(financial.period.end.getTime() - 1))) / 7)).map((value, index) => {
              const label = ["1 a 7", "8 a 14", "15 a 21", "22 a 28", "29 em diante"][index];
              return (
                <div className="j2-c3-chart text-sm" key={label}>
                  <span>{label}</span>
                  <meter min={0} max={Math.max(...weeks)} value={value} aria-label={"Dias " + label} />
                  <span className="font-medium tabular-nums">{formatCurrencyFromCents(value)}</span>
                </div>
              );
            })}
          </div>
        </figure>
      )}

      <div className="j2-c3-two-columns">
        <section className="j2-c3-panel" aria-labelledby="receipts-heading">
          <h3 id="receipts-heading">Recebimentos de serviços</h3>
          <p className="j2-c3-meta mt-1">Até dez registros do período, pela data de lançamento. A mensalidade do LPS Agenda fica em Plano e assinatura.</p>
          {financial.recent.length ? (
            <ul className="j2-c3-ledger mt-4">
              {financial.recent.map(payment => (
                <li key={payment.id}>
                  <div>
                    <p className="text-sm font-semibold">{payment.method ? methodLabels[payment.method] : "Forma não informada"}</p>
                    <p className="j2-c3-meta">{formatDateBR(payment.created_at, shop.timezone)}</p>
                    {payment.due_date && <p className="j2-c3-meta">Vencimento em {formatDateOnlyBR(payment.due_date)}</p>}
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatCurrencyFromCents(payment.amount_cents)}</p>
                    <PaymentStatusBadge status={payment.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <DashboardEmpty icon={ReceiptText} title="Nenhum pagamento de serviço neste período" description="Consulte outro mês para conferir os lançamentos anteriores." />
          )}
        </section>

        <section className="j2-c3-panel" aria-labelledby="history-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="history-heading">Atendimentos concluídos</h3>
            <Link className="text-sm underline underline-offset-4" href="/dashboard/agenda">Abrir agenda</Link>
          </div>
          <p className="j2-c3-meta mt-1">Até dez atendimentos no período, com o valor registrado na agenda.</p>
          {financial.history.length ? (
            <ul className="j2-c3-ledger mt-4">
              {financial.history.map(appointment => (
                <li className="text-sm" key={appointment.id}>
                  <time dateTime={appointment.starts_at}>{formatDateBR(appointment.starts_at, shop.timezone)}</time>
                  <span className="font-semibold tabular-nums">{formatCurrencyFromCents(appointment.price_cents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="j2-c3-meta mt-5">Nenhum atendimento concluído no período.</p>
          )}
        </section>
      </div>
    </section>
  );
}
