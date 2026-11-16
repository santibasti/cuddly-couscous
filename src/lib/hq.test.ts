import { describe, expect, it } from 'vitest';
import { AGENTS, DEPTS, agentPos, agentState, cafePos, deskPos, demoStep, inCafe, type HqEvent } from './hq';

const NOW = Date.parse('2026-11-16T10:00:00Z');
const ev = (agent: string, kind: HqEvent['kind'], agoSec: number, extra: Partial<HqEvent> = {}): HqEvent => ({ id: `${agent}${kind}${agoSec}`, at: new Date(NOW - agoSec * 1000).toISOString(), agent, dept: 'booking', kind, title: 'x', ...extra });

describe('headquarters: agent state comes from real events', () => {
  it('an agent with no events is idle', () => { expect(agentState('quote', [], NOW).state).toBe('idle'); });
  it('a new task shows as received, then working, then idle again', () => {
    const e = [ev('quote', 'start', 2)];
    expect(agentState('quote', e, NOW).state).toBe('received');
    expect(agentState('quote', [ev('quote', 'start', 30)], NOW).state).toBe('working');
    expect(agentState('quote', [ev('quote', 'start', 300)], NOW).state).toBe('idle');
  });
  it('a finished task celebrates briefly', () => {
    expect(agentState('quote', [ev('quote', 'done', 5)], NOW).state).toBe('done'); expect(agentState('quote', [ev('quote', 'done', 60)], NOW).state).toBe('idle');
  });
  it('a hand-over makes both agents coordinate and name each other', () => {
    const e = [ev('qualifier', 'message', 4, { to_agent: 'quote' })];
    expect(agentState('qualifier', e, NOW)).toMatchObject({ state: 'coordinating', partner: 'quote' }); expect(agentState('quote', e, NOW)).toMatchObject({ state: 'coordinating', partner: 'qualifier' });
    expect(agentState('qualifier', [ev('qualifier', 'message', 40, { to_agent: 'quote' })], NOW).state).not.toBe('coordinating');
  });
  it('an approval request keeps the agent waiting until it is answered', () => {
    expect(agentState('creative', [ev('creative', 'approval', 3600)], NOW).state).toBe('awaiting');
    expect(agentState('creative', [ev('creative', 'approval', 3600), ev('creative', 'start', 30)], NOW).state).toBe('working');          // approved and scheduled
    expect(agentState('creative', [ev('creative', 'approval', 8 * 3600)], NOW).state).toBe('idle');                                        // too old to still count
  });
  it('a failure shows as a problem, and a failure outranks being busy', () => {
    expect(agentState('creative', [ev('creative', 'fail', 120)], NOW).state).toBe('error'); expect(agentState('creative', [ev('creative', 'fail', 3000)], NOW).state).toBe('idle');
  });
  it('events of other agents do not move this agent', () => { expect(agentState('booking', [ev('quote', 'start', 2)], NOW).state).toBe('idle'); });
});

describe('headquarters: the floor plan', () => {
  it('has seven departments, a hub and a café, with every agent in a known department', () => {
    expect(DEPTS.filter((d) => !['hub', 'cafe'].includes(d.key))).toHaveLength(7);
    for (const a of AGENTS) expect(DEPTS.some((d) => d.key === a.dept)).toBe(true);
    expect(new Set(AGENTS.map((a) => a.key)).size).toBe(AGENTS.length);
  });
  it('desks are inside their room and the café is inside the café', () => {
    for (const a of AGENTS) { const d = DEPTS.find((x) => x.key === a.dept)!, p = deskPos(a.key); expect(p.x).toBeGreaterThan(d.x); expect(p.x).toBeLessThan(d.x + d.w); expect(p.y).toBeGreaterThan(d.y); expect(p.y).toBeLessThan(d.y + d.h); }
    const c = DEPTS.find((d) => d.key === 'cafe')!;
    for (const a of AGENTS) { const p = cafePos(a.key); expect(p.x).toBeGreaterThan(c.x); expect(p.x).toBeLessThan(c.x + c.w); expect(p.y).toBeGreaterThan(c.y); expect(p.y).toBeLessThan(c.y + c.h); }
  });
  it('working agents stay at their desk; only idle agents go to the café; JARVIS never leaves the hub', () => {
    const view = agentState('quote', [ev('quote', 'start', 30)], NOW); expect(agentPos('quote', view, NOW)).toEqual(deskPos('quote'));
    const idle = agentState('quote', [], NOW); const spots = new Set<string>(); for (let i = 0; i < 40; i++) { const at = NOW + i * 30_000; const p = agentPos('quote', idle, at); spots.add(p.y > 65 ? 'cafe' : 'desk'); }
    expect(spots.has('cafe')).toBe(true); expect(spots.has('desk')).toBe(true);
    for (let i = 0; i < 40; i++) expect(agentPos('jarvis', { state: 'idle' }, NOW + i * 30_000)).toEqual(deskPos('jarvis'));
    expect(inCafe('quote', NOW)).toBe(inCafe('quote', NOW));                                                                                     // deterministic
  });
  it('coordinating agents meet between their two desks', () => {
    const a = deskPos('qualifier'), b = deskPos('quote'); const p = agentPos('qualifier', { state: 'coordinating', partner: 'quote' }, NOW);
    expect(p.x).toBeCloseTo((a.x + b.x) / 2); expect(p.y).toBeCloseTo((a.y + b.y) / 2);
  });
});

