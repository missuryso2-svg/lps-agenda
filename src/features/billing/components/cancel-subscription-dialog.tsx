"use client";

import { Loader2, TriangleAlert } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelSubscriptionAction } from "@/features/billing/actions";

const REASON_MAX = 500;

export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  trialing = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trialing?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onOpenChangeSafe = (nextOpen: boolean) => {
    if (isPending) {
      return;
    }

    if (!nextOpen) {
      setReason("");
      setServerError(null);
    }

    onOpenChange(nextOpen);
  };

  const onConfirm = () => {
    setServerError(null);

    startTransition(async () => {
      const result = await cancelSubscriptionAction({ reason });

      if (result.status === "error") {
        setServerError(
          result.message ?? "Não foi possível cancelar a assinatura.",
        );
        toast.error(
          result.message ?? "Não foi possível cancelar a assinatura.",
        );
        return;
      }

      toast.success(result.message ?? "Assinatura cancelada.");
      setReason("");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChangeSafe}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-destructive" />
            Cancelar assinatura
          </DialogTitle>
          <DialogDescription>
            {trialing
              ? "O teste gratuito será encerrado e nenhuma assinatura ou cobrança será criada no Asaas."
              : "A recorrência será encerrada no Asaas. As cobranças pendentes geradas pela assinatura também são removidas; cobranças já pagas permanecem no histórico."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-[11px] leading-relaxed text-muted-foreground">
          {trialing
            ? "Esta ação não pode ser desfeita por aqui. O teste gratuito não poderá ser iniciado novamente nesta barbearia."
            : "Esta ação não pode ser desfeita por aqui. Para voltar a assinar, será necessário iniciar uma nova contratação."}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="billing-cancel-reason">Motivo (opcional)</Label>
            <span className="text-[10px] text-muted-foreground">
              {reason.length}/{REASON_MAX}
            </span>
          </div>
          <Textarea
            id="billing-cancel-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={REASON_MAX}
            placeholder="Ex.: vou pausar o negócio, teste não atendeu..."
            className="rounded-xl"
            disabled={isPending}
          />
        </div>

        <FormError message={serverError} />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChangeSafe(false)}
            disabled={isPending}
          >
            Manter assinatura
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Cancelando...
              </>
            ) : (
              "Confirmar cancelamento"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
