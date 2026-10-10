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
const handover = { scope: 'Wall cleaning', findings: 'None', recs: 'None', limits: 'None', client_name: 'Ms. Reyes', client_sig: PNG, tm_name: 'Leader', tm_sig: PNG, satisfaction: { q_quality: 5, q_professionalism: 5, q_communication: 5, rating: 3 as const } };
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
    W.dispatchJob(wf.id, { at: `${T()}T00:05`, confirmed: true });   // early in the day so the test also passes just after midnight
    expect(wfOf(sc.job.id).disp_at).toBe(`${T()}T00:05`);
    expect(() => W.arriveAtSite(wf.id, checkIn([lead], { at: `${T()}T00:00` }))).toThrow(/before the departure/);
    W.arriveAtSite(wf.id, checkIn([lead], { at: `${T()}T00:10` }));
    expect(wfOf(sc.job.id).arr_at).toBe(`${T()}T00:10`);
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

  it('starter package panels: the panels counted beyond it are the additional work', () => {
    const panels = [{ id: 'a', area: '1st Floor', side: 'Front', external: 20, internal: 6 }, { id: 'b', area: '2nd Floor', side: 'Back', external: 4, internal: 0 }];
    const bd = B.panelBreakdown(db(), undefined, panels, 24);
    expect(bd).toMatchObject({ original: 24, total: 30, additional: 6, auto: true });
    expect(bd.additionalExternal + bd.additionalInternal).toBe(6);
    expect(B.panelBreakdown(db(), undefined, panels, 40).additional).toBe(0);
    const [g] = B.resolveReviewItems(db(), panels, [{ service_code: 'GLASS_EXT', category: 'glass', description: '', qty: 0, entered_qty: 0, unit: 'panel', rate: 140, discount: 0, linked_panels: true }], 24);
    expect(g.qty).toBe(6);
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
  const sub = (jobId: string, f: Parameters<typeof W.submitDiscountRequest>[1]) => W.submitDiscountRequest(jobId, f);
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
    expect(() => sub(job.id, { kind: 'percent', value: 5, reason: '' })).toThrow(/reason/);
    expect(() => sub(job.id, { kind: 'percent', value: 120, reason: 'Promotion' })).toThrow(/below 100/);
    expect(() => sub(job.id, { kind: 'fixed', value: base + 1, reason: 'Promotion' })).toThrow(/more than the bill/);
    const r = sub(job.id, { kind: 'percent', value: 5, reason: 'Repeat / loyal client', client_notes: 'Asked for repeat rate' });
    expect(r).toMatchObject({ status: 'Pending Admin Approval', requested_amount: Math.round(base * 5) / 100, base_total: base });
    expect(r.proposed_final).toBeCloseTo(base - r.requested_amount, 2);
    expect(() => sub(job.id, { kind: 'percent', value: 3, reason: 'Promotion' })).toThrow(/already waiting/);
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
    expect(() => sub(job.id, { kind: 'fixed', value: 10, reason: 'Promotion' })).toThrow(/already signed|already applied|already/);
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
    const r = sub(job.id, { kind: 'fixed', value: 2000, reason: 'Other', reason_note: 'Facility budget' });
    await as('owner@topmop.ph');
    const m = W.decideDiscount(r.id, { approve: true, kind: 'fixed', value: 1200, note: 'Meet halfway' });
    expect(m.approved_amount).toBe(1200); expect(m.requested_amount).toBe(2000);
    expect(db().audit.some((x) => x.record_id === r.id && /modified/.test(x.summary))).toBe(true);
    const rej = W.decideDiscount(r.id, { approve: false, note: 'Margin too thin' });
    expect(rej.status).toBe('Rejected');
    await as('leader@topmop.ph');
    expect(B.discountBlock(db(), db().jobs.find((j) => j.id === job.id)!, wfOf(job.id), 1)).toBeUndefined();   // nothing blocks signing now
    // the Team Leader cannot override the rejection by asking again
    expect(() => sub(job.id, { kind: 'percent', value: 2, reason: 'Other', reason_note: 'again' })).toThrow(/decision stands/);
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
    const r = sub(job.id, { kind: 'percent', value: 5, reason: 'Promotion' });
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
    const r = sub(job.id, { kind: 'percent', value: 4, reason: 'Repeat client' });
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
    const r = sub(job.id, { kind: 'fixed', value: 3000, reason: 'Competitor price' });
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
    expect(() => W.signServiceReport(wf.id, { ...handover, satisfaction: undefined })).toThrow(/rate the three questions/);
    expect(() => W.signServiceReport(wf.id, { ...handover, satisfaction: { q_quality: 5, q_professionalism: 6, q_communication: 5, rating: 3 } })).toThrow(/1 \(Poor\) to 5/);
    expect(() => W.signServiceReport(wf.id, { ...handover, satisfaction: { q_quality: 5, q_professionalism: 4, q_communication: 4 } as never })).toThrow(/overall satisfaction/);
    W.signServiceReport(wf.id, { ...handover, satisfaction: { q_quality: 5, q_professionalism: 4, q_communication: 4, rating: 3 } });
    const fb = db().client_feedback.find((x) => x.job_id === job.id)!;
    const j = db().jobs.find((x) => x.id === job.id)!;
    expect(fb).toMatchObject({ rating: 3, follow_up: 'None', client_id: j.client_id, leader_id: j.leader_id, service_codes: j.service_codes, service_date: j.start_at.slice(0, 10) });
    expect(fb).toMatchObject({ q_quality: 5, q_professionalism: 4, q_communication: 4 });
    expect(fb.crew_ids).toEqual(j.crew_ids);
    expect(j.client_rating).toBe(4);                                                // average of the three questions feeds the employee scorecards
    expect(B.openFollowUp(db(), job.id)).toBeUndefined();
  });

  it('Not Satisfied needs an issue category, alerts the Admin, and the job cannot fully close until the Admin acknowledges', async () => {
    await as('owner@topmop.ph');
    const { job, wf } = upToWork('SAT2', lead());
    W.finishWork(wf.id, {});
    await as('leader@topmop.ph');
    expect(() => W.signServiceReport(wf.id, { ...handover, satisfaction: { q_quality: 2, q_professionalism: 3, q_communication: 3, rating: 1 } })).toThrow(/issue category/);
    W.signServiceReport(wf.id, { ...handover, satisfaction: { q_quality: 2, q_professionalism: 3, q_communication: 3, rating: 1, issue_category: 'Delay', comment: 'Late again' } });
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

  it('a rating of 1–2 on any question needs an issue category and a follow-up even when the client is Satisfied overall', async () => {
    await as('owner@topmop.ph');
    const { job, wf } = upToWork('SAT3', lead());
    W.finishWork(wf.id, {});
    await as('leader@topmop.ph');
    expect(B.needsFollowUp({ rating: 3, q_quality: 5, q_professionalism: 5, q_communication: 2 })).toBe(true);
    expect(B.needsFollowUp({ rating: 2, q_quality: 3, q_professionalism: 4, q_communication: 3 })).toBe(false);
    expect(() => W.signServiceReport(wf.id, { ...handover, satisfaction: { q_quality: 5, q_professionalism: 5, q_communication: 2, rating: 3 } })).toThrow(/issue category/);
    W.signServiceReport(wf.id, { ...handover, satisfaction: { q_quality: 5, q_professionalism: 5, q_communication: 2, rating: 3, issue_category: 'Communication' } });
    const fb = db().client_feedback.find((x) => x.job_id === job.id)!;
    expect(fb).toMatchObject({ rating: 3, q_communication: 2, issue_category: 'Communication', follow_up: 'Required' });
    expect(db().notifications.some((n) => n.key === `fb-follow:${fb.id}`)).toBe(true);
    expect(B.ISSUE_CATEGORIES).toEqual(['Quality', 'Delay', 'Communication', 'Damage', 'Scope', 'Other']);
  });

  it('satisfaction statistics: average, by leader / crew / service, monthly trend, follow-ups', async () => {
    await as('owner@topmop.ph');
    const st = B.satisfactionStats(db(), '2000-01-01', '2099-12-31');
    expect(st.n).toBe(st.dist[1] + st.dist[2] + st.dist[3]);
    expect(st.avg).toBeGreaterThanOrEqual(1); expect(st.avg).toBeLessThanOrEqual(3);
    expect(st.byLeader.reduce((s, a) => s + a.n, 0)).toBe(st.n);
    expect(st.byService.length).toBeGreaterThan(0); expect(st.monthly.length).toBeGreaterThan(0);
    expect(st.followUps.every((f) => f.follow_up === 'Required')).toBe(true);
    expect(st.questions.quality).toBeGreaterThan(0); expect(st.byLeader[0].quality).toBeGreaterThan(0);
  });
});

