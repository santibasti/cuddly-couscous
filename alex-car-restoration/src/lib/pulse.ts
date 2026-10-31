import { allBlockers, projectHealth } from './logic';
import type { Data } from './types';

export interface Pulse {
  score: number;
  label: string;
  tone: 'green' | 'amber' | 'red';
  active: number;
  health: { onTrack: number; atRisk: number; blocked: number; late: number };
  blockedTasks: number;
  needYou: number;
}

/**
 * One number for how the shop is doing. Each active job counts in full when it is on track,
 * 60% when at risk, 30% when blocked and nothing when late.
 */
export function shopPulse(d: Data, today: string): Pulse {
  const active = d.projects.filter((p) => p.status === 'active');
  const h = active.map((p) => projectHealth(p, d, today).health);
  const n = (x: string) => h.filter((y) => y === x).length;
  const health = { onTrack: n('on_track'), atRisk: n('at_risk'), blocked: n('blocked'), late: n('late') };
  const base = active.length ? ((health.onTrack + 0.6 * health.atRisk + 0.3 * health.blocked) / active.length) * 100 : 100;
  const score = Math.max(0, Math.round(base));
  return {
    score, label: score >= 80 ? 'Running well' : score >= 55 ? 'Needs a look' : 'Needs attention', tone: score >= 80 ? 'green' : score >= 55 ? 'amber' : 'red',
    active: active.length, health, blockedTasks: allBlockers(d).length, needYou: health.blocked + health.late,
  };
}
