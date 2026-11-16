// The motion of the miniature robots in the cinematic headquarters: where each one sits, which paths they walk, and when they wander.
// Positions are percentages of the picture. Real events decide WHAT an agent does (work, wait, hand over); this file decides HOW it moves around the picture.
import { AGENTS, hash, type AgentState, type AgentView } from './hq';

export type P = { x: number; y: number };
/** Where each agent sits at work (on the painted floor beside its department's desks). */
export const SEATS: Record<string, P> = {
  jarvis: { x: 50.2, y: 41.2 },
  inbox: { x: 13, y: 28.6 }, mailer: { x: 21, y: 27.2 }, followup: { x: 29, y: 28.6 },
  photo: { x: 72, y: 29.2 }, video: { x: 79, y: 27.6 }, creative: { x: 87, y: 28.6 }, qc: { x: 94, y: 27.4 },
  campaign: { x: 14, y: 57 }, strategist: { x: 22, y: 55.2 }, attrib: { x: 30, y: 57 },
  messenger: { x: 72, y: 56.6 }, qualifier: { x: 80, y: 55.2 }, support: { x: 88, y: 56.6 }, router: { x: 95, y: 55.2 },
  quote: { x: 41, y: 76.6 }, booking: { x: 49, y: 75.2 }, scheduler: { x: 57, y: 76.6 }, joborders: { x: 64.4, y: 75.2 },
  records: { x: 13, y: 88 }, attendance: { x: 22, y: 85.4 }, training: { x: 31, y: 88 },
  growth: { x: 58, y: 75.4 }, industry: { x: 61.4, y: 79 }, cfo: { x: 58, y: 82.6 }, ops: { x: 61.4, y: 86 },
};
/** The walkways: a small graph of waypoints between the departments, the AI core plaza and the café. */
export const NODES: Record<string, P> = {
  hubL: { x: 40, y: 40.5 }, hub: { x: 50, y: 43.4 }, hubR: { x: 60, y: 40.5 },
  cafeL: { x: 42, y: 52.6 }, cafe: { x: 51, y: 53.6 }, cafeR: { x: 60, y: 52.6 },
  emailX: { x: 37, y: 30.5 }, creativeX: { x: 63, y: 30.5 }, adsX: { x: 37, y: 52.2 }, deskX: { x: 63, y: 52.2 },
  bookX: { x: 51, y: 60.5 }, hrX: { x: 38, y: 70 }, boardX: { x: 62.5, y: 70 },
};
const EDGES: [string, string][] = [['emailX', 'hubL'], ['creativeX', 'hubR'], ['hubL', 'hub'], ['hub', 'hubR'], ['hub', 'cafe'], ['cafeL', 'cafe'], ['cafe', 'cafeR'], ['adsX', 'cafeL'], ['deskX', 'cafeR'], ['cafe', 'bookX'], ['bookX', 'hrX'], ['bookX', 'boardX'], ['hubL', 'adsX'], ['hubR', 'deskX']];
/** Each department's exit onto the walkways. */
export const EXIT: Record<string, string> = { hub: 'hub', email: 'emailX', creative: 'creativeX', ads: 'adsX', desk: 'deskX', booking: 'bookX', hr: 'hrX', board: 'boardX' };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const neighbours = (n: string) => EDGES.flatMap(([a, b]) => (a === n ? [b] : b === n ? [a] : []));

