import { addDays, addMonths, addYears, diffDays, fmtDate as fmtShort, isWeekend } from './dates';
import { LABOR_COST_PER_HOUR } from './rates';
import type { Attendance, AttendanceStatus, Data, Mechanic, Part, PartKind, PartStatus, Phase, PhaseKey, Project, ServiceType, Task } from './types';

/** Every step any service can have, with its label and how much of a job it represents. */
export const PHASE_DEFS: Record<PhaseKey, { label: string; short: string; weight: number }> = {
  intake: { label: 'Intake & Assessment', short: 'Intake', weight: 1 },
  teardown: { label: 'Teardown', short: 'Teardown', weight: 2 },
  body: { label: 'Bodywork', short: 'Body', weight: 5 },
  paint: { label: 'Paint', short: 'Paint', weight: 3 },
  mechanical: { label: 'Engine & Mechanical', short: 'Mechanical', weight: 5 },
  interior: { label: 'Interior', short: 'Interior', weight: 3 },
  assembly: { label: 'Reassembly', short: 'Assembly', weight: 3 },
  qc: { label: 'Testing & QC', short: 'QC', weight: 1 },
  delivery: { label: 'Delivery', short: 'Delivery', weight: 1 },
  inspect: { label: 'Inspection & Estimate', short: 'Inspect', weight: 1 },
  prep: { label: 'Prep & Body Repair', short: 'Prep', weight: 4 },
  prime: { label: 'Prime & Seal', short: 'Prime', weight: 2 },
  cure: { label: 'Curing', short: 'Cure', weight: 1 },
  polish: { label: 'Polish & Finish', short: 'Polish', weight: 2 },
  checkin: { label: 'Check-in & Photos', short: 'Check-in', weight: 1 },
  wash: { label: 'Wash & Decontamination', short: 'Wash', weight: 2 },
  correction: { label: 'Paint Correction', short: 'Correction', weight: 4 },
  coating: { label: 'Coating Application', short: 'Coating', weight: 3 },
};

export interface ServiceDef {
  label: string;
  short: string;
  /** Pill colour used wherever the service is shown. */
  tone: 'amber' | 'orange' | 'blue' | 'violet';
  /** How long a typical job runs, used as the default target date. */
  typicalDays: number;
  /** "estimate" jobs are quoted per car; "package" jobs are sold from a price list. */
  pricing: 'estimate' | 'package';
  hint: string;
  phases: PhaseKey[];
}

export const SERVICES: Record<ServiceType, ServiceDef> = {
  restoration: { label: 'Restoration', short: 'Restoration', tone: 'amber', typicalDays: 120, pricing: 'estimate', hint: 'Weeks to months', phases: ['intake', 'teardown', 'body', 'paint', 'mechanical', 'interior', 'assembly', 'qc', 'delivery'] },
  paint: { label: 'Paint', short: 'Paint', tone: 'orange', typicalDays: 10, pricing: 'estimate', hint: 'Days to two weeks', phases: ['inspect', 'prep', 'prime', 'paint', 'cure', 'polish', 'qc', 'delivery'] },
  detailing: { label: 'Detailing', short: 'Detailing', tone: 'blue', typicalDays: 1, pricing: 'package', hint: 'Hours to two days', phases: ['checkin', 'wash', 'interior', 'polish', 'qc', 'delivery'] },
  ceramic: { label: 'Ceramic Coating', short: 'Ceramic', tone: 'violet', typicalDays: 3, pricing: 'package', hint: 'One to three days plus curing', phases: ['inspect', 'wash', 'correction', 'coating', 'cure', 'qc', 'delivery'] },
};
export const SERVICE_KEYS = Object.keys(SERVICES) as ServiceType[];

export interface PackageDef { name: string; price: number; scope: string; warrantyYears?: number }

