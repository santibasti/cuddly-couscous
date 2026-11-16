// LIVING OFFICE V2: the whole building. Nine rooms in three rows, joined by corridors (one under each row) and two vertical connectors.
// Everything here is a pure function of events and the clock: a door opens, a task is walked over, a pulse fires ONLY because an event says so.
// The only decorative movement is the café: an idle agent may take a break there, and it always walks back as soon as a real task arrives.
import { AGENTS, agentByKey, hash, inCafe, type AgentState, type AgentView, type DeptKey, type HqEvent } from './hq';

export type Room = DeptKey;
export const ROOMS: Room[] = ['email', 'creative', 'ads', 'desk', 'hub', 'booking', 'hr', 'cafe', 'board'];
const COLROW: Record<Room, [number, number]> = { email: [0, 0], creative: [1, 0], ads: [2, 0], desk: [0, 1], hub: [1, 1], booking: [2, 1], hr: [0, 2], cafe: [1, 2], board: [2, 2] };
export const COL_X = [30, 425, 820], ROOM_W = 350, ROW_Y = [30, 374, 718], SPINES = [402.5, 797.5];
export const WORLD = { w: 1200, h: 1070 };
export const BOT_SCALE = 0.74;
export interface Box { x: number; w: number; top: number; cx: number; wallY: number; doorY: number; hallY: number; walkY: number; deskY: number }
const boxes = {} as Record<Room, Box>;
for (const r of ROOMS) { const [c, rw] = COLROW[r]; const top = ROW_Y[rw], x = COL_X[c]; boxes[r] = { x, w: ROOM_W, top, cx: x + ROOM_W / 2, wallY: top + 212, doorY: top + 228, hallY: top + 294, walkY: top + 198, deskY: top + 150 }; }
export const box = (r: Room): Box => boxes[r];

export const STATION: Record<string, { room: Room; x: number; y: number; side: 1 | -1 }> = {};
for (const r of ROOMS) {
  if (r === 'cafe') continue; const list = AGENTS.filter((a) => a.dept === r), b = box(r);
  list.forEach((a, i) => { STATION[a.key] = { room: r, x: r === 'hub' ? b.cx - 120 : b.x + (b.w * (i + 0.5)) / list.length, y: b.deskY, side: i % 2 ? -1 : 1 }; });
}
const cb = box('cafe');
export const CAFE_SEATS = ([[-140, 170], [-76, 170], [-8, 186], [56, 186], [128, 170]] as [number, number][]).map(([dx, dy]) => ({ x: cb.cx + dx, y: cb.top + dy }));
export const roomOf = (agent: string): Room | null => { const d = agentByKey(agent)?.dept; return d ?? null; };

type Pt = { x: number; y: number };
export interface Spot { room: Room; x: number; y: number }
export const deskSpot = (k: string): Spot => ({ room: STATION[k].room, x: STATION[k].x, y: box(STATION[k].room).walkY });
export const cafeSpot = (i: number): Spot => ({ room: 'cafe', x: CAFE_SEATS[i].x, y: CAFE_SEATS[i].y });

