import { describe, expect, it } from 'vitest';
import { teamScore, weekStats } from './weekly';
import type { DB } from './types';

describe('team score', () => {
  it('weights completion, on-time, attendance and rating, and re-balances when a part is missing', () => {
    expect(teamScore({ done: 4, jobs: 4, onTime: 4, arrived: 4, present: 8, marked: 8, rating: 5 })).toBe(100);
    expect(teamScore({ done: 2, jobs: 4, onTime: 0, arrived: 2, present: 4, marked: 8, rating: null })).toBe(Math.round(((30 * 0.5 + 30 * 0 + 20 * 0.5) / 80) * 100));
    expect(teamScore({ done: 0, jobs: 0, onTime: 0, arrived: 0, present: 0, marked: 0, rating: null })).toBeNull();
  });
});

const job = (id: string, leader: string, start: string, over: Record<string, unknown> = {}) => ({ id, leader_id: leader, crew_ids: ['e2'], start_at: start, end_at: start, status: 'Completed', service_codes: [], contract_amount: 1000, quotation_id: undefined, ...over });
const db = {
  employees: [{ id: 'e1', full_name: 'Leader One', position: 'Team Leader' }, { id: 'e2', full_name: 'Crew Two', position: 'Technician' }],
  jobs: [job('j1', 'e1', '2026-10-12T08:00', { client_rating: 5 }), job('j2', 'e1', '2026-10-13T08:00', { client_rating: 3 }), job('j3', 'e1', '2026-10-21T08:00'), job('j4', 'e1', '2026-10-14T08:00', { status: 'Cancelled' })],
  workflows: [
    { id: 'w1', job_id: 'j1', arr_at: '2026-10-12T07:58', leave_at: '2026-10-12T12:58', arr_crew_present: ['e1', 'e2'], arr_crew_absent: [] },
    { id: 'w2', job_id: 'j2', arr_at: '2026-10-13T08:40', finish_at: '2026-10-13T11:40', arr_crew_present: ['e1'], arr_crew_absent: [{ id: 'e2', reason: 'sick' }] },
  ],
  attendance: [
    { id: 'a1', employee_id: 'e1', date: '2026-10-12', kind: 'Present', clock_in: '2026-10-12T07:50', late_min: 0 }, { id: 'a2', employee_id: 'e2', date: '2026-10-13', kind: 'Absent', late_min: 0 },
    { id: 'a3', employee_id: 'e1', date: '2026-10-13', kind: 'Present', clock_in: '2026-10-13T08:30', late_min: 30 },
  ],
  back_jobs: [], quotations: [], variations: [], discount_requests: [],
} as unknown as DB;

describe('week stats', () => {
  it('counts jobs, completion, on-time arrival, attendance and ratings for the Monday–Sunday week', () => {
    const w = weekStats(db, '2026-10-15');
    expect(w.from).toBe('2026-10-12'); expect(w.to).toBe('2026-10-18');
    expect(w.totals.jobs).toBe(2); expect(w.totals.done).toBe(2);                         // j3 is next week, j4 is cancelled
    expect(w.days[0]).toMatchObject({ date: '2026-10-12', jobs: 1, done: 1, present: 1 }); expect(w.days[1]).toMatchObject({ jobs: 1, absent: 1, late: 1 });
    const t = w.teams[0]; expect(t.leader).toBe('Leader One'); expect(t).toMatchObject({ jobs: 2, done: 2, arrived: 2, onTime: 1, present: 3, marked: 4 });
    expect(t.rating).toBe(4); expect(t.avgSiteMin).toBe(Math.round((300 + 180) / 2));
    expect(w.totals.onTimePct).toBe(50); expect(w.totals.attendancePct).toBe(75);
    const p2 = w.people.find((x) => x.id === 'e2')!; expect(p2).toMatchObject({ jobs: 2, absences: 1 });
    const p1 = w.people.find((x) => x.id === 'e1')!; expect(p1).toMatchObject({ daysPresent: 2, lateDays: 1, lateMin: 30 });
  });
});
