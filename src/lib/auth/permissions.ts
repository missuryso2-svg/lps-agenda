import type { Database } from "@/types/database";

export type AppRole = Database["public"]["Enums"]["barbershop_member_role"];

export const roleLabels: Record<AppRole, string> = {
  owner: "Proprietário",
  staff: "Equipe",
};

export function isPlatformAdmin(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== "object") {
    return false;
  }

  return (
    (appMetadata as Record<string, unknown>).lps_role === "platform_admin"
  );
}

export function canManageShop(role: AppRole | null | undefined): boolean {
  return role === "owner";
}

export function canOperateShop(role: AppRole | null | undefined): boolean {
  return role === "owner" || role === "staff";
}

export function canViewFinancials(role: AppRole | null | undefined): boolean {
  return role === "owner";
}
