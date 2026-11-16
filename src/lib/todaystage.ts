// The stages of one service today (shared by the Happening Today page and the AI Headquarters "Services today" panel).
import { dayInfo } from './jobdays';
import type { DB, Job, JobWorkflow } from './types';

export type Stage = 'dayend' | 'noclock' | 'scheduled' | 'late' | 'road' | 'onsite' | 'working' | 'finished' | 'left' | 'back' | 'declined';
export const STAGE: Record<Stage, { label: string; tone: string; icon: string }> = {
  dayend: { label: 'Day done, back tomorrow', tone: 'navy', icon: '🌙' }, noclock: { label: 'No clock-in', tone: 'amber', icon: '⚠️' },
  scheduled: { label: 'Scheduled', tone: 'grey', icon: '🕒' }, late: { label: 'Not started yet', tone: 'amber', icon: '⏰' }, road: { label: 'On the way', tone: 'blue', icon: '🚚' },
  onsite: { label: 'Arrived on site', tone: 'teal', icon: '📍' }, working: { label: 'Working now', tone: 'green', icon: '🧽' }, finished: { label: 'Work finished', tone: 'navy', icon: '✅' },
  left: { label: 'Heading back to HQ', tone: 'blue', icon: '🏁' }, back: { label: 'Back at HQ', tone: 'navy', icon: '🏠' }, declined: { label: 'Client declined', tone: 'red', icon: '✖' },
};
export const wall = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16));

export function stageOf(j: Job, w: JobWorkflow | undefined, now: string, db?: DB, day?: string): Stage {
  if (w?.conf_mode === 'declined') return 'declined';
  // a job over several days is followed day by day: each day has its own clock-in / clock-out (the job-wide steps only describe the job as a whole)
  const lastDay = j.end_at.slice(0, 10);
  if (db && day && j.end_at.slice(0, 10) > j.start_at.slice(0, 10) && day < lastDay && !w?.finish_at) {
    const di = dayInfo(db, j, day, now.slice(0, 10));
    if (di) return di.kind === 'field' ? 'working' : di.kind === 'done' ? 'dayend' : day < now.slice(0, 10) ? 'noclock' : 'scheduled';
  }
  if (w?.hqa_at) return 'back'; if (w?.leave_at) return 'left'; if (w?.finish_at) return 'finished'; if (w?.start_at) return 'working'; if (w?.arr_at) return 'onsite'; if (w?.disp_at) return 'road';
  return now > j.start_at && j.start_at.slice(0, 10) === now.slice(0, 10) && wall(now) - wall(j.start_at) > 15 * 60000 ? 'late' : 'scheduled';
}

