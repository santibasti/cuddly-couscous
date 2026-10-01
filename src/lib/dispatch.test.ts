import { beforeAll, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });

type S = typeof import('./store'); type D = typeof import('./dispatch'); type A = typeof import('./actions'); type B = typeof import('./business'); type Q = typeof import('./qr');
import type { Dispatch, DispatchItem } from './types';
let store: S['store']; let D: D; let A: A; let B: B; let Q: Q;
beforeAll(async () => { const s = await import('./store'); store = s.store; D = await import('./dispatch'); A = await import('./actions'); B = await import('./business'); Q = await import('./qr'); });
const db = () => store.getDB();
const as = (e: string) => store.login(e, 'topmop123');
const T = () => new Date().toISOString().slice(0, 10);
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const stat = (id: string) => db().jobs.find((j) => j.id === id)!.status;

function scenario(label: string, leaderEmp: string, crew: string[] = []) {
  const mkAsset = (code: string, category: string, extra = {}) => store.insert('assets', { code, name: `${label} ${code}`, category, brand: 'X', model: 'Y', serial: code, purchase_date: '2025-01-01', purchase_cost: 1000, condition: 'Good', location: 'Main Warehouse', maintenance_interval_days: 0, status: 'Available', daily_allocation: 0, ...extra } as never) as { id: string };
  const veh = mkAsset(`${label}-VEH`, 'Vehicle', { meter_reading: 1000, meter_unit: 'km' });
  const eq = mkAsset(`${label}-EQ`, 'Pressure Washer');
  const tool = mkAsset(`${label}-TL`, 'Ladder');
  const item = db().items.find((i) => i.category === 'Chemical')!;
  const client = db().clients[0]; const site = db().sites.find((s) => s.client_id === client.id)!;
  const job = store.insert('jobs', { number: `JOB-${label}`, client_id: client.id, site_id: site.id, branch_id: client.branch_id, service_codes: ['WALL'], scope: 'Test scope', start_at: '2030-01-02T08:00', end_at: '2030-01-02T17:00', status: 'Confirmed', leader_id: leaderEmp, crew_ids: crew, vehicle_id: veh.id, equipment_ids: [eq.id, tool.id], materials: [{ item_id: item.id, planned_qty: 4 }], ppe: ['Hard hat'], checklist: [], photos: [], findings: '', damage_report: '', equipment_condition_notes: '', contract_amount: 1000, estimated_cost: 500 } as never) as { id: string };
  store.insert('attendance', { employee_id: leaderEmp, date: T(), kind: 'Present', clock_in: `${T()}T07:50`, field_work: false, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0, approval: 'Pending' } as never);
  return { job, veh, eq, tool, item };
}
const load = (items: DispatchItem[]): DispatchItem[] => items.map((i) => ({ ...i, out_ok: true, out_by: 'scan', loaded_qty: i.qty, ...(i.kind === 'material' ? { out_container: 'Good' as const } : { out_condition: 'Good' as const }) }));
const depForm = (dp: Dispatch, over: Record<string, unknown> = {}) => ({ items: load(dp.items), crew_present: [db().jobs.find((j) => j.id === dp.job_id)!.leader_id!], dep_veh_condition: 'Good' as const, dep_veh_photo: PNG, dep_fuel: '3/4' as const, dep_odo: 1000, dep_photo: PNG, dep_lat: 14.55, dep_lng: 121.02, confirmed: true, ...over });
const arrForm = { arr_lat: 14.6, arr_lng: 121, arr_photos: [PNG], arr_contact_name: 'Ms. Reyes', arr_safety_briefing: true, arr_site_notes: 'Use service gate' };
const retItems = (dp: Dispatch, f: (i: DispatchItem) => Partial<DispatchItem>) => db().dispatches.find((d) => d.id === dp.id)!.items.map((i) => ({ ...i, ret_condition: 'Good' as const, returned_qty: i.kind === 'material' ? 0 : i.loaded_qty, ret_photo: i.kind === 'equipment' ? PNG : undefined, ...f(i) }));
const retForm = (items: DispatchItem[], over: Record<string, unknown> = {}) => ({ items, ret_photos: [PNG], ret_fuel: '1/2' as const, ret_odo: 1042, ret_veh_condition: 'Good' as const, ret_lat: 14.55, ret_lng: 121.02, confirmed: true, ...over });
function toInProgress(dp: Dispatch, jobId: string, over = {}) {
  D.completeDeparture(dp.id, depForm(dp, over) as never);
  D.completeArrival(jobId, arrForm);
  D.startWork(jobId);
}
function finishWork(jobId: string) {
  store.update('jobs', jobId, { photos: [...db().jobs.find((j) => j.id === jobId)!.photos, { kind: 'after', caption: 'a', data: PNG, taken_at: '2030-01-02T15:00' }] } as never);
  A.completeJob(jobId, { findings: 'ok', damage_report: '', equipment_condition_notes: '', signoff_name: 'Ms. Reyes', used: {} });
}

