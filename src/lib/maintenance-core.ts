// Preventive maintenance: pure rules over the data (no store writes here). See maintenance.ts for the actions.
import type { Asset, AssetStatus, DB, MaintCategory, MaintPart, MaintPlan, MaintProfile, MaintRecord, MaintStatus, MaintTaskDef } from './types';
import { stockSummary } from './business';
import { addDays, diffDays, monthEnd, monthStart, round2, sum, uid, weekStart } from './util';

const live = <X extends { deleted_at?: string | null }>(a: X[] | undefined) => (a ?? []).filter((x) => !x.deleted_at);

/** Assets that must not be assigned to a job, requested out, or offered as available in the dispatch checklist. */
export const UNAVAILABLE: AssetStatus[] = ['Retired', 'Damaged', 'Under Maintenance', 'Out of Service', 'Missing'];
export const isUnavailable = (s: AssetStatus) => UNAVAILABLE.includes(s);
export const OPEN: MaintStatus[] = ['Requested', 'Scheduled', 'In Progress', 'Deferred'];
export const DUE_SOON_DAYS = 14;       // "Due Soon" and the first reminder
export const GENERATE_DAYS = 30;       // a scheduled task is created this long before it is due
export const MCATS: MaintCategory[] = ['Vehicle', 'Water System', 'Pump', 'Pressure Washer', 'Vacuum', 'Safety Equipment', 'Tool', 'Other'];

/** Maintenance category suggested from the asset's own category. */
export function mcatOf(a: Pick<Asset, 'category'>): MaintCategory {
  switch (a.category) {
    case 'Vehicle': return 'Vehicle';
    case 'RO/DI Pure-Water System': case 'Water-Fed Pole': case 'Hose': return 'Water System';
    case 'Pump': return 'Pump';
    case 'Pressure Washer': case 'Surface Cleaner': return 'Pressure Washer';
    case 'Industrial Vacuum': return 'Vacuum';
    case 'Safety Equipment': return 'Safety Equipment';
    case 'Ladder': case 'Extension Cord': return 'Tool';
    default: return 'Other';
  }
}
export const profileOf = (db: Pick<DB, 'maint_profiles'>, assetId: string) => live(db.maint_profiles).find((p) => p.asset_id === assetId);

/** Number of times the asset has gone out on a job (for usage-count schedules). */
export const usageCount = (db: Pick<DB, 'checkouts'>, assetId: string) => live(db.checkouts).filter((c) => c.asset_id === assetId && ['Released', 'Returned'].includes(c.status)).length;
/** The reading a plan is measured against: mileage / hours are typed in on the asset; usage is counted from the Out / In records. */
export function readingFor(db: DB, kind: MaintTaskDef['freq_kind'], assetId: string): number | undefined {
  if (kind === 'usage') return usageCount(db, assetId);
  if (kind === 'hours' || kind === 'mileage') return profileOf(db, assetId)?.last_reading;
  return undefined;
}

/** Next due date / reading after a task was done on `doneOn` at `doneReading`. */
export function nextAfter(def: Pick<MaintTaskDef, 'freq_kind' | 'interval_days' | 'interval_reading'>, doneOn: string, doneReading?: number): { next_due?: string; next_due_reading?: number } {
  const out: { next_due?: string; next_due_reading?: number } = {};
  if ((def.freq_kind === 'date' || def.freq_kind === 'custom') && def.interval_days) out.next_due = addDays(doneOn, def.interval_days);
  if (['hours', 'usage', 'mileage'].includes(def.freq_kind) && def.interval_reading && doneReading !== undefined) out.next_due_reading = round2(doneReading + def.interval_reading);
  return out;
}
export const freqWords = (d: Pick<MaintTaskDef, 'freq_kind' | 'interval_days' | 'interval_reading' | 'custom_note'>) => {
  if (d.freq_kind === 'date') return d.interval_days ? (d.interval_days % 365 === 0 ? `every ${d.interval_days / 365} year(s)` : d.interval_days % 30 === 0 ? `every ${d.interval_days / 30} month(s)` : `every ${d.interval_days} days`) : 'by date';
  if (d.freq_kind === 'mileage') return `every ${d.interval_reading ?? '?'} km`;
  if (d.freq_kind === 'hours') return `every ${d.interval_reading ?? '?'} operating hours`;
  if (d.freq_kind === 'usage') return `every ${d.interval_reading ?? '?'} jobs / uses`;
  return d.custom_note || (d.interval_days ? `every ${d.interval_days} days` : 'custom');
};