/** The corridor between two rooms: along the row's corridor and, between rows, up or down the nearer connector. */
export function hallPath(ra: Room, rb: Room): Pt[] {
  const A = box(ra), B = box(rb), p: Pt[] = [{ x: A.cx, y: A.hallY }];
  if (A.hallY !== B.hallY) { const s = SPINES.reduce((m, q) => (Math.abs(A.cx - q) + Math.abs(q - B.cx) < Math.abs(A.cx - m) + Math.abs(m - B.cx) ? q : m)); p.push({ x: s, y: A.hallY }, { x: s, y: B.hallY }); }
  p.push({ x: B.cx, y: B.hallY }); return p.filter((q, i) => i === 0 || q.x !== p[i - 1].x || q.y !== p[i - 1].y);
}
export interface Passage { room: Room; i: number; j: number }       // the walker is at point i just before the glass and at point j (in the corridor) after it
export function routeBetween(a: Spot, b: Spot): { pts: Pt[]; doors: Passage[] } {
  const pts: Pt[] = [], doors: Passage[] = []; const add = (x: number, y: number) => { const l = pts[pts.length - 1]; if (!l || l.x !== x || l.y !== y) pts.push({ x, y }); return pts.length - 1; };
  add(a.x, a.y);
  if (a.room === b.room) { const B = box(a.room); add(a.x, B.walkY); add(b.x, B.walkY); add(b.x, b.y); return { pts, doors }; }
  const A = box(a.room), B = box(b.room);
  add(a.x, A.walkY); const i1 = add(A.cx, A.walkY); add(A.cx, A.doorY);
  const hp = hallPath(a.room, b.room); const j1 = add(hp[0].x, hp[0].y); doors.push({ room: a.room, i: i1, j: j1 });
  for (const q of hp.slice(1)) add(q.x, q.y);
  const last = add(B.cx, B.hallY); add(B.cx, B.doorY); const i2 = add(B.cx, B.walkY); doors.push({ room: b.room, i: last, j: i2 });
  add(b.x, B.walkY); add(b.x, b.y); return { pts, doors };
}
const lens = (p: Pt[]) => { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y)); return c; };
export function along(p: Pt[], d: number): Pt { const c = lens(p); if (d <= 0) return p[0]; if (d >= c[c.length - 1]) return p[p.length - 1]; let i = 1; while (c[i] < d) i++; const f = (d - c[i - 1]) / (c[i] - c[i - 1]); return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * f, y: p[i - 1].y + (p[i].y - p[i - 1].y) * f }; }

export const alongFrac = (p: Pt[], f: number): Pt => { const c = lens(p); return along(p, f * c[c.length - 1]); };

// ── walking: one calm pace, a short gentle start and stop (no sliding feet)
export const WALK = 0.14, RAMP = 500, STAND = 800, HAND = 1100, SETTLE = 400, LEAD = 450, LAG = 650;
const walked = (t: number, T: number) => { const S = WALK, R = RAMP; if (t <= 0) return 0; if (t >= T) return S * (T - R); if (t < R) return (S * t * t) / (2 * R); if (t > T - R) return S * (T - R) - (S * (T - t) * (T - t)) / (2 * R); return S * (R / 2 + (t - R)); };
const timeAt = (d: number, T: number) => { const S = WALK, R = RAMP, tot = S * (T - R); if (d <= 0) return 0; if (d >= tot) return T; if (d < (S * R) / 2) return Math.sqrt((2 * d * R) / S); if (d > tot - (S * R) / 2) return T - Math.sqrt((2 * (tot - d) * R) / S); return R / 2 + d / S; };

export interface Trip { id: string; agent: string; kind: 'handover' | 'toCafe' | 'toDesk'; start: number; from: Spot; to: Spot; round: boolean; partner?: string }
export interface TripState { trip: Trip; dt: number; pos: Pt; dir: Pt; moving: boolean; phase: 'prepare' | 'out' | 'handover' | 'back' | 'arrive'; carrying: boolean; away: boolean; open: Partial<Record<Room, boolean>> }
const geoCache = new Map<string, { pts: Pt[]; doors: Passage[]; c: number[]; total: number; T: number }>();
const geo = (t: Trip) => { const k = `${t.from.room}:${t.from.x}:${t.from.y}>${t.to.room}:${t.to.x}:${t.to.y}`; let g = geoCache.get(k); if (!g) { const { pts, doors } = routeBetween(t.from, t.to), c = lens(pts), total = c[c.length - 1]; g = { pts, doors, c, total, T: total / WALK + RAMP }; geoCache.set(k, g); } return g; };
export const tripLength = (t: Trip) => { const { T } = geo(t); return t.round ? STAND + T + HAND + T + SETTLE : 350 + T + SETTLE; };

