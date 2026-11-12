"use server";

import { revalidatePath } from "next/cache";

import {
  actionError,
  actionSuccess,
  fieldErrorsFrom,
  type ActionState,
} from "@/lib/actions";
import { authorizeCustomerManagement } from "@/lib/auth/management";
import { getSupabasePublicEnv } from "@/lib/env/public";
import { createClient } from "@/lib/supabase/server";
import {
  customerActiveSchema,
  customerFormSchema,
  customerIdSchema,
  phoneLookupVariants,
} from "@/lib/validation/customers";

const configMissing =
  "Supabase não configurado neste ambiente. Preencha o .env e reinicie o servidor.";

const genericError =
  "Não foi possível concluir a operação agora. Tente novamente.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidateCustomers() {
  revalidatePath("/dashboard", "layout");
}

function customerMutationMessage(error: { code?: string } | null): string {
  switch (error?.code) {
    case "23505":
      return "Já existe um cadastro com estes dados nesta barbearia.";
    case "23503":
      return "Este cliente possui agendamentos vinculados e não pode ser removido.";
    case "23514":
      return "Os dados do cliente não respeitam os limites permitidos.";
    case "42501":
      return "Você não tem permissão para alterar clientes.";
    default:
      return genericError;
  }
}

type DuplicateState = "phone" | "email" | "both";

function customerDuplicateError(state: DuplicateState): ActionState {
  const fieldErrors: Record<string, string[]> = {};

  if (state === "phone" || state === "both") {
    fieldErrors.phone = [
      "Já existe um cliente com este telefone nesta barbearia.",
    ];
  }

  if (state === "email" || state === "both") {
    fieldErrors.email = [
      "Já existe um cliente com este e-mail nesta barbearia.",
    ];
  }

  const message =
    state === "both"
      ? "Já existe um cliente com este telefone e e-mail nesta barbearia, inclusive entre os arquivados."
      : state === "phone"
        ? "Já existe um cliente com este telefone nesta barbearia, inclusive entre os arquivados."
        : "Já existe um cliente com este e-mail nesta barbearia, inclusive entre os arquivados.";

  return actionError(message, fieldErrors);
}

type DuplicateCheck =
  | { error: ActionState; state?: never }
  | { error?: never; state: DuplicateState | null };

/**
 * Verifica duplicidade apenas dentro da barbearia ativa. O telefone é
 * comparado por dígitos e por variações formatadas legadas; o e-mail é
 * comparado sem diferenciar maiúsculas de minúsculas.
 */
async function findDuplicateCustomer(
  supabase: Supabase,
  barbershopId: string,
  phone: string,
  email: string,
  excludeId?: string,
): Promise<DuplicateCheck> {
  const phoneVariants = phoneLookupVariants(phone);
  let phoneDuplicate = false;
  let emailDuplicate = false;

  if (phoneVariants.length > 0) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("barbershop_id", barbershopId)
      .in("phone", phoneVariants);

    if (error) {
      return { error: actionError(genericError) };
    }

    phoneDuplicate = (data ?? []).some((row) => row.id !== excludeId);
  }

  if (email) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("barbershop_id", barbershopId)
      .ilike("email", email);

    if (error) {
      return { error: actionError(genericError) };
    }

    emailDuplicate = (data ?? []).some((row) => row.id !== excludeId);
  }

  const state: DuplicateState | null =
    phoneDuplicate && emailDuplicate
      ? "both"
      : phoneDuplicate
        ? "phone"
        : emailDuplicate
          ? "email"
          : null;

  return { state };
}

export async function createCustomerAction(
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const authorization = await authorizeCustomerManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = customerFormSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os dados do cliente.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();
  const duplicate = await findDuplicateCustomer(
    supabase,
    barbershopId,
    parsed.data.phone,
    parsed.data.email,
  );

  if (duplicate.error) {
    return duplicate.error;
  }

  if (duplicate.state) {
    return customerDuplicateError(duplicate.state);
  }

  const { error } = await supabase.from("customers").insert({
    barbershop_id: barbershopId,
    full_name: parsed.data.fullName,
    phone: parsed.data.phone,
    email: parsed.data.email.length > 0 ? parsed.data.email : null,
    notes: parsed.data.notes.length > 0 ? parsed.data.notes : null,
    is_active: true,
  });

  if (error) {
    return actionError(customerMutationMessage(error));
  }

  revalidateCustomers();
  return actionSuccess("Cliente cadastrado com sucesso.");
}

export async function updateCustomerAction(
  id: unknown,
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = customerIdSchema.safeParse(id);

  if (!parsedId.success) {
    return actionError(
      "Cliente inválido. Atualize a página e tente novamente.",
    );
  }

  const authorization = await authorizeCustomerManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = customerFormSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os dados do cliente.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();
  const duplicate = await findDuplicateCustomer(
    supabase,
    barbershopId,
    parsed.data.phone,
    parsed.data.email,
    parsedId.data,
  );

  if (duplicate.error) {
    return duplicate.error;
  }

  if (duplicate.state) {
    return customerDuplicateError(duplicate.state);
  }

  const { data, error } = await supabase
    .from("customers")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      email: parsed.data.email.length > 0 ? parsed.data.email : null,
      notes: parsed.data.notes.length > 0 ? parsed.data.notes : null,
    })
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(customerMutationMessage(error));
  }

  if (!data) {
    return actionError("Cliente não encontrado nesta barbearia.");
  }

  revalidateCustomers();
  return actionSuccess("Dados do cliente atualizados com sucesso.");
}

/**
 * Arquivamento reversível. O cadastro continua no banco para preservar
 * observações e o histórico de agendamentos; apenas sai da operação ativa.
 */
export async function setCustomerActiveAction(
  id: unknown,
  isActive: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = customerIdSchema.safeParse(id);

  if (!parsedId.success) {
    return actionError(
      "Cliente inválido. Atualize a página e tente novamente.",
    );
  }

  const parsedActive = customerActiveSchema.safeParse(isActive);

  if (!parsedActive.success) {
    return actionError("Informe uma situação válida para o cliente.");
  }

  const authorization = await authorizeCustomerManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .update({ is_active: parsedActive.data })
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(customerMutationMessage(error));
  }

  if (!data) {
    return actionError("Cliente não encontrado nesta barbearia.");
  }

  revalidateCustomers();
  return actionSuccess(
    parsedActive.data
      ? "Cliente reativado com sucesso."
      : "Cliente arquivado com sucesso. O histórico foi preservado.",
  );
}
