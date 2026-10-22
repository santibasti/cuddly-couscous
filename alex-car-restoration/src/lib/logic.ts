import { addDays, diffDays, isWeekend } from './dates';
import type { Data, Mechanic, Part, Phase, PhaseKey, Project, Task } from './types';

export const PHASES: { key: PhaseKey; label: string; weight: number }[] = [
  { key: 'intake', label: 'Intake & Assessment', weight: 1 },
  { key: 'teardown', label: 'Teardown', weight: 2 },
  { key: 'body', label: 'Bodywork', weight: 5 },
  { key: 'paint', label: 'Paint', weight: 3 },
  { key: 'mechanical', label: 'Engine & Mechanical', weight: 5 },
  { key: 'interior', label: 'Interior', weight: 3 },
  { key: 'assembly', label: 'Reassembly', weight: 3 },
  { key: 'qc', label: 'Testing & QC', weight: 1 },
  { key: 'delivery', label: 'Delivery', weight: 1 },
];

export const phaseLabel = (k: PhaseKey) => PHASES.find((p) => p.key === k)!.label;

/** Spread the phases across [start, target] proportionally to their weight. */
export function buildPhases(start: string, target: string): Phase[] {
  const total = Math.max(PHASES.length, diffDays(start, target));
  const weightSum = PHASES.reduce((s, p) => s + p.weight, 0);
  let cursor = 0;
  return PHASES.map((p, i) => {
    const len = i === PHASES.length - 1 ? total - cursor : Math.max(1, Math.round((p.weight / weightSum) * total));
    const phase: Phase = {
      key: p.key,
      status: 'todo',
      start: addDays(start, cursor),
      end: addDays(start, i === PHASES.length - 1 ? total : Math.min(total, cursor + len - 1)),
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

export interface Alert {
  level: 'high' | 'medium';
  projectId: string;
  text: string;
}

export function buildAlerts(data: Data, today: string): Alert[] {
  const out: Alert[] = [];
  for (const p of data.projects) {
    const name = `${p.code} · ${p.year} ${p.make} ${p.model}`;
    const over = daysOverdue(p, today);
    if (over > 0) out.push({ level: 'high', projectId: p.id, text: `${name} is ${over} day${over > 1 ? 's' : ''} past its target date` });
    for (const ph of latePhases(p, today)) {
      if (over === 0) out.push({ level: 'medium', projectId: p.id, text: `${name}: ${phaseLabel(ph.key)} is behind schedule` });
    }
    if (p.status === 'active') {
      const { total } = projectCosts(p, data.tasks, data.parts, data.mechanics);
      if (total > p.budget) out.push({ level: 'high', projectId: p.id, text: `${name} is over budget` });
      else if (total > p.budget * 0.9) out.push({ level: 'medium', projectId: p.id, text: `${name} has used 90%+ of its budget` });
      const unassigned = data.tasks.filter((t) => t.projectId === p.id && !t.mechanicId && t.status !== 'done').length;
      if (unassigned) out.push({ level: 'medium', projectId: p.id, text: `${name} has ${unassigned} unassigned task${unassigned > 1 ? 's' : ''}` });
    }
  }
  for (const part of data.parts) {
    const p = data.projects.find((x) => x.id === part.projectId);
    if (part.status === 'ordered' && part.eta && part.eta < today && p)
      out.push({ level: 'medium', projectId: p.id, text: `${p.code}: ${part.name} is late from ${part.supplier}` });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
}

export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function nextProjectCode(projects: Project[]): string {
  const max = projects.reduce((m, p) => Math.max(m, Number(p.code.split('-')[1]) || 0), 0);
  return `ACR-${String(max + 1).padStart(3, '0')}`;
}
