// Happening Today, "This week": what happened each day of a Monday–Sunday week and how each team and each person performed.
// Everything is computed from jobs, site check-ins, attendance and client ratings already in the system.
import type { DB, Employee, Job, JobWorkflow } from './types';
import { finalContract, isDone } from './business';
import { addDays, eachDay, round2, weekStart } from './util';

const live = <T extends { deleted_at?: string | null }>(a: T[] | undefined) => (a ?? []).filter((x) => !x.deleted_at);
const wall = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16));
const mins = (a?: string, b?: string) => (a && b ? Math.max(0, Math.round((wall(b) - wall(a)) / 60000)) : 0);
const GRACE_MIN = 15;

export interface DayStat { date: string; jobs: number; done: number; billing: number; present: number; absent: number; late: number }
export interface TeamStat {
  leaderId: string; leader: string; crew: string[]; jobs: number; done: number; onTime: number; arrived: number; avgSiteMin: number;
  present: number; marked: number; rating: number | null; ratings: number; billing: number; backJobs: number; score: number | null;
}
export interface PersonStat { id: string; name: string; position: string; jobs: number; daysPresent: number; absences: number; lateDays: number; lateMin: number; rating: number | null; ratings: number }
export interface WeekStats { from: string; to: string; days: DayStat[]; teams: TeamStat[]; people: PersonStat[]; totals: { jobs: number; done: number; billing: number; onTimePct: number | null; attendancePct: number | null; rating: number | null } }

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

/** A job's team: the leader plus the crew. */
const teamOf = (j: Job) => [...new Set([...(j.leader_id ? [j.leader_id] : []), ...j.crew_ids])];

/** Weighted 0–100 score from what is known: completion 30, on-time arrival 30, attendance 20, client rating 20. Missing parts are left out and the weights re-balance. */
export function teamScore(p: { done: number; jobs: number; onTime: number; arrived: number; present: number; marked: number; rating: number | null }): number | null {
  const parts: [number, number][] = [];
  if (p.jobs) parts.push([30, p.done / p.jobs]);
  if (p.arrived) parts.push([30, p.onTime / p.arrived]);
  if (p.marked) parts.push([20, p.present / p.marked]);
  if (p.rating !== null) parts.push([20, Math.min(1, p.rating / 5)]);
  const w = parts.reduce((a, [x]) => a + x, 0);
  return w ? Math.round((parts.reduce((a, [x, v]) => a + x * v, 0) / w) * 100) : null;
}

export function weekStats(db: DB, anchor: string): WeekStats {
  const from = weekStart(anchor); const to = addDays(from, 6); const dates = eachDay(from, to);
  const jobs = live(db.jobs).filter((j) => !['Cancelled', 'Rescheduled'].includes(j.status) && j.start_at.slice(0, 10) >= from && j.start_at.slice(0, 10) <= to);
  const wf = (j: Job): JobWorkflow | undefined => live(db.workflows).find((w) => w.job_id === j.id);
  const att = live(db.attendance).filter((a) => a.date >= from && a.date <= to);
  const emp = (id: string): Employee | undefined => db.employees.find((e) => e.id === id);
  const jobDone = (j: Job) => isDone(j.status) || !!wf(j)?.leave_at || !!wf(j)?.finish_at;
  const onTime = (j: Job) => { const w = wf(j); return !!w?.arr_at && mins(j.start_at, w.arr_at) <= GRACE_MIN; };

  const days: DayStat[] = dates.map((d) => {
    const js = jobs.filter((j) => j.start_at.startsWith(d)); const rec = att.filter((a) => a.date === d);
    return { date: d, jobs: js.length, done: js.filter(jobDone).length, billing: round2(js.reduce((a, j) => a + finalContract(db, j).payableTotal, 0)),
      present: rec.filter((a) => a.kind === 'Present' && a.clock_in).length, absent: rec.filter((a) => a.kind === 'Absent').length, late: rec.filter((a) => a.late_min > 0).length };
  });

  const byLeader = new Map<string, Job[]>();
  for (const j of jobs) { const k = j.leader_id ?? ''; if (!k) continue; byLeader.set(k, [...(byLeader.get(k) ?? []), j]); }
  const teams: TeamStat[] = [...byLeader.entries()].map(([lid, js]) => {
    const arrivedJobs = js.filter((j) => wf(j)?.arr_at); const stay = js.map((j) => { const w = wf(j); return w?.arr_at ? mins(w.arr_at, w.leave_at ?? w.finish_at) : 0; }).filter((m) => m > 0);
    let present = 0, marked = 0;
    for (const j of js) { const w = wf(j); if (w?.arr_at) { present += w.arr_crew_present?.length ?? 0; marked += (w.arr_crew_present?.length ?? 0) + (w.arr_crew_absent?.length ?? 0); } }
    const rs = js.map((j) => j.client_rating).filter((x): x is number => typeof x === 'number' && x > 0);
    const backJobs = live(db.back_jobs).filter((b) => b.origin_leader_id === lid && js.some((j) => j.id === b.origin_job_id)).length;
    const base = { done: js.filter(jobDone).length, jobs: js.length, onTime: js.filter(onTime).length, arrived: arrivedJobs.length, present, marked, rating: avg(rs) };
    return { leaderId: lid, leader: emp(lid)?.full_name ?? '—', crew: [...new Set(js.flatMap((j) => j.crew_ids))].map((id) => emp(id)?.full_name ?? id),
      jobs: js.length, done: base.done, onTime: base.onTime, arrived: base.arrived, avgSiteMin: Math.round(avg(stay) ?? 0), present, marked, rating: base.rating, ratings: rs.length,
      billing: round2(js.reduce((a, j) => a + finalContract(db, j).payableTotal, 0)), backJobs, score: teamScore(base) };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.jobs - a.jobs);

  const ids = new Set<string>([...jobs.flatMap(teamOf), ...att.map((a) => a.employee_id)]);
  const people: PersonStat[] = [...ids].map((id) => {
    const e = emp(id); const mine = att.filter((a) => a.employee_id === id); const js = jobs.filter((j) => teamOf(j).includes(id));
    const rs = js.map((j) => j.client_rating).filter((x): x is number => typeof x === 'number' && x > 0);
    return { id, name: e?.full_name ?? id, position: e?.position ?? '', jobs: js.length, daysPresent: mine.filter((a) => a.kind === 'Present' && a.clock_in).length, absences: mine.filter((a) => a.kind === 'Absent').length,
      lateDays: mine.filter((a) => a.late_min > 0).length, lateMin: mine.reduce((s, a) => s + (a.late_min || 0), 0), rating: avg(rs), ratings: rs.length };
  }).filter((p) => p.jobs || p.daysPresent || p.absences).sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name));

  const arrived = teams.reduce((a, t) => a + t.arrived, 0), onT = teams.reduce((a, t) => a + t.onTime, 0), pres = teams.reduce((a, t) => a + t.present, 0), mk = teams.reduce((a, t) => a + t.marked, 0);
  const allR = jobs.map((j) => j.client_rating).filter((x): x is number => typeof x === 'number' && x > 0);
  return { from, to, days, teams, people, totals: { jobs: jobs.length, done: jobs.filter(jobDone).length, billing: round2(days.reduce((a, d) => a + d.billing, 0)), onTimePct: pct(onT, arrived), attendancePct: pct(pres, mk), rating: avg(allR) } };
}
