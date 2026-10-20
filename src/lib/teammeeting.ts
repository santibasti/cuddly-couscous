// Team meeting report: what the whole crew can safely see — service quality, punctuality, safety, recognition and the work ahead.
// It deliberately leaves out money (revenue, margins, bills, pay). Everything is calculated from the company's own records.
import type { DB } from './types';
import { isDone, SAT_QUESTIONS } from './business';
import { computeRecog } from './recognition-core';
import { capacityDays } from './executive';
import { addDays, dow, monthStart, round2 } from './util';

export type MeetingPeriod = 'month' | 'last30' | 'lastmonth';
export interface TeamMeeting {
  period: { key: MeetingPeriod; from: string; to: string; label: string };
  jobsDone: number; clientsServed: number;
  rating: number | null; responses: number; fiveStar: number;
  categories: { key: string; text: string; icon: string; avg: number }[];
  punctuality: { pct: number | null; late: number; checkins: number };
  attendance: { pct: number | null };
  safety: { incidents: number; open: number; daysSinceSerious: number | null };
  redoJobs: number; damagedEquipment: number;
  praise: string[];
  recognition: { perfect: string[]; streaks: { name: string; days: number }[]; top: { name: string; rating: number }[] };
  ahead: { next7: number; next14: number; busiest: { date: string; jobs: number }[]; peakCrewPct: number | null };
  goals: { label: string; now: string; target: string; met: boolean | null }[];
  wins: string[]; focus: string[];
}

const live = <X extends { deleted_at?: string | null }>(a: X[]) => a.filter((x) => !x.deleted_at);
const OFF = new Set(['Cancelled', 'Rescheduled']);
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const first = (full: string) => full.replace(/^(Mr|Ms|Mrs)\.?\s+/i, '').split(' ')[0];

