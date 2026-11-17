import { describe, expect, it } from 'vitest';
import { AGENTS } from './hq';
import { LOOKS, lookOf } from './botlook';

describe('the robot squad', () => {
  it('gives every agent a look, and keeps unknown agents safe', () => {
    for (const a of AGENTS) expect(LOOKS[a.key], a.key).toBeDefined(); expect(lookOf('nobody').head).toBe('sphere');
  });
  it('is varied: no two neighbours in a department look the same, and many head, face and body shapes are in use', () => {
    const sig = (k: string) => JSON.stringify(lookOf(k));
    for (const dept of new Set(AGENTS.map((a) => a.dept))) { const m = AGENTS.filter((a) => a.dept === dept).map((a) => sig(a.key)); expect(new Set(m).size, dept).toBe(m.length); }
    const all = AGENTS.map((a) => lookOf(a.key)); expect(new Set(all.map((l) => l.head)).size).toBeGreaterThanOrEqual(5); expect(new Set(all.map((l) => l.face)).size).toBeGreaterThanOrEqual(5); expect(new Set(all.map((l) => l.body)).size).toBeGreaterThanOrEqual(4); expect(new Set(all.map((l) => l.feet)).size).toBe(3);
  });
});
