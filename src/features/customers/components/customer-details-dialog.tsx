"use client";

import {
  CalendarDays,
  Mail,
  Pencil,
  Phone,
  StickyNote,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ManagedCustomer } from "@/features/customers/types";
import { formatDateBR, formatPhoneBR } from "@/lib/format";

export function CustomerDetailsDialog({
  open,
  onOpenChange,
  customer,
  timeZone,
  canManage,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: ManagedCustomer | null;
  timeZone: string;
  canManage: boolean;
  onEdit: (customer: ManagedCustomer) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {customer?.full_name ?? "Detalhes do cliente"}
            {customer ? (
              <Badge
                variant="outline"
                className={
                  customer.is_active
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-border bg-muted/50 text-muted-foreground"
                }
              >
                {customer.is_active ? "Ativo" : "Arquivado"}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Dados de contato e observações internas da barbearia ativa.
          </DialogDescription>
        </DialogHeader>

        {customer ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
                <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Phone className="size-3.5 text-gold" />
                  Telefone
                </p>
                <p className="mt-1.5 text-sm font-medium tabular-nums">
                  {formatPhoneBR(customer.phone)}
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
                <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Mail className="size-3.5 text-gold" />
                  E-mail
                </p>
                <p className="mt-1.5 break-all text-sm font-medium">
                  {customer.email ?? "Não informado"}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-card p-3.5">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <StickyNote className="size-3.5 text-gold" />
                Observações
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {customer.notes ?? "Nenhuma observação registrada."}
              </p>
            </div>

            <div className="grid gap-3 text-[11px] text-muted-foreground sm:grid-cols-2">
              <p className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                Cadastrado em {formatDateBR(customer.created_at, timeZone)}
              </p>
              <p className="inline-flex items-center gap-1.5 sm:justify-end">
                <CalendarDays className="size-3.5" />
                Atualizado em {formatDateBR(customer.updated_at, timeZone)}
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
          {customer && canManage ? (
            <Button
              type="button"
              variant="gold"
              onClick={() => {
                onOpenChange(false);
                onEdit(customer);
              }}
            >
              <Pencil className="size-4" />
              Editar cliente
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
