"use server";

import { revalidatePath } from "next/cache";

import {
  actionError,
  actionSuccess,
  fieldErrorsFrom,
  type ActionState,
} from "@/lib/actions";
import { authorizeShopManagement } from "@/lib/auth/management";
import { getSupabasePublicEnv } from "@/lib/env/public";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeServiceName,
  parsePriceToCents,
  serviceActiveSchema,
  serviceFormSchema,
  serviceIdSchema,
} from "@/lib/validation/services";

const configMissing =
  "Supabase não configurado neste ambiente. Preencha o .env e reinicie o servidor.";

const genericError =
  "Não foi possível concluir a operação agora. Tente novamente.";

function revalidateCatalog() {
  revalidatePath("/dashboard", "layout");
}

function serviceMutationMessage(error: { code?: string } | null): string {
  switch (error?.code) {
    case "23505":
      return "Já existe um serviço com este nome nesta barbearia.";
    case "23503":
      return "Este serviço possui vínculos que impedem a exclusão.";
    case "23514":
      return "Os dados do serviço não respeitam os limites permitidos.";
    case "42501":
      return "Você não tem permissão para alterar o catálogo.";
    default:
      return genericError;
  }
}

async function hasDuplicateName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  barbershopId: string,
  name: string,
  excludeId?: string,
): Promise<
  | { duplicate: boolean; error?: never }
  | { duplicate?: never; error: true }
> {
  const { data, error } = await supabase
    .from("services")
    .select("id, name")
    .eq("barbershop_id", barbershopId);

  if (error) {
    return { error: true };
  }

  const normalized = normalizeServiceName(name);
  const duplicate = (data ?? []).some(
    (service) =>
      service.id !== excludeId && normalizeServiceName(service.name) === normalized,
  );

  return { duplicate };
}

export async function createServiceAction(
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = serviceFormSchema.safeParse(values);

  if (!parsed.success) {
    return actionError("Revise os campos destacados.", fieldErrorsFrom(parsed.error));
  }

  const priceCents = parsePriceToCents(parsed.data.price);

  if (priceCents === null) {
    return actionError("Informe um preço válido para o serviço.", {
      price: ["Informe um preço válido, como 45,90."],
    });
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();

  const duplicate = await hasDuplicateName(
    supabase,
    barbershopId,
    parsed.data.name,
  );

  if (duplicate.error) {
    return actionError(genericError);
  }

  if (duplicate.duplicate) {
    return actionError("Já existe um serviço com este nome nesta barbearia.", {
      name: ["Já existe um serviço com este nome nesta barbearia."],
    });
  }

  const { error } = await supabase
    .from("services")
    .insert({
      barbershop_id: barbershopId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      duration_minutes: parsed.data.durationMinutes,
      price_cents: priceCents,
      is_active: parsed.data.isActive,
    })
    .select("id")
    .single();

  if (error) {
    return actionError(serviceMutationMessage(error));
  }

  revalidateCatalog();
  return actionSuccess("Serviço cadastrado com sucesso.");
}

export async function updateServiceAction(
  id: unknown,
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = serviceIdSchema.safeParse(id);

  if (!parsedId.success) {
    return actionError("Serviço inválido. Atualize a página e tente novamente.");
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = serviceFormSchema.safeParse(values);

  if (!parsed.success) {
    return actionError("Revise os campos destacados.", fieldErrorsFrom(parsed.error));
  }

  const priceCents = parsePriceToCents(parsed.data.price);

  if (priceCents === null) {
    return actionError("Informe um preço válido para o serviço.", {
      price: ["Informe um preço válido, como 45,90."],
    });
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();

  const duplicate = await hasDuplicateName(
    supabase,
    barbershopId,
    parsed.data.name,
    parsedId.data,
  );

  if (duplicate.error) {
    return actionError(genericError);
  }

  if (duplicate.duplicate) {
    return actionError("Já existe um serviço com este nome nesta barbearia.", {
      name: ["Já existe um serviço com este nome nesta barbearia."],
    });
  }

  const { data, error } = await supabase
    .from("services")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      duration_minutes: parsed.data.durationMinutes,
      price_cents: priceCents,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(serviceMutationMessage(error));
  }

  if (!data) {
    return actionError("Serviço não encontrado nesta barbearia.");
  }

  revalidateCatalog();
  return actionSuccess("Serviço atualizado com sucesso.");
}

export async function deleteServiceAction(id: unknown): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = serviceIdSchema.safeParse(id);

  if (!parsedId.success) {
    return actionError("Serviço inválido. Atualize a página e tente novamente.");
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();

  const { count, error: appointmentsError } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("barbershop_id", barbershopId)
    .eq("service_id", parsedId.data);

  if (appointmentsError) {
    return actionError(genericError);
  }

  if ((count ?? 0) > 0) {
    return actionError(
      "Este serviço possui agendamentos vinculados e não pode ser excluído. Desative-o para retirá-lo da operação.",
    );
  }

  const { data, error } = await supabase
    .from("services")
    .delete()
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(serviceMutationMessage(error));
  }

  if (!data) {
    return actionError("Serviço não encontrado nesta barbearia.");
  }

  revalidateCatalog();
  return actionSuccess("Serviço excluído.");
}

export async function setServiceActiveAction(
  id: unknown,
  isActive: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = serviceIdSchema.safeParse(id);
  const parsedActive = serviceActiveSchema.safeParse(isActive);

  if (!parsedId.success || !parsedActive.success) {
    return actionError("Status inválido. Atualize a página e tente novamente.");
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .update({ is_active: parsedActive.data })
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(serviceMutationMessage(error));
  }

  if (!data) {
    return actionError("Serviço não encontrado nesta barbearia.");
  }

  revalidateCatalog();
  return actionSuccess(
    parsedActive.data
      ? "Serviço ativado com sucesso."
      : "Serviço desativado com sucesso.",
  );
}