describe('Payment recording', () => {
  const room = () => db().invoices.find((i) => i.status === 'Approved' && !i.deleted_at && B.invoiceLedger(db(), i).available > 3000 && i.job_id)!;
  const cash = (inv: string, amount: number, extra = {}) => ({ invoice_id: inv, method: 'Cash' as const, amount, received_by: 'Jonathan D. Ramos', ...extra });

  it('Team Leader can only record cash as Pending Verification; nothing changes until Finance verifies', async () => {
    await as('leader@topmop.ph');
    const inv = room(); const bal0 = B.invoiceBalance(db(), inv);
    expect(() => A.recordPayment({ invoice_id: inv.id, method: 'GCash', amount: 100, gcash_ref: 'X', sender: 'Y', received_by: 'JD' })).toThrow(/cash/i);
    expect(() => A.recordPayment(cash(inv.id, 500, { verify_now: true }) as never)).not.toThrow();      // verify_now is ignored without the permission
    const p = db().payments.filter((x) => x.invoice_id === inv.id).at(-1)!;
    expect(p).toMatchObject({ status: 'Pending Verification', method: 'Cash', received_by: 'Jonathan D. Ramos', job_id: inv.job_id });
    expect(p.paid_at).toBeTruthy(); expect(p.receipt_no).toMatch(/^OR-/);
    expect(B.invoiceBalance(db(), inv)).toBe(bal0);                                        // pending money does not reduce the balance
    expect(() => A.verifyPayment(p.id)).toThrow(/not permitted/);
    expect(() => A.reversePayment(p.id, 'x')).toThrow(/not permitted/);
    expect(() => A.deletePayment(p.id, 'x')).toThrow(/not permitted/);
    await as('finance@topmop.ph');
    expect(B.invoiceLedger(db(), inv)).toMatchObject({ balance: bal0, waiting: 500 });
    A.verifyPayment(p.id);
    expect(B.invoiceBalance(db(), inv)).toBeCloseTo(bal0 - 500, 2);                        // Final bill − verified payments = outstanding
    expect(B.jobCost(db(), db().jobs.find((j) => j.id === inv.job_id)!).collected).toBeGreaterThanOrEqual(500);
    expect(() => store.update('payments', p.id, { amount: 1 } as never)).toThrow(/locked/);
    expect(() => A.editPayment(p.id, cash(inv.id, 5) as never)).toThrow(/locked/);
    expect(() => A.deletePayment(p.id, 'x')).toThrow(/reverse/);
    A.reversePayment(p.id, 'entered on the wrong invoice');
    expect(B.invoiceBalance(db(), inv)).toBeCloseTo(bal0, 2);
  });

  it('each method needs its own details; partial payments are allowed; over-payment is refused', async () => {
    await as('finance@topmop.ph');
    const inv = room();
    const base = { invoice_id: inv.id, amount: 1000, received_by: 'Finance' };
    expect(() => A.recordPayment({ ...base, method: 'Bank Transfer', bank_name: 'BDO' })).toThrow(/reference number/);
    expect(() => A.recordPayment({ ...base, method: 'Bank Transfer', bank_name: 'BDO', reference: 'R1' })).toThrow(/transfer date/);
    expect(() => A.recordPayment({ ...base, method: 'Cheque', bank_name: 'BPI', cheque_no: '001' })).toThrow(/cheque date/);
    expect(() => A.recordPayment({ ...base, method: 'GCash', gcash_ref: 'G1' })).toThrow(/sender/);
    expect(() => A.recordPayment({ ...base, method: 'Cash', received_by: ' ' })).toThrow(/received/);
    expect(() => A.recordPayment({ ...base, method: 'Cash', amount: B.invoiceLedger(db(), inv).available + 1 })).toThrow(/exceeds/);
    const t = T();
    const bt = A.recordPayment({ ...base, method: 'Bank Transfer', bank_name: 'BDO', reference: 'TRF-1', transfer_date: t, verify_now: true });
    const gc = A.recordPayment({ ...base, amount: 500, method: 'GCash', gcash_ref: 'G-77', sender: '0917 000 0000', verify_now: true });
    expect(bt).toMatchObject({ status: 'Verified', bank_name: 'BDO', reference: 'TRF-1' }); expect(gc).toMatchObject({ gcash_ref: 'G-77', sender: '0917 000 0000' });
    expect(B.invoiceLedger(db(), inv).received).toBeGreaterThanOrEqual(1500);
  });

  it('a cheque counts only when Cleared: the invoice is not fully paid before that, and a bounced cheque never counts', async () => {
    await as('finance@topmop.ph');
    const inv = room(); const lg = B.invoiceLedger(db(), inv);
    const chq = (n: string) => A.recordPayment({ invoice_id: inv.id, method: 'Cheque', amount: lg.available, received_by: 'Finance', bank_name: 'BPI', cheque_no: n, cheque_date: T(), cheque_status: 'Pending Clearance', verify_now: true });
    const c1 = chq('900001');
    expect(c1.status).toBe('Verified');
    expect(B.invoiceBalance(db(), inv)).toBeCloseTo(lg.balance, 2);                       // verified, but not cleared
    expect(B.invoiceState(db(), inv)).not.toBe('Paid');
    expect(B.paymentStatusLabel(c1)).toMatch(/awaiting clearance/);
    A.setChequeStatus(c1.id, 'Deposited');
    expect(B.invoiceBalance(db(), inv)).toBeCloseTo(lg.balance, 2);
    A.setChequeStatus(c1.id, 'Cleared');
    expect(B.invoiceBalance(db(), inv)).toBeCloseTo(lg.balance - lg.available, 2);
    A.setChequeStatus(c1.id, 'Bounced');
    expect(B.invoiceBalance(db(), inv)).toBeCloseTo(lg.balance, 2);
    expect(db().payments.find((x) => x.id === c1.id)!.cheque_status).toBe('Bounced');
    expect(() => A.setChequeStatus(db().payments.find((x) => x.method === 'Cash')!.id, 'Cleared')).toThrow(/cheque/);
  });

  it('pending entries can be edited, rejected or deleted (kept in the audit log); rejected money never counts', async () => {
    await as('leader@topmop.ph');
    const inv = room(); const bal0 = B.invoiceBalance(db(), inv);
    A.recordPayment(cash(inv.id, 700));
    const p = db().payments.filter((x) => x.invoice_id === inv.id).at(-1)!;
    await as('finance@topmop.ph');
    A.editPayment(p.id, cash(inv.id, 650, { notes: 'corrected' }) as never);
    expect(db().payments.find((x) => x.id === p.id)).toMatchObject({ amount: 650, notes: 'corrected', status: 'Pending Verification' });
    expect(() => A.rejectPayment(p.id, ' ')).toThrow(/reason/);
    A.rejectPayment(p.id, 'No money was handed over');
    expect(B.invoiceBalance(db(), inv)).toBeCloseTo(bal0, 2);
    A.deletePayment(p.id, 'duplicate entry');
    expect(db().payments.find((x) => x.id === p.id)!.deleted_at).toBeTruthy();
    expect(db().audit.some((a) => a.record_id === p.id && a.action === 'delete' && a.reason === 'duplicate entry')).toBe(true);
  });
});

