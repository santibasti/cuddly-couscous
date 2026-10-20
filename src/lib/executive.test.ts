import { describe, expect, it } from 'vitest';
Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
import { seedDB } from './seed';
import { aiSummary, buildExecutive, forecastMonths, monthlyHistory } from './executive';
import { today } from './util';

describe('executive analysis', () => {
  const db = seedDB(); const T = today();
  it('builds history, forecast, capacity and constraints from the records', () => {
    const d = buildExecutive(db, T);
    expect(d.months.length).toBeGreaterThan(0);
    expect(d.forecast).toHaveLength(3);
    for (const f of d.forecast) { expect(f.low).toBeLessThanOrEqual(f.base); expect(f.high).toBeGreaterThanOrEqual(f.base); expect(f.base).toBeGreaterThanOrEqual(f.booked); }
    expect(d.capacity.days).toHaveLength(28);
    if (d.kpis.grossMargin90 !== null) expect(Math.abs(d.kpis.grossMargin90)).toBeLessThan(20);   // a ratio (0.35), not a percent (35)
    expect(d.constraints.length).toBeGreaterThan(3);
    expect(['operations', 'demand', 'balanced', 'unclear']).toContain(d.verdict.constraint);
  });
  it('sends the AI totals only — no client, staff or site names', () => {
    const d = buildExecutive(db, T); const text = JSON.stringify(aiSummary(d));
    for (const c of db.clients.slice(0, 15)) expect(text).not.toContain(c.name);
    for (const e of db.employees.slice(0, 15)) expect(text).not.toContain(e.full_name);
    expect(text).not.toMatch(/\d{3}-\d{3}-\d{3}-\d{3,5}/);   // no TIN-like numbers
  });
  it('forecast follows the recent run-rate and never falls below what is booked', () => {
    const hist = monthlyHistory(db, T, 12); const f = forecastMonths(db, hist, T);
    expect(f.rows[0].base).toBeGreaterThanOrEqual(f.rows[0].booked);
    expect(f.method).toMatch(/Run-rate/);
  });
});
