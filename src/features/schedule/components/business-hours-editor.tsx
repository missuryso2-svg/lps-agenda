"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarOff, CheckCircle2, Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveBusinessHoursAction } from "@/features/schedule/actions";
import type { BusinessHourRow } from "@/features/schedule/types";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { shortWeekdayLabel, weekdayLabel } from "@/lib/format";
import {
  toTimeInput,
  WEEKDAYS,
  weeklyBusinessHoursSchema,
  type WeeklyBusinessHoursValues,
} from "@/lib/validation/schedule";

function buildDefaults(
  hours: BusinessHourRow[],
): WeeklyBusinessHoursValues {
  return {
    days: WEEKDAYS.map((weekday) => {
      const row = hours.find((item) => item.weekday === weekday);

      return {
        weekday,
        isActive: row?.is_active ?? false,
        opensAt: row ? toTimeInput(row.opens_at) : "09:00",
        closesAt: row ? toTimeInput(row.closes_at) : "18:00",
      };
    }),
  };
}

export function BusinessHoursEditor({
  hours,
  canManage,
}: {
  hours: BusinessHourRow[];
  canManage: boolean;
}) {
  const form = useForm<WeeklyBusinessHoursValues>({
    resolver: zodResolver(weeklyBusinessHoursSchema),
    defaultValues: buildDefaults(hours),
  });
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const days = useWatch({ control: form.control, name: "days" }) ?? [];
  const openDays = days.filter((day) => day.isActive).length;

  const onSubmit = (values: WeeklyBusinessHoursValues) => {
    setServerError(null);

    startTransition(async () => {
      const result = await saveBusinessHoursAction(values);

      if (result.status === "error") {
        applyServerFieldErrors(form, result.fieldErrors);
        setServerError(
          result.message ?? "Não foi possível salvar os horários.",
        );
        toast.error(
          result.message ?? "Não foi possível salvar os horários.",
        );
        return;
      }

      toast.success(result.message ?? "Horários atualizados.");
      form.reset(values);
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium">Funcionamento semanal</p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Ative os dias de atendimento e defina abertura e fechamento. Dias
            desativados ficam salvos como fechados e não liberam horários na
            agenda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-gold/30 bg-gold-soft/40 text-gold"
          >
            {openDays} de 7 dias abertos
          </Badge>
          {!canManage ? (
            <Badge variant="outline" className="text-muted-foreground">
              Somente leitura
            </Badge>
          ) : null}
        </div>
      </div>

      <FormError message={serverError} />

      <div className="overflow-hidden rounded-2xl border border-border/80">
        {days.map((day, index) => {
          const errors = form.formState.errors.days?.[index];
          const closed = !day.isActive;

          return (
            <div
              key={day.weekday}
              className={
                closed
                  ? "border-b border-border/70 bg-muted/25 px-4 py-3.5 last:border-b-0"
                  : "border-b border-border/70 bg-card px-4 py-3.5 last:border-b-0"
              }
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border/80 bg-card text-[10px] font-semibold text-muted-foreground">
                    {shortWeekdayLabel(day.weekday)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {weekdayLabel(day.weekday)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {closed
                        ? "Fechado neste dia"
                        : `Aberto das ${day.opensAt} às ${day.closesAt}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={Boolean(day.isActive)}
                      disabled={!canManage || isPending}
                      onCheckedChange={(checked) =>
                        form.setValue(`days.${index}.isActive`, checked, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      aria-label={`${
                        day.isActive ? "Fechar" : "Abrir"
                      } ${weekdayLabel(day.weekday)}`}
                    />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {day.isActive ? "Aberto" : "Fechado"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="space-y-1">
                      <Label
                        htmlFor={`opens-${day.weekday}`}
                        className="sr-only"
                      >
                        Abertura de {weekdayLabel(day.weekday)}
                      </Label>
                      <Input
                        id={`opens-${day.weekday}`}
                        type="time"
                        step={300}
                        disabled={!canManage || isPending}
                        aria-invalid={Boolean(errors?.opensAt)}
                        className="h-9 w-[7.25rem] rounded-lg px-2.5 tabular-nums"
                        {...form.register(`days.${index}.opensAt`)}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">até</span>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`closes-${day.weekday}`}
                        className="sr-only"
                      >
                        Fechamento de {weekdayLabel(day.weekday)}
                      </Label>
                      <Input
                        id={`closes-${day.weekday}`}
                        type="time"
                        step={300}
                        disabled={!canManage || isPending}
                        aria-invalid={Boolean(errors?.closesAt)}
                        className="h-9 w-[7.25rem] rounded-lg px-2.5 tabular-nums"
                        {...form.register(`days.${index}.closesAt`)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {errors?.opensAt?.message || errors?.closesAt?.message ? (
                <p className="mt-2 text-xs text-destructive sm:pl-12">
                  {errors?.opensAt?.message ?? errors?.closesAt?.message}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {openDays > 0 ? (
            <>
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              A agenda respeitará apenas os dias e faixas ativas.
            </>
          ) : (
            <>
              <CalendarOff className="size-3.5 text-gold" />
              Com todos os dias fechados, nenhum horário será oferecido.
            </>
          )}
        </p>

        {canManage ? (
          <Button type="submit" variant="gold" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="size-4" />
                Salvar horários
              </>
            )}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
