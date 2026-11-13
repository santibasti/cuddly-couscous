import { describe, expect, it } from 'vitest';
import { crewEarnings, payWeekNow } from './crewearnings';
import { seedDB } from './seed';
import { clone } from './util';

/** One job on Tue 2026-03-03 (Sunday 03-01 to Saturday 03-07 is the pay week), 90 additional panels, 3 crew → ₱420 bonus each once signed. */
function world(signed: string | undefined) {
  const db = clone(seedDB());
  const [a, b, c] = db.employees.filter((e) => !e.deleted_at && e.status !== 'inactive').slice(0, 3);
  const resident = db.clients.find((x) => x.type === 'Residential')!;
  db.jobs = [...db.jobs, { ...clone(db.jobs[0]), client_id: resident.id, id: 'jx', number: 'JOB-X', leader_id: a.id, crew_ids: [b.id, c.id], status: 'Completed', start_at: '2026-03-03T08:00', end_at: '2026-03-03T17:00', pay_outside_mm: false, pay_commercial: false, deleted_at: undefined } as never];
  db.workflows = [...db.workflows, { id: 'wx', job_id: 'jx', panels: [{ id: 'r1', area: '1st', side: 'Front', external: 120, internal: 0 }], package_panels: 30, arr_crew_present: [a.id, b.id, c.id], arr_crew_absent: [], rep_client_at: signed } as never];
  db.attendance = [a, b, c].map((e) => ({ id: e.id + 'x', employee_id: e.id, date: '2026-03-03', kind: 'Present', clock_in: '2026-03-03T08:00', clock_out: '2026-03-03T16:00', worked_hours: 8, late_min: 0, undertime_min: 0, ot_min: 0, approval: 'Approved', job_id: 'jx', field_work: true })) as never;
  return { db, a: { ...a, pay_basis: 'per_job' as const, job_rate: 800 } };
}

describe('crew earnings this pay week', () => {
  it('shows the rate on the day worked and the bonus as an estimate until the handover is signed', () => {
    const { db, a } = world(undefined); const w = crewEarnings(db, a, '2026-03-04T10:00')!;
    expect(w.start).toBe('2026-03-01'); expect(w.end).toBe('2026-03-07'); expect(w.days).toHaveLength(7);
    expect(w.days[2]).toMatchObject({ date: '2026-03-03', rate: 800, bonus: 420, total: 1220, estimate: true });
    expect(w).toMatchObject({ rate: 800, bonus: 420, total: 1220, estimate: true });
    expect(w.notes.join(' ')).toContain('estimate');
  });
  it('makes the bonus final when the client signs', () => {
    const { db, a } = world('2026-03-03T16:30'); const w = crewEarnings(db, a, '2026-03-04T10:00')!;
    expect(w).toMatchObject({ rate: 800, bonus: 420, total: 1220, estimate: false });
  });
  it('after Saturday 9 PM it is already the next week, which starts empty', () => {
    const { db, a } = world('2026-03-03T16:30');
    expect(payWeekNow(db, '2026-03-07T20:00').start).toBe('2026-03-01'); expect(payWeekNow(db, '2026-03-07T21:00').start).toBe('2026-03-08');
    expect(crewEarnings(db, a, '2026-03-07T21:30')).toMatchObject({ start: '2026-03-08', rate: 0, bonus: 0, total: 0 });
  });
  it('adds a bonus signed after payday to the new week, with a note', () => {
    const { db, a } = world('2026-03-08T10:00'); const w = crewEarnings(db, a, '2026-03-09T09:00')!;
    expect(w).toMatchObject({ start: '2026-03-08', rate: 0, bonus: 420, total: 420 }); expect(w.days[0].bonus).toBe(420); expect(w.notes.join(' ')).toContain('signed');
  });
  it('has nothing for people on a monthly salary', () => {
    const { db, a } = world(undefined); expect(crewEarnings(db, { ...a, pay_basis: 'monthly' }, '2026-03-04T10:00')).toBeNull();
  });
});
