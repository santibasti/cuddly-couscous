import { describe, expect, it } from 'vitest';
import { buildPayrollLines, computePayrollLine } from './business';
import { employeeJobPay, jobBonus, jobsAttended, panelBonusPerCrew } from './jobpay';
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
