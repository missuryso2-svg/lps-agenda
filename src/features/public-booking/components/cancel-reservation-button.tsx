"use client";

import { CalendarX2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
import { cancelPublicReservationAction } from "@/features/public-booking/actions";

export function CancelReservationButton({
  slug,
  token,
  serviceName,
  dateLabel,
  timeLabel,
}: {
  slug: string;
  token: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmCancel() {
    setError(null);

    startTransition(async () => {
      const result = await cancelPublicReservationAction({ slug, token });

      if (result.status === "success") {
        setOpen(false);
        router.refresh();
        return;
      }

      setError(result.message ?? "Não foi possível cancelar a reserva agora.");
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <CalendarX2 className="size-4" />
        Cancelar reserva
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!isPending) {
            setOpen(nextOpen);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar esta reserva?</DialogTitle>
            <DialogDescription>
              O horário será liberado para outra pessoa imediatamente. Esta
              ação não pode ser desfeita pelo link público.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-border/80 bg-muted/35 px-3 py-2.5">
            <p className="text-xs font-medium">{serviceName}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {dateLabel} às {timeLabel}
            </p>
          </div>

          <FormError message={error} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Manter reserva
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmCancel}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 motion-safe:animate-spin" />
                  Cancelando...
                </>
              ) : (
                <>
                  <CalendarX2 className="size-4" />
                  Confirmar cancelamento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
