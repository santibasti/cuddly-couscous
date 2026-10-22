import { describe, expect, it } from 'vitest';
import { addDays, startOfWeek } from './dates';
import { buildAlerts, buildPhases, dayLoad, daysOverdue, phasePercent, projectProgress, PHASES } from './logic';
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
    expect(added.code).toBe('ACR-006');
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
