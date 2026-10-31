import { describe, expect, it } from 'vitest';
import { addDays, startOfWeek } from './dates';
import { allBlockers, attendanceSummary, buildAlerts, coverageGaps, hoursBetween, isLateIn, isOut, overtimeHours, workedHours, buildPhases, dayLoad, daysOverdue, isOverbooked, partRisk, phasePercent, projectHealth, projectProgress, SERVICES, SERVICE_KEYS, PACKAGES, PHASE_DEFS, taskBlocker, coatingDates, coatingFollowUps } from './logic';
import { buildSeed } from './seed';
import { addMonths, addYears } from './dates';
import { dailySnapshot, nextWorkday, snapshotText } from './snapshot';
import { byService, costMix, planIsComplete, plannedCost, forecastCost, jobFinance, monthlyDeliveries, portfolio, riskRegister, supplierExposure, weeklyHours } from './exec';
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
    expect(ph).toHaveLength(SERVICES.restoration.phases.length);
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
    expect(added.code).toBe('ACR-012');
    expect(added.phases).toHaveLength(SERVICES.restoration.phases.length);
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
    expect(pf.jobs).toHaveLength(8);
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

describe('daily snapshot', () => {
  const d = buildSeed(TODAY);
  const s = dailySnapshot(d, TODAY);
  it('skips weekends when finding the next workday', () => {
    expect(nextWorkday('2026-03-20')).toBe('2026-03-23'); // Friday → Monday
    expect(nextWorkday(TODAY)).toBe('2026-03-19');
  });
  it("summarises the team from today's attendance", () => {
    expect(s.team.total).toBe(6);
    expect(s.team.clockedIn).toHaveLength(5);
    expect(s.team.late.map((l) => l.mechanic.id)).toEqual(['m3']);
    expect(s.team.notIn.map((m) => m.id)).toEqual(['m5']);
    expect(s.team.hoursSoFar).toBe(0); // nobody has clocked out yet
  });
  it("counts today's tasks by state, with blocked work kept out of running and to-start", () => {
    const f = s.floor;
    expect(f.tasks.every((t) => t.date === TODAY)).toBe(true);
    expect(f.done + f.running + f.todo + f.blocked).toBe(f.tasks.length);
    expect(f.plannedHours).toBe(f.tasks.reduce((x, t) => x + t.estHours, 0));
  });
  it('finds what arrives, what is overdue and what was paid or posted today', () => {
    expect(s.parts.arriving.map((x) => x.name)).toContain('Door glass & regulators');
    expect(s.parts.overdue.length).toBeGreaterThan(0);
    expect(s.money.payments).toHaveLength(1);
    expect(s.money.total).toBe(s.money.payments[0].payment.amount);
    expect(s.updates.map((u) => u.project.code)).toEqual(['ACR-003']);
    expect(s.jobs.late.map((j) => j.project.code)).toContain('ACR-003');
  });
  it('reflects a clock-in and a new payment straight away', () => {
    let x = reducer(d, { type: 'clockIn', mechanicId: 'm5', date: TODAY, time: '08:05' });
    x = reducer(x, { type: 'addPayment', projectId: 'p4', date: TODAY, amount: 50000 });
    const t = dailySnapshot(x, TODAY);
    expect(t.team.clockedIn).toHaveLength(6);
    expect(t.team.notIn).toHaveLength(0);
    expect(t.money.payments).toHaveLength(2);
  });
  it('produces a paste-ready text summary', () => {
    const text = snapshotText(s, d);
    expect(text).toMatch(/^Alex Restoration · Daily snapshot/);
    expect(text).toContain('5 of 6 in');
    expect(text).toContain('Priya');
    expect(text).toContain('Door glass & regulators');
    expect(text.split('\n').length).toBeGreaterThan(6);
  });
});

