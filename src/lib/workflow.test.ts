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
const PNG = 'data:image/png;base64,iVBORw0KGgo=';   // signature stand-in
const stat = (id: string) => db().jobs.find((j) => j.id === id)!.status;
const wfOf = (jobId: string) => db().workflows.find((w) => w.job_id === jobId)!;

function scenario(label: string, leaderEmp: string, crew: string[] = []) {
  const mkAsset = (code: string, category: string, extra = {}) => store.insert('assets', { code, name: `${label} ${code}`, category, brand: 'X', model: 'Y', serial: code, purchase_date: '2025-01-01', purchase_cost: 1000, condition: 'Good', location: 'Main Warehouse', maintenance_interval_days: 0, status: 'Available', daily_allocation: 0, ...extra } as never) as { id: string };
  const veh = mkAsset(`${label}-VEH`, 'Vehicle', { meter_reading: 1000, meter_unit: 'km' });
  const eq = mkAsset(`${label}-EQ`, 'Pressure Washer');
  const tool = mkAsset(`${label}-TL`, 'Ladder');
  const item = db().items.find((i) => i.category === 'Chemical')!;
  store.insert('stock', { item_id: item.id, type: 'Purchase', qty: 10, unit_cost: item.cost, location_id: item.location_id, date: nowToday(), approval: 'Approved', reason: 'test stock' } as never);
  const client = db().clients[0]; const site = db().sites.find((s) => s.client_id === client.id)!;
  const job = store.insert('jobs', { number: `JOB-${label}`, client_id: client.id, site_id: site.id, branch_id: client.branch_id, service_codes: ['WALL'], scope: 'Test scope', start_at: '2030-01-02T08:00', end_at: '2030-01-02T17:00', status: 'Confirmed', leader_id: leaderEmp, crew_ids: crew, vehicle_id: veh.id, equipment_ids: [eq.id, tool.id], materials: [{ item_id: item.id, planned_qty: 4 }], ppe: ['Hard hat'], checklist: [], findings: '', damage_report: '', equipment_condition_notes: '', contract_amount: 1000, estimated_cost: 500 } as never) as { id: string };
  return { job, veh, eq, tool, item };
}
const load = (items: CheckItem[]): CheckItem[] => items.map((i) => ({ ...i, out_ok: true, out_by: 'scan', loaded_qty: i.qty, ...(i.kind === 'material' ? { out_container: 'Good' as const } : { out_condition: 'Good' as const }) }));
const prepForm = (wf: JobWorkflow, over: Record<string, unknown> = {}) => ({ items: load(wf.items), confirmed: true, ...over });
const checkIn = (present: string[], over = {}) => ({ contact_name: 'Ms. Reyes', present, absent: [], ...over });
const retItems = (wf: JobWorkflow, f: (i: CheckItem) => Partial<CheckItem>) => db().workflows.find((w) => w.id === wf.id)!.items.map((i) => ({ ...i, ret_condition: 'Good' as const, returned_qty: i.kind === 'material' ? 0 : i.loaded_qty, ...f(i) }));
const handover = { scope: 'Wall cleaning', findings: 'None', recs: 'None', limits: 'None', client_name: 'Ms. Reyes', client_sig: PNG, tm_name: 'Leader', tm_sig: PNG, satisfaction: { rating: 3 as const } };
const priorJob = (label: string, jobId: string) => { const j = db().jobs.find((x) => x.id === jobId)!; store.insert('jobs', { ...j, id: undefined, number: `PRIOR-${label}`, status: 'Closed', start_at: '2029-01-02T08:00', end_at: '2029-01-02T17:00' } as never); };

/** Prep → dispatch → check-in (recurring jobs get a prior closed visit so the scope can simply be confirmed). */
function upToCheckIn(label: string, leaderEmp: string, recurring = true) {
  const sc = scenario(label, leaderEmp);
  const q = db().quotations.find((x) => x.status === 'Approved')!;
  store.update('jobs', sc.job.id, { quotation_id: q.id, contract_amount: B.docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).net } as never);
  if (recurring) priorJob(label, sc.job.id);
  else store.update('jobs', sc.job.id, { start_at: '2000-01-02T08:00', end_at: '2000-01-02T17:00' } as never);   // earlier than any other visit → a new job
  const wf = W.openWorkflow(sc.job.id);
  W.completeHqChecklist(wf.id, prepForm(wf) as never);
  W.dispatchJob(wf.id, { confirmed: true });
  W.arriveAtSite(wf.id, checkIn([leaderEmp]));
  return { ...sc, wf, q };
}
function upToWork(label: string, leaderEmp: string) {
  const r = upToCheckIn(label, leaderEmp);
  W.confirmScopeNoChanges(r.wf.id);
  W.startWork(r.wf.id, {});
  return r;
}
function upToHandover(label: string, leaderEmp: string) {
  const r = upToWork(label, leaderEmp);
  W.finishWork(r.wf.id, {});
  W.signServiceReport(r.wf.id, handover);
  return r;
}

describe('QR codes', () => {
  it('round-trips asset codes and accepts plain typed codes', () => {
    expect(Q.parseQr(Q.qrPayload('wfp-001'))).toBe('WFP-001');
    expect(Q.parseQr('  pwr-002 ')).toBe('PWR-002');
  });
});