describe('QR codes', () => {
  it('round-trips asset codes and accepts plain typed codes', () => {
    expect(Q.parseQr(Q.qrPayload('wfp-001'))).toBe('WFP-001');
    expect(Q.parseQr('  pwr-002 ')).toBe('PWR-002');
  });
});

describe('job status flow', () => {
  it('only confirmed jobs can be dispatched and opening the checklist moves the job forward', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('FLW', db().employees[3].id);
    store.update('jobs', sc.job.id, { status: 'Pending' } as never);
    expect(() => D.openDispatch(sc.job.id)).toThrow(/Confirm the booking/);
    store.update('jobs', sc.job.id, { status: 'Confirmed' } as never);
    const dp = D.openDispatch(sc.job.id);
    expect(stat(sc.job.id)).toBe('Dispatch Checklist Pending');
    expect(dp.items.map((i) => i.kind).sort()).toEqual(['equipment', 'material', 'ppe', 'tool', 'vehicle']);
    expect(D.openDispatch(sc.job.id).id).toBe(dp.id);
  });

  it('cannot skip the dispatch workflow', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('SKP', db().employees[3].id);
    expect(() => A.setJobStatus(sc.job.id, 'In Progress')).toThrow(/dispatch workflow/);
    expect(() => A.completeJob(sc.job.id, { findings: '', damage_report: '', equipment_condition_notes: '', signoff_name: 'x', used: {} })).toThrow(/In Progress/);
    const dp = D.openDispatch(sc.job.id);
    expect(() => D.completeArrival(sc.job.id, arrForm)).toThrow(/depart/);
    expect(() => D.startWork(sc.job.id)).toThrow(/arrival/);
    expect(() => D.completeReturn(dp.id, retForm(dp.items) as never)).toThrow(/work must be completed|Start the return/);
    expect(() => D.closeJob(sc.job.id)).toThrow(/return checklist/);
  });
});

