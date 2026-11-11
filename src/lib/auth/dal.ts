import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canManageShop, isPlatformAdmin } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabasePublicEnv } from "@/lib/env/public";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export const ACTIVE_BARBERSHOP_COOKIE = "lps.active_barbershop";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type BarbershopRow = Database["public"]["Tables"]["barbershops"]["Row"];
export type MembershipRow =
  Database["public"]["Tables"]["barbershop_members"]["Row"];

export type MembershipWithShop = MembershipRow & {
  barbershop: BarbershopRow;
};

export type DashboardContext = {
  user: User;
  profile: ProfileRow | null;
  memberships: MembershipWithShop[];
  active: MembershipWithShop;
};

export const getProfile = cache(
  async (userId: string): Promise<ProfileRow | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    return data;
  },
);

export const getMemberships = cache(
  async (userId: string): Promise<MembershipWithShop[]> => {
    const supabase = await createClient();

    const { data: memberships, error } = await supabase
      .from("barbershop_members")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error || !memberships || memberships.length === 0) {
      return [];
    }

    const shopIds = [...new Set(memberships.map((item) => item.barbershop_id))];

    const { data: shops, error: shopsError } = await supabase
      .from("barbershops")
      .select("*")
      .in("id", shopIds)
      .eq("status", "active");

    if (shopsError || !shops) {
      return [];
    }

    const shopsById = new Map(shops.map((shop) => [shop.id, shop]));

    return memberships.flatMap((membership) => {
      const barbershop = shopsById.get(membership.barbershop_id);

      if (!barbershop) {
        return [];
      }

      return [{ ...membership, barbershop }];
    });
  },
);

export async function getActiveDashboardContext(): Promise<DashboardContext | null> {
  if (!getSupabasePublicEnv()) {
    return null;
  }

  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [profile, memberships] = await Promise.all([
    getProfile(user.id),
    getMemberships(user.id),
  ]);

  if (memberships.length === 0) {
    return null;
  }

  const cookieStore = await cookies();
  const preferredId = cookieStore.get(ACTIVE_BARBERSHOP_COOKIE)?.value;

  const active =
    memberships.find((item) => item.barbershop_id === preferredId) ??
    memberships[0];

  return {
    user,
    profile,
    memberships,
    active,
  };
}

/**
 * Exige sessão + vínculo ativo com uma barbearia.
 * O proxy faz apenas checagem otimista; esta é a barreira de servidor.
 */
export async function requireDashboardContext(): Promise<DashboardContext> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?proximo=/dashboard");
  }

  const context = await getActiveDashboardContext();

  if (!context) {
    redirect("/onboarding");
  }

  return context;
}

export function isCurrentUserPlatformAdmin(user: User): boolean {
  return isPlatformAdmin(user.app_metadata);
}

/**
 * Exige vínculo de proprietário (ou administrador global) para áreas de gestão.
 * A RLS continua sendo a barreira final no banco.
 */
export async function requireOwnerDashboardContext(): Promise<DashboardContext> {
  const context = await requireDashboardContext();

  if (
    !canManageShop(context.active.role) &&
    !isCurrentUserPlatformAdmin(context.user)
  ) {
    redirect("/dashboard?acesso=restrito");
  }

  return context;
}
