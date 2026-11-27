"use server";

import { redirect } from "next/navigation";

import {
  actionError,
  actionSuccess,
  fieldErrorsFrom,
  type ActionState,
} from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { getAppUrl } from "@/lib/env/server";
import { getSupabasePublicEnv } from "@/lib/env/public";
import { safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/lib/validation/auth";

import { authErrorMessage } from "./messages";

const configMissing =
  "Supabase não configurado neste ambiente. Preencha o .env com as variáveis públicas e reinicie o servidor.";

export async function signInAction(
  values: unknown,
  nextPath?: string,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsed = loginSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os campos destacados.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return actionError(authErrorMessage(error));
  }

  redirect(safeNextPath(nextPath));
}

export async function signUpAction(values: unknown): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsed = signUpSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os campos destacados.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
      },
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent("/dashboard")}`,
    },
  });

  if (error && error.code !== "email_exists" && error.code !== "user_already_exists") {
    return actionError(authErrorMessage(error));
  }

  if (data.session) {
    redirect("/dashboard");
  }

  return actionSuccess(
    "Cadastro recebido. Se o pedido puder ser confirmado, você receberá um link por e-mail. Confira também a caixa de spam.",
  );
}

export async function forgotPasswordAction(
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsed = forgotPasswordSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os campos destacados.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const supabase = await createClient();

  // Resposta idêntica para e-mails existentes ou não (proteção contra enumeração).
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent("/redefinir-senha")}`,
  });

  return actionSuccess(
    "Se existir uma conta com este e-mail, enviaremos as instruções para redefinir a senha.",
  );
}

export async function resetPasswordAction(
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const user = await getCurrentUser();

  if (!user) {
    return actionError(
      "Sua sessão de recuperação expirou. Solicite um novo link de redefinição.",
    );
  }

  const parsed = resetPasswordSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os campos destacados.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return actionError(authErrorMessage(error));
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  if (getSupabasePublicEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  redirect("/login");
}