describe('7-step workflow: gating', () => {
  it('has exactly the seven steps and locks each one until the previous is done', async () => {
    expect(B.WORKFLOW_STEPS).toEqual(['Job Prep at HQ', 'Dispatch', 'Site Check-In', 'Scope Approval', 'Work in Progress', 'Client Handover', 'Close-Out']);
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
    expect(() => W.dispatchJob(wf.id, { confirmed: true })).toThrow(/job prep/);
    expect(() => W.arriveAtSite(wf.id, checkIn([]))).toThrow(/Dispatch the crew/);
    expect(() => W.confirmScopeNoChanges(wf.id)).toThrow(/Check in/);
    expect(() => W.startWork(wf.id, {})).toThrow(/scope is approved/);
    expect(() => W.finishWork(wf.id, {})).toThrow(/Start the work/);
    expect(() => W.signServiceReport(wf.id, handover)).toThrow(/Finish the work/);
    expect(() => W.completeCloseOut(wf.id, { items: wf.items, confirmed: true })).toThrow(/earlier steps/);
    expect(B.workflowProgress(wfOf(sc.job.id)).map((x) => x.state)).toEqual(['current', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked']);
  });

  it('keeps no odometer or photo data anywhere in the workflow, job or checkout records', async () => {
    await as('owner@topmop.ph');
    const r = upToHandover('NOPH', db().employees[3].id);
    W.completeCloseOut(r.wf.id, { items: retItems(r.wf, () => ({})) as never, confirmed: true });
    const dump = JSON.stringify([wfOf(r.job.id), db().jobs.find((j) => j.id === r.job.id), db().checkouts.filter((c) => c.job_id === r.job.id)]);
    expect(dump).not.toMatch(/hq_odo|hqa_odo|odometer|photo|distance_km/i);
    for (const w of db().workflows) expect(Object.keys(w).some((k) => /_odo|photo|distance/.test(k))).toBe(false);
  });
});

describe('7-step workflow: normal recurring job', () => {
  it('runs end to end in a few taps and updates statuses, equipment, stock, attendance', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const mine = db().attendance.filter((a) => a.employee_id === lead && a.date === T() && !a.deleted_at);
    if (mine.length) for (const a of mine) store.update('attendance', a.id, { job_id: undefined, field_work: false } as never);
    else store.insert('attendance', { employee_id: lead, date: T(), kind: 'Present', clock_in: `${T()}T07:50`, field_work: false, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0, approval: 'Pending' } as never);
    const sc = scenario('FULL', lead);
    const q = db().quotations.find((x) => x.status === 'Approved')!;
    store.update('jobs', sc.job.id, { quotation_id: q.id } as never); priorJob('FULL', sc.job.id);
    const wf = W.openWorkflow(sc.job.id);
    const onHandBefore = B.onHand(db(), sc.item.id);
    // 1 prep
    expect(() => W.completeHqChecklist(wf.id, prepForm(wf, { confirmed: false }) as never)).toThrow(/confirmation/);
    W.completeHqChecklist(wf.id, prepForm(wf) as never);
    expect(db().assets.find((a) => a.id === sc.eq.id)!.status).toBe('In Use');
    expect(db().assets.find((a) => a.id === sc.veh.id)!.status).toBe('In Use');
    expect(B.onHand(db(), sc.item.id)).toBe(onHandBefore - 4);
    // 2 dispatch (time + confirmation only)
    W.dispatchJob(wf.id, { confirmed: true });
    expect(stat(sc.job.id)).toBe('Dispatched');
    // 3 check-in
    const attBefore = db().attendance.filter((a) => a.employee_id === lead && a.date === T() && !a.deleted_at).length;
    W.arriveAtSite(wf.id, checkIn([lead]));
    expect(stat(sc.job.id)).toBe('On Site');
    const att = db().attendance.filter((a) => a.employee_id === lead && a.date === T() && !a.deleted_at);
    expect(att.length).toBe(attBefore);                       // no duplicate attendance record
    expect(att.some((a) => a.job_id === sc.job.id)).toBe(true);
    // 4 scope approval: recurring, no change → no signature
    expect(B.scopeRoute(db(), db().jobs.find((j) => j.id === sc.job.id)!, wfOf(sc.job.id))).toBe('recurring');
    W.confirmScopeNoChanges(wf.id);
    expect(wfOf(sc.job.id)).toMatchObject({ conf_mode: 'confirmed' }); expect(wfOf(sc.job.id).conf_signature).toBeUndefined();
    // 5 work
    W.startWork(wf.id, { notes: 'Started on the front elevation' });
    expect(stat(sc.job.id)).toBe('In Progress');
    expect(() => W.startWork(wf.id, {})).toThrow(/already started/);
    W.finishWork(wf.id, {});
    // 6 handover
    expect(() => W.signServiceReport(wf.id, { ...handover, findings: '' })).toThrow(/findings/i);
    expect(() => W.signServiceReport(wf.id, { ...handover, client_sig: undefined })).toThrow(/client signature/);
    W.signServiceReport(wf.id, handover);
    expect(stat(sc.job.id)).toBe('Work Completed');
    expect(db().jobs.find((j) => j.id === sc.job.id)!.signoff_name).toBe('Ms. Reyes');
    // 7 close-out
    expect(B.onHand(db(), sc.item.id)).toBe(onHandBefore - 4);
    const sum = W.completeCloseOut(wf.id, { items: retItems(wf, (i) => (i.kind === 'material' ? { returned_qty: 1 } : {})) as never, confirmed: true });
    expect(sum.incidents).toBe(0); expect(sum.used[0].qty).toBe(3);   // used = issued − returned
    expect(B.onHand(db(), sc.item.id)).toBe(onHandBefore - 3);
    expect(db().assets.find((a) => a.id === sc.eq.id)!.status).toBe('Available');
    expect(db().assets.find((a) => a.id === sc.veh.id)!.status).toBe('Available');
    expect(stat(sc.job.id)).toBe('Closed');
    expect(wfOf(sc.job.id)).toMatchObject({ rc_by: store.user!.id, closed_by: store.user!.id });
    expect(wfOf(sc.job.id).leave_at && wfOf(sc.job.id).hqa_at).toBeTruthy();
    expect(() => store.update('workflows', wf.id, { hq_notes: 'x' } as never)).toThrow(/locked/);
    expect(B.workflowProgress(wfOf(sc.job.id)).every((p) => p.state === 'done')).toBe(true);
  });

  it('validates actual times: not in the future and in order', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const sc = scenario('TIME', lead);
    const wf = W.openWorkflow(sc.job.id);
    W.completeHqChecklist(wf.id, prepForm(wf) as never);
    expect(() => W.dispatchJob(wf.id, { at: '2999-01-01T08:00', confirmed: true })).toThrow(/future/);
    expect(() => W.dispatchJob(wf.id, { at: 'garbage', confirmed: true })).toThrow(/valid/);
    W.dispatchJob(wf.id, { at: `${T()}T06:30`, confirmed: true });
    expect(wfOf(sc.job.id).disp_at).toBe(`${T()}T06:30`);
    expect(() => W.arriveAtSite(wf.id, checkIn([lead], { at: `${T()}T06:00` }))).toThrow(/before the departure/);
    W.arriveAtSite(wf.id, checkIn([lead], { at: `${T()}T06:45` }));
    expect(wfOf(sc.job.id).arr_at).toBe(`${T()}T06:45`);
  });

  it('job prep: shortages need a reason and raise incidents; damaged tools get a ticket', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('HQS', db().employees[3].id);
    const wf = W.openWorkflow(sc.job.id);
    const items = load(wf.items).map((i) => (i.asset_id === sc.tool.id ? { ...i, out_condition: 'Damaged' as const, out_note: 'bent rail' } : i.kind === 'ppe' ? { ...i, loaded_qty: 0 } : i));
    expect(() => W.completeHqChecklist(wf.id, prepForm(wf, { items }) as never)).toThrow(/Enter a reason/);
    W.completeHqChecklist(wf.id, prepForm(wf, { items, hq_shortage_reason: 'Spare ladder at supplier' }) as never);
    const inc = db().incidents.filter((i) => i.workflow_id === wf.id);
    expect(inc.some((i) => i.type === 'Damaged asset' && i.ticket_id)).toBe(true);
    expect(inc.some((i) => i.type === 'Missing PPE')).toBe(true);
    expect(db().assets.find((a) => a.id === sc.tool.id)!.status).toBe('Damaged');
  });

  it('check-in: every crew member is present or absent with a reason', async () => {
    await as('owner@topmop.ph');
    const [lead, crew] = [db().employees[3].id, db().employees[4].id];
    const sc = scenario('ATT', lead, [crew]);
    const wf = W.openWorkflow(sc.job.id);
    W.completeHqChecklist(wf.id, prepForm(wf) as never);
    W.dispatchJob(wf.id, { confirmed: true });
    expect(() => W.arriveAtSite(wf.id, checkIn([lead]))).toThrow(/Confirm attendance/);
    expect(() => W.arriveAtSite(wf.id, checkIn([lead], { absent: [{ id: crew, reason: '' }] }))).toThrow(/Confirm attendance/);
    expect(() => W.arriveAtSite(wf.id, checkIn([lead], { contact_name: ' ', absent: [{ id: crew, reason: 'Sick leave' }] }))).toThrow(/contact/);
    W.arriveAtSite(wf.id, checkIn([lead], { absent: [{ id: crew, reason: 'Sick leave' }] }));
    expect(wfOf(sc.job.id).arr_crew_absent).toEqual([{ id: crew, reason: 'Sick leave' }]);
  });
});

