import { NextResponse } from "next/server";

import { verifyBillingCronRequest } from "@/features/billing/cron-auth";
import { processRemoteCleanupJobs } from "@/features/billing/compensation";
import { isAsaasConfigured } from "@/lib/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// O lote é pequeno e cada job faz no máximo uma verificação remota + remoção.
export const maxDuration = 60;

/**
 * Schedule recomendado para ativação operacional posterior:
 *   GET /api/cron/billing-compensation a cada 5 minutos.
 *
 * Não adicione um agendamento de produção nesta etapa. A ativação deve ser
 * revisada junto com a migration e com o segredo BILLING_CRON_SECRET (ou o
 * CRON_SECRET padrão da Vercel). A rota é idempotente e segura para chamadas
 * repetidas; o lease da outbox impede dois workers de processarem o mesmo job.
 */
function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function parseLimit(request: Request): number | undefined {
  try {
    const raw = new URL(request.url).searchParams.get("limit");

    if (raw === null || raw.trim().length === 0) {
      return undefined;
    }

    const value = Number(raw);

    return Number.isInteger(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function handle(request: Request) {
  if (!verifyBillingCronRequest(request.headers)) {
    return json({ error: "Não autorizado." }, 401);
  }

  if (!isAsaasConfigured()) {
    return json(
      { error: "Asaas Sandbox não configurado neste ambiente." },
      503,
    );
  }

  try {
    const summary = await processRemoteCleanupJobs({
      limit: parseLimit(request),
    });

    return json({
      ok: true,
      candidates: summary.candidates,
      claimed: summary.claimed,
      completed: summary.completed,
      retry: summary.retry,
      manualReview: summary.manualReview,
      failed: summary.failed,
    });
  } catch {
    return json(
      { error: "Falha ao processar a compensação remota." },
      500,
    );
  }
}

// GET é compatível com o Vercel Cron; POST atende agendadores externos.
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
