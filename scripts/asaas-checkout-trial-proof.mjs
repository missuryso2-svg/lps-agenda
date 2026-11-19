#!/usr/bin/env node

/**
 * Isolated proof only. This file is not imported by the app or billing flow.
 * Default mode is fully offline. --execute-sandbox performs one read-only
 * Supabase plan lookup and at most one POST to the fixed Asaas Sandbox URL.
 */

import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { deflateSync } from "node:zlib";
import { domainToASCII } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  getAsaasEnv,
  getServiceRoleKey,
} from "../src/lib/env/server.ts";
import { getSupabasePublicEnv } from "../src/lib/env/public.ts";

const SANDBOX_API_BASE = "https://api-sandbox.asaas.com/v3";
const CHECKOUT_EXPIRATION_MINUTES = 60;
const TRIAL_DAYS = 7;
const TIME_ZONE = "America/Sao_Paulo";
const OFFLINE_CALLBACK_ORIGIN = "http://localhost:3000";
const NON_PUBLIC_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".home.arpa",
  ".test",
  ".invalid",
  ".example",
  ".onion",
];

function usage() {
  return [
    "Uso (simulação offline):",
    "  node --conditions=react-server --experimental-strip-types scripts/asaas-checkout-trial-proof.mjs --plan-code basico",
    "",
    "Execução explícita no Sandbox (cria apenas um Checkout):",
    "  node --conditions=react-server --experimental-strip-types scripts/asaas-checkout-trial-proof.mjs --plan-code basico --execute-sandbox --confirm-date-semantics --next-due-date-format date --show-checkout-link",
    "",
    "Opções:",
    "  --plan-code <code>       Código de plano ativo do catálogo (obrigatório).",
    "  --trial-start <ISO-8601> Início de referência do trial; padrão: agora.",
    "  --execute-sandbox        Autoriza a leitura do plano e o POST no Sandbox.",
    "  --confirm-date-semantics Confirma que o formato/horário ainda não foi comprovado.",
    "  --next-due-date-format   date (OpenAPI) ou guide-datetime (exemplo do guia).",
    "  --show-checkout-link     Exibe o link temporário retornado pelo Sandbox.",
    "  --help                   Mostra esta ajuda.",
  ].join("\n");
}

function parseArgs(argv) {
  const parsed = {
    planCode: null,
    trialStart: null,
    executeSandbox: false,
    confirmDateSemantics: false,
    nextDueDateFormat: "date",
    nextDueDateFormatProvided: false,
    showCheckoutLink: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--execute-sandbox") {
      parsed.executeSandbox = true;
      continue;
    }

    if (arg === "--confirm-date-semantics") {
      parsed.confirmDateSemantics = true;
      continue;
    }

    if (arg === "--show-checkout-link") {
      parsed.showCheckoutLink = true;
      continue;
    }

    if (
      arg === "--plan-code" ||
      arg === "--trial-start" ||
      arg === "--next-due-date-format"
    ) {
      const value = argv[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error(`Informe um valor para ${arg}.`);
      }

      if (arg === "--plan-code") {
        parsed.planCode = value;
      } else if (arg === "--trial-start") {
        parsed.trialStart = value;
      } else {
        parsed.nextDueDateFormat = value;
        parsed.nextDueDateFormatProvided = true;
      }

      index += 1;
      continue;
    }

    throw new Error(`Opção desconhecida: ${arg}`);
  }

  if (parsed.showCheckoutLink && !parsed.executeSandbox) {
    throw new Error("--show-checkout-link só pode ser usado com --execute-sandbox.");
  }

  if (parsed.executeSandbox && !parsed.confirmDateSemantics) {
    throw new Error(
      "A documentação diverge sobre nextDueDate; revise a semântica e passe --confirm-date-semantics.",
    );
  }

  if (parsed.executeSandbox && !parsed.nextDueDateFormatProvided) {
    throw new Error(
      "Escolha explicitamente --next-due-date-format date ou guide-datetime para a prova Sandbox.",
    );
  }

  if (
    parsed.nextDueDateFormat !== "date" &&
    parsed.nextDueDateFormat !== "guide-datetime"
  ) {
    throw new Error("--next-due-date-format deve ser date ou guide-datetime.");
  }

  if (!parsed.help && !parsed.planCode) {
    throw new Error("Informe --plan-code com um código do catálogo.");
  }

  if (
    parsed.planCode &&
    !/^[a-z0-9_-]{2,40}$/.test(parsed.planCode)
  ) {
    throw new Error("O código do plano tem formato inválido.");
  }

  return parsed;
}

