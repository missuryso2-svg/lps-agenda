import { randomUUID } from "node:crypto";

export type FakeRow = Record<string, unknown>;

type FakeError = { code: string; message: string };

type FakeOperation = "select" | "insert" | "update" | "delete" | "upsert";

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "neq"; column: string; value: unknown }
  | { kind: "is"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] }
  | { kind: "lt"; column: string; value: unknown }
  | { kind: "gt"; column: string; value: unknown }
  | { kind: "lte"; column: string; value: unknown }
  | { kind: "gte"; column: string; value: unknown }
  | { kind: "ilike"; column: string; pattern: string }
  | { kind: "or"; filters: Filter[] };

type QueryResult = {
  data: FakeRow[] | FakeRow | null;
  error: FakeError | null;
  count: number | null;
};

type SelectOptions = {
  count?: "exact";
  head?: boolean;
};

type UpsertOptions = {
  onConflict?: string;
  ignoreDuplicates?: boolean;
};

type UniqueConstraint = {
  table: string;
  columns: string[];
  predicate?: (row: FakeRow) => boolean;
};

type FakeUpdateHook = (current: FakeRow, payload: FakeRow) => FakeRow;

type RpcResult = {
  data: unknown;
  error: FakeError | null;
};

type RpcHandler = (args: FakeRow) => unknown;

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  const leftString = String(left);
  const rightString = String(right);

  if (leftString === rightString) {
    return 0;
  }

  return leftString < rightString ? -1 : 1;
}

function ilikeToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");

  return new RegExp(`^${escaped}$`, "i");
}

function parseOrExpression(expression: string): Filter {
  const filters: Filter[] = [];

  for (const part of expression.split(",")) {
    const trimmed = part.trim();
    const firstDot = trimmed.indexOf(".");
    const secondDot = trimmed.indexOf(".", firstDot + 1);

    if (firstDot <= 0 || secondDot <= firstDot) {
      continue;
    }

    const column = trimmed.slice(0, firstDot);
    const operator = trimmed.slice(firstDot + 1, secondDot);
    const value = trimmed.slice(secondDot + 1);

    if (operator === "ilike") {
      filters.push({ kind: "ilike", column, pattern: value });
    } else if (operator === "eq") {
      filters.push({ kind: "eq", column, value });
    }
  }

  return { kind: "or", filters };
}

function matchesFilter(row: FakeRow, filter: Filter): boolean {
  if (filter.kind === "eq") {
    return row[filter.column] === filter.value;
  }

  if (filter.kind === "neq") {
    // Equivalente ao `<>` do Postgres: linhas nulas não satisfazem a condição.
    if (row[filter.column] === undefined || row[filter.column] === null) {
      return false;
    }

    return row[filter.column] !== filter.value;
  }

  if (filter.kind === "is") {
    if (filter.value === null) {
      return row[filter.column] === undefined || row[filter.column] === null;
    }

    return row[filter.column] === filter.value;
  }

  if (filter.kind === "in") {
    return filter.values.includes(row[filter.column]);
  }

  if (filter.kind === "or") {
    return filter.filters.some((item) => matchesFilter(row, item));
  }

  if (filter.kind === "ilike") {
    const value = row[filter.column];

    if (value === undefined || value === null) {
      return false;
    }

    return ilikeToRegExp(filter.pattern).test(String(value));
  }

  if (row[filter.column] === undefined || row[filter.column] === null) {
    return false;
  }

  const comparison = compareValues(row[filter.column], filter.value);

  switch (filter.kind) {
    case "lt":
      return comparison < 0;
    case "gt":
      return comparison > 0;
    case "lte":
      return comparison <= 0;
    case "gte":
      return comparison >= 0;
  }
}

function matchesFilters(row: FakeRow, filters: Filter[]): boolean {
  return filters.every((filter) => matchesFilter(row, filter));
}

export class FakeSupabase {
  private tables = new Map<string, FakeRow[]>();
  private failures = new Map<
    string,
    Array<{ error: FakeError; operation?: FakeOperation }>
  >();
  private updateFailures = new Map<
    string,
    Array<{ matches: (payload: FakeRow) => boolean; error: FakeError }>
  >();
  private rpcHandlers = new Map<string, RpcHandler>();
  private rpcFailures = new Map<string, FakeError[]>();
  private rateLimitCounters = new Map<string, number>();
  private uniqueConstraints: UniqueConstraint[] = [];
  private updateHooks = new Map<string, FakeUpdateHook>();

