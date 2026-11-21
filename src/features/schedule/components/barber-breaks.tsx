"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveBarberBreak } from "@/features/scheduling/operations-actions";
import type { Database } from "@/types/database";
const weekdays = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
type Pause = Database["public"]["Tables"]["barber_breaks"]["Row"];
function BreakTimes({
  barber,
  weekday,
  pause,
}: {
  barber: string;
  weekday: number;
  pause?: Pause;
}) {
  const [start, setStart] = useState(pause?.starts_at.slice(0, 5) ?? "12:00");
  const [end, setEnd] = useState(pause?.ends_at.slice(0, 5) ?? "13:00");
  const [enabled, setEnabled] = useState(pause?.is_active ?? false);
  const [message, setMessage] = useState("");
  const [pending, transition] = useTransition();
  const router = useRouter();
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        transition(async () => {
          const r = await saveBarberBreak({
            barber,
            weekday,
            start,
            end,
            enabled,
          });
          setMessage(r.message ?? "");
          if (r.status === "success") router.refresh();
        });
      }}
    >
      <label>
        Início da pausa
        <Input
          type="time"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <label>
        Fim da pausa
        <Input
          type="time"
          required
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </label>
      <label className="flex min-h-10 items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Pausa ativa
      </label>
      <Button variant="gold" disabled={pending}>
        Salvar pausa
      </Button>
      <p role="status" className="w-full">
        {message}
      </p>
    </form>
  );
}
export function BarberBreaks({
  barbers,
  pauses,
}: {
  barbers: { id: string; name: string }[];
  pauses: Pause[];
}) {
  const [barber, setBarber] = useState(barbers[0]?.id ?? "");
  const [weekday, setWeekday] = useState(1);
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 text-sm">
      <h2 className="font-display text-xl">Pausa recorrente</h2>
      <p className="text-muted-foreground">
        Reserve um intervalo semanal no fuso da barbearia.
      </p>
      {barbers.length ? (
        <>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1">
              Profissional
              <select
                className="rounded-md border bg-background p-2"
                value={barber}
                onChange={(e) => setBarber(e.target.value)}
              >
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              Dia da pausa
              <select
                className="rounded-md border bg-background p-2"
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
              >
                {weekdays.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <BreakTimes
            key={barber + weekday}
            barber={barber}
            weekday={weekday}
            pause={pauses.find(
              (b) => b.barber_id === barber && b.weekday === weekday,
            )}
          />
        </>
      ) : (
        <p>Cadastre um profissional para configurar uma pausa.</p>
      )}
    </section>
  );
}
