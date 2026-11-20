"use client";

import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startSubscriptionAction } from "@/features/billing/actions";
import type { BillingPlan } from "@/features/billing/types";
import { fieldErrorsFrom } from "@/lib/actions";
import { formatCurrencyFromCents } from "@/lib/format";
import {
  BILLING_TYPE_LABELS,
  BILLING_TYPES,
  startSubscriptionSchema,
  type BillingType,
} from "@/lib/validation/billing";

export function StartSubscriptionDialog({
  open,
  onOpenChange,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: BillingPlan;
}) {
  const [holderName, setHolderName] = useState("");
  const [document, setDocument] = useState("");
  const [billingType, setBillingType] = useState<BillingType>("pix");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    const parsed = startSubscriptionSchema.safeParse({
      planId: plan.id,
      billingType,
      holderName,
      document,
    });

    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error) as Record<string, string[]>);
      return;
    }

    setFieldErrors({});

    startTransition(async () => {
      const result = await startSubscriptionAction(parsed.data);

      if (result.status === "error") {
        setFieldErrors((result.fieldErrors ?? {}) as Record<string, string[]>);
        setServerError(
          result.message ?? "Não foi possível iniciar a contratação.",
        );
        toast.error(
          result.message ?? "Não foi possível iniciar a contratação.",
        );
        return;
      }

      toast.success(result.message ?? "Contratação iniciada.");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Retomar assinatura Asaas · {plan.name}</DialogTitle>
          <DialogDescription>
            A mensalidade do LPS Agenda é cobrada do proprietário da barbearia,
            separada dos serviços prestados aos clientes.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-gold/25 bg-gold-soft/30 p-3.5">
          <p className="text-sm font-medium">
            {formatCurrencyFromCents(plan.price_cents, plan.currency)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {plan.interval === "year" ? "/ ano" : "/ mês"}
            </span>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Valor de catálogo aplicado na retomada do contrato legado. A
            ativação depende da confirmação do pagamento.
          </p>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError message={serverError} />

          <div className="space-y-2">
            <Label htmlFor="billing-holder">Nome do pagador</Label>
            <Input
              id="billing-holder"
              value={holderName}
              onChange={(event) => setHolderName(event.target.value)}
              placeholder="Nome completo ou razão social"
              className="h-11 rounded-xl px-3"
              autoComplete="name"
              aria-invalid={Boolean(fieldErrors.holderName)}
              disabled={isPending}
              maxLength={120}
            />
            {fieldErrors.holderName ? (
              <p className="text-xs text-destructive">
                {fieldErrors.holderName[0]}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="billing-document">CPF ou CNPJ</Label>
            <Input
              id="billing-document"
              value={document}
              onChange={(event) => setDocument(event.target.value)}
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              className="h-11 rounded-xl px-3 tabular-nums"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.document)}
              disabled={isPending}
              maxLength={20}
            />
            {fieldErrors.document ? (
              <p className="text-xs text-destructive">
                {fieldErrors.document[0]}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Usado apenas para cadastrar o pagador no Asaas. O documento é
                exibido mascarado nesta página.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="billing-type">Forma de pagamento</Label>
            <Select
              value={billingType}
              onValueChange={(value) => setBillingType(value as BillingType)}
              disabled={isPending}
            >
              <SelectTrigger
                id="billing-type"
                className="h-11 w-full rounded-xl px-3"
              >
                <SelectValue placeholder="Escolha boleto ou Pix" />
              </SelectTrigger>
              <SelectContent>
                {BILLING_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {BILLING_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Cartão de crédito não está disponível nesta fase. Nenhum dado de
              cartão é coletado por esta tela.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-border/80 bg-muted/25 p-3.5 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold" />
            <p>
              Este ambiente de testes usa o Asaas Sandbox. Confira o plano e os
              dados do titular antes de continuar.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="gold" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Retomando...
                </>
              ) : (
                <>
                  <CreditCard className="size-4" />
                  Retomar contratação
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