  constructor(seed: Record<string, FakeRow[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) {
      this.setRows(table, rows);
    }
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  rpc(name: string, args: FakeRow = {}) {
    return new FakeRpc(this, name, args);
  }

  setRpcHandler(name: string, handler: RpcHandler) {
    this.rpcHandlers.set(name, handler);
  }

  setUpdateHook(table: string, hook: FakeUpdateHook) {
    this.updateHooks.set(table, hook);
  }

  applyUpdateHook(table: string, current: FakeRow, payload: FakeRow): FakeRow {
    const hook = this.updateHooks.get(table);
    return hook ? hook({ ...current }, { ...payload }) : { ...payload };
  }

  failNextRpc(name: string, code = "PGRST202") {
    const queue = this.rpcFailures.get(name) ?? [];
    queue.push({ code, message: "Falha simulada em RPC." });
    this.rpcFailures.set(name, queue);
  }

  takeRpcFailure(name: string): FakeError | null {
    const queue = this.rpcFailures.get(name);

    if (!queue || queue.length === 0) {
      return null;
    }

    const failure = queue.shift() ?? null;

    if (queue.length === 0) {
      this.rpcFailures.delete(name);
    }

    return failure;
  }

  getRpcHandler(name: string): RpcHandler | undefined {
    return this.rpcHandlers.get(name);
  }

  /**
   * Implementação em memória da função SQL atômica. Usa a mesma janela fixa
   * para que os testes de limite não dependam de relógio real.
   */
  consumeFakeRateLimit(
    bucket: string,
    windowSeconds: number,
    limit: number,
  ): boolean {
    if (!bucket || windowSeconds <= 0 || limit <= 0) {
      return false;
    }

    const windowStart =
      Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    const key = `${bucket}:${windowStart}`;
    const hits = (this.rateLimitCounters.get(key) ?? 0) + 1;

    this.rateLimitCounters.set(key, hits);

    return hits <= limit;
  }

  /**
   * Simula a função SQL de deduplicação. Compara apenas os dígitos do telefone
   * e reaproveita o primeiro cliente encontrado, inclusive arquivado.
   */
  findOrCreateFakeCustomer(args: FakeRow): string {
    const barbershopId = String(args.p_barbershop_id ?? "");
    const phone = String(args.p_phone ?? "").replace(/\D/g, "");
    const rows = this.hasTable("customers") ? this.getRows("customers") : [];

    const existing = rows.find(
      (row) =>
        row.barbershop_id === barbershopId &&
        String(row.phone ?? "").replace(/\D/g, "") === phone,
    );

    if (existing) {
      return String(existing.id);
    }

    const id = randomUUID();
    const email = String(args.p_email ?? "").trim();

    this.setRows("customers", [
      ...rows,
      {
        id,
        barbershop_id: barbershopId,
        full_name: String(args.p_full_name ?? ""),
        phone,
        email: email.length > 0 ? email : null,
        birth_date: null,
        notes: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    return id;
  }

  /**
   * Implementação em memória do contrato da RPC
   * cancel_subscription_with_cleanup. O handler roda em um único turno do
   * event loop, mas NÃO representa uma transação PostgreSQL real. Ele existe
   * para testar o contrato (job + estado terminal + invalidação do lease) e a
   * idempotência; a atomicidade real será validada em homologação.
   */
  cancelFakeSubscriptionWithCleanup(args: FakeRow): FakeRow {
    const subscriptionId = String(args.p_subscription_id ?? "");
    const barbershopId = String(args.p_barbershop_id ?? "");
    const rawReason = args.p_cancel_reason;
    const reason =
      typeof rawReason === "string" && rawReason.trim().length > 0
        ? rawReason.trim()
        : null;

    if (reason !== null && reason.length > 500) {
      throw new Error(
        "O motivo do cancelamento deve ter no máximo 500 caracteres.",
      );
    }

    const subscriptions = this.getRows("subscriptions");
    const subscription = subscriptions.find(
      (row) => row.id === subscriptionId && row.barbershop_id === barbershopId,
    );

    if (!subscription) {
      throw new Error("Assinatura não encontrada para esta barbearia.");
    }

    const now = new Date().toISOString();
    const terminal =
      subscription.status === "canceled" || subscription.status === "expired";
    const jobs = this.getRows("billing_remote_cleanup_jobs");
    const byCreatedAtDesc = (left: FakeRow, right: FakeRow) =>
      String(right.created_at ?? "").localeCompare(
        String(left.created_at ?? ""),
      );
    const openJob = jobs
      .filter(
        (row) =>
          row.subscription_id === subscriptionId && row.status !== "completed",
      )
      .sort(byCreatedAtDesc)[0];
    let jobId: string | null = null;

    if (openJob) {
      jobId = String(openJob.id);

      if (
        !openJob.gateway_subscription_id &&
        subscription.gateway_subscription_id
      ) {
        openJob.gateway_subscription_id = subscription.gateway_subscription_id;
        openJob.updated_at = now;
        this.setRows("billing_remote_cleanup_jobs", jobs);
      }
    } else {
      const completedJob = jobs
        .filter(
          (row) =>
            row.subscription_id === subscriptionId &&
            row.status === "completed",
        )
        .sort(byCreatedAtDesc)[0];
      const currentGatewayId = subscription.gateway_subscription_id ?? null;
      const completedGatewayId = completedJob?.gateway_subscription_id ?? null;
      const needsJob =
        !terminal ||
        (currentGatewayId !== null &&
          (completedJob === undefined ||
            completedGatewayId !== currentGatewayId));

      if (needsJob) {
        const id = randomUUID();
        const job: FakeRow = {
          id,
          subscription_id: subscriptionId,
          barbershop_id: barbershopId,
          provider: "asaas",
          external_reference: String(subscription.external_reference ?? ""),
          gateway_subscription_id: currentGatewayId,
          status: "pending",
          attempts: 0,
          locked_at: null,
          lease_token: null,
          next_attempt_at: now,
          last_error: null,
          created_at: now,
          updated_at: now,
          completed_at: null,
        };

        this.setRows("billing_remote_cleanup_jobs", [...jobs, job]);
        jobId = id;
      }
    }

    const currentJobs = this.getRows("billing_remote_cleanup_jobs");
    const pending =
      jobId !== null &&
      currentJobs.some(
        (row) => row.id === jobId && row.status !== "completed",
      );
    const updated: FakeRow = { ...subscription };

    if (terminal) {
      updated.gateway_status = "inactive";
      updated.cancel_at_period_end = false;
      updated.checkout_locked_at = null;
      updated.checkout_lease_token = null;
      updated.trial_finalization_locked_at = null;
      updated.trial_finalization_lease_token = null;
      updated.cancel_reason = updated.cancel_reason ?? reason;
      updated.remote_cleanup_pending = pending;
    } else {
      updated.status = "canceled";
      updated.gateway_status = "inactive";
      updated.cancel_at_period_end = false;
      updated.canceled_at = updated.canceled_at ?? now;
      updated.cancel_reason = updated.cancel_reason ?? reason;
      updated.checkout_locked_at = null;
      updated.checkout_lease_token = null;
      updated.trial_finalization_locked_at = null;
      updated.trial_finalization_lease_token = null;
      updated.remote_cleanup_pending = pending;
    }

    updated.updated_at = now;

    this.setRows(
      "subscriptions",
      subscriptions.map((row) =>
        row.id === subscriptionId ? updated : row,
      ),
    );

    return {
      subscription_id: subscriptionId,
      job_id: jobId,
      status: updated.status,
      gateway_subscription_id: updated.gateway_subscription_id ?? null,
      remote_cleanup_pending: updated.remote_cleanup_pending,
      already_terminal: terminal,
    };
  }

  hasTable(table: string): boolean {
    return this.tables.has(table);
  }

  /**
   * Registra uma restrição unique (inclusive parcial) para que inserts e
   * updates do fake se comportem como o PostgreSQL nos cenários de corrida.
   * O fake não aplica as restrições sobre o seed nem sobre upserts.
   */
  addUniqueConstraint(
    table: string,
    columns: string[],
    predicate?: (row: FakeRow) => boolean,
  ) {
    this.uniqueConstraints.push({ table, columns, predicate });
  }

  uniqueViolation(table: string, rows: FakeRow[]): FakeError | null {
    for (const constraint of this.uniqueConstraints) {
      if (constraint.table !== table) {
        continue;
      }

      const seen = new Set<string>();

      for (const row of rows) {
        if (constraint.predicate && !constraint.predicate(row)) {
          continue;
        }

        const values = constraint.columns.map((column) => row[column]);

        // O PostgreSQL permite múltiplos NULLs em índices unique.
        if (values.some((value) => value === undefined || value === null)) {
          continue;
        }

        const key = JSON.stringify(values);

        if (seen.has(key)) {
          return {
            code: "23505",
            message: `Violação de unicidade simulada em ${table} (${constraint.columns.join(", ")}).`,
          };
        }

        seen.add(key);
      }
    }

    return null;
  }

  getRows(table: string): FakeRow[] {
    return this.tables.get(table) ?? [];
  }

  setRows(table: string, rows: FakeRow[]) {
    this.tables.set(
      table,
      rows.map((row) => ({ ...row })),
    );
  }

  failNext(
    table: string,
    code = "23503",
    operation?: FakeOperation,
  ) {
    const queue = this.failures.get(table) ?? [];
    queue.push({
      error: { code, message: "Falha simulada." },
      operation,
    });
    this.failures.set(table, queue);
  }

  /**
   * Falha apenas a próxima atualização cujo payload satisfaça o predicado.
   * Permite simular uma falha depois do claim, mas antes de persistir o ID
   * remoto ou antes de concluir a finalização.
   */
  failNextUpdateMatching(
    table: string,
    matches: (payload: FakeRow) => boolean,
    code = "40001",
  ) {
    const queue = this.updateFailures.get(table) ?? [];
    queue.push({
      matches,
      error: { code, message: "Falha simulada." },
    });
    this.updateFailures.set(table, queue);
  }

  takeUpdateFailure(table: string, payload: FakeRow): FakeError | null {
    const queue = this.updateFailures.get(table);

    if (!queue || queue.length === 0) {
      return null;
    }

    const index = queue.findIndex((failure) => failure.matches(payload));

    if (index < 0) {
      return null;
    }

    const [failure] = queue.splice(index, 1);

    if (queue.length === 0) {
      this.updateFailures.delete(table);
    }

    return failure?.error ?? null;
  }

  takeFailure(
    table: string,
    operation: FakeOperation,
  ): FakeError | null {
    const queue = this.failures.get(table);

    if (!queue || queue.length === 0) {
      return null;
    }

    const index = queue.findIndex(
      (failure) =>
        failure.operation === undefined || failure.operation === operation,
    );

    if (index < 0) {
      return null;
    }

    const [failure] = queue.splice(index, 1);

    if (queue.length === 0) {
      this.failures.delete(table);
    }

    return failure?.error ?? null;
  }
}

class FakeQuery implements PromiseLike<QueryResult> {
  private operation: FakeOperation = "select";
  private payload: FakeRow[] = [];
  private filters: Filter[] = [];
  private orderings: Array<{ column: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private selectOptions: SelectOptions = {};
  private singleMode: "single" | "maybeSingle" | null = null;
  private upsertOptions: UpsertOptions = {};

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(columns?: string, options?: SelectOptions) {
    void columns;
    this.selectOptions = options ?? {};
    return this;
  }

  insert(payload: FakeRow | FakeRow[]) {
    this.operation = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload: FakeRow) {
    this.operation = "update";
    this.payload = [payload];
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  upsert(payload: FakeRow | FakeRow[], options?: UpsertOptions) {
    this.operation = "upsert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.upsertOptions = options ?? {};
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ kind: "neq", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ kind: "in", column, values });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ kind: "lt", column, value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ kind: "gt", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ kind: "lte", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters.push({ kind: "ilike", column, pattern });
    return this;
  }

  or(expression: string) {
    this.filters.push(parseOrExpression(expression));
    return this;
  }

  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderings.push({
      column,
      ascending: options?.ascending ?? true,
    });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.singleMode = "single";
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private mutableRows(): FakeRow[] {
    if (!this.db.hasTable(this.table)) {
      this.db.setRows(this.table, []);
    }

    return this.db.getRows(this.table);
  }

  private filteredRows(rows: FakeRow[]): FakeRow[] {
    let result = rows.filter((row) => matchesFilters(row, this.filters));

    for (const ordering of [...this.orderings].reverse()) {
      result = [...result].sort((left, right) => {
        const a = left[ordering.column];
        const b = right[ordering.column];

        if (a === b) {
          return 0;
        }

        if (a === undefined || a === null) {
          return -1;
        }

        if (b === undefined || b === null) {
          return 1;
        }

        const comparison = String(a).localeCompare(String(b), "pt-BR", {
          numeric: true,
        });

        return ordering.ascending ? comparison : -comparison;
      });
    }

    if (this.rangeFrom !== null) {
      const end = this.rangeTo === null ? undefined : this.rangeTo + 1;
      result = result.slice(this.rangeFrom, end);
    }

    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount);
    }

    return result;
  }

  private withId(row: FakeRow): FakeRow {
    return {
      id: typeof row.id === "string" ? row.id : randomUUID(),
      created_at:
        typeof row.created_at === "string"
          ? row.created_at
          : new Date().toISOString(),
      ...row,
    };
  }

  private respond(data: FakeRow[], count: number | null = null): QueryResult {
    if (this.singleMode === "single") {
      if (data.length !== 1) {
        return {
          data: null,
          error: {
            code: "PGRST116",
            message: "Esperava exatamente um registro.",
          },
          count: null,
        };
      }

      return { data: data[0], error: null, count };
    }

    if (this.singleMode === "maybeSingle") {
      return { data: data[0] ?? null, error: null, count };
    }

    return { data, error: null, count };
  }

  private execute(): QueryResult {
    const failure = this.db.takeFailure(this.table, this.operation);

    if (failure) {
      return { data: null, error: failure, count: null };
    }

    if (this.operation === "select") {
      const rows = this.db.getRows(this.table);
      const filteredCount = rows.filter((row) =>
        matchesFilters(row, this.filters),
      ).length;

      if (this.selectOptions.head) {
        return {
          data: null,
          error: null,
          count: filteredCount,
        };
      }

      const filtered = this.filteredRows(rows);

      return this.respond(
        filtered,
        this.selectOptions.count === "exact" ? filteredCount : null,
      );
    }

    if (this.operation === "insert") {
      const rows = this.mutableRows();
      const inserted = this.payload.map((row) => this.withId(row));
      const violation = this.db.uniqueViolation(this.table, [
        ...rows,
        ...inserted,
      ]);

      if (violation) {
        return { data: null, error: violation, count: null };
      }

      rows.push(...inserted);
      return this.respond(inserted);
    }

    if (this.operation === "update") {
      const updateFailure = this.db.takeUpdateFailure(
        this.table,
        this.payload[0] ?? {},
      );

      if (updateFailure) {
        return { data: null, error: updateFailure, count: null };
      }

      const rows = this.mutableRows();
      const matching = rows.filter((row) => matchesFilters(row, this.filters));
      const updates = new Map<FakeRow, FakeRow>();
      const proposed = rows.map((row) => {
        if (!matching.includes(row)) {
          return row;
        }

        const update = this.db.applyUpdateHook(
          this.table,
          row,
          this.payload[0] ?? {},
        );
        updates.set(row, update);
        return { ...row, ...update };
      });
      const violation = this.db.uniqueViolation(this.table, proposed);

      if (violation) {
        return { data: null, error: violation, count: null };
      }

      for (const row of matching) {
        Object.assign(row, updates.get(row) ?? this.payload[0] ?? {});
      }

      return this.respond(matching);
    }

    if (this.operation === "delete") {
      const rows = this.mutableRows();
      const removed = rows.filter((row) => matchesFilters(row, this.filters));

      this.db.setRows(
        this.table,
        rows.filter((row) => !removed.includes(row)),
      );

      return this.respond(removed);
    }

    const rows = this.mutableRows();
    const conflictColumns = (this.upsertOptions.onConflict ?? "")
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    const written: FakeRow[] = [];

    for (const incoming of this.payload) {
      const existing = conflictColumns.length
        ? rows.find((row) =>
            conflictColumns.every(
              (column) => row[column] === incoming[column],
            ),
          )
        : undefined;

      if (existing) {
        if (!this.upsertOptions.ignoreDuplicates) {
          Object.assign(existing, incoming);
        }

        written.push(existing);
        continue;
      }

      const row = this.withId(incoming);
      rows.push(row);
      written.push(row);
    }

    return this.respond(written);
  }
}

class FakeRpc implements PromiseLike<RpcResult> {
  constructor(
    private readonly db: FakeSupabase,
    private readonly name: string,
    private readonly args: FakeRow,
  ) {}

  then<TResult1 = RpcResult, TResult2 = never>(
    onfulfilled?:
      | ((value: RpcResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): RpcResult {
    const failure = this.db.takeRpcFailure(this.name);

    if (failure) {
      return { data: null, error: failure };
    }

    const handler = this.db.getRpcHandler(this.name);

    if (handler) {
      try {
        return { data: handler(this.args), error: null };
      } catch (error) {
        return {
          data: null,
          error: {
            code: "P0001",
            message: error instanceof Error ? error.message : "Falha simulada.",
          },
        };
      }
    }

    if (this.name === "consume_booking_rate_limit") {
      return {
        data: this.db.consumeFakeRateLimit(
          String(this.args.p_bucket ?? ""),
          Number(this.args.p_window_seconds ?? 0),
          Number(this.args.p_limit ?? 0),
        ),
        error: null,
      };
    }

    if (this.name === "find_or_create_public_customer") {
      return {
        data: this.db.findOrCreateFakeCustomer(this.args),
        error: null,
      };
    }

    if (this.name === "cancel_subscription_with_cleanup") {
      return {
        data: this.db.cancelFakeSubscriptionWithCleanup(this.args),
        error: null,
      };
    }

    return {
      data: null,
      error: {
        code: "PGRST202",
        message: `Função não simulada: ${this.name}`,
      },
    };
  }
}
