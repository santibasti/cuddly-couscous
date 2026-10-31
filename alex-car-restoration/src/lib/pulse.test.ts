import { describe, expect, it } from 'vitest';
import { shopPulse } from './pulse';
import { buildSeed } from './seed';
import { reducer } from './store';

const TODAY = '2026-10-26';

describe('shopPulse', () => {
  const d = buildSeed(TODAY);
  it('counts every active job once and keeps the score between 0 and 100', () => {
    const p = shopPulse(d, TODAY);
    expect(p.active).toBe(8);
    expect(p.health.onTrack + p.health.atRisk + p.health.blocked + p.health.late).toBe(p.active);
    expect(p.score).toBeGreaterThanOrEqual(0);
    expect(p.score).toBeLessThanOrEqual(100);
    expect(p.needYou).toBe(p.health.blocked + p.health.late);
  });
  it('scores 100 when nothing is active', () => {
    let s = d;
    for (const pr of d.projects.filter((x) => x.status === 'active')) s = reducer(s, { type: 'setProjectStatus', id: pr.id, status: 'on_hold' });
    expect(shopPulse(s, TODAY).score).toBe(100);
  });
  it('scores lower when a job slips past its date', () => {
    const before = shopPulse(d, TODAY).score;
    const p = d.projects.find((x) => x.status === 'active' && x.targetDate >= TODAY)!;
    const s = reducer(d, { type: 'updateProject', id: p.id, patch: { targetDate: '2026-10-01' } });
    expect(shopPulse(s, TODAY).score).toBeLessThanOrEqual(before);
  });
});
