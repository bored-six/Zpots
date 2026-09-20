import type { Spot } from "@/lib/spots";

// ---------------------------------------------------------------------------
// A small in-memory stand-in for the parts of the Supabase JS client the repo
// modules touch. It is intentionally generic (table name and row shape are
// whatever the caller seeds) so it can back spots, confirmations, profiles,
// follows, saves, and view-backed reads like `spot_cards` alike.
//
// The fake still emulates a generic Postgres-style unique constraint: within
// any one table, a new inserted row is treated as a duplicate of an existing
// row if they share two or more identical scalar values. That covers both a
// "select first, then insert" and an "insert and catch the unique violation"
// identity check without hardcoding which one an implementation picks.
// ---------------------------------------------------------------------------

type FilterOp = "eq" | "in" | "ilike" | "gte" | "lt";

interface Filter {
  op: FilterOp;
  col: string;
  val: unknown;
}

interface OrderSpec {
  col: string;
  ascending: boolean;
}

type Row = Record<string, unknown>;

interface FakeResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export interface FakeQueryBuilder {
  select: () => FakeQueryBuilder;
  eq: (col: string, val: unknown) => FakeQueryBuilder;
  in: (col: string, vals: unknown[]) => FakeQueryBuilder;
  ilike: (col: string, pattern: string) => FakeQueryBuilder;
  gte: (col: string, val: unknown) => FakeQueryBuilder;
  lt: (col: string, val: unknown) => FakeQueryBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => FakeQueryBuilder;
  range: (from: number, to: number) => FakeQueryBuilder;
  limit: (n: number) => FakeQueryBuilder;
  insert: (row: Row) => FakeQueryBuilder;
  update: (patch: Row) => FakeQueryBuilder;
  delete: () => FakeQueryBuilder;
  single: () => Promise<{ data: unknown; error: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => unknown;
}

export type FakeCall = { table: string; method: string; args: unknown[] };

export type FakeFunctions = Record<string, (args: unknown) => unknown | Promise<unknown>>;

export interface FakeSupabaseClient {
  from: (table: string) => FakeQueryBuilder;
  rpc: (name: string, args?: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;
  storage: {
    from: (bucket: string) => {
      upload: (path: string, file: unknown) => Promise<{ data: { path: string } | null; error: unknown }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      remove: (paths: string[]) => Promise<{ data: { name: string }[] | null; error: unknown }>;
      update: (path: string, file: unknown) => Promise<{ data: { path: string } | null; error: unknown }>;
    };
  };
}

export function createFakeSupabase(
  seedRows: Record<string, Row[]>,
  functions: FakeFunctions = {},
) {
  const db: Record<string, Row[]> = {};
  for (const [table, rows] of Object.entries(seedRows)) {
    db[table] = rows.map((r) => ({ ...r }));
  }
  const calls: FakeCall[] = [];

  function ensureTable(table: string) {
    if (!db[table]) db[table] = [];
    return db[table];
  }

  function makeBuilder(table: string): FakeQueryBuilder {
    const filters: Filter[] = [];
    let orderSpec: OrderSpec | null = null;
    let rangeSpec: [number, number] | null = null;
    let limitN: number | null = null;
    let pendingUpdate: Row | null = null;
    let pendingInsert: Row | null = null;
    let pendingDelete = false;

    function matches(row: Row) {
      return filters.every((f) => {
        const cell = row[f.col];
        switch (f.op) {
          case "eq":
            return cell === f.val;
          case "in":
            return Array.isArray(f.val) && f.val.includes(cell);
          case "ilike": {
            const pattern = String(f.val).replace(/%/g, "").toLowerCase();
            return typeof cell === "string" && cell.toLowerCase().includes(pattern);
          }
          case "gte":
            return (cell as number) >= (f.val as number);
          case "lt":
            return (cell as number) < (f.val as number);
          default:
            return true;
        }
      });
    }

    function currentRows(): Row[] {
      const rows = ensureTable(table);
      let result = filters.length ? rows.filter(matches) : rows.slice();
      if (orderSpec) {
        const { col, ascending } = orderSpec;
        result = [...result].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av === bv) return 0;
          const cmp = (av as string) < (bv as string) ? -1 : 1;
          return ascending ? cmp : -cmp;
        });
      }
      if (rangeSpec) {
        result = result.slice(rangeSpec[0], rangeSpec[1] + 1);
      } else if (limitN !== null) {
        result = result.slice(0, limitN);
      }
      return result;
    }

