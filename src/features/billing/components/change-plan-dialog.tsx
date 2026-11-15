"use client";

import { ArrowLeftRight, Loader2 } from "lucide-react";
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
import { changePlanAction } from "@/features/billing/actions";
import type { BillingPlan } from "@/features/billing/types";
import { formatCurrencyFromCents } from "@/lib/format";

export function ChangePlanDialog({
  open,
  onOpenChange,
  plan,
  trialing = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: BillingPlan;
  trialing?: boolean;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onConfirm = () => {
    setServerError(null);

    startTransition(async () => {
      const result = await changePlanAction({ planId: plan.id });

      if (result.status === "error") {
        setServerError(result.message ?? "Não foi possível trocar o plano.");
        toast.error(result.message ?? "Não foi possível trocar o plano.");
        return;
      }

      toast.success(result.message ?? "Plano alterado.");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar para o plano {plan.name}</DialogTitle>
          <DialogDescription>
            {trialing
              ? "Durante o teste gratuito, a troca é local: o novo valor só será usado na primeira cobrança após o período, e nenhuma assinatura é criada no Asaas agora."
              : "O novo valor passa a valer para as próximas cobranças da assinatura. A cobrança pendente também será atualizada, quando possível."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/80 bg-muted/25 p-4">
          <p className="text-sm font-medium">
            {formatCurrencyFromCents(plan.price_cents, plan.currency)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {plan.interval === "year" ? "/ ano" : "/ mês"}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {trialing
              ? "Nenhuma chamada ao Asaas é feita durante o teste gratuito."
              : "A mudança é enviada ao Asaas antes de ser refletida no banco."}
          </p>
        </div>

        <FormError message={serverError} />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="gold"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Alterando...
              </>
            ) : (
              <>
                <ArrowLeftRight className="size-4" />
                Confirmar troca
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
