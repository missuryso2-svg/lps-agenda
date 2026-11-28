import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const financialSession = cache(async () => {
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error && error.status && error.status >= 500)
    throw new Error("Serviço de autenticação indisponível.");
  if (!user) return { status: "anonymous" } as const;
  const role = await db.rpc("finance_capability");
  if (role.error?.code === "42501") return { status: "denied" } as const;
  if (role.error?.code === "LP037") return { status: "mfa_required", db } as const;
  if (role.error || (role.data !== "manager" && role.data !== "operator")) {
    throw new Error("Serviço financeiro indisponível.");
  }
  return { status: "authorized", db, user, level: role.data } as const;
});

export async function requireFinancialAdmin(manager = false) {
  const session = await financialSession();
  if (session.status === "anonymous")
    redirect("/login?proximo=%2Fadmin%2Fassinaturas");
  if (session.status === "mfa_required") redirect("/admin/mfa");
  if (session.status === "denied" || (manager && session.level !== "manager"))
    redirect("/admin/acesso-negado");
  return session;
}
