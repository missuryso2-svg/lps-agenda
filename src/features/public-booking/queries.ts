import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { publicBookingDateWindow } from "@/features/public-booking/constants";
import { getBarbershopBookingAccess } from "@/features/scheduling/booking-access";
import type {
  PublicBarber,
  PublicBarbershop,
  PublicBookingPageData,
  PublicBookingPageResult,
  PublicBusinessHour,
  PublicReservation,
  PublicReservationResult,
  PublicService,
} from "@/features/public-booking/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type PublicShopLookup =
  | { status: "ok"; shop: PublicBarbershop }
  | { status: "not_found" | "inactive" | "error" };

type BarbershopPublicRow = Pick<
  Database["public"]["Tables"]["barbershops"]["Row"],
  | "id"
  | "slug"
  | "name"
  | "description"
  | "phone"
  | "address_street"
  | "address_number"
  | "address_complement"
  | "address_district"
  | "address_city"
  | "address_state"
  | "address_zip"
  | "timezone"
  | "logo_url"
  | "cover_url"
  | "status"
>;

function mapBarbershop(row: BarbershopPublicRow): PublicBarbershop {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    phone: row.phone,
    addressStreet: row.address_street,
    addressNumber: row.address_number,
    addressComplement: row.address_complement,
    addressDistrict: row.address_district,
    addressCity: row.address_city,
    addressState: row.address_state,
    addressZip: row.address_zip,
    timezone: row.timezone || "America/Sao_Paulo",
    logoUrl: row.logo_url,
    coverUrl: row.cover_url,
    status: row.status,
  };
}

export async function findPublicShop(
  supabase: Supabase,
  slug: string,
  { requireActive = true }: { requireActive?: boolean } = {},
): Promise<PublicShopLookup> {
  const { data, error } = await supabase
    .from("barbershops")
    .select(
      "id, slug, name, description, phone, address_street, address_number, address_complement, address_district, address_city, address_state, address_zip, timezone, logo_url, cover_url, status",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return { status: "error" };
  }

  if (!data) {
    return { status: "not_found" };
  }

  if (requireActive && data.status !== "active") {
    return { status: "inactive" };
  }

  return { status: "ok", shop: mapBarbershop(data) };
}

function mapServices(
  rows: Array<{
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    price_cents: number;
  }>,
  bookableServiceIds: Set<string>,
): PublicService[] {
  return rows
    .filter((row) => bookableServiceIds.has(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      durationMinutes: row.duration_minutes,
      priceCents: row.price_cents,
    }));
}

function mapBarbers(
  rows: Array<{
    id: string;
    name: string;
    bio: string | null;
    avatar_url: string | null;
  }>,
  assignments: Array<{ barber_id: string; service_id: string }>,
): PublicBarber[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    bio: row.bio,
    avatarUrl: row.avatar_url?.startsWith("https://") ? row.avatar_url : null,
    serviceIds: assignments
      .filter((assignment) => assignment.barber_id === row.id)
      .map((assignment) => assignment.service_id),
  }));
}

function mapBusinessHours(
  rows: Array<{ weekday: number; opens_at: string; closes_at: string }>,
): PublicBusinessHour[] {
  return rows.map((row) => ({
    weekday: row.weekday,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
  }));
}

/**
 * Carrega a página pública usando exclusivamente service role no servidor.
 * Serviços sem nenhum profissional ativo associado não entram no fluxo para
 * evitar uma seleção sem saída.
 */
