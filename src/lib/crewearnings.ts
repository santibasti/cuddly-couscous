// What a crew member has earned so far this pay week (Sunday to Saturday, paid Saturday night): the rate, the bonus and the total for each day.
// The bonus of a job shows as an estimate until the client signs the handover; work after Saturday's cutoff counts in the next week.
import { eachDay, nowLocal, round2, sum } from './util';
import { payDateOf, weekOf } from './payrollweek';
import { jobBonus, jobBonusDate, jobPayDate, jobPaySettings, jobsAttended } from './jobpay';
import type { DB, Employee } from './types';

export interface EarnDay { date: string; rate: number; bonus: number; total: number; /** the bonus of this day is not final yet */ estimate: boolean }
export interface CrewWeek { start: string; end: string; days: EarnDay[]; rate: number; bonus: number; total: number; estimate: boolean; notes: string[]; updated_at: string }

/** The pay week "now" is in: after the Saturday payday cutoff it is already the next week. */
export const payWeekNow = (db: Pick<DB, 'settings'>, now: string = nowLocal()) => weekOf(payDateOf(now, jobPaySettings(db.settings).payday_cutoff));

/** null for people on a monthly salary (there is nothing to accumulate). */
export function crewEarnings(db: DB, emp: Employee, now: string = nowLocal()): CrewWeek | null {
  if (emp.pay_basis === 'monthly') return null;
  const week = payWeekNow(db, now); const cfg = jobPaySettings(db.settings);
  const days: EarnDay[] = eachDay(week.start, week.end).map((date) => ({ date, rate: 0, bonus: 0, total: 0, estimate: false }));
  const day = (d: string) => days.find((x) => x.date === d); const notes = new Set<string>();
  const inWeek = (d?: string) => !!d && d >= week.start && d <= week.end;
  for (const j of jobsAttended(db, emp.id, week.start, week.end, false, now.slice(0, 10))) {
    const b = jobBonus(db, j); const rd = jobPayDate(db, j), bd = jobBonusDate(db, j, b);
    if (inWeek(rd)) {
      if (emp.pay_basis === 'per_job') day(rd)!.rate += emp.job_rate ?? 0;
      if (rd !== j.start_at.slice(0, 10)) notes.add(`${j.number} started after Saturday ${cfg.payday_cutoff ?? '21:00'}, so it counts in this week.`);
      if (b.final && inWeek(bd)) day(bd!)!.bonus += b.each;
      else if (!b.final && b.each > 0) { day(rd)!.bonus += b.each; day(rd)!.estimate = true; notes.add(`${j.number}: the bonus is an estimate until the client signs the handover.`); }
    } else if (b.final && inWeek(bd)) { day(bd!)!.bonus += b.each; notes.add(`${j.number}: bonus added after the client signed the handover.`); }
  }
  if (emp.pay_basis === 'daily') for (const a of db.attendance) {
    if (a.employee_id !== emp.id || a.deleted_at || a.approval !== 'Approved' || !a.clock_in || a.kind === 'Leave' || (a.date === now.slice(0, 10) && !a.clock_out)) continue;
    const d = day(a.date); if (d && !d.rate) d.rate = emp.daily_rate;
  }
  for (const d of days) { d.rate = round2(d.rate); d.bonus = round2(d.bonus); d.total = round2(d.rate + d.bonus); }
  return { start: week.start, end: week.end, days, rate: round2(sum(days, (d) => d.rate)), bonus: round2(sum(days, (d) => d.bonus)), total: round2(sum(days, (d) => d.total)), estimate: days.some((d) => d.estimate), notes: [...notes], updated_at: now };
}

let lastSig = '';
/** Payroll people's app saves each crew member's week to the server so the crew can read only their own row. Cloud only; a missing table is ignored. */
export async function publishCrewEarnings(db: DB, now: string = nowLocal()): Promise<void> {
  const { supabase } = await import('./cloud');
  const rows = db.employees.filter((e) => !e.deleted_at && e.status !== 'inactive').map((e) => ({ e, w: crewEarnings(db, e, now) })).filter((x) => x.w)
    .map(({ e, w }) => ({ employee_id: e.id, week_start: w!.start, days: w!.days, rate: w!.rate, bonus: w!.bonus, total: w!.total, estimate: w!.estimate, notes: w!.notes, updated_at: now }));
  const sig = JSON.stringify(rows.map(({ updated_at: _u, ...r }) => r)); // eslint-disable-line @typescript-eslint/no-unused-vars
  if (!rows.length || sig === lastSig) return;
  const { error } = await supabase().from('crew_week_earnings').upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'employee_id,week_start' });
  if (!error) lastSig = sig;
}
