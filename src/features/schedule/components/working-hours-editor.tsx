"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarClock,
  Coffee,
  Loader2,
  Save,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { FormError } from "@/components/forms/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { saveBarberWorkingHoursAction } from "@/features/schedule/actions";
import type {
  BarberWorkingHourRow,
  BusinessHourRow,
  ScheduleBarber,
} from "@/features/schedule/types";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { shortWeekdayLabel, weekdayLabel } from "@/lib/format";
import {
  timeToMinutes,
  toTimeInput,
  WEEKDAYS,
  weeklyBarberWorkingHoursSchema,
  type WeeklyBarberWorkingHoursValues,
} from "@/lib/validation/schedule";

function shopHoursFor(
  businessHours: BusinessHourRow[],
  weekday: number,
): BusinessHourRow | null {
  return (
    businessHours.find(
      (row) => row.weekday === weekday && row.is_active,
    ) ?? null
  );
}

function buildDefaults(
  barberId: string,
  workingHours: BarberWorkingHourRow[],
  businessHours: BusinessHourRow[],
): WeeklyBarberWorkingHoursValues {
  const rows = workingHours.filter((row) => row.barber_id === barberId);

  return {
    barberId,
    days: WEEKDAYS.map((weekday) => {
      const row = rows.find((item) => item.weekday === weekday);
      const shopDay = shopHoursFor(businessHours, weekday);

      return {
        weekday,
        isActive: row?.is_active ?? false,
        startsAt: row
          ? toTimeInput(row.starts_at)
          : shopDay
            ? toTimeInput(shopDay.opens_at)
            : "09:00",
        endsAt: row
          ? toTimeInput(row.ends_at)
          : shopDay
            ? toTimeInput(shopDay.closes_at)
            : "18:00",
      };
    }),
  };
}

function isOutsideShopHours(
  day: WeeklyBarberWorkingHoursValues["days"][number],
  businessHours: BusinessHourRow[],
): boolean {
  if (!day.isActive) {
    return false;
  }

  const start = timeToMinutes(day.startsAt);
  const end = timeToMinutes(day.endsAt);

  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return false;
  }

  const ranges = businessHours
    .filter((row) => row.weekday === day.weekday && row.is_active)
    .map((row) => ({
      start: timeToMinutes(row.opens_at),
      end: timeToMinutes(row.closes_at),
    }))
    .filter(
      (range) =>
        !Number.isNaN(range.start) &&
        !Number.isNaN(range.end) &&
        range.end > range.start,
    )
    .sort((left, right) => left.start - right.start);

  let coveredUntil = start;

  for (const range of ranges) {
    if (range.end <= coveredUntil) {
      continue;
    }

    if (range.start > coveredUntil) {
      return true;
    }

    coveredUntil = Math.max(coveredUntil, range.end);

    if (coveredUntil >= end) {
      return false;
    }
  }

  return coveredUntil < end;
}