describe('services', () => {
  const d = buildSeed(TODAY);
  it('gives every service its own ordered steps, all of which have a label and weight', () => {
    expect(SERVICE_KEYS).toEqual(['restoration', 'paint', 'detailing', 'ceramic']);
    for (const k of SERVICE_KEYS) {
      const keys = SERVICES[k].phases;
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) { expect(PHASE_DEFS[key].label).toBeTruthy(); expect(PHASE_DEFS[key].weight).toBeGreaterThan(0); }
      expect(keys.at(-1)).toBe('delivery');
    }
    expect(SERVICES.detailing.phases).toContain('wash');
    expect(SERVICES.ceramic.phases).toEqual(expect.arrayContaining(['correction', 'coating', 'cure']));
  });
  it('builds a same-day detail with every step on one date, in order', () => {
    const ph = buildPhases('2026-03-18', '2026-03-18', 'detailing');
    expect(ph.map((p) => p.key)).toEqual(SERVICES.detailing.phases);
    expect(ph.every((p) => p.start === '2026-03-18' && p.end === '2026-03-18')).toBe(true);
  });
  it('spreads a three-day coating job across the days without running past the target', () => {
    const ph = buildPhases('2026-03-18', '2026-03-20', 'ceramic');
    expect(ph[0].start).toBe('2026-03-18');
    expect(ph.at(-1)!.end).toBe('2026-03-20');
    for (let i = 1; i < ph.length; i++) expect(ph[i].start >= ph[i - 1].start).toBe(true);
    for (const p of ph) expect(p.end >= p.start && p.end <= '2026-03-20').toBe(true);
  });
  it('keeps long restoration jobs on their own days, exactly as before', () => {
    const ph = buildPhases('2026-01-05', '2026-05-05', 'restoration');
    for (let i = 1; i < ph.length; i++) expect(ph[i].start > ph[i - 1].end).toBe(true);
    expect(ph.at(-1)!.end).toBe('2026-05-05');
  });
  it('seeds one or more jobs for every service, each using that service\'s own steps', () => {
    for (const k of SERVICE_KEYS) {
      const jobs = d.projects.filter((p) => p.service === k);
      expect(jobs.length, k).toBeGreaterThan(0);
      for (const p of jobs) expect(p.phases.map((x) => x.key)).toEqual(SERVICES[k].phases);
    }
  });
  it('works out progress from the job\'s own steps, so a nearly finished detail is not held back by restoration steps', () => {
    const detail = d.projects.find((p) => p.service === 'detailing')!;
    const pct = projectProgress(detail, d.tasks);
    expect(pct).toBeGreaterThan(5);
    expect(pct).toBeLessThan(100);
    let s = d;
    for (const ph of detail.phases) s = reducer(s, { type: 'setPhaseStatus', projectId: detail.id, key: ph.key, status: 'done' });
    expect(s.projects.find((p) => p.id === detail.id)!.status).toBe('completed');
    expect(projectProgress(s.projects.find((p) => p.id === detail.id)!, s.tasks)).toBe(100);
  });
  it('has a price list for the fixed-price services and none for the quoted ones', () => {
    expect(SERVICES.detailing.pricing).toBe('package');
    expect(SERVICES.ceramic.pricing).toBe('package');
    expect(SERVICES.restoration.pricing).toBe('estimate');
    expect(PACKAGES.ceramic.map((x) => x.warrantyYears)).toEqual([1, 3, 5]);
    for (const pk of [...PACKAGES.detailing, ...PACKAGES.ceramic]) expect(pk.price).toBeGreaterThan(0);
    const coating = d.projects.find((p) => p.service === 'ceramic')!;
    expect(PACKAGES.ceramic.some((x) => x.name === coating.packageName && x.price === coating.budget)).toBe(true);
  });
  it('creates a new job with the right steps for the chosen service', () => {
    // Form values only: a new job is given its own id, and starts with no payments.
    const { id: _id, payments: _pay, ...base } = d.projects[0];
    const s = reducer(d, { type: 'addProject', project: { ...base, status: undefined, service: 'ceramic', packageName: PACKAGES.ceramic[0].name, startDate: TODAY, targetDate: addDays(TODAY, 3), budget: PACKAGES.ceramic[0].price } });
    const added = s.projects.at(-1)!;
    expect(added.service).toBe('ceramic');
    expect(added.phases.map((p) => p.key)).toEqual(SERVICES.ceramic.phases);
    expect(added.payments).toEqual([]);
  });
  it('splits the executive numbers by service and the pieces add back up to the whole', () => {
    const rows = byService(d, TODAY);
    expect(rows.map((r) => r.service)).toEqual(SERVICE_KEYS);
    const pf2 = portfolio(d, TODAY);
    expect(rows.reduce((s, r) => s + r.contract, 0)).toBe(pf2.contract);
    expect(rows.reduce((s, r) => s + r.jobs, 0)).toBe(pf2.jobs.length);
    for (const r of rows.filter((x) => x.jobs > 0)) expect(r.avgJob).toBe(Math.round(r.contract / r.jobs));
  });
  it('keeps every new job and every mechanic within a normal day', () => {
    for (const m of d.mechanics) for (const t of d.tasks.filter((x) => x.mechanicId === m.id && x.status !== 'done')) expect(isOverbooked(d.tasks, m, t.date), `${m.name} ${t.date}`).toBe(false);
  });
});

