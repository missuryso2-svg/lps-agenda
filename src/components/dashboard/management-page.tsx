import type { ReactNode } from "react";

import "./management-j2.css";

export function ManagementHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="j2-operation-heading j2-management-heading">
      <div><h2>{title}</h2><p>{description}</p></div>
    </header>
  );
}

export function ManagementSection({
  id, title, description, actions, children,
}: {
  id: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="j2-operation-panel j2-management-panel" aria-labelledby={id}>
      <header>
        <div><h3 id={id}>{title}</h3>{description && <p>{description}</p>}</div>
        {actions}
      </header>
      {children}
    </section>
  );
}
