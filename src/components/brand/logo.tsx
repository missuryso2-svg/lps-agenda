import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  tone?: "default" | "inverse";
  showTagline?: boolean;
};

export function Logo({
  className,
  tone = "default",
  showTagline = true,
}: LogoProps) {
  const inverse = tone === "inverse";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[11px] border",
          inverse
            ? "border-gold/40 bg-gold text-gold-foreground"
            : "border-white/10 bg-primary text-gold",
        )}
        aria-hidden="true"
      >
        <span className="font-display text-[17px] leading-none font-semibold">
          L
        </span>
        <span
          className={cn(
            "absolute right-1 top-1 size-1 rounded-full",
            inverse ? "bg-gold-foreground/60" : "bg-gold",
          )}
        />
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            "font-display text-[17px] leading-none font-semibold tracking-tight",
            inverse ? "text-white" : "text-foreground",
          )}
        >
          LPS <span className="text-gold italic">Agenda</span>
        </span>
        {showTagline ? (
          <span
            className={cn(
              "mt-1 text-[9px] font-medium uppercase tracking-[0.2em]",
              inverse ? "text-white/50" : "text-muted-foreground",
            )}
          >
            by LPS Solutions
          </span>
        ) : null}
      </span>
    </span>
  );
}
