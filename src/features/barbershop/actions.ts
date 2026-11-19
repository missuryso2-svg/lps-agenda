"use server";

import { z } from "zod";
import { manualTrialOnboardingEnabled } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  actionError,
  actionSuccess,
  fieldErrorsFrom,
  type ActionState,
} from "@/lib/actions";
import {
  ACTIVE_BARBERSHOP_COOKIE,
  getActiveDashboardContext,
  getMemberships,
} from "@/lib/auth/dal";
import { canManageShop, isPlatformAdmin } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabasePublicEnv } from "@/lib/env/public";
import { createClient } from "@/lib/supabase/server";
import {
  createBarbershopSchema,
  updateBarbershopSchema,
} from "@/lib/validation/barbershop";

const configMissing =
  "Supabase não configurado neste ambiente. Preencha o .env e reinicie o servidor.";

function activeShopCookie(barbershopId: string) {
  return {
    name: ACTIVE_BARBERSHOP_COOKIE,
    value: barbershopId,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    },
  };
}

export async function createBarbershopAction(
  values: unknown,
  intentId?: string,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const user = await getCurrentUser();

  if (!user) {
    return actionError("Sua sessão expirou. Entre novamente para continuar.");
  }

  const parsed = createBarbershopSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os campos destacados.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const supabase = await createClient();
  const params = {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_phone: parsed.data.phone || null,
    p_timezone: parsed.data.timezone,
  };
  const manual = manualTrialOnboardingEnabled();
  const create = async () => {
    if (!manual) return supabase.rpc("create_barbershop", params);
    const intent = z.uuid().safeParse(intentId);
    if (!intent.success) throw new Error("Intenção de cadastro ausente.");
    const args = { ...params, p_intent_id: intent.data };
    const permit = await createAdminClient().rpc("authorize_manual_trial_intent", {
      ...args, p_actor: user.id,
    });
    if (permit.error) return { data: null, error: permit.error };
    return supabase.rpc("create_barbershop_with_manual_trial", args);
  };
  const { data, error } = await create().catch(() => ({
    data: null, error: { code: "unavailable", message: "" },
  }));

  if (error || !data) {
    if (error?.code === "55000") return actionError("O plano Básico está indisponível. Tente novamente mais tarde.");
    if (error?.code === "42501") return actionError("O cadastro não está disponível neste momento.");
    if (error?.code === "23505") {
      return actionError(
        "Este identificador já está em uso. Escolha outro.",
        { slug: ["Este identificador já está em uso."] },
      );
    }

    if (error?.code === "22023" || error?.code === "28000") {
      return actionError(error.message);
    }

    return actionError(
      "Não foi possível criar a barbearia agora. Tente novamente.",
    );
  }

  const cookieStore = await cookies();
  const cookie = activeShopCookie(data);
  cookieStore.set(cookie.name, cookie.value, cookie.options);

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function updateBarbershopAction(
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const context = await getActiveDashboardContext();

  if (!context) {
    return actionError("Sua sessão expirou. Entre novamente para continuar.");
  }

  const allowed =
    canManageShop(context.active.role) ||
    isPlatformAdmin(context.user.app_metadata);

  if (!allowed) {
    return actionError("Somente o proprietário pode editar os dados da barbearia.");
  }

  const parsed = updateBarbershopSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os campos destacados.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("barbershops")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      phone: parsed.data.phone || null,
      address_city: parsed.data.city || null,
      address_state: parsed.data.state || null,
    })
    .eq("id", context.active.barbershop_id);

  if (error) {
    return actionError(
      "Não foi possível salvar os dados agora. Tente novamente.",
    );
  }

  revalidatePath("/dashboard", "layout");
  return actionSuccess("Dados da barbearia atualizados.");
}

export async function setActiveBarbershopAction(
  barbershopId: string,
): Promise<void> {
  if (!getSupabasePublicEnv()) {
    redirect("/dashboard");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const memberships = await getMemberships(user.id);
  const membership = memberships.find(
    (item) => item.barbershop_id === barbershopId,
  );

  if (!membership) {
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  const cookie = activeShopCookie(membership.barbershop_id);
  cookieStore.set(cookie.name, cookie.value, cookie.options);

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
