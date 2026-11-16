import "server-only";

import { getAsaasEnv } from "@/lib/env/server";

const sandboxBaseUrl = "https://api-sandbox.asaas.com/v3";
const defaultTimeoutMs = 20_000;

export type AsaasBillingType = "BOLETO" | "PIX";
export type AsaasCycle = "MONTHLY" | "YEARLY";
export type AsaasSubscriptionStatus = "ACTIVE" | "EXPIRED" | "INACTIVE";

export type AsaasErrorKind =
  | "config"
  | "unauthorized"
  | "rate_limited"
  | "validation"
  | "not_found"
  | "unavailable"
  | "timeout"
  | "invalid_response";

export class AsaasError extends Error {
  constructor(
    public readonly kind: AsaasErrorKind,
    message: string,
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AsaasError";
  }
}

export function isAsaasTransientError(error: unknown): boolean {
  return (
    error instanceof AsaasError &&
    (error.kind === "timeout" ||
      error.kind === "unavailable" ||
      error.kind === "rate_limited" ||
      error.kind === "invalid_response")
  );
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
};

type AsaasList<T> = {
  data: T[];
  totalCount?: number;
  hasMore?: boolean;
};

export type AsaasCustomer = {
  id: string;
  name?: string;
  cpfCnpj?: string;
  email?: string | null;
  deleted?: boolean;
};

export type AsaasSubscription = {
  id: string;
  customer?: string;
  billingType?: string;
  cycle?: string;
  value?: number;
  nextDueDate?: string;
  status?: AsaasSubscriptionStatus;
  description?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
};

export type CreateAsaasCustomerInput = {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  phone?: string | null;
  externalReference?: string;
};

export type CreateAsaasSubscriptionInput = {
  customer: string;
  billingType: AsaasBillingType;
  valueCents: number;
  nextDueDate: string;
  cycle: AsaasCycle;
  description: string;
  externalReference: string;
};

export type UpdateAsaasSubscriptionInput = {
  billingType?: AsaasBillingType;
  valueCents?: number;
  nextDueDate?: string;
  cycle?: AsaasCycle;
  description?: string;
  updatePendingPayments?: boolean;
};

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

function extractErrors(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || !("errors" in payload)) {
    return [];
  }

  const errors = (payload as { errors?: unknown }).errors;

  if (!Array.isArray(errors)) {
    return [];
  }

  return errors
    .map((error) => {
      if (error && typeof error === "object" && "description" in error) {
        const description = (error as { description?: unknown }).description;
        return typeof description === "string" ? description.trim() : "";
      }

      return "";
    })
    .filter((description) => description.length > 0)
    .slice(0, 3);
}

function validationMessage(payload: unknown): string {
  const descriptions = extractErrors(payload);

  if (descriptions.length === 0) {
    return "O Asaas recusou a operação. Revise os dados e tente novamente.";
  }

  return `O Asaas recusou a operação: ${descriptions.join("; ").slice(0, 300)}`;
}

