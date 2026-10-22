import { addDays, diffDays, fmtDate as fmtShort, isWeekend } from './dates';
import type { Data, Mechanic, Part, PartKind, PartStatus, Phase, PhaseKey, Project, Task } from './types';

export const PHASES: { key: PhaseKey; label: string; short: string; weight: number }[] = [
  { key: 'intake', label: 'Intake & Assessment', short: 'Intake', weight: 1 },
  { key: 'teardown', label: 'Teardown', short: 'Teardown', weight: 2 },
  { key: 'body', label: 'Bodywork', short: 'Body', weight: 5 },
  { key: 'paint', label: 'Paint', short: 'Paint', weight: 3 },
  { key: 'mechanical', label: 'Engine & Mechanical', short: 'Mechanical', weight: 5 },
  { key: 'interior', label: 'Interior', short: 'Interior', weight: 3 },
  { key: 'assembly', label: 'Reassembly', short: 'Assembly', weight: 3 },
  { key: 'qc', label: 'Testing & QC', short: 'QC', weight: 1 },
  { key: 'delivery', label: 'Delivery', short: 'Delivery', weight: 1 },
];

export const phaseLabel = (k: PhaseKey) => PHASES.find((p) => p.key === k)!.label;
export const phaseShort = (k: PhaseKey) => PHASES.find((p) => p.key === k)!.short;

export const BAYS = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Paint booth', 'Media blast'];

/** Spread the phases across [start, target] proportionally to their weight. */
export function buildPhases(start: string, target: string): Phase[] {
  const total = Math.max(PHASES.length, diffDays(start, target));
  const weightSum = PHASES.reduce((s, p) => s + p.weight, 0);
  let cursor = 0;
  return PHASES.map((p, i) => {
    const last = i === PHASES.length - 1;
    const len = last ? total - cursor : Math.max(1, Math.round((p.weight / weightSum) * total));
    const phase: Phase = {
      key: p.key,
      status: 'todo',
      start: addDays(start, cursor),
      end: addDays(start, last ? total : Math.min(total, cursor + len - 1)),
    };
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

/** Weighted progress across all phases, 0–100. */
export function projectProgress(project: Project, tasks: Task[]): number {
  if (project.status === 'completed' || project.status === 'delivered') return 100;
  const weightSum = PHASES.reduce((s, p) => s + p.weight, 0);
  const got = PHASES.reduce((s, p) => s + p.weight * phasePercent(project, p.key, tasks), 0);
  return Math.round(got / weightSum);
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

export function projectCosts(project: Project, tasks: Task[], parts: Part[], mechanics: Mechanic[]) {
  const rate = new Map(mechanics.map((m) => [m.id, m.hourlyRate]));
  const labor = tasks
    .filter((t) => t.projectId === project.id)
    .reduce((s, t) => s + t.actualHours * (t.mechanicId ? (rate.get(t.mechanicId) ?? 0) : 0), 0);
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

export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function nextProjectCode(projects: Project[]): string {
  const max = projects.reduce((m, p) => Math.max(m, Number(p.code.split('-')[1]) || 0), 0);
  return `ACR-${String(max + 1).padStart(3, '0')}`;
}