describe('forecasting short jobs from their plan', () => {
  const d = buildSeed(TODAY);
  const byCode = (code: string) => d.projects.find((p) => p.code === code)!;
  it('treats a job as fully planned only when every step has a task', () => {
    expect(planIsComplete(byCode('ACR-008'), d)).toBe(true); // detailing
    expect(planIsComplete(byCode('ACR-009'), d)).toBe(true); // ceramic
    expect(planIsComplete(byCode('ACR-007'), d)).toBe(true); // paint
    expect(planIsComplete(byCode('ACR-001'), d)).toBe(false); // restoration plan still has gaps
  });
  it('forecasts a fully planned job from its labor and parts, not from the 70% rule', () => {
    const p = byCode('ACR-009');
    const f = jobFinance(p, d, TODAY);
    expect(f.forecastCost).toBe(Math.max(f.spent, plannedCost(p, d)));
    expect(f.forecastCost).not.toBe(Math.round(p.budget * 0.7));
  });
  it('gives the short services believable, different margins', () => {
    const margins = ['ACR-007', 'ACR-008', 'ACR-009'].map((c) => jobFinance(byCode(c), d, TODAY).marginPct);
    for (const m of margins) { expect(m).toBeGreaterThan(10); expect(m).toBeLessThan(65); }
    expect(new Set(margins).size).toBeGreaterThan(1);
  });
  it('still falls back on progress for a restoration whose plan is incomplete', () => {
    const p = byCode('ACR-001');
    const f = jobFinance(p, d, TODAY);
    expect(f.forecastCost).toBe(forecastCost(f.spent, p.budget, f.progress));
  });
});