describe('Scope Approval: conditional', () => {
  it('a recurring job with no change is only confirmed; a new job or changed scope needs the client signature', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const fresh = upToCheckIn('SC1', lead, false);                       // no earlier visit → new job
    expect(B.scopeRoute(db(), db().jobs.find((j) => j.id === fresh.job.id)!, fresh.wf)).toBe('approval');
    expect(() => W.confirmScopeNoChanges(fresh.wf.id)).toThrow(/new job or the scope changed/);
    expect(() => W.approveFinalQuote(fresh.wf.id, { name: 'Ms. Reyes', confirmed: true })).toThrow(/signature/);
    W.approveFinalQuote(fresh.wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true });
    expect(wfOf(fresh.job.id)).toMatchObject({ conf_mode: 'approval', conf_name: 'Ms. Reyes' });

    const rec = upToCheckIn('SC2', lead, true);
    W.setScopeChanged(rec.wf.id, true);                                   // scope changed → signature route
    expect(() => W.confirmScopeNoChanges(rec.wf.id)).toThrow(/scope changed/);
    W.setScopeChanged(rec.wf.id, false);
    W.confirmScopeNoChanges(rec.wf.id);
    expect(() => W.confirmScopeNoChanges(rec.wf.id)).toThrow(/already approved/);
  });

  it('glass jobs need the panel count before the client signs the new-job quotation', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const r = upToCheckIn('SC3', lead, false);
    store.update('jobs', r.job.id, { service_codes: ['GLASS_EXT'] } as never);
    expect(() => W.approveFinalQuote(r.wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true })).toThrow(/Count the glass panels/);
    W.savePanels(r.wf.id, [{ id: 'p1', area: '1st Floor', side: 'Front', external: 10, internal: 2 }]);
    W.approveFinalQuote(r.wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true });
    expect(wfOf(r.job.id).conf_at).toBeTruthy();
  });
});

