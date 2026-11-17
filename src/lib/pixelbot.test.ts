import { describe, expect, it } from 'vitest';
import { LOOKS } from './botlook';
import { PIX_H, PIX_W, spriteRows, spriteRuns } from './pixelbot';
describe('pixel robots', () => {
  it('draws every agent in every view inside the grid, with eyes where it should', () => {
    for (const k of Object.keys(LOOKS)) for (const v of ['front', 'back', 'side'] as const) for (const f of [0, 1] as const) {
      const rows = spriteRows(k, v, f, false); expect(rows.length).toBe(PIX_H); expect(rows.every((r) => r.length === PIX_W)).toBe(true);
      expect(rows.join('')).toContain('o'); if (v !== 'back') expect(rows.join('')).toContain('e'); }
  });
  it('seated sprites have no legs and runs stay small', () => {
    expect(spriteRows('messenger', 'front', 0, true).join('')).not.toContain('f');
    expect(spriteRuns(spriteRows('jarvis', 'front', 0, false)).length).toBeLessThan(260);
  });
  it('agents keep different silhouettes', () => { expect(spriteRows('support', 'front', 0, true).join('\n')).not.toBe(spriteRows('router', 'front', 0, true).join('\n')); });
});
