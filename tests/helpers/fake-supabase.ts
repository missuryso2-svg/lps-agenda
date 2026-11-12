import { randomUUID } from "node:crypto";

export type FakeRow = Record<string, unknown>;

type FakeError = { code: string; message: string };

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] }
  | { kind: "lt"; column: string; value: unknown }
  | { kind: "gt"; column: string; value: unknown }
  | { kind: "lte"; column: string; value: unknown }
  | { kind: "gte"; column: string; value: unknown };

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

function matchesFilters(row: FakeRow, filters: Filter[]): boolean {
  return filters.every((filter) => {
    if (filter.kind === "eq") {
      return row[filter.column] === filter.value;
    }

    if (filter.kind === "in") {
      return filter.values.includes(row[filter.column]);
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
  });
}

export class FakeSupabase {
  private tables = new Map<string, FakeRow[]>();
  private failures = new Map<string, FakeError>();

  constructor(seed: Record<string, FakeRow[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) {
      this.setRows(table, rows);
    }
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  hasTable(table: string): boolean {
    return this.tables.has(table);
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

  failNext(table: string, code = "23503") {
    this.failures.set(table, { code, message: "Falha simulada." });
  }

  takeFailure(table: string): FakeError | null {
    const failure = this.failures.get(table);

    if (!failure) {
      return null;
    }

    this.failures.delete(table);
    return failure;
  }
}

class FakeQuery implements PromiseLike<QueryResult> {
  private operation: "select" | "insert" | "update" | "delete" | "upsert" =
    "select";
  private payload: FakeRow[] = [];
  private filters: Filter[] = [];
  private orderings: Array<{ column: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
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

  private respond(data: FakeRow[]): QueryResult {
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

      return { data: data[0], error: null, count: null };
    }

    if (this.singleMode === "maybeSingle") {
      return { data: data[0] ?? null, error: null, count: null };
    }

    return { data, error: null, count: null };
  }

  private execute(): QueryResult {
    const failure = this.db.takeFailure(this.table);

    if (failure) {
      return { data: null, error: failure, count: null };
    }

    if (this.operation === "select") {
      const filtered = this.filteredRows(this.db.getRows(this.table));

      if (this.selectOptions.head) {
        return {
          data: null,
          error: null,
          count: filtered.length,
        };
      }

      return this.respond(filtered);
    }

    if (this.operation === "insert") {
      const rows = this.mutableRows();
      const inserted = this.payload.map((row) => this.withId(row));
      rows.push(...inserted);
      return this.respond(inserted);
    }

    if (this.operation === "update") {
      const rows = this.mutableRows();
      const matching = rows.filter((row) => matchesFilters(row, this.filters));

      for (const row of matching) {
        Object.assign(row, this.payload[0]);
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