describe('Back Job / Callback', () => {
  let BJ: typeof import('./backjobs');
  beforeAll(async () => { BJ = await import('./backjobs'); });
  const lead = () => db().users.find((u) => u.email === 'leader@topmop.ph')!.employee_id!;
  const form = (over = {}) => ({ reason: 'Missed Area' as const, description: 'Two panels were missed', reported_on: T(), reported_by: 'Ms. Reyes (client)', responsible: 'Field crew', charge_type: 'No Charge' as const, ...over });
  const finished = async (label: string) => { await as('owner@topmop.ph'); const r = upToHandover(label, lead()); return r; };

  it('only Admin / Operations can create one, and only for a completed or closed job; the original job is never changed', async () => {
    const { job } = await finished('BJ1');
    const snap = JSON.stringify([db().jobs.find((j) => j.id === job.id), db().workflows.find((w) => w.job_id === job.id), db().invoices.filter((i) => i.job_id === job.id), db().payments.filter((p) => p.job_id === job.id)]);
    await as('leader@topmop.ph');
    expect(() => BJ.createBackJob(job.id, form())).toThrow(/not permitted/);
    await as('ops@topmop.ph');
    expect(() => BJ.createBackJob(job.id, form({ description: ' ' }))).toThrow(/Describe/);
    expect(() => BJ.createBackJob(job.id, form({ responsible: '' }))).toThrow(/responsible/);
    expect(() => BJ.createBackJob(job.id, form({ reported_on: '2099-01-01' }))).toThrow(/future/);
    const open = db().jobs.find((j) => j.status === 'Confirmed')!;
    expect(() => BJ.createBackJob(open.id, form())).toThrow(/completed or closed/);
    const { backJob, job: link } = BJ.createBackJob(job.id, form());
    expect(backJob).toMatchObject({ status: 'Reported', origin_job_id: job.id, job_id: link.id, client_id: link.client_id, site_id: link.site_id, charge_type: 'No Charge' });
    expect(backJob.number).toMatch(/^BJ-/); expect(link.number).not.toBe(db().jobs.find((j) => j.id === job.id)!.number);
    expect(link).toMatchObject({ status: 'Pending', back_job_id: backJob.id, origin_job_id: job.id, contract_amount: 0 });
    expect(backJob.origin_workflow_id).toBe(db().workflows.find((w) => w.job_id === job.id)!.id);
    expect(JSON.stringify([db().jobs.find((j) => j.id === job.id), db().workflows.find((w) => w.job_id === job.id), db().invoices.filter((i) => i.job_id === job.id), db().payments.filter((p) => p.job_id === job.id)])).toBe(snap);
    expect(db().notifications.some((n) => n.key === `bj-new:${backJob.id}`)).toBe(true);
  });

  it('status flow: needs approval before it can be scheduled, then follows the linked job through its own workflow to Closed', async () => {
    const { job, eq } = await finished('BJ2');
    await as('ops@topmop.ph');
    const { backJob, job: link } = BJ.createBackJob(job.id, form());
    expect(() => A.setJobStatus(link.id, 'Confirmed')).toThrow(/must be approved/);
    BJ.reviewBackJob(backJob.id);
    expect(db().back_jobs.find((b) => b.id === backJob.id)!.status).toBe('Under Review');
    await as('leader@topmop.ph');
    expect(() => BJ.approveBackJob(backJob.id, { note: 'ok' })).toThrow(/not permitted/);
    await as('ops@topmop.ph');
    expect(() => BJ.approveBackJob(backJob.id, { note: ' ' })).toThrow(/approval note/);
    BJ.approveBackJob(backJob.id, { note: 'Our miss, redo free' });
    expect(db().back_jobs.find((b) => b.id === backJob.id)).toMatchObject({ status: 'Approved', approval_note: 'Our miss, redo free' });
    store.update('jobs', link.id, { leader_id: lead(), crew_ids: [], start_at: '2030-02-04T08:00', end_at: '2030-02-04T14:00' } as never);
    A.setJobStatus(link.id, 'Confirmed');
    expect(db().back_jobs.find((b) => b.id === backJob.id)!.status).toBe('Scheduled');
    // the follow-up runs through the normal workflow: own checklist, attendance, report and closure
    const wf = W.openWorkflow(link.id);
    W.completeHqChecklist(wf.id, prepForm(wf) as never); W.dispatchJob(wf.id, { confirmed: true }); W.arriveAtSite(wf.id, checkIn([lead()]));
    expect(db().back_jobs.find((b) => b.id === backJob.id)!.status).toBe('In Progress');
    W.confirmScopeNoChanges(wf.id);                                                        // no charge: no new client signature
    W.startWork(wf.id, {}); W.finishWork(wf.id, {}); W.signServiceReport(wf.id, handover);
    expect(db().back_jobs.find((b) => b.id === backJob.id)).toMatchObject({ status: 'Resolved' });
    W.completeCloseOut(wf.id, { items: retItems(wfOf(link.id), () => ({})), confirmed: true });
    expect(db().back_jobs.find((b) => b.id === backJob.id)).toMatchObject({ status: 'Closed' });
    expect(db().assets.find((a) => a.id === eq.id)!.status).toBeDefined();
    await as('finance@topmop.ph');
    expect(() => A.invoiceFromJob(link.id)).toThrow(/no-charge/);
  });

  it('no-charge cost is tracked against the original job as Back Job Cost, not as a separate loss', async () => {
    const { job } = await finished('BJ3');
    await as('ops@topmop.ph');
    const before = B.jobCost(db(), db().jobs.find((j) => j.id === job.id)!);
    const { backJob, job: link } = BJ.createBackJob(job.id, form({ reason: 'Quality Issue' }));
    BJ.approveBackJob(backJob.id, { note: 'free redo' });
    store.update('jobs', link.id, { leader_id: lead(), crew_ids: [] } as never);
    const after = B.jobCost(db(), db().jobs.find((j) => j.id === job.id)!);
    expect(after.backJobCost).toBeGreaterThan(0); expect(after.total).toBeCloseTo(before.total + after.backJobCost, 2);
    expect(after.grossProfit).toBeLessThan(before.grossProfit);
    expect(B.jobCost(db(), db().jobs.find((j) => j.id === link.id)!).chargedTo).toBe(db().jobs.find((j) => j.id === job.id)!.number);
    expect(B.jobProfitRows(db(), '2000-01-01', '2099-12-31').some((r) => r.job.id === link.id)).toBe(false);
  });

  it('chargeable: a new quotation the client must approve before work starts; the new invoice is linked to the back job', async () => {
    const { job } = await finished('BJ4');
    await as('ops@topmop.ph');
    const { backJob, job: link } = BJ.createBackJob(job.id, form({ reason: 'Client Complaint', charge_type: 'Chargeable Additional Work', description: 'Extra glass' }));
    expect(() => BJ.approveBackJob(backJob.id, { note: 'ok' })).toThrow(/quoted amount/);
    BJ.approveBackJob(backJob.id, { note: 'Client agreed to pay', amount: 5000 });
    const b = db().back_jobs.find((x) => x.id === backJob.id)!;
    const q = db().quotations.find((x) => x.id === b.quotation_id)!;
    expect(q.status).toBe('Sent'); expect(db().jobs.find((j) => j.id === link.id)).toMatchObject({ quotation_id: q.id, contract_amount: B.docTotals(q.items, 0, q.vat_mode, q.vat_rate).net });
    store.update('jobs', link.id, { leader_id: lead(), crew_ids: [] } as never);
    A.setJobStatus(link.id, 'Confirmed');
    const wf = W.openWorkflow(link.id);
    W.completeHqChecklist(wf.id, prepForm(wf) as never); W.dispatchJob(wf.id, { confirmed: true }); W.arriveAtSite(wf.id, checkIn([lead()]));
    expect(B.scopeRoute(db(), db().jobs.find((j) => j.id === link.id)!, wfOf(link.id))).toBe('approval');
    expect(() => W.confirmScopeNoChanges(wf.id)).toThrow(/client must review and sign/);
    expect(() => W.startWork(wf.id, {})).toThrow(/scope is approved/);
    W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true });
    expect(db().quotations.find((x) => x.id === q.id)!.status).toBe('Approved');
    W.startWork(wf.id, {}); W.finishWork(wf.id, {}); W.signServiceReport(wf.id, handover);
    await as('finance@topmop.ph');
    const inv = A.invoiceFromJob(link.id);
    expect(inv.job_id).toBe(link.id); expect(inv.quotation_id).toBe(q.id);
    expect(B.jobProfitRows(db(), '2000-01-01', '2099-12-31').some((r) => r.job.id === link.id)).toBe(true);   // billed back jobs stand on their own
  });

  it('rejecting cancels the follow-up job; statistics cover open, reason, cost, repeats, resolution time and satisfaction', async () => {
    const { job } = await finished('BJ5');
    await as('ops@topmop.ph');
    const a = BJ.createBackJob(job.id, form()); const b = BJ.createBackJob(job.id, form({ reason: 'Warranty/Touch-Up' }));
    BJ.rejectBackJob(a.backJob.id, 'Outside the warranty');
    expect(db().jobs.find((j) => j.id === a.job.id)!.status).toBe('Cancelled'); expect(db().back_jobs.find((x) => x.id === a.backJob.id)!.status).toBe('Rejected');
    const st = B.backJobStats(db(), '2000-01-01', '2099-12-31');
    expect(st.total).toBeGreaterThan(0); expect(st.open.every((r) => B.isOpenBackJob(r.b))).toBe(true);
    expect(st.byReason.reduce((s, r) => s + r.n, 0)).toBe(st.total); expect(st.byClient.length).toBeGreaterThan(0); expect(st.byService.length).toBeGreaterThan(0);
    expect(st.repeated.some((r) => r.originId === job.id && r.n >= 2)).toBe(true);
    expect(st.resolved).toBeGreaterThan(0); expect(st.avgResolutionDays).toBeGreaterThanOrEqual(0);
    expect(st.ratedCount).toBeGreaterThan(0);
    void b;
  });
});

