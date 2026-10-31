import { addDays, addMonths, diffDays, fmtDate } from './dates';
import { PHASE_DEFS, SERVICE_KEYS, isOut } from './logic';
import type { Customer, Data, LeadSource, Mechanic, PhaseKey, Project, ServiceType, SmsKind } from './types';

export const SOURCES: Record<LeadSource, string> = { organic: 'Organic', ads: 'Ads', sms: 'SMS', social: 'Social media', referral: 'Referral' };
export const SOURCE_KEYS = Object.keys(SOURCES) as LeadSource[];

/** The usual things checked when a car is dropped off. */
export const DEFAULT_CHECKLIST = ['Spare tyre', 'Jack and tools', 'Floor mats', 'Head unit / stereo', 'Spare key', 'Valuables removed', 'Fuel level noted', 'Existing scratches photographed'];

export const isBooked = (p: Project) => p.status !== 'quote';
export const receivedDate = (p: Project) => p.receivedOn ?? p.startDate;
export const paidTotal = (p: Project) => p.payments.reduce((s, x) => s + x.amount, 0);
export const isPaidInFull = (p: Project) => p.budget > 0 && paidTotal(p) >= p.budget;
export const missingItems = (p: Project) => (p.intake ? [...(p.intake.orcr ? [] : ['OR/CR copy']), ...p.intake.items.filter((i) => !i.present).map((i) => i.label)] : []);

/* ---------- Customers ---------- */

