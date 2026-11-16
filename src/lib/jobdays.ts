// A job that runs over several days is tracked day by day: each day has its own clock-in / clock-out and its own state,
// instead of every day showing the status of the whole job (which only tells where the job as a whole is).
import { addDays, today } from './util';
import type { DB, Job } from './types';

export const DONE_JOB = ['Work Completed', 'Leaving Site', 'Arrived at HQ', 'Closed', 'Completed'];
/** The calendar days of a job, first to last (one entry for a one-day job). */
export function jobDates(j: Pick<Job, 'start_at' | 'end_at'>): string[] {
  const a = j.start_at.slice(0, 10), b = j.end_at.slice(0, 10); const out = [a];
  for (let d = addDays(a, 1); d <= b && out.length < 60; d = addDays(d, 1)) out.push(d);
  return out;
}
export const isMultiDay = (j: Pick<Job, 'start_at' | 'end_at'>) => j.end_at.slice(0, 10) > j.start_at.slice(0, 10);

export type DayKind = 'pending' | 'confirmed' | 'field' | 'done' | 'off';
export interface DayInfo {
  n: number; of: number; date: string; first: boolean; last: boolean; kind: DayKind; label: string;
  /** crew assigned / clocked in that day / still clocked in / clocked out */
  crew: number; clockedIn: number; open: number; clockedOut: number;
}
/** The state of one day of a multi-day job (undefined for a one-day job): driven by that day's attendance and by today's date, not by the job's overall status. */
export function dayInfo(db: Pick<DB, 'attendance' | 'workflows'>, job: Job, date: string, now: string = today()): DayInfo | undefined {
  if (!isMultiDay(job)) return undefined;
  const dates = jobDates(job); const n = dates.indexOf(date) + 1; if (n < 1) return undefined;
  const ids = [...new Set([...(job.leader_id ? [job.leader_id] : []), ...(job.crew_ids ?? [])])];
  const wf = (db.workflows ?? []).find((w) => w.job_id === job.id && !w.deleted_at); const absent = new Set((wf?.arr_crew_absent ?? []).map((a) => a.id));
  const crew = ids.filter((id) => !absent.has(id));
  const att = (db.attendance ?? []).filter((a) => !a.deleted_at && a.date === date && crew.includes(a.employee_id) && a.kind === 'Present' && !!a.clock_in);
  const clockedIn = att.length, open = att.filter((a) => !a.clock_out).length, clockedOut = clockedIn - open;
  const base = { n, of: dates.length, date, first: n === 1, last: n === dates.length, crew: crew.length, clockedIn, open, clockedOut };
  if (['Cancelled', 'Rescheduled'].includes(job.status)) return { ...base, kind: 'off', label: job.status };
  const upcoming: DayKind = job.status === 'Pending' ? 'pending' : 'confirmed';
  if (date > now) return { ...base, kind: upcoming, label: 'Scheduled' };
  if (date === now) {
    if (open > 0) return { ...base, kind: 'field', label: `Working · ${open} on site` };
    if (clockedIn > 0) return { ...base, kind: 'done', label: `Day done · ${clockedOut} clocked out` };
    return { ...base, kind: upcoming, label: DONE_JOB.includes(job.status) ? 'Done' : 'Not started today' };
  }
  if (clockedIn > 0) return { ...base, kind: 'done', label: 'Day done' };
  return DONE_JOB.includes(job.status) ? { ...base, kind: 'done', label: 'Done' } : { ...base, kind: 'pending', label: 'No clock-in' };
}
