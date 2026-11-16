import { describe, expect, it } from 'vitest';
import { agentState, type HqEvent } from './hq';
import { SCENARIO, scenarioEvents } from './hqscenario';
import { doors, flightLength, flights, pulses, route } from './hqwing';

const base = Date.parse('2026-05-04T08:00:00Z');
const ev = (o: Partial<HqEvent>): HqEvent => ({ id: 'e', at: new Date(base).toISOString(), agent: 'messenger', dept: 'desk', kind: 'message', title: 't', ...o });
const views = (events: HqEvent[], now: number) => Object.fromEntries(['messenger', 'qualifier', 'quote', 'booking', 'scheduler', 'joborders', 'jarvis', 'support', 'router'].map((k) => [k, agentState(k, events, now)]));

describe('hallway hand-over', () => {
  it('routes through both doors and the corridor', () => {
    const p = route('messenger', 'booking'); expect(p[0]).toEqual({ x: 120, y: 210 }); expect(p.some((q) => q.y === 525)).toBe(true); expect(p[p.length - 1]).toEqual({ x: 1080, y: 210 });
  });
  it('opens the sender door first, then the receiver door, then both close', () => {
    const e = [ev({ to_agent: 'booking' })]; let sender = -1, receiver = -1, bothOpen = false, lastOpen = 0;
    for (let t = 0; t <= flightLength('messenger', 'booking'); t += 20) { const d = doors(e, views(e, base + t), base + t); if (d.desk.open && sender < 0) sender = t; if (d.booking.open && receiver < 0) receiver = t; if (d.desk.open && d.booking.open) bothOpen = true; if (d.desk.open || d.booking.open) lastOpen = t; }
    expect(sender).toBeGreaterThan(0); expect(receiver).toBeGreaterThan(sender); expect(bothOpen).toBe(false); expect(lastOpen).toBeLessThan(flightLength('messenger', 'booking'));
    const end = base + flightLength('messenger', 'booking') + 50; expect(doors(e, views(e, end), end).booking.open).toBe(false);
  });
  it('does not open a door without an event, nor for hand-overs inside one room', () => {
    const idle = doors([], views([], base), base); expect(idle.desk.open || idle.booking.open || idle.hub.open).toBe(false);
    const inside = [ev({ agent: 'booking', dept: 'booking', to_agent: 'scheduler' })]; const d = doors(inside, views(inside, base + 700), base + 700); expect(d.booking.open).toBe(false); expect(flights(inside, base + 700)[0].same).toBe(true);
  });
  it('shows the packet only while the flight lasts, and moves it forward', () => {
    const e = [ev({ to_agent: 'booking' })]; expect(flights(e, base - 1)).toHaveLength(0); const a = flights(e, base + 1200)[0].pos!, b = flights(e, base + 1800)[0].pos!; expect(a).not.toEqual(b); expect(flights(e, base + 60_000)).toHaveLength(0);
  });
  it('amber light waits for approval, and a start event pulses JARVIS to that room', () => {
    const e = [ev({ agent: 'quote', dept: 'booking', kind: 'approval' })]; expect(doors(e, views(e, base + 50_000), base + 50_000).booking.light).toBe('amber');
    expect(pulses([ev({ agent: 'booking', dept: 'booking', kind: 'start' })], base + 300)[0].room).toBe('booking'); expect(pulses([ev({ agent: 'booking', dept: 'booking', kind: 'start' })], base + 5000)).toHaveLength(0);
  });
  it('the sample inquiry opens each door only for its hand-over', () => {
    const last = SCENARIO[SCENARIO.length - 1].at + 4000; let opens = 0, was = { desk: false, booking: false };
    for (let t = 0; t <= last; t += 50) { const e = scenarioEvents(base, t); const d = doors(e, views(e, base + t), base + t); if (d.desk.open && !was.desk) opens++; if (d.booking.open && !was.booking) opens++; was = { desk: d.desk.open, booking: d.booking.open }; }
    expect(opens).toBe(2);   // the Messenger door once, the Booking door once
  });
});
