import "server-only";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireFinancialAdmin } from "@/lib/auth/financial-admin";
import { currentMonth, month, uuid } from "./validation";

const nullable = z.string().nullable();
const cents = z.number().int().nullable();
const shopRow = z.object({
  shop: uuid,
  name: z.string(),
  owner: nullable,
  contact: nullable,
  plan: nullable,
  origin: z.string(),
  contract: uuid.nullable(),
  status: nullable,
  monthly_cents: cents,
  automatic_trial: z.boolean().optional(),
  automatic_trial_state: z.enum(["running", "ended", "converted"]).nullable().optional(),
  automatic_trial_days: cents.optional(),
  automatic_trial_plan: nullable.optional(),
  trial_start: nullable,
  trial_end: nullable,
  last_verified_at: nullable,
  coverage_start: nullable,
  first_competence: nullable,
  first_due_at: nullable,
  due_day: cents,
  renewal_anchor_day: cents,
  contract_timezone: nullable,
  current_period_start: nullable,
  current_period_end: nullable,
  suspended: z.boolean(),
});
const invoiceRow = z.object({
  id: uuid,
  shop: uuid,
  contract: uuid,
  shop_name: z.string(),
  plan: nullable,
  month: z.string(),
  state: z.string(),
  original_cents: cents,
  adjustment_cents: cents,
  reason: nullable,
  total_cents: z.number().int(),
  due_at: z.string(),
  paid_at: nullable,
  verified_at: nullable,
});
export type Shop = z.infer<typeof shopRow>;
export type Invoice = z.infer<typeof invoiceRow>;
export const size = 20;
export type Params = Record<string, string | string[] | undefined>;
export type PageProps = { searchParams: Promise<Params> };
export function param(q: Params, key: string) {
  const value = q[key];
  if (Array.isArray(value) || (value && value.length > 200)) notFound();
  return value || null;
}
function validated<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) notFound();
  return result.data;
}
export function selectedMonth(q: Params) {
  return validated(month, param(q, "mes") ?? currentMonth());
}
export function optionalId(q: Params, key: string) {
  const raw = param(q, key);
  return raw === null ? null : validated(uuid, raw);
}
export function pageURL(
  path: string,
  q: Params,
  changes: Record<string, string | null>,
) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...q, ...changes }))
    if (typeof v === "string" && v) search.set(k, v);
  return path + (search.size ? "?" + search : "");
}
function read<T>(
  response: { data: unknown; error: { code?: string } | null },
  schema: z.ZodType<T>,
) {
  if (response.error?.code === "42501") redirect("/admin/acesso-negado");
  const parsed = schema.safeParse(response.data);
  if (response.error || !parsed.success)
    throw new Error("Consulta financeira indisponível.");
  return parsed.data;
}
export async function directory(q: Params, id?: string) {
  const { db } = await requireFinancialAdmin();
  const query = validated(z.string().max(80).nullable(), param(q, "nome"));
  const origin = validated(
    z.enum(["manual", "trial", "asaas", "none", "reconcile"]).nullable(),
    param(q, "origem"),
  );
  const rows = read(
    await db.rpc("finance_directory", {
      shop_id: id ? validated(uuid, id) : null,
      name_prefix: query,
      origin_filter: origin,
      after_id: optionalId(q, "apos"),
      page_size: id ? 1 : size + 1,
    }),
    z.array(shopRow),
  );
  const observed = Date.now();
  return rows.map((row) => ({
    ...row,
    status:
      row.origin === "trial" &&
      row.status === "trialing" &&
      row.trial_end &&
      Date.parse(row.trial_end) <= observed
        ? "expired"
        : row.status,
  }));
}
export async function invoices(q: Params, shop: string | null) {
  const { db } = await requireFinancialAdmin();
  const state = validated(
    z.enum(["pending", "paid", "overdue", "cancelled"]).nullable(),
    param(q, "situacao"),
  );
  const m = shop && !param(q, "mes") ? null : selectedMonth(q) + "-01";
  return read(
    await db.rpc("finance_invoices", {
      shop,
      bill_month: m,
      state,
      after_id: optionalId(q, "parcela"),
      page_size: size + 1,
    }),
    z.array(invoiceRow),
  );
}
export async function overview(m: string) {
  const { db } = await requireFinancialAdmin();
  return read(
    await db.rpc("finance_overview", { bill_month: m + "-01" }),
    z.object({
      shops: z.int(),
      active: z.int(),
      pending: z.int(),
      past_due: z.int(),
      pending_invoices: z.int(),
      overdue_invoices: z.int(),
      received_cents: z.int(),
      open_cents: z.int(),
    }),
  );
}
export async function operators(q: Params) {
  const { db } = await requireFinancialAdmin(true);
  return read(
    await db.rpc("finance_operator_list", {
      after_id: optionalId(q, "apos"),
      page_size: size + 1,
    }),
    z.array(
      z.object({
        id: uuid,
        user_id: uuid,
        level: z.enum(["operator", "manager"]),
        granted_at: z.string(),
        revoked_at: nullable,
      }),
    ),
  );
}
export async function plans() {
  const { db } = await requireFinancialAdmin();
  return read(
    await db
      .from("plans")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    z.array(z.object({ id: uuid, name: z.string() })),
  );
}
export async function recentActivity(shop: string) {
  const { db } = await requireFinancialAdmin();
  const [history, events] = await Promise.all([
    db.rpc("finance_history", { shop, page_size: 5 }),
    db.rpc("finance_events", { shop, page_size: 5 }),
  ]);
  return {
    history: read(
      history,
      z.array(
        z.object({
          op: uuid,
          at: z.string(),
          actor: nullable,
          action: z.string(),
          reason: nullable,
          result: z.object({
            action: z.string().optional(),
            after: z.string().optional(),
            state: z.string().optional(),
            invoice: uuid.optional(),
            contract: uuid.optional(),
          }),
        }),
      ),
    ),
    events: read(
      events,
      z.array(
        z.object({
          id: uuid,
          at: z.string(),
          actor: nullable,
          action: z.string(),
          state: nullable,
          entity: nullable,
        }),
      ),
    ),
  };
}
export async function activity(q: Params) {
  const { db } = await requireFinancialAdmin();
  const source = validated(
    z.enum(["journal", "events"]),
    param(q, "fonte") ?? "journal",
  );
  const day = (key: string) => {
    const v = param(q, key);
    return v ? validated(z.iso.date(), v) : null;
  };
  const start = day("de"),
    end = day("ate");
  if (start && end && start > end) notFound();
  const time = param(q, "antes"),
    id = optionalId(q, "apos");
  if (Boolean(time) !== Boolean(id)) notFound();
  return read(
    await db.rpc("finance_activity", {
      source_name: source,
      tenant: optionalId(q, "barbearia"),
      who: optionalId(q, "operador"),
      kind: param(q, "acao"),
      since_at: start ? start + "T00:00:00Z" : null,
      until_at: end
        ? new Date(Date.parse(end + "T00:00:00Z") + 86400000).toISOString()
        : null,
      before_id: id,
      before_at: time
        ? validated(z.iso.datetime({ offset: true }), time)
        : null,
      page_size: size + 1,
    }),
    z.array(
      z.object({
        id: uuid,
        at: z.string(),
        shop: uuid,
        actor: nullable,
        action: z.string(),
        contract: nullable,
        invoice: nullable,
        state: nullable,
        reason: nullable,
      }),
    ),
  );
}
