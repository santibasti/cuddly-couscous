import { describe, expect, it } from 'vitest';
import { buildPayrollLines, computePayrollLine, payrollEligible } from './business';
import { employeeJobPay, jobBonus, jobsAttended, panelBonusPerCrew } from './jobpay';
import { weekOf, weeklyGrid } from './payrollweek';
import { seedDB } from './seed';
import { clone } from './util';

describe('panel bonus per crew member', () => {
  it('follows FLOOR(additional panels ÷ (crew × 10)) × ₱140, full thresholds only', () => {
    expect(panelBonusPerCrew(30, 3)).toBe(140); expect(panelBonusPerCrew(60, 3)).toBe(280); expect(panelBonusPerCrew(90, 3)).toBe(420);
    expect(panelBonusPerCrew(59, 3)).toBe(140);       // not 280: no partial bonus
    expect(panelBonusPerCrew(29, 3)).toBe(0);
    expect(panelBonusPerCrew(20, 2)).toBe(140); expect(panelBonusPerCrew(19, 2)).toBe(0); expect(panelBonusPerCrew(100, 5)).toBe(280);
    expect(panelBonusPerCrew(50, 0)).toBe(0); expect(panelBonusPerCrew(0, 3)).toBe(0);
  });
  it('adjusts to the crew size and the amount / step set in settings', () => {
    expect(panelBonusPerCrew(60, 4)).toBe(140); expect(panelBonusPerCrew(60, 6)).toBe(140); expect(panelBonusPerCrew(60, 7)).toBe(0);
    expect(panelBonusPerCrew(60, 3, 10, 200)).toBe(400); expect(panelBonusPerCrew(60, 3, 20, 140)).toBe(140);
  });
});

/** A small world: one job on 2026-03-03 with a leader and two crew, a counted panel table and a starter package. */
function world(over: { additional?: number; finished?: boolean } = {}) {
  const db = clone(seedDB());
  const [a, b, c, d] = db.employees.filter((e) => !e.deleted_at && e.status !== 'inactive').slice(0, 4);
  const job = { ...clone(db.jobs[0]), id: 'jx', number: 'JOB-X', leader_id: a.id, crew_ids: [b.id, c.id], status: over.finished === false ? 'In Progress' : 'Completed', start_at: '2026-03-03T08:00', end_at: '2026-03-03T17:00', pay_outside_mm: false, pay_commercial: false, deleted_at: undefined };
  const total = 30 + (over.additional ?? 90);
  const wf = { id: 'wx', job_id: 'jx', panels: [{ id: 'r1', area: '1st Floor', side: 'Front', external: total, internal: 0 }], package_panels: 30, finish_at: over.finished === false ? undefined : '2026-03-03T15:00', arr_crew_present: [a.id, b.id, c.id], arr_crew_absent: [] };
  db.jobs = [...db.jobs, job as never]; db.workflows = [...db.workflows, wf as never];
  const att = (emp: string, date = '2026-03-03', extra = {}) => ({ id: `${emp}-${date}`, employee_id: emp, date, kind: 'Present', clock_in: `${date}T09:30`, clock_out: `${date}T17:00`, worked_hours: 6, late_min: 90, undertime_min: 0, ot_min: 0, approval: 'Approved', job_id: 'jx', field_work: true, ...extra });
  db.attendance = [...db.attendance.filter((x) => x.date < '2026-03-01' || x.date > '2026-03-31'), att(a.id), att(b.id), att(c.id), att(d.id, '2026-03-03', { job_id: undefined })] as never;
  const period = { id: 'p', label: 'Mar', start: '2026-03-01', end: '2026-03-07', type: 'weekly', status: 'Draft', locked: false } as never;
  return { db, a, b, c, d, job, wf, period, att };
}

