import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "gold" | "muted";
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardContent className="flex items-start gap-3 p-4">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl border",
            tone === "gold"
              ? "border-gold/30 bg-gold-soft/55 text-gold"
              : tone === "muted"
                ? "border-border/80 bg-muted/45 text-muted-foreground"
                : "border-border/80 bg-card text-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 font-display text-2xl leading-none tracking-tight">
            {value}
          </p>
          {hint ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