describe('departure checklist', () => {
  it('requires every checklist field', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('DEP', db().employees[4].id);
    const dp = D.openDispatch(sc.job.id);
    const fail = (over: Record<string, unknown>, re: RegExp) => expect(() => D.completeDeparture(dp.id, depForm(dp, over) as never)).toThrow(re);
    fail({ items: dp.items }, /confirm/i);
    fail({ dep_fuel: undefined }, /Fuel level/);
    fail({ dep_odo: 0 }, /odometer/i);
    fail({ dep_veh_photo: undefined }, /Vehicle photo/);
    fail({ dep_veh_condition: 'With Issue' }, /issue notes/);
    fail({ dep_photo: undefined }, /loading photo/);
    fail({ dep_lat: undefined, dep_lng: undefined }, /GPS/);
    fail({ confirmed: false }, /confirmation/);
    expect(db().dispatches.find((d) => d.id === dp.id)!.stage).toBe('Pending');
    expect(stat(sc.job.id)).toBe('Dispatch Checklist Pending');
  });

  it('blocks departure for damaged / missing / short items or absent crew until Operations approves an exception', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[5].id;
    const mate = (store.insert('employees', { ...db().employees[6], id: undefined, code: 'TM-EXC', full_name: 'Exception Mate', status: 'regular' } as never) as { id: string }).id;
    const sc = scenario('EXC', lead, [mate]);
    const dp = D.openDispatch(sc.job.id);
    const bad = (items: DispatchItem[]) => items.map((i) => (i.asset_id === sc.tool.id ? { ...i, out_condition: 'Missing' as const, loaded_qty: 0 } : i));
    const form = (over = {}) => depForm(dp, { items: bad(load(dp.items)), crew_present: [lead, mate], ...over });
    // missing tool → needs exception
    expect(() => D.completeDeparture(dp.id, form() as never)).toThrow(/missing|Operations Manager approval/i);
    // absent crew member also counts
    expect(() => D.completeDeparture(dp.id, depForm(dp, { crew_present: [lead] }) as never)).toThrow(/not confirmed present/);
    await as('leader@topmop.ph');
    // (leader is not assigned to this job)
    expect(() => D.requestDepartureException(dp.id, 'x', {})).toThrow(/assigned Team Leader/);
    await as('owner@topmop.ph');
    expect(() => D.requestDepartureException(dp.id, '   ', { items: bad(load(dp.items)), ...({ crew_present: [lead, mate], dep_veh_condition: 'Good', dep_veh_photo: PNG, dep_fuel: '3/4', dep_odo: 1000, dep_photo: PNG, dep_lat: 1, dep_lng: 1 } as object) })).toThrow(/reason/);
    D.requestDepartureException(dp.id, 'Spare ladder is at the supplier; client site is single-storey', { items: bad(load(dp.items)), crew_present: [lead, mate], dep_veh_condition: 'Good', dep_veh_photo: PNG, dep_fuel: '3/4', dep_odo: 1000, dep_photo: PNG, dep_lat: 1, dep_lng: 1 });
    expect(db().dispatches.find((d) => d.id === dp.id)!.dep_exception_status).toBe('Pending');
    expect(() => D.completeDeparture(dp.id, form() as never)).toThrow(/Waiting for the Operations Manager/);
    expect(db().notifications.some((n) => n.title.includes('exception'))).toBe(true);
    // team leader / field cannot approve
    await as('leader@topmop.ph');
    expect(() => D.decideDepartureException(dp.id, true, '')).toThrow(/not permitted/);
    await as('ops@topmop.ph');
    expect(() => D.decideDepartureException(dp.id, false, '')).toThrow(/reason/);
    D.decideDepartureException(dp.id, true, 'OK — single storey');
    // approval only covers the same discrepancies
    expect(() => D.completeDeparture(dp.id, depForm(dp, { items: load(dp.items).map((i) => (i.asset_id === sc.eq.id ? { ...i, out_condition: 'Missing' as const, loaded_qty: 0 } : i.asset_id === sc.tool.id ? { ...i, out_condition: 'Missing' as const, loaded_qty: 0 } : i)), crew_present: [lead, mate] }) as never)).toThrow(/Operations Manager approval/);
    D.completeDeparture(dp.id, form() as never);
    expect(stat(sc.job.id)).toBe('Departed from HQ');
    // attendance synced for the crew member who had not clocked in; incident raised for the missing tool; unreleased tool not checked out
    const att = db().attendance.find((a) => a.employee_id === mate && a.date === T())!;
    expect(att.job_id).toBe(sc.job.id); expect(att.field_work).toBe(true);
    expect(db().checkouts.some((c) => c.asset_id === sc.tool.id && c.job_id === sc.job.id)).toBe(false);
    expect(db().incidents.some((i) => i.dispatch_id === dp.id && /not available/.test(i.description))).toBe(true);
  });

  it('blocks departure when stock is insufficient', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('STK', db().employees[7].id);
    const dp = D.openDispatch(sc.job.id);
    const have = B.onHand(db(), sc.item.id, sc.item.location_id);
    const items = load(dp.items).map((i) => (i.kind === 'material' ? { ...i, qty: have + 50, loaded_qty: have + 50 } : i));
    expect(() => D.completeDeparture(dp.id, depForm(dp, { items }) as never)).toThrow(/Insufficient stock/);
  });
});

