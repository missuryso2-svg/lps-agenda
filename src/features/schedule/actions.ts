"use server";

import { revalidatePath } from "next/cache";

import {
  actionError,
  actionSuccess,
  type ActionState,
} from "@/lib/actions";
import { authorizeShopManagement } from "@/lib/auth/management";
import { getSupabasePublicEnv } from "@/lib/env/public";
import {
  addDaysToDateString,
  formatDateOnlyBR,
  localDateString,
  localDateTimeToUtc,
  weekdayLabel,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  blockedSlotFormSchema,
  blockedSlotIdSchema,
  normalizeTime,
  timeToMinutes,
  weeklyBarberWorkingHoursSchema,
  weeklyBusinessHoursSchema,
  type BlockedSlotFormValues,
} from "@/lib/validation/schedule";

const configMissing =
  "Supabase não configurado neste ambiente. Preencha o .env e reinicie o servidor.";

const genericError =
  "Não foi possível concluir a operação agora. Tente novamente.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Converte erros do Zod em caminhos compatíveis com o React Hook Form
 * (por exemplo, days.1.closesAt) para destacar o campo correto.
 */
function scheduleFieldErrors(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key =
      issue.path.length > 0
        ? issue.path.map((part) => String(part)).join(".")
        : "form";

    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }

  return fieldErrors;
}

function revalidateSchedule() {
  revalidatePath("/dashboard", "layout");
}

function scheduleMutationMessage(error: { code?: string } | null): string {
  switch (error?.code) {
    case "23505":
      return "Já existe um horário com este início neste dia. Ajuste o horário e tente novamente.";
    case "23503":
      return "O profissional ou a barbearia informados não estão disponíveis para este horário.";
    case "23514":
      return "Os horários informados não respeitam os limites permitidos.";
    case "42501":
      return "Você não tem permissão para alterar os horários.";
    default:
      return genericError;
  }
}

type TimeRange = { start: number; end: number };

function businessRangesForWeekday(
  days: Array<{
    weekday: number;
    isActive: boolean;
    opensAt: string;
    closesAt: string;
  }>,
  weekday: number,
): TimeRange[] {
  return days
    .filter((day) => day.weekday === weekday && day.isActive)
    .map((day) => ({
      start: timeToMinutes(day.opensAt),
      end: timeToMinutes(day.closesAt),
    }))
    .filter(
      (range) =>
        !Number.isNaN(range.start) &&
        !Number.isNaN(range.end) &&
        range.end > range.start,
    )
    .sort((left, right) => left.start - right.start);
}

function storedRangesForWeekday(
  rows: Array<{
    weekday: number;
    opens_at: string;
    closes_at: string;
    is_active: boolean;
  }>,
  weekday: number,
): TimeRange[] {
  return rows
    .filter((row) => row.weekday === weekday && row.is_active)
    .map((row) => ({
      start: timeToMinutes(row.opens_at),
      end: timeToMinutes(row.closes_at),
    }))
    .filter(
      (range) =>
        !Number.isNaN(range.start) &&
        !Number.isNaN(range.end) &&
        range.end > range.start,
    )
    .sort((left, right) => left.start - right.start);
}

/**
 * Aceita intervalos contíguos de funcionamento (por exemplo, 09:00–12:00 e
 * 12:00–18:00) e exige que a jornada inteira esteja coberta.
 */
function isRangeCovered(
  start: number,
  end: number,
  ranges: TimeRange[],
): boolean {
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return false;
  }

  let coveredUntil = start;

  for (const range of ranges) {
    if (range.end <= coveredUntil) {
      continue;
    }

    if (range.start > coveredUntil) {
      return false;
    }

    coveredUntil = Math.max(coveredUntil, range.end);

    if (coveredUntil >= end) {
      return true;
    }
  }

  return coveredUntil >= end;
}

