import { beforeAll, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });

import { today as nowToday } from './util';
type S = typeof import('./store'); type W = typeof import('./workflow'); type A = typeof import('./actions'); type B = typeof import('./business'); type Q = typeof import('./qr');
import type { CheckItem, JobWorkflow } from './types';
let store: S['store']; let W: W; let A: A; let B: B; let Q: Q;
beforeAll(async () => { const s = await import('./store'); store = s.store; W = await import('./workflow'); A = await import('./actions'); B = await import('./business'); Q = await import('./qr'); });
const db = () => store.getDB();
const as = (e: string) => store.login(e, 'topmop123');
const T = () => nowToday();
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const stat = (id: string) => db().jobs.find((j) => j.id === id)!.status;
const wfOf = (jobId: string) => db().workflows.find((w) => w.job_id === jobId)!;

function scenario(label: string, leaderEmp: string, crew: string[] = []) {
  const mkAsset = (code: string, category: string, extra = {}) => store.insert('assets', { code, name: `${label} ${code}`, category, brand: 'X', model: 'Y', serial: code, purchase_date: '2025-01-01', purchase_cost: 1000, condition: 'Good', location: 'Main Warehouse', maintenance_interval_days: 0, status: 'Available', daily_allocation: 0, ...extra } as never) as { id: string };
  const veh = mkAsset(`${label}-VEH`, 'Vehicle', { meter_reading: 1000, meter_unit: 'km' });
  const eq = mkAsset(`${label}-EQ`, 'Pressure Washer');
  const tool = mkAsset(`${label}-TL`, 'Ladder');
  const item = db().items.find((i) => i.category === 'Chemical')!;
  const client = db().clients[0]; const site = db().sites.find((s) => s.client_id === client.id)!;
  const job = store.insert('jobs', { number: `JOB-${label}`, client_id: client.id, site_id: site.id, branch_id: client.branch_id, service_codes: ['WALL'], scope: 'Test scope', start_at: '2030-01-02T08:00', end_at: '2030-01-02T17:00', status: 'Confirmed', leader_id: leaderEmp, crew_ids: crew, vehicle_id: veh.id, equipment_ids: [eq.id, tool.id], materials: [{ item_id: item.id, planned_qty: 4 }], ppe: ['Hard hat'], checklist: [], photos: [], findings: '', damage_report: '', equipment_condition_notes: '', contract_amount: 1000, estimated_cost: 500 } as never) as { id: string };
  return { job, veh, eq, tool, item };
}
const load = (items: CheckItem[]): CheckItem[] => items.map((i) => ({ ...i, out_ok: true, out_by: 'scan', loaded_qty: i.qty, ...(i.kind === 'material' ? { out_container: 'Good' as const } : { out_condition: 'Good' as const }) }));
const hqForm = (wf: JobWorkflow, over: Record<string, unknown> = {}) => ({ items: load(wf.items), hq_odo: 1000, hq_fuel: '3/4' as const, hq_veh_condition: 'Good' as const, hq_veh_photo: PNG, confirmed: true, ...over });
const arrForm = (present: string[], over = {}) => ({ lat: 14.6, lng: 121, photos: [PNG], contact_name: 'Ms. Reyes', present, absent: [], ...over });
const retItems = (wf: JobWorkflow, f: (i: CheckItem) => Partial<CheckItem>) => db().workflows.find((w) => w.id === wf.id)!.items.map((i) => ({ ...i, ret_condition: 'Good' as const, returned_qty: i.kind === 'material' ? 0 : i.loaded_qty, ...f(i) }));
const reportForm = { scope: 'Wall cleaning', method: 'Pressure wash', findings: 'ok', client_name: 'Ms. Reyes', client_sig: PNG, tm_name: 'Leader', tm_sig: PNG };

