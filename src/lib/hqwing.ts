// "Living Office V2" geometry and door/hand-over choreography. Everything here is a pure function of the real (or demo) events and the clock:
// a door opens, a packet travels and a pulse fires ONLY because an event says so. Nothing is decided by an animation timer.
import { agentByKey, type AgentState, type AgentView, type HqEvent } from './hq';

export type Room = 'desk' | 'hub' | 'booking';
export const WING_ROOMS: Room[] = ['desk', 'hub', 'booking'];
export const ROOM_NAME: Record<Room, string> = { desk: 'Messenger Inquiry Desk', hub: 'JARVIS Central Atrium', booking: 'Booking, Quotation & Scheduling' };
export const ROOM_BOX: Record<Room, { x: number; w: number }> = { desk: { x: 20, w: 380 }, hub: { x: 420, w: 360 }, booking: { x: 800, w: 380 } };
export const AISLE: Record<Room, number> = { desk: 210, hub: 600, booking: 990 };         // centre aisle of each room = the line to its door
export const FLOOR_Y = 410, DOOR_Y = 440, HALL_Y = 525;                                    // inside the room · the glass wall · the middle of the corridor
export const STATION: Record<string, { room: Room; x: number; y: number; side: 1 | -1 }> = {
  messenger: { room: 'desk', x: 120, y: 240, side: 1 }, qualifier: { room: 'desk', x: 300, y: 240, side: -1 }, support: { room: 'desk', x: 120, y: 372, side: 1 }, router: { room: 'desk', x: 300, y: 372, side: -1 },
  quote: { room: 'booking', x: 900, y: 240, side: 1 }, booking: { room: 'booking', x: 1080, y: 240, side: -1 }, scheduler: { room: 'booking', x: 900, y: 372, side: 1 }, joborders: { room: 'booking', x: 1080, y: 372, side: -1 },
  jarvis: { room: 'hub', x: 500, y: 372, side: 1 },
};
export const roomOf = (agent: string): Room | null => { const d = agentByKey(agent)?.dept; return d === 'desk' || d === 'booking' || d === 'hub' ? d : null; };

type Pt = { x: number; y: number };
const dedupe = (p: Pt[]) => p.filter((q, i) => i === 0 || q.x !== p[i - 1].x || q.y !== p[i - 1].y);
/** The way a task card travels: desk → centre aisle → door → corridor → door → aisle → desk. */
export function route(from: string, to: string): Pt[] {
  const a = STATION[from], b = STATION[to]; if (!a || !b) return [];
  const pa = { x: a.x, y: a.y - 30 }, pb = { x: b.x, y: b.y - 30 };
  if (a.room === b.room) { const cx = AISLE[a.room]; return dedupe([pa, { x: cx, y: pa.y }, { x: cx, y: pb.y }, pb]); }
  const ca = AISLE[a.room], cb = AISLE[b.room];
  return dedupe([pa, { x: ca, y: pa.y }, { x: ca, y: FLOOR_Y }, { x: ca, y: HALL_Y }, { x: cb, y: HALL_Y }, { x: cb, y: FLOOR_Y }, { x: cb, y: pb.y }, pb]);
}
const lens = (p: Pt[]) => { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y)); return c; };
export function along(p: Pt[], d: number): Pt { const c = lens(p); if (d <= 0) return p[0]; if (d >= c[c.length - 1]) return p[p.length - 1]; let i = 1; while (c[i] < d) i++; const f = (d - c[i - 1]) / (c[i] - c[i - 1]); return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * f, y: p[i - 1].y + (p[i].y - p[i - 1].y) * f }; }

export interface Flight { id: string | number; from: string; to: string; fromRoom: Room; toRoom: Room; same: boolean; at: number; dt: number; pos: Pt | null; dir: Pt; moving: boolean; carrying: boolean; away: boolean; doorFrom: boolean; doorTo: boolean; phase: 'prepare' | 'out' | 'handover' | 'back' }
// The sender picks up the task card, walks it to the receiver, hands it over and walks back. A calm walking pace (170 px/s) with plenty of ease at the start and end.
export const WALK = 0.14, RAMP = 500, STAND = 800, HAND = 1100, SETTLE = 500, LEAD = 450, LAG = 650;
const legs = (from: string, to: string) => { const p = route(from, to), c = lens(p); return { p, c, total: c[c.length - 1], T: c[c.length - 1] / WALK + RAMP }; };
// constant walking speed, with a short gentle start and stop (no sliding feet): distance walked after t ms of a trip of T ms, and its inverse
const walked = (t: number, T: number) => { const S = WALK, R = RAMP; if (t <= 0) return 0; if (t >= T) return S * (T - R); if (t < R) return (S * t * t) / (2 * R); if (t > T - R) return S * (T - R) - (S * (T - t) * (T - t)) / (2 * R); return S * (R / 2 + (t - R)); };
const timeAt = (d: number, T: number) => { const S = WALK, R = RAMP, tot = S * (T - R); if (d <= 0) return 0; if (d >= tot) return T; if (d < (S * R) / 2) return Math.sqrt((2 * d * R) / S); if (d > tot - (S * R) / 2) return T - Math.sqrt((2 * (tot - d) * R) / S); return R / 2 + d / S; };
export const flightLength = (from: string, to: string) => { const { T } = legs(from, to); return STAND + T + HAND + T + SETTLE; };