/** Demo price list for the fixed-price services. Alex replaces these with his real packages. */
export const PACKAGES: Record<'detailing' | 'ceramic', PackageDef[]> = {
  detailing: [
    { name: 'Express Wash & Wax', price: 2500, scope: 'Hand wash, wheels and tyres, spray wax, interior vacuum.' },
    { name: 'Interior Detail', price: 5500, scope: 'Deep clean of seats, carpets, panels and glass, with leather care.' },
    { name: 'Full Detail', price: 9500, scope: 'Full interior detail, exterior wash and clay, machine polish and sealant.' },
    { name: 'Premium Detail', price: 18000, scope: 'Full detail plus engine bay, headlight restoration and a two-step polish.' },
  ],
  ceramic: [
    { name: 'Ceramic Coating · 1 year', price: 22000, scope: 'Single-stage correction and one layer of coating.', warrantyYears: 1 },
    { name: 'Ceramic Coating · 3 year', price: 38000, scope: 'Two-stage correction and two layers of coating.', warrantyYears: 3 },
    { name: 'Ceramic Coating · 5 year', price: 58000, scope: 'Full paint correction and a multi-layer coating with wheels and glass.', warrantyYears: 5 },
  ],
};

export const phaseLabel = (k: PhaseKey) => PHASE_DEFS[k].label;
export const phaseShort = (k: PhaseKey) => PHASE_DEFS[k].short;
export const serviceLabel = (s: ServiceType) => SERVICES[s].label;

export const BAYS = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Paint booth', 'Prep bay', 'Media blast', 'Detail bay', 'Coating room'];

/**
 * Lay a service's steps across [start, target] in proportion to their weight.
 * When there are at least as many days as steps, each step gets its own days.
 * Short jobs (a detail finished in one day) share days, so several steps can fall on the same date.
 */
export function buildPhases(start: string, target: string, service: ServiceType = 'restoration'): Phase[] {
  const keys = SERVICES[service].phases;
  const weights = keys.map((k) => PHASE_DEFS[k].weight);
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const span = Math.max(0, diffDays(start, target));
  if (span + 1 < keys.length) {
    let acc = 0;
    return keys.map((key, i) => {
      const from = Math.floor((acc / weightSum) * (span + 1));
      acc += weights[i];
      const to = Math.max(from, Math.ceil((acc / weightSum) * (span + 1)) - 1);
      return { key, status: 'todo' as const, start: addDays(start, from), end: addDays(start, Math.min(span, to)) };
    });
  }
  const total = Math.max(keys.length, span);
  let cursor = 0;
  return keys.map((key, i) => {
    const last = i === keys.length - 1;
    const len = last ? total - cursor : Math.max(1, Math.round((weights[i] / weightSum) * total));
    const phase: Phase = { key, status: 'todo', start: addDays(start, cursor), end: addDays(start, last ? total : Math.min(total, cursor + len - 1)) };
    cursor += len;
    return phase;
  });
}

export function phasePercent(project: Project, key: PhaseKey, tasks: Task[]): number {
  const phase = project.phases.find((p) => p.key === key)!;
  if (phase.status === 'done') return 100;
  const ts = tasks.filter((t) => t.projectId === project.id && t.phaseKey === key);
  const est = ts.reduce((s, t) => s + t.estHours, 0);
  if (!est) return 0;
  const done = ts.reduce((s, t) => s + (t.status === 'done' ? t.estHours : 0), 0);
  // Never show a phase as complete until it is explicitly signed off.
  return Math.min(99, Math.round((done / est) * 100));
}

/** Weighted progress across the steps this job actually has, 0–100. */
export function projectProgress(project: Project, tasks: Task[]): number {
  if (project.status === 'completed' || project.status === 'delivered') return 100;
  const weightSum = project.phases.reduce((s, p) => s + PHASE_DEFS[p.key].weight, 0);
  const got = project.phases.reduce((s, p) => s + PHASE_DEFS[p.key].weight * phasePercent(project, p.key, tasks), 0);
  return weightSum ? Math.round(got / weightSum) : 0;
}

export const currentPhase = (project: Project): Phase | undefined =>
  project.phases.find((p) => p.status === 'in_progress') ?? project.phases.find((p) => p.status === 'todo');