export async function saveBusinessHoursAction(
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = weeklyBusinessHoursSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os horários destacados.",
      scheduleFieldErrors(parsed.error),
    );
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();
  const days = [...parsed.data.days].sort(
    (left, right) => left.weekday - right.weekday,
  );

  const { data: existing, error: existingError } = await supabase
    .from("business_hours")
    .select("id, weekday, opens_at, closes_at, is_active")
    .eq("barbershop_id", barbershopId)
    .order("weekday", { ascending: true });

  if (existingError) {
    return actionError(genericError);
  }

  const { data: activeWorkingHours, error: workingHoursError } = await supabase
    .from("barber_working_hours")
    .select("barber_id, weekday, starts_at, ends_at")
    .eq("barbershop_id", barbershopId)
    .eq("is_active", true);

  if (workingHoursError) {
    return actionError(genericError);
  }

  if ((activeWorkingHours ?? []).length > 0) {
    const barberIds = [
      ...new Set((activeWorkingHours ?? []).map((row) => row.barber_id)),
    ];
    const { data: barbers, error: barbersError } = await supabase
      .from("barbers")
      .select("id, name")
      .eq("barbershop_id", barbershopId)
      .in("id", barberIds);

    if (barbersError) {
      return actionError(genericError);
    }

    const barberNames = new Map(
      (barbers ?? []).map((barber) => [barber.id, barber.name]),
    );

    for (const working of activeWorkingHours ?? []) {
      const covered = isRangeCovered(
        timeToMinutes(working.starts_at),
        timeToMinutes(working.ends_at),
        businessRangesForWeekday(days, working.weekday),
      );

      if (!covered) {
        const barberName =
          barberNames.get(working.barber_id) ?? "Um profissional";
        return actionError(
          `A jornada de ${barberName} em ${weekdayLabel(
            working.weekday,
          ).toLocaleLowerCase("pt-BR")} ficaria fora do funcionamento da barbearia. Ajuste a jornada antes de alterar os horários.`,
        );
      }
    }
  }

  for (const day of days) {
    const rows = (existing ?? []).filter(
      (row) => row.weekday === day.weekday,
    );
    const extras = rows.slice(1);

    if (extras.length > 0) {
      const { error } = await supabase
        .from("business_hours")
        .delete()
        .eq("barbershop_id", barbershopId)
        .in(
          "id",
          extras.map((row) => row.id),
        );

      if (error) {
        return actionError(scheduleMutationMessage(error));
      }
    }

    const extraIds = new Set(extras.map((row) => row.id));
    const canonical = rows.find((row) => !extraIds.has(row.id));
    const payload = {
      opens_at: normalizeTime(day.opensAt),
      closes_at: normalizeTime(day.closesAt),
      is_active: day.isActive,
    };

    if (canonical) {
      const { error } = await supabase
        .from("business_hours")
        .update(payload)
        .eq("id", canonical.id)
        .eq("barbershop_id", barbershopId);

      if (error) {
        return actionError(scheduleMutationMessage(error));
      }
    } else {
      const { error } = await supabase.from("business_hours").insert({
        barbershop_id: barbershopId,
        weekday: day.weekday,
        ...payload,
      });

      if (error) {
        return actionError(scheduleMutationMessage(error));
      }
    }
  }

  revalidateSchedule();
  return actionSuccess("Horários da barbearia atualizados com sucesso.");
}