describe('Payment method confirmation', () => {
  const lead = () => db().users.find((u) => u.email === 'leader@topmop.ph')!.employee_id!;
  const gcash = { method: 'GCash' as const, collection: 'Received' as const, confirmed: true };

  it('is asked after the work is finished, needs the method-specific details and never blocks the handover or report signature', async () => {
    await as('owner@topmop.ph');
    const { job, wf } = upToWork('PM1', lead());
    await as('leader@topmop.ph');
    expect(() => W.confirmPaymentMethod(job.id, { ...gcash, expected_today: 1000, gcash_ref: 'G1' })).toThrow(/work is finished/);
    await as('owner@topmop.ph'); W.finishWork(wf.id, {}); await as('leader@topmop.ph');
    expect(() => W.confirmPaymentMethod(job.id, { method: undefined as never, confirmed: true })).toThrow(/choose one option/);
    expect(() => W.confirmPaymentMethod(job.id, { ...gcash, expected_today: 1000, gcash_ref: 'G1', confirmed: false })).toThrow(/Confirm with the client/);
    expect(() => W.confirmPaymentMethod(job.id, { method: 'Cash' } as never)).toThrow();
    expect(() => W.confirmPaymentMethod(job.id, { method: 'Cash', confirmed: true })).toThrow(/received or will be paid later/);
    expect(() => W.confirmPaymentMethod(job.id, { method: 'Cash', collection: 'Received', confirmed: true })).toThrow(/amount received/);
    expect(() => W.confirmPaymentMethod(job.id, { ...gcash, expected_today: 1000 })).toThrow(/GCash reference/);
    expect(() => W.confirmPaymentMethod(job.id, { method: 'Bank Transfer', collection: 'Received', expected_today: 1000, bank_name: 'BDO', confirmed: true })).toThrow(/transfer reference/);
    expect(() => W.confirmPaymentMethod(job.id, { method: 'Cheque', collection: 'Received', expected_today: 1000, bank_name: 'BPI', cheque_no: '1', confirmed: true })).toThrow(/cheque date/);
    expect(() => W.confirmPaymentMethod(job.id, { method: 'Terms / To Be Billed', confirmed: true })).toThrow(/terms or due date/);
    expect(() => W.confirmPaymentMethod(job.id, { ...gcash, expected_today: 99999999, gcash_ref: 'G1' })).toThrow(/more than the balance/);
    // none of that held up the signed handover
    W.signServiceReport(wf.id, handover);
    expect(stat(job.id)).toBe('Work Completed');
    expect(db().payment_confirmations.filter((c) => c.job_id === job.id).length).toBe(0);
  });

  it('records final bill, method, expected today, balance later, note and confirmation; money received waits for Finance and cannot be verified by the Team Leader', async () => {
    await as('owner@topmop.ph');
    const { job, wf } = upToHandover('PM2', lead());
    await as('leader@topmop.ph');
    const bill = W.paymentBalance(db().jobs.find((j) => j.id === job.id)!, wfOf(job.id), 0);
    expect(bill.finalBill).toBeCloseTo(B.finalQuoteSummary(db(), db().jobs.find((j) => j.id === job.id)!).finalTotal, 2);
    const c = W.confirmPaymentMethod(job.id, { ...gcash, expected_today: 2500, gcash_ref: 'GC-2026-1', note: 'Paid by the facility manager' });
    expect(c).toMatchObject({ method: 'GCash', collection: 'Received', expected_today: 2500, gcash_ref: 'GC-2026-1', note: 'Paid by the facility manager', confirmed_by: expect.any(String) });
    expect(c.final_bill).toBeCloseTo(bill.finalBill, 2); expect(c.balance_later).toBeCloseTo(bill.due - 2500, 2);
    expect(c.payment_id).toBeUndefined();                                   // no approved invoice yet → the payment entry is created when Finance approves it
    await as('finance@topmop.ph');
    const inv = A.invoiceFromJob(job.id);
    expect(inv.notes).toMatch(/GCash · received on site/);
    A.approveInvoice(inv.id);
    const c2 = db().payment_confirmations.find((x) => x.job_id === job.id)!;
    const pay = db().payments.find((p) => p.id === c2.payment_id)!;
    expect(pay).toMatchObject({ status: 'Pending Verification', method: 'GCash', gcash_ref: 'GC-2026-1', amount: 2500, confirmation_id: c2.id, invoice_id: inv.id });
    const live = () => db().invoices.find((i) => i.id === inv.id)!;
    expect(B.invoiceBalance(db(), live())).toBeCloseTo(B.invoiceTotals(inv).total, 2);          // pending money does not reduce the balance
    await as('leader@topmop.ph');
    expect(() => A.verifyPayment(pay.id)).toThrow(/not permitted/);
    expect(() => W.confirmPaymentMethod(job.id, { ...gcash, expected_today: 100, gcash_ref: 'X' })).toThrow(/already recorded/);
    await as('finance@topmop.ph');
    A.verifyPayment(pay.id);
    expect(B.invoiceBalance(db(), live())).toBeCloseTo(B.invoiceTotals(inv).total - 2500, 2);
    void wf;
  });

  it('with an approved invoice the payment entry is created at once; cheque and bank transfer details carry over; "to be paid later" creates no payment', async () => {
    await as('owner@topmop.ph');
    const a = upToHandover('PM3', lead());
    await as('finance@topmop.ph');
    const inv = A.invoiceFromJob(a.job.id); A.approveInvoice(inv.id);
    await as('leader@topmop.ph');
    const c = W.confirmPaymentMethod(a.job.id, { method: 'Cheque', collection: 'Received', expected_today: 1500, bank_name: 'BPI', cheque_no: '778899', cheque_date: T(), confirmed: true });
    const p = db().payments.find((x) => x.id === c.payment_id)!;
    expect(p).toMatchObject({ status: 'Pending Verification', method: 'Cheque', cheque_no: '778899', bank_name: 'BPI', cheque_status: 'Pending Clearance' });
    await as('owner@topmop.ph');
    const b = upToHandover('PM4', lead());
    await as('leader@topmop.ph');
    const later = W.confirmPaymentMethod(b.job.id, { method: 'Bank Transfer', collection: 'To Be Paid Later', confirmed: true, note: 'Will transfer Friday' });
    expect(later).toMatchObject({ collection: 'To Be Paid Later', expected_today: 0 }); expect(later.balance_later).toBeCloseTo(later.final_bill, 2);
    expect(db().payments.some((x) => x.confirmation_id === later.id)).toBe(false);
    // the Team Leader can change their answer until money has been recorded
    const changed = W.confirmPaymentMethod(b.job.id, { method: 'Terms / To Be Billed', terms: 'Net 15', due_date: '2099-01-01', confirmed: true });
    expect(changed.id).toBe(later.id); expect(changed).toMatchObject({ method: 'Terms / To Be Billed', collection: 'To Be Paid Later', terms: 'Net 15' });
    await as('finance@topmop.ph');
    expect(A.invoiceFromJob(b.job.id).due_date).toBe('2099-01-01');
  });
});

