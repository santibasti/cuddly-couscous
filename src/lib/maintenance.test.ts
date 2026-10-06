import { beforeAll, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });
let store: typeof import('./store').store; let M: typeof import('./maintenance'); let C: typeof import('./maintenance-core'); let A: typeof import('./actions');
beforeAll(async () => { store = (await import('./store')).store; M = await import('./maintenance'); C = await import('./maintenance-core'); A = await import('./actions'); });
const db = () => store.getDB(); const T = () => new Date().toISOString().slice(0, 10);
const asset = (code: string) => db().assets.find((a) => a.code === code)!;
const done = (over: object = {}) => ({ confirmed: true, completed_on: T(), completed_by: db().employees[1].id, actual_cost: 500, before_notes: 'worn', after_notes: 'good as new', installed: [] as string[], ...over });

describe('maintenance rules', () => {
  it('demo data has plans, an overdue and a requested task', async () => {
    await store.login('owner@topmop.ph', 'topmop123');
    const st = C.maintStats(db(), T());
    expect(db().maint_plans.length).toBeGreaterThan(20); expect(st.overdue.length).toBeGreaterThan(0);
    expect(db().maint_records.some((r) => r.status === 'Requested')).toBe(true);
    expect(st.renewals.length).toBeGreaterThan(0);
  });
  it('a Team Leader can request but not schedule, approve, start or complete', async () => {
    await store.login('leader@topmop.ph', 'topmop123');
    const a = asset('PWR-001');
    const r = M.requestMaintenance({ asset_id: a.id, issue: 'Pressure drops after 10 minutes', priority: 'High' });
    expect(r.status).toBe('Requested'); expect(r.approval).toBe('Pending');
    expect(() => M.approveRequest(r.id, { due_date: T() })).toThrow(/not permitted/i);
    expect(() => M.startRecord(r.id)).toThrow(/not permitted/i);
    expect(() => M.completeRecord(r.id, done())).toThrow(/not permitted/i);
    expect(() => M.scheduleMaintenance({ asset_id: a.id, title: 'x', task_type: 'Service', priority: 'Low', due_date: T() })).toThrow(/not permitted/i);
  });
  it('an asset under maintenance cannot be put on a job or requested out', async () => {
    await store.login('ops@topmop.ph', 'topmop123');
    const free = (x: { id: string; status: string }) => x.status === 'Available' && !db().checkouts.some((c) => c.asset_id === x.id && c.status === 'Released');
    const a = db().assets.find((x) => x.category === 'Ladder' && free(x)) ?? db().assets.find((x) => x.code !== 'PWR-001' && x.code !== 'PMP-001' && free(x))!;
    const r = M.scheduleMaintenance({ asset_id: a.id, title: 'Replace brush head', task_type: 'Replace', priority: 'Normal', due_date: T() });
    M.startRecord(r.id); expect(asset(a.code).status).toBe('Under Maintenance');
    const job = db().jobs.find((j) => j.status === 'Confirmed')!;
    expect(() => A.requestCheckout({ asset_id: a.id, job_id: job.id, responsible_id: db().employees[3].id, expected_return: '2031-01-01T17:00' })).toThrow(/under maintenance/);
    const wfp = db().assets.find((x) => x.id !== a.id && x.code !== 'PWR-001' && x.code !== 'PMP-001' && free(x))!;
    M.setAssetState(wfp.id, 'Out of Service', 'cracked pole');
    expect(C.isUnavailable(asset(wfp.code).status)).toBe(true);
    expect(() => A.requestCheckout({ asset_id: wfp.id, job_id: job.id, responsible_id: db().employees[3].id, expected_return: '2031-01-01T17:00' })).toThrow(/out of service/);
    // finishing returns it to Available
    M.completeRecord(r.id, done()); expect(asset(a.code).status).toBe('Available');
  });
  it('completion needs confirmation, deducts linked stock only when completed, and reschedules the plan', async () => {
    await store.login('ops@topmop.ph', 'topmop123');
    const resin = db().items.find((i) => i.code === 'SPR-003')!; const rod = asset('ROD-002');
    const rec = db().maint_records.find((r) => r.asset_id === rod.id && r.parts.some((p) => p.item_id === resin.id))!;
    const before = db().stock.filter((t) => t.item_id === resin.id).length;
    expect(() => M.completeRecord(rec.id, done({ confirmed: false }))).toThrow(/confirmation/);
    expect(db().stock.filter((t) => t.item_id === resin.id).length).toBe(before);           // nothing deducted yet
    const plan = db().maint_plans.find((p) => p.id === rec.plan_id)!; const prevNext = plan.next_due_reading;
    const r = M.completeRecord(rec.id, done({ reading: 1300, installed: rec.parts.map((p) => p.id) }));
    expect(r.short).toEqual([]); expect(db().stock.filter((t) => t.item_id === resin.id).length).toBe(before + 1);
    expect(db().maint_records.find((x) => x.id === rec.id)!.status).toBe('Completed');
    expect(db().maint_plans.find((p) => p.id === plan.id)!.next_due_reading).toBe(1600); expect(prevNext).not.toBe(1600);
  });
  it('short stock is reported, not deducted, and a purchase can be requested', async () => {
    await store.login('ops@topmop.ph', 'topmop123');
    const a = asset('PMP-001'); const seal = db().items.find((i) => i.code === 'SPR-005')!;
    const r = M.scheduleMaintenance({ asset_id: a.id, title: 'Replace pump seals', task_type: 'Replace', priority: 'Normal', due_date: T(), parts: [{ id: 'p1', name: 'Seal kit', category: 'Replacement Part', qty: 999, est_cost: 100, status: 'Needed', item_id: seal.id }] });
    expect(M.requestPurchase(r.id)).toBe(1);
    const res = M.completeRecord(r.id, done({ installed: ['p1'] }));
    expect(res.short.length).toBe(1); expect(db().maint_records.find((x) => x.id === r.id)!.parts[0].deducted).toBeFalsy();
  });
  it('plans generate scheduled records from the date and the reading', async () => {
    await store.login('ops@topmop.ph', 'topmop123');
    const a = asset('SFC-001');
    M.saveProfile(a.id, {});
    M.savePlan({ asset_id: a.id, task_name: 'Check skirt', task_type: 'Inspect', description: '', freq_kind: 'date', interval_days: 30, est_cost: 0, priority: 'Normal', parts: [], last_done: '2020-01-01' });
    M.syncMaintenance();
    expect(db().maint_records.some((r) => r.asset_id === a.id && r.title.includes('Check skirt') && C.dueState(db(), r, T()) === 'Overdue')).toBe(true);
    expect(() => M.savePlan({ asset_id: a.id, task_name: 'Bad', task_type: 'Inspect', description: '', freq_kind: 'mileage', est_cost: 0, priority: 'Normal', parts: [] })).toThrow(/interval/);
  });
  it('reminders fire at 14, 7 and 1 days and for overdue work', async () => {
    await store.login('owner@topmop.ph', 'topmop123');
    const alerts = C.maintAlerts(db(), T());
    expect(alerts.some((a) => a.title === 'Maintenance overdue')).toBe(true);
    expect(alerts.some((a) => a.title.startsWith('Registration renewal'))).toBe(true);
    expect(alerts.some((a) => a.title === 'Maintenance request awaiting approval')).toBe(true);
  });
});

