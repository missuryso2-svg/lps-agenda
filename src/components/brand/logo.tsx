import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ tone = "default" }: { tone?: "default" | "inverse" }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 align-middle"
      role="img"
      aria-label="LPS Agenda"
    >
      <Image
        src="/brand/lps.webp"
        width={160}
        height={88}
        alt=""
        className="h-7 w-auto"
      />
      <Image
        src="/brand/agenda.webp"
        width={380}
        height={91}
        alt=""
        className={cn(
          "h-[1.35rem] w-auto",
          tone === "default" && "brightness-0 dark:brightness-100",
        )}
      />
    </span>
  );
}

export function SolutionsLogo() {
  return (
    <Image
      src="/brand/lps-solutions.webp"
      width={400}
      height={76}
      alt="LPS Solutions"
      className="h-6 w-auto"
    />
  );
}
