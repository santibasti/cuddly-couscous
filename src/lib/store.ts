import { useSyncExternalStore } from 'react';
import type { AuditLog, Base, DB, Invoice, Payment, PayrollPeriod, Role, TableName, UserAccount } from './types';
import { permsFor } from './rbac';
import { isoNow, sha256, uid } from './util';
import { seedDB } from './seed';
import { syncHub } from './sync';

type Rows = { [K in TableName]: DB[K] extends (infer R)[] ? R : never };
type NewRow<T extends TableName> = Omit<Rows[T], keyof Base> & Partial<Base>;

const KEY = 'topmop-ops-db-v4';
const SESSION = 'topmop-ops-session-v1';

export class PermissionError extends Error {}
export class RuleError extends Error {}

const TABLE_LABEL: Partial<Record<TableName, string>> = {
  stock: 'stock transaction', invoices: 'invoice', periods: 'payroll period', checkouts: 'equipment out/in record', payments: 'payment',
};

class Store {
  private _db: DB;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sessionUser: string | null = null;
  private _reason: string | null = null;
  private _discountOK = false;

  constructor() {
    let db: DB | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { db = JSON.parse(raw) as DB; if (!db.discount_requests) db.discount_requests = []; if (!db.client_feedback) db.client_feedback = []; if (!db.back_jobs) db.back_jobs = []; if (!db.payment_confirmations) db.payment_confirmations = []; db.payments = db.payments.map((p) => ((p.method as string) === 'Check' ? { ...p, method: 'Cheque' as const } : (['Credit Card', 'Other'] as string[]).includes(p.method) ? { ...p, method: 'Bank Transfer' as const } : p)); }   // data saved before Discount Requests existed
    } catch { /* ignore corrupted / unavailable storage */ }
    this._db = db ?? seedDB();
    try { this.sessionUser = localStorage.getItem(SESSION); } catch { /* noop */ }
    if (!db) this.persistNow();
  }

  /* ---- subscription ---- */
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getDB = () => this._db;
  private emit() { this.listeners.forEach((l) => l()); this.persist(); syncHub.noteWrite(); }
  private persist() { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => this.persistNow(), 300); }
  private persistNow() {
    try { localStorage.setItem(KEY, JSON.stringify(this._db)); }
    catch { console.warn('Storage quota reached; demo data will not persist this change.'); }
  }
  private set(mut: (d: DB) => DB) { this._db = { ...mut(this._db), version: this._db.version + 1 }; this.emit(); }

  /* ---- auth (demo mode: local accounts; production uses Supabase Auth) ---- */
  get user(): UserAccount | null { return this._db.users.find((u) => u.id === this.sessionUser && u.active && !u.deleted_at) ?? null; }
  get role(): Role | null { return this.user?.role ?? null; }
  can(perm: string): boolean {
    const u = this.user; if (!u) return false;
    return permsFor(u.role, this._db.settings.access).has(perm);
  }
  require(perm: string) { if (!this.can(perm)) throw new PermissionError(`Your role is not permitted to do this (${perm}).`); }

  async login(email: string, password: string): Promise<UserAccount> {
    const u = this._db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && !x.deleted_at);
    const h = await sha256(`topmop:${password}`);
    if (!u || u.pass_hash !== h) throw new Error('Invalid email or password.');
    if (!u.active) throw new Error('This account is disabled. Contact your administrator.');
    this.sessionUser = u.id;
    try { localStorage.setItem(SESSION, u.id); } catch { /* noop */ }
    this.audit('login', 'users', u.id, `${u.name} signed in`);
    this.set((d) => d);
    return u;
  }
  logout() {
    const u = this.user;
    if (u) this.audit('logout', 'users', u.id, `${u.name} signed out`);
    this.sessionUser = null;
    try { localStorage.removeItem(SESSION); } catch { /* noop */ }
    this.set((d) => d);
  }
  async setPassword(userId: string, password: string) {
    this.require('admin.users');
    const h = await sha256(`topmop:${password}`);
    this.update('users', userId, { pass_hash: h } as never, 'update', 'Password reset');
  }

  /* ---- audit ---- */
  audit(action: AuditLog['action'], table: string, recordId: string, summary: string, before?: unknown, after?: unknown) {
    const u = this.user;
    const entry: AuditLog = { id: uid(), at: isoNow(), user_id: u?.id ?? 'system', user_name: u?.name ?? 'System', action, table, record_id: recordId, summary, before, after, ...(this._reason ? { reason: this._reason } : {}) };
    this._db = { ...this._db, audit: [entry, ...this._db.audit].slice(0, 5000) };
  }

  /* ---- generic CRUD with audit & guards ---- */
  insert<T extends TableName>(table: T, data: NewRow<T>, summary?: string): Rows[T] {
    this.guardDiscountInsert(table, data as unknown as Record<string, unknown>);
    const now = isoNow();
    const row = { ...data, id: (data as { id?: string }).id ?? uid(), created_at: now, updated_at: now, created_by: this.user?.id ?? 'system' } as unknown as Rows[T];
    this.audit('create', table, (row as Base).id, summary ?? `Created ${table.replace(/s$/, '')} ${describe(row)}`, undefined, row);
    this.set((d) => ({ ...d, [table]: [...(d[table] as unknown[]), row] }) as DB);
    return row;
  }

  update<T extends TableName>(table: T, id: string, patch: Partial<Rows[T]>, action: AuditLog['action'] = 'update', summary?: string): Rows[T] {
    const list = this._db[table] as unknown as (Base & Record<string, unknown>)[];
    const before = list.find((r) => r.id === id);
    if (!before) throw new RuleError(`Record not found in ${table}`);
    this.guardUpdate(table, before, patch as Record<string, unknown>);
    this.guardDiscountUpdate(table, before, patch as Record<string, unknown>);
    const after = { ...before, ...patch, updated_at: isoNow(), updated_by: this.user?.id ?? 'system' };
    this.audit(action, table, id, summary ?? `Updated ${table.replace(/s$/, '')} ${describe(after)}`, pickChanged(before, patch as Record<string, unknown>), pickChanged(after, patch as Record<string, unknown>));
    this.set((d) => ({ ...d, [table]: (d[table] as unknown as Base[]).map((r) => (r.id === id ? after : r)) }) as DB);
    return after as unknown as Rows[T];
  }

  remove(table: TableName, id: string) {
    const list = this._db[table] as unknown as (Base & Record<string, unknown>)[];
    const before = list.find((r) => r.id === id);
    if (!before) return;
    this.guardDelete(table, before);
    this.audit('delete', table, id, `Soft-deleted ${table.replace(/s$/, '')} ${describe(before)}`, before);
    this.set((d) => ({ ...d, [table]: (d[table] as unknown as Base[]).map((r) => (r.id === id ? { ...r, deleted_at: isoNow(), deleted_by: this.user?.id ?? 'system' } : r)) }) as DB);
  }
  restore(table: TableName, id: string) {
    this.require('admin.users');
    this.audit('restore', table, id, `Restored ${table} record`);
    this.set((d) => ({ ...d, [table]: (d[table] as unknown as Base[]).map((r) => (r.id === id ? { ...r, deleted_at: null, deleted_by: null } : r)) }) as DB);
  }

  /** Immutable-record rules: finalized payroll, approved invoices, stock transactions, completed asset checkouts. */
  private guardDelete(table: TableName, r: Base & Record<string, unknown>) {
    const nice = TABLE_LABEL[table] ?? table;
    if (table === 'stock') throw new RuleError('Stock transactions cannot be deleted. Post a reversal or adjustment instead.');
    if (table === 'periods' && ((r as unknown as PayrollPeriod).locked || (r as unknown as PayrollPeriod).status !== 'Draft')) throw new RuleError('Only draft payroll periods can be removed. Finalized payroll is locked.');
    if (table === 'runs') throw new RuleError('Payroll runs cannot be deleted.');
    if (table === 'invoices' && (r as unknown as Invoice).status !== 'Draft') throw new RuleError('Approved invoices cannot be deleted. Reverse the invoice instead.');
    if (table === 'workflows') throw new RuleError('Job workflow records cannot be deleted.');
    if (table === 'variations') throw new RuleError('Variations cannot be deleted; reject them instead.');
    if (table === 'incidents') throw new RuleError('Incident reports cannot be deleted; resolve them instead.');
    if (table === 'payment_confirmations') throw new RuleError('Payment confirmations cannot be deleted.');
    if (table === 'back_jobs') throw new RuleError('Back jobs cannot be deleted; close or reject them.');
    if (table === 'client_feedback') throw new RuleError('Client feedback cannot be deleted.');
    if (table === 'discount_requests') throw new RuleError('Discount requests cannot be deleted; they stay on record with their status.');
    if (table === 'checkouts' && (r.status === 'Released' || r.status === 'Returned')) throw new RuleError('Completed or active equipment out/in records cannot be deleted.');
    if (table === 'payments' && ((r as unknown as Payment).status ?? 'Verified') === 'Verified') throw new RuleError('A verified payment cannot be deleted. Reverse the payment instead.');
    if (table === 'attendance' && r.approval === 'Approved') throw new RuleError('Approved attendance cannot be deleted. File a correction request.');
    if (table === 'users' && r.id === this.user?.id) throw new RuleError('You cannot delete your own account.');
    void nice;
  }
  private guardUpdate(table: TableName, r: Base & Record<string, unknown>, patch: Record<string, unknown>) {
    if (table === 'stock' && !('approval' in patch && Object.keys(patch).every((k) => ['approval', 'approved_by'].includes(k)))) throw new RuleError('Stock transactions are immutable. Post a reversal or adjustment instead.');
    if (table === 'periods' && r.locked && !('deleted_at' in patch)) throw new RuleError('This payroll period is finalized and locked.');
    if (table === 'runs') {
      const p = this._db.periods.find((x) => x.id === r.period_id);
      if (p?.locked) throw new RuleError('This payroll run is finalized and locked.');
    }
    if (table === 'invoices' && r.status === 'Approved') {
      const allowed = ['status', 'reversal_reason', 'reversed_at', 'last_reminder', 'notes', 'due_date'];
      if (!Object.keys(patch).every((k) => allowed.includes(k))) throw new RuleError('Approved invoices are locked. Reverse the invoice and issue a new one.');
    }
    if (table === 'payments' && ((r.status as string | undefined) ?? 'Verified') === 'Verified' && !Object.keys(patch).every((k) => ['reversed', 'reversal_reason', 'cheque_status', 'cleared_at', 'notes'].includes(k))) throw new RuleError('A verified payment is locked. Reverse it with a reason and record a new one.');
    if (table === 'checkouts' && r.status === 'Returned') throw new RuleError('Completed out/in records are locked.');
    if (table === 'workflows' && r.closed_at && !(this._reason && (this.role === 'ops' || this.role === 'owner'))) throw new RuleError('A closed job workflow is locked. An Operations Manager or Admin can correct it with a reason.');
    if (table === 'variations' && r.status === 'Approved' && !this._reason) throw new RuleError('An approved variation is locked. Create a new variation or correct it with a reason.');
    if (table === 'incidents' && r.status === 'Resolved' && !this._reason) throw new RuleError('A resolved incident is locked. Correct it with a reason.');
  }

  /** Discounts are never typed in directly by Team Leaders / Field staff — they submit a Discount Request and only Owner / Admin approves it. */
  private static DISCOUNT_TABLES = ['quotations', 'variations', 'invoices'];
  private lineDisc = (items: unknown) => ((items as { discount?: number }[] | undefined) ?? []).reduce((s, i) => s + (i.discount || 0), 0);
  private guardDiscountInsert(table: TableName, row: Record<string, unknown>) {
    if (!Store.DISCOUNT_TABLES.includes(table) || !this.user || this._discountOK || this.can('discount.approve')) return;
    if (((row.discount as number) || 0) > 0 || this.lineDisc(row.items) > 0) throw new PermissionError('Discounts need Owner / Admin approval. Submit a Discount Request instead.');
  }
  private guardDiscountUpdate(table: TableName, before: Record<string, unknown>, patch: Record<string, unknown>) {
    if (!Store.DISCOUNT_TABLES.includes(table) || !this.user || this._discountOK || this.can('discount.approve')) return;
    const changed = ('discount' in patch && (patch.discount as number || 0) !== (before.discount as number || 0)) || ('items' in patch && this.lineDisc(patch.items) !== this.lineDisc(before.items));
    if (changed) throw new PermissionError('Only the Owner / Admin can apply or edit a discount. Submit a Discount Request instead.');
  }
  /** Run a rule-checked action that carries an already-approved discount (e.g. invoicing an approved quotation). */
  allowDiscount<T>(fn: () => T): T { this._discountOK = true; try { return fn(); } finally { this._discountOK = false; } }

  /** Settings & counters */
  patchSettings(patch: Partial<DB['settings']>, summary = 'Updated settings') {
    this.audit('update', 'settings', 'settings', summary, undefined, patch);
    this.set((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }
  nextNumber(kind: 'QT' | 'JOB' | 'INV' | 'OR' | 'EMP' | 'INC' | 'DR' | 'BJ'): string {
    const n = (this._db.settings.counters[kind] ?? 0) + 1;
    this._db = { ...this._db, settings: { ...this._db.settings, counters: { ...this._db.settings.counters, [kind]: n } } };
    const yr = new Date().getFullYear();
    return kind === 'EMP' ? `TM-${String(n).padStart(3, '0')}` : `${kind}-${yr}-${String(n).padStart(4, '0')}`;
  }
  /* ---- automation helpers (system-attributed, not permission checked) ---- */
  system<T extends TableName>(table: T, id: string, patch: Partial<Rows[T]>, summary?: string) { return this.update(table, id, patch, 'update', summary); }
  systemInsert<T extends TableName>(table: T, data: NewRow<T>, summary?: string) { return this.insert(table, data, summary); }
  syncNotifications(list: Omit<Rows['notifications'], keyof Base | 'read_by'>[]) {
    const old = new Map(this._db.notifications.map((n) => [n.key, n]));
    const now = isoNow();
    const next = list.map((l) => {
      const o = old.get(l.key);
      return o ? { ...o, ...l, updated_at: o.updated_at } : ({ id: uid(), created_at: now, updated_at: now, created_by: 'system', read_by: [], ...l } as Rows['notifications']);
    });
    const sig = (a: Rows['notifications'][]) => JSON.stringify(a.map((n) => [n.key, n.title, n.body, n.severity, n.read_by]).sort());
    if (sig(next) === sig(this._db.notifications)) return;
    this.set((d) => ({ ...d, notifications: next }));
  }
  markRead(ids: string[]) {
    const uidv = this.user?.id; if (!uidv) return;
    this.set((d) => ({ ...d, notifications: d.notifications.map((n) => (ids.includes(n.id) && !n.read_by.includes(uidv) ? { ...n, read_by: [...n.read_by, uidv] } : n)) }));
  }

  /** Run edits with a recorded reason (stored on every audit entry written inside `fn`). */
  withReason<T>(reason: string, fn: () => T): T {
    if (!reason.trim()) throw new RuleError('A reason is required for this change.');
    this._reason = reason.trim();
    try { return fn(); } finally { this._reason = null; }
  }
  /** Batch several mutations into a single emit (still audited individually). */
  batch(fn: () => void) { fn(); }

  reset() {
    this._db = seedDB();
    this.sessionUser = null;
    try { localStorage.removeItem(SESSION); } catch { /* noop */ }
    this.emit();
  }
}

function describe(r: unknown): string {
  const o = r as Record<string, unknown>;
  return String(o.number ?? o.name ?? o.full_name ?? o.code ?? o.label ?? o.title ?? o.summary ?? String(o.id ?? '').slice(0, 8));
}
function pickChanged(o: Record<string, unknown>, patch: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) out[k] = typeof o[k] === 'string' && (o[k] as string).startsWith('data:') ? '[file]' : o[k];
  return out;
}

export const store = new Store();
export const useDB = (): DB => useSyncExternalStore(store.subscribe, store.getDB);
export function useAuth() {
  const db = useDB();
  const user = db.users.find((u) => u.id === (store as unknown as { sessionUser: string | null }).sessionUser && u.active && !u.deleted_at) ?? null;
  const perms = user ? permsFor(user.role, db.settings.access) : new Set<string>();
  const employee = user?.employee_id ? db.employees.find((e) => e.id === user.employee_id) ?? null : null;
  return { user, perms, can: (p: string) => perms.has(p), any: (ps: string[]) => ps.some((p) => perms.has(p)), employee, db };
}
export const live = <T extends { deleted_at?: string | null }>(a: T[]): T[] => a.filter((x) => !x.deleted_at);
