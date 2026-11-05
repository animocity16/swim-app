// lib/demo/fakeSupabase.ts
//
// A small in-browser stand-in for the Supabase client, used ONLY while demo mode
// is on (see lib/supabaseClient.ts). It understands the query shapes the Natrix
// screens actually use (select / insert / update / delete / upsert with
// eq, in, or, order, limit, single ...), plus a fake signed-in demo user.
//
// It reads and writes the visitor's own copy of the sample data (lib/demo/store.ts)
// and makes no network requests at all, so nothing a visitor does here can reach
// a real database or another visitor.

import { DEMO_USER_EMAIL, DEMO_USER_ID, exitDemo } from "./demoMode";
import { DEMO_POOL, generateResults } from "./seed";
import { getDb, nextId, persist, resetDb, type DemoDb, type Row } from "./store";

type DemoError = { message: string; code?: string; details?: string; hint?: string };
type Result = { data: unknown; error: DemoError | null; count: number | null; status: number; statusText: string };

const ok = (data: unknown, status = 200): Result => ({ data, error: null, count: null, status, statusText: "OK" });
const fail = (message: string, code = "DEMO", status = 400): Result => ({
  data: null,
  error: { message, code },
  count: null,
  status,
  statusText: "Error",
});

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ─── Comparison helpers ──────────────────────────────────────────────────────

type Filter = (row: Row) => boolean;

