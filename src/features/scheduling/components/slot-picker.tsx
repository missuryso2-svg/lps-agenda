"use client";

import { CalendarX2, Clock3, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { FormError } from "@/components/forms/form-message";
import { Badge } from "@/components/ui/badge";
import { getAppointmentAvailabilityAction } from "@/features/scheduling/actions";
import type { AvailabilityActionResult } from "@/features/scheduling/types";
import {
  formatCurrencyFromCents,
  formatDateOnlyBR,
} from "@/lib/format";

export function SlotPicker({
  serviceId,
  barberId,
  date,
  timeZone,
  excludeAppointmentId,
  selectedTime,
  onSelect,
  disabled = false,
}: {
  serviceId: string | null;
  barberId: string | null;
  date: string;
  timeZone: string;
  excludeAppointmentId?: string;
  selectedTime: string | null;
  onSelect: (time: string) => void;
  disabled?: boolean;
}) {
  const requestKey = `${serviceId ?? ""}|${barberId ?? ""}|${date}|${
    excludeAppointmentId ?? ""
  }`;
  const [response, setResponse] = useState<{
    key: string;
    result: AvailabilityActionResult;
  } | null>(null);

  useEffect(() => {
    if (!serviceId || !barberId || !date) {
      return;
    }

    let active = true;

    getAppointmentAvailabilityAction({
      serviceId,
      barberId,
      date,
      excludeAppointmentId,
    })
      .then((result) => {
        if (active) {
          setResponse({ key: requestKey, result });
        }
      })
      .catch(() => {
        if (active) {
          setResponse({
            key: requestKey,
            result: {
              status: "error",
              message:
                "Não foi possível consultar os horários agora. Tente novamente.",
            },
          });
        }
      });

    return () => {
      active = false;
    };
  }, [barberId, date, excludeAppointmentId, requestKey, serviceId]);

  if (!serviceId || !barberId || !date) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
        Selecione serviço, profissional e data para consultar os horários.
      </div>
    );
  }

  const result =
    response?.key === requestKey ? response.result : null;

  if (!result) {
    return (
      <div
        className="flex min-h-28 items-center justify-center gap-2 rounded-xl border border-border/80 bg-muted/20 text-xs text-muted-foreground"
        aria-busy="true"
      >
        <Loader2 className="size-4 animate-spin text-gold" aria-hidden />
        Calculando horários disponíveis...
      </div>
    );
  }

  if (result.status === "error") {
    return <FormError message={result.message} />;
  }

  const availability = result.availability;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
        <p className="text-xs font-medium">
          {formatDateOnlyBR(availability.date)} · {availability.barberName}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Clock3 className="size-3 text-gold" />
            {availability.durationMinutes} min
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {formatCurrencyFromCents(availability.priceCents)}
          </Badge>
        </div>
      </div>

      {availability.slots.length > 0 ? (
        <>
          <div
            className="j2-agenda-slots"
            role="group"
            aria-label="Horários disponíveis"
          >
            {availability.slots.map((slot) => {
              const selected = selectedTime === slot.time;

              return (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => onSelect(slot.time)}
                  disabled={disabled}
                  aria-pressed={selected}
                >
                  {slot.time}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Horários no fuso {timeZone}. A disponibilidade é recalculada pelo
            servidor no momento de salvar.
          </p>
        </>
      ) : (
        <div className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5">
          <CalendarX2 className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-xs font-medium">Nenhum horário disponível</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {availability.reason ??
                "Escolha outra data ou outro profissional."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