function parseTrialStart(value) {
  if (!value) {
    return new Date();
  }

  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new Error("--trial-start deve incluir Z ou um offset explícito, como -03:00.");
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new Error("--trial-start não é uma data ISO-8601 válida.");
  }

  return date;
}

function addTrialDays(start) {
  // Segue a mesma duração absoluta de sete dias usada pelo trial atual.
  return new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

function dateOnlyInSaoPaulo(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function dateTimeInSaoPaulo(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function nextDueDateValue(trialEnd, format) {
  return format === "guide-datetime"
    ? dateTimeInSaoPaulo(trialEnd)
    : dateOnlyInSaoPaulo(trialEnd);
}

function callbackUrls(origin) {
  return {
    successUrl: new URL(
      "/dashboard/plano?asaasCheckout=success",
      origin,
    ).toString(),
    cancelUrl: new URL(
      "/dashboard/plano?asaasCheckout=cancelled",
      origin,
    ).toString(),
    expiredUrl: new URL(
      "/dashboard/plano?asaasCheckout=expired",
      origin,
    ).toString(),
  };
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBytes, data]);
  let crc = 0xffffffff;

  for (const byte of crcInput) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }

  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);

  return Buffer.concat([length, typeBytes, data, checksum]);
}

function checkoutItemImageBase64() {
  // The current Checkout OpenAPI marks imageBase64 as required. A neutral 1x1
  // PNG is used only for this isolated proof; it contains no user information.
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA

  const pixel = deflateSync(Buffer.from([0, 0x30, 0x30, 0x30, 0xff]));
  const png = Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", pixel),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);

  return png.toString("base64");
}

function printSimulation({
  planCode,
  trialStart,
  trialEnd,
  nextDueDate,
  nextDueDateFormat,
  callbacks,
}) {
  console.log(
    JSON.stringify(
      {
        mode: "simulation-offline",
        endpoint: `${SANDBOX_API_BASE}/checkouts`,
        networkRequests: 0,
        planCode,
        planPrice: "not looked up in simulation; read from active Supabase catalog only with --execute-sandbox",
        trialStartAt: trialStart.toISOString(),
        trialEndAt: trialEnd.toISOString(),
        nextDueDate,
        nextDueDateFormat,
        nextDueDatePrecision:
          nextDueDateFormat === "date"
            ? "date-only in America/Sao_Paulo; no time of day is encoded"
            : "guide example format: Sao Paulo wall-clock time without an offset; timezone handling is unverified",
        checkout: {
          billingTypes: ["CREDIT_CARD"],
          chargeTypes: ["RECURRENT"],
          minutesToExpire: CHECKOUT_EXPIRATION_MINUTES,
          customer: "existing Sandbox customer ID from secure environment at execution time",
          externalReference: "a fresh opaque UUID is generated for each explicit execution",
          subscription: { cycle: "MONTHLY", nextDueDate },
          callback: callbacks,
          cardData: "not collected, transmitted, or stored by this script",
        },
      },
      null,
      2,
    ),
  );
}

async function loadActiveMonthlyTrialPlan(planCode) {
  const supabaseEnv = getSupabasePublicEnv();

  if (!supabaseEnv) {
    throw new Error("Supabase não está configurado no ambiente de execução.");
  }

  let serviceRoleKey;

  try {
    serviceRoleKey = getServiceRoleKey();
  } catch {
    throw new Error("A leitura do catálogo exige a configuração server-side existente.");
  }

  const supabase = createClient(
    supabaseEnv.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );

  const { data, error } = await supabase
    .from("plans")
    .select("id, code, name, price_cents, interval, currency, trial_days, is_active")
    .eq("code", planCode)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Não foi possível obter o plano ativo do catálogo.");
  }

  if (
    data.trial_days !== TRIAL_DAYS ||
    data.interval !== "month" ||
    data.currency !== "BRL" ||
    !Number.isInteger(data.price_cents) ||
    data.price_cents <= 0
  ) {
    throw new Error(
      "A prova exige um plano ativo BRL, mensal, com trial de sete dias e preço positivo.",
    );
  }

  return data;
}

function validatePublicCallbackOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configured) {
    throw new Error("Configure NEXT_PUBLIC_APP_URL com o domínio público do projeto.");
  }

  let url;

  try {
    url = new URL(configured);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL não é uma URL válida.");
  }

  if (url.protocol !== "https:") {
    throw new Error("A execução Sandbox exige callbacks do projeto em HTTPS público.");
  }

  if (url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("NEXT_PUBLIC_APP_URL não pode conter credenciais nem porta não padrão.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const ipHostname = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;

  if (isIP(ipHostname) !== 0) {
    throw new Error("NEXT_PUBLIC_APP_URL deve usar domínio público, não endereço IP.");
  }

  const asciiHostname = domainToASCII(hostname);

  if (!asciiHostname || asciiHostname.length > 253) {
    throw new Error("NEXT_PUBLIC_APP_URL não contém hostname válido.");
  }

  const labels = asciiHostname.split(".");
  const validLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  if (
    labels.length < 2 ||
    labels.some((label) => !validLabel.test(label)) ||
    labels.at(-1).length < 2 ||
    !/[a-z]/i.test(labels.at(-1)) ||
    NON_PUBLIC_HOST_SUFFIXES.some(
      (suffix) => asciiHostname === suffix.slice(1) || asciiHostname.endsWith(suffix),
    )
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL deve usar hostname DNS válido, não localhost ou sufixo reservado/local.");
  }

  return url.origin;
}

function validateSandboxCustomerId() {
  const customerId = process.env.ASAAS_CHECKOUT_PROOF_CUSTOMER_ID?.trim();

  if (!customerId || customerId.length > 120 || /\s/.test(customerId)) {
    throw new Error(
      "Configure ASAAS_CHECKOUT_PROOF_CUSTOMER_ID com um customer de teste existente no Sandbox.",
    );
  }

  return customerId;
}

function checkoutPayload(plan, customerId, externalReference, nextDueDate, callbacks) {
  return {
    billingTypes: ["CREDIT_CARD"],
    chargeTypes: ["RECURRENT"],
    minutesToExpire: CHECKOUT_EXPIRATION_MINUTES,
    externalReference,
    customer: customerId,
    callback: callbacks,
    items: [
      {
        imageBase64: checkoutItemImageBase64(),
        name: plan.name.slice(0, 30),
        description: `LPS Agenda — ${plan.name}`.slice(0, 150),
        quantity: 1,
        value: Number((plan.price_cents / 100).toFixed(2)),
      },
    ],
    subscription: {
      cycle: "MONTHLY",
      nextDueDate,
    },
  };
}

async function createSandboxCheckout(payload, apiKey) {
  const response = await fetch(`${SANDBOX_API_BASE}/checkouts`, {
    method: "POST",
    headers: {
      access_token: apiKey,
      "Content-Type": "application/json",
      "User-Agent": "lps-agenda-checkout-trial-proof/1.0.0",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
    redirect: "error",
  });

  if (!response.ok) {
    // Consume but never print the provider body; do not retry an uncertain POST.
    await response.text().catch(() => "");
    throw new Error(`Asaas Sandbox recusou a criação do Checkout (HTTP ${response.status}).`);
  }

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("Resposta inesperada do Asaas Sandbox; verifique o Checkout pela referência.");
  }

  if (
    !result ||
    typeof result !== "object" ||
    typeof result.id !== "string" ||
    typeof result.link !== "string"
  ) {
    throw new Error("Resposta sem ID/link de Checkout; verifique o Sandbox antes de tentar novamente.");
  }

  let link;

  try {
    link = new URL(result.link);
  } catch {
    throw new Error("O Sandbox retornou um link de Checkout inválido; não o abra.");
  }

  if (
    link.protocol !== "https:" ||
    link.hostname !== "sandbox.asaas.com" ||
    link.username ||
    link.password
  ) {
    throw new Error("O link retornado não aponta ao host esperado do Checkout Sandbox.");
  }

  return {
    id: result.id,
    status: typeof result.status === "string" ? result.status : "unknown",
    link: link.toString(),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  const trialStart = parseTrialStart(args.trialStart);
  const trialEnd = addTrialDays(trialStart);
  const nextDueDate = nextDueDateValue(trialEnd, args.nextDueDateFormat);

  if (!args.executeSandbox) {
    printSimulation({
      planCode: args.planCode,
      trialStart,
      trialEnd,
      nextDueDate,
      nextDueDateFormat: args.nextDueDateFormat,
      callbacks: callbackUrls(OFFLINE_CALLBACK_ORIGIN),
    });
    return;
  }

  let asaasEnv;

  try {
    asaasEnv = getAsaasEnv();
  } catch {
    throw new Error("A configuração existente do Asaas Sandbox está ausente ou inválida.");
  }

  if (asaasEnv.environment !== "sandbox") {
    throw new Error("Execução bloqueada: somente Sandbox é permitido.");
  }

  if (!args.confirmDateSemantics) {
    throw new Error(
      "A documentação diverge sobre nextDueDate. Para um teste Sandbox, revise a semântica e passe --confirm-date-semantics explicitamente.",
    );
  }

  if (process.env.VERCEL_ENV?.trim().toLowerCase() === "production") {
    throw new Error("Execução bloqueada em runtime Vercel de produção.");
  }

  const now = new Date();
  const todayInSaoPaulo = dateOnlyInSaoPaulo(now);
  const dueDateDay = nextDueDate.slice(0, 10);

  if (trialStart.getTime() > now.getTime() || trialEnd.getTime() <= now.getTime()) {
    throw new Error(
      "A execução exige um trial já iniciado e com fim ainda futuro; informe um início que mantenha a primeira data de vencimento futura.",
    );
  }

  if (dueDateDay <= todayInSaoPaulo) {
    throw new Error(
      "nextDueDate cai hoje ou no passado em America/Sao_Paulo; o Asaas pode processar a primeira cobrança imediatamente.",
    );
  }

  const callbackOrigin = validatePublicCallbackOrigin();
  const callbacks = callbackUrls(callbackOrigin);
  const customerId = validateSandboxCustomerId();
  const plan = await loadActiveMonthlyTrialPlan(args.planCode);
  const externalReference = randomUUID();
  const payload = checkoutPayload(
    plan,
    customerId,
    externalReference,
    nextDueDate,
    callbacks,
  );

  console.log(
    JSON.stringify(
      {
        mode: "execute-sandbox",
        endpoint: `${SANDBOX_API_BASE}/checkouts`,
        plan: {
          code: plan.code,
          name: plan.name,
          priceCents: plan.price_cents,
          currency: plan.currency,
          cycle: plan.interval,
        },
        trialStartAt: trialStart.toISOString(),
        trialEndAt: trialEnd.toISOString(),
        nextDueDate,
        nextDueDateFormat: args.nextDueDateFormat,
        externalReference,
        note: "A referência é necessária para reconciliar um resultado incerto; nenhuma credencial ou dado de cartão é exibido.",
      },
      null,
      2,
    ),
  );

  let checkout;

  try {
    checkout = await createSandboxCheckout(payload, asaasEnv.apiKey);
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "timeout: o resultado remoto é incerto"
        : error instanceof Error
          ? error.message
          : "falha sem detalhes";

    throw new Error(
      `${reason}. Não reenvie automaticamente. Consulte o Sandbox por externalReference ${externalReference}.`,
    );
  }

  const output = {
    checkoutId: checkout.id,
    checkoutStatus: checkout.status,
    externalReference,
    planCode: plan.code,
    priceCents: plan.price_cents,
    trialStartAt: trialStart.toISOString(),
    trialEndAt: trialEnd.toISOString(),
    nextDueDate,
    checkoutLink: args.showCheckoutLink
      ? checkout.link
      : "oculto; use o checkoutId para consultar no Sandbox",
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Falha na prova técnica.";
  console.error(message);
  process.exitCode = 1;
});
