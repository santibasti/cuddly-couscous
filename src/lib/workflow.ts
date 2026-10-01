// The 11-step job workflow that lives inside every Job Card:
//  1 Equipment Checklist (HQ) → 2 Dispatch → 3 Site Arrival + Attendance → 4 Quotation / Conforme → 5 Start Work →
//  6 Final Quotation / Variation → 7 Service Report + Client Signature → 8 Equipment Checklist (Return) → 9 Leave Site →
//  10 Arrived at HQ → 11 Job Closed.
// One JobWorkflow record per job; every step stamps date/time + user and is written through the audited store.
import { store, RuleError } from './store';
import type {
  ContainerCondition, DB, FuelLevel, IncidentReport, IncidentType, ItemCondition, Job, JobPhoto, JobStatus, JobWorkflow, PanelRow, QuoteItem, Variation, VehicleCondition, CheckItem,
} from './types';
import { buildChecklistItems, docTotals, finalContract, hqGaps, kindOfAsset, onHand, round2Safe, variationTotals } from './business';
import { performRelease, performReturn, requestCheckout, requestMaterials, runAutomations } from './actions';
import { nowLocal, today } from './util';

const db = (): DB => store.getDB();
const fail = (m: string): never => { throw new RuleError(m); };
const sumBy = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);

export { buildChecklistItems, hqGaps, kindOfAsset };
export const FUEL_LEVELS: FuelLevel[] = ['Empty', '1/4', '1/2', '3/4', 'Full'];
export const ITEM_CONDITIONS: ItemCondition[] = ['Good', 'Damaged', 'Missing'];
export const VEHICLE_CONDITIONS: VehicleCondition[] = ['Good', 'With Issue'];
export const CONTAINER_CONDITIONS: ContainerCondition[] = ['Good', 'Damaged', 'Leaking'];
export const PANEL_AREAS = ['1st Floor', '2nd Floor', '3rd Floor', '4th Floor', 'Roof Deck', 'Other'];
export const PANEL_SIDES = ['Front', 'Rear', 'Left Side', 'Right Side', 'Interior', 'Other'];

/** Match a scanned / typed code to an item on the checklist. */
export function matchScan(items: CheckItem[], code: string): CheckItem | undefined {
  const c = code.trim().toUpperCase();
  return items.find((i) => i.code?.toUpperCase() === c);
}

export const workflowFor = (jobId: string) => db().workflows.find((w) => w.job_id === jobId && !w.deleted_at);
export function canRunWorkflow(job: Job): boolean {
  if (!store.can('dispatch.run')) return false;
  const emp = store.user?.employee_id;
  return store.can('jobs.all') || (!!emp && (job.leader_id === emp || job.crew_ids.includes(emp)));
}
const needRun = (job: Job) => { store.require('dispatch.run'); if (!canRunWorkflow(job)) fail('Only the assigned Team Leader or a manager can complete this step.'); };
const jobOf = (w: JobWorkflow) => db().jobs.find((j) => j.id === w.job_id)!;
const getWf = (id: string) => db().workflows.find((x) => x.id === id) ?? fail('Workflow not found.');
const setStatus = (job: Job, status: JobStatus, summary?: string) => store.update('jobs', job.id, { status }, 'update', summary ?? `${job.number}: ${job.status} → ${status}`);
const gpsOk = (lat?: number, lng?: number, note?: string) => (lat !== undefined && lng !== undefined) || !!note?.trim();
const uidNow = () => store.user?.id;
const issuedNet = (jobId: string, itemId: string) => -sumBy(db().stock.filter((t) => t.approval === 'Approved' && t.job_id === jobId && t.item_id === itemId && ['Issue to Job', 'Return from Job'].includes(t.type)), (t) => t.qty);
const addPhotos = (job: Job, kind: JobPhoto['kind'], caption: string, photos: (string | undefined)[]) => {
  const list = photos.filter(Boolean) as string[]; if (!list.length) return;
  const cur = db().jobs.find((j) => j.id === job.id)!;
  store.update('jobs', job.id, { photos: [...cur.photos, ...list.map((data, i): JobPhoto => ({ kind, caption: list.length > 1 ? `${caption} ${i + 1}` : caption, data, taken_at: nowLocal() }))] }, 'update', `${caption} photo added to ${job.number}`);
};

function raise(job: Job, wf: JobWorkflow, type: IncidentType, severity: IncidentReport['severity'], description: string, extra: Partial<IncidentReport> = {}) {
  return store.insert('incidents', { number: store.nextNumber('INC'), job_id: job.id, workflow_id: wf.id, type, severity, description, status: 'Open', auto: true, ...extra } as never, `Incident raised for ${job.number}: ${type}`) as IncidentReport;
}
function ticketFor(assetId: string, text: string) {
  return store.insert('tickets', { asset_id: assetId, source: 'Damage report', description: text, status: 'Open', opened_on: today(), cost: 0 } as never, 'Maintenance ticket auto-created') as { id: string };
}

