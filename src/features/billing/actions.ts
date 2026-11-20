"use server";

import { revalidatePath } from "next/cache";

import {
  actionError,
  actionSuccess,
  fieldErrorsFrom,
  type ActionState,
} from "@/lib/actions";
import { authorizeBillingOwner } from "@/lib/auth/management";
import { getSupabasePublicEnv } from "@/lib/env/public";
import {
  cancelSubscriptionSchema,
  changePlanSchema,
  startSubscriptionSchema,
} from "@/lib/validation/billing";
import {
  BillingServiceError,
  cancelSubscription,
  changePlan,
  startSubscription,
} from "./service";

const configMissing =
  "Supabase não configurado neste ambiente. Preencha o .env e reinicie o servidor.";

const genericError =
  "Não foi possível concluir a operação agora. Tente novamente.";

function billingErrorMessage(error: unknown): string {
  if (error instanceof BillingServiceError) {
    switch (error.kind) {
      case "validation":
      case "conflict":
      case "not_found":
      case "pending_confirmation":
      case "config":
        return error.message;
      default:
        return genericError;
    }
  }

  return genericError;
}

function revalidateBilling() {
  revalidatePath("/dashboard/plano");
  revalidatePath("/dashboard/financeiro");
  revalidatePath("/dashboard", "layout");
}

export async function startSubscriptionAction(
  values: unknown,
): Promise<ActionState> {
  const authorization = await authorizeBillingOwner();

  if (authorization.error) {
    return authorization.error;
  }

  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsed = startSubscriptionSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os campos destacados.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const context = authorization.context;

  try {
    const result = await startSubscription({
      barbershopId: context.active.barbershop_id,
      planId: parsed.data.planId,
      billingType: parsed.data.billingType,
      holderName: parsed.data.holderName,
      document: parsed.data.document,
      email: context.user.email ?? null,
      phone: context.active.barbershop.phone,
    });

    revalidateBilling();
    return actionSuccess(result.message);
  } catch (error) {
    const message = billingErrorMessage(error);

    if (
      error instanceof BillingServiceError &&
      error.kind === "validation" &&
      /documento/i.test(error.message)
    ) {
      return actionError(message, {
        document: [message],
      });
    }

    return actionError(message);
  }
}

export async function changePlanAction(values: unknown): Promise<ActionState> {
  const authorization = await authorizeBillingOwner();

  if (authorization.error) {
    return authorization.error;
  }

  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsed = changePlanSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Selecione um plano válido.",
      fieldErrorsFrom(parsed.error),
    );
  }

  try {
    const result = await changePlan({
      barbershopId: authorization.context.active.barbershop_id,
      planId: parsed.data.planId,
    });

    revalidateBilling();
    return actionSuccess(result.message);
  } catch (error) {
    return actionError(billingErrorMessage(error));
  }
}

export async function cancelSubscriptionAction(
  values?: unknown,
): Promise<ActionState> {
  const authorization = await authorizeBillingOwner();

  if (authorization.error) {
    return authorization.error;
  }

  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsed = cancelSubscriptionSchema.safeParse(values ?? {});

  if (!parsed.success) {
    return actionError(
      "Revise os campos destacados.",
      fieldErrorsFrom(parsed.error),
    );
  }

  try {
    const result = await cancelSubscription({
      barbershopId: authorization.context.active.barbershop_id,
      reason: parsed.data.reason.length > 0 ? parsed.data.reason : null,
    });

    revalidateBilling();
    return actionSuccess(result.message);
  } catch (error) {
    return actionError(billingErrorMessage(error));
  }
}
