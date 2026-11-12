"use client";

import {
  CalendarOff,
  CalendarX2,
  Clock3,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/dashboard/confirm-delete-dialog";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteBlockedSlotAction } from "@/features/schedule/actions";
import { BlockedSlotFormDialog } from "@/features/schedule/components/blocked-slot-form-dialog";
import type {
  BlockedSlotRow,
  ScheduleBarber,
} from "@/features/schedule/types";
import {
  formatDateOnlyBR,
  isFullDayRange,
  localDateString,
  localTimeString,
  weekdayLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function weekdayFromDate(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    return null;
  }

  const value = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  );

  return Number.isNaN(value.getTime()) ? null : value.getUTCDay();
}

function statusFor(slot: BlockedSlotRow, now: number) {
  const start = new Date(slot.starts_at).getTime();
  const end = new Date(slot.ends_at).getTime();

  if (now < start) {
    return {
      label: "Agendado",
      className:
        "border-gold/30 bg-gold-soft/45 text-gold",
    };
  }

  if (now < end) {
    return {
      label: "Em andamento",
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }

  return {
    label: "Encerrado",
    className: "border-border bg-muted/50 text-muted-foreground",
  };
}

export function BlockedSlotsManager({
  slots,
  barbers,
  timeZone,
  canManage,
}: {
  slots: BlockedSlotRow[];
  barbers: ScheduleBarber[];
  timeZone: string;
  canManage: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [editing, setEditing] = useState<BlockedSlotRow | null>(null);
  const [deleting, setDeleting] = useState<BlockedSlotRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [isDeleting, startDelete] = useTransition();

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const barberNames = useMemo(
    () => new Map(barbers.map((barber) => [barber.id, barber.name])),
    [barbers],
  );

  const { upcoming, past } = useMemo(() => {
    const upcomingRows = slots
      .filter((slot) => new Date(slot.ends_at).getTime() >= now)
      .sort(
        (left, right) =>
          new Date(left.starts_at).getTime() -
          new Date(right.starts_at).getTime(),
      );
    const pastRows = slots
      .filter((slot) => new Date(slot.ends_at).getTime() < now)
      .sort(
        (left, right) =>
          new Date(right.starts_at).getTime() -
          new Date(left.starts_at).getTime(),
      );

    return { upcoming: upcomingRows, past: pastRows };
  }, [now, slots]);

  const openCreate = () => {
    setEditing(null);
    setDialogKey((value) => value + 1);
    setDialogOpen(true);
  };

  const openEdit = (slot: BlockedSlotRow) => {
    setEditing(slot);
    setDialogKey((value) => value + 1);
    setDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!deleting) {
      return;
    }

    const target = deleting;
    setDeleteError(null);

    startDelete(async () => {
      const result = await deleteBlockedSlotAction(target.id);

      if (result.status === "error") {
        setDeleteError(
          result.message ?? "Não foi possível excluir o bloqueio.",
        );
        toast.error(result.message ?? "Não foi possível excluir o bloqueio.");
        return;
      }

      toast.success(result.message ?? "Bloqueio excluído.");
      setDeleting(null);
    });
  };

  const renderSlot = (slot: BlockedSlotRow) => {
    const date = localDateString(slot.starts_at, timeZone);
    const weekday = weekdayFromDate(date);
    const fullDay = isFullDayRange(slot.starts_at, slot.ends_at, timeZone);
    const status = statusFor(slot, now);
    const barberName = slot.barber_id
      ? barberNames.get(slot.barber_id) ?? "Profissional"
      : null;

    return (
      <article
        key={slot.id}
        className="rounded-2xl border border-border/80 bg-card p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-gold/25 bg-gold-soft/45 text-gold">
              <CalendarX2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {formatDateOnlyBR(date)}
                {weekday !== null ? ` · ${weekdayLabel(weekday)}` : ""}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 className="size-3.5 text-gold" />
                {fullDay
                  ? "Dia inteiro"
                  : `${localTimeString(
                      slot.starts_at,
                      timeZone,
                    )} – ${localTimeString(slot.ends_at, timeZone)}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
            {canManage ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(slot)}
                  aria-label="Editar bloqueio"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleting(slot);
                  }}
                  aria-label="Excluir bloqueio"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-border/70 pt-3 text-[11px] leading-relaxed text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-1.5">
            {barberName ? (
              <>
                <UserRound className="size-3.5 text-muted-foreground" />
                {barberName}
              </>
            ) : (
              <>
                <CalendarOff className="size-3.5 text-gold" />
                Toda a barbearia
              </>
            )}
          </span>
          <span className="line-clamp-2 sm:max-w-[28rem] sm:text-right">
            {slot.reason ?? "Sem motivo informado"}
          </span>
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium">Bloqueios e indisponibilidades</p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Períodos bloqueados removem horários da agenda sem alterar a
            jornada semanal. O motivo é opcional e serve para a equipe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="w-fit">
            {slots.length} bloqueio(s)
          </Badge>
          {canManage ? (
            <Button type="button" variant="gold" onClick={openCreate}>
              <Plus className="size-4" />
              Novo bloqueio
            </Button>
          ) : (
            <Badge variant="outline" className="w-fit text-muted-foreground">
              Somente leitura
            </Badge>
          )}
        </div>
      </div>

      {slots.length === 0 ? (
        <DashboardEmpty
          icon={CalendarOff}
          title="Nenhum bloqueio cadastrado"
          description="Folgas pontuais, férias e pausas excepcionais aparecem aqui. A agenda continuará usando a jornada semanal enquanto não houver bloqueios."
          action={
            canManage ? (
              <Button type="button" variant="gold" onClick={openCreate}>
                <Plus className="size-4" />
                Criar primeiro bloqueio
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {upcoming.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Próximos e em andamento
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {upcoming.length} registro(s)
                </span>
              </div>
              {upcoming.map(renderSlot)}
            </section>
          ) : null}

          {past.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Encerrados
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {past.length} registro(s)
                </span>
              </div>
              <div className={cn(upcoming.length > 0 && "opacity-80")}>
                <div className="space-y-3">{past.map(renderSlot)}</div>
              </div>
            </section>
          ) : null}
        </div>
      )}

      <BlockedSlotFormDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        slot={editing}
        barbers={barbers}
        timeZone={timeZone}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteError(null);
          }
        }}
        title="Excluir bloqueio?"
        description="O período voltará a ficar disponível conforme a jornada semanal dos profissionais. Esta ação não altera agendamentos já existentes."
        itemName={
          deleting
            ? `${formatDateOnlyBR(
                localDateString(deleting.starts_at, timeZone),
              )} · ${
                deleting.reason ||
                (deleting.barber_id
                  ? barberNames.get(deleting.barber_id) ?? "Profissional"
                  : "Toda a barbearia")
              }`
            : ""
        }
        pending={isDeleting}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
