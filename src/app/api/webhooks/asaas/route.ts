import { NextResponse } from "next/server";

import {
  BillingWebhookError,
  processAsaasEvent,
} from "@/features/billing/webhook";
import {
  asaasWebhookSchema,
  sanitizeAsaasWebhookPayload,
  verifyAsaasWebhookToken,
} from "@/lib/asaas/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxPayloadBytes = 64 * 1024;
const staleProcessingMs = 5 * 60 * 1000;

function json(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export async function POST(request: Request) {
  let authorized = false;

  try {
    authorized = verifyAsaasWebhookToken(
      request.headers.get("asaas-access-token"),
    );
  } catch {
    return json({ error: "Webhook não configurado." }, 500);
  }

  if (!authorized) {
    return json({ error: "Não autorizado." }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > maxPayloadBytes) {
    return json({ error: "Payload muito grande." }, 413);
  }

  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > maxPayloadBytes) {
    return json({ error: "Payload muito grande." }, 413);
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  const parsed = asaasWebhookSchema.safeParse(payload);

  if (!parsed.success) {
    return json({ error: "Evento inválido." }, 400);
  }

  const event = parsed.data;

  let supabase;

  try {
    supabase = createAdminClient();
  } catch {
    return json({ error: "Servidor não configurado." }, 500);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("webhook_events")
    .insert({
      provider: "asaas",
      event_id: event.id,
      event_type: event.event,
      payload: sanitizeAsaasWebhookPayload(payload) as Json,
      status: "received",
    })
    .select("*")
    .single();

  let record = inserted;

  if (insertError || !record) {
    if (insertError?.code !== "23505") {
      return json({ error: "Falha ao registrar o evento." }, 500);
    }

    const { data: existing, error: existingError } = await supabase
      .from("webhook_events")
      .select("*")
      .eq("provider", "asaas")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingError || !existing) {
      return json({ error: "Falha ao registrar o evento." }, 500);
    }

    record = existing;
  }

  if (record.status === "processed" || record.status === "ignored") {
    return json({ received: true, duplicate: true });
  }

  let claimed = false;

  if (record.status === "received" || record.status === "failed") {
    const { data: claimedRow } = await supabase
      .from("webhook_events")
      .update({ status: "processing", error_message: null })
      .eq("id", record.id)
      .in("status", ["received", "failed"])
      .select("id")
      .maybeSingle();

    claimed = Boolean(claimedRow);
  } else if (record.status === "processing") {
    const cutoff = new Date(Date.now() - staleProcessingMs).toISOString();
    const { data: claimedRow } = await supabase
      .from("webhook_events")
      .update({ status: "processing", error_message: null })
      .eq("id", record.id)
      .eq("status", "processing")
      .lt("updated_at", cutoff)
      .select("id")
      .maybeSingle();

    claimed = Boolean(claimedRow);
  }

  if (!claimed) {
    return json(
      { error: "Evento em processamento." },
      503,
      { "Retry-After": "5" },
    );
  }

  try {
    const outcome = await processAsaasEvent(supabase, event);

    await supabase
      .from("webhook_events")
      .update({
        status: outcome,
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", record.id);

    return json({ received: true });
  } catch (error) {
    const message =
      error instanceof BillingWebhookError
        ? error.message.slice(0, 300)
        : "Falha interna ao processar o evento.";

    await supabase
      .from("webhook_events")
      .update({ status: "failed", error_message: message })
      .eq("id", record.id);

    return json({ error: "Falha ao processar o evento." }, 500);
  }
}