function upToStart(label: string, leaderEmp: string, hqOver = {}) {
  const sc = scenario(label, leaderEmp);
  const wf = W.openWorkflow(sc.job.id);
  W.completeHqChecklist(wf.id, hqForm(wf, hqOver) as never);
  W.dispatchJob(wf.id, { lat: 14.55, lng: 121.02, confirmed: true });
  W.arriveAtSite(wf.id, arrForm([leaderEmp]));
  W.signConforme(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true });
  W.startWork(wf.id, { present: [leaderEmp], safety: true, ppe: true, photos: [PNG], confirmed: true });
  return { ...sc, wf };
}
const addAfter = (jobId: string) => store.update('jobs', jobId, { photos: [...db().jobs.find((j) => j.id === jobId)!.photos, { kind: 'after', caption: 'a', data: PNG, taken_at: '2030-01-02T15:00' }] } as never);

describe('QR codes', () => {
  it('round-trips asset codes and accepts plain typed codes', () => {
    expect(Q.parseQr(Q.qrPayload('wfp-001'))).toBe('WFP-001');
    expect(Q.parseQr('  pwr-002 ')).toBe('PWR-002');
  });
});

describe('workflow tracker & gating', () => {
  it('only confirmed jobs open the workflow; later steps are locked until earlier ones are done', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('GATE', db().employees[3].id);
    store.update('jobs', sc.job.id, { status: 'Pending' } as never);
    expect(() => W.openWorkflow(sc.job.id)).toThrow(/Confirm the booking/);
    store.update('jobs', sc.job.id, { status: 'Confirmed' } as never);
    const wf = W.openWorkflow(sc.job.id);
    expect(stat(sc.job.id)).toBe('Dispatch Checklist Pending');
    expect(W.openWorkflow(sc.job.id).id).toBe(wf.id);
    expect(wf.items.map((i) => i.kind).sort()).toEqual(['equipment', 'material', 'ppe', 'tool', 'vehicle']);
    expect(() => A.setJobStatus(sc.job.id, 'In Progress')).toThrow(/job workflow/);
    expect(() => W.dispatchJob(wf.id, { lat: 1, lng: 1, confirmed: true })).toThrow(/HQ equipment checklist/);
    expect(() => W.arriveAtSite(wf.id, arrForm([]))).toThrow(/Dispatch the crew/);
    expect(() => W.signConforme(wf.id, { name: 'x', signature: PNG, confirmed: true })).toThrow(/arrival/);
    expect(() => W.startWork(wf.id, { present: ['x'], safety: true, ppe: true, photos: [PNG], confirmed: true })).toThrow(/conforme/);
    expect(() => W.signServiceReport(wf.id, reportForm)).toThrow(/Start the work/);
    expect(() => W.completeReturnCheck(wf.id, { items: wf.items, photos: [PNG], confirmed: true })).toThrow(/service report/);
    expect(() => W.leaveSite(wf.id, { lat: 1, lng: 1, confirmed: true })).toThrow(/return equipment check/);
    expect(() => W.closeJob(sc.job.id)).toThrow(/cannot be closed yet/);
    const p = B.workflowProgress(wfOf(sc.job.id));
    expect(p.map((x) => x.state)[0]).toBe('current');
  });

  it('runs all 11 steps, updating job status, equipment status, stock and attendance', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const mine = db().attendance.filter((a) => a.employee_id === lead && a.date === T() && !a.deleted_at);
    if (mine.length) for (const a of mine) store.update('attendance', a.id, { job_id: undefined, field_work: false } as never);
    else store.insert('attendance', { employee_id: lead, date: T(), kind: 'Present', clock_in: `${T()}T07:50`, field_work: false, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0, approval: 'Pending' } as never);
    const sc = scenario('FULL', lead);
    const wf = W.openWorkflow(sc.job.id);
    const onHandBefore = B.onHand(db(), sc.item.id);
    W.completeHqChecklist(wf.id, hqForm(wf) as never);
    expect(db().assets.find((a) => a.id === sc.eq.id)!.status).toBe('In Use');
    expect(db().assets.find((a) => a.id === sc.veh.id)!.status).toBe('In Use');
    expect(B.onHand(db(), sc.item.id)).toBe(onHandBefore - 4);
    expect(wfOf(sc.job.id).hq_by).toBe(store.user!.id);
    W.dispatchJob(wf.id, { lat: 14.55, lng: 121.02, confirmed: true });
    expect(stat(sc.job.id)).toBe('Dispatched');
    const attBefore = db().attendance.filter((a) => a.employee_id === lead && a.date === T() && !a.deleted_at).length;
    W.arriveAtSite(wf.id, arrForm([lead]));
    expect(stat(sc.job.id)).toBe('On Site');
    const att = db().attendance.filter((a) => a.employee_id === lead && a.date === T() && !a.deleted_at);
    expect(att.length).toBe(attBefore);              // no duplicate attendance record
    expect(att.some((a) => a.job_id === sc.job.id)).toBe(true);
    W.signConforme(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true });
    expect(() => W.signConforme(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true })).toThrow(/already signed/);
    W.startWork(wf.id, { present: [lead], safety: true, ppe: true, photos: [PNG], confirmed: true });
    expect(stat(sc.job.id)).toBe('In Progress');
    addAfter(sc.job.id);
    W.signServiceReport(wf.id, reportForm);
    expect(stat(sc.job.id)).toBe('Work Completed');
    expect(db().jobs.find((j) => j.id === sc.job.id)!.signoff_name).toBe('Ms. Reyes');
    const sum = W.completeReturnCheck(wf.id, { items: retItems(wf, (i) => (i.kind === 'material' ? { returned_qty: 1 } : {})) as never, photos: [PNG], confirmed: true });
    expect(sum.incidents).toBe(0);
    expect(sum.used[0].qty).toBe(3);                 // used = issued − returned
    expect(B.onHand(db(), sc.item.id)).toBe(onHandBefore - 3);
    expect(db().assets.find((a) => a.id === sc.eq.id)!.status).toBe('In Use');   // still on the truck until HQ
    expect(() => W.closeJob(sc.job.id)).toThrow(/cannot be closed yet/);
    W.leaveSite(wf.id, { lat: 14.6, lng: 121, confirmed: true });
    expect(stat(sc.job.id)).toBe('Leaving Site');
    expect(() => W.arriveAtHq(wf.id, { lat: 1, lng: 1, odo: 900, fuel: '1/2', veh_condition: 'Good', equipment_ok: true, confirmed: true })).toThrow(/cannot be lower/);
    W.arriveAtHq(wf.id, { lat: 14.55, lng: 121.02, odo: 1042, fuel: '1/2', veh_condition: 'Good', equipment_ok: true, confirmed: true });
    expect(stat(sc.job.id)).toBe('Arrived at HQ');
    expect(db().assets.find((a) => a.id === sc.eq.id)!.status).toBe('Available');
    expect(db().assets.find((a) => a.id === sc.veh.id)!.meter_reading).toBe(1042);
    expect(wfOf(sc.job.id).distance_km).toBe(42);
    W.closeJob(sc.job.id, 'all good');
    expect(stat(sc.job.id)).toBe('Closed');
    expect(() => store.update('workflows', wf.id, { hq_notes: 'x' } as never)).toThrow(/locked/);
    expect(B.workflowProgress(wfOf(sc.job.id)).every((p) => p.state === 'done' || p.state === 'open' || p.state === 'locked')).toBe(true);
  });

  it('HQ checklist: shortages need a reason and raise incidents; damaged tools get a ticket', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('HQS', db().employees[3].id);
    const wf = W.openWorkflow(sc.job.id);
    const items = load(wf.items).map((i) => (i.asset_id === sc.tool.id ? { ...i, out_condition: 'Damaged' as const, out_photo: PNG, out_note: 'bent rail' } : i.kind === 'ppe' ? { ...i, loaded_qty: 0 } : i));
    expect(() => W.completeHqChecklist(wf.id, hqForm(wf, { items }) as never)).toThrow(/Enter a reason/);
    W.completeHqChecklist(wf.id, hqForm(wf, { items, hq_shortage_reason: 'Spare ladder at supplier' }) as never);
    const inc = db().incidents.filter((i) => i.workflow_id === wf.id);
    expect(inc.some((i) => i.type === 'Damaged asset' && i.ticket_id)).toBe(true);
    expect(inc.some((i) => i.type === 'Missing PPE')).toBe(true);
    expect(db().assets.find((a) => a.id === sc.tool.id)!.status).toBe('Damaged');
  });

  it('attendance: every crew member must be confirmed present or absent with a reason', async () => {
    await as('owner@topmop.ph');
    const [lead, crew] = [db().employees[3].id, db().employees[4].id];
    const sc = scenario('ATT', lead, [crew]);
    const wf = W.openWorkflow(sc.job.id);
    W.completeHqChecklist(wf.id, hqForm(wf) as never);
    W.dispatchJob(wf.id, { lat: 1, lng: 1, confirmed: true });
    expect(() => W.arriveAtSite(wf.id, arrForm([lead]))).toThrow(/Confirm attendance/);
    expect(() => W.arriveAtSite(wf.id, arrForm([lead], { absent: [{ id: crew, reason: '' }] }))).toThrow(/Confirm attendance/);
    W.arriveAtSite(wf.id, arrForm([lead], { absent: [{ id: crew, reason: 'Sick leave' }] }));
    expect(wfOf(sc.job.id).arr_crew_absent).toEqual([{ id: crew, reason: 'Sick leave' }]);
  });
});