describe('panel counting & variations', () => {
  const panels = [{ id: 'p1', area: '1st Floor', side: 'Front', external: 10, internal: 2 }, { id: 'p2', area: 'Roof Deck', side: 'Rear', external: 6, internal: 2, additional: true }];
  const glass = { service_code: 'GLASS_EXT' as const, category: 'glass' as const, description: '', qty: 0, unit: 'panel', rate: 140, discount: 0, linked_panels: true };
  const solar = { service_code: 'SOLAR' as const, category: 'solar' as const, description: 'Solar panels – carport', qty: 14, unit: 'panel', rate: 245, discount: 0 };

  it('totals external, internal and overall panels automatically', () => {
    expect(B.panelTotals(panels)).toEqual({ external: 16, internal: 4, total: 20, additional: 8 });
    expect(B.countPanels([{ w: 2, h: 1, qty: 3 }, { w: 2.5, h: 1.2, qty: 2 }, { w: 1, h: 0.5, qty: 7, grouped: true }], 4).panels).toBe(3 + 4 + 2);
  });

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
    expect(s.qty).toBe(20); expect(s.entered_qty).toBe(14);
    expect(B.lineTotals(s, 'exclusive', 12)).toMatchObject({ amount: 4900, vat: 588, total: 5488 });
  });

  it('only an Operations Manager / Admin may change a default rate or give a discount', async () => {
    await as('owner@topmop.ph');
    const lead = db().users.find((u) => u.email === 'leader@topmop.ph')!.employee_id!;
    const { wf } = upToCheckIn('FQR1', lead);
    W.savePanels(wf.id, panels);
    await as('leader@topmop.ph');
    expect(() => W.saveFinalReview(wf.id, { items: [{ ...solar, rate: 200 }] })).toThrow(/price list/);
    expect(() => W.saveFinalReview(wf.id, { items: [{ ...solar, discount: 100 }] })).toThrow(/discount/);
    W.saveFinalReview(wf.id, { items: [glass, solar] });
    await as('owner@topmop.ph');
    W.saveFinalReview(wf.id, { items: [glass, { ...solar, rate: 200, discount: 100 }] });
    expect(db().variations.filter((v) => v.job_id === wf.job_id && v.source === 'final_review').length).toBe(1);
  });

  it('additional work: client must sign before work; approval = change order, final total, deposit, audit; original untouched', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const { wf, job, q } = upToCheckIn('FQR2', lead);
    W.savePanels(wf.id, panels);
    const origJson = JSON.stringify(db().quotations.find((x) => x.id === q.id));
    const before = B.finalContract(db(), db().jobs.find((j) => j.id === job.id)!);
    W.saveFinalReview(wf.id, { items: [glass, solar], deposit: 1000, deposit_note: 'OR-1' });
    expect(() => W.confirmScopeNoChanges(wf.id)).toThrow(/Additional work is waiting/);
    expect(() => W.startWork(wf.id, {})).toThrow(/scope is approved/);
    W.requestFinalQuoteRevision(wf.id, 'Remove the solar panels');
    expect(() => W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true })).toThrow(/revision/);
    W.saveFinalReview(wf.id, { items: [glass], deposit: 1000, deposit_note: 'OR-1' });
    W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true, lat: 14.55, lng: 121.02, device: 'iPad · 1024×768' });
    const v = db().variations.find((x) => x.job_id === job.id && x.source === 'final_review')!;
    expect(v.status).toBe('Approved'); expect(v.items[0].qty).toBe(8);
    expect(v).toMatchObject({ client_name: 'Ms. Reyes', sign_lat: 14.55, sign_device: 'iPad · 1024×768' });
    const w = wfOf(job.id);
    expect(w).toMatchObject({ conf_name: 'Ms. Reyes', conf_variation_id: v.id });
    const add = B.variationTotals(v); expect(add.net).toBe(1120);
    const sm = B.finalQuoteSummary(db(), db().jobs.find((j) => j.id === job.id)!, { deposit: w.conf_deposit });
    expect(sm.finalTotal).toBe(Math.round((before.originalTotal + add.total) * 100) / 100);
    expect(sm.balance).toBe(Math.round((sm.finalTotal - 1000) * 100) / 100);
    expect(db().jobs.find((j) => j.id === job.id)!.contract_amount).toBe(before.originalNet + 1120);
    expect(JSON.stringify(db().quotations.find((x) => x.id === q.id))).toBe(origJson);
    expect(() => store.update('variations', v.id, { reason: 'x' } as never)).toThrow(/locked/);
    expect(db().audit.some((a) => a.record_id === v.id && /approved by Ms. Reyes/.test(a.summary))).toBe(true);
    W.startWork(wf.id, {}); W.finishWork(wf.id, {}); W.signServiceReport(wf.id, handover);
    W.completeCloseOut(wf.id, { items: retItems(wf, () => ({})) as never, confirmed: true });
    const inv = A.invoiceFromJob(job.id);
    expect(inv.items.some((i) => i.description.startsWith(v.number))).toBe(true);
    expect(inv.notes).toMatch(/Deposit/);
    expect(B.invoiceTotals(inv).total).toBe(sm.finalTotal);
  });

  it('declining keeps a record of what was offered but removes it from the bill', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const { wf, job } = upToCheckIn('FQR3', lead);
    W.saveFinalReview(wf.id, { items: [solar] });
    expect(() => W.saveFinalReview(wf.id, { items: [solar], deposit: 99999999 })).toThrow(/deposit/);
    W.declineAdditionalWork(wf.id, { client_name: 'Ms. Reyes', reason: 'Too expensive' });
    const v = db().variations.find((x) => x.job_id === job.id && x.source === 'final_review')!;
    expect(v.status).toBe('Rejected'); expect(v.notes).toBe('Too expensive'); expect(v.items.length).toBe(1);
    const fc = B.finalContract(db(), db().jobs.find((j) => j.id === job.id)!);
    expect(fc.variationsTotal).toBe(0); expect(fc.finalTotal).toBe(fc.originalTotal);
    W.confirmScopeNoChanges(wf.id);                                      // nothing pending any more
    expect(wfOf(job.id).conf_final_total).toBe(fc.originalTotal);
  });

  it('additional work found during the job needs the client signature before it is approved; the report waits for it', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const { wf, job } = upToWork('VAR', lead);
    const v = W.createVariation(job.id, { reason: 'Extra panels', items: [{ service_code: 'GLASS_EXT', description: 'Extra', qty: 8, unit: 'panel', rate: 140, discount: 0 }], discount: 0, vat_mode: 'exclusive', vat_rate: 12, panel_row_ids: [] });
    expect(() => W.finishWork(wf.id, {})).toThrow(/waiting for client approval/);
    expect(() => W.approveVariation(v.id, { client_name: 'Ms. Reyes' })).toThrow(/signature/);
    W.approveVariation(v.id, { client_name: 'Ms. Reyes', signature: PNG });
    expect(B.finalContract(db(), db().jobs.find((j) => j.id === job.id)!).variationsNet).toBe(1120);
    W.finishWork(wf.id, {});
    expect(() => W.createVariation(job.id, { reason: 'x', items: [{ service_code: 'WALL', description: 'x', qty: 1, unit: 'lot', rate: 1, discount: 0 }], discount: 0, vat_mode: 'none', vat_rate: 0, panel_row_ids: [] })).not.toThrow();
  });
});