async function asaasRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let environment;

  try {
    environment = getAsaasEnv();
  } catch {
    throw new AsaasError(
      "config",
      "Pagamento online não configurado neste ambiente.",
    );
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;

  try {
    response = await fetch(`${sandboxBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        access_token: environment.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "lps-agenda/0.1.0",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    if (controller.signal.aborted) {
      throw new AsaasError(
        "timeout",
        "O Asaas demorou para responder. Tente novamente em instantes.",
      );
    }

    throw new AsaasError(
      "unavailable",
      "Não foi possível conectar ao Asaas. Tente novamente em instantes.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401 || response.status === 403) {
    throw new AsaasError(
      "unauthorized",
      "As credenciais do Asaas foram recusadas. Verifique a configuração do ambiente.",
      401,
    );
  }

  if (response.status === 404) {
    throw new AsaasError(
      "not_found",
      "O recurso não foi encontrado no Asaas.",
      404,
    );
  }

  if (response.status === 429) {
    throw new AsaasError(
      "rate_limited",
      "O limite de requisições do Asaas foi atingido. Tente novamente em instantes.",
      429,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }

  if (response.status >= 500) {
    throw new AsaasError(
      "unavailable",
      "O Asaas está indisponível no momento. Tente novamente em instantes.",
      response.status,
    );
  }

  let rawBody = "";

  try {
    rawBody = await response.text();
  } catch {
    throw new AsaasError(
      "invalid_response",
      "O Asaas retornou uma resposta inválida.",
      response.status,
    );
  }

  let payload: unknown = null;

  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new AsaasError(
        "invalid_response",
        "O Asaas retornou uma resposta inválida.",
        response.status,
      );
    }
  }

  if (!response.ok) {
    throw new AsaasError(
      "validation",
      validationMessage(payload),
      response.status,
    );
  }

  if (payload === null || typeof payload !== "object") {
    throw new AsaasError(
      "invalid_response",
      "O Asaas retornou uma resposta inválida.",
      response.status,
    );
  }

  return payload as T;
}

export async function createAsaasCustomer(
  input: CreateAsaasCustomerInput,
  options?: { timeoutMs?: number },
): Promise<AsaasCustomer> {
  return asaasRequest<AsaasCustomer>("/customers", {
    method: "POST",
    body: {
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      email: input.email ?? undefined,
      mobilePhone: input.phone ?? undefined,
      externalReference: input.externalReference,
      notificationDisabled: false,
    },
    timeoutMs: options?.timeoutMs,
  });
}

export async function findAsaasCustomerByDocument(
  cpfCnpj: string,
  options?: { timeoutMs?: number },
): Promise<AsaasCustomer | null> {
  const response = await asaasRequest<AsaasList<AsaasCustomer>>(
    `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}&limit=1`,
    { timeoutMs: options?.timeoutMs },
  );

  return response.data.find((customer) => !customer.deleted) ?? null;
}

export async function createAsaasSubscription(
  input: CreateAsaasSubscriptionInput,
  options?: { timeoutMs?: number },
): Promise<AsaasSubscription> {
  return asaasRequest<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: {
      customer: input.customer,
      billingType: input.billingType,
      value: Number((input.valueCents / 100).toFixed(2)),
      nextDueDate: input.nextDueDate,
      cycle: input.cycle,
      description: input.description.slice(0, 500),
      externalReference: input.externalReference,
    },
    timeoutMs: options?.timeoutMs,
  });
}

export async function updateAsaasSubscription(
  subscriptionId: string,
  input: UpdateAsaasSubscriptionInput,
  options?: { timeoutMs?: number },
): Promise<AsaasSubscription> {
  return asaasRequest<AsaasSubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PUT",
      body: {
        billingType: input.billingType,
        value:
          input.valueCents === undefined
            ? undefined
            : Number((input.valueCents / 100).toFixed(2)),
        nextDueDate: input.nextDueDate,
        cycle: input.cycle,
        description: input.description?.slice(0, 500),
        updatePendingPayments: input.updatePendingPayments,
      },
      timeoutMs: options?.timeoutMs,
    },
  );
}

export async function deleteAsaasSubscription(
  subscriptionId: string,
  options?: { timeoutMs?: number },
): Promise<void> {
  const result = await asaasRequest<unknown>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "DELETE", timeoutMs: options?.timeoutMs },
  );

  if (
    !result ||
    typeof result !== "object" ||
    !("deleted" in result) ||
    (result as { deleted?: unknown }).deleted !== true ||
    !("id" in result) ||
    (result as { id?: unknown }).id !== subscriptionId
  ) {
    throw new AsaasError(
      "invalid_response",
      "O Asaas não confirmou a remoção da recorrência pelo ID solicitado.",
    );
  }
}

export async function listAsaasSubscriptionsByExternalReference(
  externalReference: string,
  options?: { timeoutMs?: number },
): Promise<AsaasSubscription[]> {
  const response = await asaasRequest<AsaasList<AsaasSubscription>>(
    `/subscriptions?externalReference=${encodeURIComponent(externalReference)}&limit=10`,
    { timeoutMs: options?.timeoutMs },
  );

  return response.data.filter((subscription) => !subscription.deleted);
}

export async function getAsaasSubscription(
  subscriptionId: string,
  options?: { timeoutMs?: number },
): Promise<AsaasSubscription> {
  return asaasRequest<AsaasSubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { timeoutMs: options?.timeoutMs },
  );
}