describe('panel counting & variations', () => {
  it('totals external, internal and overall panels automatically', () => {
    const rows = [{ id: 'a', area: '1st Floor', side: 'Front', external: 10, internal: 4 }, { id: 'b', area: 'Roof Deck', side: 'Rear', external: 6, internal: 0, additional: true }];
    expect(B.panelTotals(rows)).toEqual({ external: 16, internal: 4, total: 20, additional: 6 });
    expect(B.countPanels([{ w: 2, h: 1, qty: 3 }, { w: 2.5, h: 1.2, qty: 2 }, { w: 1, h: 0.5, qty: 7, grouped: true }], 4).panels).toBe(3 + 4 + 2);
  });

  it('keeps the original quotation unchanged; approved variations raise the final contract value', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const { job, wf } = upToStart('VAR', lead);
    const q = db().quotations[0];
    store.update('jobs', job.id, { quotation_id: q.id, contract_amount: B.docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).net } as never);
    const origJson = JSON.stringify(db().quotations.find((x) => x.id === q.id));
    const before = B.finalContract(db(), db().jobs.find((j) => j.id === job.id)!);
    const v = W.createVariation(job.id, { reason: 'Extra panels', items: [{ service_code: 'GLASS_EXT', description: 'Extra', qty: 8, unit: 'panel', rate: 140, discount: 0 }], discount: 0, vat_mode: 'exclusive', vat_rate: 12, panel_row_ids: [] });
    expect(v.number).toBe(`${db().jobs.find((j) => j.id === job.id)!.number}-V1`);
    expect(() => W.signServiceReport(wf.id, reportForm)).toThrow(/waiting for client approval/);
    expect(() => W.approveVariation(v.id, { client_name: 'Ms. Reyes' })).toThrow(/signature/);
    W.approveVariation(v.id, { client_name: 'Ms. Reyes', signature: PNG });
    const after = B.finalContract(db(), db().jobs.find((j) => j.id === job.id)!);
    expect(after.variationsNet).toBe(1120);
    expect(after.finalNet).toBe(before.originalNet + 1120);
    expect(after.originalTotal).toBe(before.originalTotal);
    expect(db().jobs.find((j) => j.id === job.id)!.contract_amount).toBe(after.finalNet);
    expect(JSON.stringify(db().quotations.find((x) => x.id === q.id))).toBe(origJson);
    expect(() => store.update('variations', v.id, { reason: 'changed' } as never)).toThrow(/locked/);
    addAfter(job.id);
    W.signServiceReport(wf.id, reportForm);
    expect(() => W.createVariation(job.id, { reason: 'Late', items: [{ service_code: 'WALL', description: 'x', qty: 1, unit: 'lot', rate: 1, discount: 0 }], discount: 0, vat_mode: 'none', vat_rate: 0, panel_row_ids: [] })).toThrow(/signed/);
  });
});