describe('Close-out: equipment accountability', () => {
  it('missing / damaged equipment raises incident reports and sets Missing / Under Maintenance / Damaged; good goes Available', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const { job, wf, eq, tool, veh } = upToHandover('RET', lead);
    const items = retItems(wf, (i) => (i.asset_id === eq.id ? { returned_qty: 0, ret_condition: 'Missing' as const, ret_note: 'Left at site' } : i.asset_id === tool.id ? { ret_condition: 'Damaged' as const, ret_note: 'Bent rail', repair_required: true } : {})) as never;
    expect(() => W.completeCloseOut(wf.id, { items: (items as CheckItem[]).map((i) => (i.asset_id === tool.id ? { ...i, ret_note: '' } : i)), confirmed: true })).toThrow(/note/);
    expect(() => W.completeCloseOut(wf.id, { items, hqa_at: `${T()}T00:01`, leave_at: `${T()}T23:00`, confirmed: true })).toThrow();
    const r = W.completeCloseOut(wf.id, { items, confirmed: true });
    expect(r.missing).toBe(1); expect(r.damaged).toBe(1); expect(r.tickets).toBe(1);
    expect(db().assets.find((a) => a.id === eq.id)!.status).toBe('Missing');
    expect(db().assets.find((a) => a.id === tool.id)!.status).toBe('Under Maintenance');
    expect(db().assets.find((a) => a.id === veh.id)!.status).toBe('Available');
    expect(db().incidents.filter((i) => i.workflow_id === wf.id && ['Missing asset', 'Damaged asset'].includes(i.type)).length).toBe(2);
    expect(stat(job.id)).toBe('Closed');
    expect(db().audit.some((a) => a.record_id === wf.id && /close-out confirmed/.test(a.summary))).toBe(true);
  });

  it('a damaged tool that is not sent for repair is flagged Damaged', async () => {
    await as('owner@topmop.ph');
    const { wf, tool } = upToHandover('RET2', db().employees[3].id);
    const r = W.completeCloseOut(wf.id, { items: retItems(wf, (i) => (i.asset_id === tool.id ? { ret_condition: 'Damaged' as const, ret_note: 'Scuffed', repair_required: false } : {})) as never, confirmed: true });
    expect(r.tickets).toBe(1);
    expect(db().assets.find((a) => a.id === tool.id)!.status).toBe('Damaged');
  });

  it('a damaged vehicle goes Under Maintenance with an incident', async () => {
    await as('owner@topmop.ph');
    const { wf, veh, job } = upToHandover('VEH', db().employees[3].id);
    W.completeCloseOut(wf.id, { items: retItems(wf, (i) => (i.asset_id === veh.id ? { ret_condition: 'Damaged' as const, ret_note: 'Warning light' } : {})) as never, confirmed: true });
    expect(db().assets.find((a) => a.id === veh.id)!.status).toBe('Under Maintenance');
    expect(db().incidents.some((i) => i.job_id === job.id && i.type === 'Vehicle damage')).toBe(true);
  });

  it('field staff cannot complete steps on jobs they are not assigned to; status override needs a reason', async () => {
    await as('owner@topmop.ph');
    const sc = scenario('PERM', db().employees[3].id);
    const wf = W.openWorkflow(sc.job.id);
    await as('field@topmop.ph');
    expect(() => W.completeHqChecklist(wf.id, prepForm(wf) as never)).toThrow();
    await as('owner@topmop.ph');
    expect(() => W.overrideJobStatus(sc.job.id, 'Closed', '  ')).toThrow(/reason/);
    W.overrideJobStatus(sc.job.id, 'Closed', 'Admin close');
    expect(db().audit.find((a) => a.record_id === sc.job.id && a.reason === 'Admin close')).toBeTruthy();
  });
});

