// Preventive maintenance actions (store side). Free of imports from ./actions so actions.ts can call syncMaintenance without a cycle.
import { store, RuleError } from './store';
import type { Asset, AssetStatus, DB, MaintPart, MaintPlan, MaintPriority, MaintProfile, MaintRecord, MaintTaskDef, MaintTemplate } from './types';
import { OPEN, checklistFrom, dueState, mcatOf, nextAfter, partsFrom, plansToSchedule, profileOf, readingFor, stockShort } from './maintenance-core';
import { stockSummary } from './business';
import { isoNow, round2, today, uid } from './util';

const db = (): DB => store.getDB();
const fail = (m: string): never => { throw new RuleError(m); };
const me = () => store.user?.name ?? 'System';
const asset = (id: string) => db().assets.find((a) => a.id === id && !a.deleted_at) ?? fail('Asset not found.');
const record = (id: string) => db().maint_records.find((r) => r.id === id && !r.deleted_at) ?? fail('Maintenance record not found.');
const log = (r: MaintRecord, action: string, note?: string) => [...r.history, { at: isoNow(), by: me(), action, ...(note ? { note } : {}) }];
const manage = () => store.require('maintenance.manage');
const label = (a: Asset) => `${a.code} ${a.name}`;

/* ---------- profile, templates, plans ---------- */
export function saveProfile(assetId: string, patch: Partial<Omit<MaintProfile, 'id' | 'asset_id'>>): MaintProfile {
  manage(); const a = asset(assetId); const cur = profileOf(db(), assetId);
  if (patch.last_reading !== undefined && patch.last_reading < 0) fail('A reading cannot be negative.');
  if (cur) {
    const readingMoved = patch.last_reading !== undefined && patch.last_reading !== cur.last_reading;
    if (readingMoved && cur.last_reading !== undefined && patch.last_reading! < cur.last_reading) fail(`The reading cannot go backwards (last ${cur.last_reading}).`);
    const row = store.update('maint_profiles', cur.id, { ...patch, ...(readingMoved ? { reading_at: today() } : {}) }, 'update', `Maintenance profile of ${label(a)} updated`);
    if (readingMoved) { store.update('assets', a.id, { meter_reading: patch.last_reading }, 'update', `${label(a)} reading ${patch.last_reading}`); syncMaintenance(); }
    return row;
  }
  return store.insert('maint_profiles', { asset_id: assetId, mcategory: mcatOf(a), ...patch } as never, `Maintenance profile created for ${label(a)}`);
}
export function saveTemplate(t: { id?: string; name: string; mcategory: MaintTemplate['mcategory']; tasks: MaintTaskDef[] }): MaintTemplate {
  manage(); if (!t.name.trim()) fail('Name the checklist template.'); if (!t.tasks.length) fail('Add at least one task.');
  for (const x of t.tasks) checkTask(x);
  if (t.id) return store.update('maint_templates', t.id, { name: t.name.trim(), mcategory: t.mcategory, tasks: t.tasks }, 'update', `Maintenance template ${t.name} updated`);
  return store.insert('maint_templates', { name: t.name.trim(), mcategory: t.mcategory, tasks: t.tasks } as never, `Maintenance template ${t.name} created`);
}
export function removeTemplate(id: string) { manage(); store.remove('maint_templates', id); }
function checkTask(x: MaintTaskDef) {
  if (!x.task_name.trim()) fail('Every task needs a name.');
  if ((x.freq_kind === 'date') && !(x.interval_days && x.interval_days > 0)) fail(`“${x.task_name}”: enter the number of days between services.`);
  if (['hours', 'usage', 'mileage'].includes(x.freq_kind) && !(x.interval_reading && x.interval_reading > 0)) fail(`“${x.task_name}”: enter the interval (${x.freq_kind === 'mileage' ? 'km' : x.freq_kind === 'hours' ? 'operating hours' : 'uses'}).`);
  if (x.freq_kind === 'custom' && !(x.interval_days && x.interval_days > 0) && !x.custom_note?.trim()) fail(`“${x.task_name}”: describe the custom schedule or give a number of days.`);
  if (x.est_cost < 0) fail('A cost cannot be negative.');
}
/** Add a template's tasks to an asset as recurring plans (a task already on the asset is not added twice). */
export function applyTemplate(assetId: string, templateId: string): number {
  manage(); const a = asset(assetId); const t = db().maint_templates.find((x) => x.id === templateId && !x.deleted_at) ?? fail('Template not found.');
  if (!profileOf(db(), assetId)) saveProfile(assetId, {});
  const have = new Set(db().maint_plans.filter((p) => p.asset_id === assetId && !p.deleted_at).map((p) => p.task_name.toLowerCase())); let n = 0;
  for (const d of t.tasks) { if (have.has(d.task_name.toLowerCase())) continue; savePlan({ ...d, asset_id: assetId, template_name: t.name }); n++; }
  if (n) store.audit('create', 'maint_plans', assetId, `${n} task(s) from “${t.name}” added to ${label(a)}`);
  syncMaintenance(); return n;
}
export function savePlan(p: MaintTaskDef & { id?: string; asset_id: string; responsible_id?: string; active?: boolean; template_name?: string; last_done?: string; last_done_reading?: number; next_due?: string; next_due_reading?: number }): MaintPlan {
  manage(); const a = asset(p.asset_id); checkTask(p);
  const base = p.last_done ?? today();
  const cur = readingFor(db(), p.freq_kind, p.asset_id);
  const auto = nextAfter(p, base, p.last_done_reading ?? cur);
  const row = { ...p, active: p.active ?? true, next_due: p.next_due ?? auto.next_due, next_due_reading: p.next_due_reading ?? auto.next_due_reading };
  if (p.id) { const prev = db().maint_plans.find((x) => x.id === p.id)!; const changed = prev.interval_days !== p.interval_days || prev.interval_reading !== p.interval_reading || prev.freq_kind !== p.freq_kind;
    const r = store.update('maint_plans', p.id, { ...row, ...(changed && p.next_due === prev.next_due ? auto : {}) } as never, 'update', `Maintenance task “${p.task_name}” on ${label(a)} updated`); syncMaintenance(); return r; }
  const r = store.insert('maint_plans', row as never, `Maintenance task “${p.task_name}” added to ${label(a)}`); syncMaintenance(); return r;
}
export function removePlan(id: string) { manage(); store.remove('maint_plans', id); }