describe('return check, incidents and closure', () => {
  it('missing / damaged equipment raises incidents and tickets; closure waits for acknowledgement', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const { job, wf, eq, tool } = upToStart('RET', lead);
    addAfter(job.id);
    W.signServiceReport(wf.id, reportForm);
    const items = retItems(wf, (i) => (i.asset_id === eq.id ? { returned_qty: 0, ret_condition: 'Missing' as const, ret_note: 'Left at site' } : i.asset_id === tool.id ? { ret_condition: 'Damaged' as const, ret_note: 'Bent rail', ret_photo: PNG } : {})) as never;
    const r = W.completeReturnCheck(wf.id, { items, photos: [PNG], confirmed: true });
    expect(r.missing).toBe(1); expect(r.damaged).toBe(1); expect(r.tickets).toBe(1);
    expect(db().assets.find((a) => a.id === eq.id)!.status).toBe('Missing');
    expect(db().assets.find((a) => a.id === tool.id)!.status).toBe('Damaged');
    expect(db().incidents.filter((i) => i.workflow_id === wf.id && ['Missing asset', 'Damaged asset'].includes(i.type)).length).toBe(2);
    W.leaveSite(wf.id, { lat: 1, lng: 1, confirmed: true });
    W.arriveAtHq(wf.id, { lat: 1, lng: 1, odo: 1010, fuel: '1/2', veh_condition: 'Good', equipment_ok: true, confirmed: true });
    expect(() => W.closeJob(job.id)).toThrow(/incidents acknowledged/);
    for (const i of db().incidents.filter((x) => x.workflow_id === wf.id)) W.acknowledgeIncident(i.id, 'Reviewed by Operations');
    W.closeJob(job.id);
    expect(stat(job.id)).toBe('Closed');
    expect(db().assets.find((a) => a.id === eq.id)!.status).toBe('Missing');   // stays Missing until resolved
  });

  it('a vehicle issue at HQ opens a maintenance ticket and puts the vehicle Under Maintenance', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const { job, wf, veh } = upToStart('VEH', lead);
    addAfter(job.id);
    W.signServiceReport(wf.id, reportForm);
    W.completeReturnCheck(wf.id, { items: retItems(wf, () => ({})) as never, photos: [PNG], confirmed: true });
    W.leaveSite(wf.id, { lat: 1, lng: 1, confirmed: true });
    expect(() => W.arriveAtHq(wf.id, { lat: 1, lng: 1, odo: 1010, fuel: '1/4', veh_condition: 'With Issue', equipment_ok: true, confirmed: true })).toThrow(/Describe the vehicle issue/);
    W.arriveAtHq(wf.id, { lat: 1, lng: 1, odo: 1010, fuel: '1/4', veh_condition: 'With Issue', veh_notes: 'Warning light', equipment_ok: true, confirmed: true });
    expect(db().assets.find((a) => a.id === veh.id)!.status).toBe('Under Maintenance');
    expect(db().tickets.some((t) => t.asset_id === veh.id && t.status === 'Open')).toBe(true);
  });

  it('field staff cannot complete steps on jobs they are not assigned to; status override needs a reason', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('PERM', db().employees[3].id);
    const wf = W.openWorkflow(sc.job.id);
    await as('field@topmop.ph');
    expect(() => W.completeHqChecklist(wf.id, hqForm(wf) as never)).toThrow();
    await as('owner@topmop.ph');
    expect(() => W.overrideJobStatus(sc.job.id, 'Closed', '  ')).toThrow(/reason/);
    W.overrideJobStatus(sc.job.id, 'Closed', 'Admin close');
    expect(db().audit.find((a) => a.record_id === sc.job.id && a.reason === 'Admin close')).toBeTruthy();
  });
});

