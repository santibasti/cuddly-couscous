import { describe, expect, it } from 'vitest';
import { addDays, startOfWeek } from './dates';
import { allBlockers, buildAlerts, buildPhases, dayLoad, daysOverdue, isOverbooked, partRisk, phasePercent, projectHealth, projectProgress, PHASES, taskBlocker } from './logic';
import { buildSeed } from './seed';
import { reducer } from './store';

const TODAY = '2026-03-18'; // a Wednesday

describe('dates', () => {
  it('finds Monday of the week', () => {
    expect(startOfWeek(TODAY)).toBe('2026-03-16');
    expect(startOfWeek('2026-03-22')).toBe('2026-03-16');
  });
});

describe('buildPhases', () => {
  it('covers every phase, in order, without overlap, ending on the target', () => {
    const ph = buildPhases('2026-01-05', '2026-05-05');
    expect(ph).toHaveLength(PHASES.length);
    for (let i = 1; i < ph.length; i++) expect(ph[i].start > ph[i - 1].end).toBe(true);
    expect(ph[ph.length - 1].end).toBe('2026-05-05');
  });
});

describe('progress', () => {
  const data = buildSeed(TODAY);
  it('is between 0 and 100 and never 100 for an open project', () => {
    for (const p of data.projects) {
      const v = projectProgress(p, data.tasks);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(p.status === 'active' ? v < 100 : true).toBe(true);
    }
  });
  it('treats signed-off phases as 100% and unsigned ones as at most 99%', () => {
    const p = data.projects[0];
    expect(phasePercent(p, p.phases[0].key, data.tasks)).toBe(100);
    for (const ph of p.phases.filter((x) => x.status !== 'done')) expect(phasePercent(p, ph.key, data.tasks)).toBeLessThan(100);
  });
});

describe('reducer', () => {
  it('completes a project when every phase is signed off, and reopens it if one is reverted', () => {
    let d = buildSeed(TODAY);
    const p = d.projects[0];
    for (const ph of p.phases) d = reducer(d, { type: 'setPhaseStatus', projectId: p.id, key: ph.key, status: 'done' });
    expect(d.projects[0].status).toBe('completed');
    d = reducer(d, { type: 'setPhaseStatus', projectId: p.id, key: 'qc', status: 'in_progress' });
    expect(d.projects[0].status).toBe('active');
  });
  it('books estimated hours when a task is completed without actuals', () => {
    let d = buildSeed(TODAY);
    const t = d.tasks.find((x) => x.status === 'todo')!;
    d = reducer(d, { type: 'updateTask', id: t.id, patch: { status: 'done' } });
    expect(d.tasks.find((x) => x.id === t.id)!.actualHours).toBe(t.estHours);
  });
  it('numbers new projects sequentially and schedules their phases', () => {
    let d = buildSeed(TODAY);
    const base = d.projects[0];
    d = reducer(d, { type: 'addProject', project: { ...base, status: undefined, startDate: TODAY, targetDate: addDays(TODAY, 60) } });
    const added = d.projects[d.projects.length - 1];
    expect(added.code).toBe('ACR-007');
    expect(added.phases).toHaveLength(PHASES.length);
    expect(added.status).toBe('quote');
  });
});

describe('scheduling & alerts', () => {
  it('detects overdue projects and overbooked days', () => {
    let d = buildSeed(TODAY);
    const p = d.projects[0];
    expect(daysOverdue(p, addDays(p.targetDate, 5))).toBe(5);
    const m = d.mechanics[0];
    d = reducer(d, { type: 'addTask', task: { projectId: p.id, phaseKey: 'body', title: 'A', mechanicId: m.id, date: TODAY, estHours: 6 } });
    d = reducer(d, { type: 'addTask', task: { projectId: p.id, phaseKey: 'body', title: 'B', mechanicId: m.id, date: TODAY, estHours: 6 } });
    expect(dayLoad(d.tasks, m.id, TODAY)).toBeGreaterThanOrEqual(12);
    expect(buildAlerts(d, addDays(p.targetDate, 5)).some((a) => a.projectId === p.id && a.level === 'high')).toBe(true);
  });
});

describe('parts, sublets & blockers', () => {
  const d = buildSeed(TODAY);
  const part = (id: string) => d.parts.find((p) => p.id === id)!;
  it('classifies part risk from ETA vs needed-by date', () => {
    expect(partRisk(part('p1-pt1'), TODAY)).toBe('at_risk'); // backordered NOS, lands after needed
    expect(partRisk(part('p2-pt2'), TODAY)).toBe('late'); // ETA already passed
    expect(partRisk(part('p4-pt2'), TODAY)).toBe('order_now'); // not sent out, needed within a week
    expect(partRisk(part('p1-pt3'), TODAY)).toBe('done'); // received
  });
  it('blocks tasks that wait on a part and frees them when it arrives', () => {
    let s = buildSeed(TODAY);
    const task = s.tasks.find((t) => t.partId === 'p3-pt1')!; // engine assembly waits on the crank
    expect(taskBlocker(task, s.parts)?.reason).toBe('vendor');
    s = reducer(s, { type: 'setPartStatus', id: 'p3-pt1', status: 'received' });
    expect(taskBlocker(s.tasks.find((t) => t.id === task.id)!, s.parts)).toBeNull();
  });
  it('treats a customer-approval hold as a blocker without a part', () => {
    const t = d.tasks.find((x) => x.blockReason === 'customer')!;
    expect(taskBlocker(t, d.parts)?.reason).toBe('customer');
  });
  it('rolls blockers, lateness and risk into a project health', () => {
    const h = (id: string) => projectHealth(d.projects.find((p) => p.id === id)!, d, TODAY).health;
    expect(h('p3')).toBe('late'); // Camaro is past its target date
    expect(h('p6')).toBe('on_track'); // Corvette is in QC with nothing outstanding
    expect(h('p5')).toBe('quote');
    expect(allBlockers(d).length).toBeGreaterThan(0);
  });
  it('seed data is not accidentally overbooked', () => {
    for (const m of d.mechanics) for (const t of d.tasks.filter((x) => x.mechanicId === m.id && x.status !== 'done')) expect(isOverbooked(d.tasks, m, t.date)).toBe(false);
  });
});
