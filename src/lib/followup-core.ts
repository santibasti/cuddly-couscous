// Client Lifetime Value & Maintenance Follow-Up — pure calculations (no store access), shared by the app, the seed data and the tests.
// Nothing here changes an invoice, payment or any existing financial calculation: it only reads them.
import type { Client, DB, FollowUp, FollowUpSlot, FollowUpState, Job, ServiceCode } from './types';
import { invoiceBalance, invoiceTotals, isDone, jobRevenue, paymentCounts } from './business';
import { addDays, diffDays, monthEnd, money, round2, sum, weekStart } from './util';

export const FU_DEFAULT = { short: 6, long: 12 };
export const SOON_DAYS = 30;          // "Due Soon" = due within the next 30 days
export const PRE_NOTICE_DAYS = 14;    // Admin is notified 14 days before each follow-up date
export const ACTION_STATES = ['Contacted', 'Follow-Up Scheduled', 'Quotation Sent', 'Booked', 'Not Interested', 'Snoozed'] as const;
/** Still waiting on an outcome. */
export const OPEN_STATES: FollowUpState[] = ['Open', 'Contacted', 'Follow-Up Scheduled', 'Quotation Sent', 'Snoozed'];
/** Outcome reached: the client booked, or is not interested. */
export const FINAL_STATES: FollowUpState[] = ['Booked', 'Not Interested'];
export type ClientFollowStatus = 'Not Due' | 'Due Soon' | 'Due Today' | 'Overdue' | 'Contacted' | 'Booked' | 'Not Interested';
export const FOLLOW_STATUSES: ClientFollowStatus[] = ['Not Due', 'Due Soon', 'Due Today', 'Overdue', 'Contacted', 'Booked', 'Not Interested'];

