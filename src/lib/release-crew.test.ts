import { beforeAll, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });
let store: typeof import('./store').store; let A: typeof import('./actions'); let B: typeof import('./business');
beforeAll(async () => { store = (await import('./store')).store; A = await import('./actions'); B = await import('./business'); });
const db = () => store.getDB();

describe('cancelled booking', () => {
  it('releases its leader, crew, vehicle and equipment so they can be booked again', async () => {
    await store.login('ops@topmop.ph', 'topmop123');
    const job = db().jobs.find((j) => ['Pending', 'Confirmed'].includes(j.status) && j.crew_ids.length && j.leader_id && !j.deleted_at)!;
    const team = { start_at: job.start_at, end_at: job.end_at, leader_id: job.leader_id, crew_ids: [...job.crew_ids], vehicle_id: job.vehicle_id, equipment_ids: [...job.equipment_ids] };
    A.setJobStatus(job.id, 'Cancelled', 'Client postponed');
    const after = db().jobs.find((j) => j.id === job.id)!;
    expect(after.status).toBe('Cancelled'); expect(after.damage_report).toBe('Client postponed');
    expect(after.crew_ids).toEqual([]); expect(after.leader_id).toBeUndefined(); expect(after.equipment_ids).toEqual([]);
    expect(B.findConflicts(db(), { ...team, id: 'new' }).filter((c) => c.job.id === job.id)).toEqual([]);
    expect(db().audit.some((a) => /released/.test(a.summary ?? ''))).toBe(true);
  });
  it('an older cancelled booking that still lists its crew is cleaned up', async () => {
    const job = db().jobs.find((j) => ['Pending', 'Confirmed'].includes(j.status) && j.crew_ids.length && !j.deleted_at)!;
    store.update('jobs', job.id, { status: 'Cancelled' } as never);
    expect(db().jobs.find((j) => j.id === job.id)!.crew_ids.length).toBeGreaterThan(0);
    A.runAutomations();
    expect(db().jobs.find((j) => j.id === job.id)!.crew_ids).toEqual([]);
  });
});
