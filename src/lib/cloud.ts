// Supabase connection ("cloud mode"). Switched on by VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY; without them the app stays in demo mode (localStorage).
// The app keeps working on an in-memory copy of the database (so every screen and every business rule is unchanged). This module
//   1. loads that copy from Supabase after sign-in (`fetchAll`),
//   2. writes each changed row back (`pushChanges`) — the database's own triggers and row-level security then re-check every rule,
//   3. hands out document numbers from the server so two people never get the same one (`reserveNumbers`).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuditLog, DB, Settings, TableName, UserAccount } from './types';
import { permsFor } from './rbac';

const URL = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
export const CLOUD = !!(URL && KEY);

let _client: SupabaseClient | null = null;
export const supabase = (): SupabaseClient => (_client ??= createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true } }));

/** Tables copied between the app and Supabase, parents first (foreign keys). `users`, `notifications` and `audit` are handled separately. */
export const SYNC_TABLES = ['branches', 'clients', 'sites', 'communications', 'complaints', 'services', 'inquiries', 'quotations', 'employees', 'jobs', 'attendance', 'corrections', 'holidays', 'reviews', 'adjustments', 'periods', 'runs', 'locations', 'items', 'stock', 'requests', 'assets', 'checkouts', 'tickets', 'invoices', 'payments', 'expenses', 'petty', 'workflows', 'variations', 'incidents', 'discount_requests', 'client_feedback', 'back_jobs', 'payment_confirmations', 'ocular_visits', 'quote_images', 'followups', 'followup_rules', 'job_orders', 'service_reports', 'maint_profiles', 'maint_plans', 'maint_templates', 'maint_records'] as const satisfies readonly TableName[];
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
const NEWER_TABLES = new Set(['maint_profiles', 'maint_plans', 'maint_templates', 'maint_records', 'job_orders', 'service_reports']);
async function readAll(table: string, order = 'id'): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase().from(table).select('*').order(order).range(from, from + page - 1);
    // a table from a newer migration that has not been applied yet reads as empty (the app still works; apply the migration to use it)
    if (error && NEWER_TABLES.has(table) && (error.code === 'PGRST205' || error.code === '42P01' || /schema cache|does not exist/i.test(error.message))) return [];
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
  quote_images: [], followups: [], followup_rules: [], job_orders: [], service_reports: [], maint_profiles: [], maint_plans: [], maint_templates: [], maint_records: [], audit: [], settings: { counters: {} } as unknown as Settings, version: 1,
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
/** A login that can read only its own employee row still needs the names (and photos) of the people on its jobs: add them as name-only entries. */
async function addRoster(emps: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (emps.length > 1) return emps;                                    // a login that can see the staff list already has everyone
  try {
    const { data, error } = await supabase().rpc('team_roster');
    if (error || !Array.isArray(data)) return emps;
    const have = new Set(emps.map((e) => e.id)); const now = new Date().toISOString();
    const more = (data as Record<string, unknown>[]).filter((r) => !have.has(r.id)).map((r) => ({
      id: r.id, created_at: now, updated_at: now, created_by: 'system', code: '', full_name: r.full_name, position: r.position ?? '', tier: r.tier ?? 'Technician', department: r.department ?? 'Field Operations', branch_id: r.branch_id ?? '',
      pay_basis: 'daily', daily_rate: 0, monthly_salary: 0, payroll_type: 'daily', hire_date: '', bank_name: '', bank_account: '', payout_method: 'Cash', mobile: '', emergency_name: '', emergency_mobile: '', sss: '', philhealth: '', pagibig: '', tin: '',
      status: r.status ?? 'active', documents: [], trainings: [], shift_start: '08:00', shift_end: '17:00', rest_day: 0, ...(r.avatar ? { avatar: r.avatar } : {}), ...(r.rating != null ? { rating: Number(r.rating) } : {}),
    }));
    return [...emps, ...more];
  } catch { return emps; }                                               // function not in the database yet: names stay as they were
}
/** Settings saved on the server may lack newer options (or, after a bad save, whole sections): fill what is missing from the built-in defaults so no screen reads a setting that is not there. */
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export async function completeSettings(server: Settings): Promise<Settings> {
  const need = ['company', 'multipliers', 'access', 'reminder_days', 'statutory', 'channels'];
  const s = server as unknown as Record<string, unknown>;
  if (need.every((k) => s[k] !== undefined) && typeof s.std_hours_per_day === 'number') return server;
  const { seedDB } = await import('./seed');
  const def = seedDB().settings as unknown as Record<string, unknown>; const out: Record<string, unknown> = { ...s };
  for (const [k, v] of Object.entries(def)) {
    if (out[k] === undefined || out[k] === null) out[k] = v;
    else if (isObj(v) && isObj(out[k])) out[k] = { ...v, ...(out[k] as Record<string, unknown>) };
  }
  return out as unknown as Settings;
}
/* What the last full load saw, so the periodic refresh can ask only for rows changed since (a full reload every 90 seconds on every open screen used most of the free egress). */
let marks: Partial<Record<SyncTable, string>> = {}; let auditAt = ''; let settingsAt = ''; let fullAt = 0;
const FULL_EVERY = 15 * 60000;   // a full reload this often also picks up removed / hidden rows
const maxOf = (rows: Record<string, unknown>[], col: string, from = '') => rows.reduce((m, r) => { const v = r[col] as string | undefined; return v && v > m ? v : m; }, from);
/** Only people with the audit permission can read the activity log; for everyone else the database would scan the whole table to return nothing (and time out), so it is not asked for. */
let auditAllowed = false;
async function loadAudit(since?: string): Promise<{ rows: Record<string, unknown>[]; failed: boolean }> {
  if (!auditAllowed) return { rows: [], failed: false };
  let q = supabase().from('audit_logs').select('*').order('at', { ascending: false }).limit(500);
  if (since) q = q.gt('at', since);
  const { data, error } = await q;
  return error ? { rows: [], failed: true } : { rows: (data ?? []) as Record<string, unknown>[], failed: false };   // the log is not needed to work: never block sign-in on it
}
export async function fetchAll(): Promise<DB> {
  const [raw, profiles, settings] = await Promise.all([
    Promise.all(SYNC_TABLES.map(async (t) => [t, await readAll(t)] as const)),
    readAll('profiles'),
    supabase().from('settings').select('data, updated_at').eq('id', 'main').maybeSingle(),
  ]);
  const db = emptyDB() as unknown as Record<string, unknown>;
  const nm: typeof marks = {};
  for (const [t, rows] of raw) { db[t] = rows.map((r) => fromDb(r, RENAME[t])); nm[t] = maxOf(rows, 'updated_at'); }
  db.employees = await addRoster(db.employees as Record<string, unknown>[]);
  marks = nm; fullAt = Date.now();
  if (settings.error) throw new CloudError(`Could not load the company settings: ${settings.error.message}`, settings.error.code);   // never open the app half-loaded (a slow server must not leave it without settings)
  db.users = profiles.map(toUser);
  settingsAt = (settings.data?.updated_at as string | undefined) ?? '';
  if (settings.data?.data) db.settings = await completeSettings(settings.data.data as Settings);
  // may this person read the activity log?
  const uid = await currentUserId().catch(() => null);
  const role = (profiles.find((p) => p.id === uid)?.role as string | undefined) ?? null;
  auditAllowed = !!role && permsFor(role as never, (db.settings as Settings).access).has('admin.audit');
  const au = await loadAudit();
  db.audit = au.rows.map(toAudit);
  auditAt = maxOf(au.rows, 'at');
  return db as unknown as DB;
}
/** Only what changed since the last load, merged into `cur`; a full load when there is no baseline yet or it is a while old. */
export async function fetchLatest(cur: DB, full = false): Promise<DB> {
  if (full || !fullAt || Date.now() - fullAt > FULL_EVERY) return fetchAll();
  const db = { ...cur } as unknown as Record<string, unknown>;
  const changes = await Promise.all(SYNC_TABLES.map(async (t) => {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase().from(t).select('*').gte('updated_at', marks[t] ?? '1970-01-01T00:00:00Z').order('updated_at').order('id').range(from, from + 999);
      if (error) { if (NEWER_TABLES.has(t) && (error.code === 'PGRST205' || error.code === '42P01' || /schema cache|does not exist/i.test(error.message))) break; throw new CloudError(`Could not load ${t}: ${error.message}`, error.code); }
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return [t, rows] as const;
  }));
  for (const [t, rows] of changes) {
    if (!rows.length) continue;
    marks[t] = maxOf(rows, 'updated_at', marks[t] ?? '');
    const list = (cur[t] as unknown as { id: string }[]).slice(); const at = new Map(list.map((r, i) => [r.id, i]));
    for (const r of rows.map((x) => fromDb(x, RENAME[t]) as { id: string })) { const i = at.get(r.id); if (i === undefined) list.push(r); else if (JSON.stringify(list[i]) !== JSON.stringify(r)) list[i] = r; }
    db[t] = list;
  }
  const [prof, st, au] = await Promise.all([
    readAll('profiles'),
    supabase().from('settings').select('data, updated_at').eq('id', 'main').gt('updated_at', settingsAt || '1970-01-01T00:00:00Z').maybeSingle(),
    loadAudit(auditAt || '1970-01-01T00:00:00Z'),
  ]);
  db.users = prof.map(toUser);
  if (st.data?.data) { db.settings = await completeSettings(st.data.data as Settings); settingsAt = (st.data.updated_at as string) ?? settingsAt; }
  if (au.rows.length) { auditAt = maxOf(au.rows, 'at', auditAt); db.audit = [...au.rows.map(toAudit), ...cur.audit].slice(0, 500); }
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

export interface JournalEntry { t: string; id: string; kind: 'insert' | 'update'; row: Record<string, unknown>; before?: Record<string, unknown>; /** a correction made with a reason (sent together with it, so the database rules can allow it) */ reason?: string; /** automatic housekeeping: if the database refuses it for this person, skip it quietly */ soft?: boolean }
/**
 * Replays the changes in the exact order the app made them. The database checks every step (e.g. a discount goes Pending → Approved → Applied,
 * a job is Closed only after its workflow is), so what matters is not just the final state of each row but the order it got there.
 */
export async function pushChanges(prev: DB, next: DB, soft: Set<string>, journal: JournalEntry[] = []): Promise<{ touched: Set<SyncTable>; softFailed: number }> {
  const touched = new Set<SyncTable>(); let softFailed = 0;
  const softIds = new Set([...soft, ...journal.filter((j) => j.soft).map((j) => j.id)]);   // entries restored after a restart keep their quiet-skip flag
  const run = async (id: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { if (softIds.has(id) && isRuleError(e)) softFailed++; else throw e; }   // automatic housekeeping may be refused for this role; never block the person's own work
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
      if ((t === 'workflows' || t === 'jobs') && op.reason) {
        const missing = (e: { code?: string; message: string }) => e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist/i.test(e.message);   // database not updated yet: send it the plain way
        const done = await (async () => { const { error } = await supabase().rpc(t === 'jobs' ? 'update_job_with_reason' : 'update_workflow_with_reason', { p_id: op.id, p_patch: row, p_reason: op.reason }); if (!error) return true; if (missing(error)) return false; return new CloudError(error.message, error.code ?? 'P0001'); })();
        if (done === true) continue;
        if (done instanceof CloudError) { if (softIds.has(op.id) && isRuleError(done)) { softFailed++; continue; } throw done; }
      }
      await run(op.id, async () => {
        const { data, error } = await tolerant(t, row, (x) => supabase().from(t).update(x).eq('id', op.id).select('id'));
        if (error) throw new CloudError(error.message, error.code);
        if (!(data as unknown[] | null | undefined)?.length && Object.keys(row).length && Object.keys(row).every((k) => missingCols[t]?.has(k))) throw new CloudError(`The database has not been updated for this change yet (${Object.keys(row).join(', ')}). Ask the administrator to run the latest database update (supabase db push), then try again.`, '42501');
        if (!(data as unknown[] | null | undefined)?.length) throw new CloudError(`You do not have permission to change this record (${t.replace(/_/g, ' ')}).`, '42501');
      });
    }
  }
  if (settingsChanged(prev, next) && next.settings.company && next.settings.multipliers) {   // never save settings that are missing whole sections (a half-loaded copy would wipe the real ones)
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
  const busy = (e: { message: string; status?: number }) => [502, 503, 504].includes(e.status ?? 0) || /^HTTP 50[234]$/.test(e.message) || /timed? ?out|gateway/i.test(e.message);
  let last: { message: string; status?: number } | null = null;
  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return data.user;
    if (error.message === 'Invalid login credentials') throw new Error('Invalid email or password.');
    if (!busy(error)) throw new Error(error.message);
    last = error; await new Promise((r) => setTimeout(r, 1500 * (i + 1)));   // the server was slow to answer: try again
  }
  throw new Error(`The server is slow to respond right now (${last?.message ?? 'timeout'}). Nothing is wrong with your password — wait a minute and tap Sign in again.`);
}
/** The signed-in person sets a new password for their own login. */
export async function changeMyPassword(password: string) {
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw new Error(/same password|different from the old/i.test(error.message) ? 'Choose a password different from the current one.' : error.message);
}
export const signOut = () => supabase().auth.signOut();
/** True when the failure is the connection (offline, server unreachable) rather than a database rule. */
export const isNetworkError = (e: unknown) => !isRuleError(e) || /failed to fetch|network|load failed|fetch/i.test(String((e as Error)?.message ?? ''));
export async function currentUserId(): Promise<string | null> { return (await supabase().auth.getSession()).data.session?.user.id ?? null; }
