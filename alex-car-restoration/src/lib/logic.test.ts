import { describe, expect, it } from 'vitest';
import { addDays, startOfWeek } from './dates';
import { allBlockers, attendanceSummary, buildAlerts, coverageGaps, hoursBetween, isLateIn, isOut, overtimeHours, workedHours, buildPhases, dayLoad, daysOverdue, isOverbooked, partRisk, phasePercent, projectHealth, projectProgress, PHASES, taskBlocker } from './logic';
import { buildSeed } from './seed';
import { costMix, forecastCost, jobFinance, monthlyDeliveries, portfolio, riskRegister, supplierExposure, weeklyHours } from './exec';
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

describe('attendance', () => {
  const d = buildSeed(TODAY);
  it('flags late arrivals only after the grace period', () => {
    expect(isLateIn('08:00')).toBe(false);
    expect(isLateIn('08:10')).toBe(false);
    expect(isLateIn('08:11')).toBe(true);
  });
  it('counts paid hours with an unpaid lunch on long days', () => {
    expect(hoursBetween('08:00', '17:00')).toBe(8);
    expect(hoursBetween('08:00', '12:00')).toBe(4); // half day, no lunch deducted
    expect(hoursBetween('17:00', '08:00')).toBe(0);
  });
  it('clocks in once, marks late automatically, and clocks out', () => {
    let s = reducer(d, { type: 'clockIn', mechanicId: 'm5', date: TODAY, time: '08:25' });
    const rec = () => s.attendance.find((r) => r.mechanicId === 'm5' && r.date === TODAY)!;
    expect(rec().status).toBe('late');
    s = reducer(s, { type: 'clockIn', mechanicId: 'm5', date: TODAY, time: '09:00' }); // second tap ignored
    expect(rec().timeIn).toBe('08:25');
    s = reducer(s, { type: 'clockOut', mechanicId: 'm5', date: TODAY, time: '15:25' });
    expect(workedHours(rec())).toBe(6);
  });
  it('clears times when someone is marked absent or on leave', () => {
    const s = reducer(d, { type: 'setAttendance', mechanicId: 'm1', date: TODAY, status: 'leave', timeIn: '08:00', timeOut: '17:00' });
    const rec = s.attendance.find((r) => r.mechanicId === 'm1' && r.date === TODAY)!;
    expect(rec.timeIn).toBeUndefined();
    expect(isOut(rec)).toBe(true);
  });
  it('ignores overruns under half an hour when counting overtime', () => {
    const m = d.mechanics[0];
    expect(overtimeHours({ id: 'x', mechanicId: m.id, date: TODAY, status: 'present', timeIn: '08:00', timeOut: '17:10' }, m)).toBe(0);
    expect(overtimeHours({ id: 'x', mechanicId: m.id, date: TODAY, status: 'present', timeIn: '08:00', timeOut: '18:00' }, m)).toBe(1);
  });
  it('summarises a week and ignores leave when working out the attendance rate', () => {
    const m = d.mechanics[0];
    const s = attendanceSummary(d.attendance, m, addDays(TODAY, -14), addDays(TODAY, -1));
    expect(s.present + s.late + s.half + s.absent + s.leave).toBeGreaterThan(5);
    expect(s.rate).toBeGreaterThan(50);
    expect(s.hours).toBeGreaterThan(30);
  });
  it('finds booked work that lands on a day the mechanic is out, and clears it once reassigned', () => {
    const gaps = coverageGaps(d, TODAY);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].mechanic.id).toBe('m2');
    const s = reducer(d, { type: 'updateTask', id: gaps[0].task.id, patch: { mechanicId: 'm1' } });
    expect(coverageGaps(s, TODAY)).toHaveLength(0);
  });
});

describe('executive numbers', () => {
  const d = buildSeed(TODAY);
  const pf = portfolio(d, TODAY);
  it('forecasts cost: assumes 70% of contract when a job is barely started, extrapolates later, never below spend', () => {
    expect(forecastCost(100, 1000, 10)).toBe(700);
    expect(forecastCost(900, 1000, 10)).toBe(900);
    expect(forecastCost(300, 1000, 50)).toBe(600);
    expect(forecastCost(500, 1000, 100)).toBe(500);
  });
  it('adds contract, collections and margin across active jobs only', () => {
    expect(pf.jobs).toHaveLength(5);
    expect(pf.contract).toBe(pf.jobs.reduce((s, j) => s + j.contract, 0));
    expect(pf.contract - pf.forecastCost).toBe(pf.margin);
    expect(pf.outstanding).toBe(pf.contract - pf.collected);
    expect(pf.quotes).toHaveLength(1);
    expect(pf.quotesValue).toBe(d.projects.find((p) => p.status === 'quote')!.budget);
  });
  it('seed margins are believable', () => {
    for (const j of pf.jobs) { expect(j.marginPct).toBeGreaterThan(5); expect(j.marginPct).toBeLessThan(60); }
  });
  it('splits cost into labor, parts and sublet', () => {
    const m = costMix(d);
    expect(m.labor).toBeGreaterThan(0);
    expect(m.parts).toBeGreaterThan(0);
    expect(m.sublet).toBeGreaterThan(0);
  });
  it('ranks supplier exposure and counts overdue orders', () => {
    const ex = supplierExposure(d, TODAY);
    expect(ex.length).toBeGreaterThan(2);
    for (let i = 1; i < ex.length; i++) expect(ex[i - 1].value).toBeGreaterThanOrEqual(ex[i].value);
    expect(ex.some((e) => e.late > 0)).toBe(true);
  });
  it('buckets deliveries by month and puts overdue jobs in the first month', () => {
    const m = monthlyDeliveries(d, TODAY, 6);
    expect(m).toHaveLength(6);
    expect(m.reduce((s, b) => s + b.value, 0)).toBeLessThanOrEqual(pf.contract);
    expect(m[0].jobs).toContain('ACR-003'); // Camaro is already late
  });
  it('shows weekly hours against capacity', () => {
    const w = weeklyHours(d, TODAY, 4);
    expect(w.length).toBeGreaterThanOrEqual(2);
    expect(w.at(-1)!.current).toBe(true);
    expect(w[0].capacity).toBe(d.mechanics.reduce((s, m) => s + m.dailyHours * 5, 0)); // first week shown is a full week
  });
  it('lists risks most serious first, including the late job and the leave collision', () => {
    const r = riskRegister(d, TODAY);
    expect(r[0].level).toBe('high');
    expect(r.some((x) => /past its delivery date/.test(x.text))).toBe(true);
    expect(r.some((x) => x.to === '/attendance')).toBe(true);
    const firstMedium = r.findIndex((x) => x.level === 'medium');
    expect(r.slice(firstMedium).every((x) => x.level === 'medium')).toBe(true);
  });
  it('records and removes a payment', () => {
    let s = reducer(d, { type: 'addPayment', projectId: 'p4', date: TODAY, amount: 100000, note: 'Progress' });
    expect(jobFinance(s.projects.find((p) => p.id === 'p4')!, s, TODAY).collected).toBe(d.projects.find((p) => p.id === 'p4')!.payments.reduce((a, x) => a + x.amount, 0) + 100000);
    const id = s.projects.find((p) => p.id === 'p4')!.payments.at(-1)!.id;
    s = reducer(s, { type: 'removePayment', projectId: 'p4', id });
    expect(s.projects.find((p) => p.id === 'p4')!.payments).toHaveLength(1);
  });
});
