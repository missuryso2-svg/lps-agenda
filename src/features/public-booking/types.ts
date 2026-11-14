import type { AvailabilitySnapshot } from "@/features/scheduling/types";
import type { Database } from "@/types/database";

export type AppointmentStatus =
  Database["public"]["Enums"]["appointment_status"];

export type PublicBarbershop = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  timezone: string;
  logoUrl: string | null;
  coverUrl: string | null;
  status: Database["public"]["Enums"]["barbershop_status"];
};

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
};

export type PublicBarber = {
  id: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  serviceIds: string[];
};

export type PublicBusinessHour = {
  weekday: number;
  opensAt: string;
  closesAt: string;
};

export type PublicBookingDateWindow = {
  min: string;
  max: string;
};

export type PublicBookingPageData = {
  barbershop: PublicBarbershop;
  services: PublicService[];
  barbers: PublicBarber[];
  businessHours: PublicBusinessHour[];
  dateWindow: PublicBookingDateWindow;
};

export type PublicBookingPageResult =
  | { status: "ready"; data: PublicBookingPageData }
  | { status: "not_found" }
  | { status: "inactive" }
  | { status: "error" };

export type PublicReservation = {
  token: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  serviceName: string;
  barberName: string;
  customerName: string;
  barbershop: PublicBarbershop;
  canCancel: boolean;
};

export type PublicReservationResult =
  | { status: "ready"; data: PublicReservation }
  | { status: "not_found" }
  | { status: "error" };

export type PublicAvailabilityActionResult =
  | { status: "success"; availability: AvailabilitySnapshot }
  | { status: "error"; message: string };

export type PublicBookingActionResult =
  | { status: "success"; message: string; slug: string; token: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

export type PublicBookingFailureCode =
  | "not_found"
  | "inactive"
  | "invalid_date"
  | "unavailable"
  | "customer"
  | "conflict"
  | "token"
  | "error";

export type PublicBookingOutcome =
  | { ok: true; token: string; startsAt: string; endsAt: string }
  | {
      ok: false;
      code: PublicBookingFailureCode;
      message: string;
      field?: "date" | "time" | "serviceId" | "barberId";
    };

export type PublicAvailabilityOutcome =
  | { ok: true; availability: AvailabilitySnapshot }
  | { ok: false; message: string };

export type PublicCancelOutcome =
  | { ok: true }
  | {
      ok: false;
      code: "not_found" | "not_cancellable" | "error";
      message: string;
    };
