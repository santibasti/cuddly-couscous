// Supabase connection ("cloud mode"). Switched on by VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY; without them the app stays in demo mode (localStorage).
// The app keeps working on an in-memory copy of the database (so every screen and every business rule is unchanged). This module
//   1. loads that copy from Supabase after sign-in (`fetchAll`),
//   2. writes each changed row back (`pushChanges`) — the database's own triggers and row-level security then re-check every rule,
//   3. hands out document numbers from the server so two people never get the same one (`reserveNumbers`).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuditLog, DB, Settings, TableName, UserAccount } from './types';

const URL = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
export const CLOUD = !!(URL && KEY);

let _client: SupabaseClient | null = null;
export const supabase = (): SupabaseClient => (_client ??= createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true } }));

/** Tables copied between the app and Supabase, parents first (foreign keys). `users`, `notifications` and `audit` are handled separately. */
export const SYNC_TABLES = ['branches', 'clients', 'sites', 'communications', 'complaints', 'services', 'inquiries', 'quotations', 'employees', 'jobs', 'attendance', 'corrections', 'holidays', 'reviews', 'adjustments', 'periods', 'runs', 'locations', 'items', 'stock', 'requests', 'assets', 'checkouts', 'tickets', 'invoices', 'payments', 'expenses', 'petty', 'workflows', 'variations', 'incidents', 'discount_requests', 'client_feedback', 'back_jobs', 'payment_confirmations', 'ocular_visits', 'quote_images', 'followups', 'followup_rules', 'job_orders'] as const satisfies readonly TableName[];
export type SyncTable = (typeof SYNC_TABLES)[number];
const RENAME: Partial<Record<SyncTable, Record<string, string>>> = { periods: { start: 'period_start', end: 'period_end' } };
const invert = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]));

/* ---------- value conversion (PostgREST JSON <-> the app's own shapes) ---------- */
const TZ = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d(:?\d\d)?)$/;
const TIME = /^\d\d:\d\d:\d\d(\.\d+)?$/;
const LOCAL = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d+)?)?$/;
/** timestamptz → ISO string with Z (same as the app writes); timestamp → 'YYYY-MM-DDTHH:mm' (local Manila time); time → 'HH:mm'; null → absent. Nested JSON is left alone. */
export function fromDb(row: Record<string, unknown>, rename: Record<string, string> = {}): Record<string, unknown> {
  const back = invert(rename); const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue;
    let x = v;
    if (typeof v === 'string') {
      if (TZ.test(v)) x = new Date(v.replace(' ', 'T')).toISOString();
      else if (LOCAL.test(v)) x = v.replace(' ', 'T').slice(0, 16);
      else if (TIME.test(v)) x = v.slice(0, 5);                      // time columns come back as HH:mm:ss; the app uses HH:mm
    }
    out[back[k] ?? k] = x;
  }
  return out;
}
const SKIP_PUSH = new Set(['id', 'created_at', 'created_by']);
/** App row → database row. Fields cleared in the app (present before, gone now) are sent as null. */
export function toDb(row: Record<string, unknown>, before?: Record<string, unknown>, rename: Record<string, string> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (v !== undefined) out[rename[k] ?? k] = v;
  if (before) for (const k of Object.keys(before)) if (!(k in row) || row[k] === undefined) out[rename[k] ?? k] = null;
  return out;
}

/* ---------- reading ---------- */
async function readAll(table: string, order = 'id'): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase().from(table).select('*').order(order).range(from, from + page - 1);
    if (error) throw new CloudError(`Could not load ${table}: ${error.message}`, error.code);
    rows.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return rows;
}
export class CloudError extends Error { constructor(m: string, public code?: string) { super(m); } }

export const emptyDB = (): DB => ({
  users: [], branches: [], clients: [], sites: [], communications: [], complaints: [], services: [], inquiries: [], quotations: [], jobs: [], employees: [], attendance: [], corrections: [],
  holidays: [], reviews: [], adjustments: [], periods: [], runs: [], locations: [], items: [], stock: [], requests: [], assets: [], checkouts: [], tickets: [], invoices: [], payments: [],
  expenses: [], petty: [], notifications: [], workflows: [], variations: [], incidents: [], discount_requests: [], client_feedback: [], back_jobs: [], payment_confirmations: [], ocular_visits: [],
  quote_images: [], followups: [], followup_rules: [], job_orders: [], audit: [], settings: { counters: {} } as unknown as Settings, version: 1,
});

export const toUser = (p: Record<string, unknown>): UserAccount => {
  const r = fromDb(p);
  return { ...(r as object), pass_hash: '', created_at: (r.created_at as string) ?? new Date().toISOString(), updated_at: (r.created_at as string) ?? new Date().toISOString(), created_by: 'system', active: r.active !== false } as unknown as UserAccount;
};
export const toAudit = (a: Record<string, unknown>): AuditLog => {
  const r = fromDb(a); const { table_name, ...rest } = r;
  return { ...rest, table: table_name } as unknown as AuditLog;
};