describe('Controlled discounts', () => {
  const lead = () => db().users.find((u) => u.email === 'leader@topmop.ph')!.employee_id!;
  const reqOf = (jobId: string) => db().discount_requests.filter((r) => r.job_id === jobId && !r.deleted_at);

  it('nobody but Owner / Admin can type a discount into a quotation, variation or invoice', async () => {
    await as('leader@topmop.ph');
    const q = db().quotations.find((x) => x.status === 'Approved')!;
    expect(() => store.update('quotations', q.id, { discount: 500 } as never)).toThrow(/Owner \/ Admin/);
    expect(() => store.update('quotations', q.id, { items: q.items.map((i) => ({ ...i, discount: 50 })) } as never)).toThrow(/Owner \/ Admin/);
    expect(() => store.insert('invoices', { client_id: q.client_id, items: q.items, discount: 100 } as never)).toThrow(/Discount Request/);
    await as('ops@topmop.ph');
    expect(() => store.update('quotations', q.id, { discount: 500 } as never)).toThrow(/Owner \/ Admin/);
    await as('owner@topmop.ph');
    store.update('quotations', q.id, { discount: q.discount } as never);       // unchanged is fine
  });

  it('request → admin approval → apply → client signs; the client cannot sign before; the original quotation is untouched', async () => {
    await as('owner@topmop.ph');
    const { job, wf, q } = upToCheckIn('DISC1', lead(), false);
    const before = JSON.stringify(db().quotations.find((x) => x.id === q.id)!.items);
    const base = B.finalQuoteSummary(db(), db().jobs.find((j) => j.id === job.id)!).subtotal;
    await as('leader@topmop.ph');
    expect(() => W.submitDiscountRequest(job.id, { kind: 'percent', value: 5, reason: '' })).toThrow(/reason/);
    expect(() => W.submitDiscountRequest(job.id, { kind: 'percent', value: 120, reason: 'Promotion' })).toThrow(/below 100/);
    expect(() => W.submitDiscountRequest(job.id, { kind: 'fixed', value: base + 1, reason: 'Promotion' })).toThrow(/more than the bill/);
    const r = W.submitDiscountRequest(job.id, { kind: 'percent', value: 5, reason: 'Repeat / loyal client', client_notes: 'Asked for repeat rate' });
    expect(r).toMatchObject({ status: 'Pending Admin Approval', requested_amount: Math.round(base * 5) / 100, base_total: base });
    expect(r.proposed_final).toBeCloseTo(base - r.requested_amount, 2);
    expect(() => W.submitDiscountRequest(job.id, { kind: 'percent', value: 3, reason: 'Promotion' })).toThrow(/already waiting/);
    // leaders cannot decide
    expect(() => W.decideDiscount(r.id, { approve: true, note: 'ok' })).toThrow(/not permitted/);
    // client cannot sign while pending
    expect(() => W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true })).toThrow(/waiting for Admin approval/);
    await as('owner@topmop.ph');
    expect(() => W.decideDiscount(r.id, { approve: true, note: '  ' })).toThrow(/approval note/);
    const a = W.decideDiscount(r.id, { approve: true, note: 'One-time repeat client rate' });
    // the client is waiting on site, so the approved discount goes straight onto the bill
    expect(a).toMatchObject({ status: 'Applied', approved_amount: r.requested_amount, approved_base: base, decision_note: 'One-time repeat client rate' });
    expect(a.est_cost).toBeGreaterThan(0); expect(a.gp_after).toBeLessThan(a.gp_before!);
    await as('leader@topmop.ph');
    expect(reqOf(job.id)[0].status).toBe('Applied');
    const sm = B.finalQuoteSummary(db(), db().jobs.find((j) => j.id === job.id)!);
    expect(sm.granted).toBe(r.requested_amount); expect(sm.finalTotal).toBeCloseTo(base - r.requested_amount, 2);
    W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true });
    expect(wfOf(job.id).conf_final_total).toBeCloseTo(base - r.requested_amount, 2);
    expect(JSON.stringify(db().quotations.find((x) => x.id === q.id)!.items)).toBe(before);   // rates untouched
    // locked once signed
    await as('owner@topmop.ph');
    expect(() => W.decideDiscount(r.id, { approve: true, note: 'again' })).toThrow(/final/);
    expect(() => W.submitDiscountRequest(job.id, { kind: 'fixed', value: 10, reason: 'Promotion' })).toThrow(/already signed|already applied|already/);
    expect(db().audit.some((x) => x.record_id === r.id && /approved ₱/.test(x.summary))).toBe(true);
    // revenue + job costing + invoice all carry the discount
    const j = db().jobs.find((x) => x.id === job.id)!;
    const fc = B.finalContract(db(), j);
    expect(fc.discount).toBe(r.requested_amount); expect(fc.payableTotal).toBeCloseTo(fc.finalTotal - fc.discount, 2);
    const cost = B.jobCost(db(), j);
    expect(cost.discount).toBeCloseTo(a.net_amount!, 2); expect(cost.revenueBefore).toBeCloseTo(cost.revenue + cost.discount, 2); expect(cost.grossProfitBefore).toBeGreaterThan(cost.grossProfit);
    W.startWork(wf.id, {}); W.finishWork(wf.id, {}); W.signServiceReport(wf.id, handover);
    await as('finance@topmop.ph');
    const inv = A.invoiceFromJob(job.id);
    expect(inv.discount_request_id).toBe(r.id); expect(inv.discount_granted).toBe(r.requested_amount);
    expect(B.invoiceTotals(inv).total).toBeCloseTo(sm.finalTotal, 0);
    expect(inv.notes).toMatch(/approved by TopMop management/);
    const rows = B.discountRows(db(), '2000-01-01', '2099-12-31').filter((x) => x.req.id === r.id);
    expect(rows.length).toBe(1); expect(rows[0].gpBefore - rows[0].gpAfter).toBeCloseTo(rows[0].net, 2);
    for (const view of ['client', 'service', 'leader', 'reason', 'month', 'job'] as const) expect(B.discountAggregate(db(), rows, view).reduce((s, x) => s + x.granted, 0)).toBeCloseTo(r.requested_amount, 1);
  });

  it('admin can modify the amount; a rejection stands: the Team Leader cannot override it and the client signs the original amount', async () => {
    await as('owner@topmop.ph');
    const { job, wf } = upToCheckIn('DISC2', lead(), false);
    await as('leader@topmop.ph');
    const r = W.submitDiscountRequest(job.id, { kind: 'fixed', value: 2000, reason: 'Other', reason_note: 'Facility budget' });
    await as('owner@topmop.ph');
    const m = W.decideDiscount(r.id, { approve: true, kind: 'fixed', value: 1200, note: 'Meet halfway' });
    expect(m.approved_amount).toBe(1200); expect(m.requested_amount).toBe(2000);
    expect(db().audit.some((x) => x.record_id === r.id && /modified/.test(x.summary))).toBe(true);
    const rej = W.decideDiscount(r.id, { approve: false, note: 'Margin too thin' });
    expect(rej.status).toBe('Rejected');
    await as('leader@topmop.ph');
    expect(B.discountBlock(db(), db().jobs.find((j) => j.id === job.id)!, wfOf(job.id), 1)).toBeUndefined();   // nothing blocks signing now
    // the Team Leader cannot override the rejection by asking again
    expect(() => W.submitDiscountRequest(job.id, { kind: 'percent', value: 2, reason: 'Other', reason_note: 'again' })).toThrow(/decision stands/);
    expect(() => W.decideDiscount(r.id, { approve: true, note: 'x' })).toThrow(/not permitted/);
    // the original amount stands: the client signs it
    W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true });
    expect(B.finalQuoteSummary(db(), db().jobs.find((j) => j.id === job.id)!).granted).toBe(0);
    W.startWork(wf.id, {});
    expect(stat(job.id)).toBe('In Progress');
  });

  it('a field employee not on the job cannot request; the bill changing after approval needs re-approval', async () => {
    await as('owner@topmop.ph');
    const { job, wf } = upToCheckIn('DISC3', lead(), false);
    await as('field@topmop.ph');
    expect(() => W.submitDiscountRequest(job.id, { kind: 'percent', value: 5, reason: 'Promotion' })).toThrow(/assigned Team Leader/);
    await as('leader@topmop.ph');
    const r = W.submitDiscountRequest(job.id, { kind: 'percent', value: 5, reason: 'Promotion' });
    await as('owner@topmop.ph');
    W.decideDiscount(r.id, { approve: true, note: 'ok' });
    // additional work is added after the approval → the approved base is stale
    await as('leader@topmop.ph');
    W.savePanels(wf.id, [{ id: 'p1', area: '1st Floor', side: 'Front', external: 10, internal: 0, additional: true }]);
    W.saveFinalReview(wf.id, { items: [{ service_code: 'GLASS_EXT', category: 'glass', description: '', qty: 0, entered_qty: 0, unit: 'panel', rate: 140, discount: 0, linked_panels: true }] });
    expect(() => W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true })).toThrow(/changed after discount/);
    await as('owner@topmop.ph');
    W.decideDiscount(r.id, { approve: true, note: 're-approved on the new total' });
    await as('leader@topmop.ph');
    W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true });
    expect(db().variations.find((v) => v.job_id === job.id && v.status === 'Approved')).toBeTruthy();
  });

  it('a discount forces the signature route even on a recurring job; work cannot start until the client signs original or discounted amount', async () => {
    await as('owner@topmop.ph');
    const { job, wf } = upToCheckIn('DISC4', lead(), true);
    expect(B.scopeRoute(db(), db().jobs.find((j) => j.id === job.id)!, wfOf(job.id))).toBe('recurring');
    await as('leader@topmop.ph');
    const r = W.submitDiscountRequest(job.id, { kind: 'percent', value: 4, reason: 'Repeat client' });
    expect(B.scopeRoute(db(), db().jobs.find((j) => j.id === job.id)!, wfOf(job.id))).toBe('approval');
    expect(() => W.confirmScopeNoChanges(wf.id)).toThrow(/new job or the scope changed/);
    expect(() => W.startWork(wf.id, {})).toThrow(/scope is approved/);
    await as('owner@topmop.ph');
    W.decideDiscount(r.id, { approve: true, note: 'ok' });
    await as('leader@topmop.ph');
    expect(() => W.startWork(wf.id, {})).toThrow(/scope is approved/);          // approved, but the client has not signed the discounted amount yet
    W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true });
    W.startWork(wf.id, {});
    expect(stat(job.id)).toBe('In Progress');
  });

  it('after a rejection the client may decline the job: nothing is billed and the crew returns the equipment at close-out', async () => {
    await as('owner@topmop.ph');
    const { job, wf, eq } = upToCheckIn('DISC5', lead(), false);
    await as('leader@topmop.ph');
    const r = W.submitDiscountRequest(job.id, { kind: 'fixed', value: 3000, reason: 'Competitor price' });
    expect(() => W.declineJob(wf.id, { client_name: 'Ms. Reyes' })).toThrow(/Wait for the Admin/);
    await as('owner@topmop.ph');
    W.decideDiscount(r.id, { approve: false, note: 'Margin too thin' });
    await as('leader@topmop.ph');
    W.declineJob(wf.id, { client_name: 'Ms. Reyes', reason: 'Went with a cheaper provider' });
    expect(wfOf(job.id)).toMatchObject({ conf_mode: 'declined', conf_name: 'Ms. Reyes' });
    expect(() => W.startWork(wf.id, {})).toThrow(/declined/);
    expect(stat(job.id)).toBe('Work Completed');
    expect(B.workflowProgress(wfOf(job.id)).map((p) => p.state)).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'current']);
    expect(B.jobCost(db(), db().jobs.find((j) => j.id === job.id)!).revenue).toBe(0);
    await as('finance@topmop.ph');
    expect(() => A.invoiceFromJob(job.id)).toThrow(/declined/);
    await as('leader@topmop.ph');
    W.completeCloseOut(wf.id, { items: retItems(wfOf(job.id), () => ({})), confirmed: true });
    expect(stat(job.id)).toBe('Closed');
    expect(db().assets.find((a) => a.id === eq.id)!.status).toBe('Available');
  });
});