export function tripState(trip: Trip, now: number): TripState | null {
  const dt = now - trip.start; if (dt < 0 || dt > tripLength(trip)) return null;
  const { pts, doors, c, total, T } = geo(trip), t0 = trip.round ? STAND : 350, t1 = t0 + T, t2 = t1 + (trip.round ? HAND : 0), t3 = trip.round ? t2 + T : t1;
  const phase: TripState['phase'] = dt < t0 ? 'prepare' : dt < t1 ? 'out' : dt < t2 ? 'handover' : dt < t3 ? 'back' : 'arrive';
  const d = dt < t0 ? 0 : dt < t1 ? walked(dt - t0, T) : dt < t2 ? total : dt < t3 ? total - walked(dt - t2, T) : trip.round ? 0 : total;
  const pos = along(pts, d), ahead = along(pts, Math.min(total, d + 6)), behind = along(pts, Math.max(0, d - 6)), sg = phase === 'back' ? -1 : 1, q = (v: number) => Math.sign(Math.round(v * 10) / 10) * sg;
  const dir = { x: q(ahead.x - behind.x), y: q(ahead.y - behind.y) };
  const moving = (phase === 'out' && dt > t0 + 30 && dt < t1 - 30) || (phase === 'back' && dt > t2 + 30 && dt < t3 - 30);
  const tOut = (x: number) => t0 + timeAt(x, T), tBack = (x: number) => t2 + (T - timeAt(x, T)); const open: TripState['open'] = {};
  for (const p of doors) { const o = (dt >= tOut(c[p.i]) - LEAD && dt <= tOut(c[p.j]) + LAG) || (trip.round && dt >= tBack(c[p.j]) - LEAD && dt <= tBack(c[p.i]) + LAG); if (o) open[p.room] = true; }
  return { trip, dt, pos, dir, moving, phase, carrying: trip.kind === 'handover' && dt >= t0 && dt < t2 + HAND * 0.45, away: trip.round && dt >= t0 - 150 && dt < t3, open };
}

/** Task hand-overs from the real events. One person walks one task at a time: when several hand-overs of the same agent arrive together, each waits for the one before it (at most a minute). */
export const QUEUE_MAX = 60_000;
export function handoverTrips(events: HqEvent[], now: number): Trip[] {
  const out: Trip[] = [], free: Record<string, number> = {};
  const list = events.filter((e) => e.to_agent && STATION[e.agent] && STATION[e.to_agent] && now - Date.parse(e.at) >= 0 && now - Date.parse(e.at) < 180_000).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || String(a.id).localeCompare(String(b.id)));
  for (const e of list) {
    const at = Date.parse(e.at), start = Math.max(at, free[e.agent] ?? 0); if (start - at > QUEUE_MAX) continue;
    const t: Trip = { id: String(e.id), agent: e.agent, kind: 'handover', start, from: deskSpot(e.agent), to: deskSpot(e.to_agent!), round: true, partner: e.to_agent! };
    free[e.agent] = start + tripLength(t); if (now >= t.start && now <= free[e.agent]) out.push(t);
  }
  return out;
}