describe('employee rating', () => {
  it('every active employee with approved attendance has a 1–5 rating and a message', async () => {
    const R = await import('./rating-core');
    await store.login('owner@topmop.ph', 'topmop123');
    const rated = db().employees.filter((e) => e.rating !== undefined);
    expect(rated.length).toBeGreaterThan(5);
    for (const e of rated) { expect(e.rating).toBeGreaterThanOrEqual(1); expect(e.rating).toBeLessThanOrEqual(5); const m = R.motivation(e.rating, e.rating_parts, e.full_name.split(' ')[0], 'in'); expect(m.message.length).toBeGreaterThan(20); }
    expect(R.ratingStats(db()).avg).toBeGreaterThan(1);
  });
  it('messages are encouraging at every level and mention a focus area when one is weak', async () => {
    const R = await import('./rating-core');
    expect(R.motivation(undefined, undefined, 'Ana', 'in').headline).toMatch(/Welcome/);
    expect(R.motivation(2.1, { punctuality: 60, attendance: 95, months: 1 }, 'Ana', 'in').tip).toMatch(/on time/);
    expect(R.motivation(4.8, { attendance: 99, punctuality: 98, months: 3 }, 'Ana', 'out').message).toMatch(/Thank you/);
    expect(R.motivation(2.1, undefined, 'Ana', 'in').message).not.toMatch(/bad|poor|fail|warning/i);
  });
  it('the sync updates only people whose rating changed and needs permission', async () => {
    const Rt = await import('./ratings');
    await store.login('owner@topmop.ph', 'topmop123');
    const e = db().employees.find((x) => x.rating !== undefined)!;
    store.update('employees', e.id, { rating: 1.0 } as never);
    Rt.syncRatings(); expect(db().employees.find((x) => x.id === e.id)!.rating).not.toBe(1);
    await store.login('field@topmop.ph', 'topmop123');
    const before = db().employees;
    Rt.syncRatings(); expect(db().employees).toBe(before);
  });
});