describe('job bonus', () => {
  it('uses the final billable panels beyond the package and the assigned crew', () => {
    const { db, job } = world();                      // 120 counted, package 30 → 90 additional, 3 crew
    const b = jobBonus(db, job as never);
    expect(b).toMatchObject({ crew: 3, additional_panels: 90, panel_each: 420, outside_each: 0, commercial_each: 0, each: 420, total: 1260, final: true });
  });
  it('adds the Owner options for outside Metro Manila and commercial projects to every crew member', () => {
    const { db, job } = world(); db.settings.job_pay = { panel_bonus: 140, panel_step: 10, outside_mm_bonus: 300, commercial_bonus: 200 };
    const on = { ...job, pay_outside_mm: true, pay_commercial: true } as never;
    expect(jobBonus(db, on)).toMatchObject({ outside_each: 300, commercial_each: 200, each: 920, total: 2760 });
    expect(jobBonus(db, { ...job, pay_outside_mm: true } as never).each).toBe(720);
  });
  it('reduces the crew size automatically when someone is absent', () => {
    const w = world(); const wf = w.db.workflows.find((x) => x.id === 'wx')!; wf.arr_crew_absent = [{ id: w.b.id, reason: 'Sick' }] as never;
    const b = jobBonus(w.db, w.job as never);               // 90 additional panels, 2 present: floor(90 / 20) = 4 × 140
    expect(b).toMatchObject({ crew: 2, absent: [w.b.id], panel_each: 560, total: 1120 }); expect(b.ids).toEqual([w.a.id, w.c.id]);
    const rows = employeeJobPay(w.db, w.a, '2026-03-01', '2026-03-07'); expect(rows[0].panel_bonus).toBe(560);
    expect(employeeJobPay(w.db, w.b, '2026-03-01', '2026-03-07')).toEqual([]);              // the absent one is not paid
  });
  it('also treats an Absent / Leave attendance record on the job day as absent', () => {
    const w = world(); w.db.attendance = w.db.attendance.map((x) => (x.employee_id === w.c.id ? { ...x, kind: 'Absent', clock_in: undefined, clock_out: undefined } : x)) as never;
    expect(jobBonus(w.db, w.job as never)).toMatchObject({ crew: 2, absent: [w.c.id], panel_each: 560 });
  });
  it('is not final until the work is finished', () => { const { db, job } = world({ finished: false }); expect(jobBonus(db, job as never).final).toBe(false); });
});

describe('pay per job order', () => {
  it('lists the job orders attended: assigned, approved and clocked in, late or not; others are left out', () => {
    const { db, a, d } = world();
    expect(jobsAttended(db, a.id, '2026-03-01', '2026-03-07').map((j) => j.id)).toEqual(['jx']);
    expect(jobsAttended(db, d.id, '2026-03-01', '2026-03-07')).toEqual([]);                      // not assigned to the job
    expect(jobsAttended(db, a.id, '2026-03-08', '2026-03-14')).toEqual([]);                      // outside the period
    db.attendance = db.attendance.map((x) => (x.employee_id === a.id ? { ...x, approval: 'Pending' } : x)) as never;
    expect(jobsAttended(db, a.id, '2026-03-01', '2026-03-07')).toEqual([]);                      // not approved yet
  });
  it('does not count a crew member marked absent on the job, or a cancelled job', () => {
    const { db, b } = world(); const wf = db.workflows.find((w) => w.id === 'wx')!; wf.arr_crew_absent = [{ id: b.id, reason: 'Sick' }] as never;
    expect(jobsAttended(db, b.id, '2026-03-01', '2026-03-07')).toEqual([]);
    const w2 = world(); w2.db.jobs.find((j) => j.id === 'jx')!.status = 'Cancelled';
    expect(jobsAttended(w2.db, w2.a.id, '2026-03-01', '2026-03-07')).toEqual([]);
  });
  it('pays the employee rate per job order attended, whatever time they arrived, and records the bonus under them', () => {
    const { db, a, period } = world(); const emp = { ...a, pay_basis: 'per_job' as const, job_rate: 800, rest_day: 0 };
    const rows = employeeJobPay(db, emp, '2026-03-01', '2026-03-07');
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ job_id: 'jx', rate: 800, panel_bonus: 420, total: 1220, final: true });
    const l = computePayrollLine({ emp, period, attendance: db.attendance, holidays: [], adjustments: [], settings: db.settings, asOf: '2026-03-07', jobPay: rows }).line;
    expect(l.regular_pay).toBe(800); expect(l.late_undertime_deduction).toBe(0); expect(l.incentives).toBe(420); expect(l.days_worked).toBe(1);
    expect(l.direct_labor_by_job.jx).toBe(1220); expect(l.job_pay).toHaveLength(1); expect(l.gross).toBe(1220);
  });
  it('pays two job orders at the rate each', () => {
    const { db, a, period, att } = world(); const emp = { ...a, pay_basis: 'per_job' as const, job_rate: 800, rest_day: 0 };
    db.jobs.push({ ...clone(db.jobs.find((j) => j.id === 'jx')!), id: 'jy', number: 'JOB-Y', start_at: '2026-03-05T08:00', end_at: '2026-03-05T17:00' } as never);
    db.workflows.push({ id: 'wy', job_id: 'jy', panels: [], arr_crew_present: [a.id], arr_crew_absent: [] } as never);
    db.attendance.push(att(a.id, '2026-03-05', { job_id: 'jy' }) as never);
    const rows = employeeJobPay(db, emp, '2026-03-01', '2026-03-07');
    expect(rows.map((r) => r.rate)).toEqual([800, 800]);
    expect(computePayrollLine({ emp, period, attendance: db.attendance, holidays: [], adjustments: [], settings: db.settings, asOf: '2026-03-07', jobPay: rows }).line.regular_pay).toBe(1600);
  });
  it('pays the bonus to employees on daily pay too, separate from their daily salary, and only once the job is finished', () => {
    const w = world(); const emp = { ...w.a, pay_basis: 'daily' as const, daily_rate: 700, rest_day: 0 };
    const l = computePayrollLine({ emp, period: w.period, attendance: w.db.attendance, holidays: [], adjustments: [], settings: w.db.settings, asOf: '2026-03-07', jobPay: employeeJobPay(w.db, emp, '2026-03-01', '2026-03-07') }).line;
    expect(l.regular_pay).toBe(700); expect(l.incentives).toBe(420);
    const open = world({ finished: false });
    expect(employeeJobPay(open.db, { ...open.a, pay_basis: 'per_job', job_rate: 800 } as never, '2026-03-01', '2026-03-07')[0]).toMatchObject({ rate: 800, panel_bonus: 0, final: false });
  });
  it('flows through the payroll builder for a payroll period', () => {
    const { db, a, period } = world(); const e = db.employees.find((x) => x.id === a.id)!; e.pay_basis = 'per_job'; e.job_rate = 800; e.payroll_type = 'weekly'; e.hire_date = '2026-01-01'; e.status = 'regular';
    const line = buildPayrollLines(db, period as never, '2026-03-07').lines.find((l) => l.employee_id === a.id)!;
    expect(line.regular_pay).toBe(800); expect(line.incentives).toBe(420);
  });
});