export const isOpen = (p: Project) => p.status === 'active' || p.status === 'on_hold' || p.status === 'quote';

/** Days late (positive) against the target date, for open projects. */
export function daysOverdue(project: Project, today: string): number {
  return isOpen(project) ? Math.max(0, diffDays(project.targetDate, today)) : 0;
}

/** Phases whose end date has passed without being finished. */
export function latePhases(project: Project, today: string): Phase[] {
  if (project.status !== 'active') return [];
  return project.phases.filter((p) => p.status !== 'done' && p.end < today);
}

export function projectCosts(project: Project, tasks: Task[], parts: Part[], _mechanics?: Mechanic[]) {
  const labor = tasks
    .filter((t) => t.projectId === project.id)
    .reduce((s, t) => s + t.actualHours * LABOR_COST_PER_HOUR, 0);
  const partsCost = parts.filter((p) => p.projectId === project.id).reduce((s, p) => s + p.cost, 0);
  return { labor, parts: partsCost, total: labor + partsCost };
}

/** Hours booked for a mechanic on a day (done tasks count their actuals, others their estimate). */
export function dayLoad(tasks: Task[], mechanicId: string, date: string): number {
  return tasks
    .filter((t) => t.mechanicId === mechanicId && t.date === date)
    .reduce((s, t) => s + (t.status === 'done' && t.actualHours ? t.actualHours : t.estHours), 0);
}

export const isOverbooked = (tasks: Task[], m: Mechanic, date: string) => dayLoad(tasks, m.id, date) > m.dailyHours;

/** Utilisation across the working days in [from, to]. */
export function utilisation(tasks: Task[], m: Mechanic, from: string, to: string): number {
  let booked = 0;
  let capacity = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWeekend(d)) continue;
    booked += dayLoad(tasks, m.id, d);
    capacity += m.dailyHours;
  }
  return capacity ? Math.round((booked / capacity) * 100) : 0;
}

/* ───────────── parts, sublets & blockers ───────────── */

export const PART_FLOW: PartStatus[] = ['needed', 'ordered', 'shipped', 'backordered', 'received', 'installed'];

const PART_LABELS: Record<PartKind, Record<PartStatus, string>> = {
  part: { needed: 'To order', ordered: 'Ordered', shipped: 'In transit', backordered: 'Backordered', received: 'Received', installed: 'Installed' },
  sublet: { needed: 'To send out', ordered: 'Booked in', shipped: 'At vendor', backordered: 'Delayed', received: 'Back in shop', installed: 'Refitted' },
};
export const partStatusLabel = (kind: PartKind, s: PartStatus) => PART_LABELS[kind][s];

export const isPartIn = (p: Part) => p.status === 'received' || p.status === 'installed';

export type PartRisk = 'done' | 'late' | 'order_now' | 'at_risk' | 'ok';

/** How worried should the shop be about this part arriving when the work needs it? */
export function partRisk(p: Part, today: string): PartRisk {
  if (isPartIn(p)) return 'done';
  if (p.status === 'needed') return diffDays(today, p.neededBy) <= 7 ? 'order_now' : 'ok';
  if (p.eta && p.eta < today) return 'late';
  if (p.status === 'backordered' && !p.eta) return 'at_risk';
  if (p.eta && p.eta > p.neededBy) return 'at_risk';
  return 'ok';
}

export const RISK_RANK: Record<PartRisk, number> = { late: 0, order_now: 1, at_risk: 2, ok: 3, done: 4 };

export interface Blocker {
  taskId: string;
  projectId: string;
  reason: 'parts' | 'vendor' | 'customer' | 'other';
  label: string;
  eta?: string;
  partId?: string;
}

