"use client";

import { useActionState } from "react";
import { verifyFinancialTotp } from "./actions";

export function TotpForm({ factors }: { factors: { id: string; label: string }[] }) {
  const [message, action, pending] = useActionState(verifyFinancialTotp, "");
  return (
    <form action={action} className="mt-6 grid gap-3">
      <label htmlFor="factor">Autenticador</label>
      <select id="factor" name="factor" className="rounded-md border bg-background p-2">
        {factors.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
      </select>
      <label htmlFor="code">Código de seis dígitos</label>
      <input id="code" name="code" inputMode="numeric" pattern="[0-9]{6}"
        autoComplete="one-time-code" maxLength={6} required className="rounded-md border p-2" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary p-2 text-primary-foreground">
        {pending ? "Verificando…" : "Verificar e continuar"}
      </button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  );
}