describe('Ocular visits', () => {
  let O: typeof import('./ocular');
  beforeAll(async () => { O = await import('./ocular'); });
  const lead = () => db().users.find((u) => u.email === 'leader@topmop.ph')!.employee_id!;
  const form = (over = {}) => {
    const c = db().clients.find((x) => db().sites.some((s) => s.client_id === x.id))!; const s = db().sites.find((x) => x.client_id === c.id)!;
    return { client_id: c.id, contact_person: s.contact_person, contact_mobile: s.contact_mobile, site_id: s.id, location: s.address, service_codes: ['GLASS_EXT' as const], start_at: `${T()}T00:30`, duration_min: 60, assignee_id: lead(), concerns: 'Price for the whole façade', access_notes: 'Ask for the guard', ...over };
  };

  it('Admin/Operations schedule it with all the details; Team Leaders cannot; the estimator cannot be double-booked', async () => {
    await as('leader@topmop.ph');
    expect(() => O.scheduleOcularVisit(form())).toThrow(/not permitted/);
    await as('ops@topmop.ph');
    expect(() => O.scheduleOcularVisit(form({ contact_person: ' ' }))).toThrow(/contact person/);
    expect(() => O.scheduleOcularVisit(form({ service_codes: [] }))).toThrow(/service type/);
    expect(() => O.scheduleOcularVisit(form({ assignee_id: undefined }))).toThrow(/estimator/);
    expect(() => O.scheduleOcularVisit(form({ start_at: '2001-01-01T09:00' }))).toThrow(/past/);
    expect(() => O.scheduleOcularVisit(form({ duration_min: 5 }))).toThrow(/duration/);
    const v = O.scheduleOcularVisit(form({ start_at: '2031-03-03T09:00' }));
    expect(v).toMatchObject({ status: 'Scheduled', number: expect.stringMatching(/^OV-/), duration_min: 60, assignee_id: lead(), access_notes: 'Ask for the guard' });
    expect(() => O.scheduleOcularVisit(form({ start_at: '2031-03-03T09:30' }))).toThrow(/already booked/);
    O.scheduleOcularVisit(form({ start_at: '2031-03-03T10:00' }));                      // back-to-back is fine
    O.confirmOcularVisit(v.id);
    expect(db().ocular_visits.find((x) => x.id === v.id)!.status).toBe('Confirmed');
    O.updateOcularVisit(v.id, form({ start_at: '2031-03-04T09:00' }));
    expect(() => O.cancelOcularVisit(v.id, ' ')).toThrow(/reason/);
    O.cancelOcularVisit(v.id, 'Client postponed');
    expect(db().ocular_visits.find((x) => x.id === v.id)).toMatchObject({ status: 'Cancelled', cancel_reason: 'Client postponed' });
    expect(() => O.updateOcularVisit(v.id, form())).toThrow(/cancelled visit/);
  });

  it('completing records the panel count / measurements; only the assigned estimator or Admin may; then a quotation carries everything forward', async () => {
    await as('ops@topmop.ph');
    const v = O.scheduleOcularVisit(form({ service_codes: ['GLASS_EXT', 'FLOOR'], start_at: `${T()}T00:20`, duration_min: 30 }));
    const future = O.scheduleOcularVisit(form({ start_at: '2032-05-05T09:00' }));
    const panels = [{ id: 'p1', area: '1st Floor', side: 'Front', external: 12, internal: 6 }, { id: 'p2', area: '2nd Floor', side: 'Rear', external: 8, internal: 8, notes: 'Hard water' }];
    const meas = [{ id: 'm1', label: 'Driveway', service_code: 'FLOOR' as const, qty: 140, unit: 'sqm' }];
    expect(() => O.completeOcularVisit(future.id, { panels, measurements: meas, findings: '' })).toThrow(/not happened yet/);
    expect(() => O.createQuotationFromOcular(v.id)).toThrow(/Complete the ocular visit first/);
    await as('field@topmop.ph');
    expect(() => O.completeOcularVisit(v.id, { panels, measurements: meas, findings: '' })).toThrow(/assigned/);
    await as('leader@topmop.ph');
    expect(() => O.completeOcularVisit(v.id, { panels: [], measurements: [], findings: 'x' })).toThrow(/glass panel count/);
    expect(() => O.completeOcularVisit(v.id, { panels, measurements: [{ id: 'm', label: '', qty: 0, unit: '' }], findings: '' })).toThrow(/label/);
    expect(() => O.completeOcularVisit(v.id, { panels, measurements: meas, findings: 'Hard-water stains upstairs' })).toThrow(/contact person to sign/);
    expect(() => O.completeOcularVisit(v.id, { panels, measurements: meas, findings: 'Hard-water stains upstairs', visit_sig: 'data:image/png;base64,AA', visit_sig_name: ' ' })).toThrow(/printed name/);
    O.completeOcularVisit(v.id, { panels, measurements: meas, findings: 'Hard-water stains upstairs', visit_sig: 'data:image/png;base64,AA', visit_sig_name: 'Ms. Reyes' });
    expect(db().ocular_visits.find((x) => x.id === v.id)).toMatchObject({ visit_sig_name: 'Ms. Reyes', visit_sig: expect.any(String), visit_sig_at: expect.any(String) });
    expect(db().ocular_visits.find((x) => x.id === v.id)).toMatchObject({ status: 'Completed', completed_by: expect.any(String) });
    expect(B.ocularStats(db()).awaiting.some((x) => x.id === v.id)).toBe(true);
    expect(db().notifications.some((n) => n.key === `oc-quote:${v.id}`)).toBe(true);
    const q = O.createQuotationFromOcular(v.id);
    expect(q).toMatchObject({ status: 'Draft', client_id: v.client_id, ocular_visit_id: v.id, ocular_assignee_id: lead(), site_id: v.site_id });
    expect(q.scope).toMatch(/20 external, 14 internal/); expect(q.scope).toMatch(/Driveway 140 sqm/); expect(q.scope).toMatch(/Hard-water stains/); expect(q.scope).toMatch(/Ask for the guard/);
    expect(q.ocular_panels).toEqual(panels); expect(q.ocular_measurements).toEqual(meas);
    expect(q.items.filter((i) => i.service_code === 'GLASS_EXT').length).toBeGreaterThan(0);
    expect(q.items.find((i) => i.service_code === 'FLOOR')!.qty).toBe(140);
    expect(db().ocular_visits.find((x) => x.id === v.id)).toMatchObject({ status: 'Converted to Quotation', quotation_id: q.id });
    expect(() => O.createQuotationFromOcular(v.id)).toThrow(/already created/);
    expect(B.ocularStats(db()).converted.some((x) => x.id === v.id)).toBe(true);
    expect(() => store.remove('ocular_visits', v.id)).toThrow(/cannot be deleted/);
  });

  it('stats: today / upcoming / awaiting / converted, and no photo or odometer fields exist on a visit', async () => {
    await as('owner@topmop.ph');
    const st = B.ocularStats(db());
    expect(st.upcoming.every((v) => v.start_at.slice(0, 10) > T())).toBe(true);
    expect(st.awaiting.every((v) => v.status === 'Completed')).toBe(true);
    const keys = JSON.stringify(Object.keys(db().ocular_visits[0]));
    expect(keys).not.toMatch(/photo|odo/i);
  });
});