export type DueState = MaintStatus | 'Due Soon' | 'Overdue';
/** What to show for a record: Scheduled turns Due Soon (within 14 days / 10% of the interval) and Overdue (past its date or reading). */
export function dueState(db: DB, r: MaintRecord, t: string): DueState {
  if (r.status === 'Deferred') return r.deferred_until && r.deferred_until < t ? 'Overdue' : 'Deferred';
  if (r.status !== 'Scheduled') return r.status;
  if (r.due_date) { const d = diffDays(r.due_date, t); if (d < 0) return 'Overdue'; if (d <= DUE_SOON_DAYS) return 'Due Soon'; }
  if (r.due_reading !== undefined) {
    const plan = db.maint_plans.find((p) => p.id === r.plan_id); const cur = plan ? readingFor(db, plan.freq_kind, r.asset_id) : undefined;
    if (cur !== undefined) { if (cur >= r.due_reading) return 'Overdue'; if (plan?.interval_reading && cur >= r.due_reading - plan.interval_reading * 0.1) return 'Due Soon'; }
  }
  return 'Scheduled';
}
export const isLate = (db: DB, r: MaintRecord, t: string) => dueState(db, r, t) === 'Overdue';

/** Parts for a new record, copied from the plan. */
export const partsFrom = (parts: MaintTaskDef['parts']): MaintPart[] => (parts ?? []).map((p) => ({ ...p, id: uid(), status: 'Needed' as const }));
/** Checklist lines: the task's bullet lines, or the task itself. */
export function checklistFrom(def: Pick<MaintTaskDef, 'task_name' | 'description'>): { label: string; done: boolean }[] {
  const lines = (def.description ?? '').split('\n').map((l) => l.replace(/^[\s\-•*\d.)]+/, '').trim()).filter(Boolean);
  return (lines.length > 1 ? lines : [def.task_name]).map((label) => ({ label, done: false }));
}

/** Plans that need a Scheduled record created now: active, no open record yet, and due within 30 days (or its reading is near / past). */
export function plansToSchedule(db: DB, t: string): MaintPlan[] {
  const open = new Set(live(db.maint_records).filter((r) => OPEN.includes(r.status) && r.plan_id).map((r) => r.plan_id));
  return live(db.maint_plans).filter((p) => {
    if (!p.active || open.has(p.id)) return false;
    const a = db.assets.find((x) => x.id === p.asset_id); if (!a || a.deleted_at || a.status === 'Retired') return false;
    if (p.next_due && diffDays(p.next_due, t) <= GENERATE_DAYS) return true;
    if (p.next_due_reading !== undefined) { const cur = readingFor(db, p.freq_kind, p.asset_id); if (cur !== undefined && cur >= p.next_due_reading - (p.interval_reading ?? 0) * 0.15) return true; }
    return false;
  });
}

/* ---------- parts & stock ---------- */
export const partOpen = (p: MaintPart) => !['Installed', 'Cancelled', 'Received'].includes(p.status);
export function stockShort(db: DB, p: MaintPart): number {
  if (!p.item_id) return 0;
  const av = stockSummary(db, p.item_id).available; return Math.max(0, round2(p.qty - av));
}

/* ---------- dashboard ---------- */
export function maintStats(db: DB, t: string) {
  const recs = live(db.maint_records); const open = recs.filter((r) => OPEN.includes(r.status));
  const wkEnd = addDays(weekStart(t), 6); const mS = monthStart(t), mE = monthEnd(t);
  const state = (r: MaintRecord) => dueState(db, r, t);
  const overdue = open.filter((r) => state(r) === 'Overdue');
  const dueWeek = open.filter((r) => ['Scheduled', 'Due Soon'].includes(state(r)) && r.due_date && r.due_date >= t && r.due_date <= wkEnd);
  const urgent = open.filter((r) => r.priority === 'Urgent');
  const partsAwaiting = open.flatMap((r) => r.parts.filter((p) => ['Needed', 'Requested', 'Ordered'].includes(p.status)).map((p) => ({ r, p })));
  const profiles = live(db.maint_profiles); const renewals: { asset: Asset; what: 'Registration' | 'Insurance'; due: string; days: number }[] = [];
  for (const pr of profiles) {
    const a = db.assets.find((x) => x.id === pr.asset_id && !x.deleted_at); if (!a || a.status === 'Retired') continue;
    for (const [what, due] of [['Registration', pr.registration_due], ['Insurance', pr.insurance_due]] as const) if (due && diffDays(due, t) <= 60) renewals.push({ asset: a, what, due, days: diffDays(due, t) });
  }
  renewals.sort((x, y) => x.days - y.days);
  return {
    open, overdue, dueWeek, urgent, partsAwaiting, renewals,
    underMaintenance: live(db.assets).filter((a) => a.status === 'Under Maintenance'), outOfService: live(db.assets).filter((a) => a.status === 'Out of Service'),
    estMonth: round2(sum(open.filter((r) => r.due_date && r.due_date >= mS && r.due_date <= mE), (r) => r.est_cost)),
    actualMonth: round2(sum(recs.filter((r) => r.status === 'Completed' && r.completed_at && r.completed_at.slice(0, 10) >= mS && r.completed_at.slice(0, 10) <= mE), (r) => r.actual_cost ?? 0)),
  };
}

