// Employee rating (1–5 stars) from the monthly scorecard, and the motivational message shown on the attendance screen.
import type { DB, Employee, RatingParts } from './types';
import { scorecard } from './business';
import { addDays, monthStart, round2 } from './util';

const live = <X extends { deleted_at?: string | null }>(a: X[]) => a.filter((x) => !x.deleted_at);

/** Rating from the last three months that have approved attendance. No rating until there is some. */
export function employeeRating(db: DB, emp: Employee, t: string): { rating: number; parts: RatingParts } | null {
  const months: string[] = []; let m = monthStart(t);
  for (let k = 0; k < 3; k++) { months.push(m.slice(0, 7)); m = monthStart(addDays(m, -1)); }
  const used = months.map((mo) => ({ mo, sc: scorecard(db, emp, mo) })).filter((x) => live(db.attendance).some((a) => a.employee_id === emp.id && a.date.startsWith(x.mo) && a.clock_in && a.approval === 'Approved'));
  if (!used.length) return null;
  const avg = (f: (x: (typeof used)[number]['sc']) => number, only?: (x: (typeof used)[number]['sc']) => boolean) => { const l = used.filter((u) => (only ? only(u.sc) : true)); return l.length ? round2(l.reduce((s, u) => s + f(u.sc), 0) / l.length) : undefined; };
  const score = avg((s) => s.score)!;
  return {
    rating: Math.max(1, Math.min(5, Math.round((score / 20) * 10) / 10)),
    parts: { attendance: avg((s) => s.attendanceRate), punctuality: avg((s) => s.punctuality), client: avg((s) => s.clientRating, (s) => s.clientRating > 0), quality: avg((s) => s.supervisor, (s) => s.hasReview && s.supervisor > 0), safety: avg((s) => s.safety, (s) => s.hasReview && s.safety > 0), teamwork: avg((s) => s.teamwork, (s) => s.hasReview && s.teamwork > 0), months: used.length },
  };
}

export const ratingLabel = (r: number) => (r >= 4.5 ? 'Outstanding' : r >= 4 ? 'Excellent' : r >= 3.5 ? 'Very good' : r >= 3 ? 'Good' : r >= 2.5 ? 'Growing' : 'Needs support');
export const ratingTone = (r: number) => (r >= 4 ? 'green' : r >= 3 ? 'teal' : r >= 2.5 ? 'amber' : 'red');
export const stars = (r: number) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));

const AREAS: [keyof Omit<RatingParts, 'months'>, string, string][] = [
  ['punctuality', 'arriving on time', 'Being on time every day is the fastest way to move your rating up.'],
  ['attendance', 'full attendance', 'Showing up every scheduled day keeps the whole crew strong — it counts a lot toward your rating.'],
  ['client', 'client feedback', 'Greet the client, keep the work area tidy and tell them what you are doing — happy clients lift your rating.'],
  ['safety', 'safety', 'Wearing your full PPE and following the safety briefing protects you and raises your rating.'],
  ['teamwork', 'teamwork', 'Helping your teammates and communicating early makes every job smoother.'],
];
/** The weakest area with data (below 90), or undefined if everything is strong. */
export function focusArea(p?: RatingParts) {
  const list = AREAS.map(([k, name, tip]) => ({ k, name, tip, v: p?.[k] })).filter((x) => x.v !== undefined && x.v! < 90).sort((a, b) => a.v! - b.v!);
  return list[0];
}
export function strongArea(p?: RatingParts) {
  const list = AREAS.map(([k, name]) => ({ k, name, v: p?.[k] })).filter((x) => x.v !== undefined && x.v! >= 95).sort((a, b) => b.v! - a.v!);
  return list[0];
}

export interface Motivation { headline: string; message: string; tip?: string }
/** A short, kind message for the person's rating. Never shaming: low ratings get encouragement and one clear thing to work on. */
export function motivation(rating: number | undefined, parts: RatingParts | undefined, firstName: string, phase: 'in' | 'out' | 'done'): Motivation {
  const n = firstName || 'there';
  if (rating === undefined) return {
    headline: `Welcome, ${n}!`,
    message: phase === 'out' ? 'Thank you for your work today. Your rating starts after your first approved attendance.' : 'Your rating starts after your first approved attendance. Show up on time, work safely and take pride in every window.',
  };
  const strong = strongArea(parts); const focus = focusArea(parts);
  const band = rating >= 4.5 ? 'top' : rating >= 4 ? 'high' : rating >= 3.5 ? 'good' : rating >= 3 ? 'ok' : 'low';
  const msg: Record<typeof band, string[]> = {
    top: [`Outstanding work, ${n}! You are one of the people who make TopMop shine.`, `You are setting the standard for the whole crew, ${n}. Thank you.`],
    high: [`Excellent, ${n}! Keep going — the top rating is within reach.`, `Great job, ${n}. Your steady work is noticed by clients and the team.`],
    good: [`Good work, ${n}! A little more consistency and you will be at the top.`, `You are doing well, ${n}. Keep building on it, one job at a time.`],
    ok: [`You are on track, ${n}. Small improvements each day add up fast.`, `Every job is a chance to move your rating up, ${n}. You can do it.`],
    low: [`Every day is a fresh start, ${n}. We believe in you, and your team leader is here to help.`, `Your rating can change quickly, ${n}. Focus on one thing today and you will see the difference.`],
  };
  const pick = msg[band][(n.length + Math.round(rating * 10)) % msg[band].length];
  const after = phase === 'out' || phase === 'done' ? ' Thank you for today\'s work — rest well and stay safe.' : ' Have a safe and productive shift.';
  return {
    headline: `${ratingLabel(rating)} · ${rating.toFixed(1)} / 5`,
    message: pick + after,
    tip: band === 'top' && strong ? `Your strongest area is ${strong.name} — keep it up.` : focus ? `Focus today: ${focus.name}. ${focus.tip}` : strong ? `Your strongest area is ${strong.name}.` : undefined,
  };
}

/** Team summary for the Admin dashboard. */
export function ratingStats(db: DB) {
  const rated = live(db.employees).filter((e) => e.status !== 'inactive' && e.rating !== undefined);
  const avg = rated.length ? round2(rated.reduce((s, e) => s + e.rating!, 0) / rated.length) : undefined;
  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, n: rated.filter((e) => Math.round(e.rating!) === star).length }));
  const sorted = [...rated].sort((a, b) => b.rating! - a.rating! || a.full_name.localeCompare(b.full_name));
  return { rated, avg, dist, top: sorted.slice(0, 5), support: [...sorted].reverse().filter((e) => e.rating! < 3).slice(0, 5), unrated: live(db.employees).filter((e) => e.status !== 'inactive' && e.rating === undefined).length };
}
