import { describe, expect, it } from 'vitest';
import { agentState, type HqEvent } from './hq';
import { SCENARIO, scenarioEvents } from './hqscenario';
import { CAFE_SEATS, ROOMS, STATION, box, cafeSpot, cafeWanted, deskSpot, doors, handoverTrips, hallPath, inTransit, pickSeat, pulses, routeBetween, stepLoc, tripLength, tripState } from './hqwing';

const base = Date.parse('2026-05-04T08:00:00Z');
const ev = (o: Partial<HqEvent>): HqEvent => ({ id: 'e', at: new Date(base).toISOString(), agent: 'messenger', dept: 'desk', kind: 'message', title: 't', ...o });
const views = (events: HqEvent[], now: number) => Object.fromEntries(Object.keys(STATION).map((k) => [k, agentState(k, events, now)]));
const states = (events: HqEvent[], t: number) => handoverTrips(events, base + t).map((x) => tripState(x, base + t)!).filter(Boolean);

describe('the building', () => {
  it('has nine rooms and every roster agent except café guests has a desk in its own room', () => {
    expect(ROOMS).toHaveLength(9); expect(STATION.messenger.room).toBe('desk'); expect(STATION.cfo.room).toBe('board'); expect(STATION.inbox.room).toBe('email'); expect(STATION.records.room).toBe('hr');
    for (const k of Object.keys(STATION)) { const b = box(STATION[k].room); expect(STATION[k].x).toBeGreaterThan(b.x); expect(STATION[k].x).toBeLessThan(b.x + b.w); }
  });
  it('joins rows through a connector and keeps the way through the door free', () => {
    const p = hallPath('desk', 'board'); expect(p.length).toBeGreaterThan(3); expect(p[0].y).toBe(box('desk').hallY); expect(p[p.length - 1].y).toBe(box('board').hallY);
    const r = routeBetween(deskSpot('messenger'), deskSpot('booking')); expect(r.doors.map((d) => d.room)).toEqual(['desk', 'booking']);
    expect(routeBetween(deskSpot('messenger'), deskSpot('qualifier')).doors).toHaveLength(0);
  });
});

describe('hand-over walk', () => {
  const len = tripLength(handoverTrips([ev({ to_agent: 'booking' })], base)[0]);
  it('opens the sender door, then the receiver door, never both, and everything is shut at the end', () => {
    const e = [ev({ to_agent: 'booking' })]; let sender = -1, receiver = -1, both = false;
    for (let t = 0; t <= len; t += 20) { const d = doors(e, views(e, base + t), states(e, t), base + t); if (d.desk.open && sender < 0) sender = t; if (d.booking.open && receiver < 0) receiver = t; if (d.desk.open && d.booking.open) both = true; }
    expect(sender).toBeGreaterThan(0); expect(receiver).toBeGreaterThan(sender); expect(both).toBe(false);
    const end = len + 50; expect(doors(e, views(e, base + end), states(e, end), base + end).booking.open).toBe(false);
  });
  it('does not open a door without an event, nor for a hand-over inside one room', () => {
    const idle = doors([], views([], base), [], base); expect(ROOMS.some((r) => idle[r].open)).toBe(false);
    const inside = [ev({ agent: 'booking', dept: 'booking', to_agent: 'scheduler' })]; const d = doors(inside, views(inside, base + 3000), states(inside, 3000), base + 3000); expect(d.booking.open).toBe(false);
  });
  it('the walker leaves, arrives, hands over and returns; the sender seat is empty meanwhile', () => {
    const e = [ev({ to_agent: 'booking' })]; expect(handoverTrips(e, base - 1)).toHaveLength(0); expect(handoverTrips(e, base + len + 5000)).toHaveLength(0);
    const a = states(e, 3000)[0], b = states(e, 6000)[0]; expect(a.pos).not.toEqual(b.pos); expect(a.away).toBe(true); expect(states(e, 20)[0].away).toBe(false);
    const hand = states(e, len - 4000).find((s) => s.phase === 'handover'); expect(hand === undefined || hand.moving === false).toBe(true);
  });
  it('faces the way it walks: along the corridor sideways, up a door away from the viewer', () => {
    const e = [ev({ to_agent: 'booking' })]; const seen = new Set<string>(); for (let t = 0; t < len; t += 100) { const s = states(e, t)[0]; if (s?.moving) seen.add(Math.abs(s.dir.x) > 0 ? (s.dir.x > 0 ? 'right' : 'left') : s.dir.y < 0 ? 'back' : 'front'); }
    expect(seen.has('right')).toBe(true); expect(seen.has('front')).toBe(true); expect(seen.has('back')).toBe(true);
  });
  it('amber light waits for approval; a start event pulses JARVIS to that room', () => {
    const e = [ev({ agent: 'quote', dept: 'booking', kind: 'approval' })]; expect(doors(e, views(e, base + 50_000), [], base + 50_000).booking.light).toBe('amber');
    const st = [ev({ agent: 'booking', dept: 'booking', kind: 'start' })]; expect(pulses(st, base + 300)[0].room).toBe('booking'); expect(pulses(st, base + 5000)).toHaveLength(0);
  });
  it('the sample inquiry opens each door only twice: out and back', () => {
    let opens = 0; const was: Record<string, boolean> = {};
    for (let t = 0; t <= 60_000; t += 100) { const e = scenarioEvents(base, t), d = doors(e, views(e, base + t), states(e, t), base + t); for (const r of ['desk', 'booking'] as const) { if (d[r].open && !was[r]) opens++; was[r] = d[r].open; } }
    expect(opens).toBe(4); expect(SCENARIO.length).toBeGreaterThan(5);
  });
});

