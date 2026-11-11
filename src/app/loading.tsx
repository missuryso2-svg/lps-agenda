import { Spinner } from "@/components/ui/spinner";

export default function RootLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Spinner className="size-5 text-gold" />
        <p className="text-[11px] uppercase tracking-[0.18em]">Carregando</p>
      </div>
    </div>
  );
}
