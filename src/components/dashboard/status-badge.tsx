import { FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Database } from "@/types/database";

type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];
type PaymentStatus = Database["public"]["Enums"]["payment_status"];
type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];

const appointmentStyles: Record<AppointmentStatus, string> = {
  scheduled: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  confirmed:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  in_progress: "border-gold/35 bg-gold-soft/55 text-foreground",
  completed: "border-border bg-muted/50 text-muted-foreground",
  cancelled:
    "border-destructive/25 bg-destructive/10 text-destructive dark:text-red-300",
  no_show:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const appointmentLabels: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  in_progress: "Em atendimento",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const paymentStyles: Record<PaymentStatus, string> = {
  pending:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed:
    "border-destructive/25 bg-destructive/10 text-destructive dark:text-red-300",
  refunded: "border-border bg-muted/50 text-muted-foreground",
  cancelled: "border-border bg-muted/50 text-muted-foreground",
};

const paymentLabels: Record<PaymentStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  failed: "Falhou",
  refunded: "Estornado",
  cancelled: "Cancelado",
};

const subscriptionStyles: Record<SubscriptionStatus, string> = {
  trialing: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  active:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  past_due:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  canceled: "border-border bg-muted/50 text-muted-foreground",
  expired: "border-border bg-muted/50 text-muted-foreground",
};

const subscriptionLabels: Record<SubscriptionStatus, string> = {
  trialing: "Em teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  expired: "Expirada",
};

export function AppointmentStatusBadge({
  status,
}: {
  status: AppointmentStatus;
}) {
  return (
    <Badge
      variant="outline"
      className={appointmentStyles[status]}
      aria-label={`Status: ${appointmentLabels[status]}`}
    >
      {appointmentLabels[status]}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={paymentStyles[status]}>
      {paymentLabels[status]}
    </Badge>
  );
}

export function SubscriptionStatusBadge({
  status,
}: {
  status: SubscriptionStatus;
}) {
  return (
    <Badge variant="outline" className={subscriptionStyles[status]}>
      {subscriptionLabels[status]}
    </Badge>
  );
}

export function PrototypeBadge({ label = "Protótipo" }: { label?: string }) {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-gold/30 bg-gold-soft/40 text-[9px] uppercase tracking-[0.12em] text-foreground"
    >
      <FlaskConical className="size-2.5 text-gold" />
      {label}
    </Badge>
  );
}