describe('Client Satisfaction Check', () => {
  const lead = () => db().users.find((u) => u.email === 'leader@topmop.ph')!.employee_id!;
  it('needs one tap; saves job, client, team leader, crew, service type and date; no typed feedback required', async () => {
    await as('owner@topmop.ph');
    const { job, wf } = upToWork('SAT1', lead());
    W.finishWork(wf.id, {});
    await as('leader@topmop.ph');
    expect(() => W.signServiceReport(wf.id, { ...handover, satisfaction: undefined })).toThrow(/how satisfied/);
    W.signServiceReport(wf.id, { ...handover, satisfaction: { rating: 3, aspects: ['Crew professionalism', 'Quality of cleaning', 'Bogus'] } });
    const fb = db().client_feedback.find((x) => x.job_id === job.id)!;
    const j = db().jobs.find((x) => x.id === job.id)!;
    expect(fb).toMatchObject({ rating: 3, follow_up: 'None', client_id: j.client_id, leader_id: j.leader_id, service_codes: j.service_codes, service_date: j.start_at.slice(0, 10) });
    expect(fb.crew_ids).toEqual(j.crew_ids); expect(fb.aspects).toEqual(['Crew professionalism', 'Quality of cleaning']);
    expect(j.client_rating).toBe(5);
    expect(B.openFollowUp(db(), job.id)).toBeUndefined();
  });

  it('Not Satisfied needs an issue category, alerts the Admin, and the job cannot fully close until the Admin acknowledges', async () => {
    await as('owner@topmop.ph');
    const { job, wf } = upToWork('SAT2', lead());
    W.finishWork(wf.id, {});
    await as('leader@topmop.ph');
    expect(() => W.signServiceReport(wf.id, { ...handover, satisfaction: { rating: 1 } })).toThrow(/issue category/);
    W.signServiceReport(wf.id, { ...handover, satisfaction: { rating: 1, issue_category: 'Delay', comment: 'Late again', aspects: ['On-time arrival'] } });
    const fb = db().client_feedback.find((x) => x.job_id === job.id)!;
    expect(fb).toMatchObject({ rating: 1, issue_category: 'Delay', follow_up: 'Required' });
    expect(db().notifications.some((n) => n.key === `fb-follow:${fb.id}` && n.severity === 'critical')).toBe(true);
    // the crew can still return the equipment, but the job stays open
    const r = W.completeCloseOut(wf.id, { items: retItems(wfOf(job.id), () => ({})), confirmed: true });
    expect(r.awaitingAck).toBe(true);
    expect(wfOf(job.id).closed_at).toBeTruthy(); expect(stat(job.id)).toBe('Work Completed');
    await as('ops@topmop.ph');
    expect(() => W.overrideJobStatus(job.id, 'Closed', 'push it through')).toThrow(/acknowledge/);
    expect(() => W.acknowledgeFeedback(fb.id, 'x')).toThrow(/not permitted/);
    await as('owner@topmop.ph');
    expect(() => W.acknowledgeFeedback(fb.id, '  ')).toThrow(/follow-up note/);
    W.acknowledgeFeedback(fb.id, 'Called the client and rescheduled a free re-clean');
    expect(db().client_feedback.find((x) => x.id === fb.id)).toMatchObject({ follow_up: 'Acknowledged', ack_by: expect.any(String) });
    expect(stat(job.id)).toBe('Closed');
    expect(db().notifications.some((n) => n.key === `fb-follow:${fb.id}`)).toBe(false);
  });

  it('satisfaction statistics: average, by leader / crew / service, monthly trend, follow-ups', async () => {
    await as('owner@topmop.ph');
    const st = B.satisfactionStats(db(), '2000-01-01', '2099-12-31');
    expect(st.n).toBe(st.dist[1] + st.dist[2] + st.dist[3]);
    expect(st.avg).toBeGreaterThanOrEqual(1); expect(st.avg).toBeLessThanOrEqual(3);
    expect(st.byLeader.reduce((s, a) => s + a.n, 0)).toBe(st.n);
    expect(st.byService.length).toBeGreaterThan(0); expect(st.monthly.length).toBeGreaterThan(0);
    expect(st.followUps.every((f) => f.follow_up === 'Required')).toBe(true);
  });
});