/** Everything the signed-in person is allowed to see (row-level security hides the rest). */
export async function fetchTables(tables: readonly SyncTable[]): Promise<Partial<Record<SyncTable, Record<string, unknown>[]>>> {
  const out: Partial<Record<SyncTable, Record<string, unknown>[]>> = {};
  await Promise.all(tables.map(async (t) => { out[t] = (await readAll(t)).map((r) => fromDb(r, RENAME[t])); }));
  return out;
}
export async function fetchAll(): Promise<DB> {
  const [tables, profiles, settings, audit] = await Promise.all([
    fetchTables(SYNC_TABLES),
    readAll('profiles'),
    supabase().from('settings').select('data').eq('id', 'main').maybeSingle(),
    supabase().from('audit_logs').select('*').order('at', { ascending: false }).limit(500),
  ]);
  const db = emptyDB() as unknown as Record<string, unknown>;
  for (const t of SYNC_TABLES) db[t] = tables[t] ?? [];
  db.users = profiles.map(toUser);
  db.audit = (audit.data ?? []).map(toAudit);
  if (settings.data?.data) db.settings = settings.data.data as Settings;
  return db as unknown as DB;
}
export async function fetchProfile(uid: string): Promise<UserAccount | null> {
  const { data, error } = await supabase().from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw new CloudError(error.message, error.code);
  return data ? toUser(data) : null;
}

export async function fetchProfiles(): Promise<UserAccount[]> { return (await readAll('profiles')).map(toUser); }
/** Admin: set a login's name, role, linked employee or on / off switch. Row-level security only lets people with admin.users do this. */
export async function updateProfile(id: string, patch: { name?: string; role?: string; employee_id?: string | null; active?: boolean }) {
  const { error } = await supabase().from('profiles').update(patch).eq('id', id);
  if (error) throw new CloudError(error.message, error.code);
}

/* ---------- writing ---------- */
export interface Diff { inserts: [SyncTable, Record<string, unknown>][]; updates: [SyncTable, Record<string, unknown>, Record<string, unknown>][] }
/** Rows added or replaced since `prev`. Row objects are replaced (never edited) by the store, so a changed reference means a change. */
export function diffDB(prev: DB, next: DB): Diff {
  const d: Diff = { inserts: [], updates: [] };
  for (const t of SYNC_TABLES) {
    const a = prev[t] as unknown as { id: string }[]; const b = next[t] as unknown as { id: string }[];
    if (a === b) continue;
    const before = new Map(a.map((r) => [r.id, r]));
    for (const r of b) {
      const o = before.get(r.id);
      if (!o) d.inserts.push([t, r as never]);
      else if (o !== r && JSON.stringify(o) !== JSON.stringify(r)) d.updates.push([t, r as never, o as never]);
    }
  }
  return d;
}
export const settingsChanged = (prev: DB, next: DB) => prev.settings !== next.settings && JSON.stringify({ ...prev.settings, counters: 0 }) !== JSON.stringify({ ...next.settings, counters: 0 });

/** True for database rule / permission failures (the change is refused); false for network trouble (the change stays queued). */
export const isRuleError = (e: unknown) => typeof (e as { code?: unknown })?.code === 'string' && (e as { code: string }).code !== '' && !/^(FETCH|ECONN|PGRST30)/i.test((e as { code: string }).code);

/** Columns the app still carries on a row but the database no longer has (e.g. photos): left out of the save instead of failing it. */
const missingCols: Record<string, Set<string>> = {};
const stripMissing = (t: string, row: Record<string, unknown>) => { for (const c of missingCols[t] ?? []) delete row[c]; return row; };
/** Runs a save; if the database says a column does not exist, remembers it, drops it and tries again. */
async function tolerant(t: string, row: Record<string, unknown>, go: (r: Record<string, unknown>) => PromiseLike<{ error: { message: string; code?: string } | null; data?: unknown }>) {
  for (let i = 0; i < 8; i++) {
    const res = await go(stripMissing(t, { ...row }));
    const col = res.error?.code === 'PGRST204' ? /'([^']+)' column/.exec(res.error.message)?.[1] : undefined;
    if (!res.error || !col) return res;
    (missingCols[t] ??= new Set()).add(col);
  }
  return { error: { message: 'Too many unknown columns.', code: 'PGRST204' } as { message: string; code?: string }, data: null };
}

