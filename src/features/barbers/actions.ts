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
  barberActiveSchema,
  barberFormSchema,
  barberIdSchema,
} from "@/lib/validation/barbers";
import { barberLimitMessage, getPlanBarberLimit } from "./plan-limit";

const configMissing =
  "Supabase não configurado neste ambiente. Preencha o .env e reinicie o servidor.";

const genericError =
  "Não foi possível concluir a operação agora. Tente novamente.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidateTeam() {
  revalidatePath("/dashboard", "layout");
}

function barberMutationMessage(error: { code?: string } | null): string {
  switch (error?.code) {
    case "23503":
      return "Este profissional possui agendamentos vinculados e não pode ser excluído. Desative-o para retirá-lo da operação.";
    case "23505":
      return "Já existe um profissional com este vínculo nesta barbearia.";
    case "23514":
      return "Os dados do profissional não respeitam os limites permitidos.";
    case "42501":
      return "Você não tem permissão para alterar a equipe.";
    default:
      return genericError;
  }
}

async function validateBarberLimit(
  supabase: Supabase,
  barbershopId: string,
  excludeBarberId?: string,
): Promise<ActionState | null> {
  const limit = await getPlanBarberLimit(supabase, barbershopId);

  if (!limit || limit.maxBarbers === null) {
    return null;
  }

  let query = supabase
    .from("barbers")
    .select("id", { count: "exact", head: true })
    .eq("barbershop_id", barbershopId)
    .eq("is_active", true);

  if (excludeBarberId) {
    query = query.neq("id", excludeBarberId);
  }

  const { count, error } = await query;

  if (error) {
    return actionError(genericError);
  }

  if ((count ?? 0) >= limit.maxBarbers) {
    return actionError(barberLimitMessage(limit));
  }

  return null;
}

