import { describe, expect, it } from 'vitest';
import { dayInfo, isMultiDay, jobDates } from './jobdays';
import type { DB, Job } from './types';

const job = { id: 'j1', start_at: '2026-11-16T09:00', end_at: '2026-11-18T17:00', status: 'On Site', leader_id: 'e1', crew_ids: ['e2', 'e3'] } as unknown as Job;
const att = (employee_id: string, date: string, out?: string) => ({ id: `${employee_id}${date}`, employee_id, date, kind: 'Present', clock_in: `${date}T09:00`, clock_out: out ? `${date}T${out}` : undefined });
const db = (attendance: unknown[], workflows: unknown[] = []) => ({ attendance, workflows }) as unknown as Pick<DB, 'attendance' | 'workflows'>;

describe('multi-day jobs are tracked day by day', () => {
  it('lists the days and tells one-day jobs apart', () => {
    expect(jobDates(job)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']); expect(isMultiDay(job)).toBe(true);
    const one = { ...job, end_at: '2026-11-16T17:00' } as Job; expect(isMultiDay(one)).toBe(false); expect(dayInfo(db([]), one, '2026-11-16')).toBeUndefined();
  });
  it('a day is working while crew are clocked in, done after they clock out, and later days stay scheduled whatever the job status says', () => {
    const d = db([att('e1', '2026-11-16'), att('e2', '2026-11-16'), att('e3', '2026-11-16', '17:00')]);
    expect(dayInfo(d, job, '2026-11-16', '2026-11-16')).toMatchObject({ n: 1, of: 3, kind: 'field', clockedIn: 3, open: 2, clockedOut: 1, label: 'Working · 2 on site' });
    expect(dayInfo(d, job, '2026-11-17', '2026-11-16')).toMatchObject({ n: 2, kind: 'confirmed', label: 'Scheduled' });              // the job is "On Site", day 2 is not started
    expect(dayInfo(d, job, '2026-11-18', '2026-11-16')).toMatchObject({ n: 3, kind: 'confirmed', label: 'Scheduled' });
    const out = db([att('e1', '2026-11-16', '17:00'), att('e2', '2026-11-16', '17:00'), att('e3', '2026-11-16', '17:00')]);
    expect(dayInfo(out, job, '2026-11-16', '2026-11-16')).toMatchObject({ kind: 'done', label: 'Day done · 3 clocked out' });
    expect(dayInfo(out, job, '2026-11-17', '2026-11-17')).toMatchObject({ kind: 'confirmed', label: 'Not started today' });             // day 2 morning: nobody clocked in yet
  });
  it('a past day is done when someone clocked in, otherwise it shows that nobody did', () => {
    const d = db([att('e1', '2026-11-16', '17:00')]);
    expect(dayInfo(d, job, '2026-11-16', '2026-11-18')).toMatchObject({ kind: 'done', label: 'Day done' });
    expect(dayInfo(d, job, '2026-11-17', '2026-11-18')).toMatchObject({ kind: 'pending', label: 'No clock-in' });
    expect(dayInfo(d, { ...job, status: 'Work Completed' } as Job, '2026-11-17', '2026-11-18')).toMatchObject({ kind: 'done', label: 'Done' });
    expect(dayInfo(d, { ...job, status: 'Cancelled' } as Job, '2026-11-17', '2026-11-16')).toMatchObject({ kind: 'off' });
  });
  it('crew marked absent on the job do not count', () => {
    const d = db([att('e2', '2026-11-16')], [{ job_id: 'j1', arr_crew_absent: [{ id: 'e3', reason: 'sick' }] }]);
    expect(dayInfo(d, job, '2026-11-16', '2026-11-16')).toMatchObject({ crew: 2, clockedIn: 1, open: 1 });
  });
});