/** The shortest walk between two waypoints (Dijkstra over the walkway graph). */
export function walkNodes(from: string, to: string): string[] {
  if (from === to) return [from];
  const d: Record<string, number> = { [from]: 0 }; const prev: Record<string, string> = {}; const todo = new Set(Object.keys(NODES));
  while (todo.size) {
    let u: string | undefined; for (const n of todo) if (d[n] !== undefined && (u === undefined || d[n] < d[u])) u = n;
    if (u === undefined) break; todo.delete(u); if (u === to) break;
    for (const v of neighbours(u)) { const alt = d[u] + dist(NODES[u], NODES[v]); if (d[v] === undefined || alt < d[v]) { d[v] = alt; prev[v] = u; } }
  }
  const out = [to]; while (out[0] !== from && prev[out[0]]) out.unshift(prev[out[0]]); return out[0] === from ? out : [from, to];
}
const deptOf = (key: string) => AGENTS.find((a) => a.key === key)?.dept ?? 'hub';
/** The full route from one spot to another: seat → department exit → walkways → exit → seat. `at` can be an agent's seat key (a1) or a waypoint name. */
export function routeBetween(fromKey: string | null, fromPos: P, toPos: P, toKey: string | null): P[] {
  const nearest = (p: P) => Object.entries(NODES).sort((a, b) => dist(a[1], p) - dist(b[1], p))[0][0];
  const a = fromKey ? EXIT[deptOf(fromKey)] : nearest(fromPos), b = toKey ? EXIT[deptOf(toKey)] : nearest(toPos);
  const mid = walkNodes(a, b).map((n) => NODES[n]);
  return [fromPos, ...mid, toPos].filter((p, i, l) => i === 0 || dist(p, l[i - 1]) > 0.05);
}
/** Each agent's own spot in the café (a ring in front of the counter, nobody on anybody else). */
export function cafeSpot(key: string): P {
  const list = AGENTS.filter((a) => a.key !== 'jarvis'); const i = Math.max(0, list.findIndex((a) => a.key === key)); const ang = (i / list.length) * Math.PI * 2 + 0.4;
  return { x: 51 + Math.cos(ang) * 8.4, y: 52.6 + Math.sin(ang) * 1.6 };
}
/** A spot on the plaza around the AI core. */
export function plazaSpot(key: string): P { const a = (hash(key) % 628) / 100; return { x: 50 + Math.cos(a) * 7.5, y: 42.6 + Math.sin(a) * 1.4 }; }

export type Pose = 'walk' | 'type' | 'wait' | 'cheer' | 'shake' | 'chat' | 'idle';
export type Where = 'seat' | 'cafe' | 'plaza' | 'visit';
/** What an agent wants to do now, from its real state. Real work always wins over wandering. */
export function wantFor(view: AgentView, key: string, wander: Where): { spot: P; at: Where | 'partner'; pose: Pose; partnerKey?: string } {
  const seat = SEATS[key];
  if (view.state === 'coordinating' && view.partner && SEATS[view.partner]) { const p = SEATS[view.partner]; return { spot: { x: p.x + (key < view.partner ? -2.2 : 2.2), y: p.y + 1.2 }, at: 'partner', pose: 'chat', partnerKey: view.partner }; }
  const poseAtSeat: Record<AgentState, Pose> = { idle: 'idle', received: 'type', working: 'type', coordinating: 'chat', awaiting: 'wait', done: 'cheer', blocked: 'shake', error: 'shake', social: 'idle' };
  if (view.state !== 'idle') return { spot: seat, at: 'seat', pose: poseAtSeat[view.state] };
  if (key !== 'jarvis' && wander === 'cafe') return { spot: cafeSpot(key), at: 'cafe', pose: 'chat' };
  if (wander === 'plaza') return { spot: plazaSpot(key), at: 'plaza', pose: 'idle' };
  return { spot: seat, at: 'seat', pose: 'idle' };
}
/** How long an idle agent stays where it is before it decides again (seconds), and where it goes next. Live desks stay at work longer; planned ones roam more. */
export function nextWander(key: string, live: boolean, n: number): { after: number; where: Where } {
  const r = hash(`${key}:${n}`); const roam = live ? 28 : 55;                              // percentage chance to leave the seat
  const where: Where = r % 100 < roam ? (r % 3 === 0 ? 'plaza' : 'cafe') : 'seat';
  return { after: 7 + (r % 11) + (where === 'seat' ? 6 : 0), where };
}
/** Moves a walker along its route at `speed` (percent of the picture per second). */
export function advance(pos: P, route: P[], dt: number, speed: number): { pos: P; route: P[]; moving: boolean; dir: number } {
  let step = speed * dt; let p = { ...pos }; let r = route.slice(); let dir = 0;
  while (r.length && step > 0) {
    const t = r[0]; const d = dist(p, t);
    if (d <= step) { p = { ...t }; step -= d; if (t.x !== pos.x) dir = Math.sign(t.x - pos.x) || dir; r.shift(); } else { p = { x: p.x + ((t.x - p.x) / d) * step, y: p.y + ((t.y - p.y) / d) * step }; dir = Math.sign(t.x - p.x) || dir; step = 0; }
  }
  return { pos: p, route: r, moving: r.length > 0, dir };
}
