import { describe, expect, it } from 'vitest';
import { CASES, runRulebookTests } from './rulebooktests';

describe('the rulebook conversation tests', () => {
  it('all pass on the current rates and rules', () => { const r = runRulebookTests(); expect(r.filter((x) => !x.ok)).toEqual([]); expect(r.length).toBe(CASES.length); expect(r.length).toBeGreaterThanOrEqual(10); });
});