function looseEq(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const na = Number(a);
  const nb = Number(b);
  if (a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== "string") return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function likeToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) {
      out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (ch === "%") {
      out += ".*";
    } else if (ch === "_") {
      out += ".";
    } else {
      out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`, "i");
}

function parseLiteral(v: string): unknown {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function makeFilter(col: string, op: string, val: unknown): Filter {
  switch (op) {
    case "eq":
      return (r) => looseEq(r[col], val);
    case "neq":
      return (r) => r[col] !== null && r[col] !== undefined && !looseEq(r[col], val);
    case "gt":
      return (r) => r[col] != null && compare(r[col], val) > 0;
    case "gte":
      return (r) => r[col] != null && compare(r[col], val) >= 0;
    case "lt":
      return (r) => r[col] != null && compare(r[col], val) < 0;
    case "lte":
      return (r) => r[col] != null && compare(r[col], val) <= 0;
    case "is": {
      const lit = typeof val === "string" ? parseLiteral(val) : val;
      return (r) => (lit === null ? r[col] === null || r[col] === undefined : r[col] === lit);
    }
    case "in": {
      const list = Array.isArray(val) ? val : [];
      return (r) => list.some((x) => looseEq(r[col], x));
    }
    case "ilike":
    case "like": {
      const re = likeToRegExp(String(val));
      return (r) => typeof r[col] === "string" && re.test(r[col] as string);
    }
    default:
      return () => true;
  }
}

// "user_id.eq.abc,user_id.is.null" -> a filter matching either condition.
function parseOr(expr: string): Filter {
  const parts = expr.split(",").map((p) => p.trim()).filter(Boolean);
  const filters = parts.map((p) => {
    const first = p.indexOf(".");
    const second = p.indexOf(".", first + 1);
    const col = p.slice(0, first);
    const op = p.slice(first + 1, second);
    const raw = p.slice(second + 1);
    return makeFilter(col, op, op === "is" ? raw : raw);
  });
  return (r) => filters.some((f) => f(r));
}

function project(row: Row, cols: string): Row {
  if (!cols || cols.trim() === "*") return clone(row);
  const out: Row = {};
  for (const c of cols.split(",").map((s) => s.trim()).filter(Boolean)) out[c] = clone(row[c] ?? null);
  return out;
}

// ─── Query builder ───────────────────────────────────────────────────────────

type Op = "select" | "insert" | "update" | "delete" | "upsert";

class Query implements PromiseLike<Result> {
  private op: Op = "select";
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private cols = "*";
  private payload: Row | Row[] | null = null;
  private conflictKeys: string[] = [];
  private mode: "many" | "single" | "maybe" = "many";
  private wantsReturn = false;

  constructor(private table: string) {}

  select(cols = "*") {
    this.cols = cols;
    if (this.op !== "select") this.wantsReturn = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = payload;
    this.conflictKeys = (opts?.onConflict ?? "id").split(",").map((s) => s.trim());
    return this;
  }

  eq(col: string, val: unknown) { this.filters.push(makeFilter(col, "eq", val)); return this; }
  neq(col: string, val: unknown) { this.filters.push(makeFilter(col, "neq", val)); return this; }
  gt(col: string, val: unknown) { this.filters.push(makeFilter(col, "gt", val)); return this; }
  gte(col: string, val: unknown) { this.filters.push(makeFilter(col, "gte", val)); return this; }
  lt(col: string, val: unknown) { this.filters.push(makeFilter(col, "lt", val)); return this; }
  lte(col: string, val: unknown) { this.filters.push(makeFilter(col, "lte", val)); return this; }
  is(col: string, val: unknown) { this.filters.push(makeFilter(col, "is", val)); return this; }
  in(col: string, vals: unknown[]) { this.filters.push(makeFilter(col, "in", vals)); return this; }
  ilike(col: string, pattern: string) { this.filters.push(makeFilter(col, "ilike", pattern)); return this; }
  like(col: string, pattern: string) { this.filters.push(makeFilter(col, "like", pattern)); return this; }
  or(expr: string) { this.filters.push(parseOr(expr)); return this; }
  not(col: string, op: string, val: unknown) {
    const f = makeFilter(col, op, val);
    this.filters.push((r) => !f(r));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): Promise<A | B> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }

  private matches(rows: Row[]): Row[] {
    return rows.filter((r) => this.filters.every((f) => f(r)));
  }

  private shape(rows: Row[]): Result {
    const out = rows.map((r) => project(r, this.cols));
    if (this.mode === "single") {
      if (out.length !== 1) {
        return fail("JSON object requested, multiple (or no) rows returned", "PGRST116", 406);
      }
      return ok(out[0]);
    }
    if (this.mode === "maybe") {
      if (out.length > 1) return fail("JSON object requested, multiple (or no) rows returned", "PGRST116", 406);
      return ok(out[0] ?? null);
    }
    return ok(out);
  }

  private execute(): Result {
    const db = getDb();
    const rows = (db.tables[this.table] ??= []);

    if (this.op === "select") {
      let found = this.matches(rows);
      if (this.orders.length) {
        found = [...found].sort((a, b) => {
          for (const { col, asc } of this.orders) {
            const av = a[col];
            const bv = b[col];
            const aNull = av === null || av === undefined;
            const bNull = bv === null || bv === undefined;
            if (aNull && bNull) continue;
            // PostgREST default: nulls last when ascending, first when descending.
            if (aNull) return asc ? 1 : -1;
            if (bNull) return asc ? -1 : 1;
            const c = compare(av, bv);
            if (c !== 0) return asc ? c : -c;
          }
          return 0;
        });
      }
      if (this.limitN !== null) found = found.slice(0, this.limitN);
      return this.shape(found);
    }

    if (this.op === "insert" || this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const touched: Row[] = [];
      for (const item of list) {
        if (this.op === "upsert") {
          const existing = rows.find((r) => this.conflictKeys.every((k) => looseEq(r[k], item[k])));
          if (existing) {
            Object.assign(existing, clone(item));
            touched.push(existing);
            continue;
          }
        }
        const row: Row = clone(item);
        if (row.id === undefined || row.id === null) row.id = nextId(db, this.table);
        if (row.created_at === undefined) row.created_at = new Date().toISOString();
        if (this.table === "swimmers" && row.user_id === undefined) row.user_id = DEMO_USER_ID;
        rows.push(row);
        touched.push(row);
      }
      persist();
      return this.wantsReturn ? this.shape(touched) : ok(null, 201);
    }

    if (this.op === "update") {
      const found = this.matches(rows);
      for (const r of found) Object.assign(r, clone(this.payload as Row));
      persist();
      return this.wantsReturn ? this.shape(found) : ok(null, 204);
    }

    // delete
    const doomed = this.matches(rows);
    const doomedSet = new Set(doomed);
    db.tables[this.table] = rows.filter((r) => !doomedSet.has(r));
    cascadeDelete(db, this.table, doomed);
    persist();
    return this.wantsReturn ? this.shape(doomed) : ok(null, 204);
  }
}

// Mirrors the database's ON DELETE CASCADE behaviour for the tables the app uses.
function cascadeDelete(db: DemoDb, table: string, removed: Row[]) {
  if (removed.length === 0) return;
  const ids = new Set(removed.map((r) => String(r.id)));
  const dropWhere = (t: string, col: string) => {
    const before = db.tables[t] ?? [];
    const removedChild = before.filter((r) => ids.has(String(r[col])));
    db.tables[t] = before.filter((r) => !ids.has(String(r[col])));
    return removedChild;
  };
  if (table === "swimmers") {
    const times = dropWhere("swim_times", "swimmer_id");
    dropWhere("training_times", "swimmer_id");
    if (times.length) cascadeDelete(db, "swim_times", times);
  } else if (table === "swim_times") {
    dropWhere("swim_splits", "swim_time_id");
  } else if (table === "standard_sets") {
    dropWhere("standard_items", "standard_set_id");
  }
}

// ─── RPC (database functions) ────────────────────────────────────────────────

function followSearch(args: Record<string, unknown>): Result {
  const tokens = Array.from(
    new Set(
      String(args.p_query ?? "")
        .replace(/,+/g, " ")
        .split(/\s+/)
        .map((t) => t.toLowerCase())
        .filter((t) => t.length >= 2)
    )
  );
  if (tokens.length === 0) return ok([]);
  const age = typeof args.p_age === "number" ? args.p_age : null;

  const hits = DEMO_POOL.filter((p) => {
    const hay = p.storedName.toLowerCase();
    if (!tokens.every((t) => hay.includes(t))) return false;
    return age === null || Math.abs(p.age - age) <= 1;
  }).map((p) => {
    let n = 0;
    generateResults(p, 0, 0, () => ++n, () => 0, false);
    return { swimmer_name: p.storedName, team_name: p.swim_club, latest_age: p.age, result_count: n };
  });

  hits.sort((a, b) => b.result_count - a.result_count || a.swimmer_name.localeCompare(b.swimmer_name));
  return ok(hits.slice(0, 30));
}

class Rpc implements PromiseLike<Result> {
  constructor(private name: string, private args: Record<string, unknown>) {}
  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): Promise<A | B> {
    return Promise.resolve()
      .then((): Result => {
        switch (this.name) {
          case "search_followable_swimmers":
            return followSearch(this.args);
          case "get_pending_matches_summary":
          case "get_pending_swimmer_matches":
            return ok([]);
          case "confirm_swimmer_match":
            return ok(null);
          default:
            return fail("That isn't available in the demo.");
        }
      })
      .then(onfulfilled, onrejected);
  }
}

// ─── Follow a swimmer found by search (stands in for /api/follow-result-swimmer)

function displayName(stored: string): string {
  if (stored.includes(",")) {
    const [last, first] = stored.split(",").map((s) => s.trim());
    return `${first} ${last}`.trim();
  }
  return stored.trim();
}

export function demoFollowSwimmer(body: { swimmerName?: unknown; teamName?: unknown; age?: unknown }): {
  status: number;
  json: Record<string, unknown>;
} {
  const swimmerName = typeof body.swimmerName === "string" ? body.swimmerName.trim() : "";
  const teamName = typeof body.teamName === "string" ? body.teamName.trim() : "";
  const pool = DEMO_POOL.find((p) => p.storedName === swimmerName && p.swim_club === teamName);
  if (!pool) return { status: 404, json: { error: "We couldn't find that swimmer in the results" } };

  const db = getDb();
  const rawAge = Number(body.age);
  const age = Number.isInteger(rawAge) && rawAge >= 4 && rawAge <= 80 ? rawAge : null;
  const name = displayName(swimmerName);

  const existing = (db.tables.swimmers ?? []).find(
    (s) =>
      s.group_type === "following" &&
      String(s.name).toLowerCase() === name.toLowerCase() &&
      (age === null || s.age === null || Math.abs((s.age as number) - age) <= 1)
  );
  if (existing) return { status: 200, json: { success: true, swimmerId: existing.id, alreadyFollowing: true } };

  const swimmerId = nextId(db, "swimmers");
  (db.tables.swimmers ??= []).push({
    id: swimmerId,
    name,
    age: pool.age,
    birth_month: null,
    country: null,
    swim_club: pool.swim_club,
    school: null,
    gender: pool.gender,
    squad: null,
    group_type: "following",
    status: "Active",
    user_id: DEMO_USER_ID,
    photo_url: null,
    created_at: new Date().toISOString(),
  });

  const baseMs = Number(db.meta.seedDateMs) || Date.now();
  const { times } = generateResults(
    pool,
    swimmerId,
    baseMs,
    () => nextId(db, "swim_times"),
    () => nextId(db, "swim_splits"),
    false
  );
  (db.tables.swim_times ??= []).push(...times);
  persist();
  return { status: 200, json: { success: true, swimmerId, linked: true } };
}

// ─── Fake sign-in ────────────────────────────────────────────────────────────

type Listener = (event: string, session: unknown) => void;
const authListeners = new Set<Listener>();

function currentUser() {
  const db = getDb();
  const meta = (db.meta.userMetadata as Record<string, unknown> | undefined) ?? { full_name: "Demo Parent" };
  return {
    id: DEMO_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: DEMO_USER_EMAIL,
    app_metadata: {},
    user_metadata: clone(meta),
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function currentSession() {
  return {
    access_token: "demo-not-a-real-token",
    refresh_token: "demo-not-a-real-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: currentUser(),
  };
}

function notifyAuth(event: string) {
  const session = event === "SIGNED_OUT" ? null : currentSession();
  authListeners.forEach((l) => {
    try {
      l(event, session);
    } catch {
      /* a listener failing must not break the others */
    }
  });
}

const notAvailable = async () => ({ data: { user: null, session: null }, error: { message: "That isn't available in the demo.", name: "AuthError" } });

const auth = {
  getSession: async () => ({ data: { session: currentSession() }, error: null }),
  getUser: async () => ({ data: { user: currentUser() }, error: null }),
  refreshSession: async () => ({ data: { session: currentSession(), user: currentUser() }, error: null }),
  onAuthStateChange: (cb: Listener) => {
    authListeners.add(cb);
    setTimeout(() => cb("INITIAL_SESSION", currentSession()), 0);
    return { data: { subscription: { id: "demo-sub", callback: cb, unsubscribe: () => authListeners.delete(cb) } } };
  },
  updateUser: async (attrs: { data?: Record<string, unknown>; password?: string; email?: string }) => {
    if (attrs.password || attrs.email) {
      return { data: { user: null }, error: { message: "Account changes are turned off in the demo.", name: "AuthError" } };
    }
    if (attrs.data) {
      const db = getDb();
      const meta = { ...((db.meta.userMetadata as Record<string, unknown> | undefined) ?? { full_name: "Demo Parent" }) };
      for (const [k, v] of Object.entries(attrs.data)) {
        if (v === null || v === undefined) delete meta[k];
        else meta[k] = v;
      }
      db.meta.userMetadata = meta;
      persist();
      notifyAuth("USER_UPDATED");
    }
    return { data: { user: currentUser() }, error: null };
  },
  signOut: async () => {
    exitDemo();
    resetDb();
    notifyAuth("SIGNED_OUT");
    return { error: null };
  },
  signInWithPassword: notAvailable,
  signUp: notAvailable,
  resetPasswordForEmail: notAvailable,
  verifyOtp: notAvailable,
  exchangeCodeForSession: notAvailable,
  setSession: notAvailable,
};

// ─── Storage (photos are turned off) ─────────────────────────────────────────

const storage = {
  from: () => ({
    upload: async () => ({ data: null, error: { message: "Photo uploads are turned off in the demo." } }),
    remove: async () => ({ data: null, error: null }),
    getPublicUrl: () => ({ data: { publicUrl: "" } }),
  }),
};

// ─── The client ──────────────────────────────────────────────────────────────

const base = {
  from: (table: string) => new Query(table),
  rpc: (name: string, args: Record<string, unknown> = {}) => new Rpc(name, args),
  auth,
  storage,
  functions: { invoke: async () => ({ data: null, error: { message: "That isn't available in the demo." } }) },
};

// Anything the demo does not implement fails loudly but safely instead of
// silently reaching for the network.
export const demoClient: unknown = new Proxy(base, {
  get(target, prop, receiver) {
    if (prop in target) return Reflect.get(target, prop, receiver);
    if (prop === "then") return undefined;
    return () => {
      throw new Error(`The demo does not support supabase.${String(prop)}()`);
    };
  },
});
