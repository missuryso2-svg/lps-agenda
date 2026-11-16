import { AlertTriangle, Clock3 } from "lucide-react";
import Link from "next/link";

import { NoticeCard } from "@/components/dashboard/notice-card";
import type { BarbershopBookingAccess } from "@/features/scheduling/booking-access";

function formatGraceEnd(value: string, timeZone: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "em breve";
  }

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }
}

function formatRemaining(seconds: number): string {
  const totalMinutes = Math.max(1, Math.ceil(seconds / 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days} dia(s)`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  }

  return `${minutes}min`;
}

export function BookingAccessNotice({
  access,
  checkFailed,
  canManageBilling,
  timeZone,
}: {
  access: BarbershopBookingAccess | null;
  checkFailed: boolean;
  canManageBilling: boolean;
  timeZone: string;
}) {
  if (checkFailed) {
    return (
      <NoticeCard
        icon={AlertTriangle}
        title="Não foi possível verificar novos agendamentos"
        tone="warning"
      >
        A autorização será confirmada no servidor antes de gravar qualquer
        reserva. Atualize a página ou tente novamente em instantes.
        {canManageBilling ? (
          <span className="ml-1">
            <Link href="/dashboard/plano" className="underline underline-offset-2">
              Abrir plano e pagamentos
            </Link>
          </span>
        ) : null}
      </NoticeCard>
    );
  }

  if (!access || access.state === "normal") {
    return null;
  }

  if (access.state === "grace") {
    const remaining =
      access.secondsRemaining === null
        ? "em breve"
        : formatRemaining(access.secondsRemaining);
    const graceEnd = access.gracePeriodEndsAt
      ? formatGraceEnd(access.gracePeriodEndsAt, timeZone)
      : null;

    return (
      <NoticeCard
        icon={Clock3}
        title="Pagamento pendente — agendamentos seguem liberados"
        tone="warning"
      >
        {canManageBilling
          ? `Regularize em ${remaining}${graceEnd ? ` (até ${graceEnd})` : ""} para evitar a pausa de novas reservas.`
          : "Os agendamentos continuam liberados durante a tolerância. Se necessário, procure o proprietário da barbearia."}
        {canManageBilling ? (
          <span className="ml-1">
            <Link href="/dashboard/plano" className="underline underline-offset-2">
              Regularizar pagamento
            </Link>
          </span>
        ) : null}
      </NoticeCard>
    );
  }

  return (
    <NoticeCard
      icon={AlertTriangle}
      title={
        canManageBilling
          ? "Novos agendamentos estão bloqueados"
          : "Novos agendamentos temporariamente indisponíveis"
      }
      tone="warning"
    >
      {canManageBilling
        ? "O período de tolerância do pagamento terminou. Os dados e agendamentos existentes continuam disponíveis; regularize a assinatura para liberar novas reservas."
        : "Os dados existentes continuam disponíveis. Entre em contato com o proprietário da barbearia para liberar novas reservas."}
      {canManageBilling ? (
        <span className="ml-1">
          <Link href="/dashboard/plano" className="underline underline-offset-2">
            Regularizar pagamento
          </Link>
        </span>
      ) : null}
    </NoticeCard>
  );
}