describe('Quotation images', () => {
  let QI: typeof import('./quoteimages');
  beforeAll(async () => { QI = await import('./quoteimages'); });
  const lead = () => db().users.find((u) => u.email === 'leader@topmop.ph')!.employee_id!;
  const IMG = { file: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', name: 'a.jpg', width: 640, height: 480, category: 'Scope Area' as const };
  const draftQuote = () => {
    const base = db().quotations.find((q) => q.status === 'Approved')!;
    const { id: _i, number: _n, ...rest } = base; void [_i, _n];
    return store.insert('quotations', { ...rest, number: store.nextNumber('QT'), status: 'Draft', ocular_assignee_id: undefined } as never) as import('./types').Quotation;
  };

  it('is optional and limited to Admin, Operations and the assigned Team Leader', async () => {
    await as('owner@topmop.ph');
    const q = draftQuote();
    expect(QI.quoteImagesOf(db(), { quotation_id: q.id }).length).toBe(0);                 // nothing is required
    await as('finance@topmop.ph');
    expect(() => QI.addQuoteImage({ quotation_id: q.id }, IMG)).toThrow(/Only the Admin, Operations Manager or the assigned Team Leader/);
    await as('field@topmop.ph');
    expect(() => QI.addQuoteImage({ quotation_id: q.id }, IMG)).toThrow(/Only the Admin/);
    await as('leader@topmop.ph');
    expect(() => QI.addQuoteImage({ quotation_id: q.id }, IMG)).toThrow(/assigned Team Leader/);          // a Team Leader who is not assigned to this quotation
    await as('owner@topmop.ph');
    store.update('quotations', q.id, { ocular_assignee_id: lead() } as never);               // now the leader is the assigned estimator
    await as('leader@topmop.ph');
    const a = QI.addQuoteImage({ quotation_id: q.id }, { ...IMG, category: 'Panel Count', caption: 'Second floor', item_index: 0, share_with_client: true });
    expect(a).toMatchObject({ category: 'Panel Count', caption: 'Second floor', item_label: db().quotations.find((x) => x.id === q.id)!.items[0].description, share_with_client: true });
    await as('ops@topmop.ph');
    const b = QI.addQuoteImage({ quotation_id: q.id }, { ...IMG, category: 'Exclusion', caption: 'Basement not included' });
    expect(b.share_with_client).toBe(false);
    expect(QI.quoteImagesOf(db(), { quotation_id: q.id }).length).toBe(2);
    expect(QI.quoteImagesOf(db(), { quotation_id: q.id }, true).map((i) => i.id)).toEqual([a.id]);   // the client sees only what was selected for sharing
  });

  it('validates category, caption, line-item link and file type; deletes are soft and audited', async () => {
    await as('ops@topmop.ph');
    const q = draftQuote(); const t = { quotation_id: q.id };
    expect(() => QI.addQuoteImage(t, { ...IMG, category: 'Selfie' as never })).toThrow(/category/);
    expect(() => QI.addQuoteImage(t, { ...IMG, caption: 'x'.repeat(200) })).toThrow(/caption short/);
    expect(() => QI.addQuoteImage(t, { ...IMG, item_index: 99 })).toThrow(/no longer exists/);
    expect(() => QI.addQuoteImage(t, { ...IMG, file: 'data:application/pdf;base64,AAAA' })).toThrow(/image file/);
    const i = QI.addQuoteImage(t, IMG);
    QI.updateQuoteImage(i.id, { caption: 'Updated', category: 'Site Condition', share_with_client: true });
    expect(db().quote_images.find((x) => x.id === i.id)).toMatchObject({ caption: 'Updated', category: 'Site Condition', share_with_client: true });
    QI.deleteQuoteImage(i.id);
    expect(db().quote_images.find((x) => x.id === i.id)!.deleted_at).toBeTruthy();
    expect(QI.quoteImagesOf(db(), t).length).toBe(0);
    expect(db().audit.some((a) => a.record_id === i.id && a.action === 'delete')).toBe(true);
    for (let n = 0; n < QI.MAX_IMAGES_PER_RECORD; n++) QI.addQuoteImage(t, IMG);
    expect(() => QI.addQuoteImage(t, IMG)).toThrow(/maximum/);
  });

  it('images stay with an approved quotation / variation; a revision gets copies and the original keeps its own', async () => {
    await as('ops@topmop.ph');
    const q = draftQuote(); const img = QI.addQuoteImage({ quotation_id: q.id }, { ...IMG, caption: 'Scope', share_with_client: true });
    A.setQuoteStatus(q.id, 'Sent'); QI.addQuoteImage({ quotation_id: q.id }, IMG);                 // still allowed while Sent
    A.setQuoteStatus(q.id, 'Approved');
    expect(() => QI.addQuoteImage({ quotation_id: q.id }, IMG)).toThrow(/locked/);
    expect(() => QI.deleteQuoteImage(img.id)).toThrow(/locked/);
    expect(() => QI.updateQuoteImage(img.id, { caption: 'changed' })).toThrow(/locked/);
    expect(() => store.update('quote_images', img.id, { caption: 'sneaky' } as never)).toThrow(/locked/);
    const rev = A.duplicateQuotation(q.id);
    expect(QI.quoteImagesOf(db(), { quotation_id: q.id }).length).toBe(2);                       // original unchanged
    const copies = QI.quoteImagesOf(db(), { quotation_id: rev.id });
    expect(copies.length).toBe(2); expect(copies.map((c) => c.id)).not.toContain(img.id); expect(copies.find((c) => c.caption === 'Scope')!.share_with_client).toBe(true);
    QI.addQuoteImage({ quotation_id: rev.id }, IMG);                                               // the revision is still editable
    expect(QI.quoteImagesOf(db(), { quotation_id: q.id }).length).toBe(2);
    // variations: a draft can take images, an approved one is locked
    await as('owner@topmop.ph');
    const { job, wf } = upToCheckIn('QIV', lead(), false);
    W.savePanels(wf.id, [{ id: 'p1', area: '1st Floor', side: 'Front', external: 6, internal: 0, additional: true }]);
    W.saveFinalReview(wf.id, { items: [{ service_code: 'GLASS_EXT', category: 'glass', description: '', qty: 0, entered_qty: 0, unit: 'panel', rate: 140, discount: 0, linked_panels: true }] });
    const v = db().variations.find((x) => x.job_id === job.id && x.status === 'Draft')!;
    await as('leader@topmop.ph');
    const vi = QI.addQuoteImage({ variation_id: v.id }, { ...IMG, category: 'Additional Work', caption: 'Extra roof panels', item_index: 0, share_with_client: true });
    expect(vi).toMatchObject({ variation_id: v.id, job_id: job.id });
    W.approveFinalQuote(wf.id, { name: 'Ms. Reyes', signature: PNG, confirmed: true });
    expect(() => QI.deleteQuoteImage(vi.id)).toThrow(/locked/);
    expect(() => QI.addQuoteImage({ variation_id: v.id }, IMG)).toThrow(/locked/);
    expect(QI.quoteImagesOf(db(), { variation_id: v.id }, true).length).toBe(1);
  });

  it('keeps quotation images apart from job photos', () => {
    const img = db().quote_images[0];
    expect(Object.keys(img).join()).not.toMatch(/job_photo|odo/i);
    expect(db().jobs.every((j) => !('photos' in j))).toBe(true);
  });
});

import { addDays as A2 } from './util';
describe('Client lifetime value & maintenance follow-up', () => {
  let F: typeof import('./followups'); let C: typeof import('./followup-core');
  beforeAll(async () => { F = await import('./followups'); C = await import('./followup-core'); });
  let n = 0;
  const newClient = () => store.insert('clients', { name: `Follow-up Test ${++n}`, contact_person: 'Ms. Cruz', mobile: '+63 917 000 0000', email: '', address: 'Makati City', billing_address: '', type: 'Commercial', status: 'Active', notes: '', access_instructions: '', tin: '', vat_status: 'VAT-registered', withholding_rate: 0, withholding_notes: '', branch_id: db().branches[0].id } as never) as import('./types').Client;
  const mkJob = (clientId: string, date: string, over: Record<string, unknown> = {}) => {
    const site = db().sites[0];
    return store.insert('jobs', { number: `FU-${++n}`, client_id: clientId, site_id: site.id, branch_id: db().branches[0].id, service_codes: ['WALL'], scope: 'Wall cleaning', start_at: `${date}T08:00`, end_at: `${date}T12:00`,
      status: 'Closed', crew_ids: [], equipment_ids: [], materials: [], ppe: [], checklist: [], findings: '', damage_report: '', equipment_condition_notes: '', contract_amount: 1000, estimated_cost: 0, completed_at: `${date}T10:00`, ...over } as never) as import('./types').Job;
  };
  const fus = (clientId: string) => db().followups.filter((f) => f.client_id === clientId && !f.deleted_at);

  it('shows lifetime billed, verified collections, receivables and completed services without touching the money maths', async () => {
    await as('owner@topmop.ph');
    const c = newClient();
    mkJob(c.id, '2026-01-10'); mkJob(c.id, '2026-02-10'); mkJob(c.id, '2026-03-10', { status: 'Confirmed', completed_at: undefined });   // an unfinished job is not counted
    const inv = store.insert('invoices', { number: `INV-FU-${n}`, client_id: c.id, issue_date: '2026-02-11', due_date: '2026-03-11', items: [{ service_code: 'WALL', description: 'Wall', qty: 10, unit: 'sqm', rate: 100, discount: 0 }], vat_mode: 'exclusive', vat_rate: 12, discount: 0, withholding_rate: 0, status: 'Approved', branch_id: db().branches[0].id } as never) as import('./types').Invoice;
    store.insert('invoices', { ...inv, id: undefined, number: `INV-FU-D${n}`, status: 'Draft' } as never);                 // drafts are not finalized
    const pay = (amount: number, status: string) => store.insert('payments', { invoice_id: inv.id, client_id: c.id, date: '2026-02-20', amount, wht_amount: 0, method: 'Cash', reference: '', receipt_no: `OR-FU-${++n}`, received_by: 'Test', status } as never);
    pay(500, 'Verified'); pay(300, 'Pending Verification'); pay(200, 'Rejected');
    const v = C.clientValue(db(), db().clients.find((x) => x.id === c.id)!);
    expect(v).toMatchObject({ billed: 1120, collected: 500, outstanding: 620, completed: 2, lastDate: '2026-02-10' });
    expect(v.outstanding).toBe(B.invoiceBalance(db(), inv));                    // same figure as the receivables module
  });

  it('adds 6-month and 1-year follow-ups from the newest completed service, once', async () => {
    await as('owner@topmop.ph');
    expect(C.addMonths('2026-08-31', 6)).toBe('2027-02-28');                    // month-end is clamped, never rolls over
    const c = newClient(); const j = mkJob(c.id, '2026-03-15');
    F.syncFollowUps(); F.syncFollowUps(); A.runAutomations();                     // running again never duplicates
    const list = fus(c.id);
    expect(list.map((f) => [f.slot, f.due_date, f.status, f.reference_job_id]).sort()).toEqual([['long', '2027-03-15', 'Open', j.id], ['short', '2026-09-15', 'Open', j.id]]);
    expect(C.intervalLabel(6)).toBe('6 Months After Last Completed Service'); expect(C.intervalLabel(12)).toBe('1 Year After Last Completed Service');
  });

  it('lets Admin set a custom interval by client or service type (client wins) and only Admin', async () => {
    await as('owner@topmop.ph');
    const c = newClient(); mkJob(c.id, '2026-03-15', { service_codes: ['SOLAR'] }); F.syncFollowUps();
    F.saveFollowUpRule({ service_code: 'SOLAR', short_months: 3, long_months: 6 });
    expect(fus(c.id).find((f) => f.slot === 'short')!.due_date).toBe('2026-06-15');
    F.saveFollowUpRule({ client_id: c.id, short_months: 2, long_months: 4 });
    expect(fus(c.id).map((f) => f.due_date).sort()).toEqual(['2026-05-15', '2026-07-15']);
    expect(fus(c.id).length).toBe(2);
    expect(() => F.saveFollowUpRule({ client_id: c.id, short_months: 6, long_months: 6 })).toThrow(/after the first/);
    expect(() => F.saveFollowUpRule({ client_id: c.id, service_code: 'SOLAR', short_months: 1, long_months: 2 })).toThrow(/either a client or a service type/);
    for (const r of db().followup_rules.filter((x) => !x.deleted_at && (x.client_id === c.id || x.service_code === 'SOLAR'))) F.removeFollowUpRule(r.id);
    await as('ops@topmop.ph');
    expect(() => F.saveFollowUpRule({ client_id: c.id, short_months: 1, long_months: 2 })).toThrow(/not permitted/);
  });

  it('resets open reminders when a newer job completes and never sends a 1-year reminder after it', async () => {
    await as('owner@topmop.ph');
    const c = newClient(); const j1 = mkJob(c.id, '2026-01-05'); F.syncFollowUps();
    expect(fus(c.id).length).toBe(2);
    const j2 = mkJob(c.id, '2026-08-20'); F.syncFollowUps(); F.syncFollowUps();
    const all = fus(c.id);
    expect(all.filter((f) => f.reference_job_id === j1.id).every((f) => f.status === 'Superseded')).toBe(true);
    const cur = all.filter((f) => f.status === 'Open');
    expect(cur.map((f) => [f.slot, f.due_date, f.reference_job_id]).sort()).toEqual([['long', '2027-08-20', j2.id], ['short', '2027-02-20', j2.id]]);
    expect(all.length).toBe(4);
    // the 1-year date of the first service (2027-01-05) produces no alert: it was replaced
    expect(C.followUpAlerts(db(), '2026-12-22').filter((a) => a.client_id === c.id)).toEqual([]);
    expect(C.followUpAlerts(db(), '2027-01-05').filter((a) => a.client_id === c.id)).toEqual([]);
  });

  it('notifies Admin 14 days before and on each follow-up date with the full client details', async () => {
    await as('owner@topmop.ph');
    const c = newClient(); mkJob(c.id, '2026-03-15'); F.syncFollowUps();
    const mine = (t: string) => C.followUpAlerts(db(), t).filter((a) => a.client_id === c.id);
    expect(mine('2026-08-31')).toEqual([]);                                                   // 15 days before
    const pre = mine('2026-09-01'); expect(pre.length).toBe(1); expect(pre[0].key).toMatch(/^fu-pre:/); expect(pre[0].title).toMatch(/in 14 days/);
    const due = mine('2026-09-15'); expect(due.length).toBe(1); expect(due[0].key).toMatch(/^fu-due:/); expect(due[0].title).toMatch(/today/);
    for (const part of [c.name, 'Ms. Cruz', '+63 917 000 0000', '2026-03-15', 'Wall', 'Lifetime billed', '1 completed service', 'Suggested:']) expect(due[0].body).toContain(part);
    expect(mine('2027-03-01').find((a) => /1 Year/.test(a.title))!.title).toMatch(/1 Year follow-up in 14 days/);
    A.runAutomations();
    expect(db().notifications.filter((x) => x.key.startsWith('fu-')).every((x) => x.for_roles.join() === 'owner')).toBe(true);   // Admin only
  });

  it('lets only Admin mark follow-ups, validates, and acting stops the reminders', async () => {
    await as('owner@topmop.ph');
    const c = newClient(); mkJob(c.id, '2026-03-15'); F.syncFollowUps();
    const f = fus(c.id).find((x) => x.slot === 'short')!;
    await as('ops@topmop.ph');
    expect(() => F.setFollowUpStatus(f.id, { status: 'Contacted' })).toThrow(/not permitted/);
    await as('owner@topmop.ph');
    expect(() => F.setFollowUpStatus(f.id, { status: 'Not Interested' })).toThrow(/reason/);
    expect(() => F.setFollowUpStatus(f.id, { status: 'Snoozed', snoozed_until: '2020-01-01' })).toThrow(/future/);
    F.setFollowUpStatus(f.id, { status: 'Contacted', note: 'Called' });
    expect(C.clientFollow(db(), c.id, '2026-09-20')).toMatchObject({ status: 'Contacted', detail: 'Contacted' });
    expect(C.followUpAlerts(db(), '2026-09-20').find((a) => a.client_id === c.id)).toBeUndefined();   // the 6-month one was acted on; the 1-year one is months away
    for (const s of ['Follow-Up Scheduled', 'Quotation Sent'] as const) F.setFollowUpStatus(f.id, { status: s });
    F.setFollowUpStatus(f.id, { status: 'Snoozed', snoozed_until: A2(T(), 60) });
    expect(C.effectiveDue(db().followups.find((x) => x.id === f.id)!)).toBe(A2(T(), 60));
    expect(db().followups.find((x) => x.id === f.id)!.history.map((h) => h.status)).toEqual(['Contacted', 'Follow-Up Scheduled', 'Quotation Sent', 'Snoozed']);
    F.setFollowUpStatus(f.id, { status: 'Not Interested', note: 'Using another contractor' });
    expect(C.clientFollow(db(), c.id, '2027-04-01').status).toBe('Not Interested');            // the cycle is finished: no 1-year reminder either
    expect(C.followUpAlerts(db(), '2027-03-15').filter((a) => a.client_id === c.id)).toEqual([]);
    expect(() => store.remove('followups', f.id)).toThrow(/cannot be deleted/);
  });

  it('counts follow-ups that turned into bookings, with the revenue of the linked job', async () => {
    await as('owner@topmop.ph');
    const c = newClient(); mkJob(c.id, '2026-03-15'); F.syncFollowUps();
    const f = fus(c.id).find((x) => x.slot === 'short')!;
    const before = C.followUpStats(db(), '2026-09-10');
    F.setFollowUpStatus(f.id, { status: 'Contacted' });
    const booking = mkJob(c.id, '2026-10-01', { status: 'Confirmed', completed_at: undefined, contract_amount: 25000 });   // created after the call → counted as the booking
    F.syncFollowUps();
    const now = db().followups.find((x) => x.id === f.id)!;
    expect(now).toMatchObject({ status: 'Booked', booked_job_id: booking.id });
    const st = C.followUpStats(db(), '2026-09-10');
    expect(st.converted.length).toBe(before.converted.length + 1);
    expect(st.revenue).toBeCloseTo(before.revenue + C.bookingRevenue(db(), now), 2);
    expect(C.bookingRevenue(db(), now)).toBe(25000);
    expect(st.overdue.every((o) => o.f.client_id !== c.id)).toBe(true);
  });
});

describe('Job prep follows the booking', () => {
  it('removing equipment from the booking removes it from the open prep list; confirmed and added items stay', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const sc = scenario('PREPSYNC', lead);
    store.update('jobs', sc.job.id, { start_at: '2031-07-01T08:00', end_at: '2031-07-01T17:00' } as never);
    const wf = W.openWorkflow(sc.job.id);
    expect(wf.items.some((i) => i.asset_id === sc.tool.id)).toBe(true);
    // the Team Leader confirms the pressure washer on the prep list, then Operations takes the ladder off the booking
    store.update('workflows', wf.id, { items: wf.items.map((i) => (i.asset_id === sc.eq.id ? { ...i, out_ok: true, out_by: 'manual' as const } : i)) } as never);
    const job = db().jobs.find((j) => j.id === sc.job.id)!;
    A.saveJob({ ...job, equipment_ids: [sc.eq.id], id: job.id } as never);
    const items = db().workflows.find((w) => w.id === wf.id)!.items;
    expect(items.some((i) => i.asset_id === sc.tool.id)).toBe(false);                       // gone from the prep list
    expect(items.find((i) => i.asset_id === sc.eq.id)).toMatchObject({ out_ok: true });     // progress kept
    // a new piece of equipment on the booking appears; prep can then be completed without the removed one
    A.saveJob({ ...db().jobs.find((j) => j.id === sc.job.id)!, equipment_ids: [sc.eq.id, sc.tool.id], id: sc.job.id } as never);
    expect(db().workflows.find((w) => w.id === wf.id)!.items.some((i) => i.asset_id === sc.tool.id)).toBe(true);
    // once prep is done the list is locked: later edits do not rewrite it
    A.saveJob({ ...db().jobs.find((j) => j.id === sc.job.id)!, equipment_ids: [sc.eq.id], id: sc.job.id } as never);
    W.completeHqChecklist(wf.id, prepForm(db().workflows.find((w) => w.id === wf.id)!) as never);
    const before = JSON.stringify(db().workflows.find((w) => w.id === wf.id)!.items);
    A.saveJob({ ...db().jobs.find((j) => j.id === sc.job.id)!, equipment_ids: [sc.eq.id, sc.tool.id], id: sc.job.id } as never);
    expect(JSON.stringify(db().workflows.find((w) => w.id === wf.id)!.items)).toBe(before);
  });
});