/** Why a task can't move right now, or null. Parts-driven blocks clear themselves when the part arrives. */
export function taskBlocker(t: Task, parts: Part[]): Blocker | null {
  if (t.status === 'done') return null;
  const part = t.partId ? parts.find((p) => p.id === t.partId) : undefined;
  if (part && !isPartIn(part)) {
    const verb = part.kind === 'sublet' ? 'Waiting on' : 'Waiting for';
    return {
      taskId: t.id, projectId: t.projectId, reason: part.kind === 'sublet' ? 'vendor' : 'parts',
      label: `${verb} ${part.name}`, eta: part.eta, partId: part.id,
    };
  }
  if (t.status === 'blocked') {
    return { taskId: t.id, projectId: t.projectId, reason: t.blockReason ?? 'other', label: t.blockNote || 'Blocked', };
  }
  return null;
}

export const allBlockers = (d: Data): Blocker[] =>
  d.tasks.flatMap((t) => {
    const p = d.projects.find((x) => x.id === t.projectId);
    return p && p.status === 'active' ? [taskBlocker(t, d.parts)].filter((b): b is Blocker => !!b) : [];
  });

/** A task is scheduled for a day before the part it needs will arrive. */
export function partArrivesLate(t: Task, parts: Part[]): boolean {
  const part = t.partId ? parts.find((p) => p.id === t.partId) : undefined;
  return !!part && !isPartIn(part) && t.status !== 'done' && (!part.eta || part.eta > t.date);
}

export type Health = 'on_track' | 'at_risk' | 'blocked' | 'late' | 'hold' | 'quote' | 'done';

export function projectHealth(p: Project, d: Data, today: string): { health: Health; reasons: string[] } {
  if (p.status === 'quote') return { health: 'quote', reasons: ['Awaiting customer approval'] };
  if (p.status === 'on_hold') return { health: 'hold', reasons: ['On hold'] };
  if (p.status === 'completed' || p.status === 'delivered') return { health: 'done', reasons: [] };
  const reasons: string[] = [];
  const over = daysOverdue(p, today);
  if (over > 0) reasons.push(`${over}d past target date`);
  const blockers = d.tasks.filter((t) => t.projectId === p.id).map((t) => taskBlocker(t, d.parts)).filter((b): b is Blocker => !!b);
  const urgent = blockers.filter((b) => {
    const t = d.tasks.find((x) => x.id === b.taskId)!;
    return t.date <= addDays(today, 3);
  });
  for (const b of urgent) reasons.push(b.label);
  const risky = d.parts.filter((x) => x.projectId === p.id && ['late', 'order_now', 'at_risk'].includes(partRisk(x, today)));
  for (const x of risky) reasons.push(`${x.name}: ${partRisk(x, today).replace('_', ' ')}`);
  for (const ph of latePhases(p, today)) reasons.push(`${phaseLabel(ph.key)} behind schedule`);
  const { total } = projectCosts(p, d.tasks, d.parts, d.mechanics);
  if (total > p.budget) reasons.push('Over budget');
  let health: Health = 'on_track';
  if (over > 0) health = 'late';
  else if (urgent.length) health = 'blocked';
  else if (reasons.length) health = 'at_risk';
  return { health, reasons };
}

export interface Alert {
  level: 'high' | 'medium';
  projectId: string;
  text: string;
}

