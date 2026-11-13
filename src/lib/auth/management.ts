import "server-only";

import { actionError, type ActionState } from "@/lib/actions";
import {
  getActiveDashboardContext,
  type DashboardContext,
} from "@/lib/auth/dal";
import {
  canManageShop,
  canOperateShop,
  isPlatformAdmin,
} from "@/lib/auth/permissions";

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

/**
 * Autorização de servidor para o gerenciamento operacional de clientes.
 * A RLS de customers permite leitura, cadastro e edição para membros da
 * barbearia (owner e staff); exclusão física continua restrita ao owner.
 * Como esta fase usa arquivamento via is_active, owner e staff podem
 * manter o cadastro. O barbershop_id continua vindo apenas da sessão.
 */
export async function authorizeCustomerManagement(): Promise<ManagementAuthorization> {
  const context = await getActiveDashboardContext();

  if (!context) {
    return {
      error: actionError(
        "Sua sessão expirou. Entre novamente para continuar.",
      ),
    };
  }

  const allowed =
    canOperateShop(context.active.role) ||
    isPlatformAdmin(context.user.app_metadata);

  if (!allowed) {
    return {
      error: actionError(
        "Você não tem permissão para gerenciar os clientes desta barbearia.",
      ),
    };
  }

  return { context };
}

/**
 * Autorização de servidor para a agenda e os agendamentos.
 * A RLS de appointments permite leitura e escrita para owner e staff da
 * barbearia; exclusão física continua restrita ao owner, mas esta fase não
 * expõe exclusão. O barbershop_id vem apenas da sessão ativa.
 */
export async function authorizeAppointmentManagement(): Promise<ManagementAuthorization> {
  const context = await getActiveDashboardContext();

  if (!context) {
    return {
      error: actionError(
        "Sua sessão expirou. Entre novamente para continuar.",
      ),
    };
  }

  const allowed =
    canOperateShop(context.active.role) ||
    isPlatformAdmin(context.user.app_metadata);

  if (!allowed) {
    return {
      error: actionError(
        "Você não tem permissão para gerenciar a agenda desta barbearia.",
      ),
    };
  }

  return { context };
}
