import { beforeAll, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });
let store: typeof import('./store').store; let B: typeof import('./business');
beforeAll(async () => { store = (await import('./store')).store; B = await import('./business'); });
const db = () => store.getDB();

describe('service pricing is editable', () => {
  it('Admin can add, price, rename and delete a service; old records keep working', async () => {
    await store.login('owner@topmop.ph', 'topmop123');
    const n = db().services.length;
    const s = store.insert('services', { code: 'SVC_WATER_TANK_ABC', name: 'Water tank cleaning', unit: 'unit', rate: 3500, minimum_qty: 1, custom_quote: false, est_hours_per_unit: 2 } as never) as { id: string; code: string };
    expect(db().services.length).toBe(n + 1);
    const def = db().services.find((x) => x.id === s.id)!;
    expect(B.priceService(def, 3).lines[0].qty * B.priceService(def, 3).lines[0].rate).toBe(10500);
    store.update('services', s.id, { rate: 4000, name: 'Water tank cleaning (up to 2 m3)' } as never);
    const l2 = B.priceService(db().services.find((x) => x.id === s.id)!, 2).lines[0]; expect(l2.qty * l2.rate).toBe(8000);
    store.remove('services', s.id);
    expect(db().services.find((x) => x.id === s.id)!.deleted_at).toBeTruthy();
    expect(db().services.filter((x) => !x.deleted_at).some((x) => x.id === s.id)).toBe(false);
    store.restore('services', s.id);
    expect(db().services.find((x) => x.id === s.id)!.deleted_at).toBeFalsy();
  });
});