async function validateServiceIds(
  supabase: Supabase,
  barbershopId: string,
  serviceIds: string[],
): Promise<ActionState | null> {
  if (serviceIds.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("services")
    .select("id")
    .eq("barbershop_id", barbershopId)
    .in("id", serviceIds);

  if (error) {
    return actionError(genericError);
  }

  if ((data ?? []).length !== serviceIds.length) {
    return actionError(
      "Um ou mais serviços selecionados não pertencem a esta barbearia.",
    );
  }

  return null;
}

async function replaceBarberServices(
  supabase: Supabase,
  barbershopId: string,
  barberId: string,
  serviceIds: string[],
): Promise<ActionState | null> {
  const { data: existing, error: existingError } = await supabase
    .from("barber_services")
    .select("service_id")
    .eq("barbershop_id", barbershopId)
    .eq("barber_id", barberId);

  if (existingError) {
    return actionError(genericError);
  }

  if (serviceIds.length > 0) {
    const { error: upsertError } = await supabase
      .from("barber_services")
      .upsert(
        serviceIds.map((serviceId) => ({
          barber_id: barberId,
          service_id: serviceId,
          barbershop_id: barbershopId,
        })),
        {
          onConflict: "barber_id,service_id",
          ignoreDuplicates: true,
        },
      );

    if (upsertError) {
      return actionError(
        "Não foi possível atualizar os serviços do profissional. Tente novamente.",
      );
    }
  }

  const selected = new Set(serviceIds);
  const removed = (existing ?? [])
    .map((row) => row.service_id)
    .filter((serviceId) => !selected.has(serviceId));

  if (removed.length > 0) {
    const { error: deleteError } = await supabase
      .from("barber_services")
      .delete()
      .eq("barbershop_id", barbershopId)
      .eq("barber_id", barberId)
      .in("service_id", removed);

    if (deleteError) {
      return actionError(
        "Não foi possível remover os serviços desmarcados. Tente novamente.",
      );
    }
  }

  return null;
}

export async function createBarberAction(
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = barberFormSchema.safeParse(values);

  if (!parsed.success) {
    return actionError("Revise os campos destacados.", fieldErrorsFrom(parsed.error));
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();

  const serviceValidation = await validateServiceIds(
    supabase,
    barbershopId,
    parsed.data.serviceIds,
  );

  if (serviceValidation) {
    return serviceValidation;
  }

  if (parsed.data.isActive) {
    const limitError = await validateBarberLimit(supabase, barbershopId);

    if (limitError) {
      return limitError;
    }
  }

  const { data: lastBarber, error: orderError } = await supabase
    .from("barbers")
    .select("display_order")
    .eq("barbershop_id", barbershopId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) {
    return actionError(genericError);
  }

  const { data: created, error } = await supabase
    .from("barbers")
    .insert({
      barbershop_id: barbershopId,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      bio: parsed.data.bio || null,
      is_active: parsed.data.isActive,
      display_order: (lastBarber?.display_order ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error || !created) {
    return actionError(barberMutationMessage(error));
  }

  const associationError = await replaceBarberServices(
    supabase,
    barbershopId,
    created.id,
    parsed.data.serviceIds,
  );

  if (associationError) {
    // Evita deixar um profissional criado pela metade se o vínculo falhar.
    await supabase
      .from("barbers")
      .delete()
      .eq("id", created.id)
      .eq("barbershop_id", barbershopId);

    return associationError;
  }

  revalidateTeam();
  return actionSuccess("Profissional cadastrado com sucesso.");
}

export async function updateBarberAction(
  id: unknown,
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = barberIdSchema.safeParse(id);

  if (!parsedId.success) {
    return actionError(
      "Profissional inválido. Atualize a página e tente novamente.",
    );
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = barberFormSchema.safeParse(values);

  if (!parsed.success) {
    return actionError("Revise os campos destacados.", fieldErrorsFrom(parsed.error));
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();

  const serviceValidation = await validateServiceIds(
    supabase,
    barbershopId,
    parsed.data.serviceIds,
  );

  if (serviceValidation) {
    return serviceValidation;
  }

  const { data: currentBarber, error: currentError } = await supabase
    .from("barbers")
    .select("is_active")
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .maybeSingle();

  if (currentError) {
    return actionError(genericError);
  }

  if (!currentBarber) {
    return actionError("Profissional não encontrado nesta barbearia.");
  }

  if (!currentBarber.is_active && parsed.data.isActive) {
    const limitError = await validateBarberLimit(
      supabase,
      barbershopId,
      parsedId.data,
    );

    if (limitError) {
      return limitError;
    }
  }

  const { data, error } = await supabase
    .from("barbers")
    .update({
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      bio: parsed.data.bio || null,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(barberMutationMessage(error));
  }

  if (!data) {
    return actionError("Profissional não encontrado nesta barbearia.");
  }

  const associationError = await replaceBarberServices(
    supabase,
    barbershopId,
    parsedId.data,
    parsed.data.serviceIds,
  );

  if (associationError) {
    return actionError(
      "Os dados do profissional foram salvos, mas não foi possível atualizar os serviços vinculados. Edite novamente para tentar.",
    );
  }

  revalidateTeam();
  return actionSuccess("Profissional atualizado com sucesso.");
}

export async function deleteBarberAction(id: unknown): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = barberIdSchema.safeParse(id);

  if (!parsedId.success) {
    return actionError(
      "Profissional inválido. Atualize a página e tente novamente.",
    );
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
    .eq("barber_id", parsedId.data);

  if (appointmentsError) {
    return actionError(genericError);
  }

  if ((count ?? 0) > 0) {
    return actionError(
      "Este profissional possui agendamentos vinculados e não pode ser excluído. Desative-o para retirá-lo da operação.",
    );
  }

  const { data, error } = await supabase
    .from("barbers")
    .delete()
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(barberMutationMessage(error));
  }

  if (!data) {
    return actionError("Profissional não encontrado nesta barbearia.");
  }

  revalidateTeam();
  return actionSuccess("Profissional excluído.");
}

export async function setBarberActiveAction(
  id: unknown,
  isActive: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = barberIdSchema.safeParse(id);
  const parsedActive = barberActiveSchema.safeParse(isActive);

  if (!parsedId.success || !parsedActive.success) {
    return actionError("Status inválido. Atualize a página e tente novamente.");
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();

  if (parsedActive.data) {
    const { data: currentBarber, error: currentError } = await supabase
      .from("barbers")
      .select("is_active")
      .eq("id", parsedId.data)
      .eq("barbershop_id", barbershopId)
      .maybeSingle();

    if (currentError) {
      return actionError(genericError);
    }

    if (!currentBarber) {
      return actionError("Profissional não encontrado nesta barbearia.");
    }

    if (!currentBarber.is_active) {
      const limitError = await validateBarberLimit(
        supabase,
        barbershopId,
        parsedId.data,
      );

      if (limitError) {
        return limitError;
      }
    }
  }

  const { data, error } = await supabase
    .from("barbers")
    .update({ is_active: parsedActive.data })
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(barberMutationMessage(error));
  }

  if (!data) {
    return actionError("Profissional não encontrado nesta barbearia.");
  }

  revalidateTeam();
  return actionSuccess(
    parsedActive.data
      ? "Profissional ativado com sucesso."
      : "Profissional desativado com sucesso.",
  );
}
