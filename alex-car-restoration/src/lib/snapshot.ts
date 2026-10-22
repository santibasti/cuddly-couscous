import { addDays, fmtDate, isWeekend } from './dates';
import { ATT_LABEL, attFor, coverageGaps, fmtTime, isOut, isPartIn, money, partRisk, taskBlocker, workedHours, type CoverageGap } from './logic';
import type { Data, Mechanic, Part, Payment, Project, Task, Update } from './types';

export interface Snapshot {
  date: string;
  nextWorkday: string;
  team: {
    total: number;
    clockedIn: Mechanic[];
    late: { mechanic: Mechanic; timeIn: string }[];
    absent: Mechanic[];
    onLeave: Mechanic[];
    notIn: Mechanic[];
    hoursSoFar: number;
  };
  floor: {
    tasks: Task[];
    done: number;
    running: number;
    blocked: number;
    todo: number;
    plannedHours: number;
    byMechanic: { mechanic: Mechanic; tasks: Task[] }[];
    unassigned: Task[];
  };
  parts: { arriving: Part[]; arrived: Part[]; overdue: Part[]; orderNow: Part[]; orderedToday: Part[] };
  jobs: { dueToday: Project[]; late: { project: Project; days: number }[]; phasesStarting: { project: Project; phase: string }[]; phasesEnding: { project: Project; phase: string }[] };
  money: { payments: { project: Project; payment: Payment }[]; total: number };
  updates: { project: Project; update: Update }[];
  tomorrow: { tasks: Task[]; blocked: number; gaps: CoverageGap[]; partsDue: Part[] };
}