/** Re-applies changes that were made offline (and never sent) on top of a fresh copy from the server, so nothing typed offline is lost. */
export function applyOutbox(db: DB, entries: JournalEntry[]): { db: DB; entries: JournalEntry[] } {
  const next = { ...db } as unknown as Record<string, unknown[]>; const out: JournalEntry[] = [];
  const known = new Set<string>(SYNC_TABLES);
  for (const e of entries) {
    if (!known.has(e.t)) continue;
    const list = (next[e.t] as { id: string }[]).slice();
    const at = list.findIndex((r) => r.id === e.id);
    if (e.kind === 'insert') { if (at >= 0) continue; list.push(e.row as never); next[e.t] = list; out.push(e); continue; }       // already on the server → nothing to send
    if (at < 0) continue;                                                                                                       // the record is gone on the server
    const cur = list[at] as unknown as Record<string, unknown>; const was = e.before ?? {};
    const merged: Record<string, unknown> = { ...cur };
    for (const k of new Set([...Object.keys(e.row), ...Object.keys(was)])) if (JSON.stringify(e.row[k]) !== JSON.stringify(was[k])) { if (e.row[k] === undefined || e.row[k] === null) delete merged[k]; else merged[k] = e.row[k]; }
    list[at] = merged as never; next[e.t] = list;
    out.push({ ...e, row: merged, before: cur });
  }
  return { db: next as unknown as DB, entries: out };
}

export interface JournalEntry { t: string; id: string; kind: 'insert' | 'update'; row: Record<string, unknown>; before?: Record<string, unknown> }
/**
 * Replays the changes in the exact order the app made them. The database checks every step (e.g. a discount goes Pending → Approved → Applied,
 * a job is Closed only after its workflow is), so what matters is not just the final state of each row but the order it got there.
 */
export async function pushChanges(prev: DB, next: DB, soft: Set<string>, journal: JournalEntry[] = []): Promise<{ touched: Set<SyncTable>; softFailed: number }> {
  const touched = new Set<SyncTable>(); let softFailed = 0;
  const run = async (id: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { if (soft.has(id) && isRuleError(e)) softFailed++; else throw e; }   // automatic housekeeping may be refused for this role; never block the person's own work
  };
  const known = new Set<string>(SYNC_TABLES);
  const ops: JournalEntry[] = [];
  for (const e of journal) {
    if (!known.has(e.t)) continue;
    ops.push(e);                                                                      // every step is sent (never merged): the database validates each transition
  }
  // anything changed without being journaled (should not happen) still gets saved, after the rest
  const seen = new Set(ops.map((o) => `${o.t}:${o.id}`));
  const diff = diffDB(prev, next);
  for (const [t, r] of diff.inserts) if (!seen.has(`${t}:${r.id}`)) ops.push({ t, id: r.id as string, kind: 'insert', row: r });
  for (const [t, r, o] of diff.updates) if (!seen.has(`${t}:${r.id}`)) ops.push({ t, id: r.id as string, kind: 'update', row: r, before: o });
  for (const op of ops) {
    const t = op.t as SyncTable; const r = op.row; touched.add(t);
    if (op.kind === 'insert') {
      const row = toDb(r, undefined, RENAME[t]);
      await run(op.id, async () => { const { error } = await tolerant(t, row, (x) => supabase().from(t).insert(x)); if (error && !(error.code === '23505' && /pkey|\(id\)/i.test(error.message))) throw new CloudError(error.message, error.code); });   // already saved before the app closed → fine
    } else {
      // send only what this step changed (columns the database manages itself, like verified_at, must not be overwritten with the app's copy)
      const changed: Record<string, unknown> = {}; const bef = op.before ?? {};
      for (const k of new Set([...Object.keys(r), ...Object.keys(bef)])) if (JSON.stringify(r[k]) !== JSON.stringify(bef[k])) changed[k] = r[k] === undefined ? null : r[k];
      const row = toDb(changed, undefined, RENAME[t]); for (const k of SKIP_PUSH) delete row[k]; delete row.updated_at; delete row.updated_by;
      if (!Object.keys(row).length) continue;
      await run(op.id, async () => {
        const { data, error } = await tolerant(t, row, (x) => supabase().from(t).update(x).eq('id', op.id).select('id'));
        if (error) throw new CloudError(error.message, error.code);
        if (!(data as unknown[] | null | undefined)?.length) throw new CloudError(`You do not have permission to change this record (${t.replace(/_/g, ' ')}).`, '42501');
      });
    }
  }
  if (settingsChanged(prev, next)) {
    const { error } = await supabase().rpc('save_settings', { p_data: next.settings });
    if (error) throw new CloudError(error.message, error.code ?? 'P0001');
  }
  return { touched, softFailed };
}

/** Reserve document numbers (QT, JOB, INV, OR, EMP, INC, DR, BJ, OV) so they are unique across everyone using the app. */
export async function reserveNumbers(kind: string, n: number): Promise<number[]> {
  const { data, error } = await supabase().rpc('next_numbers', { p_kind: kind, p_n: n });
  if (error) throw new CloudError(error.message, error.code);
  return data as number[];
}

/* ---------- auth ---------- */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Invalid email or password.' : error.message);
  return data.user;
}
export const signOut = () => supabase().auth.signOut();
/** True when the failure is the connection (offline, server unreachable) rather than a database rule. */
export const isNetworkError = (e: unknown) => !isRuleError(e) || /failed to fetch|network|load failed|fetch/i.test(String((e as Error)?.message ?? ''));
export async function currentUserId(): Promise<string | null> { return (await supabase().auth.getSession()).data.session?.user.id ?? null; }
