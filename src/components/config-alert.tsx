import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ConfigAlert({ className }: { className?: string }) {
  return (
    <Alert className={className ?? "border-gold/35 bg-gold-soft/60 p-4"}>
      <TriangleAlert className="text-gold" />
      <AlertTitle>Supabase ainda não configurado</AlertTitle>
      <AlertDescription>
        Crie um arquivo <code className="font-mono text-xs">.env.local</code> a
        partir do <code className="font-mono text-xs">.env.example</code> e
        preencha as chaves do projeto Supabase. Sem isso, cadastro, login e
        painel permanecem indisponíveis neste ambiente.
      </AlertDescription>
    </Alert>
  );
}
