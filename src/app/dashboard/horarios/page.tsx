import type { Metadata } from "next";

import { ManagementHeading, ManagementSection } from "@/components/dashboard/management-page";
import { OperationMetrics } from "@/components/dashboard/operation-page";
import {
  getBarbers,
  getBarberWorkingHours,
  getBlockedSlots,
  getBusinessHours,
} from "@/features/dashboard/queries";
import { BarberBreaks } from "@/features/schedule/components/barber-breaks";
import { createClient } from "@/lib/supabase/server";
import { ScheduleTabs } from "@/features/schedule/components/schedule-tabs";
import {
  isCurrentUserPlatformAdmin,
  requireDashboardContext,
} from "@/lib/auth/dal";
import { canManageShop } from "@/lib/auth/permissions";
import { timeToMinutes } from "@/lib/validation/schedule";

export const metadata: Metadata = {
  title: "Horários",
};

export default async function SchedulePage() {
  const context = await requireDashboardContext();
  const shop = context.active.barbershop;
  const canManage =
    canManageShop(context.active.role) ||
    isCurrentUserPlatformAdmin(context.user);

  const db = await createClient();
  const [businessHours, workingHours, blockedSlots, barbers, pauses] =
    await Promise.all([
      getBusinessHours(shop.id),
      getBarberWorkingHours(shop.id),
      getBlockedSlots(shop.id),
      getBarbers(shop.id),
      db.from("barber_breaks").select("*").eq("barbershop_id", shop.id),
    ]);

  const openDays = businessHours.filter((row) => row.is_active);
  const weeklyMinutes = openDays.reduce((total, row) => {
    const start = timeToMinutes(row.opens_at);
    const end = timeToMinutes(row.closes_at);

    return Number.isNaN(start) || Number.isNaN(end) || end <= start
      ? total
      : total + end - start;
  }, 0);
  const scheduledBarbers = new Set(
    workingHours
      .filter((row) => row.is_active)
      .map((row) => row.barber_id),
  );

  const scheduleBarbers = barbers.map((barber) => ({
    id: barber.id,
    name: barber.name,
    is_active: barber.is_active,
  }));

  return (
    <div className="j2-operation j2-management">
      <ManagementHeading
        title="Horários e disponibilidade"
        description={"Configure o expediente, a jornada da equipe e os bloqueios no fuso " + (shop.timezone || "America/Sao_Paulo") + "."}
      />
      <OperationMetrics label="Resumo do expediente" entries={[
        { label: "Dias abertos", value: openDays.length + " de 7" },
        { label: "Carga semanal", value: Math.floor(weeklyMinutes / 60) + "h" + String(weeklyMinutes % 60).padStart(2, "0") },
        { label: "Com jornada", value: scheduledBarbers.size + " de " + barbers.length },
        { label: "Bloqueios registrados", value: String(blockedSlots.length) },
      ]} />
      <ManagementSection id="expediente-semanal" title="Configuração semanal">
        <div className="j2-management-inner">
          <ScheduleTabs businessHours={businessHours} workingHours={workingHours} blockedSlots={blockedSlots} barbers={scheduleBarbers} timeZone={shop.timezone || "America/Sao_Paulo"} canManage={canManage} />
        </div>
      </ManagementSection>
      {context.active.role === "owner" && (pauses.error ? (
        <p role="alert" className="j2-operation-callout">Não foi possível carregar as pausas.</p>
      ) : (
        <BarberBreaks barbers={scheduleBarbers} pauses={pauses.data ?? []} />
      ))}
    </div>
  );
}