export async function saveBarberWorkingHoursAction(
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = weeklyBarberWorkingHoursSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise a jornada destacada.",
      scheduleFieldErrors(parsed.error),
    );
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();

  const { data: barber, error: barberError } = await supabase
    .from("barbers")
    .select("id, name")
    .eq("id", parsed.data.barberId)
    .eq("barbershop_id", barbershopId)
    .maybeSingle();

  if (barberError) {
    return actionError(genericError);
  }

  if (!barber) {
    return actionError(
      "O profissional selecionado não pertence a esta barbearia.",
    );
  }

  const { data: businessHours, error: businessHoursError } = await supabase
    .from("business_hours")
    .select("id, weekday, opens_at, closes_at, is_active")
    .eq("barbershop_id", barbershopId)
    .order("weekday", { ascending: true });

  if (businessHoursError) {
    return actionError(genericError);
  }

  const days = [...parsed.data.days].sort(
    (left, right) => left.weekday - right.weekday,
  );

  for (const [index, day] of parsed.data.days.entries()) {
    if (!day.isActive) {
      continue;
    }

    const covered = isRangeCovered(
      timeToMinutes(day.startsAt),
      timeToMinutes(day.endsAt),
      storedRangesForWeekday(businessHours ?? [], day.weekday),
    );

    if (!covered) {
      const message = `A jornada de ${barber.name} em ${weekdayLabel(
        day.weekday,
      ).toLocaleLowerCase(
        "pt-BR",
      )} precisa estar dentro do funcionamento da barbearia.`;
      return actionError(message, {
        [`days.${index}.startsAt`]: [message],
      });
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from("barber_working_hours")
    .select("id, barber_id, weekday, starts_at, ends_at, is_active")
    .eq("barbershop_id", barbershopId)
    .eq("barber_id", parsed.data.barberId)
    .order("weekday", { ascending: true });

  if (existingError) {
    return actionError(genericError);
  }

  for (const day of days) {
    const rows = (existing ?? []).filter(
      (row) => row.weekday === day.weekday,
    );
    const extras = rows.slice(1);

    if (extras.length > 0) {
      const { error } = await supabase
        .from("barber_working_hours")
        .delete()
        .eq("barbershop_id", barbershopId)
        .eq("barber_id", parsed.data.barberId)
        .in(
          "id",
          extras.map((row) => row.id),
        );

      if (error) {
        return actionError(scheduleMutationMessage(error));
      }
    }

    const extraIds = new Set(extras.map((row) => row.id));
    const canonical = rows.find((row) => !extraIds.has(row.id));
    const payload = {
      starts_at: normalizeTime(day.startsAt),
      ends_at: normalizeTime(day.endsAt),
      is_active: day.isActive,
    };

    if (canonical) {
      const { error } = await supabase
        .from("barber_working_hours")
        .update(payload)
        .eq("id", canonical.id)
        .eq("barbershop_id", barbershopId)
        .eq("barber_id", parsed.data.barberId);

      if (error) {
        return actionError(scheduleMutationMessage(error));
      }
    } else {
      const { error } = await supabase.from("barber_working_hours").insert({
        barbershop_id: barbershopId,
        barber_id: parsed.data.barberId,
        weekday: day.weekday,
        ...payload,
      });

      if (error) {
        return actionError(scheduleMutationMessage(error));
      }
    }
  }

  revalidateSchedule();
  return actionSuccess(`Jornada de ${barber.name} atualizada com sucesso.`);
}

type PreparedBlockedSlot = {
  barberId: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

async function prepareBlockedSlot(
  supabase: Supabase,
  barbershopId: string,
  timeZone: string,
  values: BlockedSlotFormValues,
  excludeId?: string,
): Promise<
  | { error: ActionState; value?: never }
  | { error?: never; value: PreparedBlockedSlot }
> {
  const barberId = values.barberId || null;
  let startsAt: Date;
  let endsAt: Date;

  try {
    if (values.allDay) {
      startsAt = localDateTimeToUtc(values.date, "00:00", timeZone);
      endsAt = localDateTimeToUtc(
        addDaysToDateString(values.date, 1),
        "00:00",
        timeZone,
      );
    } else {
      startsAt = localDateTimeToUtc(values.date, values.startsAt, timeZone);
      endsAt = localDateTimeToUtc(values.date, values.endsAt, timeZone);
    }
  } catch {
    return {
      error: actionError("Informe uma data e horários válidos para o bloqueio."),
    };
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    return {
      error: actionError("O horário final deve ser posterior ao inicial."),
    };
  }

  if (barberId) {
    const { data: barber, error: barberError } = await supabase
      .from("barbers")
      .select("id")
      .eq("id", barberId)
      .eq("barbershop_id", barbershopId)
      .maybeSingle();

    if (barberError) {
      return { error: actionError(genericError) };
    }

    if (!barber) {
      return {
        error: actionError(
          "O profissional selecionado não pertence a esta barbearia.",
        ),
      };
    }
  }

  const { data: conflicts, error: conflictsError } = await supabase
    .from("blocked_slots")
    .select("id, barber_id, starts_at, ends_at")
    .eq("barbershop_id", barbershopId)
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString());

  if (conflictsError) {
    return { error: actionError(genericError) };
  }

  const conflict = (conflicts ?? []).find((row) => {
    if (excludeId && row.id === excludeId) {
      return false;
    }

    if (barberId === null || row.barber_id === null) {
      return true;
    }

    return row.barber_id === barberId;
  });

  if (conflict) {
    const conflictDate = formatDateOnlyBR(
      localDateString(conflict.starts_at, timeZone),
    );

    return {
      error: actionError(
        `Já existe um bloqueio que se sobrepõe a este período (${conflictDate}). Revise as datas antes de salvar.`,
      ),
    };
  }

  return {
    value: {
      barberId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      reason: values.reason.length > 0 ? values.reason : null,
    },
  };
}

export async function createBlockedSlotAction(
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = blockedSlotFormSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os dados do bloqueio.",
      scheduleFieldErrors(parsed.error),
    );
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const timeZone =
    authorization.context.active.barbershop.timezone || "America/Sao_Paulo";
  const supabase = await createClient();
  const prepared = await prepareBlockedSlot(
    supabase,
    barbershopId,
    timeZone,
    parsed.data,
  );

  if (prepared.error) {
    return prepared.error;
  }

  const { error } = await supabase.from("blocked_slots").insert({
    barbershop_id: barbershopId,
    barber_id: prepared.value.barberId,
    starts_at: prepared.value.startsAt,
    ends_at: prepared.value.endsAt,
    reason: prepared.value.reason,
    created_by: authorization.context.user.id,
  });

  if (error) {
    return actionError(scheduleMutationMessage(error));
  }

  revalidateSchedule();
  return actionSuccess("Bloqueio criado com sucesso.");
}

