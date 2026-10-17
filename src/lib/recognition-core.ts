// Recognition for the crew: badges (perfect attendance, on-time streak, most improved, documentation star), the crew-versus-crew score and the
// kind, specific tips on how to move a rating. Pure functions over the data; the stored copy (employee.recog) is written by Admin / HR sessions.
import type { DB, Employee } from './types';
import { scorecard, isDone } from './business';
import { addDays, dow, eachDay, monthStart, round2, today } from './util';

export interface Recog { month: string; prev?: number; delta?: number; streak: number; perfect: boolean; docs: number }
const live = <X extends { deleted_at?: string | null }>(a: X[]) => a.filter((x) => !x.deleted_at);

export function computeRecog(db: DB, emp: Employee, t: string = today()): Recog {
  const month = t.slice(0, 7); const prevMonth = monthStart(addDays(monthStart(t), -1)).slice(0, 7);
  const atts = live(db.attendance).filter((a) => a.employee_id === emp.id);
  const byDate = new Map(atts.map((a) => [a.date, a]));
  const hol = new Set(live(db.holidays).map((h) => h.date)); const grace = db.settings.grace_minutes;
  const hasApproved = (m: string) => atts.some((a) => a.date.startsWith(m) && a.clock_in && a.approval === 'Approved');
  const cur = hasApproved(month) ? scorecard(db, emp, month).score / 20 : undefined;
  const prev = hasApproved(prevMonth) ? scorecard(db, emp, prevMonth).score / 20 : undefined;
  const delta = cur !== undefined && prev !== undefined ? round2(cur - prev) : undefined;
  // a day counts when the person is not on rest day / holiday / paid leave; today is skipped until they have clocked in
  const verdict = (d: string): 'ok' | 'miss' | 'skip' => {
    if (dow(d) === emp.rest_day || hol.has(d) || (emp.hire_date && d < emp.hire_date)) return 'skip';
    const a = byDate.get(d);
    if (a?.kind === 'Leave' && a.paid_leave) return 'skip';
    if (!a?.clock_in) return d === t ? 'skip' : 'miss';
    return a.late_min > grace ? 'miss' : 'ok';
  };
  let streak = 0;
  for (let i = 0, d = t; i < 120; i++, d = addDays(d, -1)) { const v = verdict(d); if (v === 'miss') break; if (v === 'ok') streak++; }
  const days = eachDay(`${month}-01`, t).map(verdict).filter((v) => v !== 'skip');
  const perfect = days.length >= 3 && days.every((v) => v === 'ok');
  const docs = live(db.service_reports).filter((r) => r.signature && r.signed_at?.startsWith(month) && db.jobs.find((j) => j.id === r.job_id)?.leader_id === emp.id).length;
  return { month, prev: prev === undefined ? undefined : round2(prev), delta, streak, perfect, docs };
}

export interface Badge { key: 'perfect' | 'streak' | 'improved' | 'docs'; icon: string; label: string }
export function badgesOf(r?: Recog): Badge[] {
  if (!r) return [];
  const out: Badge[] = [];
  if (r.perfect) out.push({ key: 'perfect', icon: '🏅', label: 'Perfect attendance' });
  if (r.streak >= 5) out.push({ key: 'streak', icon: '🔥', label: `${r.streak}-day on-time streak` });
  if ((r.delta ?? 0) >= 0.1) out.push({ key: 'improved', icon: '📈', label: `Most improved +${(r.delta ?? 0).toFixed(1)}` });
  if (r.docs >= 3) out.push({ key: 'docs', icon: '📝', label: 'Documentation star' });
  return out;
}

export interface TeamRow { leader_id: string; leader_name: string; avatar?: string; jobs: number; happy: number; reports: number; backjobs: number; score: number }
/** 5 points per finished job, 5 per Very Satisfied client, 3 per signed service report, minus 10 per back job. */
export function teamBoardLocal(db: DB, month: string): TeamRow[] {
  const jobs = live(db.jobs).filter((j) => j.leader_id && isDone(j.status) && j.completed_at?.slice(0, 7) === month);
  const leaders = [...new Set(jobs.map((j) => j.leader_id!))];
  return leaders.map((id) => {
    const mine = jobs.filter((j) => j.leader_id === id); const e = db.employees.find((x) => x.id === id);
    const happy = mine.filter((j) => live(db.client_feedback).some((f) => f.job_id === j.id && f.rating === 3)).length;
    const reports = mine.filter((j) => live(db.service_reports).some((r) => r.job_id === j.id && r.signature)).length;
    const backjobs = live(db.back_jobs).filter((b) => b.origin_leader_id === id && b.created_at.slice(0, 7) === month).length;
    return { leader_id: id, leader_name: e?.full_name ?? '—', avatar: e?.avatar, jobs: mine.length, happy, reports, backjobs, score: Math.max(0, mine.length * 5 + happy * 5 + reports * 3 - backjobs * 10) };
  }).sort((a, b) => b.score - a.score || a.leader_name.localeCompare(b.leader_name));
}

/** "Being on time for your next 10 work days would lift it from 82% to about 87%." */
export function projection(valuePct: number, days = 10): string {
  const after = Math.round((valuePct * 22 + 100 * days) / (22 + days));
  return after > Math.round(valuePct) ? ` Doing this well for your next ${days} work days lifts it from ${Math.round(valuePct)}% to about ${after}%.` : '';
}
