import { beforeAll, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });
let store: typeof import('./store').store; let O: typeof import('./ocular');
beforeAll(async () => { store = (await import('./store')).store; O = await import('./ocular'); });
const db = () => store.getDB();
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const input = (v: { service_codes: string[] }) => ({ report_surface: 'Hard-water spots on upper floors', report_hazards: 'Roof anchors needed', report_recommendation: 'Two-day wash with descaler', report_services: v.service_codes as never, report_days: 2, report_crew: '5-6' });

describe('ocular report', () => {
  it('is prepared, signed by the client, then locked; Admin can reopen it', async () => {
    await store.login('ops@topmop.ph', 'topmop123');
    const v = db().ocular_visits.find((x) => x.status === 'Completed')!;
    expect(() => O.signOcularReport(v.id, { name: 'Ms. Reyes', client_sig: PNG })).toThrow(/Save the report/);
    O.saveOcularReport(v.id, input(v));
    expect(() => O.signOcularReport(v.id, { name: '', client_sig: PNG })).toThrow(/printed name/);
    expect(() => O.signOcularReport(v.id, { name: 'Ms. Reyes', client_sig: '' })).toThrow(/not signed/);
    O.signOcularReport(v.id, { name: 'Ms. Reyes', client_sig: PNG, assessor_sig: PNG });
    const s = db().ocular_visits.find((x) => x.id === v.id)!;
    expect(s.client_sig_name).toBe('Ms. Reyes'); expect(s.client_sig_at).toBeTruthy();
    expect(() => O.saveOcularReport(v.id, input(v))).toThrow(/locked/);
    expect(() => O.completeOcularVisit(v.id, { panels: s.panels, measurements: s.measurements, findings: 'changed' })).toThrow(/locked/);
    expect(() => O.signOcularReport(v.id, { name: 'X', client_sig: PNG })).toThrow(/already signed/);
    await store.login('leader@topmop.ph', 'topmop123');
    expect(() => O.reopenOcularReport(v.id, 'typo')).toThrow(/not permitted/i);
    await store.login('ops@topmop.ph', 'topmop123');
    expect(() => O.reopenOcularReport(v.id, '')).toThrow(/reason/);
    O.reopenOcularReport(v.id, 'Wrong panel count'); expect(db().ocular_visits.find((x) => x.id === v.id)!.client_sig).toBeUndefined();
  });
  it('the quotation made from a visit carries the report: crew, days, disclaimer and the recommendation', async () => {
    await store.login('ops@topmop.ph', 'topmop123');
    const v = db().ocular_visits.find((x) => x.status === 'Completed')!;
    O.saveOcularReport(v.id, input(v));
    const q = O.createQuotationFromOcular(v.id);
    expect([q.crew_size, q.work_days, q.safety_officer]).toEqual(['5-6', 2, true]);
    expect(q.disclaimer).toMatch(/Our cleaning process/); expect(q.scope).toMatch(/Recommendation: Two-day wash/);
  });
});

describe('job order shows the client address', () => {
  it('is in the content; an old unsent order picks it up; a sent order is never revised for it', async () => {
    const C = await import('./joborder-core'); const J = await import('./joborders');
    await store.login('ops@topmop.ph', 'topmop123');
    const job = db().jobs.find((j) => j.status === 'Confirmed' && db().quotations.some((q) => q.id === j.quotation_id && q.status === 'Approved'))!;
    J.syncJobOrders(job.id);
    const head = C.headOrder(db(), job.id)!;
    const client = db().clients.find((c) => c.id === job.client_id)!;
    expect(head.content.client_address).toBe((client.address || client.billing_address).trim());
    const old = { ...head, content: { ...head.content, client_address: undefined } };
    const d1 = { ...db(), job_orders: db().job_orders.map((o) => (o.id === head.id ? old : o)) };
    expect(C.planJobOrders(d1 as never, job.id).map((s) => s.kind)).toEqual(['refresh']);
    const sent = { ...old, status: 'Sent to Client' as const };
    const d2 = { ...db(), job_orders: db().job_orders.map((o) => (o.id === head.id ? sent : o)) };
    expect(C.planJobOrders(d2 as never, job.id)).toEqual([]);
  });
});
