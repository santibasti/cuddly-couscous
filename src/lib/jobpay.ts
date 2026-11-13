// Pay per job order. An employee on "per job order" pay earns a set amount for every job order they attended (late or not). Every crew member
// who is present (the crew size reduces automatically when someone is absent) also earns the job's bonuses: the panel bonus (from the additional billable glass panels and the crew size), and the Owner's
// "Outside Metro Manila" and "Commercial Project" bonuses when switched on for the job. Pure functions over the data, so payroll, the Job Order
// screen and the employee record all show the same numbers.
import { packagePanels, panelBreakdown } from './business';
import { today } from './util';
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
  /** crew who count for this job: assigned, minus anyone marked absent (so the crew size reduces automatically) */
  crew: number; absent: string[]; /** a commercial project: no automatic bonus, the Owner adds it by hand */ manual: boolean; additional_panels: number; step: number;
  panel_each: number; outside_each: number; commercial_each: number; each: number; total: number;
  /** the panel count is final once the work is finished (so payroll pays the bonus only then) */
  final: boolean; ids: string[];
}
/** Assigned crew who were absent on this job: marked absent at check-in, or absent / on leave in attendance on a day of the job. */
export function jobAbsentIds(db: DB, job: Job): string[] {
  const wf = (db.workflows ?? []).find((w) => w.job_id === job.id && !w.deleted_at);
  const from = job.start_at.slice(0, 10), to = job.end_at.slice(0, 10) >= job.start_at.slice(0, 10) ? job.end_at.slice(0, 10) : from;
  const marked = new Set((wf?.arr_crew_absent ?? []).map((a) => a.id));
  return jobCrewIds(job).filter((id) => marked.has(id) || (db.attendance ?? []).some((a) => a.employee_id === id && !a.deleted_at && a.date >= from && a.date <= to && ['Absent', 'Leave'].includes(a.kind) && !a.clock_in));
}
/** The crew who count for the job's bonus: assigned crew who are not absent. */
export function jobAttendees(db: DB, job: Job): string[] { const out = new Set(jobAbsentIds(db, job)); return jobCrewIds(job).filter((id) => !out.has(id)); }

export function jobBonus(db: DB, job: Job): JobBonus {
  const cfg = jobPaySettings(db.settings);
  const wf = (db.workflows ?? []).find((w) => w.job_id === job.id && !w.deleted_at);
  const q = (db.quotations ?? []).find((x) => x.id === (wf?.conf_quotation_id ?? job.quotation_id));
  const additional = wf ? panelBreakdown(db, q, wf.panels, packagePanels(db, job, wf)).additional : 0;
  const ids = jobAttendees(db, job);
  const manual = isCommercialClient(db, job);          // commercial projects: no automatic bonus, the Owner adds it by hand
  const panel = manual ? 0 : panelBonusPerCrew(additional, ids.length, cfg.panel_step, cfg.panel_bonus);
  const outside = job.pay_outside_mm ? cfg.outside_mm_bonus : 0;
  const commercial = job.pay_commercial_amount ?? (job.pay_commercial ? cfg.commercial_bonus : 0);   // the amount the Owner typed (an older on/off tick still uses the old fixed amount)
  const each = panel + outside + commercial;
  return { crew: ids.length, absent: jobAbsentIds(db, job), manual, additional_panels: additional, step: cfg.panel_step, panel_each: panel, outside_each: outside, commercial_each: commercial, each, total: each * ids.length, final: !!wf?.finish_at || job.status === 'Completed', ids };
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
export function jobsAttended(db: DB, empId: string, start: string, end: string, anyApproval = false, asOf: string = today()): Job[] {
  // today's attendance counts once it is completed (clocked out)
  const att = db.attendance.filter((a) => a.employee_id === empId && !a.deleted_at && (anyApproval ? a.approval !== 'Rejected' : a.approval === 'Approved') && !!a.clock_in && !(a.date === asOf && !a.clock_out) && a.date >= start && a.date <= end);
  if (!att.length) return [];
  return (db.jobs ?? []).filter((j) => {
    if (j.deleted_at || ['Cancelled', 'Rescheduled', 'Pending'].includes(j.status) || !jobCrewIds(j).includes(empId)) return false;
    const wf = (db.workflows ?? []).find((w) => w.job_id === j.id && !w.deleted_at);
    if (wf?.arr_crew_absent?.some((a) => a.id === empId)) return false;
    const from = j.start_at.slice(0, 10), to = j.end_at.slice(0, 10) >= from ? j.end_at.slice(0, 10) : from;
    // a shift can run past midnight (9 AM to 3 AM next day): the attendance covers every day from its clock-in to its clock-out
    return att.some((a) => a.date <= to && (a.clock_out ? a.clock_out.slice(0, 10) : a.date) >= from && (!a.job_id || a.job_id === j.id || !!wf?.arr_crew_present?.includes(empId)));
  }).sort((a, b) => a.start_at.localeCompare(b.start_at));
}

/** Job pay and bonuses for one employee over a date range: one row per job order attended. */
export function employeeJobPay(db: DB, emp: Employee, start: string, end: string, asOf?: string): JobPayRow[] {
  return jobsAttended(db, emp.id, start, end, false, asOf).map((j) => {
    const b = jobBonus(db, j);
    const rate = emp.pay_basis === 'per_job' ? emp.job_rate ?? 0 : 0;
    const payBonus = b.final;       // bonuses are paid once the job's panel count is final
    const row = { panel_bonus: payBonus ? b.panel_each : 0, outside_bonus: payBonus ? b.outside_each : 0, commercial_bonus: payBonus ? b.commercial_each : 0 };
    return { job_id: j.id, number: j.number, date: j.start_at.slice(0, 10), client: (db.clients ?? []).find((c) => c.id === j.client_id)?.name, rate, ...row, total: Math.round((rate + row.panel_bonus + row.outside_bonus + row.commercial_bonus) * 100) / 100, final: b.final };
  });
}
