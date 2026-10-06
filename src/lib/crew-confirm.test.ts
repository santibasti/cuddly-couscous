import { beforeAll, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });
let store: typeof import('./store').store; let A: typeof import('./actions'); let C: typeof import('./crew-confirm-core');
beforeAll(async () => { store = (await import('./store')).store; A = await import('./actions'); C = await import('./crew-confirm-core'); });
const db = () => store.getDB();
const job = (extra = {}) => ({ id: 'j', start_at: '2026-10-07T08:00', end_at: '2026-10-07T17:00', status: 'Confirmed', leader_id: 'L', crew_ids: ['A', 'B'], ...extra }) as never;

describe('crew availability', () => {
  it('asks from 7 PM the evening before until the job starts', () => {
    const j = job();
    expect(C.opensAt(j)).toBe('2026-10-06T19:00');
    expect(C.isAsking(j, '2026-10-06T18:59')).toBe(false);
    expect(C.isAsking(j, '2026-10-06T19:00')).toBe(true);
    expect(C.isAsking(j, '2026-10-07T07:59')).toBe(true);
    expect(C.isAsking(j, '2026-10-07T08:00')).toBe(false);
    expect(C.isAsking(job({ status: 'Cancelled' }), '2026-10-06T20:00')).toBe(false);
  });
  it('lists who is still waiting; an answer is void if the schedule moves', () => {
    const j = job({ crew_confirmations: { L: { status: 'confirmed', at: 'x', for_start: '2026-10-07T08:00' }, A: { status: 'declined', at: 'x', note: 'sick', for_start: '2026-10-07T08:00' }, B: { status: 'confirmed', at: 'x', for_start: '2026-10-06T08:00' } } });
    const s = C.summary(j);
    expect(s.confirmed).toEqual(['L']); expect(s.declined).toEqual(['A']); expect(s.waiting).toEqual(['B']);
    expect(C.pendingFor([j], 'B', '2026-10-06T20:00')).toHaveLength(1);
    expect(C.pendingFor([j], 'L', '2026-10-06T20:00')).toHaveLength(0);
  });
  it('a crew member answers for themself; a decline needs a reason and alerts Operations', async () => {
    await store.login('leader@topmop.ph', 'topmop123');
    const me = store.user!.employee_id!;
    const j = db().jobs.find((x) => x.status === 'Confirmed' && !x.deleted_at && (x.leader_id === me || x.crew_ids.includes(me)));
    if (!j) throw new Error('seed has no job for this leader');
    expect(() => A.confirmAvailability(j.id, 'declined', '')).toThrow(/why/);
    A.confirmAvailability(j.id, 'declined', 'Family emergency');
    expect(db().jobs.find((x) => x.id === j.id)!.crew_confirmations![me].status).toBe('declined');
    const other = db().jobs.find((x) => x.status === 'Confirmed' && !x.deleted_at && x.leader_id !== me && !x.crew_ids.includes(me))!;
    expect(() => A.confirmAvailability(other.id, 'confirmed')).toThrow(/not assigned/);
    A.confirmAvailability(j.id, 'confirmed');
    expect(C.answerOf(db().jobs.find((x) => x.id === j.id)!, me)!.status).toBe('confirmed');
  });
});
