import { z } from "zod";
import { formatCurrencyFromCents } from "@/lib/format";

export const uuid = z.uuid();
export const month = z
  .string()
  .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, "Informe uma competência válida.");
const utcInput = z
  .string()
  .regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/)
  .transform((value) => value + ":00Z")
  .pipe(z.iso.datetime());
const amount = z
  .string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d{0,7})(?:,\d{1,2})?$/,
    "Use reais e vírgula, sem separador de milhares.",
  )
  .transform((value) => {
    const [reais, fraction = ""] = value.split(",");
    return Number(reais) * 100 + Number(fraction.padEnd(2, "0"));
  })
  .pipe(z.number().int().min(1).max(2147483647));
const reason = z.string().trim().min(1).max(300);
const day = z
  .string()
  .regex(/^(?:[1-9]|[12]\d|3[01])$/)
  .transform(Number);
const base = { op: uuid, confirmed: z.literal(true) };
const contract = { ...base, shop: uuid, contract: uuid };
export const operation = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("agreement"),
    shop: uuid,
    plan: uuid,
    amount: amount.pipe(z.number().max(100000000)),
    coverage: utcInput,
    first_month: month,
    due: utcInput,
    renewal_day: day,
    due_day: day,
    offset: z
      .string()
      .regex(/^-?\d{1,5}$/)
      .transform(Number)
      .pipe(z.number().int().min(-32768).max(32767)),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    zone: z
      .string()
      .min(1)
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("pt-BR", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
    terms: z.string().trim().min(1).max(4000),
    reference: z.string().trim().min(1).max(120),
    reason,
  }),
  z.object({ ...contract, kind: z.literal("invoice"), month }),
  z.object({
    ...contract,
    kind: z.literal("pix"),
    invoice: uuid,
    amount,
    credit: utcInput,
    checked: z.literal(true),
    reference: z
      .string()
      .trim()
      .regex(/^(?:[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119})?$/),
  }),
  z.object({
    ...contract,
    kind: z.literal("contract"),
    command: z.enum(["suspend", "resume", "cancel"]),
    reason,
  }),
  z.object({
    ...base,
    kind: z.literal("operator"),
    target: uuid,
    permission: z.enum(["operator", "manager", "revoke"]),
    reason,
  }),
]);
export type Operation = z.output<typeof operation>;
export type Kind = Operation["kind"];
export const adminPath = "/admin/assinaturas";
export const originLabels: Record<string, string> = {
  manual: "Contrato manual",
  trial: "Trial manual",
  asaas: "Asaas legado",
  none: "Sem contrato",
  reconcile: "Conciliar",
};
export const labels: Record<string, string> = {
  active: "Ativo",
  pending: "Pendente",
  past_due: "Em atraso",
  canceled: "Cancelado",
  expired: "Expirado",
  trialing: "Em teste",
  paid: "Paga",
  overdue: "Vencida",
  cancelled: "Cancelada",
  suspended: "Suspensa",
  agreement: "Acordo",
  issue: "Emissão",
  confirm_pix: "Conferência de Pix",
  suspend: "Suspensão",
  resume: "Retomada",
  cancel: "Cancelamento",
  manager: "Gestor",
  operator: "Operador",
  revoke: "Revogar",
  "manual_billing.invoice": "Mensalidade",
  "manual_billing.agreement": "Acordo registrado",
  "manual_billing.past_due": "Processamento de atraso",
  "manual_billing.extension": "Extensão histórica",
};
export function money(cents: number | null) {
  return cents == null ? "—" : formatCurrencyFromCents(cents);
}
export function instant(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value)) + " (Brasília)"
    : "—";
}
export function period(value: string | null) {
  return value ? value.slice(5, 7) + "/" + value.slice(0, 4) : "—";
}
export function currentMonth() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}
