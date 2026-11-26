"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AppointmentStatusBadge } from "@/components/dashboard/status-badge";
import { confirmAppointmentAction } from "@/features/scheduling/actions";
import { readBookingNotice } from "@/features/scheduling/operations-actions";
import { formatDateBR, formatTimeBR, localDateString } from "@/lib/format";
import type { Database } from "@/types/database";
export type BookingNotice =
  Database["public"]["Functions"]["booking_notices"]["Returns"][number];
export function BookingNotices({
  notices,
  tz,
}: {
  notices: BookingNotice[] | null;
  tz: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, transition] = useTransition();
  const [feedback, setFeedback] = useState("");
  const unread = notices?.some((n) => !n.is_read);
  function act(n: BookingNotice, kind: "read" | "open" | "confirm") {
    transition(async () => {
      setFeedback("");
      if (kind === "confirm") {
        const result = await confirmAppointmentAction(n.booking_id);
        if (result.status === "error") {
          setFeedback(result.message ?? "Não foi possível confirmar.");
          router.refresh();
          return;
        }
      }
      if (!n.is_read) {
        const result = await readBookingNotice(n.notice_id);
        if (result.status === "error") {
          setFeedback(result.message ?? "Falha de leitura.");
          router.refresh();
          return;
        }
      }
      if (kind === "open") {
        setOpen(false);
        router.push(
          "/dashboard/agenda?date=" +
            localDateString(n.starts, tz) +
            "&atendimento=" +
            n.booking_id,
        );
        return;
      }
      if (kind === "confirm") setFeedback("Agendamento confirmado.");
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notificações"
        >
          <Bell className="size-4" />
          {unread && (
            <span
              aria-label="Novas notificações"
              className="absolute right-2 top-2 size-2 rounded-full bg-gold"
            />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent overlayClassName="j2-agenda-overlay" className="j2-agenda-dialog max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notificações</DialogTitle>
          <DialogDescription>Reservas da barbearia ativa</DialogDescription>
        </DialogHeader>
        <p role="status" className="text-sm">
          {feedback}
        </p>
        {!notices ? (
          <p>Não foi possível carregar as notificações.</p>
        ) : notices.length === 0 ? (
          <p>Nenhuma notificação por aqui.</p>
        ) : (
          notices.map((n) => (
            <article
              key={n.notice_id}
              className="space-y-2 rounded-xl border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{n.customer_name}</strong>
                <AppointmentStatusBadge status={n.booking_status} />
              </div>
              <p className="text-sm">
                {n.service_name} com {n.barber_name} ·{" "}
                {formatDateBR(n.starts, tz)} às {formatTimeBR(n.starts, tz)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => act(n, "open")}
                >
                  Abrir agendamento
                </Button>
                {n.booking_status === "scheduled" && (
                  <Button
                    size="sm"
                    variant="gold"
                    disabled={pending}
                    onClick={() => act(n, "confirm")}
                  >
                    Confirmar
                  </Button>
                )}
                {!n.is_read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => act(n, "read")}
                  >
                    Marcar como lida
                  </Button>
                )}
              </div>
            </article>
          ))
        )}
      </DialogContent>
    </Dialog>
  );
}