/* ---------- creating records ---------- */
const newNumber = () => store.nextNumber('MT');
function recordInput(a: Asset, f: Partial<MaintRecord> & { title: string }): Omit<MaintRecord, 'id' | 'created_at' | 'updated_at' | 'created_by'> {
  return { number: newNumber(), asset_id: a.id, task_type: 'Service', description: '', priority: 'Normal', status: 'Scheduled', est_cost: 0, approval: 'Not needed', parts: [], checklist: [{ label: f.title, done: false }], history: [{ at: isoNow(), by: me(), action: 'Created' }], ...f };
}
/** Creates the Scheduled records that are coming due from the recurring plans, and keeps "Due for Maintenance" on the assets. Safe to run repeatedly. */
export function syncMaintenance() {
  if (!store.can('maintenance.manage')) return;
  const d = db(); const t = today();
  for (const p of plansToSchedule(d, t)) {
    const a = d.assets.find((x) => x.id === p.asset_id)!;
    try {
      store.systemInsert('maint_records', recordInput(a, {
        plan_id: p.id, title: `${a.name}: ${p.task_name}`, task_type: p.task_type, description: p.description, priority: p.priority, due_date: p.next_due, due_reading: p.next_due_reading,
        responsible_id: p.responsible_id ?? profileOf(d, a.id)?.responsible_id, est_cost: p.est_cost, parts: partsFrom(p.parts), checklist: checklistFrom(p),
        history: [{ at: isoNow(), by: 'System', action: 'Scheduled from the maintenance plan' }],
      }) as never, `Maintenance scheduled: ${a.name} — ${p.task_name}`);
    } catch (e) { if (!(e instanceof RuleError)) throw e; /* document numbers still loading: next run */ }
  }
  // "Due for Maintenance": an Available asset with overdue work; back to Available when nothing is overdue
  const dd = db();
  for (const a of dd.assets.filter((x) => !x.deleted_at)) {
    const late = dd.maint_records.some((r) => !r.deleted_at && r.asset_id === a.id && OPEN.includes(r.status) && dueState(dd, r, t) === 'Overdue');
    if (late && a.status === 'Available') store.system('assets', a.id, { status: 'Due for Maintenance' }, `${a.name} is due for maintenance`);
    else if (!late && a.status === 'Due for Maintenance') store.system('assets', a.id, { status: 'Available' }, `${a.name} is no longer due for maintenance`);
  }
}
export function scheduleMaintenance(i: { asset_id: string; title: string; task_type: MaintRecord['task_type']; description?: string; priority: MaintPriority; due_date: string; responsible_id?: string; est_cost?: number; parts?: MaintPart[]; plan_id?: string }): MaintRecord {
  manage(); const a = asset(i.asset_id); if (!i.title.trim()) fail('Describe the maintenance task.'); if (!i.due_date) fail('Choose the date.');
  return store.insert('maint_records', recordInput(a, { title: i.title.trim(), task_type: i.task_type, description: i.description ?? '', priority: i.priority, due_date: i.due_date, responsible_id: i.responsible_id ?? profileOf(db(), a.id)?.responsible_id,
    est_cost: i.est_cost ?? 0, parts: i.parts ?? [], plan_id: i.plan_id, checklist: checklistFrom({ task_name: i.title.trim(), description: i.description ?? '' }) }) as never, `Maintenance scheduled for ${label(a)}: ${i.title}`);
}
/** A Team Leader (or Admin) reports a problem. It waits for Admin / Operations approval; nothing is scheduled or closed by the reporter. */
export function requestMaintenance(i: { asset_id: string; issue: string; priority: MaintPriority }): MaintRecord {
  store.require('maintenance.request'); const a = asset(i.asset_id); if (!i.issue.trim()) fail('Describe the problem.');
  return store.insert('maint_records', recordInput(a, { title: `${a.name}: ${i.issue.trim().slice(0, 80)}`, task_type: 'Repair', status: 'Requested', request_note: i.issue.trim(), requested_by: store.user?.employee_id ?? store.user?.id, approval: 'Pending', priority: i.priority,
    history: [{ at: isoNow(), by: me(), action: 'Reported', note: i.issue.trim() }] }) as never, `Maintenance requested for ${label(a)}: ${i.issue.trim()}`);
}
export function approveRequest(id: string, a: { due_date: string; responsible_id?: string; est_cost?: number }) {
  manage(); const r = record(id); if (r.status !== 'Requested') fail('Only a requested task can be approved.'); if (!a.due_date) fail('Choose when it should be done.');
  return store.update('maint_records', id, { status: 'Scheduled', approval: 'Approved', approved_by: store.user?.id, approved_at: isoNow(), due_date: a.due_date, responsible_id: a.responsible_id ?? r.responsible_id, est_cost: a.est_cost ?? r.est_cost, history: log(r, 'Approved and scheduled') }, 'approve', `Maintenance request ${r.number} approved`);
}
export function rejectRequest(id: string, reason: string) {
  manage(); const r = record(id); if (r.status !== 'Requested') fail('Only a requested task can be declined.'); if (!reason.trim()) fail('Give a reason.');
  return store.update('maint_records', id, { status: 'Cancelled', cancel_reason: reason.trim(), history: log(r, 'Declined', reason.trim()) }, 'update', `Maintenance request ${r.number} declined`);
}
export function saveRecord(id: string, patch: Partial<Pick<MaintRecord, 'title' | 'description' | 'priority' | 'due_date' | 'due_reading' | 'responsible_id' | 'est_cost' | 'parts' | 'checklist' | 'provider' | 'task_type' | 'before_notes'>>) {
  manage(); const r = record(id); if (['Completed', 'Cancelled'].includes(r.status)) fail('A completed or cancelled record cannot be edited.');
  if (patch.est_cost !== undefined && patch.est_cost < 0) fail('A cost cannot be negative.');
  for (const p of patch.parts ?? []) { if (!p.name.trim()) fail('Every part needs a name.'); if (!(p.qty > 0)) fail(`Quantity for “${p.name}” must be more than zero.`); }
  return store.update('maint_records', id, { ...patch, history: log(r, 'Updated') }, 'update', `Maintenance ${r.number} updated`);
}

