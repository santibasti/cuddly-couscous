import { describe, expect, it, vi } from 'vitest';
import { applyOutbox, diffDB, emptyDB, fromDb, isRuleError, pushChanges, settingsChanged, toDb } from './cloud';

const sent: Record<string, unknown>[] = []; const updates: Record<string, unknown>[] = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      update: (row: Record<string, unknown>) => { updates.push(row); return { eq: () => ({ select: async () => ({ data: [{ id: 'x' }], error: null }) }) }; },
      insert: async (row: Record<string, unknown>) => {
        sent.push(row);
        return 'photos' in row ? { error: { message: "Could not find the 'photos' column of 'jobs' in the schema cache", code: 'PGRST204' } } : { error: null };
      },
    }),
  }),
}));

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
  it('leaves out a column the database no longer has instead of refusing the save', async () => {
    const a = emptyDB(); const b = { ...a, jobs: [{ id: 'j1', number: 'JOB-1', photos: [] }] as never };
    await pushChanges(a, b, new Set());
    expect(sent.map((r) => 'photos' in r)).toEqual([true, false]);       // refused once, then sent without it
    await pushChanges(a, b, new Set());
    expect('photos' in sent[sent.length - 1]).toBe(false);                // remembered for next time
  });
  it('replays every step in order and sends only the columns that changed', async () => {
    updates.length = 0;
    const a = emptyDB(); a.discount_requests = [{ id: 'd1', status: 'Pending Admin Approval', note: 'n', verified_at: 'local' }] as never;
    const b = { ...a, discount_requests: [{ id: 'd1', status: 'Applied', note: 'n', verified_at: 'local' }] as never };
    const j = [
      { t: 'discount_requests', id: 'd1', kind: 'update' as const, before: a.discount_requests[0] as never, row: { id: 'd1', status: 'Approved', note: 'n', verified_at: 'local' } },
      { t: 'discount_requests', id: 'd1', kind: 'update' as const, before: { id: 'd1', status: 'Approved', note: 'n', verified_at: 'local' }, row: b.discount_requests[0] as never },
    ];
    await pushChanges(a, b, new Set(), j);
    expect(updates).toEqual([{ status: 'Approved' }, { status: 'Applied' }]);       // each transition is sent, nothing else is touched
  });
  it('puts changes made offline back on top of fresh server data without losing or repeating anything', () => {
    const server = emptyDB();
    server.clients = [{ id: 'c1', name: 'A', status: 'Active', notes: 'old' }, { id: 'c2', name: 'B', status: 'Active' }, { id: 'c9', name: 'saved already' }] as never;
    server.jobs = [{ id: 'j1', status: 'Confirmed', scope: 'x' }] as never;
    const entries = [
      { t: 'clients', id: 'c3', kind: 'insert' as const, row: { id: 'c3', name: 'New client' } },                                           // made offline, not sent
      { t: 'clients', id: 'c9', kind: 'insert' as const, row: { id: 'c9', name: 'saved already' } },                                         // was sent just before the app closed
      { t: 'clients', id: 'c1', kind: 'update' as const, before: { id: 'c1', name: 'A', status: 'Active', notes: 'old' }, row: { id: 'c1', name: 'A', status: 'Active', notes: 'called' } },
      { t: 'clients', id: 'c2', kind: 'update' as const, before: { id: 'c2', name: 'B', status: 'Active' }, row: { id: 'c2', name: 'B2' } },       // renamed, status cleared
      { t: 'jobs', id: 'j1', kind: 'update' as const, before: { id: 'j1', status: 'Confirmed', scope: 'x' }, row: { id: 'j1', status: 'Dispatched', scope: 'x' } },
      { t: 'clients', id: 'gone', kind: 'update' as const, before: { id: 'gone' }, row: { id: 'gone', name: 'z' } },                          // deleted on the server meanwhile
    ];
    const r = applyOutbox(server, entries);
    expect(r.db.clients.map((c) => c.id)).toEqual(['c1', 'c2', 'c9', 'c3']);
    expect(r.db.clients.find((c) => c.id === 'c1')).toEqual({ id: 'c1', name: 'A', status: 'Active', notes: 'called' });
    expect(r.db.clients.find((c) => c.id === 'c2')).toEqual({ id: 'c2', name: 'B2' });
    expect(r.db.jobs[0].status).toBe('Dispatched');
    expect(r.entries.map((e) => `${e.kind}:${e.id}`)).toEqual(['insert:c3', 'update:c1', 'update:c2', 'update:j1']);   // c9 already saved, "gone" dropped
    expect(server.clients.length).toBe(3);                                                                                // the server copy itself is untouched
  });
});