describe('the café', () => {
  it('never takes an agent who is working or waiting, and never JARVIS', () => {
    const w = agentState('quote', [ev({ agent: 'quote', dept: 'booking', kind: 'start' })], base + 1000); let any = false; for (let t = 0; t < 600_000; t += 1000) any = any || cafeWanted('quote', w, base + t); expect(any).toBe(false);
    let j = false; for (let t = 0; t < 600_000; t += 1000) j = j || cafeWanted('jarvis', { state: 'idle' }, base + t); expect(j).toBe(false);
  });
  it('walks an idle agent to a free seat, and straight back when a task arrives', () => {
    const t0 = base; const l1 = stepLoc({ at: 'desk' }, 'support', true, t0, []); expect(l1.at).toBe('cafe'); expect(l1.seat).toBe(0); expect(l1.trip!.kind).toBe('toCafe'); expect(inTransit(l1, t0 + 1000)).toBe(true);
    const arrived = t0 + tripLength(l1.trip!) + 10; expect(inTransit(l1, arrived)).toBe(false);
    const l2 = stepLoc(stepLoc(l1, 'support', true, arrived, [0]), 'support', false, arrived + 5, [0]); expect(l2.at).toBe('desk'); expect(l2.trip!.kind).toBe('toDesk'); expect(l2.trip!.from).toEqual(cafeSpot(0));
    expect(stepLoc(l1, 'support', false, t0 + 500, [0])).toBe(l1);        // a trip in progress is finished first
  });
  it('seats are not shared, and a full café keeps the next agent at the desk', () => {
    expect(pickSeat([0, 1])).toBe(2); expect(pickSeat(CAFE_SEATS.map((_, i) => i))).toBe(-1); expect(stepLoc({ at: 'desk' }, 'sam', true, base, CAFE_SEATS.map((_, i) => i)).at).toBe('desk');
  });
});

describe('real backend events', () => {
  // rows exactly as the agent_events table returns them (numeric id, microsecond timestamp with an offset), for a Facebook inquiry that becomes a quotation
  const row = (id: number, agent: string, dept: string, kind: HqEvent['kind'], to: string | null, off = 0): HqEvent => ({ id, at: new Date(base + off).toISOString().replace('Z', '123+00:00').replace('.000123', '.000123'), agent, dept, kind, title: 'x', ref: null, to_agent: to });
  it('turns the inquiry trigger events into one walk from the qualifier to the quotation desk', () => {
    const e = [row(1, 'messenger', 'desk', 'start', null), row(2, 'qualifier', 'desk', 'message', 'quote')];
    const trips = handoverTrips(e, base + 3000); expect(trips).toHaveLength(1); expect(trips[0].agent).toBe('qualifier'); expect(trips[0].to.room).toBe('booking');
    expect(pulses(e, base + 300)[0].room).toBe('desk'); expect(agentState('messenger', e, base + 3000).state).toBe('received'); expect(agentState('messenger', e, base + 20_000).state).toBe('working');
  });
  it('one person walks one task at a time; a burst waits its turn, a stale one is dropped', () => {
    const e = [row(1, 'qualifier', 'desk', 'message', 'quote', 0), row(2, 'qualifier', 'desk', 'message', 'booking', 100)];
    const len = tripLength(handoverTrips(e, base + 10)[0]); expect(handoverTrips(e, base + 3000).map((t) => t.id)).toEqual(['1']);
    const second = handoverTrips(e, base + len + 1500); expect(second.map((t) => t.id)).toEqual(['2']); expect(second[0].start).toBeGreaterThanOrEqual(base + len);
    expect(handoverTrips([row(3, 'qualifier', 'desk', 'message', 'quote', -200_000)], base)).toHaveLength(0);
  });
  it('ignores events of agents that have no desk in the building, and never opens a door for them', () => {
    const e = [row(5, 'nobody', 'desk', 'message', 'quote'), row(6, 'qualifier', 'desk', 'message', 'ghost')]; expect(handoverTrips(e, base + 1000)).toHaveLength(0);
  });
  it('a problem or an approval turns the door light, without any walk', () => {
    const f = [row(7, 'creative', 'creative', 'fail', null)]; expect(doors(f, views(f, base + 1000), [], base + 1000).creative.light).toBe('red');
    const a = [row(8, 'creative', 'creative', 'approval', null)]; expect(doors(a, views(a, base + 1000), [], base + 1000).creative.light).toBe('amber');
  });
});
