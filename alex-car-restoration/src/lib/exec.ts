import { addDays, diffDays, fmtDate, isWeekend, startOfWeek } from './dates';
import { coverageGaps, daysOverdue, projectCosts, projectHealth, projectProgress, partRisk, isPartIn, taskBlocker, workedHours, type Health } from './logic';
import { SERVICES, SERVICE_KEYS } from './logic';
import type { Data, Project, ServiceType } from './types';

export interface JobFinance {
  project: Project;
  progress: number;
  contract: number;
  collected: number;
  /** Contract value earned so far, by progress. */
  earned: number;
  /** Work done but not yet paid for. Positive means the shop is carrying the customer. */
  billingGap: number;
  spent: number;
  forecastCost: number;
  margin: number;
  marginPct: number;
  health: Health;
  reasons: string[];
}

/**
 * Forecast cost at completion. Early on (under 25% done) spend says little, so assume the job lands at 70% of contract.
 * Later, extrapolate from spend so far, and never forecast below what is already spent.
 */
export function forecastCost(spent: number, contract: number, progress: number): number {
  if (progress < 25) return Math.max(spent, Math.round(contract * 0.7));
  return Math.max(spent, Math.round(spent / (progress / 100)));
}

/** True when every step of the job has at least one task, so the plan is a fair guide to what the job will cost. */
export function planIsComplete(p: Project, d: Data): boolean {
  return p.phases.every((ph) => d.tasks.some((t) => t.projectId === p.id && t.phaseKey === ph.key));
}

/** Labor at actual hours for finished tasks and estimated hours for the rest, plus every part and sublet on the job. */
export function plannedCost(p: Project, d: Data): number {
  const team = d.mechanics.filter((m) => m.active);
  const avg = team.length ? team.reduce((s, m) => s + m.hourlyRate, 0) / team.length : 0;
  const rate = new Map(d.mechanics.map((m) => [m.id, m.hourlyRate]));
  const labor = d.tasks.filter((t) => t.projectId === p.id).reduce((s, t) => s + (t.status === 'done' ? t.actualHours : t.estHours) * (t.mechanicId ? (rate.get(t.mechanicId) ?? avg) : avg), 0);
  const parts = d.parts.filter((x) => x.projectId === p.id).reduce((s, x) => s + x.cost, 0);
  return Math.round(labor + parts);
}

export function jobFinance(p: Project, d: Data, today: string): JobFinance {
  const progress = projectProgress(p, d.tasks);
  const spent = projectCosts(p, d.tasks, d.parts, d.mechanics).total;
  const collected = p.payments.reduce((s, x) => s + x.amount, 0);
  const earned = Math.round((p.budget * progress) / 100);
  // With every step planned (the short services), forecast from the plan. Otherwise fall back on progress.
  const fc = planIsComplete(p, d) ? Math.max(spent, plannedCost(p, d)) : forecastCost(spent, p.budget, progress);
  const margin = p.budget - fc;
  const { health, reasons } = projectHealth(p, d, today);
  return { project: p, progress, contract: p.budget, collected, earned, billingGap: earned - collected, spent, forecastCost: fc, margin, marginPct: p.budget ? Math.round((margin / p.budget) * 100) : 0, health, reasons };
}

export function portfolio(d: Data, today: string) {
  const jobs = d.projects.filter((p) => p.status === 'active').map((p) => jobFinance(p, d, today));
  const quotes = d.projects.filter((p) => p.status === 'quote');
  const sum = (f: (j: JobFinance) => number) => jobs.reduce((s, j) => s + f(j), 0);
  const contract = sum((j) => j.contract);
  const forecast = sum((j) => j.forecastCost);
  const collected = sum((j) => j.collected);
  const earned = sum((j) => j.earned);
  const activeIds = new Set(jobs.map((j) => j.project.id));
  const backlogHours = d.tasks.filter((t) => t.status !== 'done' && activeIds.has(t.projectId)).reduce((s, t) => s + t.estHours, 0);
  const weeklyCapacity = d.mechanics.filter((m) => m.active).reduce((s, m) => s + m.dailyHours * 5, 0);
  const late = jobs.filter((j) => j.health === 'late').length;
  return {
    jobs, quotes, contract, collected, earned,
    spent: sum((j) => j.spent), forecastCost: forecast, margin: contract - forecast,
    marginPct: contract ? Math.round(((contract - forecast) / contract) * 100) : 0,
    outstanding: contract - collected,
    toBill: Math.max(0, earned - collected),
    quotesValue: quotes.reduce((s, p) => s + p.budget, 0),
    backlogHours, backlogWeeks: weeklyCapacity ? Math.round((backlogHours / weeklyCapacity) * 10) / 10 : 0,
    late, onTime: jobs.length - late,
    avgDelay: late ? Math.round(jobs.filter((j) => j.health === 'late').reduce((s, j) => s + daysOverdue(j.project, today), 0) / late) : 0,
  };
}

/** Where the money goes across active jobs. */
export function costMix(d: Data) {
  const active = d.projects.filter((p) => p.status === 'active');
  const ids = new Set(active.map((p) => p.id));
  const labor = active.reduce((s, p) => s + projectCosts(p, d.tasks, d.parts, d.mechanics).labor, 0);
  const parts = d.parts.filter((x) => ids.has(x.projectId) && x.kind === 'part').reduce((s, x) => s + x.cost, 0);
  const sublet = d.parts.filter((x) => ids.has(x.projectId) && x.kind === 'sublet').reduce((s, x) => s + x.cost, 0);
  return { labor, parts, sublet };
}

