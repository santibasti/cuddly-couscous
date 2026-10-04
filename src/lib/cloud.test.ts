import { describe, expect, it } from 'vitest';
import { diffDB, emptyDB, fromDb, isRuleError, settingsChanged, toDb } from './cloud';

describe('Supabase mapping', () => {
  it('turns database values into the shapes the app uses', () => {
    const r = fromDb({ id: 'a', start_at: '2026-10-07T08:00:00', created_at: '2026-10-05T05:51:00.123+00:00', completed_at: null, shift_start: '08:00:00', date: '2026-10-07', items: [{ at: '2026-10-05T05:51:00+00:00' }], amount: 12.5, period_start: '2026-10-01' }, { start: 'period_start' });
    expect(r).toEqual({ id: 'a', start_at: '2026-10-07T08:00', created_at: '2026-10-05T05:51:00.123Z', shift_start: '08:00', date: '2026-10-07', items: [{ at: '2026-10-05T05:51:00+00:00' }], amount: 12.5, start: '2026-10-01' });
  });
  it('sends fields cleared in the app as null, and renames periods columns', () => {
    expect(toDb({ id: 'a', name: 'x', note: undefined, start: '2026-10-01' }, { id: 'a', name: 'x', note: 'old', start: '2026-10-01' }, { start: 'period_start' })).toEqual({ id: 'a', name: 'x', note: null, period_start: '2026-10-01' });
  });
  it('finds only the rows that were added or changed', () => {
    const a = emptyDB(); a.clients = [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }] as never;
    const b = { ...a, clients: [a.clients[0], { ...a.clients[1], name: 'B2' }, { id: 'c3', name: 'C' }] as never };
    const d = diffDB(a, b);
    expect(d.inserts.map(([t, r]) => [t, r.id])).toEqual([['clients', 'c3']]);
    expect(d.updates.map(([t, r]) => [t, r.id])).toEqual([['clients', 'c2']]);
    expect(diffDB(a, { ...a, clients: [...a.clients] }).updates).toEqual([]);                  // same content → nothing to send
  });
  it('ignores counter-only settings changes and tells rule errors from network errors', () => {
    const a = emptyDB(); const b = { ...a, settings: { ...a.settings, counters: { QT: 5 } } };
    expect(settingsChanged(a, b)).toBe(false);
    expect(settingsChanged(a, { ...a, settings: { ...a.settings, vat_rate: 10 } as never })).toBe(true);
    expect(isRuleError({ code: '23514' })).toBe(true); expect(isRuleError(new TypeError('Failed to fetch'))).toBe(false);
  });
});