/* ================= Step 1: Equipment Checklist (HQ) ================= */
/** Open (or resume) the workflow. A Confirmed job moves to "Dispatch Checklist Pending". */
export function openWorkflow(jobId: string): JobWorkflow {
  const job = db().jobs.find((j) => j.id === jobId) ?? fail('Job not found.');
  const cur = workflowFor(jobId);
  if (cur) return cur;
  needRun(job);
  if (!['Confirmed', 'Dispatch Checklist Pending'].includes(job.status)) fail(job.status === 'Pending' ? 'Confirm the booking first — only confirmed jobs can start the workflow.' : `A job that is ${job.status.toLowerCase()} cannot start the workflow.`);
  const wf = store.insert('workflows', { job_id: jobId, items: buildChecklistItems(db(), job), panels: [], arr_photos: [], start_photos: [], rc_photos: [], hq_veh_condition: 'Good' } as never, `Job workflow opened for ${job.number}`) as JobWorkflow;
  if (job.status === 'Confirmed') setStatus(job, 'Dispatch Checklist Pending');
  return wf;
}

export type HqDraft = Partial<Pick<JobWorkflow, 'items' | 'hq_odo' | 'hq_fuel' | 'hq_veh_condition' | 'hq_veh_photo' | 'hq_veh_notes' | 'hq_notes' | 'hq_shortage_reason'>>;
export function saveHqDraft(id: string, patch: HqDraft) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (wf.hq_at) fail('The HQ checklist has already been completed.');
  return store.update('workflows', id, patch as never, 'update', `HQ checklist draft saved for ${job.number}`);
}

export function completeHqChecklist(id: string, f: HqDraft & { items: CheckItem[]; confirmed: boolean }) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (wf.hq_at) fail('The HQ checklist has already been completed.');
  const merged = { ...wf, ...f };
  const gaps = hqGaps(merged);
  if (gaps.incomplete.length) fail(`Complete the checklist first. Still needed: ${gaps.incomplete.join(', ')}.`);
  if (gaps.shortages.length && !merged.hq_shortage_reason?.trim()) fail(`Some items are short, damaged or missing (${gaps.shortages.join('; ')}). Enter a reason to continue.`);
  if (!f.confirmed) fail('Tick the Team Leader confirmation.');
  if (!['Confirmed', 'Dispatch Checklist Pending'].includes(job.status)) fail(`The job is ${job.status.toLowerCase()}.`);
  // stock check
  for (const it of f.items.filter((i) => i.kind === 'material' && i.item_id && (i.loaded_qty ?? 0) > 0)) {
    const inv = db().items.find((x) => x.id === it.item_id)!;
    const need = round2Safe(it.loaded_qty! - issuedNet(job.id, inv.id));
    if (need > 0 && onHand(db(), inv.id, inv.location_id) < need) fail(`Insufficient stock of ${inv.name}: ${onHand(db(), inv.id, inv.location_id)} ${inv.uom} on hand, ${need} needed. Ask Operations to receive stock.`);
  }
  // check out assets through the existing Equipment module (status → In Use). The leader's confirmation is the release.
  const addedAssets: string[] = [];
  for (const it of f.items.filter((i) => i.asset_id && (i.loaded_qty ?? 0) > 0 && (i.out_condition ?? 'Good') === 'Good')) {
    let co = db().checkouts.find((c) => c.asset_id === it.asset_id && c.job_id === job.id && ['Requested', 'Released'].includes(c.status) && !c.deleted_at);
    if (!co) co = requestCheckout({ asset_id: it.asset_id!, job_id: job.id, responsible_id: it.responsible_id ?? job.leader_id ?? store.user?.employee_id ?? '', expected_return: job.end_at, note: 'Raised from job workflow' }) as never;
    if (co!.status === 'Requested') performRelease(co!.id, { condition: 'Good', meter: it.kind === 'vehicle' ? f.hq_odo : undefined, photos: it.out_photo ? [it.out_photo] : [] });
    if (it.extra && it.kind !== 'vehicle') addedAssets.push(it.asset_id!);
  }
  // issue chemicals / materials from inventory
  const jobMaterials = [...job.materials];
  for (const it of f.items.filter((i) => i.kind === 'material' && i.item_id && (i.loaded_qty ?? 0) > 0)) {
    const inv = db().items.find((x) => x.id === it.item_id)!;
    const need = round2Safe(it.loaded_qty! - issuedNet(job.id, inv.id));
    if (need > 0) store.insert('stock', { item_id: inv.id, type: 'Issue to Job', qty: -need, unit_cost: inv.cost, location_id: inv.location_id, job_id: job.id, date: today(), approval: 'Approved', reason: 'Issued at HQ checklist' } as never, `Issued ${need} ${inv.uom} ${inv.name} to ${job.number} at HQ`);
    const k = jobMaterials.findIndex((m) => m.item_id === inv.id);
    if (k >= 0) jobMaterials[k] = { ...jobMaterials[k], planned_qty: it.loaded_qty! }; else jobMaterials.push({ item_id: inv.id, planned_qty: it.loaded_qty! });
  }
  // discrepancies → incidents / maintenance tickets
  for (const it of f.items) {
    const damaged = (it.kind === 'material' ? it.out_container : it.out_condition) === 'Damaged' || it.out_container === 'Leaking';
    const missing = it.kind !== 'material' && it.out_condition === 'Missing';
    if (it.asset_id && damaged) {
      store.update('assets', it.asset_id, { status: 'Damaged', condition: 'Damaged', location: 'Workshop' }, 'update', `${it.label} found damaged at HQ checklist`);
      const t = ticketFor(it.asset_id, `Found damaged at HQ checklist for ${job.number}. ${it.out_note ?? ''}`.trim());
      raise(job, wf, 'Damaged asset', 'Medium', `${it.code} ${it.label} damaged before departure for ${job.number}. ${it.out_note ?? ''}`.trim(), { asset_id: it.asset_id, ticket_id: t.id });
    } else if (damaged) raise(job, wf, 'Other', 'Low', `${it.label} ${it.out_container === 'Leaking' ? 'container leaking' : 'damaged'} at HQ checklist for ${job.number}. ${it.out_note ?? ''}`.trim(), { item_id: it.item_id });
    if (missing || (it.kind !== 'material' && (it.loaded_qty ?? 0) < it.qty && !damaged)) raise(job, wf, it.kind === 'ppe' ? 'Missing PPE' : 'Other', 'Medium', `${it.label} ${missing ? 'not available' : `short: loaded ${it.loaded_qty ?? 0} of ${it.qty}`} at HQ checklist for ${job.number}. ${merged.hq_shortage_reason ?? ''}`.trim(), { asset_id: it.asset_id });
  }
  if (merged.hq_veh_condition === 'With Issue') raise(job, wf, 'Vehicle damage', 'Low', `Vehicle left HQ with a reported issue: ${merged.hq_veh_notes}`, { asset_id: job.vehicle_id });
  store.update('jobs', job.id, { materials: jobMaterials, equipment_ids: [...new Set([...job.equipment_ids, ...addedAssets])] }, 'update', `Equipment & materials issued for ${job.number}`);
  const { confirmed: _c, ...rest } = f; void _c;
  store.update('workflows', id, { ...rest, hq_at: nowLocal(), hq_by: uidNow() } as never, 'approve', `${job.number}: HQ equipment checklist confirmed`);
  if (job.status === 'Confirmed') setStatus(db().jobs.find((j) => j.id === job.id)!, 'Dispatch Checklist Pending');
  runAutomations();
}

