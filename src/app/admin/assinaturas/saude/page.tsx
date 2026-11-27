import { z } from "zod";
import { requireFinancialAdmin } from "@/lib/auth/financial-admin";
import { manualTrialOnboardingEnabled } from "@/lib/env/server";
import { FinanceHeading } from "@/features/admin-billing/presentation";

const count = z.number().int().nonnegative();
const healthSchema = z.object({
  worker_enabled: z.boolean(),
  trial_db: z.boolean(),
  worker_state: z.enum(["disabled", "waiting", "stale", "healthy"]),
  last_result: z.enum(["ok", "partial", "failed"]).nullable(),
  last_run_at: z.iso.datetime({ offset: true }).nullable(),
  last_ok: z.iso.datetime({ offset: true }).nullable(),
  oldest_eligible_minutes: count.nullable(),
  processed_24h: count,
  failures_24h: count,
  retries: count,
  past_due: count,
  review: count,
  mixed: count,
  duplicate_current: count,
  cleanup: count,
  webhook_backlog: count,
});
const states = {
  disabled: "Desligado",
  waiting: "Aguardando primeira execução",
  stale: "Sem sucesso há mais de 15 minutos",
  healthy: "Em dia",
};
const results = { ok: "Concluída", partial: "Falha parcial", failed: "Falhou" };

function time(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value))
    : "Sem registro";
}

export default async function Health() {
  const { db } = await requireFinancialAdmin();
  const { data, error } = await db.rpc("finance_health");
  const parsed = healthSchema.safeParse(data);
  if (error || !parsed.success) {
    return (
      <>
        <FinanceHeading title="Saúde financeira" />
        <p className="fa-guidance" role="status">Não foi possível consultar os indicadores da carteira.</p>
      </>
    );
  }
  const h = parsed.data;
  const metrics = [
    ["Worker de inadimplência", states[h.worker_state]],
    ["Última execução · horário de Brasília", time(h.last_run_at)],
    [
      "Resultado da última execução",
      h.last_result ? results[h.last_result] : "Sem registro",
    ],
    ["Último sucesso · horário de Brasília", time(h.last_ok)],
    ["Execuções com falha nas últimas 24 h", h.failures_24h],
    ["Itens processados nas últimas 24 h", h.processed_24h],
    [
      "Idade da parcela elegível mais antiga",
      h.oldest_eligible_minutes === null
        ? "Fila vazia"
        : h.oldest_eligible_minutes + " min",
    ],
    ["Parcelas na fila de retentativas", h.retries],
    ["Contratos manuais em atraso", h.past_due],
    ["Contratos marcados para conciliação", h.review],
    ["Barbearias com histórico de ambas as origens", h.mixed],
    ["Barbearias com contratos vigentes duplicados", h.duplicate_current],
    ["Compensações Asaas abertas", h.cleanup],
    ["Eventos Asaas pendentes ou com falha", h.webhook_backlog],
    [
      "Onboarding no servidor",
      manualTrialOnboardingEnabled() ? "Ligado" : "Desligado",
    ],
    ["Onboarding no banco", h.trial_db ? "Ligado" : "Desligado"],
  ] as const;
  return (
    <>
      <FinanceHeading title="Saúde financeira" description="Acompanhe a carteira, a fila de inadimplência e o processamento financeiro." />
      <section className="fa-panel" aria-labelledby="health-heading">
        <header className="fa-section-head"><div><h2 id="health-heading">Monitoramento</h2><p>Indicadores operacionais e últimas execuções registradas.</p></div></header>
        <dl className="fa-metrics fa-health">
        {metrics.map(([label, value]) => (
          <div className="fa-metric" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        </dl>
      </section>
    </>
  );
}
