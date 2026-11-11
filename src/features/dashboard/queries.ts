import "server-only";

import { getDayRange, getMonthRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

const activeStatuses: AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "in_progress",
];

async function resolveAppointments(
  rows: Database["public"]["Tables"]["appointments"]["Row"][],
) {
  if (rows.length === 0) {
    return [];
  }

  const supabase = await createClient();

  const customerIds = [...new Set(rows.map((row) => row.customer_id))];
  const barberIds = [...new Set(rows.map((row) => row.barber_id))];
  const serviceIds = [...new Set(rows.map((row) => row.service_id))];

  const [customersResult, barbersResult, servicesResult] = await Promise.all([
    supabase.from("customers").select("id, full_name").in("id", customerIds),
    supabase.from("barbers").select("id, name").in("id", barberIds),
    supabase
      .from("services")
      .select("id, name, duration_minutes")
      .in("id", serviceIds),
  ]);

  const customers = new Map(
    (customersResult.data ?? []).map((item) => [item.id, item.full_name]),
  );
  const barbers = new Map(
    (barbersResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const services = new Map(
    (servicesResult.data ?? []).map((item) => [
      item.id,
      { name: item.name, durationMinutes: item.duration_minutes },
    ]),
  );

  return rows.map((row) => {
    const service = services.get(row.service_id);

    return {
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      priceCents: row.price_cents,
      customerName: customers.get(row.customer_id) ?? "Cliente",
      barberName: barbers.get(row.barber_id) ?? "Profissional",
      serviceName: service?.name ?? "Serviço",
      durationMinutes: service?.durationMinutes ?? null,
    };
  });
}

export type AppointmentListItem = Awaited<
  ReturnType<typeof resolveAppointments>
>[number];

export async function getUpcomingAppointments(
  barbershopId: string,
): Promise<AppointmentListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .gte("starts_at", new Date().toISOString())
    .in("status", activeStatuses)
    .order("starts_at", { ascending: true })
    .limit(6);

  if (error || !data) {
    return [];
  }

  return resolveAppointments(data);
}

export async function getAgendaForToday(
  barbershopId: string,
  timeZone: string,
): Promise<AppointmentListItem[]> {
  const supabase = await createClient();
  const { start, end } = getDayRange(new Date(), timeZone);

  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return resolveAppointments(data);
}

export type DashboardOverview = {
  todayAppointments: number;
  activeCustomers: number;
  activeServices: number;
  monthRevenueCents: number;
  upcoming: AppointmentListItem[];
};

export async function getDashboardOverview(
  barbershopId: string,
  timeZone: string,
  options: { includeRevenue?: boolean } = {},
): Promise<DashboardOverview> {
  const supabase = await createClient();
  const day = getDayRange(new Date(), timeZone);
  const month = getMonthRange(new Date(), timeZone);
  const includeRevenue = options.includeRevenue ?? true;

  const revenueQuery: PromiseLike<{
    data: { amount_cents: number }[] | null;
  }> = includeRevenue
    ? supabase
        .from("payments")
        .select("amount_cents")
        .eq("barbershop_id", barbershopId)
        .eq("status", "paid")
        .gte("paid_at", month.start.toISOString())
        .lt("paid_at", month.end.toISOString())
    : Promise.resolve({ data: [] });

  const [
    todayResult,
    customersResult,
    servicesResult,
    paymentsResult,
    upcoming,
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("barbershop_id", barbershopId)
      .gte("starts_at", day.start.toISOString())
      .lt("starts_at", day.end.toISOString())
      .in("status", ["scheduled", "confirmed", "in_progress", "completed"]),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("barbershop_id", barbershopId)
      .eq("is_active", true),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("barbershop_id", barbershopId)
      .eq("is_active", true),
    revenueQuery,
    getUpcomingAppointments(barbershopId),
  ]);

  const monthRevenueCents = (paymentsResult.data ?? []).reduce(
    (total, payment) => total + payment.amount_cents,
    0,
  );

  return {
    todayAppointments: todayResult.count ?? 0,
    activeCustomers: customersResult.count ?? 0,
    activeServices: servicesResult.count ?? 0,
    monthRevenueCents,
    upcoming,
  };
}

export async function getServices(barbershopId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  return data ?? [];
}

export async function getCustomers(barbershopId: string, search?: string) {
  const supabase = await createClient();
  const term = search?.trim().slice(0, 80)?.replace(/[(),]/g, " ").trim();
  let query = supabase
    .from("customers")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (term) {
    query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  const { data } = await query;

  return data ?? [];
}

export async function getTeam(barbershopId: string) {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("barbershop_members")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .order("created_at", { ascending: true });

  if (!members || members.length === 0) {
    return [];
  }

  const userIds = members.map((member) => member.user_id);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .in("id", userIds);

  const profilesById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile]),
  );

  return members.map((member) => ({
    ...member,
    profile: profilesById.get(member.user_id) ?? null,
  }));
}

export async function getBarbers(barbershopId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("barbers")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  return data ?? [];
}

export async function getSubscription(barbershopId: string) {
  const supabase = await createClient();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .in("status", ["trialing", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription) {
    return null;
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("id", subscription.plan_id)
    .maybeSingle();

  return { subscription, plan };
}

export async function getRecentPayments(barbershopId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .order("created_at", { ascending: false })
    .limit(10);

  return data ?? [];
}

export async function getFinancialOverview(
  barbershopId: string,
  timeZone: string,
) {
  const supabase = await createClient();
  const month = getMonthRange(new Date(), timeZone);

  const [monthResult, recent, subscription] = await Promise.all([
    supabase
      .from("payments")
      .select("amount_cents, status")
      .eq("barbershop_id", barbershopId)
      .gte("created_at", month.start.toISOString())
      .lt("created_at", month.end.toISOString()),
    getRecentPayments(barbershopId),
    getSubscription(barbershopId),
  ]);

  const payments = monthResult.data ?? [];

  return {
    paidCents: payments
      .filter((payment) => payment.status === "paid")
      .reduce((total, payment) => total + payment.amount_cents, 0),
    pendingCents: payments
      .filter((payment) => payment.status === "pending")
      .reduce((total, payment) => total + payment.amount_cents, 0),
    paidCount: payments.filter((payment) => payment.status === "paid").length,
    pendingCount: payments.filter((payment) => payment.status === "pending")
      .length,
    recent,
    subscription,
    period: month,
  };
}

export async function getPlans() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("price_cents", { ascending: true });

  return data ?? [];
}