export function buildAlerts(data: Data, today: string): Alert[] {
  const out: Alert[] = [];
  for (const p of data.projects) {
    if (p.status !== 'active') continue;
    const name = p.code;
    const over = daysOverdue(p, today);
    if (over > 0) out.push({ level: 'high', projectId: p.id, text: `${name} is ${over} day${over > 1 ? 's' : ''} past its target date` });
    else for (const ph of latePhases(p, today)) out.push({ level: 'medium', projectId: p.id, text: `${name}: ${phaseLabel(ph.key)} is behind schedule` });
    const { total } = projectCosts(p, data.tasks, data.parts, data.mechanics);
    if (total > p.budget) out.push({ level: 'high', projectId: p.id, text: `${name} is over budget` });
    else if (total > p.budget * 0.9) out.push({ level: 'medium', projectId: p.id, text: `${name} has used 90%+ of its budget` });
    const unassigned = data.tasks.filter((t) => t.projectId === p.id && !t.mechanicId && t.status !== 'done').length;
    if (unassigned) out.push({ level: 'medium', projectId: p.id, text: `${name} has ${unassigned} unassigned task${unassigned > 1 ? 's' : ''}` });
  }
  for (const part of data.parts) {
    const p = data.projects.find((x) => x.id === part.projectId);
    if (!p || p.status !== 'active') continue;
    const r = partRisk(part, today);
    if (r === 'late') out.push({ level: 'high', projectId: p.id, text: `${p.code}: ${part.name} is overdue from ${part.supplier}` });
    if (r === 'order_now') out.push({ level: 'high', projectId: p.id, text: `${p.code}: ${part.name} still not ordered, needed ${fmtShort(part.neededBy)}` });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
}

const PESO = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const PESO_COMPACT = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 });
/** Full peso amount, e.g. ₱3,500,000. */
export const money = (n: number) => PESO.format(n);
/** Short peso amount for tight spots, e.g. ₱3.5M. */
export const moneyC = (n: number) => (Math.abs(n) >= 10000 ? PESO_COMPACT.format(n) : PESO.format(n));

export function nextProjectCode(projects: Project[]): string {
  const max = projects.reduce((m, p) => Math.max(m, Number(p.code.split('-')[1]) || 0), 0);
  return `ACR-${String(max + 1).padStart(3, '0')}`;
}

/* ───────────── attendance ───────────── */

export const SHIFT_START = '08:00';
export const GRACE_MIN = 10;
export const LUNCH_HOURS = 1;

export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const nowHHMM = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Arrived after the shift start plus the grace period. */
export const isLateIn = (timeIn: string) => toMin(timeIn) > toMin(SHIFT_START) + GRACE_MIN;

/** Paid hours between clock in and out; an unpaid lunch comes off longer days. */
export function hoursBetween(timeIn: string, timeOut: string): number {
  const mins = toMin(timeOut) - toMin(timeIn);
  if (mins <= 0) return 0;
  const h = mins / 60 - (mins / 60 > 5 ? LUNCH_HOURS : 0);
  return Math.round(h * 10) / 10;
}
export const workedHours = (r?: Attendance) => (r?.timeIn && r.timeOut ? hoursBetween(r.timeIn, r.timeOut) : 0);
/** Overtime counts once a day runs half an hour or more past the mechanic's normal hours. */
export const overtimeHours = (r: Attendance | undefined, m: Mechanic) => {
  const extra = workedHours(r) - m.dailyHours;
  return extra >= 0.5 ? Math.round(extra * 10) / 10 : 0;
};

export const OUT_STATUSES: AttendanceStatus[] = ['absent', 'leave', 'off'];
export const isOut = (r?: Attendance) => !!r && OUT_STATUSES.includes(r.status);
export const attFor = (att: Attendance[], mechanicId: string, date: string) => att.find((a) => a.mechanicId === mechanicId && a.date === date);

export const ATT_LABEL: Record<AttendanceStatus, string> = { present: 'Present', late: 'Late', half: 'Half day', absent: 'Absent', leave: 'On leave', off: 'Day off' };

export interface AttendanceSummary { present: number; late: number; half: number; absent: number; leave: number; hours: number; overtime: number; rate: number | null }

/** Totals for a mechanic over [from, to]. Rate = days attended / days they were expected (leave and days off don't count against them). */
export function attendanceSummary(att: Attendance[], m: Mechanic, from: string, to: string): AttendanceSummary {
  const out: AttendanceSummary = { present: 0, late: 0, half: 0, absent: 0, leave: 0, hours: 0, overtime: 0, rate: null };
  for (const r of att) {
    if (r.mechanicId !== m.id || r.date < from || r.date > to) continue;
    if (r.status === 'present') out.present++;
    else if (r.status === 'late') out.late++;
    else if (r.status === 'half') out.half++;
    else if (r.status === 'absent') out.absent++;
    else if (r.status === 'leave') out.leave++;
    out.hours += workedHours(r);
    out.overtime += overtimeHours(r, m);
  }
  out.hours = Math.round(out.hours * 10) / 10;
  out.overtime = Math.round(out.overtime * 10) / 10;
  const attended = out.present + out.late + out.half;
  const expected = attended + out.absent;
  out.rate = expected ? Math.round((attended / expected) * 100) : null;
  return out;
}

