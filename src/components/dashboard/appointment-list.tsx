import { AppointmentStatusBadge } from "@/components/dashboard/status-badge";
import type { AppointmentListItem } from "@/features/dashboard/queries";
import { formatCurrencyFromCents, formatTimeBR } from "@/lib/format";

export function AppointmentList({
  items,
  timeZone,
  showDate = false,
  showPrice = false,
}: {
  items: AppointmentListItem[];
  timeZone: string;
  showDate?: boolean;
  showPrice?: boolean;
}) {
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit" });

  return (
    <ul className="j2-overview-list">
      {items.map(item => (
        <li key={item.id}>
          <span className="j2-list-time">
            <time dateTime={item.startsAt}>{formatTimeBR(item.startsAt, timeZone)}</time>
            <span>{showDate ? date.format(new Date(item.startsAt)) : formatTimeBR(item.endsAt, timeZone)}</span>
          </span>
          <div className="j2-list-person">
            <strong>{item.customerName}</strong>
            <p>{item.serviceName} · {item.barberName}{item.durationMinutes ? " · " + item.durationMinutes + " min" : ""}</p>
            <AppointmentStatusBadge status={item.status} />
          </div>
          {showPrice && <span className="j2-list-price">{formatCurrencyFromCents(item.priceCents)}</span>}
        </li>
      ))}
    </ul>
  );
}