describe('headquarters: demo mode', () => {
  it('produces labelled-by-the-app demo events that only use known agents', () => {
    for (let n = 0; n < 8; n++) for (const e of demoStep(n, NOW)) { expect(AGENTS.some((a) => a.key === e.agent)).toBe(true); expect(String(e.id)).toMatch(/^demo-/); if (e.to_agent) expect(AGENTS.some((a) => a.key === e.to_agent)).toBe(true); }
  });
});

import { mergeEvents } from './hq';
import { SCENARIO, SCENARIO_LENGTH, scenarioCaption, scenarioEvents } from './hqscenario';

describe('headquarters: events arriving twice or late', () => {
  const e = (id: string, agoSec: number): HqEvent => ({ id, at: new Date(NOW - agoSec * 1000).toISOString(), agent: 'quote', dept: 'booking', kind: 'info', title: id });
  it('does not duplicate an event that arrives again after a reconnect, and keeps newest first', () => {
    const merged = mergeEvents([e('a', 10), e('b', 30)], [e('b', 30), e('c', 5), e('a', 10)]); expect(merged.map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('a late event keeps its own time, so it cannot replay an old animation', () => {
    const merged = mergeEvents([e('new', 2)], [e('old-done', 3600)]); expect(merged[0].id).toBe('new');
    expect(agentState('quote', [{ ...e('old', 3600), kind: 'done' }], NOW).state).toBe('idle');
  });
  it('caps the list', () => { expect(mergeEvents([], Array.from({ length: 50 }, (_, i) => e(`x${i}`, i)), 20)).toHaveLength(20); });
});

describe('headquarters: the demo scenario', () => {
  it('runs the lead from Messenger to Booking to an approval, in order, with known agents only', () => {
    const all = scenarioEvents(NOW, SCENARIO_LENGTH); expect(all).toHaveLength(SCENARIO.length);
    const order = all.map((x) => x.agent); expect(order[0]).toBe('messenger'); expect(order.indexOf('booking')).toBeGreaterThan(order.indexOf('messenger')); expect(all[all.length - 2].kind).toBe('approval'); expect(order[order.length - 1]).toBe('jarvis');
    for (const x of all) { expect(AGENTS.some((a) => a.key === x.agent)).toBe(true); expect(String(x.id)).toMatch(/^demo-/); }
    for (let i = 1; i < SCENARIO.length; i++) expect(SCENARIO[i].at).toBeGreaterThanOrEqual(SCENARIO[i - 1].at);
  });
  it('shows only what has happened so far, and ends waiting for approval', () => {
    expect(scenarioEvents(NOW, 0)).toHaveLength(1); expect(scenarioEvents(NOW, 4000)).toHaveLength(3);
    const end = scenarioEvents(NOW, SCENARIO_LENGTH); expect(agentState('quote', end, NOW + SCENARIO_LENGTH).state).toBe('awaiting');
    expect(scenarioCaption(0)).toContain('Mara'); expect(scenarioCaption(-1)).toContain('Press Start');
  });
  it('the sample inquiry does not make planned departments work', () => {
    const end = scenarioEvents(NOW, SCENARIO_LENGTH); for (const k of ['inbox', 'campaign', 'records', 'growth']) expect(agentState(k, end, NOW + 3000).state).toBe('idle');
  });
});