export interface CoverageGap { task: Task; mechanic: Mechanic; record: Attendance }

/** Open work booked on a day the assigned mechanic is absent, on leave or off. */
export function coverageGaps(d: Data, today: string): CoverageGap[] {
  const out: CoverageGap[] = [];
  for (const t of d.tasks) {
    if (t.status === 'done' || t.date < today || !t.mechanicId) continue;
    const p = d.projects.find((x) => x.id === t.projectId);
    if (!p || p.status !== 'active') continue;
    const mechanic = d.mechanics.find((m) => m.id === t.mechanicId);
    const record = attFor(d.attendance, t.mechanicId, t.date);
    if (mechanic && record && isOut(record)) out.push({ task: t, mechanic, record });
  }
  return out.sort((a, b) => a.task.date.localeCompare(b.task.date));
}

/* ───────────── ceramic coating records ───────────── */

/** Days a freshly coated car should stay dry. Alex sets the real figure from the product's data sheet. */
export const NO_WASH_DAYS = 7;
/** Months after handover when the free maintenance check is due. */
export const MAINTENANCE_MONTHS = 12;

export interface CoatingDates { washAfter?: string; warrantyEnds?: string; maintenanceDue?: string }

/** Dates worked out from the coating record, so nobody has to count days by hand. */
export function coatingDates(p: Project): CoatingDates {
  const c = p.coating;
  if (!c) return {};
  return {
    washAfter: c.washAfter ?? (c.cureStarted ? addDays(c.cureStarted, NO_WASH_DAYS) : undefined),
    warrantyEnds: c.handoverDate && c.warrantyYears ? addYears(c.handoverDate, c.warrantyYears) : undefined,
    maintenanceDue: c.handoverDate ? addMonths(c.handoverDate, MAINTENANCE_MONTHS) : undefined,
  };
}

export interface CoatingFollowUp {
  project: Project;
  kind: 'no_wash' | 'maintenance';
  date: string;
  /** Days from today; negative means it is overdue. */
  daysAway: number;
}

/** Cars that must stay dry for now, and owners due a maintenance check soon or already overdue. */
export function coatingFollowUps(d: Data, today: string, maintenanceWindowDays = 30): CoatingFollowUp[] {
  const out: CoatingFollowUp[] = [];
  for (const p of d.projects) {
    if (p.service !== 'ceramic' || !p.coating) continue;
    const dates = coatingDates(p);
    if (dates.washAfter && dates.washAfter >= today && p.coating.cureStarted) out.push({ project: p, kind: 'no_wash', date: dates.washAfter, daysAway: diffDays(today, dates.washAfter) });
    if (dates.maintenanceDue && !p.coating.maintenanceDone && diffDays(today, dates.maintenanceDue) <= maintenanceWindowDays) out.push({ project: p, kind: 'maintenance', date: dates.maintenanceDue, daysAway: diffDays(today, dates.maintenanceDue) });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}

/** Mechanics with work on a job: those with open tasks first, then anyone who has worked on it. */
export function jobCrew(projectId: string, d: Data): Mechanic[] {
  const ids: string[] = [];
  const mine = d.tasks.filter((t) => t.projectId === projectId && t.mechanicId);
  for (const t of [...mine.filter((x) => x.status !== 'done'), ...mine.filter((x) => x.status === 'done')]) if (!ids.includes(t.mechanicId!)) ids.push(t.mechanicId!);
  return ids.map((id) => d.mechanics.find((m) => m.id === id)).filter((m): m is Mechanic => !!m && m.active);
}
