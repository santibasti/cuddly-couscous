import { describe, expect, it } from 'vitest';
Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });

describe('completeSettings', () => {
  it('fills missing sections from the defaults and keeps what the server has', async () => {
    const { completeSettings } = await import('./cloud');
    const s = await completeSettings({ counters: { JOB: 25900 }, company: { name: 'My Co' }, multipliers: { overtime: 1.5 } } as never);
    expect(s.counters.JOB).toBe(25900);
    expect(s.company.name).toBe('My Co');
    expect(s.company.tin).toBeTruthy();               // missing company field filled
    expect(s.multipliers.overtime).toBe(1.5);         // kept
    expect(s.multipliers.rest_day).toBeGreaterThan(0); // filled
    expect(s.std_hours_per_day).toBeGreaterThan(0);
    expect(s.access).toBeTruthy();
  });
  it('returns complete settings untouched', async () => {
    const { completeSettings } = await import('./cloud');
    const { seedDB } = await import('./seed');
    const full = seedDB().settings;
    expect(await completeSettings(full)).toBe(full);
  });
});