/** Days until the next birthday, 0 if it is today. Feb 29 is kept on Feb 28 in other years. */
export function daysToBirthday(birthday: string, today: string): number {
  const [, m, d] = birthday.split('-').map(Number);
  const year = Number(today.slice(0, 4));
  const on = (y: number) => {
    const leap = new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1;
    const day = m === 2 && d === 29 && !leap ? 28 : d;
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  const this_ = on(year);
  return diffDays(today, this_ >= today ? this_ : on(year + 1));
}

export function upcomingBirthdays(d: Data, today: string, within = 14) {
  return d.customers
    .filter((c) => c.birthday)
    .map((c) => ({ customer: c, daysAway: daysToBirthday(c.birthday!, today) }))
    .filter((x) => x.daysAway <= within)
    .sort((a, b) => a.daysAway - b.daysAway);
}

export function customerStats(d: Data, c: Customer) {
  const jobs = d.projects.filter((p) => p.customerId === c.id && isBooked(p)).sort((a, b) => receivedDate(b).localeCompare(receivedDate(a)));
  const ltv = jobs.reduce((s, p) => s + paidTotal(p), 0);
  const cars = [...new Map(jobs.map((p) => [`${p.year} ${p.make} ${p.model}`, p])).values()];
  const finished = jobs.filter((p) => p.status === 'delivered' || p.status === 'completed').length;
  return { jobs, ltv, cars, finished, kind: finished > 0 || jobs.length > 1 ? ('past' as const) : ('new' as const), last: jobs[0] ? receivedDate(jobs[0]) : undefined };
}

/* ---------- Text messages (demo only) ---------- */

export function smsText(kind: SmsKind, c: Customer, p?: Project): string {
  const hi = `Hi ${c.name.split(' ')[0]},`;
  const car = p ? `${p.make} ${p.model}` : 'car';
  switch (kind) {
    case 'ready': return `${hi} your ${car} is ready for pickup at Alex Car Restoration. Please bring a valid ID. Thank you!`;
    case 'payment': return `${hi} a friendly reminder: the balance for your ${car} is ₱${p ? Math.max(0, p.budget - paidTotal(p)).toLocaleString('en-PH') : '0'}. Thank you!`;
    case 'checkup': return `${hi} how is your ${car} after the work? We would like to check on it. Reply or call us to book a free check-up.`;
    case 'birthday': return `Happy birthday, ${c.name.split(' ')[0]}! From all of us at Alex Car Restoration. Enjoy your day!`;
    case 'approval': return `${hi} we need your OK to continue the work on your ${car}. Please call or reply so we can proceed.`;
    default: return '';
  }
}

export const SMS_LABEL: Record<SmsKind, string> = { ready: 'Ready for pickup', payment: 'Payment reminder', checkup: 'Check-up', birthday: 'Birthday greeting', approval: 'Approval needed', custom: 'Message' };

/** Check-up with the client is due a week after the car goes out. */
export const CHECKUP_DAYS = 7;

export function checkupsDue(d: Data, today: string, window = 3) {
  return d.projects
    .filter((p) => p.gatepass?.outOn && !p.gatepass.checkupDone)
    .map((p) => ({ project: p, due: addDays(p.gatepass!.outOn!, CHECKUP_DAYS), daysAway: diffDays(today, addDays(p.gatepass!.outOn!, CHECKUP_DAYS)) }))
    .filter((x) => x.daysAway <= window)
    .sort((a, b) => a.daysAway - b.daysAway);
}

/* ---------- Date ranges ---------- */

export type RangeKey = '7d' | '30d' | 'month' | 'quarter' | 'year';
export const RANGE_LABEL: Record<RangeKey, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', month: 'This month', quarter: 'This quarter', year: 'This year' };
export const RANGE_PREV: Record<RangeKey, string> = { '7d': 'the 7 days before', '30d': 'the 30 days before', month: 'last month', quarter: 'last quarter', year: 'last year' };

export interface Range { key: RangeKey; start: string; end: string; prevStart: string; prevEnd: string }

/** The range ends today. The comparison range is the one before it, cut to the same number of days. */
export function rangeOf(key: RangeKey, today: string): Range {
  let start: string;
  let prevStart: string;
  if (key === '7d') { start = addDays(today, -6); prevStart = addDays(start, -7); }
  else if (key === '30d') { start = addDays(today, -29); prevStart = addDays(start, -30); }
  else if (key === 'month') { start = today.slice(0, 8) + '01'; prevStart = addMonths(start, -1); }
  else if (key === 'quarter') { const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1; start = `${today.slice(0, 4)}-${String(q).padStart(2, '0')}-01`; prevStart = addMonths(start, -3); }
  else { start = `${today.slice(0, 4)}-01-01`; prevStart = `${Number(today.slice(0, 4)) - 1}-01-01`; }
  const span = diffDays(start, today);
  return { key, start, end: today, prevStart, prevEnd: addDays(prevStart, span) < start ? addDays(prevStart, span) : addDays(start, -1) };
}

export const rangeText = (a: string, b: string) => `${fmtDate(a)} ${a.slice(0, 4)} – ${fmtDate(b)} ${b.slice(0, 4)}`;

/* ---------- Insights ---------- */

const inR = (date: string | undefined, a: string, b: string) => !!date && date >= a && date <= b;

export interface Units {
  received: Project[];
  released: Project[];
  delayed: Project[];
  backjobs: Project[];
  byService: Record<ServiceType, number>;
  byBrand: { brand: string; count: number }[];
  /** Cash received in the range. */
  billed: number;
  billedByService: Record<ServiceType, number>;
}

export function unitsFor(d: Data, a: string, b: string, today: string): Units {
  const booked = d.projects.filter(isBooked);
  const received = booked.filter((p) => inR(receivedDate(p), a, b));
  const released = booked.filter((p) => inR(p.releasedOn, a, b));
  // Delayed: the promised date fell in the range and the car was not out by then.
  const delayed = booked.filter((p) => inR(p.targetDate, a, b) && (p.releasedOn ? p.releasedOn > p.targetDate : p.targetDate < today && p.status !== 'on_hold'));
  const backjobs = received.filter((p) => p.backjobOf);
  const zero = () => Object.fromEntries(SERVICE_KEYS.map((k) => [k, 0])) as Record<ServiceType, number>;
  const byService = zero();
  received.forEach((p) => { byService[p.service] += 1; });
  const brands = new Map<string, number>();
  received.forEach((p) => brands.set(p.make, (brands.get(p.make) ?? 0) + 1));
  const billedByService = zero();
  let billed = 0;
  for (const p of d.projects) for (const x of p.payments) if (inR(x.date, a, b)) { billedByService[p.service] += x.amount; billed += x.amount; }
  return { received, released, delayed, backjobs, byService, byBrand: [...brands].map(([brand, count]) => ({ brand, count })).sort((x, y) => y.count - x.count || x.brand.localeCompare(y.brand)), billed, billedByService };
}

/** Cash received in each of the last N calendar months. */
export function salesByMonth(d: Data, today: string, months = 12) {
  const first = today.slice(0, 7) + '-01';
  return Array.from({ length: months }, (_, i) => {
    const start = addMonths(first, -(months - 1 - i));
    const key = start.slice(0, 7);
    const value = d.projects.flatMap((p) => p.payments).filter((x) => x.date.slice(0, 7) === key).reduce((s, x) => s + x.amount, 0);
    return { key, label: new Date(start + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }), value };
  });
}

/** The mechanic who put the most hours into a job, used to own a back job. */
export function ownerOf(d: Data, projectId: string): string | undefined {
  const hrs = new Map<string, number>();
  for (const t of d.tasks) if (t.projectId === projectId && t.mechanicId) hrs.set(t.mechanicId, (hrs.get(t.mechanicId) ?? 0) + (t.actualHours || t.estHours));
  const top = [...hrs].sort((x, y) => y[1] - x[1])[0];
  return top?.[0] ?? d.projects.find((p) => p.id === projectId)?.leadMechanicId;
}