describe('ceramic coating records', () => {
  const d = buildSeed(TODAY);
  const byCode = (code: string) => d.projects.find((p) => p.code === code)!;
  it('works out the dry period, warranty end and maintenance check from the dates', () => {
    const p = { ...byCode('ACR-010'), coating: { cureStarted: '2026-01-10', handoverDate: '2026-01-11', warrantyYears: 3 } };
    const c = coatingDates(p);
    expect(c.washAfter).toBe('2026-01-17'); // 7 days after the cure started
    expect(c.warrantyEnds).toBe('2029-01-11');
    expect(c.maintenanceDue).toBe('2027-01-11');
    expect(coatingDates({ ...p, coating: { ...p.coating, washAfter: '2026-01-20' } }).washAfter).toBe('2026-01-20'); // a chosen date wins
    expect(coatingDates({ ...p, coating: undefined })).toEqual({});
  });
  it('keeps leap days and short months sensible', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28');
  });
  it('seeds a record on every ceramic job, with before and after readings on the finished ones', () => {
    const jobs = d.projects.filter((p) => p.service === 'ceramic');
    expect(jobs.length).toBeGreaterThanOrEqual(3);
    for (const p of jobs) { expect(p.coating?.product).toBeTruthy(); expect(p.coating?.batch).toBeTruthy(); }
    for (const p of jobs.filter((x) => x.status === 'delivered')) {
      expect(p.coating!.glossAfter!).toBeGreaterThan(p.coating!.glossBefore!);
      expect(p.coating!.handoverDate).toBeTruthy();
    }
  });
  it('lists a car that must stay dry and a maintenance check that is coming up', () => {
    const f = coatingFollowUps(d, TODAY);
    const dry = f.filter((x) => x.kind === 'no_wash');
    const checks = f.filter((x) => x.kind === 'maintenance');
    expect(dry.map((x) => x.project.code)).toEqual(['ACR-011']);
    expect(dry[0].daysAway).toBe(4);
    expect(checks.map((x) => x.project.code)).toContain('ACR-010');
    expect(checks.find((x) => x.project.code === 'ACR-010')!.daysAway).toBeLessThanOrEqual(14);
    for (let i = 1; i < f.length; i++) expect(f[i].daysAway).toBeGreaterThanOrEqual(f[i - 1].daysAway);
  });
  it('stops reminding about a check once it is marked done', () => {
    const s = reducer(d, { type: 'updateCoating', projectId: 'p10', patch: { maintenanceDone: true } });
    expect(coatingFollowUps(s, TODAY).some((x) => x.project.code === 'ACR-010')).toBe(false);
  });
  it('records the cure date when the cure step starts, and the handover and warranty when delivery is signed off', () => {
    let s = reducer(d, { type: 'setPhaseStatus', projectId: 'p9', key: 'cure', status: 'in_progress' });
    expect(s.projects.find((p) => p.id === 'p9')!.coating!.cureStarted).toBeTruthy();
    for (const k of ['inspect', 'wash', 'correction', 'coating', 'cure', 'qc', 'delivery'] as const) s = reducer(s, { type: 'setPhaseStatus', projectId: 'p9', key: k, status: 'done' });
    const c = s.projects.find((p) => p.id === 'p9')!.coating!;
    expect(c.handoverDate).toBeTruthy();
    expect(c.warrantyYears).toBe(5); // from the 5-year package
    expect(c.batch).toBe('B24-0916'); // nothing already recorded is lost
  });
  it('does not touch the coating record of other services', () => {
    const s = reducer(d, { type: 'setPhaseStatus', projectId: 'p8', key: 'delivery', status: 'done' });
    expect(s.projects.find((p) => p.id === 'p8')!.coating).toBeUndefined();
  });
  it('shows the follow-ups in the daily snapshot and the text summary', () => {
    const snap = dailySnapshot(d, TODAY);
    expect(snap.coating.noWash).toHaveLength(1);
    expect(snap.coating.maintenance.map((x) => x.project.code)).toContain('ACR-010');
    const text = snapshotText(snap, d);
    expect(text).toContain('KEEP DRY');
    expect(text).toContain('COATING CHECKS');
  });
  it('keeps delivered coating jobs out of the active numbers', () => {
    expect(portfolio(d, TODAY).jobs.map((j) => j.project.code)).not.toContain('ACR-010');
  });
});

describe('snapshot noise', () => {
  it('does not announce every step of a same-day job as starting or finishing today', () => {
    const d = buildSeed(TODAY);
    const s = dailySnapshot(d, TODAY);
    const shortJob = d.projects.find((p) => p.service === 'detailing')!;
    expect(s.jobs.phasesStarting.some((x) => x.project.id === shortJob.id)).toBe(false);
    expect(s.jobs.phasesEnding.some((x) => x.project.id === shortJob.id)).toBe(false);
    expect(s.jobs.dueToday.map((p) => p.id)).toContain(shortJob.id); // it still shows as a delivery today
  });
});