export function periodOf(key: MeetingPeriod, T: string): TeamMeeting['period'] {
  if (key === 'lastmonth') { const e = addDays(monthStart(T), -1); return { key, from: monthStart(e), to: e, label: new Date(`${e.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) }; }
  if (key === 'last30') return { key, from: addDays(T, -29), to: T, label: 'the last 30 days' };
  return { key, from: monthStart(T), to: T, label: `${new Date(`${T.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long' })} so far` };
}

export function buildTeamMeeting(db: DB, T: string, key: MeetingPeriod = 'month'): TeamMeeting {
  const p = periodOf(key, T); const { from, to } = p;
  const inP = (d: string) => d >= from && d <= to;
  const jobs = live(db.jobs).filter((j) => inP(j.start_at.slice(0, 10)) && !OFF.has(j.status));
  const done = jobs.filter((j) => isDone(j.status));
  const fb = live(db.client_feedback).filter((f) => inP((f.service_date || f.submitted_at).slice(0, 10)));
  const stars = fb.map((f) => { const v = SAT_QUESTIONS.map((q) => f[q.key] as number | undefined).filter((x): x is number => !!x); return v.length ? mean(v) : f.rating === 3 ? 5 : f.rating === 2 ? 4 : 1.5; });
  const categories = SAT_QUESTIONS.map((q) => { const v = fb.map((f) => f[q.key] as number | undefined).filter((x): x is number => !!x); return { key: q.key as string, text: q.text, icon: q.icon, avg: v.length ? round2(mean(v)) : 0, n: v.length }; }).filter((c) => c.n >= 1).map(({ n, ...c }) => { void n; return c; });
  // punctuality / attendance
  const grace = db.settings.grace_minutes;
  const att = live(db.attendance).filter((a) => inP(a.date) && a.clock_in && a.kind === 'Present');
  const late = att.filter((a) => a.late_min > grace).length;
  const staff = live(db.employees).filter((e) => e.status !== 'inactive' && e.department === 'Field Operations');
  const hol = new Set(live(db.holidays).map((h) => h.date));
  let sched = 0; let came = 0;
  for (let d = from; d <= to && d <= T; d = addDays(d, 1)) {
    if (hol.has(d)) continue;
    for (const e of staff) { if (dow(d) === e.rest_day || (e.hire_date && d < e.hire_date)) continue; if (d === T && !att.some((a) => a.employee_id === e.id && a.date === d)) continue; sched += 1; if (att.some((a) => a.employee_id === e.id && a.date === d)) came += 1; }
  }
  // safety
  const inc = live(db.incidents).filter((i) => inP(i.created_at.slice(0, 10)));
  const serious = live(db.incidents).filter((i) => i.severity !== 'Low').map((i) => i.created_at.slice(0, 10)).sort().pop();
  const redo = live(db.back_jobs).filter((b) => inP(b.created_at.slice(0, 10))).length;
  const damaged = live(db.assets).filter((a) => ['Damaged', 'Out of Service', 'Missing'].includes(a.status)).length;
  // praise from clients (kept short; no client names are added)
  const praise = fb.filter((f) => f.rating === 3 && (f.comment ?? '').trim().length >= 12).map((f) => (f.comment ?? '').trim().slice(0, 180)).slice(0, 4);
  // recognition
  const recs = staff.map((e) => ({ e, r: computeRecog(db, e, T) }));
  const perfect = recs.filter((x) => x.r.perfect).map((x) => first(x.e.full_name));
  const streaks = recs.filter((x) => x.r.streak >= 5).sort((a, b) => b.r.streak - a.r.streak).slice(0, 4).map((x) => ({ name: first(x.e.full_name), days: x.r.streak }));
  const top = staff.filter((e) => e.rating !== undefined).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 3).map((e) => ({ name: first(e.full_name), rating: round2(e.rating ?? 0) }));
  // the work ahead
  const upcoming = live(db.jobs).filter((j) => !OFF.has(j.status) && !isDone(j.status) && j.start_at.slice(0, 10) >= T && j.start_at.slice(0, 10) <= addDays(T, 13));
  const byDay = new Map<string, number>(); for (const j of upcoming) byDay.set(j.start_at.slice(0, 10), (byDay.get(j.start_at.slice(0, 10)) ?? 0) + 1);
  const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([date, n]) => ({ date, jobs: n }));
  const cap = capacityDays(db, T, 14);
  const peak = Math.max(0, ...cap.days.filter((d) => d.available > 0).map((d) => d.pct));

  const rating = stars.length ? round2(mean(stars)) : null;
  const onTime = att.length ? (att.length - late) / att.length : null;
  const attendancePct = sched ? came / sched : null;
  const weakest = [...categories].sort((a, b) => a.avg - b.avg)[0]; const best = [...categories].sort((a, b) => b.avg - a.avg)[0];
  const goals: TeamMeeting['goals'] = [
    { label: 'Client rating', now: rating === null ? 'no ratings yet' : `${rating} / 5`, target: '4.5 or higher', met: rating === null ? null : rating >= 4.5 },
    { label: 'On time at the site / HQ', now: onTime === null ? 'no data' : `${Math.round(onTime * 100)}%`, target: '95% or higher', met: onTime === null ? null : onTime >= 0.95 },
    { label: 'Safety incidents', now: String(inc.length), target: 'zero', met: inc.length === 0 },
    { label: 'Redo / back jobs', now: String(redo), target: 'zero', met: redo === 0 },
  ];
  const wins: string[] = [];
  if (done.length) wins.push(`${done.length} job${done.length === 1 ? '' : 's'} completed for ${new Set(done.map((j) => j.client_id)).size} client${new Set(done.map((j) => j.client_id)).size === 1 ? '' : 's'} in ${p.label}.`);
  if (rating !== null && rating >= 4.5) wins.push(`Clients rated us ${rating} out of 5.`);
  if (best && best.avg >= 4.5) wins.push(`Strongest area: ${best.text} (${best.avg} / 5).`);
  if (onTime !== null && onTime >= 0.9) wins.push(`${Math.round(onTime * 100)}% of arrivals were on time.`);
  if (inc.length === 0 && (done.length > 0)) wins.push('No safety incidents reported.');
  if (redo === 0 && done.length > 0) wins.push('No redo jobs — the work was right the first time.');
  if (perfect.length) wins.push(`Perfect attendance this month: ${perfect.join(', ')}.`);
  const focus: string[] = [];
  if (weakest && weakest.avg > 0 && weakest.avg < 4.5) focus.push(`${weakest.text} is our lowest client score (${weakest.avg} / 5) — let us talk about how to lift it.`);
  if (onTime !== null && onTime < 0.9) focus.push(`Only ${Math.round(onTime * 100)}% of arrivals were on time (${late} late). Aim for 95%.`);
  if (inc.length) focus.push(`${inc.length} safety incident${inc.length === 1 ? '' : 's'} reported${inc.filter((i) => i.status !== 'Resolved').length ? ' — some are still open' : ''}. Review what happened and how to prevent it.`);
  if (redo) focus.push(`${redo} redo job${redo === 1 ? '' : 's'}: finish it right the first time, and check with the client before leaving.`);
  if (damaged) focus.push(`${damaged} piece${damaged === 1 ? '' : 's'} of equipment ${damaged === 1 ? 'needs' : 'need'} repair or ${damaged === 1 ? 'is' : 'are'} missing — report problems early and return tools clean.`);
  if (peak >= 0.85) focus.push('The next two weeks are very busy — plan rest, transport and equipment early.');

  return {
    period: p, jobsDone: done.length, clientsServed: new Set(done.map((j) => j.client_id)).size,
    rating, responses: fb.length, fiveStar: stars.filter((s) => s >= 4.5).length, categories,
    punctuality: { pct: onTime, late, checkins: att.length }, attendance: { pct: attendancePct },
    safety: { incidents: inc.length, open: inc.filter((i) => i.status !== 'Resolved').length, daysSinceSerious: serious ? Math.max(0, Math.round((Date.parse(`${T}T00:00:00Z`) - Date.parse(`${serious}T00:00:00Z`)) / 86400000)) : null },
    redoJobs: redo, damagedEquipment: damaged, praise, recognition: { perfect, streaks, top },
    ahead: { next7: upcoming.filter((j) => j.start_at.slice(0, 10) <= addDays(T, 6)).length, next14: upcoming.length, busiest, peakCrewPct: cap.days.length ? peak : null },
    goals, wins, focus,
  };
}

/** What is sent to the AI for talking points: counts and scores only — no names and no client comments. */
export function teamAiSummary(t: TeamMeeting) {
  const r = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
  return {
    period: t.period.label, jobs_completed: t.jobsDone, clients_served: t.clientsServed, client_rating_out_of_5: t.rating, ratings_received: t.responses,
    rating_by_area: t.categories.map((c) => ({ area: c.text, score: c.avg })), on_time_share: r(t.punctuality.pct), late_arrivals: t.punctuality.late, attendance_share: r(t.attendance.pct),
    safety_incidents: t.safety.incidents, open_safety_incidents: t.safety.open, days_since_serious_incident: t.safety.daysSinceSerious, redo_jobs: t.redoJobs, damaged_or_missing_equipment: t.damagedEquipment,
    people_with_perfect_attendance: t.recognition.perfect.length, people_on_a_streak: t.recognition.streaks.length,
    next_7_days_jobs: t.ahead.next7, next_14_days_jobs: t.ahead.next14, busiest_next_14_days_crew_booked_share: r(t.ahead.peakCrewPct),
    goals: t.goals.map((g) => ({ goal: g.label, now: g.now, target: g.target, met: g.met })), wins: t.wins, focus_areas: t.focus,
  };
}

/** Plain text for Viber / Messenger. */
export function teamMeetingText(t: TeamMeeting, company: string): string {
  const L: string[] = [`${company} — Team meeting (${t.period.label})`, ''];
  L.push(`Jobs completed: ${t.jobsDone} · Clients served: ${t.clientsServed}`);
  if (t.rating !== null) L.push(`Client rating: ${t.rating} / 5 (${t.responses} responses)`);
  if (t.punctuality.pct !== null) L.push(`On time: ${Math.round(t.punctuality.pct * 100)}%`);
  L.push(`Safety incidents: ${t.safety.incidents}`);
  if (t.wins.length) L.push('', 'GOOD NEWS', ...t.wins.map((w) => `• ${w}`));
  if (t.recognition.top.length) L.push('', 'THANK YOU', ...t.recognition.top.map((x) => `• ${x.name} — ${x.rating} / 5`), ...(t.recognition.perfect.length ? [`• Perfect attendance: ${t.recognition.perfect.join(', ')}`] : []));
  if (t.focus.length) L.push('', 'LET US IMPROVE', ...t.focus.map((w) => `• ${w}`));
  L.push('', 'WORK AHEAD', `• Next 7 days: ${t.ahead.next7} jobs · next 14 days: ${t.ahead.next14} jobs`, ...t.ahead.busiest.map((b) => `• Busiest: ${b.date} (${b.jobs} jobs)`));
  L.push('', 'OUR GOALS', ...t.goals.map((g) => `${g.met === null ? '•' : g.met ? '✅' : '⬜'} ${g.label}: ${g.now} (goal: ${g.target})`));
  return L.join('\n');
}
