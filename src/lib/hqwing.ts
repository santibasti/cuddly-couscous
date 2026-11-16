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

export interface Flight { id: string | number; from: string; to: string; fromRoom: Room; toRoom: Room; same: boolean; at: number; dt: number; pos: Pt | null; trail: Pt[]; doorFrom: boolean; doorTo: boolean; phase: 'prepare' | 'travel' | 'arrive' }
const DELAY = 600, SPEED = 0.62, DELAY_IN = 250, SPEED_IN = 0.45, LINGER = 700, DOOR_LEAD = 320, DOOR_LAG = 520;
export const flightLength = (from: string, to: string) => { const p = route(from, to); const c = lens(p); const same = STATION[from]?.room === STATION[to]?.room; return (same ? DELAY_IN : DELAY) + c[c.length - 1] / (same ? SPEED_IN : SPEED) + LINGER; };

/** Hand-overs that are happening at `now` (an event with a receiver, started less than one flight ago). */
export function flights(events: HqEvent[], now: number): Flight[] {
  const out: Flight[] = [];
  for (const e of events) {
    if (!e.to_agent) continue; const a = STATION[e.agent], b = STATION[e.to_agent]; if (!a || !b) continue;
    const at = Date.parse(e.at), dt = now - at; if (dt < 0 || dt > flightLength(e.agent, e.to_agent)) continue;
    const pts = route(e.agent, e.to_agent), c = lens(pts), same = a.room === b.room, delay = same ? DELAY_IN : DELAY, speed = same ? SPEED_IN : SPEED, total = c[c.length - 1];
    const d = Math.min(Math.max((dt - delay) * speed, 0), total);
    const pos = dt < delay - 150 ? null : along(pts, d);
    const trail = dt < delay ? [] : [...pts.filter((_, i) => c[i] < d), pos!];
    let doorFrom = false, doorTo = false;
    if (!same) {
      const out0 = (delay + c[2] / speed) - DOOR_LEAD, out1 = delay + c[3] / speed + DOOR_LAG, in0 = delay + c[4] / speed - DOOR_LEAD, in1 = delay + c[5] / speed + DOOR_LAG;
      doorFrom = dt >= out0 - 0 && dt <= out1; doorTo = dt >= in0 && dt <= in1;
    }
    out.push({ id: e.id, from: e.agent, to: e.to_agent, fromRoom: a.room, toRoom: b.room, same, at, dt, pos, trail, doorFrom, doorTo, phase: dt < delay ? 'prepare' : d >= total ? 'arrive' : 'travel' });
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
  return f.phase === 'prepare' ? `${a} prepares a task card for ${b}` : f.phase === 'travel' ? (f.same ? `${a} passes the task to ${b}` : `Task card from ${a} travels along the corridor to ${b}`) : `${b} receives the task from ${a}`;
}