describe('arrival → work → return', () => {
  it('runs a clean trip end to end and closes the job', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('OK1', db().employees[6].id);
    const dp = D.openDispatch(sc.job.id);
    const stock0 = B.onHand(db(), sc.item.id, sc.item.location_id);
    D.completeDeparture(dp.id, depForm(dp) as never);
    expect(stat(sc.job.id)).toBe('Departed from HQ');
    expect(db().assets.find((a) => a.id === sc.eq.id)!.status).toBe('Checked Out');
    expect(db().checkouts.filter((c) => c.job_id === sc.job.id && c.status === 'Released')).toHaveLength(3);
    expect(B.onHand(db(), sc.item.id, sc.item.location_id)).toBe(stock0 - 4);

    expect(() => D.completeArrival(sc.job.id, { ...arrForm, arr_safety_briefing: false })).toThrow(/safety briefing/);
    expect(() => D.completeArrival(sc.job.id, { ...arrForm, arr_photos: [] })).toThrow(/before-work photo/);
    expect(() => D.completeArrival(sc.job.id, { ...arrForm, arr_contact_name: ' ' })).toThrow(/contact/);
    expect(() => D.completeArrival(sc.job.id, { ...arrForm, arr_lat: undefined, arr_lng: undefined })).toThrow(/GPS/);
    D.completeArrival(sc.job.id, arrForm);
    expect(stat(sc.job.id)).toBe('Arrived at Site');
    expect(db().jobs.find((j) => j.id === sc.job.id)!.photos.some((p) => p.kind === 'before')).toBe(true);
    D.startWork(sc.job.id);
    expect(stat(sc.job.id)).toBe('In Progress');

    finishWork(sc.job.id);
    expect(stat(sc.job.id)).toBe('Work Completed');
    D.startReturnChecklist(sc.job.id);
    expect(stat(sc.job.id)).toBe('Return Checklist Pending');

    const good = retItems(dp, (i) => (i.kind === 'material' ? { returned_qty: 1 } : {}));
    expect(() => D.completeReturn(dp.id, retForm(good, { ret_odo: 900 }) as never)).toThrow(/odometer/i);
    expect(() => D.completeReturn(dp.id, retForm(good, { ret_photos: [] }) as never)).toThrow(/return \/ loading photo/);
    expect(() => D.completeReturn(dp.id, retForm(good, { confirmed: false }) as never)).toThrow(/confirmation/);
    expect(() => D.completeReturn(dp.id, retForm(retItems(dp, (i) => (i.kind === 'equipment' ? { ret_photo: undefined } : {}))) as never)).toThrow(/photo of/);
    expect(() => D.completeReturn(dp.id, retForm(good, { ret_veh_condition: 'With Issue' }) as never)).toThrow(/vehicle issue/i);
    const r = D.completeReturn(dp.id, retForm(good) as never);
    expect(r).toMatchObject({ missing: 0, damaged: 0, incidents: 0, distance: 42 });
    expect(r.used).toEqual([expect.objectContaining({ qty: 3 })]); // used = issued 4 − returned 1
    expect(stat(sc.job.id)).toBe('Returned to HQ');
    expect(db().assets.find((a) => a.id === sc.eq.id)!.status).toBe('Available');
    expect(db().assets.find((a) => a.id === sc.veh.id)!.meter_reading).toBe(1042);
    expect(B.onHand(db(), sc.item.id, sc.item.location_id)).toBe(stock0 - 3);
    expect(db().jobs.find((j) => j.id === sc.job.id)!.materials[0].used_qty).toBe(3);
    expect(() => store.update('dispatches', dp.id, { ret_notes: 'edit' })).toThrow(/locked/);
    D.closeJob(sc.job.id);
    expect(stat(sc.job.id)).toBe('Closed');
  });

  it('missing / damaged items raise incidents, tickets and alerts and keep the job open', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('BAD', db().employees[7].id);
    const dp = D.openDispatch(sc.job.id);
    toInProgress(dp, sc.job.id);
    finishWork(sc.job.id); D.startReturnChecklist(sc.job.id);
    const items = retItems(dp, (i) => {
      if (i.asset_id === sc.eq.id) return { ret_condition: 'Damaged' as const, ret_note: 'Cracked pump housing', repair_required: true };
      if (i.asset_id === sc.tool.id) return { returned_qty: 0, ret_note: 'Left on client roof' };
      if (i.kind === 'ppe') return { returned_qty: 0, ret_note: 'Lost' };
      if (i.kind === 'material') return { returned_qty: 2, ret_condition: 'Damaged' as const, ret_note: 'Cap broken, leaked' };
      if (i.kind === 'vehicle') return {};
      return {};
    });
    const r = D.completeReturn(dp.id, retForm(items, { ret_fuel: '1/4', ret_odo: 1030 }) as never);
    expect(r).toMatchObject({ missing: 2, damaged: 2, tickets: 1 });
    const inc = db().incidents.filter((i) => i.dispatch_id === dp.id);
    expect(inc.map((i) => i.type).sort()).toEqual(['Damaged asset', 'Damaged asset'.replace('Damaged asset', 'Missing PPE'), 'Missing asset', 'Other'].sort());
    expect(inc.every((i) => i.status === 'Open' && i.auto)).toBe(true);
    expect(db().assets.find((a) => a.id === sc.tool.id)!.status).toBe('Missing');
    expect(db().assets.find((a) => a.id === sc.eq.id)!.status).toBe('Damaged');
    expect(db().tickets.some((t) => t.asset_id === sc.eq.id && t.source === 'Damage report')).toBe(true);
    expect(B.onHand(db(), sc.item.id, sc.item.location_id)).toBeGreaterThan(0);
    // alerts to Admin and Operations
    const alerts = db().notifications.filter((n) => n.type === 'incident' && n.title.includes('Missing asset'));
    expect(alerts.length).toBeGreaterThan(0); expect(alerts[0].for_roles).toEqual(expect.arrayContaining(['owner', 'ops']));
    expect(db().notifications.map((n) => n.title)).toContain('Refuel vehicle');
    // job stays open until incidents are resolved or acknowledged
    expect(stat(sc.job.id)).toBe('Returned to HQ');
    expect(() => D.closeJob(sc.job.id)).toThrow(/still open/);
    // a missing asset cannot be assigned elsewhere
    expect(() => A.requestCheckout({ asset_id: sc.tool.id, job_id: sc.job.id, responsible_id: db().employees[0].id, expected_return: '2030-01-03T10:00' })).toThrow(/missing/);
    await as('leader@topmop.ph');
    expect(() => D.acknowledgeIncident(inc[0].id, 'x')).toThrow(/not permitted/);
    await as('ops@topmop.ph');
    expect(() => D.acknowledgeIncident(inc[0].id, '')).toThrow(/note/);
    for (const i of inc) {
      if (i.type === 'Missing asset') D.resolveIncident(i.id, 'Recovered from the roof', 'found');
      else D.acknowledgeIncident(i.id, 'Noted; repair ticket opened');
    }
    expect(db().assets.find((a) => a.id === sc.tool.id)!.status).toBe('Available');
    D.closeJob(sc.job.id);
    expect(stat(sc.job.id)).toBe('Closed');
  });
});