describe('Client Final Quote Review', () => {
  const upToArrival = (label: string, leaderEmp: string) => {
    const sc = scenario(label, leaderEmp);
    const q = db().quotations.find((x) => x.status === 'Approved')!;
    store.update('jobs', sc.job.id, { quotation_id: q.id, contract_amount: B.docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).net } as never);
    const wf = W.openWorkflow(sc.job.id);
    W.completeHqChecklist(wf.id, hqForm(wf) as never);
    W.dispatchJob(wf.id, { lat: 1, lng: 1, confirmed: true });
    W.arriveAtSite(wf.id, arrForm([leaderEmp]));
    return { ...sc, wf, q };
  };
  const glass = { service_code: 'GLASS_EXT' as const, category: 'glass' as const, description: '', qty: 0, unit: 'panel', rate: 140, discount: 0, linked_panels: true };
  const solar = { service_code: 'SOLAR' as const, category: 'solar' as const, description: 'Solar panels – carport', qty: 14, unit: 'panel', rate: 245, discount: 0 };
  const panels = [{ id: 'p1', area: '1st Floor', side: 'Front', external: 10, internal: 2 }, { id: 'p2', area: 'Roof Deck', side: 'Rear', external: 6, internal: 2, additional: true }];

  it('uses the price-list defaults, applies minimums and links glass to the panel table', async () => {
    await as('owner@topmop.ph');
    const sv = db().services;
    expect(B.categoryDefaults(sv, 'glass')).toMatchObject({ rate: 140, min: 0 });
    expect(B.categoryDefaults(sv, 'solar')).toMatchObject({ rate: 245, min: 20 });
    expect(B.categoryDefaults(sv, 'floor')).toMatchObject({ rate: 125, min: 50 });
    expect(B.categoryDefaults(sv, 'wall')).toMatchObject({ rate: 125, min: 50 });
    expect(B.categoryDefaults(sv, 'roof')).toMatchObject({ rate: 145, min: 100 });
    const [g, s] = B.resolveReviewItems(db(), panels, [glass, solar]);
    expect(g.qty).toBe(8); expect(g.description).toContain('6 external, 2 internal');
    expect(s.qty).toBe(20); expect(s.entered_qty).toBe(14);       // minimum 20 panels billed
    expect(B.panelBreakdown(db(), undefined, panels)).toMatchObject({ additional: 8, external: 16, internal: 4, total: 20 });
    expect(B.lineTotals(s, 'exclusive', 12)).toMatchObject({ amount: 4900, vat: 588, total: 5488 });
  });

  it('only an Operations Manager / Admin may change a default rate or give a discount', async () => {
    await as('owner@topmop.ph');
    const lead = db().users.find((u) => u.email === 'leader@topmop.ph')!.employee_id!;
    const { wf } = upToArrival('FQR1', lead);
    W.savePanels(wf.id, panels);
    await as('leader@topmop.ph');
    expect(() => W.saveFinalReview(wf.id, { items: [{ ...solar, rate: 200 }] })).toThrow(/price list/);
    expect(() => W.saveFinalReview(wf.id, { items: [{ ...solar, discount: 100 }] })).toThrow(/discount/);
    W.saveFinalReview(wf.id, { items: [glass, solar] });
    await as('owner@topmop.ph');
    W.saveFinalReview(wf.id, { items: [glass, { ...solar, rate: 200, discount: 100 }] });
    expect(db().variations.filter((v) => v.job_id === wf.job_id && v.source === 'final_review').length).toBe(1);   // updated, not duplicated
  });

  it('approve & sign: change order, final total, deposit, audit; original quote untouched; no extra work before approval', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const { wf, job, q } = upToArrival('FQR2', lead);
    W.savePanels(wf.id, panels);
    const origJson = JSON.stringify(db().quotations.find((x) => x.id === q.id));
    const before = B.finalContract(db(), db().jobs.find((j) => j.id === job.id)!);
    W.saveFinalReview(wf.id, { items: [glass, solar], deposit: 1000, deposit_note: 'OR-1' });
    expect(() => W.signConforme(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true })).toThrow(/Final Quote Review/);
    expect(() => W.startWork(wf.id, { present: [lead], safety: true, ppe: true, photos: [PNG], confirmed: true })).toThrow(/conforme/);
    W.requestFinalQuoteRevision(wf.id, 'Remove the solar panels');
    expect(() => W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true })).toThrow(/revision/);
    W.saveFinalReview(wf.id, { items: [glass], deposit: 1000, deposit_note: 'OR-1' });          // re-presented
    expect(() => W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', confirmed: true })).toThrow(/signature/);
    W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true, lat: 14.55, lng: 121.02, device: 'iPad · 1024×768' });
    const v = db().variations.find((x) => x.job_id === job.id && x.source === 'final_review')!;
    expect(v.status).toBe('Approved'); expect(v.items[0].qty).toBe(8);
    expect(v).toMatchObject({ client_name: 'Ms. Reyes', sign_lat: 14.55, sign_device: 'iPad · 1024×768' }); expect(v.signed_at).toBeTruthy();
    const w = wfOf(job.id);
    expect(w).toMatchObject({ conf_name: 'Ms. Reyes', conf_lat: 14.55, conf_device: 'iPad · 1024×768', conf_variation_id: v.id });
    const add = B.variationTotals(v);
    expect(add.net).toBe(1120);
    const sm = B.finalQuoteSummary(db(), db().jobs.find((j) => j.id === job.id)!, { deposit: w.conf_deposit });
    expect(sm.finalTotal).toBe(Math.round((before.originalTotal + add.total) * 100) / 100);
    expect(sm.balance).toBe(Math.round((sm.finalTotal - 1000) * 100) / 100);
    expect(w.conf_final_total).toBe(sm.finalTotal);
    expect(db().jobs.find((j) => j.id === job.id)!.contract_amount).toBe(before.originalNet + 1120);
    expect(JSON.stringify(db().quotations.find((x) => x.id === q.id))).toBe(origJson);
    expect(() => store.update('variations', v.id, { reason: 'x' } as never)).toThrow(/locked/);
    expect(db().audit.some((a) => a.record_id === v.id && /approved by Ms. Reyes/.test(a.summary))).toBe(true);
    // syncs to the invoice
    store.update('jobs', job.id, { status: 'Closed' } as never);
    const inv = A.invoiceFromJob(job.id);
    expect(inv.items.some((i) => i.description.startsWith(v.number))).toBe(true);
    expect(inv.notes).toMatch(/Deposit/);
    expect(B.invoiceTotals(inv).total).toBe(sm.finalTotal);
  });

  it('declining keeps a record of what was offered but removes it from the bill; the original can still be signed', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const { wf, job } = upToArrival('FQR3', lead);
    W.saveFinalReview(wf.id, { items: [solar] });
    expect(() => W.saveFinalReview(wf.id, { items: [solar], deposit: 99999999 })).toThrow(/deposit/);
    W.declineAdditionalWork(wf.id, { client_name: 'Ms. Reyes', reason: 'Too expensive' });
    const v = db().variations.find((x) => x.job_id === job.id && x.source === 'final_review')!;
    expect(v.status).toBe('Rejected'); expect(v.notes).toBe('Too expensive'); expect(v.items.length).toBe(1);
    const fc = B.finalContract(db(), db().jobs.find((j) => j.id === job.id)!);
    expect(fc.variationsTotal).toBe(0); expect(fc.finalTotal).toBe(fc.originalTotal);
    W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true });
    expect(wfOf(job.id).conf_variation_id).toBeUndefined();
    expect(wfOf(job.id).conf_final_total).toBe(fc.originalTotal);
    expect(() => store.update('variations', v.id, { notes: 'x' } as never)).not.toThrow;   // declined record stays on file
  });
});