describe('who a payroll includes', () => {
  it('includes the crew present on job orders in the period when they are paid per job order, whatever their Payroll type', () => {
    const { db, a, b, c, d, period } = world();
    const set = (id: string, patch: object) => Object.assign(db.employees.find((e) => e.id === id)!, { status: 'regular', hire_date: '2026-01-01', ...patch });
    set(a.id, { pay_basis: 'per_job', job_rate: 800, payroll_type: 'monthly' });     // present on the job, type does not match
    set(d.id, { pay_basis: 'per_job', job_rate: 800, payroll_type: 'weekly' });      // matches the type but was not on any job
    set(b.id, { pay_basis: 'daily', payroll_type: 'monthly' }); set(c.id, { pay_basis: 'daily', payroll_type: 'weekly' });
    const ids = payrollEligible(db, period as never).map((e) => e.id);
    expect(ids).toContain(a.id); expect(ids).not.toContain(d.id);
    expect(ids).not.toContain(b.id); expect(ids).toContain(c.id);                    // daily / monthly staff still follow their Payroll type
    const line = buildPayrollLines(db, period as never, '2026-03-07').lines.find((l) => l.employee_id === a.id)!;
    expect(line.regular_pay).toBe(800);
  });
  it('lists a per-job-order employee whose attendance is still pending (so the pending warning shows) but pays nothing until it is approved', () => {
    const { db, a, period } = world(); Object.assign(db.employees.find((e) => e.id === a.id)!, { status: 'regular', hire_date: '2026-01-01', pay_basis: 'per_job', job_rate: 800, payroll_type: 'monthly' });
    db.attendance = db.attendance.map((x) => (x.employee_id === a.id ? { ...x, approval: 'Pending' } : x)) as never;
    const r = buildPayrollLines(db, period as never, '2026-03-07');
    expect(r.lines.find((l) => l.employee_id === a.id)?.regular_pay).toBe(0); expect(r.pending).toBeGreaterThan(0);
  });
});