describe('equipment release and permissions', () => {
  it('lets a team leader dispatch only after Operations releases the equipment', async () => {
    await as('leader@topmop.ph');
    const lead = store.user!.employee_id!;
    await as('owner@topmop.ph');
    const sc = scenario('LDR', lead);
    await as('leader@topmop.ph');
    const dp = D.openDispatch(sc.job.id);
    const form = depForm(dp, { crew_present: [lead] });
    expect(() => D.completeDeparture(dp.id, form as never)).toThrow(/Waiting for Operations/);
    expect(db().checkouts.filter((c) => c.job_id === sc.job.id && c.status === 'Requested').length).toBe(3);
    await as('ops@topmop.ph');
    for (const c of db().checkouts.filter((x) => x.job_id === sc.job.id && x.status === 'Requested')) A.releaseCheckout(c.id, { condition: 'Good', photos: [] });
    await as('leader@topmop.ph');
    D.completeDeparture(dp.id, form as never);
    expect(stat(sc.job.id)).toBe('Departed from HQ');
    D.completeArrival(sc.job.id, arrForm);
    D.startWork(sc.job.id);
    expect(stat(sc.job.id)).toBe('In Progress');
  });

  it('field employees can view but not complete; only the assigned leader or a manager can run', async () => {
    await as('owner@topmop.ph');
    const other = db().employees.find((e) => e.tier === 'Technician' && e.status === 'regular')!;
    const sc = scenario('OTH', other.id);
    await as('leader@topmop.ph');
    expect(() => D.openDispatch(sc.job.id)).toThrow(/assigned Team Leader/);
    await as('field@topmop.ph');
    expect(store.can('dispatch.view')).toBe(true); expect(store.can('dispatch.run')).toBe(false);
    expect(() => D.openDispatch(sc.job.id)).toThrow(/not permitted/);
  });
});

