import "server-only";

import { actionError, type ActionState } from "@/lib/actions";
import {
  getActiveDashboardContext,
  type DashboardContext,
} from "@/lib/auth/dal";
import { canManageShop, isPlatformAdmin } from "@/lib/auth/permissions";

export type ManagementAuthorization =
  | { context: DashboardContext; error?: never }
  | { context?: never; error: ActionState };

/**
 * Autorização de servidor para mutações de catálogo e equipe.
 * O barbershop_id é sempre o da sessão ativa; nunca vem do navegador.
 * A RLS continua sendo a barreira final no banco.
 */
export async function authorizeShopManagement(): Promise<ManagementAuthorization> {
  const context = await getActiveDashboardContext();

  if (!context) {
    return {
      error: actionError(
        "Sua sessão expirou. Entre novamente para continuar.",
      ),
    };
  }

  const allowed =
    canManageShop(context.active.role) ||
    isPlatformAdmin(context.user.app_metadata);

  if (!allowed) {
    return {
      error: actionError(
        "Somente o proprietário pode gerenciar o catálogo, a equipe e os horários.",
      ),
    };
  }

  return { context };
}