/** Reminders: 14 / 7 / 1 days before a due date, then overdue; urgent work; requests waiting for approval; registration / insurance renewals. */
export interface MaintAlert { key: string; title: string; body: string; severity: 'info' | 'warn' | 'critical'; to: string }
export function maintAlerts(db: DB, t: string): MaintAlert[] {
  const out: MaintAlert[] = []; const name = (id: string) => { const a = db.assets.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : 'Asset'; };
  const bucket = (d: number) => (d <= 1 ? 1 : d <= 7 ? 7 : 14);
  for (const r of live(db.maint_records)) {
    if (r.status === 'Requested') out.push({ key: `mt-req:${r.id}`, title: 'Maintenance request awaiting approval', body: `${name(r.asset_id)}: ${r.title}${r.request_note ? ` — ${r.request_note}` : ''}`, severity: r.priority === 'Urgent' ? 'critical' : 'warn', to: '/maintenance' });
    if (!OPEN.includes(r.status) || r.status === 'Requested') continue;
    const st = dueState(db, r, t);
    if (st === 'Overdue') out.push({ key: `mt-over:${r.id}`, title: 'Maintenance overdue', body: `${name(r.asset_id)}: ${r.title}${r.due_date ? ` was due ${r.due_date}` : ''}.`, severity: 'critical', to: '/maintenance' });
    else if (r.due_date) { const d = diffDays(r.due_date, t); if (d >= 0 && d <= DUE_SOON_DAYS) out.push({ key: `mt-due${bucket(d)}:${r.id}`, title: d === 0 ? 'Maintenance due today' : `Maintenance due in ${d} day(s)`, body: `${name(r.asset_id)}: ${r.title}.`, severity: d <= 1 ? 'warn' : 'info', to: '/maintenance' }); }
    if (r.priority === 'Urgent') out.push({ key: `mt-urgent:${r.id}`, title: 'Urgent maintenance', body: `${name(r.asset_id)}: ${r.title}.`, severity: 'critical', to: '/maintenance' });
  }
  for (const pr of live(db.maint_profiles)) {
    const a = db.assets.find((x) => x.id === pr.asset_id && !x.deleted_at); if (!a || a.status === 'Retired') continue;
    for (const [what, due] of [['Registration', pr.registration_due], ['Insurance', pr.insurance_due]] as const) {
      if (!due) continue; const d = diffDays(due, t);
      if (d < 0) out.push({ key: `mt-ren-over:${pr.id}:${what}`, title: `${what} expired`, body: `${name(a.id)} ${what.toLowerCase()} expired ${due}.`, severity: 'critical', to: '/maintenance?tab=assets' });
      else if (d <= DUE_SOON_DAYS) out.push({ key: `mt-ren${bucket(d)}:${pr.id}:${what}`, title: `${what} renewal in ${d} day(s)`, body: `${name(a.id)} ${what.toLowerCase()} is due ${due}.`, severity: d <= 1 ? 'warn' : 'info', to: '/maintenance?tab=assets' });
    }
  }
  return out;
}

export function maintTone(st: DueState): string { return st === 'Overdue' ? 'red' : st === 'Due Soon' ? 'amber' : st === 'In Progress' ? 'teal' : st === 'Completed' ? 'green' : st === 'Requested' ? 'blue' : 'gray'; }
export type { MaintProfile };