    function resolveNow(): FakeResult {
      if (pendingInsert !== null) {
        const rows = ensureTable(table);
        const newValues = Object.values(pendingInsert);
        const isDuplicate = rows.some((existing) => {
          const sharedCount = Object.values(existing).filter((v) => newValues.includes(v)).length;
          return sharedCount >= 2;
        });
        calls.push({ table, method: "insert", args: [pendingInsert] });
        if (isDuplicate) {
          return {
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          };
        }
        const row = { ...pendingInsert };
        rows.push(row);
        return { data: row, error: null };
      }
      if (pendingUpdate !== null) {
        calls.push({ table, method: "update", args: [pendingUpdate, filters] });
        const rows = currentRows();
        for (const row of rows) Object.assign(row, pendingUpdate);
        return { data: rows, error: null };
      }
      if (pendingDelete) {
        calls.push({ table, method: "delete", args: [filters] });
        const rows = ensureTable(table);
        const toRemove = new Set(currentRows());
        const kept = rows.filter((row) => !toRemove.has(row));
        const removed = rows.filter((row) => toRemove.has(row));
        db[table] = kept;
        return { data: removed, error: null };
      }
      calls.push({ table, method: "select", args: [filters] });
      return { data: currentRows(), error: null };
    }

    const builder: FakeQueryBuilder = {
      select: () => builder,
      eq: (col, val) => {
        filters.push({ op: "eq", col, val });
        return builder;
      },
      in: (col, vals) => {
        filters.push({ op: "in", col, val: vals });
        return builder;
      },
      ilike: (col, pattern) => {
        filters.push({ op: "ilike", col, val: pattern });
        return builder;
      },
      gte: (col, val) => {
        filters.push({ op: "gte", col, val });
        return builder;
      },
      lt: (col, val) => {
        filters.push({ op: "lt", col, val });
        return builder;
      },
      order: (col, opts) => {
        orderSpec = { col, ascending: opts?.ascending ?? true };
        return builder;
      },
      range: (from, to) => {
        rangeSpec = [from, to];
        return builder;
      },
      limit: (n) => {
        limitN = n;
        return builder;
      },
      insert: (row) => {
        pendingInsert = row;
        return builder;
      },
      update: (patch) => {
        pendingUpdate = patch;
        return builder;
      },
      delete: () => {
        pendingDelete = true;
        return builder;
      },
      single: async () => {
        const result = resolveNow();
        if (Array.isArray(result.data)) {
          const first = result.data[0];
          return first
            ? { data: first, error: null }
            : { data: null, error: { message: "not found" } };
        }
        return result;
      },
      maybeSingle: async () => {
        const result = resolveNow();
        if (Array.isArray(result.data)) {
          const first = result.data[0] ?? null;
          return { data: first, error: null };
        }
        return result;
      },
      then: (resolve, reject) => Promise.resolve(resolveNow()).then(resolve, reject),
    };
    return builder;
  }

  const client: FakeSupabaseClient = {
    from: (table: string) => makeBuilder(table),
    rpc: async (name: string, args?: unknown) => {
      calls.push({ table: "__rpc__", method: name, args: [args] });
      if (!(name in functions)) {
        return { data: null, error: { message: `no fake function named "${name}"` } };
      }
      try {
        const data = await functions[name](args);
        return { data, error: null };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
      }
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: "fake/path.jpg" }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://cdn.example.com/fake.jpg" } }),
        remove: async (paths: string[]) => ({ data: paths.map((p) => ({ name: p })), error: null }),
        update: async () => ({ data: { path: "fake/path.jpg" }, error: null }),
      }),
    },
  };

  return { client, db, calls };
}

export function makeSpotRow(overrides: Partial<Spot> = {}): Spot {
  return {
    id: "spot-1",
    name: "Fort Pilar",
    note: "Historic fort.",
    lat: 6.9098,
    lng: 122.079,
    status: "unconfirmed",
    confirmations: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