/* ================= Step 2: Dispatch ================= */
export function dispatchJob(id: string, f: { lat?: number; lng?: number; gps_note?: string; photo?: string; notes?: string; confirmed: boolean }) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.hq_at) fail('Complete the HQ equipment checklist first.');
  if (wf.disp_at) fail('The crew has already been dispatched.');
  if (!gpsOk(f.lat, f.lng, f.gps_note)) fail('Capture the departure GPS location, or explain why it is unavailable.');
  if (!f.confirmed) fail('Tick the Team Leader confirmation.');
  addPhotos(job, 'before', 'Loading / departure', [f.photo]);
  store.update('workflows', id, { disp_at: nowLocal(), disp_by: uidNow(), disp_lat: f.lat, disp_lng: f.lng, disp_gps_note: f.gps_note, disp_photo: f.photo, disp_notes: f.notes } as never, 'approve', `${job.number} dispatched from HQ`);
  setStatus(job, 'Dispatched');
  runAutomations();
}

/* ================= Step 3: Site Arrival + Attendance ================= */
export interface ArrivalForm {
  lat?: number; lng?: number; gps_note?: string; photos: string[]; contact_name: string; contact_mobile?: string; notes?: string;
  present: string[]; absent: { id: string; reason: string }[];
  extra_materials?: { item_id: string; qty: number }[]; extra_equipment?: string[]; requests?: string;
}
export function arriveAtSite(id: string, f: ArrivalForm) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.disp_at) fail('Dispatch the crew first.');
  if (wf.arr_at) fail('Arrival has already been recorded.');
  if (!gpsOk(f.lat, f.lng, f.gps_note)) fail('Capture GPS location on arrival, or explain why it is unavailable.');
  if (!f.contact_name.trim()) fail('Enter the site contact person.');
  if (!f.photos.length) fail('Take at least one before-work photo.');
  const crew = [...new Set([...(job.leader_id ? [job.leader_id] : []), ...job.crew_ids])];
  const unaccounted = crew.filter((e) => !f.present.includes(e) && !f.absent.some((a) => a.id === e && a.reason.trim()));
  if (unaccounted.length) fail(`Confirm attendance for every assigned crew member. Missing: ${unaccounted.map((e) => db().employees.find((x) => x.id === e)?.full_name ?? e).join(', ')}.`);
  if (!f.present.length) fail('At least one crew member must be present on site.');
  const at = nowLocal();
  // sync to the existing Attendance module — link / create a single record per person per day, never a duplicate
  for (const e of f.present) {
    const att = db().attendance.find((a) => a.employee_id === e && a.date === today() && !a.deleted_at);
    if (!att) {
      const emp = db().employees.find((x) => x.id === e);
      store.insert('attendance', { employee_id: e, date: today(), kind: 'Present', clock_in: at, job_id: job.id, field_work: true, in_lat: f.lat, in_lng: f.lng, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0, approval: 'Pending', notes: 'Presence confirmed by Team Leader on arrival at site' } as never, `Attendance synced from job workflow: ${emp?.full_name}`);
    } else if (!att.job_id || !att.field_work) store.update('attendance', att.id, { job_id: job.id, field_work: true }, 'update', `Attendance linked to ${job.number} on arrival`);
  }
  addPhotos(job, 'before', 'Arrival – before work', f.photos);
  store.update('workflows', id, { arr_at: at, arr_by: uidNow(), arr_lat: f.lat, arr_lng: f.lng, arr_gps_note: f.gps_note, arr_photos: f.photos, arr_contact_name: f.contact_name, arr_contact_mobile: f.contact_mobile, arr_notes: f.notes, arr_crew_present: f.present, arr_crew_absent: f.absent } as never, 'update', `${job.number}: arrived at site, attendance confirmed`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'On Site');
  if (f.extra_materials?.some((m) => m.qty > 0)) { try { requestMaterials(job.id, f.extra_materials.filter((m) => m.qty > 0), `Requested from site: ${f.requests ?? ''}`); } catch (e) { if (!(e instanceof RuleError)) throw e; } }
  for (const a of f.extra_equipment ?? []) { try { requestCheckout({ asset_id: a, job_id: job.id, responsible_id: job.leader_id ?? '', expected_return: job.end_at, note: `Requested from site: ${f.requests ?? ''}` }); } catch (e) { if (!(e instanceof RuleError)) throw e; } }
  runAutomations();
}

