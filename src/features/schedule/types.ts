export type BusinessHourRow = {
  id: string;
  weekday: number;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
};

export type BarberWorkingHourRow = {
  id: string;
  barber_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

export type BlockedSlotRow = {
  id: string;
  barber_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

export type ScheduleBarber = {
  id: string;
  name: string;
  is_active: boolean;
};
