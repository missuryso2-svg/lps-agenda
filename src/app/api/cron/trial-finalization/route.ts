import { NextResponse } from "next/server";

import { verifyBillingCronRequest } from "@/features/billing/cron-auth";
import { finalizeExpiredTrials } from "@/features/billing/trial";
import { isAsaasConfigured } from "@/lib/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Dá margem para finalizar um lote pequeno de trials em uma única invocação.
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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
    const summary = await finalizeExpiredTrials();

    return json({
      ok: true,
      candidates: summary.candidates,
      claimed: summary.claimed,
      created: summary.created,
      failed: summary.failed,
      skipped: summary.skipped,
    });
  } catch {
    return json({ error: "Falha ao finalizar os testes vencidos." }, 500);
  }
}

// GET é compatível com o Vercel Cron; POST atende agendadores externos.
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