/* ================= Step 4: Quotation / Conforme (+ glass panel counting) ================= */
export function savePanels(id: string, panels: PanelRow[]) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (wf.closed_at) fail('The job is closed.');
  if (!wf.arr_at) fail('Record the site arrival first.');
  if (panels.some((p) => p.external < 0 || p.internal < 0 || !Number.isFinite(p.external + p.internal))) fail('Panel counts cannot be negative.');
  return store.update('workflows', id, { panels } as never, 'update', `${job.number}: panel count updated (${sumBy(panels, (p) => p.external + p.internal)} panels)`);
}
export function signConforme(id: string, f: { name: string; signature?: string; file?: string; file_name?: string; notes?: string; confirmed: boolean }) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.arr_at) fail('Record the site arrival first.');
  if (wf.conf_at) fail('The quotation / conforme is already signed.');
  if (!f.confirmed) fail('Confirm that the quotation was reviewed with the client on site.');
  if (!f.name.trim()) fail('Enter the client name on the conforme.');
  if (!f.signature && !f.file) fail('Capture the client signature or attach a photo / PDF of the signed conforme.');
  const q = db().quotations.find((x) => x.id === job.quotation_id);
  const original = q ? docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total : finalContract(db(), job).originalTotal;
  store.update('workflows', id, { conf_at: nowLocal(), conf_by: uidNow(), conf_quotation_id: q?.id, conf_original_total: original, conf_name: f.name.trim(), conf_signature: f.signature, conf_file: f.file, conf_file_name: f.file_name, conf_notes: f.notes } as never, 'approve', `${job.number}: client conforme signed by ${f.name.trim()}`);
}

/* ================= Step 5: Start Work ================= */
export function startWork(id: string, f: { present: string[]; safety: boolean; ppe: boolean; photos: string[]; notes?: string; confirmed: boolean }) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.conf_at) fail('Work cannot start until the client conforme is signed.');
  if (wf.start_at) fail('Work has already started.');
  if (!f.present.length) fail('Select the crew present at the start of work.');
  if (!f.safety) fail('Confirm the safety briefing.');
  if (!f.ppe) fail('Confirm that PPE is worn.');
  if (!f.photos.length) fail('Take at least one work-start photo.');
  if (!f.confirmed) fail('Tick the Team Leader confirmation.');
  addPhotos(job, 'before', 'Work start', f.photos);
  store.update('workflows', id, { start_at: nowLocal(), start_by: uidNow(), start_crew_present: f.present, start_safety: true, start_ppe: true, start_photos: f.photos, start_notes: f.notes } as never, 'update', `${job.number}: work started`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'In Progress', `${job.number}: work started on site`);
}

