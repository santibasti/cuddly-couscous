import { describe, expect, it } from 'vitest';
import { AGENTS, DEPTS } from './hq';
import { EXIT, NODES, SEATS, advance, cafeSpot, nextWander, routeBetween, walkNodes, wantFor } from './hqsim';

describe('headquarters robots: seats, walkways and motion', () => {
  it('every agent has a seat on the picture and a department exit', () => {
    for (const a of AGENTS) { const s = SEATS[a.key]; expect(s, a.key).toBeTruthy(); expect(s.x).toBeGreaterThan(0); expect(s.x).toBeLessThan(100); expect(s.y).toBeGreaterThan(0); expect(s.y).toBeLessThan(100); }
    for (const d of DEPTS.filter((x) => x.key !== 'cafe')) expect(NODES[EXIT[d.key]], d.key).toBeTruthy();
  });
  it('the walkways connect every department with every other', () => {
    const ex = Object.values(EXIT); for (const a of ex) for (const b of ex) { const w = walkNodes(a, b); expect(w[0]).toBe(a); expect(w[w.length - 1]).toBe(b); }
    expect(walkNodes('emailX', 'boardX').length).toBeGreaterThan(2);
  });
  it('a route goes from seat to seat through the exits and has no zero-length steps', () => {
    const r = routeBetween('inbox', SEATS.inbox, SEATS.quote, 'quote'); expect(r[0]).toEqual(SEATS.inbox); expect(r[r.length - 1]).toEqual(SEATS.quote); expect(r.length).toBeGreaterThan(3);
    for (let i = 1; i < r.length; i++) expect(Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y)).toBeGreaterThan(0.01);
  });
  it('every agent has its own café spot', () => { const keys = new Set(AGENTS.filter((a) => a.key !== 'jarvis').map((a) => { const p = cafeSpot(a.key); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; })); expect(keys.size).toBe(AGENTS.length - 1); });
  it('real work keeps an agent at its seat; hand-overs make it walk to the partner; idle agents may wander', () => {
    expect(wantFor({ state: 'working' }, 'quote', 'cafe')).toMatchObject({ at: 'seat', pose: 'type' });
    expect(wantFor({ state: 'awaiting' }, 'creative', 'cafe')).toMatchObject({ at: 'seat', pose: 'wait' });
    expect(wantFor({ state: 'done' }, 'booking', 'plaza').pose).toBe('cheer'); expect(wantFor({ state: 'error' }, 'booking', 'plaza').pose).toBe('shake');
    expect(wantFor({ state: 'coordinating', partner: 'quote' }, 'qualifier', 'seat')).toMatchObject({ at: 'partner', partnerKey: 'quote' });
    expect(wantFor({ state: 'idle' }, 'quote', 'cafe').at).toBe('cafe'); expect(wantFor({ state: 'idle' }, 'quote', 'seat').at).toBe('seat'); expect(wantFor({ state: 'idle' }, 'jarvis', 'cafe').at).toBe('seat');
  });
  it('idle agents decide again every few seconds; planned desks roam more than live ones', () => {
    let live = 0, planned = 0; for (let n = 0; n < 200; n++) { if (nextWander('quote', true, n).where !== 'seat') live++; if (nextWander('photo', false, n).where !== 'seat') planned++; expect(nextWander('quote', true, n).after).toBeGreaterThan(6); }
    expect(planned).toBeGreaterThan(live);
  });
  it('a walker moves along its route at its speed and arrives', () => {
    let s = { pos: { x: 0, y: 0 }, route: [{ x: 10, y: 0 }, { x: 10, y: 10 }], moving: true, dir: 0 };
    s = advance(s.pos, s.route, 1, 5); expect(s.pos).toEqual({ x: 5, y: 0 }); expect(s.moving).toBe(true); expect(s.dir).toBe(1);
    s = advance(s.pos, s.route, 1, 8); expect(s.pos.x).toBeCloseTo(10); expect(s.pos.y).toBeCloseTo(3); s = advance(s.pos, s.route, 5, 5); expect(s.pos).toEqual({ x: 10, y: 10 }); expect(s.moving).toBe(false);
  });
});