export function WorkingHoursEditor({
  barbers,
  workingHours,
  businessHours,
  canManage,
}: {
  barbers: ScheduleBarber[];
  workingHours: BarberWorkingHourRow[];
  businessHours: BusinessHourRow[];
  canManage: boolean;
}) {
  const initialBarberId = barbers[0]?.id ?? "";
  const [selectedBarberId, setSelectedBarberId] = useState(initialBarberId);
  const form = useForm<WeeklyBarberWorkingHoursValues>({
    resolver: zodResolver(weeklyBarberWorkingHoursSchema),
    defaultValues: buildDefaults(
      initialBarberId,
      workingHours,
      businessHours,
    ),
  });
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const days = useWatch({ control: form.control, name: "days" }) ?? [];
  const workDays = days.filter((day) => day.isActive).length;
  const weeklyMinutes = days.reduce((total, day) => {
    if (!day.isActive) {
      return total;
    }

    const start = timeToMinutes(day.startsAt);
    const end = timeToMinutes(day.endsAt);

    return Number.isNaN(start) || Number.isNaN(end) || end <= start
      ? total
      : total + end - start;
  }, 0);

  useEffect(() => {
    form.reset(buildDefaults(selectedBarberId, workingHours, businessHours));
  }, [businessHours, form, selectedBarberId, workingHours]);

  if (barbers.length === 0) {
    return (
      <DashboardEmpty
        icon={UsersRound}
        title="Nenhum profissional cadastrado"
        description="Cadastre um profissional em Equipe para configurar a jornada individual e os bloqueios de agenda."
      />
    );
  }

  const selectedBarber =
    barbers.find((barber) => barber.id === selectedBarberId) ?? barbers[0];

  const onSubmit = (values: WeeklyBarberWorkingHoursValues) => {
    setServerError(null);

    const outOfHours = values.days.find((day) =>
      isOutsideShopHours(day, businessHours),
    );

    if (outOfHours) {
      const message = `A jornada de ${weekdayLabel(
        outOfHours.weekday,
      ).toLocaleLowerCase(
        "pt-BR",
      )} está fora do funcionamento da barbearia. Ajuste os horários ou feche a barbearia nesse dia.`;
      const outOfHoursIndex = values.days.findIndex(
        (day) => day.weekday === outOfHours.weekday,
      );
      form.setError(
        `days.${outOfHoursIndex >= 0 ? outOfHoursIndex : 0}.startsAt`,
        {
          type: "manual",
          message,
        },
      );
      setServerError(message);
      toast.error(message);
      return;
    }

    startTransition(async () => {
      const result = await saveBarberWorkingHoursAction({
        ...values,
        barberId: selectedBarberId,
      });

      if (result.status === "error") {
        applyServerFieldErrors(form, result.fieldErrors);
        setServerError(result.message ?? "Não foi possível salvar a jornada.");
        toast.error(result.message ?? "Não foi possível salvar a jornada.");
        return;
      }

      toast.success(result.message ?? "Jornada atualizada.");
      form.reset({ ...values, barberId: selectedBarberId });
    });
  };

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">Jornada do profissional</p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Selecione quem atende, marque os dias de trabalho e defina o
            expediente. Dias desmarcados ficam registrados como folga.
          </p>
        </div>
        {!canManage ? (
          <Badge variant="outline" className="w-fit text-muted-foreground">
            Somente leitura
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_1fr] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="schedule-barber">Profissional</Label>
          <Select
            value={selectedBarberId}
            onValueChange={setSelectedBarberId}
            disabled={isPending}
          >
            <SelectTrigger
              id="schedule-barber"
              className="h-10 w-full rounded-xl"
            >
              <SelectValue placeholder="Selecione um profissional" />
            </SelectTrigger>
            <SelectContent>
              {barbers.map((barber) => (
                <SelectItem key={barber.id} value={barber.id}>
                  <UserRound className="size-3.5 text-muted-foreground" />
                  {barber.name}
                  {barber.is_active ? "" : " (inativo)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Badge variant="outline" className="w-fit">
            <CalendarClock className="size-3.5 text-gold" />
            {workDays} dia(s) de trabalho
          </Badge>
          <Badge variant="outline" className="w-fit">
            {Math.floor(weeklyMinutes / 60)}h
            {String(weeklyMinutes % 60).padStart(2, "0")} por semana
          </Badge>
        </div>
      </div>

      <FormError message={serverError} />

      <div className="j2-week-rows">
        {days.map((day, index) => {
          const errors = form.formState.errors.days?.[index];
          const shopDay = shopHoursFor(businessHours, day.weekday);
          const outside = isOutsideShopHours(day, businessHours);

          return (
            <div
              key={day.weekday}
              className="j2-week-row"
              data-closed={day.isActive ? undefined : ""}
            >
              <div className="j2-week-row-content">
                <div className="j2-week-day-label">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border/80 bg-card text-[10px] font-semibold text-muted-foreground">
                    {shortWeekdayLabel(day.weekday)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {weekdayLabel(day.weekday)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {shopDay
                        ? `Barbearia aberta das ${toTimeInput(
                            shopDay.opens_at,
                          )} às ${toTimeInput(shopDay.closes_at)}`
                        : "Barbearia fechada neste dia"}
                    </p>
                  </div>
                </div>

                <div className="j2-week-controls">
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
                        day.isActive ? "Marcar folga em" : "Trabalhar em"
                      } ${weekdayLabel(day.weekday)}`}
                    />
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      {day.isActive ? (
                        "Trabalha"
                      ) : (
                        <>
                          <Coffee className="size-3" />
                          Folga
                        </>
                      )}
                    </span>
                  </div>

                  <div className="j2-week-time-pair">
                    <div>
                      <Label
                        htmlFor={`work-start-${day.weekday}`}
                        className="j2-week-time-label"
                      >
                        Início <span className="sr-only">de {weekdayLabel(day.weekday)}</span>
                      </Label>
                      <Input
                        id={`work-start-${day.weekday}`}
                        type="time"
                        step={300}
                        disabled={!canManage || isPending}
                        aria-invalid={Boolean(errors?.startsAt) || outside}
                        aria-describedby={errors?.startsAt || errors?.endsAt || outside ? "working-error-" + day.weekday : undefined}
                        className="j2-week-time-input"
                        {...form.register(`days.${index}.startsAt`)}
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor={`work-end-${day.weekday}`}
                        className="j2-week-time-label"
                      >
                        Término <span className="sr-only">de {weekdayLabel(day.weekday)}</span>
                      </Label>
                      <Input
                        id={`work-end-${day.weekday}`}
                        type="time"
                        step={300}
                        disabled={!canManage || isPending}
                        aria-invalid={Boolean(errors?.endsAt) || outside}
                        aria-describedby={errors?.startsAt || errors?.endsAt || outside ? "working-error-" + day.weekday : undefined}
                        className="j2-week-time-input"
                        {...form.register(`days.${index}.endsAt`)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {errors?.startsAt?.message || errors?.endsAt?.message ? (
                <p className="j2-week-error" id={"working-error-" + day.weekday}>
                  {errors?.startsAt?.message ?? errors?.endsAt?.message}
                </p>
              ) : outside ? (
                <p className="j2-week-error" id={"working-error-" + day.weekday}>
                  Este horário está fora do funcionamento da barbearia.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-muted-foreground">
          {selectedBarber
            ? `Jornada de ${selectedBarber.name}. A barbearia precisa estar aberta no mesmo dia e faixa de horário.`
            : "Selecione um profissional para configurar a jornada."}
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
                Salvar jornada
              </>
            )}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
