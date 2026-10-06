import { beforeAll, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });
let store: typeof import('./store').store; let W: typeof import('./workflow'); let B: typeof import('./business');
beforeAll(async () => { store = (await import('./store')).store; W = await import('./workflow'); B = await import('./business'); });
const db = () => store.getDB();
const input = { reason: 'Client also wants the canopy cleaned', items: [{ service_code: 'OTHER' as const, description: 'Canopy cleaning', qty: 1, unit: 'lot', rate: 5000, discount: 0 }], discount: 0, vat_mode: 'exclusive' as const, vat_rate: 12, panel_row_ids: [] };

describe('extra work added ahead of time', () => {
  it('Operations can add it before work starts; it is waiting (not in the contract value) until the client signs on site', async () => {
    await store.login('ops@topmop.ph', 'topmop123');
    const job = db().jobs.find((j) => j.status === 'Confirmed' && !j.deleted_at && !db().workflows.some((w) => w.job_id === j.id && w.start_at))!;
    const before = B.finalContract(db(), job).payableTotal;
    const v = W.createVariation(job.id, input);
    expect(v.status).toBe('Draft');
    expect(B.finalContract(db(), job).payableTotal).toBe(before);          // not agreed yet
    expect(B.openVariations(db(), job.id).map((x) => x.id)).toContain(v.id);
    await store.login('leader@topmop.ph', 'topmop123');
    const mine = db().jobs.find((j) => j.status === 'Confirmed' && !j.deleted_at && j.leader_id === store.user!.employee_id && !db().workflows.some((w) => w.job_id === j.id && w.start_at));
    if (mine) expect(() => W.createVariation(mine.id, input)).toThrow(/started|workflow/i);   // a Team Leader raises extra work once work has started
  });
});
