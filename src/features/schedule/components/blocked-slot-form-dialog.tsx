"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarOff, Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createBlockedSlotAction,
  updateBlockedSlotAction,
} from "@/features/schedule/actions";
import type {
  BlockedSlotRow,
  ScheduleBarber,
} from "@/features/schedule/types";
import { applyServerFieldErrors } from "@/lib/form-errors";
import {
  formatDateOnlyBR,
  isFullDayRange,
  localDateString,
  localTimeString,
} from "@/lib/format";
import {
  blockedSlotFormSchema,
  type BlockedSlotFormValues,
} from "@/lib/validation/schedule";

const ALL_BARBERS = "__all__";

function buildDefaults(
  slot: BlockedSlotRow | null,
  timeZone: string,
): BlockedSlotFormValues {
  if (!slot) {
    return {
      barberId: "",
      date: localDateString(new Date(), timeZone),
      allDay: false,
      startsAt: "09:00",
      endsAt: "12:00",
      reason: "",
    };
  }

  return {
    barberId: slot.barber_id ?? "",
    date: localDateString(slot.starts_at, timeZone),
    allDay: isFullDayRange(slot.starts_at, slot.ends_at, timeZone),
    startsAt: localTimeString(slot.starts_at, timeZone),
    endsAt: localTimeString(slot.ends_at, timeZone),
    reason: slot.reason ?? "",
  };
}

export function BlockedSlotFormDialog({
  open,
  onOpenChange,
  slot,
  barbers,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: BlockedSlotRow | null;
  barbers: ScheduleBarber[];
  timeZone: string;
}) {
  const form = useForm<BlockedSlotFormValues>({
    resolver: zodResolver(blockedSlotFormSchema),
    defaultValues: buildDefaults(slot, timeZone),
  });
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const allDay = useWatch({ control: form.control, name: "allDay" });
  const barberId = useWatch({ control: form.control, name: "barberId" });
  const reason = useWatch({ control: form.control, name: "reason" }) ?? "";
  const date = useWatch({ control: form.control, name: "date" });

  const onSubmit = (values: BlockedSlotFormValues) => {
    setServerError(null);

    startTransition(async () => {
      const result = slot
        ? await updateBlockedSlotAction(slot.id, values)
        : await createBlockedSlotAction(values);

      if (result.status === "error") {
        applyServerFieldErrors(form, result.fieldErrors);
        setServerError(result.message ?? "Não foi possível salvar o bloqueio.");
        toast.error(result.message ?? "Não foi possível salvar o bloqueio.");
        return;
      }

      toast.success(result.message ?? "Bloqueio salvo.");
      form.reset(values);
      onOpenChange(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {slot ? "Editar bloqueio" : "Novo bloqueio"}
          </DialogTitle>
          <DialogDescription>
            Bloqueios retiram períodos da disponibilidade sem alterar a jornada
            semanal. Use para folgas pontuais, férias, compromissos ou pausas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormError message={serverError} />

          <div className="space-y-2">
            <Label htmlFor="blocked-barber">Profissional</Label>
            <Controller
              control={form.control}
              name="barberId"
              render={({ field }) => (
                <Select
                  value={field.value || ALL_BARBERS}
                  onValueChange={(value) =>
                    field.onChange(value === ALL_BARBERS ? "" : value)
                  }
                  disabled={isPending}
                >
                  <SelectTrigger
                    id="blocked-barber"
                    className="h-10 w-full rounded-xl"
                  >
                    <SelectValue placeholder="Selecione o profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_BARBERS}>
                      <CalendarOff className="size-3.5 text-muted-foreground" />
                      Toda a barbearia
                    </SelectItem>
                    {barbers.map((barber) => (
                      <SelectItem key={barber.id} value={barber.id}>
                        {barber.name}
                        {barber.is_active ? "" : " (inativo)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-[11px] text-muted-foreground">
              {barberId
                ? "O bloqueio vale apenas para o profissional selecionado."
                : "O bloqueio vale para toda a barbearia e conflita com qualquer profissional."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="blocked-date">Data</Label>
              <Input
                id="blocked-date"
                type="date"
                disabled={isPending}
                aria-invalid={Boolean(form.formState.errors.date)}
                className="h-11 rounded-xl px-3"
                {...form.register("date")}
              />
              {form.formState.errors.date ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.date.message}
                </p>
              ) : date ? (
                <p className="text-[11px] text-muted-foreground">
                  {formatDateOnlyBR(date)} · fuso {timeZone}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/25 px-3.5 py-3">
              <div>
                <Label htmlFor="blocked-all-day">Dia inteiro</Label>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Reserva o dia completo no fuso da barbearia.
                </p>
              </div>
              <Switch
                id="blocked-all-day"
                checked={Boolean(allDay)}
                onCheckedChange={(checked) =>
                  form.setValue("allDay", checked, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                disabled={isPending}
                aria-label="Bloqueio de dia inteiro"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="blocked-start">Horário inicial</Label>
              <Input
                id="blocked-start"
                type="time"
                step={300}
                disabled={isPending || Boolean(allDay)}
                aria-invalid={Boolean(form.formState.errors.startsAt)}
                className="h-11 rounded-xl px-3 tabular-nums"
                {...form.register("startsAt")}
              />
              {form.formState.errors.startsAt ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.startsAt.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="blocked-end">Horário final</Label>
              <Input
                id="blocked-end"
                type="time"
                step={300}
                disabled={isPending || Boolean(allDay)}
                aria-invalid={Boolean(form.formState.errors.endsAt)}
                className="h-11 rounded-xl px-3 tabular-nums"
                {...form.register("endsAt")}
              />
              {form.formState.errors.endsAt ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.endsAt.message}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {allDay
                    ? "O dia inteiro será bloqueado até 00:00 do dia seguinte."
                    : "O horário final precisa ser posterior ao inicial."}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="blocked-reason">Motivo (opcional)</Label>
              <span className="text-[10px] text-muted-foreground">
                {reason.length}/500
              </span>
            </div>
            <Textarea
              id="blocked-reason"
              rows={3}
              maxLength={500}
              placeholder="Férias, compromisso pessoal, manutenção..."
              className="rounded-xl"
              disabled={isPending}
              aria-invalid={Boolean(form.formState.errors.reason)}
              {...form.register("reason")}
            />
            {form.formState.errors.reason ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.reason.message}
              </p>
            ) : null}
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
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  {slot ? "Salvar bloqueio" : "Criar bloqueio"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