/* ---------- doing the work ---------- */
/** Work begins: the asset becomes Under Maintenance and cannot be assigned to a job or shown as available. */
export function startRecord(id: string) {
  manage(); const r = record(id); const a = asset(r.asset_id);
  if (!['Scheduled', 'Deferred'].includes(r.status)) fail('Only a scheduled task can be started.');
  if (a.status === 'In Use' || db().checkouts.some((c) => c.asset_id === a.id && c.status === 'Released' && !c.deleted_at)) fail(`${a.name} is checked out on a job. Return it on the Equipment Out/In page first.`);
  store.update('maint_records', id, { status: 'In Progress', started_at: isoNow(), history: log(r, 'Started') }, 'update', `Maintenance ${r.number} started`);
  if (!['Retired', 'Out of Service'].includes(a.status)) store.update('assets', a.id, { status: 'Under Maintenance' }, 'update', `${label(a)} is under maintenance (${r.number})`);
}
export function deferRecord(id: string, until: string, reason: string) {
  manage(); const r = record(id); if (!['Scheduled', 'Requested'].includes(r.status) && r.status !== 'Deferred') fail('Only a task that has not been done can be deferred.');
  if (!reason.trim()) fail('Give a reason for deferring.'); if (!until || until <= today()) fail('Choose a future date.');
  return store.update('maint_records', id, { status: 'Deferred', deferred_until: until, defer_reason: reason.trim(), history: log(r, `Deferred until ${until}`, reason.trim()) }, 'update', `Maintenance ${r.number} deferred`);
}
export function cancelRecord(id: string, reason: string) {
  manage(); const r = record(id); if (['Completed', 'Cancelled'].includes(r.status)) fail('Already closed.'); if (!reason.trim()) fail('Give a reason.');
  store.update('maint_records', id, { status: 'Cancelled', cancel_reason: reason.trim(), history: log(r, 'Cancelled', reason.trim()) }, 'update', `Maintenance ${r.number} cancelled`);
  releaseAsset(r.asset_id, id);
}
function releaseAsset(assetId: string, exceptRecord: string) {
  const a = db().assets.find((x) => x.id === assetId); if (!a || a.status !== 'Under Maintenance') return;
  if (db().maint_records.some((x) => x.id !== exceptRecord && x.asset_id === assetId && x.status === 'In Progress' && !x.deleted_at)) return;
  store.update('assets', assetId, { status: 'Available' }, 'update', `${label(a)} is available again`);
}
export interface Completion {
  confirmed: boolean; completed_on: string; completed_by: string; actual_cost: number; provider?: string; before_notes: string; after_notes: string; reading?: number;
  next_due?: string; next_due_reading?: number; link?: string; installed: string[];   // ids of the parts that were used / installed
}
/** The responsible person confirms the work was done. Linked stock is deducted only now, and only if it is in stock. */
export function completeRecord(id: string, c: Completion): { short: string[] } {
  manage(); const r = record(id); const a = asset(r.asset_id);
  if (!['Scheduled', 'In Progress', 'Deferred'].includes(r.status)) fail('This task is not open.');
  if (!c.confirmed) fail('Tick the confirmation: the work was done and checked.');
  if (!c.completed_by) fail('Choose who completed or verified the work.');
  if (!c.completed_on || c.completed_on > today()) fail('The completion date cannot be in the future.');
  if (!(c.actual_cost >= 0)) fail('Enter the actual cost (0 if none).');
  if (!c.after_notes.trim()) fail('Add a short note on the condition after the work.');
  const plan = db().maint_plans.find((p) => p.id === r.plan_id);
  const prof = profileOf(db(), a.id);
  if (c.reading !== undefined && prof?.last_reading !== undefined && c.reading < prof.last_reading && (plan?.freq_kind === 'mileage' || plan?.freq_kind === 'hours')) fail(`The reading cannot be lower than the last one (${prof.last_reading}).`);
  const short: string[] = []; const parts: MaintPart[] = [];
  for (const p of r.parts) {
    if (p.status === 'Cancelled' || p.deducted) { parts.push(p); continue; }
    const used = c.installed.includes(p.id);
    if (used && p.item_id) {
      const it = db().items.find((i) => i.id === p.item_id);
      if (it && stockSummary(db(), it.id).available >= p.qty) {
        store.insert('stock', { item_id: it.id, type: 'Adjustment', qty: -p.qty, unit_cost: it.cost, location_id: it.location_id, date: today(), approval: 'Approved', approved_by: store.user?.id, reason: `Used in maintenance ${r.number}`, reference: r.number } as never, `${p.qty} ${it.uom} ${it.name} used in maintenance ${r.number}`);
        parts.push({ ...p, status: 'Installed', deducted: true }); continue;
      }
      short.push(`${p.name} (${it ? `${stockSummary(db(), it.id).available} in stock, ${p.qty} needed` : 'item removed'})`);
    }
    parts.push(used ? { ...p, status: 'Installed' } : p);
  }
  const next = { ...nextAfter(plan ?? { freq_kind: 'date' }, c.completed_on, c.reading ?? readingFor(db(), plan?.freq_kind ?? 'date', a.id)) };
  const nextDue = c.next_due ?? next.next_due; const nextReading = c.next_due_reading ?? next.next_due_reading;
  store.update('maint_records', id, { status: 'Completed', completed_at: `${c.completed_on}T${isoNow().slice(11)}`, completed_by: c.completed_by, actual_cost: round2(c.actual_cost), provider: c.provider?.trim() || undefined, before_notes: c.before_notes.trim() || undefined, after_notes: c.after_notes.trim(),
    reading_at_done: c.reading, next_due: nextDue, next_due_reading: nextReading, link: c.link?.trim() || undefined, parts, checklist: r.checklist.map((x) => ({ ...x, done: true })), approval: r.approval === 'Pending' ? 'Approved' : r.approval, approved_by: r.approved_by ?? store.user?.id,
    history: log(r, 'Completed', short.length ? `Not enough stock to deduct: ${short.join('; ')}` : undefined) }, 'update', `Maintenance ${r.number} completed`);
  if (plan) store.update('maint_plans', plan.id, { last_done: c.completed_on, last_done_reading: c.reading ?? readingFor(db(), plan.freq_kind, a.id), next_due: nextDue, next_due_reading: nextReading }, 'update', `${plan.task_name} done on ${label(a)}`);
  if (c.reading !== undefined && prof && (prof.last_reading === undefined || c.reading > prof.last_reading)) store.update('maint_profiles', prof.id, { last_reading: c.reading, reading_at: c.completed_on }, 'update', `${label(a)} reading ${c.reading}`);
  store.update('assets', a.id, { last_maintenance: c.completed_on, ...(c.reading !== undefined ? { meter_reading: Math.max(c.reading, a.meter_reading ?? 0) } : {}) }, 'update', `${label(a)} maintained`);
  releaseAsset(a.id, id);
  if (a.status === 'Due for Maintenance') store.update('assets', a.id, { status: 'Available' }, 'update', `${label(a)} is available`);
  syncMaintenance();
  return { short };
}

