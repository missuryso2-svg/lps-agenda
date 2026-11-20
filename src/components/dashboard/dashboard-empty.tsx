import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export function DashboardEmpty({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty
      className={cn(
        "rounded-2xl border border-dashed border-border/80 bg-muted/25 py-10",
        className,
      )}
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="size-12 rounded-2xl border border-gold/25 bg-gold-soft/45 text-gold"
        >
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="text-base font-semibold">{title}</EmptyTitle>
        <EmptyDescription className="max-w-md text-sm">
          {description}
        </EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