/* ================= Step 6: Final Quotation / Variation ================= */
const varNumber = (job: Job) => `${job.number}-V${db().variations.filter((v) => v.job_id === job.id).length + 1}`;
export interface VariationInput { reason: string; items: QuoteItem[]; discount: number; vat_mode: Variation['vat_mode']; vat_rate: number; panel_row_ids: string[]; notes?: string }
export function createVariation(jobId: string, f: VariationInput): Variation {
  const job = db().jobs.find((j) => j.id === jobId) ?? fail('Job not found.');
  const wf = workflowFor(jobId) ?? fail('Open the job workflow first.');
  needRun(job);
  if (!wf.start_at) fail('Variations can be raised once work has started.');
  if (wf.rep_at) fail('The service report is signed — no more variations can be added to this job.');
  validateVariation(f);
  return store.insert('variations', { job_id: jobId, number: varNumber(job), ...f, status: 'Draft' } as never, `Variation ${varNumber(job)} drafted for ${job.number}`) as Variation;
}
function validateVariation(f: VariationInput) {
  if (!f.reason.trim()) fail('Enter the reason for the variation.');
  if (!f.items.length) fail('Add at least one line item.');
  if (f.items.some((i) => !(i.qty > 0) || i.rate < 0 || !i.description.trim())) fail('Every line needs a description, a quantity above zero and a rate.');
  if (f.discount < 0) fail('Discount cannot be negative.');
}
export function updateVariation(id: string, f: VariationInput) {
  const v = db().variations.find((x) => x.id === id) ?? fail('Variation not found.');
  needRun(db().jobs.find((j) => j.id === v.job_id)!);
  if (v.status !== 'Draft') fail('Only draft variations can be edited. Create a new variation instead.');
  validateVariation(f);
  return store.update('variations', id, f as never, 'update', `Variation ${v.number} updated`);
}
/** Client approval + signature. Additional work may only begin after this. */
export function approveVariation(id: string, f: { client_name: string; signature?: string; file?: string; file_name?: string }) {
  const v = db().variations.find((x) => x.id === id) ?? fail('Variation not found.');
  const job = db().jobs.find((j) => j.id === v.job_id)!;
  needRun(job);
  if (v.status !== 'Draft') fail(`This variation is already ${v.status.toLowerCase()}.`);
  if (!f.client_name.trim()) fail('Enter the client name.');
  if (!f.signature && !f.file) fail('Client approval needs a signature or an attached signed copy.');
  store.update('variations', id, { status: 'Approved', client_name: f.client_name.trim(), client_signature: f.signature, signed_file: f.file, signed_file_name: f.file_name, signed_at: new Date().toISOString(), decided_by: uidNow() } as never, 'approve', `Variation ${v.number} approved by ${f.client_name.trim()}`);
  const fc = finalContract(db(), db().jobs.find((j) => j.id === job.id)!);
  store.update('jobs', job.id, { contract_amount: fc.finalNet }, 'update', `${job.number}: contract value ${fc.originalNet} + variations ${fc.variationsNet} = ${fc.finalNet}`);
  runAutomations();
}
export function rejectVariation(id: string, note: string) {
  const v = db().variations.find((x) => x.id === id) ?? fail('Variation not found.');
  needRun(db().jobs.find((j) => j.id === v.job_id)!);
  if (v.status !== 'Draft') fail(`This variation is already ${v.status.toLowerCase()}.`);
  if (!note.trim()) fail('Enter the reason the client declined.');
  store.update('variations', id, { status: 'Rejected', notes: note.trim(), decided_by: uidNow() } as never, 'update', `Variation ${v.number} declined by client`);
  runAutomations();
}

/* ================= Step 7: Service Accomplishment Report + Client Signature ================= */
export interface ReportForm {
  scope: string; method: string; findings: string; limits?: string; recs?: string; complimentary?: string; damage_report?: string;
  client_name: string; client_sig?: string; tm_name: string; tm_sig?: string; rating?: number; notes?: string;
  used?: Record<string, number>;
}
export function signServiceReport(id: string, f: ReportForm) {
  store.require('jobs.complete');
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.start_at) fail('Start the work before submitting the service report.');
  if (wf.rep_at) fail('The service report is already signed.');
  const open = db().variations.filter((v) => v.job_id === job.id && v.status === 'Draft' && !v.deleted_at);
  if (open.length) fail(`${open.length} variation(s) are waiting for client approval (${open.map((v) => v.number).join(', ')}). Approve or decline them before the report is signed.`);
  if (!f.scope.trim()) fail('Describe the scope completed.');
  if (!f.method.trim()) fail('Describe the methodology and equipment used.');
  if (!f.client_name.trim()) fail('Enter the client name.');
  if (!f.client_sig) fail('The client signature is required.');
  if (!f.tm_name.trim() || !f.tm_sig) fail('The TopMop representative name and signature are required.');
  if (job.checklist.some((c) => !c.done)) fail('Complete every job checklist item first.');
  const cur = db().jobs.find((j) => j.id === job.id)!;
  if (!cur.photos.some((x) => x.kind === 'before') || !cur.photos.some((x) => x.kind === 'after')) fail('Attach at least one before and one after photo.');
  const at = nowLocal();
  store.update('jobs', job.id, { findings: f.findings, damage_report: f.damage_report ?? cur.damage_report, signoff_name: f.client_name.trim(), signoff_data: f.client_sig, signoff_at: at, client_rating: f.rating, completed_at: at }, 'approve', `Service report signed for ${job.number}`);
  store.update('workflows', id, { rep_at: at, rep_by: uidNow(), rep_scope: f.scope, rep_method: f.method, rep_findings: f.findings, rep_limits: f.limits, rep_recs: f.recs, rep_complimentary: f.complimentary, rep_client_name: f.client_name.trim(), rep_client_sig: f.client_sig, rep_client_at: at, rep_tm_name: f.tm_name.trim(), rep_tm_sig: f.tm_sig, rep_rating: f.rating, rep_notes: f.notes } as never, 'approve', `${job.number}: service accomplishment report signed`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'Work Completed');
  runAutomations();
}

