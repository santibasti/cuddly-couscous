import { describe, expect, it } from 'vitest';
import { buildSeed } from './seed';
import { jobCrew } from './logic';

const d = buildSeed('2026-10-26');

describe('jobCrew', () => {
  it('lists the mechanics on a job, those with open work first, each once', () => {
    const crew = jobCrew('p1', d);
    expect(crew.length).toBeGreaterThan(1);
    expect(new Set(crew.map((m) => m.id)).size).toBe(crew.length);
    expect(crew[0].id).toBe('m2');
  });
  it('is empty for a job with no tasks', () => {
    expect(jobCrew('nope', d)).toEqual([]);
  });
});