describe('edits require a reason and are audited', () => {
  it('records user, time, old value, new value and reason', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('AUD', db().employees[4].id);
    const dp = D.openDispatch(sc.job.id);
    toInProgress(dp, sc.job.id);
    finishWork(sc.job.id); D.startReturnChecklist(sc.job.id);
    D.completeReturn(dp.id, retForm(retItems(dp, (i) => (i.kind === 'material' ? { returned_qty: 0 } : {}))) as never);
    // leaders cannot edit a finished record
    await as('leader@topmop.ph');
    expect(() => D.correctDispatch(dp.id, { ret_odo: 1100 }, 'x')).toThrow(/not permitted/);
    await as('ops@topmop.ph');
    expect(() => D.correctDispatch(dp.id, { ret_odo: 1100 }, '  ')).toThrow(/reason/);
    D.correctDispatch(dp.id, { ret_odo: 1100 }, 'Odometer mistyped; checked against dashboard photo');
    const e = db().audit.find((a) => a.record_id === dp.id && a.reason)!;
    expect(e.reason).toMatch(/mistyped/); expect(e.user_name).toBeTruthy(); expect(e.at).toBeTruthy();
    expect((e.before as Record<string, unknown>).ret_odo).toBe(1042); expect((e.after as Record<string, unknown>).ret_odo).toBe(1100);
    // status override needs a reason, permission and is logged
    await as('leader@topmop.ph');
    expect(() => D.overrideJobStatus(sc.job.id, 'Closed', 'x')).toThrow(/not permitted/);
    await as('owner@topmop.ph');
    expect(() => D.overrideJobStatus(sc.job.id, 'Closed', '')).toThrow(/reason/);
    D.overrideJobStatus(sc.job.id, 'Closed', 'Closed by Admin after phone confirmation');
    const o = db().audit.find((a) => a.record_id === sc.job.id && a.reason?.includes('phone'))!;
    expect((o.before as Record<string, unknown>).status).toBe('Returned to HQ'); expect((o.after as Record<string, unknown>).status).toBe('Closed');
  });
});
