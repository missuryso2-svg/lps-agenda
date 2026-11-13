"use client";

import { CalendarSync, Clock3, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rescheduleAppointmentAction } from "@/features/scheduling/actions";
import { SlotPicker } from "@/features/scheduling/components/slot-picker";
import type { AgendaAppointment } from "@/features/scheduling/types";
import {
  formatDateBR,
  formatTimeBR,
  localDateString,
} from "@/lib/format";

export function RescheduleAppointmentDialog({
  appointment,
  timeZone,
  today,
  onOpenChange,
}: {
  appointment: AgendaAppointment | null;
  timeZone: string;
  today: string;
  onOpenChange: (open: boolean) => void;
}) {
  if (!appointment) {
    return null;
  }

  return (
    <RescheduleForm
      key={appointment.id}
      appointment={appointment}
      timeZone={timeZone}
      today={today}
      onOpenChange={onOpenChange}
    />
  );
}

function RescheduleForm({
  appointment,
  timeZone,
  today,
  onOpenChange,
}: {
  appointment: AgendaAppointment;
  timeZone: string;
  today: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const currentDate = localDateString(appointment.startsAt, timeZone);
  const [date, setDate] = useState(currentDate >= today ? currentDate : today);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!date || !selectedTime) {
      setServerError("Selecione a nova data e o novo horário.");
      return;
    }

    setServerError(null);

    startTransition(async () => {
      const result = await rescheduleAppointmentAction(appointment.id, {
        date,
        time: selectedTime,
      });

      if (result.status === "error") {
        setServerError(
          result.message ?? "Não foi possível reagendar o atendimento.",
        );
        toast.error(
          result.message ?? "Não foi possível reagendar o atendimento.",
        );
        return;
      }

      toast.success(result.message ?? "Agendamento reagendado.");
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reagendar atendimento</DialogTitle>
          <DialogDescription>
            Selecione uma nova data e um horário livre. O serviço e o
            profissional serão preservados.
          </DialogDescription>
        </DialogHeader>

        <FormError message={serverError} />

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/20 px-3 py-2.5 text-xs">
          <span>
            <span className="text-muted-foreground">Atual: </span>
            {formatDateBR(appointment.startsAt, timeZone)} às{" "}
            {formatTimeBR(appointment.startsAt, timeZone)}
          </span>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Clock3 className="size-3 text-gold" />
            {appointment.durationMinutes ?? 0} min
          </Badge>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reschedule-date">Nova data</Label>
          <Input
            id="reschedule-date"
            type="date"
            min={today}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setSelectedTime(null);
              setServerError(null);
            }}
            className="h-10 rounded-xl"
            disabled={isPending}
          />
        </div>

        <SlotPicker
          serviceId={appointment.serviceId}
          barberId={appointment.barberId}
          date={date}
          timeZone={timeZone}
          excludeAppointmentId={appointment.id}
          selectedTime={selectedTime}
          onSelect={(time) => {
            setSelectedTime(time);
            setServerError(null);
          }}
          disabled={isPending}
        />

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
            onClick={submit}
            disabled={isPending || !date || !selectedTime}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Reagendando...
              </>
            ) : (
              <>
                <CalendarSync className="size-4" />
                Confirmar novo horário
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
