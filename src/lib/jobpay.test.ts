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
  const resident = db.clients.find((c) => c.type === 'Residential')!;      // a non-commercial client (commercial projects get no automatic bonus)
  const job = { ...clone(db.jobs[0]), client_id: resident.id, id: 'jx', number: 'JOB-X', leader_id: a.id, crew_ids: [b.id, c.id], status: over.finished === false ? 'In Progress' : 'Completed', start_at: '2026-03-03T08:00', end_at: '2026-03-03T17:00', pay_outside_mm: false, pay_commercial: false, deleted_at: undefined };
  const total = 30 + (over.additional ?? 90);
  const wf = { id: 'wx', job_id: 'jx', panels: [{ id: 'r1', area: '1st Floor', side: 'Front', external: total, internal: 0 }], package_panels: 30, finish_at: over.finished === false ? undefined : '2026-03-03T15:00', rep_client_at: over.finished === false ? undefined : '2026-03-03T16:00', arr_crew_present: [a.id, b.id, c.id], arr_crew_absent: [] };
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
  it('gives no automatic bonus on a commercial project; the Owner types it by hand for each crew member', () => {
    const { db, job } = world(); const commercial = db.clients.find((c) => c.type === 'Commercial')!;
    db.settings.job_pay = { panel_bonus: 140, panel_step: 10, outside_mm_bonus: 300, commercial_bonus: 0 };
    const cj = { ...(job as object), client_id: commercial.id };                             // 90 additional panels, 3 crew: a residential job would pay 420 each
    expect(jobBonus(db, cj as never)).toMatchObject({ manual: true, panel_each: 0, outside_each: 0, commercial_each: 0, each: 0, total: 0 });
    expect(jobBonus(db, { ...cj, pay_commercial_amount: 500 } as never)).toMatchObject({ manual: true, panel_each: 0, commercial_each: 500, each: 500, total: 1500 });
    expect(jobBonus(db, { ...cj, pay_commercial_amount: 500, pay_outside_mm: true } as never)).toMatchObject({ outside_each: 300, each: 800 });   // the Owner's out-of-town tick still applies
    expect(jobBonus(db, job as never)).toMatchObject({ manual: false, panel_each: 420 });                                                         // not commercial: the formula
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

describe('reverse an approved payroll', () => {
  it('reverses the expense, returns the period to a draft, and then it can be deleted; finalized ones cannot', async () => {
    const A = await import('./actions'); const { store } = await import('./store');
    await store.login('owner@topmop.ph', 'topmop123');
    const emp = store.getDB().employees.find((e) => !e.deleted_at && e.status !== 'inactive' && e.pay_basis === 'daily')!;
    store.update('employees', emp.id, { hire_date: '2020-01-01', rest_day: 1 } as never);
    const day = '2033-03-02';
    store.insert('attendance', { employee_id: emp.id, date: day, kind: 'Present', clock_in: `${day}T08:00`, clock_out: `${day}T17:00`, field_work: false, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 8, approval: 'Approved' } as never);
    const per = A.createPeriod({ label: 'reverse test', start: day, end: day, type: emp.payroll_type }) as { id: string };
    A.generateRun(per.id); A.submitPayroll(per.id); A.approvePayroll(per.id);
    const d1 = store.getDB(); const approved = d1.periods.find((p) => p.id === per.id)!; const expId = approved.expense_id!;
    expect(approved.status).toBe('Approved'); expect(d1.expenses.find((e) => e.id === expId)?.reversed).toBeFalsy();
    expect(() => A.deletePeriod(per.id)).toThrow(/approved/);                       // an approved payroll cannot be deleted directly
    expect(() => A.reversePayroll(per.id, ' ')).toThrow(/reason/);
    A.reversePayroll(per.id, 'Wrong week');
    const d2 = store.getDB(); const back = d2.periods.find((p) => p.id === per.id)!;
    expect(back.status).toBe('Draft'); expect(back.expense_id ?? null).toBeNull(); expect(d2.expenses.find((e) => e.id === expId)?.reversed).toBe(true);
    expect(() => A.reversePayroll(per.id, 'again')).toThrow(/approved/);            // only an approved payroll can be reversed
    A.deletePeriod(per.id);
    expect(store.getDB().periods.find((p) => p.id === per.id)?.deleted_at).toBeTruthy();
    // a finalized payroll is locked
    const day2 = '2033-03-03'; store.insert('attendance', { employee_id: emp.id, date: day2, kind: 'Present', clock_in: `${day2}T08:00`, clock_out: `${day2}T17:00`, field_work: false, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 8, approval: 'Approved' } as never);
    const p2 = A.createPeriod({ label: 'final test', start: day2, end: day2, type: emp.payroll_type }) as { id: string };
    A.generateRun(p2.id); A.submitPayroll(p2.id); A.approvePayroll(p2.id); A.finalizePayroll(p2.id);
    expect(() => A.reversePayroll(p2.id, 'oops')).toThrow(/finalized/); expect(() => A.deletePeriod(p2.id)).toThrow(/finalized/);
  });
});

describe('overnight and double shifts (9 AM to 3 AM the next day is one attendance)', () => {
  it('finds the shift in progress: today, or the one started yesterday that is still open', async () => {
    const { openShift } = await import('./business'); const { addDays } = await import('./util');
    const day = '2026-11-12', now = `${day}T01:00`;                                  // 1 AM
    const rec = (date: string, extra = {}) => ({ employee_id: 'e', date, clock_in: `${date}T09:00`, clock_out: undefined, deleted_at: undefined, ...extra });
    expect(openShift([rec(addDays(day, -1))], 'e', now)).toBeTruthy();               // yesterday 9 AM, still on duty at 1 AM
    expect(openShift([rec(addDays(day, -1), { clock_out: `${addDays(day, -1)}T15:00` })], 'e', now)).toBeUndefined();   // finished
    expect(openShift([rec(addDays(day, -1))], 'e', `${day}T20:00`)).toBeUndefined();     // 35 hours later: forgotten, not a shift
    expect(openShift([rec(day)], 'e', `${day}T10:00`)?.date).toBe(day);
    expect(openShift([rec(addDays(day, -1)), rec(day)], 'e', `${day}T10:00`)?.date).toBe(day);   // today's comes first
    expect(openShift([rec(addDays(day, -1), { deleted_at: 'x' })], 'e', now)).toBeUndefined();
  });
  it('clocks out after midnight on the record that started yesterday, and blocks a new clock-in until then', async () => {
    const A = await import('./actions'); const { store } = await import('./store'); const { today, addDays } = await import('./util');
    await store.login('owner@topmop.ph', 'topmop123');
    const emp = store.getDB().employees.find((e) => !e.deleted_at && e.status !== 'inactive' && e.department === 'Field Operations')!; const y = addDays(today(), -1);
    for (const a of store.getDB().attendance.filter((x) => x.employee_id === emp.id && (x.date === y || x.date === today()) && !x.deleted_at)) store.remove('attendance', a.id, { cascade: true });
    store.insert('attendance', { employee_id: emp.id, date: y, kind: 'Present', clock_in: `${y}T22:00`, field_work: false, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0, approval: 'Approved' } as never);
    expect(() => A.clockIn(emp.id, {})).toThrow(/still clocked in/);
    A.clockOut(emp.id, {});
    const mine = store.getDB().attendance.filter((x) => x.employee_id === emp.id && !x.deleted_at && (x.date === y || x.date === today()));
    expect(mine).toHaveLength(1); expect(mine[0].date).toBe(y); expect(mine[0].clock_out!.slice(0, 10)).toBe(today()); expect(mine[0].worked_hours).toBeGreaterThan(0);
  });
  it('counts a job order that starts after midnight for the crew on the shift that began the day before', () => {
    const { db, a, b, c } = world();                                                          // job on 2026-03-03; a, b, c clocked in that day
    const night = { ...clone(db.jobs.find((j) => j.id === 'jx')!), id: 'jn', number: 'JOB-N', start_at: '2026-03-04T00:30', end_at: '2026-03-04T03:00' };
    db.jobs.push(night as never); db.workflows.push({ id: 'wn', job_id: 'jn', panels: [], arr_crew_present: [a.id, b.id], arr_crew_absent: [] } as never);
    db.attendance = db.attendance.map((x) => (x.employee_id === a.id ? { ...x, job_id: undefined, clock_out: '2026-03-04T03:00' } : x)) as never;   // a worked 9:30 AM to 3 AM
    expect(jobsAttended(db, a.id, '2026-03-01', '2026-03-07', false, '2026-03-20').map((j) => j.id).sort()).toEqual(['jn', 'jx']);   // both job orders
    expect(jobsAttended(db, c.id, '2026-03-01', '2026-03-07', false, '2026-03-20').map((j) => j.id)).toEqual(['jx']);                 // c finished the same evening: only the day job
  });
});

describe('double shift on one day: 9 AM–3 PM, then 11 PM–3 AM the next day', () => {
  it('adds the hours of each shift (the gap between them is not worked)', async () => {
    const { shiftTimes } = await import('./business'); const e = { shift_start: '08:00', shift_end: '17:00' };
    const sessions = [{ in: '2026-11-09T09:00', out: '2026-11-09T15:00' }, { in: '2026-11-09T23:00', out: '2026-11-10T03:00' }];
    expect(shiftTimes(e, sessions, 5, 8)).toMatchObject({ worked_hours: 9, late_min: 60, ot_min: 60 });      // 5 h + 4 h; an hour late; an hour over 8 h
    expect(shiftTimes(e, [{ in: '2026-11-09T08:00', out: '2026-11-09T17:00' }], 5, 8)).toMatchObject({ worked_hours: 8, late_min: 0 });   // one shift: as before
  });
  it('lets the crew clock in again after clocking out, and clock out after midnight on the same attendance', async () => {
    const A = await import('./actions'); const { store } = await import('./store'); const { today } = await import('./util');
    await store.login('owner@topmop.ph', 'topmop123');
    const emp = store.getDB().employees.find((e) => !e.deleted_at && e.status !== 'inactive' && e.department === 'Field Operations')!; const T = today();
    for (const a of store.getDB().attendance.filter((x) => x.employee_id === emp.id && (x.date === T) && !x.deleted_at)) store.remove('attendance', a.id, { cascade: true });
    store.insert('attendance', { employee_id: emp.id, date: T, kind: 'Present', clock_in: `${T}T00:01`, clock_out: `${T}T00:05`, field_work: true, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0.07, approval: 'Approved' } as never);
    const rec = () => store.getDB().attendance.find((x) => x.employee_id === emp.id && x.date === T && !x.deleted_at)!;
    A.clockIn(emp.id, {});                                                       // second shift the same day
    expect(rec().clock_out ?? null).toBeNull(); expect(rec().sessions).toHaveLength(2); expect(rec().clock_in).toBe(`${T}T00:01`);   // first in kept
    expect(rec().sessions![0]).toEqual({ in: `${T}T00:01`, out: `${T}T00:05` }); expect(rec().approval).toBe('Approved');
    expect(store.getDB().attendance.filter((x) => x.employee_id === emp.id && x.date === T && !x.deleted_at)).toHaveLength(1);   // still one attendance
    expect(() => A.clockIn(emp.id, {})).toThrow(/Already clocked in/);           // not twice while on duty
    A.clockOut(emp.id, {});
    expect(rec().clock_out).toBeTruthy(); expect(rec().sessions![1].out).toBe(rec().clock_out);
    A.clockIn(emp.id, {});                                                       // and a third is possible too
    expect(rec().sessions).toHaveLength(3);
  });
  it('pays both job orders of the day (the 9 AM job and the 11 PM job) for the crew on the double shift', () => {
    const { db, a, c } = world();                                                // the day job is on 2026-03-03
    const night = { ...clone(db.jobs.find((j) => j.id === 'jx')!), id: 'jn', number: 'JOB-NIGHT', start_at: '2026-03-03T23:00', end_at: '2026-03-04T03:00' };
    db.jobs.push(night as never); db.workflows.push({ id: 'wn', job_id: 'jn', panels: [], arr_crew_present: [a.id, c.id], arr_crew_absent: [] } as never);
    db.attendance = db.attendance.map((x) => (x.employee_id === a.id ? { ...x, job_id: undefined, clock_in: '2026-03-03T09:00', clock_out: '2026-03-04T03:00', sessions: [{ in: '2026-03-03T09:00', out: '2026-03-03T15:00' }, { in: '2026-03-03T23:00', out: '2026-03-04T03:00' }] } : x)) as never;
    const emp = { ...a, pay_basis: 'per_job' as const, job_rate: 800 };
    const rows = employeeJobPay(db, emp, '2026-03-01', '2026-03-07', '2026-03-20');
    expect(rows.map((r) => r.number).sort()).toEqual(['JOB-NIGHT', 'JOB-X']); expect(rows.reduce((t, r) => t + r.rate, 0)).toBe(1600);   // two job orders at the rate each
  });
});

describe('pay week: paid Saturday night, work after the cutoff counts next week; bonus final at the signed handover', () => {
  const SAT = '2026-03-07', SUN = '2026-03-08', NEXT_SAT = '2026-03-14';
  it('counts Saturday work from the cutoff (9 PM) in the next pay week', async () => {
    const { payDateOf } = await import('./payrollweek');
    expect(payDateOf(`${SAT}T20:59`)).toBe(SAT); expect(payDateOf(`${SAT}T21:00`)).toBe(SUN); expect(payDateOf(`${SAT}T23:30`)).toBe(SUN);
    expect(payDateOf(`${SUN}T09:00`)).toBe(SUN); expect(payDateOf('2026-03-06T23:00')).toBe('2026-03-06');             // Friday night is still Friday
    expect(payDateOf(`${SAT}T20:00`, '19:00')).toBe(SUN);                                                                   // another cutoff
  });
  it('pays a Saturday 11 PM job order in the NEXT week, and a Saturday afternoon job in this week', () => {
    const { db, a, att } = world(); const emp = { ...a, pay_basis: 'per_job' as const, job_rate: 800 };
    const mk = (id: string, start: string, end: string) => { db.jobs.push({ ...clone(db.jobs.find((j) => j.id === 'jx')!), id, number: id.toUpperCase(), start_at: start, end_at: end } as never); db.workflows.push({ id: 'w' + id, job_id: id, panels: [], arr_crew_present: [a.id], arr_crew_absent: [] } as never); };
    mk('jday', `${SAT}T09:00`, `${SAT}T15:00`); mk('jnight', `${SAT}T23:00`, `${SUN}T03:00`);
    db.attendance.push(att(a.id, SAT, { job_id: undefined, clock_in: `${SAT}T09:00`, clock_out: `${SUN}T03:00` }) as never);
    const week1 = employeeJobPay(db, emp, '2026-03-01', SAT, '2026-03-20'); const week2 = employeeJobPay(db, emp, SUN, NEXT_SAT, '2026-03-20');
    expect(week1.map((r) => r.number).sort()).toEqual(['JDAY', 'JOB-X']); expect(week2.map((r) => r.number)).toEqual(['JNIGHT']);
    expect(week2[0]).toMatchObject({ rate: 800, date: SUN });                      // listed on Sunday, the first day of the week it counts in
  });
  it('moves a bonus to the next pay week when the client signs the handover after payday', () => {
    const { db, a, att } = world(); const emp = { ...a, pay_basis: 'per_job' as const, job_rate: 800 };
    db.jobs.push({ ...clone(db.jobs.find((j) => j.id === 'jx')!), id: 'jsat', number: 'JOB-SAT', start_at: `${SAT}T08:00`, end_at: `${SAT}T14:00` } as never);
    db.workflows.push({ id: 'wsat', job_id: 'jsat', panels: [{ id: 'r', area: '1st Floor', side: 'Front', external: 120, internal: 0 }], package_panels: 30, arr_crew_present: [a.id], arr_crew_absent: [], rep_client_at: `${SUN}T10:00` } as never);   // signed Sunday morning
    db.attendance.push(att(a.id, SAT, { job_id: undefined, clock_in: `${SAT}T08:00`, clock_out: `${SAT}T14:00` }) as never);
    const w1 = employeeJobPay(db, emp, '2026-03-01', SAT, '2026-03-20').find((r) => r.job_id === 'jsat')!;
    expect(w1).toMatchObject({ rate: 800, panel_bonus: 0, final: true });          // the rate is paid this Saturday, the bonus is not yet
    const w2 = employeeJobPay(db, emp, SUN, NEXT_SAT, '2026-03-20').find((r) => r.job_id === 'jsat')!;
    expect(w2).toMatchObject({ rate: 0, panel_bonus: 420, date: SUN });            // paid next Saturday, listed on the day it was signed
  });
  it('does not pay a bonus before the client signs the handover', () => {
    const { db, a } = world({ finished: false }); const emp = { ...a, pay_basis: 'per_job' as const, job_rate: 800 };
    expect(employeeJobPay(db, emp, '2026-03-01', '2026-03-07', '2026-03-20')[0]).toMatchObject({ rate: 800, panel_bonus: 0, final: false });
    const fin = world(); fin.db.workflows.find((w) => w.id === 'wx')!.finish_at = '2026-03-03T15:00'; (fin.db.workflows.find((w) => w.id === 'wx') as { rep_client_at?: string }).rep_client_at = undefined;
    expect(employeeJobPay(fin.db, { ...fin.a, pay_basis: 'per_job' as const, job_rate: 800 }, '2026-03-01', '2026-03-07', '2026-03-20')[0].panel_bonus).toBe(0);   // work finished is not enough
  });
});