describe('delete a payroll period', () => {
  it('removes a draft or waiting period with its calculated lines, and refuses approved or finalized ones', async () => {
    const A = await import('./actions'); const { store } = await import('./store');
    await store.login('owner@topmop.ph', 'topmop123');
    const mk = (label: string, start: string) => { const p = A.createPeriod({ label, start, end: start, type: 'daily' }); return p as { id: string }; };
    const draft = mk('t-draft', '2031-01-02'); const waiting = mk('t-wait', '2031-01-03'); const approved = mk('t-appr', '2031-01-04');
    A.generateRun(waiting.id); A.submitPayroll(waiting.id);
    expect(store.getDB().periods.find((p) => p.id === waiting.id)?.status).toBe('For Approval');
    A.deletePeriod(draft.id); A.deletePeriod(waiting.id);
    const d = store.getDB();
    expect(d.periods.find((p) => p.id === draft.id)?.deleted_at).toBeTruthy(); expect(d.periods.find((p) => p.id === waiting.id)?.deleted_at).toBeTruthy();
    expect(d.runs.filter((r) => r.period_id === waiting.id).every((r) => !!r.deleted_at)).toBe(true);
    store.update('periods', approved.id, { status: 'Approved' } as never);
    expect(() => A.deletePeriod(approved.id)).toThrow(/approved/);
  });
});

describe("today's attendance and the automatic payroll", () => {
  it("counts today's attendance only once it is completed (clocked out)", async () => {
    const { db, a, period, att } = world(); const emp = { ...a, pay_basis: 'daily' as const, daily_rate: 700, rest_day: 0 };
    const T = '2026-03-03';
    const run = (clockOut?: string) => computePayrollLine({ emp, period, attendance: [att(a.id, T, { clock_out: clockOut, job_id: undefined }) ] as never, holidays: [], adjustments: [], settings: db.settings, asOf: T }).line;
    expect(run(undefined).days_worked).toBe(0);                          // still working: not paid yet
    expect(run(`${T}T17:00`).days_worked).toBe(1);                       // completed
    const w = world(); const d2 = { ...w.db, attendance: w.db.attendance.map((x) => (x.employee_id === w.a.id ? { ...x, clock_out: undefined } : x)) } as never;
    expect(jobsAttended(d2, w.a.id, '2026-03-01', '2026-03-07', false, T)).toEqual([]);
    expect(jobsAttended(d2, w.a.id, '2026-03-01', '2026-03-07', false, '2026-03-04').map((j) => j.id)).toEqual(['jx']);   // the next day it counts
  });
  it('fills a draft payroll in by itself, and only changes it when attendance changes', async () => {
    const A = await import('./actions'); const { store } = await import('./store');
    await store.login('owner@topmop.ph', 'topmop123');
    const emps = store.getDB().employees.filter((e) => !e.deleted_at && e.status !== 'inactive' && e.pay_basis === 'daily');
    const [e1, e2] = [emps[0], emps.find((e) => e.id !== emps[0].id && e.payroll_type === emps[0].payroll_type)!];
    for (const e of [e1, e2]) store.update('employees', e.id, { hire_date: '2020-01-01', rest_day: 1 } as never);
    const day = '2032-03-03';   // a Wednesday
    const clock = (emp: string) => store.insert('attendance', { employee_id: emp, date: day, kind: 'Present', clock_in: `${day}T08:00`, clock_out: `${day}T17:00`, field_work: false, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 8, approval: 'Approved' } as never);
    clock(e1.id);
    const per = A.createPeriod({ label: 'auto-fill test', start: day, end: day, type: e1.payroll_type }) as { id: string };
    expect(A.autoFillPayroll()).toBeGreaterThanOrEqual(1);
    const lines = () => store.getDB().runs.find((r) => r.period_id === per.id)!.lines;
    expect(lines().find((l) => l.employee_id === e1.id)?.days_worked).toBe(1);
    expect(lines().some((l) => l.employee_id === e2.id && l.days_worked > 0)).toBe(false);
    expect(A.autoFillPayroll()).toBe(0);                                  // nothing changed: nothing written
    clock(e2.id);
    expect(A.autoFillPayroll()).toBe(1);
    expect(lines().find((l) => l.employee_id === e2.id)?.days_worked).toBe(1);
    store.update('periods', per.id, { status: 'For Approval' } as never);
    clock(emps.find((e) => e.id !== e1.id && e.id !== e2.id)!.id);
    expect(A.autoFillPayroll()).toBe(0);                                  // a period sent for approval is not touched
  });
});