describe('Stale equipment holds', () => {
  it('a checkout left behind by a prep that never completed does not block the next booking; a live one still does', async () => {
    await as('owner@topmop.ph');
    const lead = db().employees[3].id;
    const a = scenario('STALE-A', lead); const b = scenario('STALE-B', lead);
    store.update('jobs', a.job.id, { start_at: '2031-09-01T08:00', end_at: '2031-09-01T17:00' } as never);
    store.update('jobs', b.job.id, { start_at: '2031-09-02T08:00', end_at: '2031-09-02T17:00', equipment_ids: [a.eq.id] } as never);
    // job A's prep started and left a Released record behind, but its HQ checklist was never completed
    W.openWorkflow(a.job.id);
    store.insert('checkouts', { asset_id: a.eq.id, job_id: a.job.id, requested_by: lead, responsible_id: lead, status: 'Released', expected_return: '2031-09-01T17:00', out_at: '2031-09-01T07:00' } as never);
    const wfB = W.openWorkflow(b.job.id);
    W.completeHqChecklist(wfB.id, prepForm(wfB) as never);                              // no "checked out to another job" error
    expect(db().checkouts.find((c) => c.asset_id === a.eq.id && c.job_id === a.job.id)!.status).toBe('Returned');
    expect(db().checkouts.find((c) => c.asset_id === a.eq.id && c.job_id === b.job.id)!.status).toBe('Released');
    // a genuinely active hold (job A's prep completed) still blocks, and names the job
    const c3 = scenario('STALE-C', lead);
    store.update('jobs', c3.job.id, { start_at: '2031-09-03T08:00', end_at: '2031-09-03T17:00', equipment_ids: [a.eq.id] } as never);
    const wfC = W.openWorkflow(c3.job.id);
    expect(() => W.completeHqChecklist(wfC.id, prepForm(wfC) as never)).toThrow(/checked out to JOB-STALE-B/);
  });
});

