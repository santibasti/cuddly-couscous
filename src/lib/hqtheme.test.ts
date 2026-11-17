import { describe, expect, it } from 'vitest';
import { ROOMS } from './hqwing';
import { THEME } from './hqtheme';
describe('office themes', () => {
  it('every room has its own look', () => {
    for (const r of ROOMS) expect(THEME[r].wall[0]).toMatch(/^#/);
    expect(new Set(ROOMS.map((r) => THEME[r].wall[0])).size).toBe(ROOMS.length);
  });
});
