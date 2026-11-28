"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { financialSession } from "@/lib/auth/financial-admin";

const input = z.object({ factor: z.uuid(), code: z.string().regex(/^\d{6}$/) });

export async function verifyFinancialTotp(_state: string, form: FormData) {
  const session = await financialSession();
  if (session.status !== "mfa_required") return "Abra a área financeira para verificar sua sessão.";
  const parsed = input.safeParse({ factor: form.get("factor"), code: form.get("code") });
  if (!parsed.success) return "Informe o código de seis dígitos do autenticador.";

  const { data: factors, error } = await session.db.auth.mfa.listFactors();
  if (error) return "Não foi possível consultar o autenticador. Tente novamente.";
  if (!factors.totp.some((factor) => factor.id === parsed.data.factor)) {
    return "Selecione um autenticador já verificado nesta conta.";
  }
  const result = await session.db.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factor,
    code: parsed.data.code,
  });
  if (result.error) return "Não foi possível verificar o código. Confira o autenticador e tente novamente.";
  redirect("/admin/assinaturas");
}