describe('weekly payroll table', () => {
  it('shows each day the rate earned and the bonuses of that day, and adds up to the gross pay', () => {
    const { db, a, b, period } = world();          // a job order on Tue 2026-03-03, 90 additional panels, 3 crew
    for (const id of [a.id, b.id]) Object.assign(db.employees.find((e) => e.id === id)!, { status: 'regular', hire_date: '2026-01-01', rest_day: 0 });
    Object.assign(db.employees.find((e) => e.id === a.id)!, { pay_basis: 'per_job', job_rate: 800 });
    Object.assign(db.employees.find((e) => e.id === b.id)!, { pay_basis: 'daily', daily_rate: 700, payroll_type: 'weekly' });
    const per = { ...(period as object), start: '2026-03-02', end: '2026-03-08' } as never;
    const { days, rows } = weeklyGrid(db, per, buildPayrollLines(db, { ...(per as object), type: 'weekly' } as never, '2026-03-08').lines.filter((l) => [a.id, b.id].includes(l.employee_id)), '2026-03-08');
    expect(days).toHaveLength(7); expect(days[0]).toBe('2026-03-02'); expect(days[6]).toBe('2026-03-08');
    const ra = rows.find((r) => r.emp.id === a.id)!, rb = rows.find((r) => r.emp.id === b.id)!;
    expect(ra.days['2026-03-03']).toMatchObject({ base: 800, bonus: 420, jobs: ['JOB-X'] }); expect(ra.days['2026-03-02']).toMatchObject({ base: 0, bonus: 0 });
    expect(ra).toMatchObject({ rate: 800, unit: 'job', panel: 420, total: 1220 });
    expect(rb.days['2026-03-03']).toMatchObject({ base: 700, bonus: 420 }); expect(rb).toMatchObject({ rate: 700, unit: 'day', total: 1120 });
    for (const r of rows) expect(r.total).toBeCloseTo(Object.values(r.days).reduce((t, c) => t + c.base + c.bonus, 0) + r.other, 2);
  });
  it('finds the Sunday to Saturday of a date', () => { expect(weekOf('2026-11-13')).toEqual({ start: '2026-11-08', end: '2026-11-14' }); expect(weekOf('2026-11-14')).toEqual({ start: '2026-11-08', end: '2026-11-14' }); expect(weekOf('2026-11-08').start).toBe('2026-11-08'); expect(weekOf('2026-11-15').start).toBe('2026-11-15'); });
  it('creates this week by itself once, never brings back a deleted week, and last week only when there was work in it', async () => {
    const A = await import('./actions'); const { store } = await import('./store'); const { today, addDays } = await import('./util');
    await store.login('owner@topmop.ph', 'topmop123');
    for (const p of store.getDB().periods.filter((x) => !x.deleted_at && x.type === 'weekly')) store.update('periods', p.id, { status: 'Draft' } as never), store.remove('periods', p.id);
    const ws = weekOf(today()).start;
    expect(A.ensureWeeklyPeriods()).toBeGreaterThanOrEqual(1);
    const mine = () => store.getDB().periods.filter((p) => !p.deleted_at && p.type === 'weekly' && p.start === ws);
    expect(mine()).toHaveLength(1); expect(mine()[0].end).toBe(addDays(ws, 6));
    expect(A.ensureWeeklyPeriods()).toBe(0);                                 // already there
    store.remove('periods', mine()[0].id);
    expect(A.ensureWeeklyPeriods()).toBe(0); expect(mine()).toHaveLength(0);   // a deleted week stays deleted
    // a draft week made Monday to Sunday by the earlier version is replaced by the Sunday to Saturday week
    const mon = addDays(ws, 1); store.insert('periods', { label: 'old Monday week', start: mon, end: addDays(mon, 6), type: 'weekly', status: 'Draft', locked: false } as never);
    store.update('periods', store.getDB().periods.find((p) => p.start === ws && p.deleted_at)!.id, { deleted_at: null } as never);
    store.remove('periods', store.getDB().periods.find((p) => p.start === ws && !p.deleted_at)!.id);
    expect(store.getDB().periods.some((p) => !p.deleted_at && p.start === mon)).toBe(true);
    void A.ensureWeeklyPeriods();
    expect(store.getDB().periods.some((p) => !p.deleted_at && p.start === mon)).toBe(false);
  });
});
