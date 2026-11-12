import { Skeleton } from "@/components/ui/skeleton";

export default function CustomersLoading() {
  return (
    <div className="space-y-7" aria-busy="true" aria-label="Carregando clientes">
      <div className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-9 w-48 max-w-full" />
          <Skeleton className="h-3 w-96 max-w-full" />
        </div>
        <Skeleton className="h-6 w-40" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-[28rem] rounded-xl" />
    </div>
  );
}