describe('Job Order Confirmation', () => {
  let JO: typeof import('./joborders'); let JC: typeof import('./joborder-core');
  beforeAll(async () => { JO = await import('./joborders'); JC = await import('./joborder-core'); });
  let day = 0;
  const booked = (label: string, quoted = true, withLeader = true) => {
    const lead = db().employees[3].id;
    const sc = scenario(label, lead);
    store.update('jobs', sc.job.id, { start_at: `2032-03-${String(++day + 1).padStart(2, '0')}T08:00`, end_at: `2032-03-${String(day + 1).padStart(2, '0')}T17:00`, leader_id: withLeader ? lead : undefined, crew_ids: [] } as never);
    const q = db().quotations.find((x) => x.status === 'Approved')!;
    if (quoted) store.update('jobs', sc.job.id, { quotation_id: q.id, client_id: q.client_id, site_id: q.site_id ?? db().sites.find((s) => s.client_id === q.client_id)!.id } as never);
    JO.syncJobOrders(sc.job.id);
    return { ...sc, q, lead };
  };
  const orders = (jobId: string) => JC.ordersOf(db(), jobId);

  it('creates a Draft with its own number when the booking is confirmed, linked to booking, quotation and client', async () => {
    await as('ops@topmop.ph');
    const a = booked('JO-A'); const b = booked('JO-B');
    const oa = orders(a.job.id); expect(oa.length).toBe(1);
    expect(oa[0]).toMatchObject({ status: 'Draft', version: 1, job_id: a.job.id, quotation_id: a.q.id, client_id: a.q.client_id });
    expect(oa[0].number).toMatch(/^JO-\d{4}-\d{4}$/); expect(oa[0].number).not.toBe(orders(b.job.id)[0].number);
    JO.syncJobOrders(a.job.id); JO.syncJobOrders(); expect(orders(a.job.id).length).toBe(1);                  // never duplicated
    // a booking that is only Pending has none
    const p = scenario('JO-P', a.lead); store.update('jobs', p.job.id, { status: 'Pending', start_at: '2032-04-20T08:00', end_at: '2032-04-20T17:00' } as never); JO.syncJobOrders();
    expect(orders(p.job.id).length).toBe(0);
  });

  it('shows only client-facing content, priced from the approved quotation and variations, never internal figures', async () => {
    await as('ops@topmop.ph');
    const a = booked('JO-C');
    const c = orders(a.job.id)[0].content;
    expect(c.total).toBe(B.finalQuoteSummary(db(), db().jobs.find((j) => j.id === a.job.id)!).finalTotal);
    expect(c.items.map((i) => [i.description, i.qty, i.rate])).toEqual(a.q.items.map((i) => [i.description, i.qty, i.rate]));
    expect(c.scope).toBe(a.q.scope);
    expect(Object.keys(c).sort()).toEqual(['access_notes', 'additions', 'arrival_from', 'arrival_to', 'blocker', 'booking_date', 'client', 'client_address', 'company', 'disclaimer', 'discounts', 'duration_hours', 'items', 'location', 'payment_status', 'payment_terms', 'scope', 'service_date', 'service_types', 'subtotal', 'team', 'total', 'vat', 'vat_label'].filter((k) => k in c).sort());
    const text = JSON.stringify(c);
    for (const secret of ['estimated_cost', 'contract_amount', 'hourly', 'payroll', 'margin', 'profit', 'checklist', 'equipment_condition_notes', 'damage_report', 'findings']) expect(text).not.toContain(secret);
    expect(c.team.leader).toBeTruthy();
    // no team yet → "Team assignment to follow"
    const n = booked('JO-D', true, false);
    expect(orders(n.job.id)[0].content.team).toEqual({ leader: undefined, crew: [] });
    // an approved addition is listed and counted in the final total
    const before = orders(a.job.id)[0].content.total;
    store.insert('variations', { job_id: a.job.id, number: `${db().jobs.find((j) => j.id === a.job.id)!.number}-V1`, reason: 'extra panels', items: [{ service_code: 'WALL', description: 'Extra wall', qty: 10, unit: 'sqm', rate: 100, discount: 0 }], discount: 0, vat_mode: 'exclusive', vat_rate: 12, panel_row_ids: [], status: 'Approved' } as never);
    JO.syncJobOrders(a.job.id);
    const o = orders(a.job.id)[0].content; expect(o.additions.length).toBe(1); expect(o.total).toBeCloseTo(before + 1120, 2);
  });

  it('the draft follows the booking until it is sent; only Admin / Operations review and send; no approved quotation blocks sending', async () => {
    await as('ops@topmop.ph');
    const a = booked('JO-E');
    store.update('jobs', a.job.id, { start_at: '2032-05-10T09:00', end_at: '2032-05-10T15:00' } as never); JO.syncJobOrders(a.job.id);
    expect(orders(a.job.id).length).toBe(1); expect(orders(a.job.id)[0].content.service_date).toBe('2032-05-10');           // refreshed in place
    await as('leader@topmop.ph');
    expect(() => JO.markJobOrderSent(orders(a.job.id)[0].id, 'Email')).toThrow(/not permitted/);
    await as('ops@topmop.ph');
    const noq = booked('JO-F', false); expect(orders(noq.job.id)[0].content.blocker).toMatch(/approved quotation/);
    expect(() => JO.markJobOrderSent(orders(noq.job.id)[0].id, 'Email')).toThrow(/approved quotation/);
    const sent = JO.markJobOrderSent(orders(a.job.id)[0].id, 'Email', 'to Ms. Reyes');
    expect(sent).toMatchObject({ status: 'Sent to Client', sent_via: 'Email', sent_count: 1 }); expect(sent.sent_at).toBeTruthy();
    expect(() => JO.markJobOrderSent(sent.id, 'Email')).toThrow(/already been sent/);
  });

  it('a sent Job Order is never overwritten: schedule, scope, price or team changes supersede it with a revised version', async () => {
    await as('ops@topmop.ph');
    const a = booked('JO-G');
    const v1 = JO.markJobOrderSent(orders(a.job.id)[0].id, 'Share link');
    const snapshot = JSON.stringify(db().job_orders.find((o) => o.id === v1.id)!.content);
    // payment status moving on its own does not revise it
    JO.syncJobOrders(a.job.id); expect(orders(a.job.id).length).toBe(1);
    // schedule
    store.update('jobs', a.job.id, { start_at: '2032-06-01T10:00', end_at: '2032-06-01T16:00' } as never); JO.syncJobOrders(a.job.id);
    let list = orders(a.job.id); expect(list.length).toBe(2);
    expect(list[0]).toMatchObject({ version: 2, status: 'Revised', number: v1.number, supersedes_id: v1.id }); expect(list[0].revision_reason).toMatch(/schedule/);
    expect(list[1]).toMatchObject({ id: v1.id, status: 'Superseded', superseded_by_id: list[0].id });
    expect(JSON.stringify(list[1].content)).toBe(snapshot);                                   // the sent record is untouched
    expect(list[1].sent_at).toBe(v1.sent_at);
    // team
    const v2 = JO.markJobOrderSent(list[0].id, 'Email');
    store.update('jobs', a.job.id, { crew_ids: [db().employees[4].id] } as never); JO.syncJobOrders(a.job.id);
    list = orders(a.job.id); expect(list.map((o) => [o.version, o.status])).toEqual([[3, 'Revised'], [2, 'Superseded'], [1, 'Superseded']]); expect(list[0].revision_reason).toMatch(/team/);
    expect(v2.id).toBe(list[1].id);
    // price (an approved discount) and only the latest version can be sent
    expect(() => JO.markJobOrderSent(list[2].id, 'Email')).toThrow(/latest version|already been sent|Only/);
    const v3 = JO.markJobOrderSent(list[0].id, 'Email');
    store.insert('variations', { job_id: a.job.id, number: `${db().jobs.find((j) => j.id === a.job.id)!.number}-V9`, reason: 'extra', items: [{ service_code: 'WALL', description: 'Extra', qty: 5, unit: 'sqm', rate: 100, discount: 0 }], discount: 0, vat_mode: 'exclusive', vat_rate: 12, panel_row_ids: [], status: 'Approved' } as never);
    JO.syncJobOrders(a.job.id);
    list = orders(a.job.id); expect(list[0]).toMatchObject({ version: 4, status: 'Revised', supersedes_id: v3.id }); expect(list[0].revision_reason).toMatch(/approved scope|final price/);
  });

  it('a sent version cannot be edited or deleted; resending keeps the date and time of every send', async () => {
    await as('ops@topmop.ph');
    const a = booked('JO-H');
    const o = JO.markJobOrderSent(orders(a.job.id)[0].id, 'Email');
    expect(() => store.update('job_orders', o.id, { content: { ...o.content, total: 1 } } as never)).toThrow(/cannot be edited/);
    expect(() => store.update('job_orders', o.id, { number: 'JO-HACK' } as never)).toThrow(/cannot be edited/);
    expect(() => store.remove('job_orders', o.id)).toThrow(/cannot be deleted/);
    const r = JO.resendJobOrder(o.id, 'WhatsApp / Viber', 'client asked again');
    expect(r.sent_count).toBe(2); expect(r.sent_at).toBe(o.sent_at);
    expect(r.history.map((h) => h.action)).toEqual(expect.arrayContaining([expect.stringMatching(/Marked as sent/), expect.stringMatching(/Resent .* WhatsApp/)]));
    JO.logJobOrderEvent(o.id, 'PDF downloaded');
    expect(db().job_orders.find((x) => x.id === o.id)!.history.at(-1)!.action).toBe('PDF downloaded');
  });
});
