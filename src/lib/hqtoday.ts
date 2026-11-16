// "Services today" for the AI Headquarters: every job going on today with its stage, built from the same facts as the Happening Today page (same stage rules).
import { live } from './store';
import { STAGE, stageOf, type Stage } from './todaystage';
import type { DB } from './types';

export interface TodayService { id: string; number: string; client: string; place: string; service: string; stage: Stage; label: string; icon: string; tone: string; start: string; present: number; crew: number; vip: boolean }
export interface TodayCounts { total: number; done: number; working: number; road: number; waiting: number; problem: number }

export function servicesToday(db: DB, now: string): TodayService[] {
  const day = now.slice(0, 10);
  return live(db.jobs).filter((j) => !['Cancelled', 'Rescheduled'].includes(j.status) && j.start_at.slice(0, 10) <= day && j.end_at.slice(0, 10) >= day)
    .sort((a, b) => a.start_at.localeCompare(b.start_at)).map((j) => {
      const w = live(db.workflows).find((x) => x.job_id === j.id), client = db.clients.find((c) => c.id === j.client_id), site = db.sites.find((s) => s.id === j.site_id);
      const stage = stageOf(j, w, now, db, day), ids = [...new Set([...(j.leader_id ? [j.leader_id] : []), ...j.crew_ids])];
      const present = ids.filter((id) => { const a = live(db.attendance).find((x) => x.employee_id === id && x.date === day); return w?.arr_crew_present?.includes(id) || (!!a?.clock_in && (!a.job_id || a.job_id === j.id)); }).length;
      return { id: j.id, number: j.number, client: client?.name ?? '—', place: site?.name || site?.address || client?.address || '', service: j.service_codes.map((c) => db.services.find((s) => s.code === c)?.name ?? c).join(' · '), stage, label: STAGE[stage].label, icon: STAGE[stage].icon, tone: STAGE[stage].tone, start: j.start_at, present, crew: ids.length, vip: !!client?.vip };
    });
}
export function countServices(list: TodayService[]): TodayCounts {
  return { total: list.length, done: list.filter((s) => ['back', 'declined'].includes(s.stage)).length, working: list.filter((s) => ['onsite', 'working', 'finished'].includes(s.stage)).length, road: list.filter((s) => ['road', 'left'].includes(s.stage)).length,
    waiting: list.filter((s) => ['scheduled', 'late', 'dayend'].includes(s.stage)).length, problem: list.filter((s) => ['noclock', 'late'].includes(s.stage)).length };
}
/** Labelled sample for demo mode: nothing here is real. */
export const SAMPLE_SERVICES: TodayService[] = [
  { id: 's1', number: 'SAMPLE', client: 'Sample client A', place: 'Makati', service: 'Glass cleaning', stage: 'working', label: STAGE.working.label, icon: STAGE.working.icon, tone: STAGE.working.tone, start: '', present: 4, crew: 4, vip: false },
  { id: 's2', number: 'SAMPLE', client: 'Sample client B', place: 'BGC', service: 'Solar panels', stage: 'road', label: STAGE.road.label, icon: STAGE.road.icon, tone: STAGE.road.tone, start: '', present: 0, crew: 3, vip: false },
  { id: 's3', number: 'SAMPLE', client: 'Sample client C', place: 'Pasig', service: 'Post-construction', stage: 'back', label: STAGE.back.label, icon: STAGE.back.icon, tone: STAGE.back.tone, start: '', present: 5, crew: 5, vip: false },
];
