// The weekly payroll table: for each person, what they earned each day of the week (their rate for the day or job order) and the bonuses that came with it.
import { addDays, dow, eachDay, round2, sum, today } from './util';
import type { DB, Employee, PayrollLine, PayrollPeriod } from './types';

export interface WeekCell { /** pay for the work that day: the job-order rate or the daily rate */ base: number; /** panel + Outside Metro Manila + Commercial bonuses of that day's job orders */ bonus: number; jobs: string[] }
export interface WeekRow {
  emp: Employee; rate: number; unit: 'job' | 'day' | 'month';
  days: Record<string, WeekCell>;
  panel: number; outside: number; commercial: number;
  /** everything else in the total: holiday / rest-day / overtime pay, allowances, a monthly salary share, deductions for lateness… */
  other: number; total: number;
}

/** The payroll week a date is in: Sunday to Saturday (the crew also work on Sundays). */
export const weekOf = (date: string) => { const start = addDays(date, -dow(date)); return { start, end: addDays(start, 6) }; };

export function weeklyGrid(db: DB, per: Pick<PayrollPeriod, 'start' | 'end'>, lines: PayrollLine[], asOf: string = today()): { days: string[]; rows: WeekRow[] } {
  const days = eachDay(per.start, per.end);
  const rows = lines.map((l) => {
    const emp = db.employees.find((e) => e.id === l.employee_id)!;
    const cells: Record<string, WeekCell> = Object.fromEntries(days.map((d) => [d, { base: 0, bonus: 0, jobs: [] as string[] }]));
    for (const r of l.job_pay ?? []) { const c = cells[r.date]; if (!c) continue; c.base = round2(c.base + r.rate); c.bonus = round2(c.bonus + r.panel_bonus + r.outside_bonus + r.commercial_bonus); c.jobs.push(r.number); }
    if (emp?.pay_basis === 'daily') {
      for (const a of db.attendance) {
        if (a.employee_id !== emp.id || a.deleted_at || a.approval !== 'Approved' || !a.clock_in || a.kind === 'Leave' || (a.date === asOf && !a.clock_out)) continue;
        const c = cells[a.date]; if (c && !c.base) c.base = emp.daily_rate;
      }
    }
    const panel = sum(l.job_pay ?? [], (r) => r.panel_bonus), outside = sum(l.job_pay ?? [], (r) => r.outside_bonus), commercial = sum(l.job_pay ?? [], (r) => r.commercial_bonus);
    const shown = sum(Object.values(cells), (c) => c.base) + panel + outside + commercial;
    const rate = emp?.pay_basis === 'per_job' ? emp.job_rate ?? 0 : emp?.pay_basis === 'daily' ? emp.daily_rate : emp?.monthly_salary ?? 0;
    return { emp, rate, unit: (emp?.pay_basis === 'per_job' ? 'job' : emp?.pay_basis === 'daily' ? 'day' : 'month') as WeekRow['unit'], days: cells, panel: round2(panel), outside: round2(outside), commercial: round2(commercial), other: round2(l.gross - shown), total: l.gross };
  }).filter((r) => r.emp);
  return { days, rows };
}