/** Money tied up in orders not yet in the shop, by supplier. */
export function supplierExposure(d: Data, today: string) {
  const by = new Map<string, { supplier: string; value: number; items: number; late: number }>();
  for (const x of d.parts) {
    if (isPartIn(x) || x.status === 'needed') continue;
    const e = by.get(x.supplier) ?? { supplier: x.supplier, value: 0, items: 0, late: 0 };
    e.value += x.cost;
    e.items += 1;
    if (partRisk(x, today) === 'late') e.late += 1;
    by.set(x.supplier, e);
  }
  return [...by.values()].sort((a, b) => b.value - a.value);
}

/** Contract value due for delivery in each of the next N months. */
export function monthlyDeliveries(d: Data, today: string, months = 6) {
  const base = new Date(today + 'T00:00:00Z');
  const out = Array.from({ length: months }, (_, i) => {
    const m = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1));
    return { key: m.toISOString().slice(0, 7), label: m.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }), value: 0, jobs: [] as string[] };
  });
  for (const p of d.projects.filter((x) => x.status === 'active')) {
    const bucket = out.find((b) => b.key === p.targetDate.slice(0, 7)) ?? (p.targetDate < today ? out[0] : undefined);
    if (bucket) { bucket.value += p.budget; bucket.jobs.push(p.code); }
  }
  return out;
}

/** Hours actually clocked against what the team could have worked, for up to the last N weeks. Weeks that start before the first attendance record are left out, since they would only be partly filled in. */
export function weeklyHours(d: Data, today: string, weeks = 4) {
  const team = d.mechanics.filter((m) => m.active);
  const first = d.attendance.reduce((m, r) => (r.date < m ? r.date : m), today);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(startOfWeek(today), -7 * (weeks - 1 - i));
    const end = addDays(start, 6);
    const worked = d.attendance.filter((r) => r.date >= start && r.date <= end && team.some((m) => m.id === r.mechanicId)).reduce((s, r) => s + workedHours(r), 0);
    let capacity = 0;
    for (let day = start; day <= end && day <= today; day = addDays(day, 1)) if (!isWeekend(day)) capacity += team.reduce((s, m) => s + m.dailyHours, 0);
    return { label: fmtDate(start), start, worked: Math.round(worked), capacity, current: i === weeks - 1 };
  }).filter((w) => w.start >= first || w.current);
}

export interface Risk { level: 'high' | 'medium'; text: string; to: string; value?: number }

/** One line per thing an owner should know about, most serious first. */
export function riskRegister(d: Data, today: string): Risk[] {
  const out: Risk[] = [];
  const { jobs } = portfolio(d, today);
  for (const j of jobs) {
    const p = j.project;
    const over = daysOverdue(p, today);
    if (over > 0) out.push({ level: 'high', text: `${p.code} ${p.make} ${p.model} is ${over} days past its delivery date`, to: `/projects/${p.id}`, value: p.budget });
    if (j.marginPct < 20) out.push({ level: 'high', text: `${p.code} is forecast at ${j.marginPct}% margin`, to: `/projects/${p.id}`, value: j.margin });
    else if (j.marginPct < 30) out.push({ level: 'medium', text: `${p.code} margin is tight at ${j.marginPct}%`, to: `/projects/${p.id}`, value: j.margin });
    if (j.billingGap > p.budget * 0.1) out.push({ level: 'medium', text: `${p.code}: work is ahead of payments, ${Math.round(j.billingGap / 1000).toLocaleString('en-PH')}K to bill`, to: `/projects/${p.id}`, value: j.billingGap });
  }
  const overdueParts = d.parts.filter((x) => partRisk(x, today) === 'late');
  if (overdueParts.length) out.push({ level: 'high', text: `${overdueParts.length} supplier deliveries are overdue`, to: '/parts', value: overdueParts.reduce((s, x) => s + x.cost, 0) });
  const unordered = d.parts.filter((x) => partRisk(x, today) === 'order_now');
  if (unordered.length) out.push({ level: 'high', text: `${unordered.length} items are needed within a week and not ordered`, to: '/parts', value: unordered.reduce((s, x) => s + x.cost, 0) });
  const blocked = d.tasks.filter((t) => d.projects.find((p) => p.id === t.projectId)?.status === 'active' && taskBlocker(t, d.parts));
  if (blocked.length) out.push({ level: 'medium', text: `${blocked.length} tasks (${blocked.reduce((s, t) => s + t.estHours, 0)}h) are waiting on parts, outside shops or customers`, to: '/schedule' });
  const gaps = coverageGaps(d, today);
  if (gaps.length) out.push({ level: 'medium', text: `${gaps.length} task${gaps.length > 1 ? 's' : ''} booked on days the mechanic is out`, to: '/attendance' });
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
}

export { diffDays };

export interface ServiceRow { service: ServiceType; jobs: number; contract: number; forecastCost: number; margin: number; marginPct: number; avgJob: number }

/** Active jobs grouped by service, so the owner can see which kind of work earns the most. */
export function byService(d: Data, today: string): ServiceRow[] {
  const { jobs } = portfolio(d, today);
  return SERVICE_KEYS.map((service) => {
    const mine = jobs.filter((j) => j.project.service === service);
    const contract = mine.reduce((s, j) => s + j.contract, 0);
    const forecastCost = mine.reduce((s, j) => s + j.forecastCost, 0);
    return { service, jobs: mine.length, contract, forecastCost, margin: contract - forecastCost, marginPct: contract ? Math.round(((contract - forecastCost) / contract) * 100) : 0, avgJob: mine.length ? Math.round(contract / mine.length) : 0 };
  });
}
export { SERVICES };
