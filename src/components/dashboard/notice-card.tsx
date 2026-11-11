import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function NoticeCard({
  icon: Icon,
  title,
  children,
  tone = "default",
  className,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  tone?: "default" | "gold" | "warning";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-3",
        tone === "gold"
          ? "border-gold/25 bg-gold-soft/30"
          : tone === "warning"
            ? "border-amber-500/25 bg-amber-500/5"
            : "border-border/80 bg-muted/25",
        className,
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border",
          tone === "gold"
            ? "border-gold/30 bg-gold-soft/60 text-gold"
            : tone === "warning"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-border/80 bg-card text-muted-foreground",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium">{title}</p>
        <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}
