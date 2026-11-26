"use client";

import { Building2, CalendarX2, UsersRound } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BlockedSlotsManager } from "@/features/schedule/components/blocked-slots-manager";
import { BusinessHoursEditor } from "@/features/schedule/components/business-hours-editor";
import { WorkingHoursEditor } from "@/features/schedule/components/working-hours-editor";
import type {
  BarberWorkingHourRow,
  BlockedSlotRow,
  BusinessHourRow,
  ScheduleBarber,
} from "@/features/schedule/types";

export function ScheduleTabs({
  businessHours,
  workingHours,
  blockedSlots,
  barbers,
  timeZone,
  canManage,
}: {
  businessHours: BusinessHourRow[];
  workingHours: BarberWorkingHourRow[];
  blockedSlots: BlockedSlotRow[];
  barbers: ScheduleBarber[];
  timeZone: string;
  canManage: boolean;
}) {
  return (
    <Tabs defaultValue="barbearia" className="j2-schedule-tabs">
      <TabsList className="j2-schedule-tablist" aria-label="Configuração de horários">
        <TabsTrigger value="barbearia" className="h-9 gap-1.5 px-3">
          <Building2 className="size-3.5" />
          Barbearia
        </TabsTrigger>
        <TabsTrigger value="profissionais" className="h-9 gap-1.5 px-3">
          <UsersRound className="size-3.5" />
          Profissionais
        </TabsTrigger>
        <TabsTrigger value="bloqueios" className="h-9 gap-1.5 px-3">
          <CalendarX2 className="size-3.5" />
          Bloqueios
        </TabsTrigger>
      </TabsList>

      <TabsContent value="barbearia" className="pt-2">
        <BusinessHoursEditor hours={businessHours} canManage={canManage} />
      </TabsContent>

      <TabsContent value="profissionais" className="pt-2">
        <WorkingHoursEditor
          barbers={barbers}
          workingHours={workingHours}
          businessHours={businessHours}
          canManage={canManage}
        />
      </TabsContent>

      <TabsContent value="bloqueios" className="pt-2">
        <BlockedSlotsManager
          slots={blockedSlots}
          barbers={barbers}
          timeZone={timeZone}
          canManage={canManage}
        />
      </TabsContent>
    </Tabs>
  );
}