/* ================= Step 8: Equipment Checklist (Return, at the client site) ================= */
export interface ReturnSummary { missing: number; damaged: number; incidents: number; tickets: number; used: { label: string; qty: number; unit?: string }[] }
export function completeReturnCheck(id: string, f: { items: CheckItem[]; photos: string[]; notes?: string; confirmed: boolean }): ReturnSummary {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.rep_at) fail('Sign the service report before the return equipment check.');
  if (wf.rc_at) fail('The return check is already recorded.');
  const issued = (i: CheckItem) => i.loaded_qty ?? 0;
  const items = f.items.map((i) => ({ ...i }));
  for (const it of items) {
    if (it.kind === 'vehicle' || issued(it) <= 0) continue;
    if (it.returned_qty === undefined || Number.isNaN(it.returned_qty)) fail(`Enter the returned quantity for ${it.label}.`);
    if (it.returned_qty! < 0 || it.returned_qty! > issued(it) + 1e-9) fail(`${it.label}: returned quantity must be between 0 and ${issued(it)}.`);
    if (it.kind === 'material') it.used_qty = round2Safe(issued(it) - it.returned_qty!);
    if (it.returned_qty! < issued(it) && it.kind !== 'material') it.ret_condition = it.returned_qty === 0 ? 'Missing' : it.ret_condition ?? 'Good';
    if (!it.ret_condition) fail(`Record the condition of ${it.label} on return.`);
    if ((it.ret_condition === 'Damaged' || it.ret_condition === 'Missing') && !it.ret_note?.trim()) fail(`Add a note for ${it.label} (${it.ret_condition.toLowerCase()}).`);
    if (it.ret_condition === 'Damaged' && it.kind !== 'material' && !it.ret_photo) fail(`Take a photo of the damage on ${it.label}.`);
  }
  if (!f.photos.length) fail('Take at least one return-check photo.');
  if (!f.confirmed) fail('Tick the Team Leader confirmation.');

  let tickets = 0, missing = 0, damaged = 0;
  const before = db().incidents.filter((x) => x.workflow_id === id).length;
  const used: ReturnSummary['used'] = [];
  const inc = (type: IncidentType, sev: IncidentReport['severity'], text: string, extra: Partial<IncidentReport> = {}) => raise(job, wf, type, sev, text, extra);
  for (const it of items) {
    if (it.kind === 'vehicle' || issued(it) <= 0) continue;
    const lostQty = it.kind === 'material' ? 0 : round2Safe(issued(it) - it.returned_qty!);
    const dmg = it.ret_condition === 'Damaged' && it.returned_qty! > 0;
    if (it.kind === 'material') {
      const inv = db().items.find((x) => x.id === it.item_id)!;
      if (it.returned_qty! > 0) store.insert('stock', { item_id: inv.id, type: 'Return from Job', qty: it.returned_qty!, unit_cost: inv.cost, location_id: inv.location_id, job_id: job.id, date: today(), approval: 'Approved', reason: 'Unused returned at site return check' } as never, `Returned ${it.returned_qty} ${inv.uom} ${inv.name} from ${job.number}`);
      used.push({ label: it.label, qty: it.used_qty!, unit: it.unit });
      if (it.ret_condition === 'Missing') { missing++; inc('Material shortage', 'Medium', `${it.label}: container reported missing on return check at ${job.number}. ${it.ret_note ?? ''}`.trim(), { item_id: inv.id }); }
      else if (it.ret_condition === 'Damaged') { damaged++; inc('Other', 'Low', `${it.label}: container damaged at ${job.number}. ${it.ret_note ?? ''}`.trim(), { item_id: inv.id }); }
      continue;
    }
    if (it.asset_id) {
      const a = db().assets.find((x) => x.id === it.asset_id)!;
      const co = db().checkouts.find((c) => c.asset_id === a.id && c.job_id === job.id && c.status === 'Released' && !c.deleted_at);
      if (it.returned_qty === 0 || it.ret_condition === 'Missing') {
        missing++;
        store.update('assets', a.id, { status: 'Missing', location: 'Unknown – last seen on ' + job.number }, 'update', `${a.name} reported missing at ${job.number}`);
        inc('Missing asset', 'High', `${a.code} ${a.name} was issued for ${job.number} but not accounted for at the return check. ${it.ret_note ?? ''}`.trim(), { asset_id: a.id });
      } else if (dmg && co) {
        const r = performReturn(co.id, { condition: 'Damaged', damage_notes: it.ret_note ?? 'Damaged', missing: '', photos: it.ret_photo ? [it.ret_photo] : [], repair: it.repair_required !== false });
        damaged++; if (r.ticketId) tickets++;
        inc('Damaged asset', 'Medium', `${a.code} ${a.name} damaged at ${job.number}. ${it.ret_note ?? ''}`.trim(), { asset_id: a.id, ticket_id: r.ticketId });
      } // good items stay "In Use" until they are confirmed back at HQ (step 10)
    } else {
      if (lostQty > 0) { missing++; inc(it.kind === 'ppe' ? 'Missing PPE' : 'Other', 'Medium', `${it.label}: ${lostQty} of ${issued(it)} not accounted for at ${job.number}. ${it.ret_note ?? ''}`.trim()); }
      if (dmg) { damaged++; inc('Damaged asset', 'Low', `${it.label} damaged at ${job.number}. ${it.ret_note ?? ''}`.trim()); }
    }
  }
  const usedMap = new Map(items.filter((i) => i.kind === 'material').map((i) => [i.item_id!, i.used_qty!]));
  const cur = db().jobs.find((j) => j.id === job.id)!;
  store.update('jobs', job.id, { materials: cur.materials.map((m) => (usedMap.has(m.item_id) ? { ...m, used_qty: usedMap.get(m.item_id) } : m)) }, 'update', `Material usage recorded for ${job.number}`);
  addPhotos(job, 'after', 'Return check', f.photos);
  const incidents = db().incidents.filter((x) => x.workflow_id === id).length - before;
  store.update('workflows', id, { items, rc_at: nowLocal(), rc_by: uidNow(), rc_photos: f.photos, rc_notes: f.notes } as never, 'approve', `${job.number}: return equipment check completed${incidents ? ` — ${incidents} incident(s) raised` : ''}`);
  runAutomations();
  return { missing, damaged, incidents, tickets, used };
}