export interface TeamRow { mechanic: Mechanic; current: number; past: number; hours: number; backjobs: number; present: number; late: number; absent: number; leave: number }

export function teamFor(d: Data, a: string, b: string): TeamRow[] {
  const proj = new Map(d.projects.map((p) => [p.id, p]));
  const backjobs = d.projects.filter((p) => p.backjobOf && inR(receivedDate(p), a, b));
  return d.mechanics.filter((m) => m.active).map((m) => {
    const mine = d.tasks.filter((t) => t.mechanicId === m.id);
    const current = new Set(mine.filter((t) => t.status !== 'done' && proj.get(t.projectId)?.status === 'active').map((t) => t.projectId)).size;
    const past = new Set(mine.filter((t) => t.status === 'done' && inR(t.date, a, b)).map((t) => t.projectId)).size;
    const hours = mine.filter((t) => t.status === 'done' && inR(t.date, a, b)).reduce((s, t) => s + t.actualHours, 0);
    const att = d.attendance.filter((r) => r.mechanicId === m.id && inR(r.date, a, b));
    return {
      mechanic: m, current, past, hours: Math.round(hours * 10) / 10,
      backjobs: backjobs.filter((p) => ownerOf(d, p.backjobOf!) === m.id).length,
      present: att.filter((r) => r.status === 'present' || r.status === 'half').length, late: att.filter((r) => r.status === 'late').length,
      absent: att.filter((r) => r.status === 'absent').length, leave: att.filter((r) => isOut(r) && r.status !== 'absent').length,
    };
  });
}

/** Hours worked on each stage in the range, across all jobs. */
export function hoursByStage(d: Data, a: string, b: string) {
  const by = new Map<PhaseKey, number>();
  for (const t of d.tasks) if (t.status === 'done' && inR(t.date, a, b)) by.set(t.phaseKey, (by.get(t.phaseKey) ?? 0) + t.actualHours);
  return [...by].map(([key, hours]) => ({ key, label: PHASE_DEFS[key].label, hours: Math.round(hours * 10) / 10 })).sort((x, y) => y.hours - x.hours);
}

/** Percent change from `prev` to `now`, or null when there is nothing to compare with. */
export const pctChange = (now: number, prev: number): number | null => (prev === 0 ? null : Math.round(((now - prev) / prev) * 100));

/* ---------- Dashboard series ---------- */

/** Cars in, cars out and cash received, in even steps across the range. */
export function trendFor(d: Data, r: Range) {
  const step = r.key === '7d' ? 1 : r.key === '30d' ? 3 : r.key === 'year' ? 30 : 7;
  const out: { label: string; start: string; received: number; released: number; billed: number }[] = [];
  for (let a = r.start; a <= r.end; a = addDays(a, step)) {
    const b = addDays(a, step - 1) > r.end ? r.end : addDays(a, step - 1);
    const u = unitsFor(d, a, b, r.end);
    out.push({ label: step >= 30 ? new Date(a + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) : fmtDate(a), start: a, received: u.received.length, released: u.released.length, billed: u.billed });
  }
  return out;
}

/** Share of released cars that left on or before the promised date. */
export const onTimeRate = (u: Units): number | null => (u.released.length ? Math.round((u.released.filter((p) => !p.releasedOn || p.releasedOn <= p.targetDate).length / u.released.length) * 100) : null);

/** Hours worked in the range as a share of what the active team could have worked. */
export function shopLoad(d: Data, a: string, b: string): number {
  const team = d.mechanics.filter((m) => m.active);
  let capacity = 0;
  for (let day = a; day <= b; day = addDays(day, 1)) if (!isWeekendDay(day)) capacity += team.reduce((s, m) => s + m.dailyHours, 0);
  const hours = d.tasks.filter((t) => t.status === 'done' && t.date >= a && t.date <= b).reduce((s, t) => s + t.actualHours, 0);
  return capacity ? Math.round((hours / capacity) * 100) : 0;
}
const isWeekendDay = (iso: string) => { const w = new Date(iso + 'T00:00:00Z').getUTCDay(); return w === 0 || w === 6; };

/** Where the customers of the cars received in the range first heard of the shop. */
export function sourcesFor(d: Data, received: Project[]) {
  const by = new Map<string, number>();
  for (const p of received) { const k = d.customers.find((c) => c.id === p.customerId)?.source ?? 'unknown'; by.set(k, (by.get(k) ?? 0) + 1); }
  return [...by].map(([key, count]) => ({ key, label: key === 'unknown' ? 'Not recorded' : SOURCES[key as LeadSource], count })).sort((x, y) => y.count - x.count);
}
