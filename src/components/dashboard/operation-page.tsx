import type { ReactNode } from "react";

export function OperationHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="j2-operation-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="j2-operation-actions">{actions}</div>}
    </header>
  );
}

export function OperationMetrics({
  label,
  entries,
}: {
  label: string;
  entries: readonly { label: string; value: string; note?: string }[];
}) {
  return (
    <dl className="j2-operation-metrics" aria-label={label}>
      {entries.map(entry => (
        <div key={entry.label}>
          <dt>{entry.label}</dt>
          <dd>{entry.value}</dd>
          {entry.note && <dd className="j2-metric-note">{entry.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