/* ================= Step 9: Leave Site ================= */
export function leaveSite(id: string, f: { lat?: number; lng?: number; gps_note?: string; photo?: string; notes?: string; confirmed: boolean }) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.rc_at) fail('Complete the return equipment check before leaving the site.');
  if (wf.leave_at) fail('Departure from site is already recorded.');
  if (!gpsOk(f.lat, f.lng, f.gps_note)) fail('Capture GPS location, or explain why it is unavailable.');
  if (!f.confirmed) fail('Tick the Team Leader confirmation.');
  addPhotos(job, 'after', 'Leaving site', [f.photo]);
  store.update('workflows', id, { leave_at: nowLocal(), leave_by: uidNow(), leave_lat: f.lat, leave_lng: f.lng, leave_gps_note: f.gps_note, leave_photo: f.photo, leave_notes: f.notes } as never, 'update', `${job.number}: left client site`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'Leaving Site');
  runAutomations();
}

/* ================= Step 10: Arrived at HQ ================= */
export function arriveAtHq(id: string, f: { lat?: number; lng?: number; gps_note?: string; odo?: number; fuel?: FuelLevel; veh_condition?: VehicleCondition; veh_notes?: string; equipment_ok: boolean; notes?: string; confirmed: boolean }) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.leave_at) fail('Record leaving the site first.');
  if (wf.hqa_at) fail('Arrival at HQ is already recorded.');
  if (!gpsOk(f.lat, f.lng, f.gps_note)) fail('Capture GPS location at headquarters, or explain why it is unavailable.');
  const hasVeh = wf.items.some((i) => i.kind === 'vehicle');
  if (hasVeh) {
    if (!(f.odo && f.odo > 0)) fail('Enter the ending odometer reading.');
    if (wf.hq_odo !== undefined && f.odo! < wf.hq_odo) fail(`Ending odometer (${f.odo}) cannot be lower than the starting reading (${wf.hq_odo}).`);
    if (!f.fuel) fail('Record the ending fuel level.');
    if (!f.veh_condition) fail('Record the vehicle condition.');
    if (f.veh_condition === 'With Issue' && !f.veh_notes?.trim()) fail('Describe the vehicle issue.');
  }
  if (!f.equipment_ok) fail('Confirm the final equipment check at headquarters.');
  if (!f.confirmed) fail('Tick the Team Leader confirmation.');
  // return serviceable equipment to Available (damaged / missing items were already handled at the return check)
  for (const it of wf.items.filter((i) => i.asset_id && i.kind !== 'material')) {
    const co = db().checkouts.find((c) => c.asset_id === it.asset_id && c.job_id === job.id && c.status === 'Released' && !c.deleted_at);
    // items reported missing stay as they are until the incident is resolved
    if (!co || db().assets.find((a) => a.id === it.asset_id)?.status !== 'In Use') continue;
    const isVeh = it.kind === 'vehicle';
    const vehIssue = isVeh && f.veh_condition === 'With Issue';
    performReturn(co.id, { condition: vehIssue ? 'Fair' : 'Good', meter: isVeh ? f.odo : undefined, damage_notes: '', missing: '', photos: [], repair: false });
    if (vehIssue) {
      const t = ticketFor(it.asset_id!, `Vehicle issue reported on arrival at HQ from ${job.number}: ${f.veh_notes}`);
      store.update('assets', it.asset_id!, { status: 'Under Maintenance', location: 'Workshop' }, 'update', `${it.label} → Under Maintenance (vehicle issue)`);
      raise(job, wf, 'Vehicle damage', 'Medium', `${it.code} ${it.label}: ${f.veh_notes}`, { asset_id: it.asset_id, ticket_id: t.id });
    }
  }
  const distance = hasVeh && wf.hq_odo !== undefined ? round2Safe(f.odo! - wf.hq_odo) : undefined;
  store.update('workflows', id, { hqa_at: nowLocal(), hqa_by: uidNow(), hqa_lat: f.lat, hqa_lng: f.lng, hqa_gps_note: f.gps_note, hqa_odo: f.odo, hqa_fuel: f.fuel, hqa_veh_condition: f.veh_condition, hqa_veh_notes: f.veh_notes, hqa_equipment_ok: true, hqa_notes: f.notes, distance_km: distance } as never, 'approve', `${job.number}: arrived at HQ`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'Arrived at HQ');
  runAutomations();
}