export async function loadPublicBookingPageData(
  supabase: Supabase,
  slug: string,
  now = new Date(),
): Promise<PublicBookingPageResult> {
  const shopLookup = await findPublicShop(supabase, slug, {
    requireActive: true,
  });

  if (shopLookup.status !== "ok") {
    return { status: shopLookup.status };
  }

  const bookingAccess = await getBarbershopBookingAccess(
    shopLookup.shop.id,
    supabase,
  );

  if (!bookingAccess.allowed) {
    return { status: "booking_blocked" };
  }

  const [servicesResult, barbersResult, assignmentsResult, hoursResult] =
    await Promise.all([
      supabase
        .from("services")
        .select("id, name, description, duration_minutes, price_cents")
        .eq("barbershop_id", shopLookup.shop.id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("barbers")
        .select("id, name, bio, avatar_url")
        .eq("barbershop_id", shopLookup.shop.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("barber_services")
        .select("barber_id, service_id")
        .eq("barbershop_id", shopLookup.shop.id),
      supabase
        .from("business_hours")
        .select("weekday, opens_at, closes_at")
        .eq("barbershop_id", shopLookup.shop.id)
        .eq("is_active", true)
        .order("weekday", { ascending: true })
        .order("opens_at", { ascending: true }),
    ]);

  if (
    servicesResult.error ||
    barbersResult.error ||
    assignmentsResult.error ||
    hoursResult.error
  ) {
    return { status: "error" };
  }

  const barberRows = barbersResult.data ?? [];
  const activeBarberIds = new Set(barberRows.map((barber) => barber.id));
  const activeServiceIds = new Set(
    (servicesResult.data ?? []).map((service) => service.id),
  );
  const activeAssignments = (assignmentsResult.data ?? []).filter(
    (assignment) =>
      activeBarberIds.has(assignment.barber_id) &&
      activeServiceIds.has(assignment.service_id),
  );
  const bookableServiceIds = new Set(
    activeAssignments.map((assignment) => assignment.service_id),
  );

  const data: PublicBookingPageData = {
    barbershop: shopLookup.shop,
    services: mapServices(servicesResult.data ?? [], bookableServiceIds),
    barbers: mapBarbers(barberRows, activeAssignments),
    businessHours: mapBusinessHours(hoursResult.data ?? []),
    dateWindow: publicBookingDateWindow(shopLookup.shop.timezone, now),
  };

  return { status: "ready", data };
}

export async function loadPublicReservation(
  supabase: Supabase,
  slug: string,
  token: string,
  now = new Date(),
): Promise<PublicReservationResult> {
  const shopLookup = await findPublicShop(supabase, slug, {
    requireActive: false,
  });

  if (shopLookup.status !== "ok") {
    return shopLookup.status === "inactive"
      ? { status: "not_found" }
      : { status: shopLookup.status };
  }

  const shop = shopLookup.shop;
  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select(
      "id, customer_id, barber_id, service_id, starts_at, ends_at, status, price_cents, public_token",
    )
    .eq("barbershop_id", shop.id)
    .eq("public_token", token)
    .maybeSingle();

  if (appointmentError) {
    return { status: "error" };
  }

  if (!appointment) {
    return { status: "not_found" };
  }

  const [serviceResult, barberResult, customerResult] = await Promise.all([
    supabase
      .from("services")
      .select("name")
      .eq("id", appointment.service_id)
      .eq("barbershop_id", shop.id)
      .maybeSingle(),
    supabase
      .from("barbers")
      .select("name")
      .eq("id", appointment.barber_id)
      .eq("barbershop_id", shop.id)
      .maybeSingle(),
    supabase
      .from("customers")
      .select("full_name")
      .eq("id", appointment.customer_id)
      .eq("barbershop_id", shop.id)
      .maybeSingle(),
  ]);

  if (serviceResult.error || barberResult.error || customerResult.error) {
    return { status: "error" };
  }

  const canCancel =
    (appointment.status === "scheduled" ||
      appointment.status === "confirmed") &&
    new Date(appointment.starts_at).getTime() > now.getTime();

  const data: PublicReservation = {
    token: appointment.public_token,
    status: appointment.status,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    priceCents: appointment.price_cents,
    serviceName: serviceResult.data?.name ?? "Serviço",
    barberName: barberResult.data?.name ?? "Profissional",
    customerName: customerResult.data?.full_name ?? "Cliente",
    barbershop: shop,
    canCancel,
  };

  return { status: "ready", data };
}

export const getPublicBookingPage = cache(
  async (slug: string): Promise<PublicBookingPageResult> => {
    try {
      return await loadPublicBookingPageData(createAdminClient(), slug);
    } catch {
      return { status: "error" };
    }
  },
);

export async function getPublicReservation(
  slug: string,
  token: string,
): Promise<PublicReservationResult> {
  try {
    return await loadPublicReservation(createAdminClient(), slug, token);
  } catch {
    return { status: "error" };
  }
}