/* ---------- parts, purchase, expense, asset state ---------- */
/** Parts that need buying (not enough in stock, or not linked to an item) are marked Requested and Operations is alerted. */
export function requestPurchase(id: string): number {
  manage(); const r = record(id); let n = 0;
  const parts = r.parts.map((p) => { if (p.status === 'Needed' && (stockShort(db(), p) > 0 || !p.item_id)) { n++; return { ...p, status: 'Requested' as const }; } return p; });
  if (!n) fail('Nothing to request: the needed parts are in stock.');
  store.update('maint_records', id, { parts, history: log(r, `Purchase requested for ${n} part(s)`) }, 'update', `Purchase requested for maintenance ${r.number}`); return n;
}
export function logReading(assetId: string, reading: number) { saveProfile(assetId, { last_reading: reading }); }
/** Admin / Operations set an asset Out of Service (with a reason), put it back to Available, or retire it. */
export function setAssetState(assetId: string, status: Extract<AssetStatus, 'Available' | 'Out of Service' | 'Retired'>, reason: string) {
  manage(); const a = asset(assetId); if (!reason.trim()) fail('Give a reason.');
  if (status !== 'Available' && (a.status === 'In Use' || db().checkouts.some((c) => c.asset_id === a.id && c.status === 'Released' && !c.deleted_at))) fail(`${a.name} is checked out on a job. Return it first.`);
  store.update('assets', assetId, { status }, 'update', `${label(a)} → ${status}: ${reason.trim()}`);
  const prof = profileOf(db(), assetId); if (prof) store.update('maint_profiles', prof.id, { notes: `${prof.notes ? prof.notes + '\n' : ''}${today()} ${status}: ${reason.trim()}` }, 'update', `Maintenance note on ${label(a)}`);
}
/** Draft an expense from the actual cost of a completed record (Finance approves it as usual). */
export function createMaintExpense(id: string) {
  store.require('expenses.edit'); const r = record(id); const a = asset(r.asset_id);
  if (r.status !== 'Completed' || !r.actual_cost) fail('Only a completed task with a cost can become an expense.'); if (r.expense_id) fail('An expense was already created for this record.');
  const e = store.insert('expenses', { date: r.completed_at?.slice(0, 10) ?? today(), payee: r.provider || 'Maintenance', category: 'Equipment Repair', branch_id: db().branches[0]?.id, amount: r.actual_cost, vat: 0, wht: 0, method: 'Cash', approval: 'Pending', paid: false, notes: `${r.number} ${a.name}: ${r.title}` } as never, `Expense drafted from maintenance ${r.number}`) as { id: string };
  store.update('maint_records', id, { expense_id: e.id }, 'update', `Expense linked to ${r.number}`); return e;
}
export const newPartId = uid;
