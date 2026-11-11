import { CalendarClock, Clock3, UserRound } from "lucide-react";

import { AppointmentStatusBadge } from "@/components/dashboard/status-badge";
import { formatCurrencyFromCents, formatTimeBR } from "@/lib/format";
import type { AppointmentListItem } from "@/features/dashboard/queries";
import { cn } from "@/lib/utils";

export function AppointmentList({
  items,
  timeZone,
  compact = false,
  showPrice = false,
  className,
}: {
  items: AppointmentListItem[];
  timeZone: string;
  compact?: boolean;
  showPrice?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-border/70", className)}>
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "flex items-start gap-3 first:pt-0 last:pb-0",
            compact ? "py-3" : "py-4",
          )}
        >
          <div className="w-12 shrink-0 rounded-lg border border-border/80 bg-muted/30 py-1.5 text-center">
            <p className="font-mono text-xs font-semibold leading-none">
              {formatTimeBR(item.startsAt, timeZone)}
            </p>
            <p className="mt-1 text-[9px] text-muted-foreground">
              {formatTimeBR(item.endsAt, timeZone)}
            </p>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-sm font-medium">{item.customerName}</p>
              <AppointmentStatusBadge status={item.status} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3 text-gold" />
                {item.serviceName}
              </span>
              <span className="inline-flex items-center gap-1">
                <UserRound className="size-3" />
                {item.barberName}
              </span>
              {item.durationMinutes ? (
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="size-3" />
                  {item.durationMinutes} min
                </span>
              ) : null}
            </p>
          </div>

          {showPrice ? (
            <p className="shrink-0 text-xs font-medium tabular-nums">
              {formatCurrencyFromCents(item.priceCents)}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