/** Hand-overs that are happening at `now`: an event with a receiver starts a walk that lasts one flight. */
export function flights(events: HqEvent[], now: number): Flight[] {
  const out: Flight[] = [];
  for (const e of events) {
    if (!e.to_agent) continue; const a = STATION[e.agent], b = STATION[e.to_agent]; if (!a || !b) continue;
    const at = Date.parse(e.at), dt = now - at; if (dt < 0 || dt > flightLength(e.agent, e.to_agent)) continue;
    const { p, c, total, T } = legs(e.agent, e.to_agent), same = a.room === b.room, t0 = STAND, t1 = STAND + T, t2 = t1 + HAND, t3 = t2 + T;
    const phase: Flight['phase'] = dt < t0 ? 'prepare' : dt < t1 ? 'out' : dt < t2 ? 'handover' : 'back';
    const d = dt < t0 ? 0 : dt < t1 ? walked(dt - t0, T) : dt < t2 ? total : dt < t3 ? total - walked(dt - t2, T) : 0;
    const pos = along(p, d), ahead = along(p, Math.min(total, d + 6)), behind = along(p, Math.max(0, d - 6));
    const dir = { x: Math.sign(Math.round((ahead.x - behind.x) * 10) / 10) * (phase === 'back' ? -1 : 1), y: Math.sign(Math.round((ahead.y - behind.y) * 10) / 10) * (phase === 'back' ? -1 : 1) };
    const moving = (phase === 'out' && dt > t0 + 30 && dt < t1 - 30) || (phase === 'back' && dt > t2 + 30 && dt < t3 - 30);
    // time the walker is at path distance x (out trip and return trip), to open the doors just before and close them just after
    const tOut = (x: number) => t0 + timeAt(x, T); const tBack = (x: number) => t2 + (T - timeAt(x, T));
    let doorFrom = false, doorTo = false;
    if (!same) {
      doorFrom = (dt >= tOut(c[2]) - LEAD && dt <= tOut(c[3]) + LAG) || (dt >= tBack(c[3]) - LEAD && dt <= tBack(c[2]) + LAG);
      doorTo = (dt >= tOut(c[4]) - LEAD && dt <= tOut(c[5]) + LAG) || (dt >= tBack(c[5]) - LEAD && dt <= tBack(c[4]) + LAG);
    }
    out.push({ id: e.id, from: e.agent, to: e.to_agent, fromRoom: a.room, toRoom: b.room, same, at, dt, pos, dir, moving, carrying: dt >= t0 && dt < t2 + HAND * 0.45, away: dt >= t0 - 150 && dt < t3, doorFrom, doorTo, phase });
  }
  return out;
}

/** JARVIS routes every new task: a brief pulse along the corridor to the room that receives it. */
export function pulses(events: HqEvent[], now: number): { room: Room; p: number; id: string | number }[] {
  return events.filter((e) => e.kind === 'start' && !e.to_agent).flatMap((e) => { const r = roomOf(e.agent); const dt = now - Date.parse(e.at); return r && r !== 'hub' && dt >= 0 && dt < 1100 ? [{ room: r, p: dt / 1100, id: e.id }] : []; });
}

export type DoorLight = 'idle' | 'open' | 'amber' | 'green' | 'red';
export interface DoorState { open: boolean; light: DoorLight }
/** The doors. open = a real hand-over passes through it right now. Light: amber while someone waits for approval, red on a problem, green just after a finished task. */
export function doors(events: HqEvent[], views: Record<string, AgentView>, now: number): Record<Room, DoorState> {
  const fl = flights(events, now).filter((f) => !f.same); const res = {} as Record<Room, DoorState>;
  for (const r of WING_ROOMS) {
    const mates = Object.keys(STATION).filter((k) => STATION[k].room === r);
    const open = fl.some((f) => (f.fromRoom === r && f.doorFrom) || (f.toRoom === r && f.doorTo));
    const st = (s: AgentState) => mates.some((k) => views[k]?.state === s);
    const fresh = events.some((e) => e.kind === 'done' && roomOf(e.agent) === r && now - Date.parse(e.at) >= 0 && now - Date.parse(e.at) < 2500);
    res[r] = { open, light: st('error') ? 'red' : st('awaiting') ? 'amber' : open ? 'open' : fresh ? 'green' : 'idle' };
  }
  return res;
}

/** One-line description of what the corridor is doing, for screen readers and the caption. */
export function describeFlight(f: Flight): string {
  const a = agentByKey(f.from)?.name ?? f.from, b = agentByKey(f.to)?.name ?? f.to;
  return f.phase === 'prepare' ? `${a} picks up the task card for ${b}` : f.phase === 'out' ? `${a} walks the task to ${b}${f.same ? '' : ' through the corridor'}` : f.phase === 'handover' ? `${a} hands the task to ${b}` : `${a} walks back to the desk`;
}