// ── the café: where an idle agent may take a break. Never during a task, and a real task sends the agent straight back to the desk.
export interface Loc { at: 'desk' | 'cafe'; seat?: number; trip?: Trip }
export const cafeWanted = (key: string, view: AgentView | undefined, now: number) => key !== 'jarvis' && !!STATION[key] && (view?.state ?? 'idle') === 'idle' && inCafe(key, now);
export const pickSeat = (used: number[]) => CAFE_SEATS.findIndex((_, i) => !used.includes(i));
/** Advance one agent's place. Starts a walking trip when the wish changes; waits for a trip in progress to finish. */
export function stepLoc(prev: Loc | undefined, key: string, wanted: boolean, now: number, used: number[]): Loc {
  if (!prev) { const seat = wanted ? pickSeat(used) : -1; return seat >= 0 ? { at: 'cafe', seat } : { at: 'desk' }; }
  if (prev.trip && now < prev.trip.start + tripLength(prev.trip)) return prev;
  const here = prev.at === 'cafe';
  if (wanted && !here) { const seat = pickSeat(used); if (seat < 0) return { at: 'desk' }; return { at: 'cafe', seat, trip: { id: `c${key}${now}`, agent: key, kind: 'toCafe', start: now, from: deskSpot(key), to: cafeSpot(seat), round: false } }; }
  if (!wanted && here) return { at: 'desk', trip: { id: `d${key}${now}`, agent: key, kind: 'toDesk', start: now, from: cafeSpot(prev.seat ?? 0), to: deskSpot(key), round: false } };
  return prev.trip ? { at: prev.at, seat: prev.seat } : prev;
}
export const inTransit = (l: Loc | undefined, now: number) => !!l?.trip && now < l.trip.start + tripLength(l.trip);

export const CAFE_BUBBLES = ['Nice weather for windows ☀️', 'Another spotless day!', 'Coffee first, then the inbox ☕', 'Safety first, shine second.', 'Great crew today!', 'Water-fed pole season!', 'Anyone seen the quotation queue?', 'Solar panels love clean water 💧'];
export const cafeBubble = (key: string, now: number) => { const slot = Math.floor(now / 14_000), phase = (now % 14_000) / 14_000; return hash(`${key}:${slot}`) % 4 === 0 && phase < 0.28 ? CAFE_BUBBLES[hash(`${key}b${slot}`) % CAFE_BUBBLES.length] : null; };

/** JARVIS routes every new task: a brief pulse along the corridors to the room that receives it. */
export function pulses(events: HqEvent[], now: number): { room: Room; p: number; pts: Pt[]; id: string | number }[] {
  return events.filter((e) => e.kind === 'start' && !e.to_agent).flatMap((e) => {
    const r = roomOf(e.agent); const dt = now - Date.parse(e.at); if (!r || r === 'hub' || r === 'cafe' || dt < 0 || dt >= 1400) return [];
    return [{ room: r, p: dt / 1400, id: e.id, pts: [...hallPath('hub', r), { x: box(r).cx, y: box(r).doorY - 4 }] }];
  });
}

export type DoorLight = 'idle' | 'open' | 'amber' | 'green' | 'red';
export interface DoorState { open: boolean; light: DoorLight }
/** open = somebody really walks through it right now. Light: amber while someone waits for approval, red on a problem, green just after a finished task. */
export function doors(events: HqEvent[], views: Record<string, AgentView>, trips: TripState[], now: number): Record<Room, DoorState> {
  const res = {} as Record<Room, DoorState>;
  for (const r of ROOMS) {
    const mates = Object.keys(STATION).filter((k) => STATION[k].room === r), st = (s: AgentState) => mates.some((k) => views[k]?.state === s);
    const open = trips.some((t) => t.open[r]); const fresh = events.some((e) => e.kind === 'done' && roomOf(e.agent) === r && now - Date.parse(e.at) >= 0 && now - Date.parse(e.at) < 2500);
    res[r] = { open, light: st('error') ? 'red' : st('awaiting') ? 'amber' : open ? 'open' : fresh ? 'green' : 'idle' };
  }
  return res;
}
export function describeTrip(s: TripState): string {
  const a = agentByKey(s.trip.agent)?.name ?? s.trip.agent, b = s.trip.partner ? agentByKey(s.trip.partner)?.name ?? s.trip.partner : '';
  if (s.trip.kind === 'toCafe') return `${a} takes a break and walks to the café`;
  if (s.trip.kind === 'toDesk') return `${a} walks back to the desk for a new task`;
  return s.phase === 'prepare' ? `${a} picks up the task card for ${b}` : s.phase === 'out' ? `${a} walks the task to ${b}` : s.phase === 'handover' ? `${a} hands the task to ${b}` : `${a} walks back to the desk`;
}
