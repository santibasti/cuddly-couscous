import { beforeAll, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });
let store: typeof import('./store').store; let D: typeof import('./deletion'); let A: typeof import('./actions');
beforeAll(async () => { store = (await import('./store')).store; D = await import('./deletion'); A = await import('./actions'); });
const db = () => store.getDB();

describe('deleting clients and inventory', () => {
  it('only the Owner / Admin may delete', async () => {
    await store.login('ops@topmop.ph', 'topmop123');
    expect(() => D.deleteClient(db().clients[0].id, 'x')).toThrow(/not permitted/i);
    expect(() => D.deleteItem(db().items[0].id, 'x')).toThrow(/not permitted/i);
  });
  it('refuses a client with billing or completed service history', async () => {
    await store.login('owner@topmop.ph', 'topmop123');
    const withHistory = db().clients.find((c) => D.planClientDelete(db(), c.id).blockers.length)!;
    expect(() => D.deleteClient(withHistory.id, 'test')).toThrow(/cannot be deleted/);
    expect(db().clients.find((c) => c.id === withHistory.id)!.deleted_at).toBeFalsy();
  });
  it('deletes a new client together with its unstarted booking, and it can be restored', async () => {
    await store.login('owner@topmop.ph', 'topmop123');
    const c = store.insert('clients', { name: 'Test Client Delete Me', contact_person: 'T', mobile: '', email: '', address: 'Quezon City', billing_address: '', type: 'Residential', status: 'Prospect', notes: '', access_instructions: '', tin: '', vat_status: 'Non-VAT', withholding_rate: 0, withholding_notes: '', branch_id: db().branches[0].id } as never);
    const s = store.insert('sites', { client_id: c.id, name: 'Main', address: 'Quezon City', contact_person: '', contact_mobile: '', access_instructions: '' } as never);
    const emp = db().employees.find((e) => e.department === 'Field Operations')!;
    const j = A.saveJob({ client_id: c.id, site_id: s.id, branch_id: db().branches[0].id, service_codes: ['WALL'], scope: 'x', start_at: '2031-03-03T08:00', end_at: '2031-03-03T12:00', status: 'Confirmed', leader_id: emp.id, crew_ids: [], equipment_ids: [], materials: [], contract_amount: 0, checklist: [] } as never);
    const plan = D.planClientDelete(db(), c.id);
    expect(plan.blockers).toEqual([]); expect(plan.counts.join()).toMatch(/booking/);
    expect(() => D.deleteClient(c.id, '')).toThrow(/reason/i);
    D.deleteClient(c.id, 'test data');
    expect(db().clients.find((x) => x.id === c.id)!.deleted_at).toBeTruthy();
    expect(db().jobs.find((x) => x.id === (j as { id: string }).id)!.deleted_at).toBeTruthy();
    store.restore('clients', c.id); expect(db().clients.find((x) => x.id === c.id)!.deleted_at).toBeFalsy();
  });
  it('refuses an item with stock movements, deletes an unused one', async () => {
    await store.login('owner@topmop.ph', 'topmop123');
    const used = db().items.find((i) => D.planItemDelete(db(), i.id).blockers.length)!;
    expect(() => D.deleteItem(used.id, 'x')).toThrow(/cannot be deleted/);
    const fresh = store.insert('items', { code: 'ZZ-1', name: 'Unused test item', category: 'Chemical', uom: 'pc', reorder_level: 0, cost: 1, supplier: '', location_id: db().locations[0].id, track_expiry: false } as never);
    D.deleteItem(fresh.id, 'test'); expect(db().items.find((i) => i.id === fresh.id)!.deleted_at).toBeTruthy();
  });
});
