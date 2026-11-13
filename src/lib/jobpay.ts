// Pay per job order. An employee on "per job order" pay earns a set amount for every job order they attended (late or not). Every assigned crew
// member also earns the job's bonuses: the panel bonus (from the additional billable glass panels and the crew size), and the Owner's
// "Outside Metro Manila" and "Commercial Project" bonuses when switched on for the job. Pure functions over the data, so payroll, the Job Order
// screen and the employee record all show the same numbers.
import { packagePanels, panelBreakdown } from './business';
import type { DB, Employee, Job, JobPayRow, Settings } from './types';

export const DEFAULT_JOB_PAY = { panel_bonus: 140, panel_step: 10, outside_mm_bonus: 0, commercial_bonus: 0 };
export const jobPaySettings = (s: Pick<Settings, 'job_pay'>) => ({ ...DEFAULT_JOB_PAY, ...(s.job_pay ?? {}) });

/** Bonus per crew member = FLOOR(additional panels ÷ (crew × step)) × bonus. Only full thresholds count: no partial bonus. */
export function panelBonusPerCrew(additionalPanels: number, crewCount: number, step = DEFAULT_JOB_PAY.panel_step, bonus = DEFAULT_JOB_PAY.panel_bonus): number {
  if (!(crewCount > 0) || !(step > 0) || !(additionalPanels > 0)) return 0;
  return Math.floor(additionalPanels / (crewCount * step)) * bonus;
}

/** Everyone assigned to the job: the leader first, then the crew, each once. */
export const jobCrewIds = (j: Pick<Job, 'leader_id' | 'crew_ids'>): string[] => [...new Set([...(j.leader_id ? [j.leader_id] : []), ...(j.crew_ids ?? [])])];

export interface JobBonus {
  crew: number; additional_panels: number; step: number;
  panel_each: number; outside_each: number; commercial_each: number; each: number; total: number;
  /** the panel count is final once the work is finished (so payroll pays the bonus only then) */
  final: boolean; ids: string[];
}
export function jobBonus(db: DB, job: Job): JobBonus {
  const cfg = jobPaySettings(db.settings);
  const wf = (db.workflows ?? []).find((w) => w.job_id === job.id && !w.deleted_at);
  const q = (db.quotations ?? []).find((x) => x.id === (wf?.conf_quotation_id ?? job.quotation_id));
  const additional = wf ? panelBreakdown(db, q, wf.panels, packagePanels(db, job, wf)).additional : 0;
  const ids = jobCrewIds(job);
  const panel = panelBonusPerCrew(additional, ids.length, cfg.panel_step, cfg.panel_bonus);
  const outside = job.pay_outside_mm ? cfg.outside_mm_bonus : 0; const commercial = job.pay_commercial ? cfg.commercial_bonus : 0;
  const each = panel + outside + commercial;
  return { crew: ids.length, additional_panels: additional, step: cfg.panel_step, panel_each: panel, outside_each: outside, commercial_each: commercial, each, total: each * ids.length, final: !!wf?.finish_at || job.status === 'Completed', ids };
}

/** Why this site is suggested for the Outside Metro Manila bonus, or why not (the Owner decides). */
export function outsideMetroHint(db: DB, job: Job): string | undefined {
  const site = db.sites.find((s) => s.id === job.site_id); const where = site?.province || db.clients.find((c) => c.id === job.client_id)?.province;
  return where ? (where === 'Metro Manila' ? `Site is in Metro Manila` : `Site is in ${where} (outside Metro Manila)`) : undefined;
}
export const isCommercialClient = (db: DB, job: Job) => db.clients.find((c) => c.id === job.client_id)?.type === 'Commercial';

/**
 * The job orders an employee attended in a date range. Attended = assigned to the job, not marked absent on it, and has approved attendance
 * with a clock-in on a day of the job whose attendance is for this job (or not tied to any job) or the Team Leader checked them in on arrival.
 * Late arrival does not matter.
 */
export function jobsAttended(db: DB, empId: string, start: string, end: string): Job[] {
  const att = db.attendance.filter((a) => a.employee_id === empId && !a.deleted_at && a.approval === 'Approved' && !!a.clock_in && a.date >= start && a.date <= end);
  if (!att.length) return [];
  return (db.jobs ?? []).filter((j) => {
    if (j.deleted_at || ['Cancelled', 'Rescheduled', 'Pending'].includes(j.status) || !jobCrewIds(j).includes(empId)) return false;
    const wf = (db.workflows ?? []).find((w) => w.job_id === j.id && !w.deleted_at);
    if (wf?.arr_crew_absent?.some((a) => a.id === empId)) return false;
    const from = j.start_at.slice(0, 10), to = j.end_at.slice(0, 10) >= from ? j.end_at.slice(0, 10) : from;
    return att.some((a) => a.date >= from && a.date <= to && (!a.job_id || a.job_id === j.id || !!wf?.arr_crew_present?.includes(empId)));
  }).sort((a, b) => a.start_at.localeCompare(b.start_at));
}

/** Job pay and bonuses for one employee over a date range: one row per job order attended. */
export function employeeJobPay(db: DB, emp: Employee, start: string, end: string): JobPayRow[] {
  return jobsAttended(db, emp.id, start, end).map((j) => {
    const b = jobBonus(db, j);
    const rate = emp.pay_basis === 'per_job' ? emp.job_rate ?? 0 : 0;
    const payBonus = b.final;       // bonuses are paid once the job's panel count is final
    const row = { panel_bonus: payBonus ? b.panel_each : 0, outside_bonus: payBonus ? b.outside_each : 0, commercial_bonus: payBonus ? b.commercial_each : 0 };
    return { job_id: j.id, number: j.number, date: j.start_at.slice(0, 10), client: (db.clients ?? []).find((c) => c.id === j.client_id)?.name, rate, ...row, total: Math.round((rate + row.panel_bonus + row.outside_bonus + row.commercial_bonus) * 100) / 100, final: b.final };
  });
}
