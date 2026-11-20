import { ReceiptText, Wallet } from "lucide-react";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { PaymentStatusBadge } from "@/components/dashboard/status-badge";
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
import {
  BILLING_TYPE_LABELS,
  type BillingType,
} from "@/lib/validation/billing";
import {
  formatCurrencyFromCents,
  formatDateBR,
  formatDateOnlyBR,
} from "@/lib/format";
import type { BillingInvoice } from "../types";

export function LegacyInvoices({
  invoices,
  timezone,
}: {
  invoices: BillingInvoice[];
  timezone: string;
}) {
  return (
    <Card>
      <CardHeader className="border-b border-border/70 pb-4">
        <CardTitle className="flex items-center gap-2">
          <ReceiptText className="size-4 text-gold" />
          Histórico de mensalidades Asaas
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Cobranças da assinatura do LPS Agenda. Os pagamentos dos serviços da
          barbearia continuam no Financeiro.
        </p>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {invoices.length > 0 ? (
          <div className="px-4 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referência</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cobrança</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {invoice.id.slice(0, 8)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        criado em {formatDateBR(invoice.createdAt, timezone)}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs font-medium tabular-nums">
                      {formatCurrencyFromCents(invoice.amountCents)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {invoice.method
                        ? (BILLING_TYPE_LABELS[invoice.method as BillingType] ??
                          invoice.method)
                        : "Não informada"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateOnlyBR(invoice.dueDate)}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={invoice.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {invoice.invoiceUrl ? (
                        <Button asChild variant="ghost" size="sm">
                          <a
                            href={invoice.invoiceUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            Abrir
                          </a>
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <DashboardEmpty
              icon={Wallet}
              title="Nenhuma cobrança registrada"
              description="As faturas registradas para esta assinatura aparecerão aqui."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
