"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <section className="j2-operation-panel j2-dashboard-state" aria-labelledby="dashboard-error-title">
      <CircleAlert size={22} aria-hidden />
      <h2 id="dashboard-error-title">Não foi possível carregar esta área</h2>
      <p>Tente novamente ou volte à visão geral.</p>
      {error.digest && <p className="font-mono text-xs">Referência: {error.digest}</p>}
      <div className="j2-dashboard-state-actions">
        <Button type="button" variant="gold" className="j2-operation-primary" onClick={reset}>
          <RotateCcw aria-hidden /> Tentar novamente
        </Button>
        <Button asChild variant="outline" className="j2-operation-secondary">
          <Link href="/dashboard">Voltar à visão geral</Link>
        </Button>
      </div>
    </section>
  );
}
