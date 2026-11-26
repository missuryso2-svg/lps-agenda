import "server-only";

import type {
  CustomerListResult,
  CustomerStats,
  CustomerStatus,
} from "@/features/customers/types";
import { getDayRange, getMonthRange, localDateString } from "@/lib/format";
import { normalizePhoneDigits } from "@/lib/validation/customers";
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
        .is("subscription_id", null)
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

const CUSTOMER_PAGE_SIZE = 20;

function sanitizeCustomerSearch(value: string | undefined): string {
  return (value ?? "")
    .replace(/[%,()\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function parseCustomerStatus(
  value: string | undefined,
): CustomerStatus {
  return value === "archived" || value === "all" ? value : "active";
}

export async function getCustomersPage({
  barbershopId,
  search,
  status = "active",
  page = 1,
  pageSize = CUSTOMER_PAGE_SIZE,
}: {
  barbershopId: string;
  search?: string;
  status?: CustomerStatus;
  page?: number;
  pageSize?: number;
}): Promise<CustomerListResult> {
  const supabase = await createClient();
  const safePageSize = Math.min(Math.max(Math.trunc(pageSize), 1), 100);
  const safeSearch = sanitizeCustomerSearch(search);
  const phoneDigits = normalizePhoneDigits(safeSearch);
  const requestedPage = Math.max(Math.trunc(page) || 1, 1);

  const buildQuery = (targetPage: number) => {
    let query = supabase
      .from("customers")
      .select("*", { count: "exact" })
      .eq("barbershop_id", barbershopId);

    if (status === "active") {
      query = query.eq("is_active", true);
    } else if (status === "archived") {
      query = query.eq("is_active", false);
    }

    if (safeSearch) {
      const conditions = [
        `full_name.ilike.%${safeSearch}%`,
        `email.ilike.%${safeSearch}%`,
      ];

      if (phoneDigits.length >= 3) {
        conditions.push(`phone.ilike.%${phoneDigits}%`);
      }

      query = query.or(conditions.join(","));
    }

    const from = (targetPage - 1) * safePageSize;

    return query
      .order("created_at", { ascending: false })
      .order("full_name", { ascending: true })
      .range(from, from + safePageSize - 1);
  };

  const first = await buildQuery(requestedPage);

  if (first.error) {
    return {
      rows: [],
      total: 0,
      page: 1,
      pageSize: safePageSize,
      totalPages: 0,
      error: true,
    };
  }

  const total = first.count ?? (first.data ?? []).length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / safePageSize);
  let currentPage = requestedPage;
  let rows = first.data ?? [];

  // Se a página pedida ficou além do total (por filtro ou exclusão), busca a
  // última página válida em vez de exibir uma lista vazia enganosa.
  if (rows.length === 0 && total > 0 && requestedPage > totalPages) {
    currentPage = totalPages;
    const retry = await buildQuery(currentPage);

    if (retry.error) {
      return {
        rows: [],
        total: 0,
        page: 1,
        pageSize: safePageSize,
        totalPages: 0,
        error: true,
      };
    }

    rows = retry.data ?? [];
  }

  return {
    rows,
    total,
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
    error: false,
  };
}

export async function getCustomerStats(
  barbershopId: string,
): Promise<CustomerStats> {
  const supabase = await createClient();
  const [activeResult, archivedResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("barbershop_id", barbershopId)
      .eq("is_active", true),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("barbershop_id", barbershopId)
      .eq("is_active", false),
  ]);

  const active = activeResult.count ?? 0;
  const archived = archivedResult.count ?? 0;

  return { active, archived, total: active + archived };
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

export async function getBarberServiceAssignments(barbershopId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("barber_services")
    .select("barber_id, service_id")
    .eq("barbershop_id", barbershopId);

  return data ?? [];
}

export async function getBusinessHours(barbershopId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_hours")
    .select("id, weekday, opens_at, closes_at, is_active")
    .eq("barbershop_id", barbershopId)
    .order("weekday", { ascending: true })
    .order("opens_at", { ascending: true });

  return data ?? [];
}

export async function getBarberWorkingHours(barbershopId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("barber_working_hours")
    .select("id, barber_id, weekday, starts_at, ends_at, is_active")
    .eq("barbershop_id", barbershopId)
    .order("weekday", { ascending: true })
    .order("starts_at", { ascending: true });

  return data ?? [];
}

export async function getBlockedSlots(barbershopId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blocked_slots")
    .select("id, barber_id, starts_at, ends_at, reason")
    .eq("barbershop_id", barbershopId)
    .order("starts_at", { ascending: true });

  return data ?? [];
}

export async function getSubscription(barbershopId: string) {
  const supabase = await createClient();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .in("status", ["pending", "trialing", "active", "past_due"])
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

export async function getFinancialOverview(
  barbershopId: string,
  timeZone: string,
  previousMonth: boolean,
) {
  const supabase = await createClient();
  const current = getMonthRange(new Date(), timeZone);
  const period = previousMonth
    ? getMonthRange(new Date(current.start.getTime() - 1), timeZone)
    : current;
  const start = period.start.toISOString();
  const end = period.end.toISOString();

  const pageSize = 500;
  async function readTotals() {
    let paidCents = 0;
    let pendingCents = 0;
    let paidCount = 0;
    let pendingCount = 0;
    const receivedByWeek = [0, 0, 0, 0, 0];

    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("payments")
        .select("amount_cents, status, created_at")
        .eq("barbershop_id", barbershopId)
        .eq("scope", "shop_service")
        .is("subscription_id", null)
        .in("status", ["paid", "pending", "overdue"])
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at")
        .order("id")
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error("Não foi possível consultar os totais do financeiro.");

      for (const payment of data) {
        if (payment.status === "paid") {
          paidCents += payment.amount_cents;
          paidCount++;
          const day = Number(localDateString(payment.created_at, timeZone).slice(-2));
          receivedByWeek[Math.floor((day - 1) / 7)] += payment.amount_cents;
        } else {
          pendingCents += payment.amount_cents;
          pendingCount++;
        }
      }

      if (data.length < pageSize) break;
    }
    return { paidCents, pendingCents, paidCount, pendingCount, receivedByWeek };
  }

  const [totals, recent, history] = await Promise.all([
    readTotals(),
    supabase
      .from("payments")
      .select("id, amount_cents, status, method, created_at, due_date")
      .eq("barbershop_id", barbershopId)
      .eq("scope", "shop_service")
      .is("subscription_id", null)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("appointments")
      .select("id, starts_at, price_cents")
      .eq("barbershop_id", barbershopId)
      .eq("status", "completed")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .order("starts_at", { ascending: false })
      .limit(10),
  ]);
  if (recent.error || history.error) {
    throw new Error("Não foi possível consultar o histórico do financeiro.");
  }

  return { ...totals, recent: recent.data, history: history.data, period };
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

