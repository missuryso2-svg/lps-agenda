"use client";

import { AlertTriangle, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { cancelAppointmentAction } from "@/features/scheduling/actions";
import type { AgendaAppointment } from "@/features/scheduling/types";
import {
  formatDateBR,
  formatTimeBR,
} from "@/lib/format";

const REASON_MAX = 500;

export function CancelAppointmentDialog({
  appointment,
  timeZone,
  onOpenChange,
}: {
  appointment: AgendaAppointment | null;
  timeZone: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!appointment) {
    return null;
  }

  const submit = () => {
    setServerError(null);

    startTransition(async () => {
      const result = await cancelAppointmentAction(appointment.id, { reason });

      if (result.status === "error") {
        setServerError(
          result.message ?? "Não foi possível cancelar o agendamento.",
        );
        toast.error(
          result.message ?? "Não foi possível cancelar o agendamento.",
        );
        return;
      }

      toast.success(result.message ?? "Agendamento cancelado.");
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!isPending) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent overlayClassName="j2-agenda-overlay" className="j2-agenda-dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar agendamento?</DialogTitle>
          <DialogDescription>
            {appointment.customerName} ·{" "}
            {formatDateBR(appointment.startsAt, timeZone)} às{" "}
            {formatTimeBR(appointment.startsAt, timeZone)}.
          </DialogDescription>
        </DialogHeader>

        <FormError message={serverError} />

        <div className="flex gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            O horário deixará de bloquear a agenda assim que o cancelamento for
            concluído. O registro permanece no histórico com o motivo
            informado.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
            <span className="text-[10px] text-muted-foreground">
              {reason.length}/{REASON_MAX}
            </span>
          </div>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={REASON_MAX}
            placeholder="Ex.: cliente pediu para remarcar, imprevisto..."
            className="rounded-xl"
            disabled={isPending}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Manter agendamento
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Cancelando...
              </>
            ) : (
              <>
                <XCircle className="size-4" />
                Confirmar cancelamento
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