/** Next Monday–Friday after `date`. */
export function nextWorkday(date: string): string {
  let d = addDays(date, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/** Everything that is happening, or has just happened, on one day. */
export function dailySnapshot(data: Data, today: string): Snapshot {
  const team = data.mechanics.filter((m) => m.active);
  const active = new Set(data.projects.filter((p) => p.status === 'active').map((p) => p.id));
  const proj = (id: string) => data.projects.find((p) => p.id === id)!;
  const rec = (m: Mechanic) => attFor(data.attendance, m.id, today);

  const clockedIn = team.filter((m) => rec(m)?.timeIn);
  const tasks = data.tasks.filter((t) => t.date === today && active.has(t.projectId));
  const isBlocked = (t: Task) => !!taskBlocker(t, data.parts);
  const open = tasks.filter((t) => t.status !== 'done');

  const tomorrowDate = nextWorkday(today);
  const tomorrowTasks = data.tasks.filter((t) => t.date === tomorrowDate && t.status !== 'done' && active.has(t.projectId));

  const payments = data.projects.flatMap((p) => p.payments.filter((x) => x.date === today).map((payment) => ({ project: p, payment })));

  return {
    date: today,
    nextWorkday: tomorrowDate,
    team: {
      total: team.length,
      clockedIn,
      late: team.filter((m) => rec(m)?.status === 'late' && rec(m)?.timeIn).map((m) => ({ mechanic: m, timeIn: rec(m)!.timeIn! })),
      absent: team.filter((m) => rec(m)?.status === 'absent'),
      onLeave: team.filter((m) => rec(m)?.status === 'leave'),
      notIn: team.filter((m) => !rec(m)),
      hoursSoFar: Math.round(team.reduce((s, m) => s + workedHours(rec(m)), 0) * 10) / 10,
    },
    floor: {
      tasks,
      done: tasks.filter((t) => t.status === 'done').length,
      running: open.filter((t) => t.status === 'in_progress' && !isBlocked(t)).length,
      blocked: open.filter(isBlocked).length,
      todo: open.filter((t) => t.status === 'todo' && !isBlocked(t)).length,
      plannedHours: tasks.reduce((s, t) => s + t.estHours, 0),
      byMechanic: team.map((m) => ({ mechanic: m, tasks: tasks.filter((t) => t.mechanicId === m.id) })).filter((x) => x.tasks.length > 0 || !isOut(rec(x.mechanic))),
      unassigned: tasks.filter((t) => !t.mechanicId),
    },
    parts: {
      arriving: data.parts.filter((x) => active.has(x.projectId) && !isPartIn(x) && x.eta === today),
      arrived: data.parts.filter((x) => active.has(x.projectId) && x.status === 'received' && x.eta === today),
      overdue: data.parts.filter((x) => active.has(x.projectId) && partRisk(x, today) === 'late'),
      orderNow: data.parts.filter((x) => active.has(x.projectId) && partRisk(x, today) === 'order_now'),
      orderedToday: data.parts.filter((x) => x.orderedOn === today),
    },
    jobs: {
      dueToday: data.projects.filter((p) => p.status === 'active' && p.targetDate === today),
      late: data.projects.filter((p) => p.status === 'active' && p.targetDate < today).map((p) => ({ project: p, days: Math.round((Date.parse(today) - Date.parse(p.targetDate)) / 86400000) })),
      phasesStarting: data.projects.filter((p) => p.status === 'active').flatMap((p) => p.phases.filter((ph) => ph.start === today && ph.status !== 'done').map((ph) => ({ project: p, phase: ph.key }))),
      phasesEnding: data.projects.filter((p) => p.status === 'active').flatMap((p) => p.phases.filter((ph) => ph.end === today && ph.status !== 'done').map((ph) => ({ project: p, phase: ph.key }))),
    },
    money: { payments, total: payments.reduce((s, x) => s + x.payment.amount, 0) },
    updates: data.updates.filter((u) => u.date === today).map((update) => ({ project: proj(update.projectId), update })),
    tomorrow: {
      tasks: tomorrowTasks,
      blocked: tomorrowTasks.filter(isBlocked).length,
      gaps: coverageGaps(data, tomorrowDate).filter((g) => g.task.date === tomorrowDate),
      partsDue: data.parts.filter((x) => active.has(x.projectId) && !isPartIn(x) && x.eta === tomorrowDate),
    },
  };
}

const first = (m: Mechanic) => m.name.split(' ')[0];
const car = (p: Project) => `${p.code} ${p.make} ${p.model}`;

/** Plain-text version, short enough to paste into a chat. */
export function snapshotText(s: Snapshot, data: Data): string {
  const lines: string[] = [`Alex Restoration · Daily snapshot`, new Date(s.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }), ''];
  const t = s.team;
  const bits = [`${t.clockedIn.length} of ${t.total} in`];
  if (t.late.length) bits.push(`late: ${t.late.map((l) => `${first(l.mechanic)} ${fmtTime(l.timeIn)}`).join(', ')}`);
  if (t.absent.length) bits.push(`absent: ${t.absent.map(first).join(', ')}`);
  if (t.onLeave.length) bits.push(`on leave: ${t.onLeave.map(first).join(', ')}`);
  if (t.notIn.length) bits.push(`not in yet: ${t.notIn.map(first).join(', ')}`);
  lines.push(`TEAM  ${bits.join(' · ')}`);

  const f = s.floor;
  lines.push(`FLOOR  ${f.tasks.length} tasks planned (${f.plannedHours}h): ${f.done} done, ${f.running} running, ${f.todo} to start, ${f.blocked} blocked`);
  for (const t2 of f.tasks.filter((x) => x.status !== 'done' && taskBlocker(x, data.parts))) lines.push(`  - Blocked: ${t2.title} (${car(data.projects.find((p) => p.id === t2.projectId)!)}) — ${taskBlocker(t2, data.parts)!.label}`);

  if (s.parts.arriving.length || s.parts.arrived.length) lines.push(`PARTS  Due today: ${[...s.parts.arriving, ...s.parts.arrived].map((x) => `${x.name} (${x.supplier})`).join('; ')}`);
  if (s.parts.overdue.length) lines.push(`OVERDUE  ${s.parts.overdue.map((x) => `${x.name} (${x.supplier})`).join('; ')}`);
  if (s.parts.orderNow.length) lines.push(`ORDER NOW  ${s.parts.orderNow.map((x) => x.name).join('; ')}`);
  if (s.jobs.dueToday.length) lines.push(`DELIVERY TODAY  ${s.jobs.dueToday.map(car).join('; ')}`);
  if (s.jobs.late.length) lines.push(`LATE JOBS  ${s.jobs.late.map((l) => `${car(l.project)} (${l.days}d)`).join('; ')}`);
  lines.push(s.money.payments.length ? `PAYMENTS  ${money(s.money.total)} received: ${s.money.payments.map((x) => `${x.project.code} ${money(x.payment.amount)}`).join(', ')}` : 'PAYMENTS  None received today');
  if (s.updates.length) { lines.push('UPDATES'); for (const u of s.updates) lines.push(`  - ${u.project.code}: ${u.update.text}`); }

  const tm = s.tomorrow;
  lines.push('', `NEXT WORKDAY (${fmtDate(s.nextWorkday)})  ${tm.tasks.length} tasks booked${tm.blocked ? `, ${tm.blocked} blocked` : ''}${tm.partsDue.length ? `, ${tm.partsDue.length} deliveries expected` : ''}`);
  for (const g of tm.gaps) lines.push(`  - Needs cover: ${g.task.title} — ${first(g.mechanic)} is ${ATT_LABEL[g.record.status].toLowerCase()}`);
  return lines.join('\n');
}
