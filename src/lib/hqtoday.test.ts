import { describe, expect, it } from 'vitest';
import { countServices, SAMPLE_SERVICES } from './hqtoday';

describe('services today', () => {
  it('counts the stages the way the Happening Today page groups them', () => {
    const c = countServices(SAMPLE_SERVICES); expect(c).toEqual({ total: 3, done: 1, working: 1, road: 1, waiting: 0, problem: 0 });
  });
});