/* ================= Step 11: Job Closed ================= */
export interface ClosureGate { key: string; label: string; ok: boolean; hint?: string }
export function closureGates(d: DB, job: Job, wf?: JobWorkflow): ClosureGate[] {
  const open = d.incidents.filter((i) => i.job_id === job.id && !i.deleted_at && ['Open', 'Investigating'].includes(i.status));
  const pendingVar = d.variations.filter((v) => v.job_id === job.id && v.status === 'Draft' && !v.deleted_at);
  return [
    { key: 'conf', label: 'Client conforme / approved quotation', ok: !!wf?.conf_at },
    { key: 'att', label: 'Site attendance confirmed', ok: !!wf?.arr_at && !!wf.arr_crew_present?.length },
    { key: 'rep', label: 'Service report signed', ok: !!wf?.rep_at },
    { key: 'var', label: 'No variation waiting for client approval', ok: pendingVar.length === 0 },
    { key: 'ret', label: 'Equipment return completed', ok: !!wf?.rc_at },
    { key: 'mat', label: 'Job material usage recorded', ok: !!wf?.rc_at && job.materials.every((m) => m.used_qty !== undefined) },
    { key: 'hq', label: 'Vehicle arrival at HQ recorded', ok: !!wf?.hqa_at },
    { key: 'inc', label: 'Missing / damaged equipment incidents acknowledged', ok: open.length === 0, hint: open.length ? `${open.length} open: ${open.map((i) => i.number).join(', ')}` : undefined },
  ];
}
export function closeJob(jobId: string, notes?: string) {
  const job = db().jobs.find((j) => j.id === jobId) ?? fail('Job not found.');
  const wf = workflowFor(jobId) ?? fail('This job has no workflow.');
  if (!(canRunWorkflow(job) || store.can('incidents.manage'))) fail('Only the Team Leader, an Operations Manager or Admin can close the job.');
  if (wf.closed_at) fail('The job is already closed.');
  const bad = closureGates(db(), job, wf).filter((g) => !g.ok);
  if (bad.length) fail(`The job cannot be closed yet: ${bad.map((g) => g.label + (g.hint ? ` (${g.hint})` : '')).join('; ')}.`);
  store.update('workflows', wf.id, { closed_at: nowLocal(), closed_by: uidNow(), closed_notes: notes } as never, 'approve', `${job.number} closed`);
  setStatus(job, 'Closed', `${job.number} closed`);
  runAutomations();
}

/* ================= Incidents ================= */
export function reportIncident(p: { job_id?: string; asset_id?: string; type: IncidentType; severity: IncidentReport['severity']; description: string }) {
  if (!store.can('dispatch.run') && !store.can('incidents.manage')) fail('Not permitted to report incidents.');
  if (!p.description.trim()) fail('Describe what happened.');
  const wf = p.job_id ? workflowFor(p.job_id) : undefined;
  const r = store.insert('incidents', { ...p, workflow_id: wf?.id, number: store.nextNumber('INC'), status: 'Open', auto: false } as never, `Incident reported: ${p.type}`) as IncidentReport;
  runAutomations();
  return r;
}
export function startInvestigation(id: string) {
  store.require('incidents.manage');
  return store.update('incidents', id, { status: 'Investigating' } as never, 'update', 'Incident under investigation');
}
export function acknowledgeIncident(id: string, note: string) {
  store.require('incidents.manage');
  if (!note.trim()) fail('Enter an acknowledgement note.');
  store.update('incidents', id, { status: 'Acknowledged', resolution: note.trim() } as never, 'approve', 'Incident acknowledged');
  runAutomations();
}
export type IncidentOutcome = 'found' | 'written_off' | 'other';
export function resolveIncident(id: string, resolution: string, outcome: IncidentOutcome = 'other') {
  store.require('incidents.manage');
  const inc = db().incidents.find((x) => x.id === id) ?? fail('Incident not found.');
  if (inc.status === 'Resolved') fail('Already resolved.');
  if (!resolution.trim()) fail('Enter a resolution note.');
  if (inc.type === 'Missing asset' && inc.asset_id) {
    const a = db().assets.find((x) => x.id === inc.asset_id)!;
    if (outcome === 'found') {
      const co = db().checkouts.find((c) => c.asset_id === a.id && c.job_id === inc.job_id && c.status === 'Released');
      if (co) performReturn(co.id, { condition: 'Good', damage_notes: '', missing: '', photos: [] });
      else store.update('assets', a.id, { status: 'Available', location: 'Main Warehouse' });
    } else if (outcome === 'written_off') store.update('assets', a.id, { status: 'Retired', location: 'Written off (lost)' }, 'update', `${a.name} written off as lost`);
  }
  const r = store.update('incidents', id, { status: 'Resolved', resolution, resolved_at: new Date().toISOString() } as never, 'approve', `Incident ${inc.number} resolved`);
  runAutomations();
  return r;
}

/* ================= Edits with reason (Operations Manager / Admin) ================= */
export function correctWorkflow(id: string, patch: Partial<JobWorkflow>, reason: string) {
  store.require('incidents.manage');
  const wf = getWf(id); const job = jobOf(wf);
  return store.withReason(reason, () => store.update('workflows', id, patch as never, 'update', `Workflow record corrected for ${job.number}: ${reason}`));
}
export function overrideJobStatus(id: string, status: JobStatus, reason: string) {
  store.require('dispatch.approve');
  const job = db().jobs.find((j) => j.id === id) ?? fail('Job not found.');
  if (status === job.status) fail('The job already has that status.');
  return store.withReason(reason, () => store.update('jobs', id, { status } as never, 'update', `Status override ${job.number}: ${job.status} → ${status}`));
}

export { variationTotals };
