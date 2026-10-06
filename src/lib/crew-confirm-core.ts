// Crew availability: the evening before a service (from 7:00 PM) every assigned team leader / crew member confirms or declines in their own account.
import type { Job } from './types';
import { addDays } from './util';

export const CONFIRM_TIME = '19:00';
export const CONFIRM_STATUSES: Job['status'][] = ['Confirmed', 'Dispatch Checklist Pending'];
export interface Confirmation { status: 'confirmed' | 'declined'; at: string; note?: string; for_start: string }

/** local date-time (Asia/Manila) from which people are asked: 7:00 PM the day before */
export const opensAt = (j: Pick<Job, 'start_at'>) => `${addDays(j.start_at.slice(0, 10), -1)}T${CONFIRM_TIME}`;
/** the question is open from 7 PM the evening before until the job starts */
export const isAsking = (j: Pick<Job, 'start_at' | 'status' | 'deleted_at'>, now: string) => !j.deleted_at && CONFIRM_STATUSES.includes(j.status) && now >= opensAt(j) && now < j.start_at;
export const teamOf = (j: Pick<Job, 'leader_id' | 'crew_ids'>) => [...new Set([...(j.leader_id ? [j.leader_id] : []), ...(j.crew_ids ?? [])])];
/** an answer counts only for the schedule it was given for — if the job moves, everyone is asked again */
export const answerOf = (j: Pick<Job, 'start_at' | 'crew_confirmations'>, empId: string): Confirmation | undefined => {
  const c = (j.crew_confirmations as Record<string, Confirmation> | undefined)?.[empId];
  return c && c.for_start === j.start_at ? c : undefined;
};
export const pendingFor = (jobs: Job[], empId: string, now: string) => jobs.filter((j) => isAsking(j, now) && teamOf(j).includes(empId) && !answerOf(j, empId)).sort((a, b) => a.start_at.localeCompare(b.start_at));
export function summary(j: Job) {
  const team = teamOf(j); const confirmed: string[] = []; const declined: string[] = []; const waiting: string[] = [];
  for (const id of team) { const a = answerOf(j, id); (a ? (a.status === 'confirmed' ? confirmed : declined) : waiting).push(id); }
  return { team, confirmed, declined, waiting };
}