/** Add calendar months to a YYYY-MM-DD date (31 Aug + 6 months = 28/29 Feb, never rolls into March). */
export function addMonths(s: string, n: number): string {
  const y = +s.slice(0, 4), m = +s.slice(5, 7) - 1, d = +s.slice(8, 10);
  const t = m + n; const ty = y + Math.floor(t / 12); const tm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
export const intervalWords = (months: number) => (months === 12 ? '1 Year' : months % 12 === 0 ? `${months / 12} Years` : months === 1 ? '1 Month' : `${months} Months`);
export const intervalLabel = (months: number) => `${intervalWords(months)} After Last Completed Service`;

/* ---------- completed services ---------- */
export const serviceDate = (j: Job) => (j.completed_at ?? j.start_at).slice(0, 10);
/** Completed / closed jobs of a client, newest first. */
export function completedJobs(db: Pick<DB, 'jobs'>, clientId: string): Job[] {
  return db.jobs.filter((j) => j.client_id === clientId && !j.deleted_at && isDone(j.status))
    .sort((a, b) => serviceDate(b).localeCompare(serviceDate(a)) || b.start_at.localeCompare(a.start_at) || b.id.localeCompare(a.id));
}
export const serviceNames = (db: Pick<DB, 'services'>, codes: ServiceCode[]) => codes.map((c) => db.services.find((s) => s.code === c)?.name ?? c).join(', ') || '—';

/** Interval for a client: the client's own rule, else the rule for the last service type, else 6 months / 1 year. */
export function intervalFor(db: Pick<DB, 'followup_rules'>, clientId: string, codes: ServiceCode[]): { short: number; long: number; source: 'Client rule' | 'Service rule' | 'Default' } {
  const rules = (db.followup_rules ?? []).filter((r) => !r.deleted_at);
  const c = rules.find((r) => r.client_id === clientId);
  if (c) return { short: c.short_months, long: c.long_months, source: 'Client rule' };
  const s = rules.filter((r) => r.service_code && codes.includes(r.service_code)).sort((a, b) => a.short_months - b.short_months)[0];
  if (s) return { short: s.short_months, long: s.long_months, source: 'Service rule' };
  return { ...FU_DEFAULT, source: 'Default' };
}

/* ---------- lifetime value (read-only over the existing invoices and payments) ---------- */
export interface ClientValue {
  billed: number;        // approved (finalized) invoices, VAT-inclusive total
  collected: number;     // verified, cleared payments received (cash/transfer/cheque/GCash)
  whtCredited: number;   // withholding-tax credits (2307) that also settled invoices
  outstanding: number;   // existing receivables balance
  completed: number;     // completed / closed jobs
  lastJob?: Job; lastDate?: string; lastTypeCodes: ServiceCode[]; lastType: string; location: string;
}
export function clientValue(db: DB, c: Client): ClientValue {
  const invs = db.invoices.filter((i) => i.client_id === c.id && !i.deleted_at);
  const pays = db.payments.filter((p) => p.client_id === c.id && paymentCounts(p));
  const jobs = completedJobs(db, c.id);
  const last = jobs[0];
  const site = last ? db.sites.find((s) => s.id === last.site_id) : undefined;
  return {
    billed: round2(sum(invs.filter((i) => i.status === 'Approved'), (i) => invoiceTotals(i).total)),
    collected: round2(sum(pays, (p) => p.amount)), whtCredited: round2(sum(pays, (p) => p.wht_amount)),
    outstanding: round2(sum(invs, (i) => invoiceBalance(db, i))),
    completed: jobs.length, lastJob: last, lastDate: last ? serviceDate(last) : undefined,
    lastTypeCodes: last?.service_codes ?? [], lastType: last ? serviceNames(db, last.service_codes) : '—',
    location: (site ? `${site.name} — ${site.address}` : c.address) || '—',
  };
}

/* ---------- follow-up status ---------- */
/** The date a follow-up is actually due: a snooze pushes it out, never earlier. */
export const effectiveDue = (f: Pick<FollowUp, 'due_date' | 'snoozed_until' | 'status'>) => (f.status === 'Snoozed' && f.snoozed_until && f.snoozed_until > f.due_date ? f.snoozed_until : f.due_date);

/** Follow-ups of the client's newest completed service that are not superseded: 6-month first, then 1-year. */
export function currentCycle(db: Pick<DB, 'jobs' | 'followups'>, clientId: string): FollowUp[] {
  const last = completedJobs(db, clientId)[0];
  if (!last) return [];
  return (db.followups ?? []).filter((f) => f.client_id === clientId && !f.deleted_at && f.reference_job_id === last.id && f.status !== 'Superseded')
    .sort((a, b) => (a.slot === b.slot ? 0 : a.slot === 'short' ? -1 : 1));
}
/** Once the client has booked, or declined, the cycle is finished: the other follow-up in it sends no more reminders. */
export const cycleFinal = (cycle: FollowUp[]) => cycle.find((f) => FINAL_STATES.includes(f.status));
/** The follow-up that matters now: the cycle's outcome if there is one, else the first one still open. */
export const focusOf = (cycle: FollowUp[]): FollowUp | undefined => cycleFinal(cycle) ?? cycle.find((f) => OPEN_STATES.includes(f.status));

export interface ClientFollow { focus?: FollowUp; due?: string; days?: number; status: ClientFollowStatus; detail?: FollowUpState; slot?: FollowUpSlot }
export function clientFollow(db: Pick<DB, 'jobs' | 'followups'>, clientId: string, t: string): ClientFollow {
  const f = focusOf(currentCycle(db, clientId));
  if (!f) return { status: 'Not Due' };
  const due = effectiveDue(f); const days = diffDays(due, t);
  const status: ClientFollowStatus = f.status === 'Booked' ? 'Booked' : f.status === 'Not Interested' ? 'Not Interested'
    : ['Contacted', 'Follow-Up Scheduled', 'Quotation Sent'].includes(f.status) ? 'Contacted'
    : days < 0 ? 'Overdue' : days === 0 ? 'Due Today' : days <= SOON_DAYS ? 'Due Soon' : 'Not Due';
  return { focus: f, due, days, status, detail: f.status, slot: f.slot };
}
export const FOLLOW_TONE: Record<ClientFollowStatus, string> = { 'Not Due': 'gray', 'Due Soon': 'amber', 'Due Today': 'teal', Overdue: 'red', Contacted: 'blue', Booked: 'green', 'Not Interested': 'gray' };

/* ---------- keeping follow-ups in step with completed services ---------- */
type NewFollowUp = Omit<FollowUp, 'id' | 'created_at' | 'updated_at' | 'created_by'>;
export interface FollowUpPlan { inserts: NewFollowUp[]; patches: { id: string; patch: Partial<FollowUp>; summary: string }[] }

/**
 * Works out what must change so that every client with a completed service has exactly one 6-month and one 1-year follow-up
 * counted from the newest completed service:
 *  1. a follow-up that was acted on and then led to a new booking becomes Booked;
 *  2. open follow-ups of an older service are Superseded (kept as history, no more reminders);
 *  3. missing follow-ups are created once per client + interval + service — never duplicated;
 *  4. open follow-ups follow a changed custom interval.
 */
export function planFollowUps(db: DB, t: string): FollowUpPlan {
  const plan: FollowUpPlan = { inserts: [], patches: [] };
  const fus = (db.followups ?? []).filter((f) => !f.deleted_at);
  for (const c of db.clients.filter((x) => !x.deleted_at)) {
    const last = completedJobs(db, c.id)[0];
    const mine = fus.filter((f) => f.client_id === c.id);
    const patched = new Map<string, Partial<FollowUp>>();
    const touch = (f: FollowUp, patch: Partial<FollowUp>, summary: string) => { patched.set(f.id, { ...patched.get(f.id), ...patch }); plan.patches.push({ id: f.id, patch, summary }); };
    // 1. a booking made after the client was contacted
    for (const f of mine.filter((x) => ['Contacted', 'Follow-Up Scheduled', 'Quotation Sent'].includes(x.status) && !x.booked_job_id)) {
      const since = f.actioned_at ?? f.updated_at;
      const job = db.jobs.filter((j) => j.client_id === c.id && !j.deleted_at && !j.origin_job_id && j.id !== f.reference_job_id && !['Cancelled', 'Rescheduled'].includes(j.status) && j.created_at >= since)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (job) touch(f, { status: 'Booked', booked_job_id: job.id, note: f.note }, `Follow-up converted to booking ${job.number}`);
    }
    if (!last) continue;
    const lastDate = serviceDate(last);
    const state = (f: FollowUp) => (patched.get(f.id)?.status ?? f.status) as FollowUpState;
    // 2. older open follow-ups are replaced by the newest completed service
    for (const f of mine) {
      if (f.reference_job_id !== last.id && f.reference_date <= lastDate && OPEN_STATES.includes(state(f))) touch(f, { status: 'Superseded', superseded_by_job_id: last.id }, `Follow-up reset: newer service ${last.number} completed`);
    }
    // 3 + 4. one follow-up per interval for the newest service
    const iv = intervalFor(db, c.id, last.service_codes);
    for (const slot of ['short', 'long'] as const) {
      const months = iv[slot]; const due = addMonths(lastDate, months);
      const have = mine.find((f) => f.slot === slot && f.reference_job_id === last.id);
      if (!have) {
        plan.inserts.push({ client_id: c.id, slot, months, reference_job_id: last.id, reference_date: lastDate, service_codes: [...last.service_codes], due_date: due, status: 'Open', history: [] });
      } else if (have.status === 'Open' && (have.due_date !== due || have.months !== months || have.reference_date !== lastDate)) {
        touch(have, { due_date: due, months, reference_date: lastDate }, `Follow-up date recalculated (${intervalWords(months)})`);
      }
    }
  }
  void t;
  return plan;
}

/* ---------- Admin reminders ---------- */
export interface FollowUpAlert { key: string; client_id: string; title: string; body: string; severity: 'info' | 'warn' | 'critical' }
export function suggestedAction(db: DB, f: FollowUp, v: ClientValue, c: Client): string {
  const owe = v.outstanding > 0.005 ? ` Ask about the unpaid ${money(v.outstanding)} first.` : '';
  if (f.slot === 'short' && f.months <= 9) return `Call ${c.contact_person} to check on the ${v.lastType.toLowerCase()} done on ${f.reference_date} and offer a maintenance cleaning.${owe}`;
  return `Offer an annual maintenance quotation for ${v.lastType.toLowerCase()} and propose dates; mention the ${v.completed} service${v.completed === 1 ? '' : 's'} completed so far.${owe}`;
}
export function followUpDetails(db: DB, f: FollowUp) {
  const c = db.clients.find((x) => x.id === f.client_id)!; const v = clientValue(db, c);
  return { client: c, value: v, action: suggestedAction(db, f, v, c) };
}
/** Reminder text shown to the Admin: client, contact, location, last service, lifetime figures, balance and the suggested action. */
export function alertBody(db: DB, f: FollowUp): string {
  const { client: c, value: v, action } = followUpDetails(db, f);
  return `${c.name} · ${c.contact_person} ${c.mobile || '(no mobile)'} · ${v.location}. Last service ${f.reference_date} (${serviceNames(db, f.service_codes)}). Lifetime billed ${money(v.billed)} · ${v.completed} completed service${v.completed === 1 ? '' : 's'}${v.outstanding > 0.005 ? ` · Outstanding ${money(v.outstanding)}` : ''}. Suggested: ${action}`;
}
/** Notify 14 days before and on each follow-up date. Only follow-ups still waiting for the Admin's first move send reminders (Open, or a snooze that has ended). */
export function followUpAlerts(db: DB, t: string): FollowUpAlert[] {
  const out: FollowUpAlert[] = [];
  for (const c of db.clients.filter((x) => !x.deleted_at)) {
    const cycle = currentCycle(db, c.id);
    if (cycleFinal(cycle)) continue;
    for (const f of cycle) {
      if (!['Open', 'Snoozed'].includes(f.status)) continue;
      const due = effectiveDue(f); const dt = diffDays(due, t); const label = intervalWords(f.months);
      if (dt > PRE_NOTICE_DAYS) continue;
      const when = dt > 0 ? `in ${dt} day${dt === 1 ? '' : 's'}` : dt === 0 ? 'due today' : `overdue by ${-dt} day${dt === -1 ? '' : 's'}`;
      out.push({
        key: `${dt > 0 ? 'fu-pre' : 'fu-due'}:${f.id}:${due}`, client_id: c.id,
        title: `${label} follow-up ${when} — ${c.name}`, body: `Follow-up date ${due}. ${alertBody(db, f)}`, severity: dt < 0 ? 'warn' : 'info',
      });
    }
  }
  return out;
}

/* ---------- dashboard ---------- */
/** Revenue a follow-up booking produced: the linked job's billed (else expected) net revenue. Cancelled bookings earn nothing. */
export function bookingRevenue(db: DB, f: FollowUp): number {
  const j = f.booked_job_id ? db.jobs.find((x) => x.id === f.booked_job_id && !x.deleted_at) : undefined;
  return j && j.status !== 'Cancelled' ? round2(jobRevenue(db, j).revenue) : 0;
}
export function followUpStats(db: DB, t: string) {
  const weekEnd = addDays(weekStart(t), 6); const mEnd = monthEnd(t);
  const active: { f: FollowUp; due: string }[] = [];
  for (const c of db.clients.filter((x) => !x.deleted_at)) {
    const cycle = currentCycle(db, c.id);
    if (cycleFinal(cycle)) continue;
    const f = focusOf(cycle); if (f) active.push({ f, due: effectiveDue(f) });
  }
  const booked = (db.followups ?? []).filter((f) => !f.deleted_at && f.status === 'Booked');
  return {
    week: active.filter((a) => a.due >= t && a.due <= weekEnd), month: active.filter((a) => a.due >= t && a.due <= mEnd), overdue: active.filter((a) => a.due < t),
    converted: booked, revenue: round2(sum(booked, (f) => bookingRevenue(db, f))),
  };
}
