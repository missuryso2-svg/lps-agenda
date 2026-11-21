"use client";

import {
  CalendarClock,
  CalendarSync,
  Clock3,
  Loader2,
  Phone,
  Scissors,
  StickyNote,
  UserRound,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
import { AppointmentStatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  completeAppointmentAction,
  confirmAppointmentAction,
  markAppointmentNoShowAction,
  startAppointmentAction,
} from "@/features/scheduling/actions";
import {
  allowedAppointmentActions,
  appointmentTransitions,
  canRescheduleAppointment,
  type AgendaAppointment,
  type AppointmentAction,
} from "@/features/scheduling/types";
import type { ActionState } from "@/lib/actions";
import {
  formatCurrencyFromCents,
  formatDateBR,
  formatPhoneBR,
  formatTimeBR,
} from "@/lib/format";

const directActions: Record<
  Exclude<AppointmentAction, "cancel" | "complete">,
  (id: string) => Promise<ActionState>
> = {
  confirm: confirmAppointmentAction,
  start: startAppointmentAction,
  no_show: markAppointmentNoShowAction,
};

function actionVariant(action: AppointmentAction) {
  if (action === "cancel") {
    return "destructive" as const;
  }

  if (action === "confirm" || action === "start") {
    return "gold" as const;
  }

  return "outline" as const;
}

export function AppointmentDetailsDialog({
  appointment,
  timeZone,
  canCreateAppointments,
  onOpenChange,
  onCancelRequest,
  onRescheduleRequest,
}: {
  appointment: AgendaAppointment | null;
  timeZone: string;
  canCreateAppointments: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelRequest: (appointment: AgendaAppointment) => void;
  onRescheduleRequest: (appointment: AgendaAppointment) => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<AppointmentAction | null>(
    null,
  );
  const [ratingOpen, setRatingOpen] = useState(false);
  const [barberScore, setBarberScore] = useState("");
  const [shopScore, setShopScore] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!appointment) {
    return null;
  }

  const actions = allowedAppointmentActions(appointment.status);
  const rescheduleAllowed =
    canCreateAppointments && canRescheduleAppointment(appointment.status);

  const runAction = (action: AppointmentAction, skipRatings = false) => {
    if (action === "complete" && !ratingOpen) {
      setRatingOpen(true);
      setServerError(null);
      return;
    }
    if (action === "cancel") {
      setServerError(null);
      onCancelRequest(appointment);
      return;
    }

    setServerError(null);
    setActiveAction(action);

    startTransition(async () => {
      const result =
        action === "complete"
          ? await completeAppointmentAction(appointment.id, {
              barberScore:
                skipRatings || barberScore === "" ? null : Number(barberScore),
              shopScore:
                skipRatings || shopScore === "" ? null : Number(shopScore),
            })
          : await directActions[action](appointment.id);

      if (result.status === "error") {
        setServerError(
          result.message ?? "Não foi possível alterar o agendamento.",
        );
        toast.error(
          result.message ?? "Não foi possível alterar o agendamento.",
        );
        return;
      }

      toast.success(result.message ?? "Agendamento atualizado.");
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
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>
              {ratingOpen ? "Concluir atendimento" : appointment.customerName}
            </DialogTitle>
            <AppointmentStatusBadge status={appointment.status} />
          </div>
          <DialogDescription>
            {ratingOpen
              ? appointment.customerName
              : "Detalhes do atendimento e ações permitidas para o status atual."}
          </DialogDescription>
        </DialogHeader>

        <FormError message={serverError} />

        <div className="grid gap-2.5 rounded-2xl border border-border/80 bg-muted/20 p-4 text-xs sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-gold" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Data e horário
              </p>
              <p className="mt-0.5 font-medium">
                {formatDateBR(appointment.startsAt, timeZone)}
              </p>
              <p className="text-muted-foreground">
                {formatTimeBR(appointment.startsAt, timeZone)} –{" "}
                {formatTimeBR(appointment.endsAt, timeZone)}
                {appointment.durationMinutes
                  ? ` · ${appointment.durationMinutes} min`
                  : ""}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <UserRound className="mt-0.5 size-3.5 shrink-0 text-gold" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Profissional
              </p>
              <p className="mt-0.5 font-medium">{appointment.barberName}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Scissors className="mt-0.5 size-3.5 shrink-0 text-gold" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Serviço
              </p>
              <p className="mt-0.5 font-medium">{appointment.serviceName}</p>
              <p className="text-muted-foreground">
                {formatCurrencyFromCents(appointment.priceCents)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Phone className="mt-0.5 size-3.5 shrink-0 text-gold" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Contato
              </p>
              <p className="mt-0.5 font-medium">
                {formatPhoneBR(appointment.customerPhone)}
              </p>
            </div>
          </div>
        </div>

        {appointment.notes ? (
          <div className="rounded-xl border border-border/80 p-3.5">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <StickyNote className="size-3 text-gold" />
              Observações
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">
              {appointment.notes}
            </p>
          </div>
        ) : null}

        {appointment.cancelReason ? (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3.5">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
              <XCircle className="size-3" />
              Motivo do cancelamento
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">
              {appointment.cancelReason}
            </p>
          </div>
        ) : null}

        {ratingOpen ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Avaliações informadas pelos clientes e registradas pela equipe.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: "Avaliação do barbeiro",
                  value: barberScore,
                  set: setBarberScore,
                },
                {
                  label: "Avaliação da barbearia",
                  value: shopScore,
                  set: setShopScore,
                },
              ].map((field) => (
                <label key={field.label} className="grid gap-1 text-sm">
                  {field.label}
                  <select
                    className="rounded-md border bg-background p-2"
                    value={field.value}
                    onChange={(e) => field.set(e.target.value)}
                    disabled={isPending}
                  >
                    <option value="">Sem nota</option>
                    {Array.from({ length: 11 }, (_, score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={isPending}
                onClick={() => runAction("complete", true)}
              >
                Não avaliar
              </Button>
              <Button
                variant="gold"
                disabled={isPending}
                onClick={() => runAction("complete")}
              >
                Concluir atendimento
              </Button>
            </div>
          </div>
        ) : actions.length > 0 || rescheduleAllowed ? (
          <div className="space-y-2">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="size-3 text-gold" />
              Ações disponíveis
            </p>
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action}
                  type="button"
                  variant={actionVariant(action)}
                  size="sm"
                  onClick={() => runAction(action)}
                  disabled={isPending}
                >
                  {isPending && activeAction === action ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : action === "cancel" ? (
                    <XCircle className="size-3.5" />
                  ) : (
                    <Clock3 className="size-3.5" />
                  )}
                  {action === "complete"
                    ? "Concluir atendimento"
                    : appointmentTransitions[action].label}
                </Button>
              ))}

              {rescheduleAllowed ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setServerError(null);
                    onRescheduleRequest(appointment);
                  }}
                  disabled={isPending}
                >
                  <CalendarSync className="size-3.5" />
                  Reagendar
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-border/80 bg-muted/20 px-3.5 py-3 text-[11px] text-muted-foreground">
            Este agendamento está encerrado e não possui novas ações.
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