export async function updateBlockedSlotAction(
  id: unknown,
  values: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = blockedSlotIdSchema.safeParse(id);

  if (!parsedId.success) {
    return actionError(
      "Bloqueio inválido. Atualize a página e tente novamente.",
    );
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const parsed = blockedSlotFormSchema.safeParse(values);

  if (!parsed.success) {
    return actionError(
      "Revise os dados do bloqueio.",
      scheduleFieldErrors(parsed.error),
    );
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const timeZone =
    authorization.context.active.barbershop.timezone || "America/Sao_Paulo";
  const supabase = await createClient();
  const prepared = await prepareBlockedSlot(
    supabase,
    barbershopId,
    timeZone,
    parsed.data,
    parsedId.data,
  );

  if (prepared.error) {
    return prepared.error;
  }

  const { data, error } = await supabase
    .from("blocked_slots")
    .update({
      barber_id: prepared.value.barberId,
      starts_at: prepared.value.startsAt,
      ends_at: prepared.value.endsAt,
      reason: prepared.value.reason,
    })
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(scheduleMutationMessage(error));
  }

  if (!data) {
    return actionError("Bloqueio não encontrado nesta barbearia.");
  }

  revalidateSchedule();
  return actionSuccess("Bloqueio atualizado com sucesso.");
}

export async function deleteBlockedSlotAction(
  id: unknown,
): Promise<ActionState> {
  if (!getSupabasePublicEnv()) {
    return actionError(configMissing);
  }

  const parsedId = blockedSlotIdSchema.safeParse(id);

  if (!parsedId.success) {
    return actionError(
      "Bloqueio inválido. Atualize a página e tente novamente.",
    );
  }

  const authorization = await authorizeShopManagement();

  if (authorization.error) {
    return authorization.error;
  }

  const barbershopId = authorization.context.active.barbershop_id;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("blocked_slots")
    .delete()
    .eq("id", parsedId.data)
    .eq("barbershop_id", barbershopId)
    .select("id")
    .maybeSingle();

  if (error) {
    return actionError(scheduleMutationMessage(error));
  }

  if (!data) {
    return actionError("Bloqueio não encontrado nesta barbearia.");
  }

  revalidateSchedule();
  return actionSuccess("Bloqueio excluído.");
}
