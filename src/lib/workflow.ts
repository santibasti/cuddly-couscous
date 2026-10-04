// The 7-step job workflow that lives inside every Job Card:
//  1 Job Prep at HQ → 2 Dispatch → 3 Site Check-In → 4 Scope Approval → 5 Work in Progress → 6 Client Handover → 7 Close-Out.
// One JobWorkflow record per job; every step stamps date/time + user and is written through the audited store.
// Photos are NOT kept in this app (TopMop uses its own file system for before / after, site and equipment photos).
import { store, RuleError } from './store';
import type {
  ClientFeedback, ConfirmMethod, ContainerCondition, PaymentConfirmation, DB, DiscountKind, DiscountRequest, FuelLevel, IncidentReport, IncidentType, IssueCategory, SatisfactionRating, ItemCondition, Job, JobStatus, JobWorkflow, PanelRow, QuoteItem, Variation, CheckItem,
} from './types';
import { FEEDBACK_ASPECTS, ISSUE_CATEGORIES, RATING_STARS, openFollowUp, buildChecklistItems, categoryDefaults, currentRequest, discountAmount, discountBlock, discountImpact, discountLocked, jobRequests, docTotals, finalContract, finalQuoteSummary, hqGaps, isRecurringJob, kindOfAsset, onHand, openVariations, resolveReviewItems, round2Safe, scopeRoute, variationTotals } from './business';
import { settleConfirmation, syncBackJobs, performRelease, performReturn, requestCheckout, runAutomations } from './actions';
import { nowLocal, today } from './util';

const db = (): DB => store.getDB();
const fail = (m: string): never => { throw new RuleError(m); };
const sumBy = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);

export { buildChecklistItems, hqGaps, kindOfAsset };
export const FUEL_LEVELS: FuelLevel[] = ['Empty', '1/4', '1/2', '3/4', 'Full'];
export const ITEM_CONDITIONS: ItemCondition[] = ['Good', 'Damaged', 'Missing'];
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
const setStatus = (job: Job, status: JobStatus, summary?: string) => { const r = store.update('jobs', job.id, { status }, 'update', summary ?? `${job.number}: ${job.status} → ${status}`); syncBackJobs(); return r; };
const uidNow = () => store.user?.id;
const issuedNet = (jobId: string, itemId: string) => -sumBy(db().stock.filter((t) => t.approval === 'Approved' && t.job_id === jobId && t.item_id === itemId && ['Issue to Job', 'Return from Job'].includes(t.type)), (t) => t.qty);

/** Actual time entered by the Team Leader (defaults to now): valid, not in the future, and not before the previous step. */
const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const asMin = (s: string) => Date.parse(`${s}:00Z`) / 60000;
function pickTime(at: string | undefined, label: string, prev?: string, prevLabel?: string): string {
  const now = nowLocal(); const v = at?.trim() ? at.trim().slice(0, 16) : now;
  if (!TIME_RE.test(v)) fail(`Enter a valid ${label} time.`);
  if (asMin(v) > asMin(now) + 15) fail(`The ${label} time cannot be in the future.`);
  if (prev && asMin(v) < asMin(prev.slice(0, 16))) fail(`The ${label} time cannot be before ${prevLabel}.`);
  return v;
}

function raise(job: Job, wf: JobWorkflow, type: IncidentType, severity: IncidentReport['severity'], description: string, extra: Partial<IncidentReport> = {}) {
  return store.insert('incidents', { number: store.nextNumber('INC'), job_id: job.id, workflow_id: wf.id, type, severity, description, status: 'Open', auto: true, ...extra } as never, `Incident raised for ${job.number}: ${type}`) as IncidentReport;
}
function ticketFor(assetId: string, text: string) {
  return store.insert('tickets', { asset_id: assetId, source: 'Damage report', description: text, status: 'Open', opened_on: today(), cost: 0 } as never, 'Maintenance ticket auto-created') as { id: string };
}

/* ================= Step 1: Job Prep at HQ ================= */
/** Open (or resume) the workflow. A Confirmed job moves to "Dispatch Checklist Pending". */
export function openWorkflow(jobId: string): JobWorkflow {
  const job = db().jobs.find((j) => j.id === jobId) ?? fail('Job not found.');
  const cur = workflowFor(jobId);
  if (cur) return cur;
  needRun(job);
  if (!['Confirmed', 'Dispatch Checklist Pending'].includes(job.status)) fail(job.status === 'Pending' ? 'Confirm the booking first — only confirmed jobs can start the workflow.' : `A job that is ${job.status.toLowerCase()} cannot start the workflow.`);
  const wf = store.insert('workflows', { job_id: jobId, items: buildChecklistItems(db(), job), panels: [] } as never, `Job workflow opened for ${job.number}`) as JobWorkflow;
  if (job.status === 'Confirmed') setStatus(job, 'Dispatch Checklist Pending');
  return wf;
}

export type HqDraft = Partial<Pick<JobWorkflow, 'items' | 'hq_fuel' | 'hq_notes' | 'hq_shortage_reason'>>;
export function saveHqDraft(id: string, patch: HqDraft) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (wf.hq_at) fail('Job prep has already been completed.');
  return store.update('workflows', id, patch as never, 'update', `Job prep draft saved for ${job.number}`);
}

/** One checklist: crew, vehicle, equipment & tools, PPE, materials. Checks out equipment (→ In Use) and issues materials from Inventory. */
export function completeHqChecklist(id: string, f: HqDraft & { items: CheckItem[]; confirmed: boolean }) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (wf.hq_at) fail('Job prep has already been completed.');
  if (!job.leader_id) fail('Assign a Team Leader to this job first.');
  const merged = { ...wf, ...f };
  const gaps = hqGaps(merged);
  if (gaps.incomplete.length) fail(`Complete the checklist first. Still needed: ${gaps.incomplete.join(', ')}.`);
  if (gaps.shortages.length && !merged.hq_shortage_reason?.trim()) fail(`Some items are short, damaged or missing (${gaps.shortages.join('; ')}). Enter a reason to continue.`);
  if (!f.confirmed) fail('Tick the Team Leader confirmation.');
  if (!['Confirmed', 'Dispatch Checklist Pending'].includes(job.status)) fail(`The job is ${job.status.toLowerCase()}.`);
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
    if (co!.status === 'Requested') performRelease(co!.id, { condition: 'Good' });
    if (it.extra && it.kind !== 'vehicle') addedAssets.push(it.asset_id!);
  }
  // reserve / issue chemicals & materials through the existing Inventory module
  const jobMaterials = [...job.materials];
  for (const it of f.items.filter((i) => i.kind === 'material' && i.item_id && (i.loaded_qty ?? 0) > 0)) {
    const inv = db().items.find((x) => x.id === it.item_id)!;
    const need = round2Safe(it.loaded_qty! - issuedNet(job.id, inv.id));
    if (need > 0) store.insert('stock', { item_id: inv.id, type: 'Issue to Job', qty: -need, unit_cost: inv.cost, location_id: inv.location_id, job_id: job.id, date: today(), approval: 'Approved', reason: 'Issued at job prep' } as never, `Issued ${need} ${inv.uom} ${inv.name} to ${job.number} at HQ`);
    const k = jobMaterials.findIndex((m) => m.item_id === inv.id);
    if (k >= 0) jobMaterials[k] = { ...jobMaterials[k], planned_qty: it.loaded_qty! }; else jobMaterials.push({ item_id: inv.id, planned_qty: it.loaded_qty! });
  }
  // discrepancies → incidents / maintenance tickets
  for (const it of f.items) {
    const damaged = (it.kind === 'material' ? it.out_container : it.out_condition) === 'Damaged' || it.out_container === 'Leaking';
    const missing = it.kind !== 'material' && it.out_condition === 'Missing';
    if (it.asset_id && damaged) {
      store.update('assets', it.asset_id, { status: 'Damaged', condition: 'Damaged', location: 'Workshop' }, 'update', `${it.label} found damaged at job prep`);
      const t = ticketFor(it.asset_id, `Found damaged at job prep for ${job.number}. ${it.out_note ?? ''}`.trim());
      raise(job, wf, it.kind === 'vehicle' ? 'Vehicle damage' : 'Damaged asset', 'Medium', `${it.code} ${it.label} damaged before departure for ${job.number}. ${it.out_note ?? ''}`.trim(), { asset_id: it.asset_id, ticket_id: t.id });
    } else if (damaged) raise(job, wf, 'Other', 'Low', `${it.label} ${it.out_container === 'Leaking' ? 'container leaking' : 'damaged'} at job prep for ${job.number}. ${it.out_note ?? ''}`.trim(), { item_id: it.item_id });
    if (missing || (it.kind !== 'material' && (it.loaded_qty ?? 0) < it.qty && !damaged)) raise(job, wf, it.kind === 'ppe' ? 'Missing PPE' : 'Other', 'Medium', `${it.label} ${missing ? 'not available' : `short: loaded ${it.loaded_qty ?? 0} of ${it.qty}`} at job prep for ${job.number}. ${merged.hq_shortage_reason ?? ''}`.trim(), { asset_id: it.asset_id });
  }
  store.update('jobs', job.id, { materials: jobMaterials, equipment_ids: [...new Set([...job.equipment_ids, ...addedAssets])] }, 'update', `Equipment & materials issued for ${job.number}`);
  const { confirmed: _c, ...rest } = f; void _c;
  store.update('workflows', id, { ...rest, hq_at: nowLocal(), hq_by: uidNow() } as never, 'approve', `${job.number}: job prep confirmed by the Team Leader`);
  if (job.status === 'Confirmed') setStatus(db().jobs.find((j) => j.id === job.id)!, 'Dispatch Checklist Pending');
  runAutomations();
}

/* ================= Step 2: Dispatch (departure time + leader confirmation) ================= */
export function dispatchJob(id: string, f: { at?: string; confirmed: boolean }) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.hq_at) fail('Complete job prep at HQ first.');
  if (wf.disp_at) fail('The crew has already been dispatched.');
  const at = pickTime(f.at, 'departure');
  if (!f.confirmed) fail('Tick the Team Leader confirmation.');
  store.update('workflows', id, { disp_at: at, disp_by: uidNow() } as never, 'approve', `${job.number} dispatched from HQ at ${at.slice(11)}`);
  setStatus(job, 'Dispatched');
  runAutomations();
}

/* ================= Step 3: Site Check-In (arrival + attendance) ================= */
export interface CheckInForm { at?: string; contact_name: string; contact_mobile?: string; notes?: string; present: string[]; absent: { id: string; reason: string }[] }
export function arriveAtSite(id: string, f: CheckInForm) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.disp_at) fail('Dispatch the crew first.');
  if (wf.arr_at) fail('Check-in has already been recorded.');
  const at = pickTime(f.at, 'arrival', wf.disp_at, 'the departure');
  if (!f.contact_name.trim()) fail('Enter the site contact person.');
  const crew = [...new Set([...(job.leader_id ? [job.leader_id] : []), ...job.crew_ids])];
  const unaccounted = crew.filter((e) => !f.present.includes(e) && !f.absent.some((a) => a.id === e && a.reason.trim()));
  if (unaccounted.length) fail(`Confirm attendance for every assigned crew member. Missing: ${unaccounted.map((e) => db().employees.find((x) => x.id === e)?.full_name ?? e).join(', ')}.`);
  if (!f.present.length) fail('At least one crew member must be present on site.');
  // sync to the existing Attendance module — link / create a single record per person per day, never a duplicate
  const date = at.slice(0, 10);
  for (const e of f.present) {
    const att = db().attendance.find((a) => a.employee_id === e && a.date === date && !a.deleted_at);
    if (!att) {
      const emp = db().employees.find((x) => x.id === e);
      store.insert('attendance', { employee_id: e, date, kind: 'Present', clock_in: at, job_id: job.id, field_work: true, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0, approval: 'Pending', notes: 'Presence confirmed by Team Leader at site check-in' } as never, `Attendance synced from job workflow: ${emp?.full_name}`);
    } else if (!att.job_id || !att.field_work) store.update('attendance', att.id, { job_id: job.id, field_work: true }, 'update', `Attendance linked to ${job.number} at site check-in`);
  }
  store.update('workflows', id, { arr_at: at, arr_by: uidNow(), arr_contact_name: f.contact_name.trim(), arr_contact_mobile: f.contact_mobile, arr_notes: f.notes, arr_crew_present: f.present, arr_crew_absent: f.absent } as never, 'update', `${job.number}: checked in at site ${at.slice(11)}, attendance confirmed`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'On Site');
  runAutomations();
}

/* ================= Step 4: Scope Approval ================= */
export function savePanels(id: string, panels: PanelRow[]) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (wf.closed_at) fail('The job is closed.');
  if (!wf.arr_at) fail('Check in at the site first.');
  if (panels.some((p) => p.external < 0 || p.internal < 0 || !Number.isFinite(p.external + p.internal))) fail('Panel counts cannot be negative.');
  return store.update('workflows', id, { panels } as never, 'update', `${job.number}: panel count updated (${sumBy(panels, (p) => p.external + p.internal)} panels)`);
}
const hasGlass = (job: Job) => job.service_codes.some((c) => c === 'GLASS_EXT' || c === 'GLASS_INT');

/** Recurring job whose scope changed (or a new scope): switches between "Scope Confirmed – No Changes" and the signed conforme. */
export function setScopeChanged(id: string, changed: boolean) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (wf.conf_at) fail('The scope is already approved.');
  return store.update('workflows', id, { scope_changed: changed } as never, 'update', `${job.number}: scope marked as ${changed ? 'changed — client approval required' : 'unchanged'}`);
}

/** Existing recurring job, no change: the approved scope is confirmed by the Team Leader — no new client signature. */
export function confirmScopeNoChanges(id: string) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.arr_at) fail('Check in at the site first.');
  if (wf.conf_at) fail('The scope is already approved.');
  if (scopeRoute(db(), job, wf) !== 'recurring') fail('This is a new job or the scope changed — the client must review and sign the quotation / conforme.');
  if (openVariations(db(), job.id).length) fail('Additional work is waiting for the client. Approve, decline or revise it first.');
  const q = db().quotations.find((x) => x.id === job.quotation_id);
  const total = q ? docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total : finalContract(db(), job).originalTotal;
  store.update('workflows', id, { conf_mode: 'confirmed', conf_at: nowLocal(), conf_by: uidNow(), conf_quotation_id: q?.id, conf_original_total: total, conf_final_total: total } as never, 'approve', `${job.number}: scope confirmed — no changes (existing approved scope ${q?.number ?? ''})`);
  runAutomations();
}

/* ---- Variation approval at site: original quote + additional work → final bill ---- */
const canEditRates = () => store.can('admin.settings') || store.can('dispatch.approve');
const reviewDraft = (jobId: string) => db().variations.find((v) => v.job_id === jobId && v.source === 'final_review' && v.status === 'Draft' && !v.deleted_at);
export const reviewVat = (job: Job): { vat_mode: Variation['vat_mode']; vat_rate: number } => {
  const q = db().quotations.find((x) => x.id === job.quotation_id); const c = db().clients.find((x) => x.id === job.client_id);
  return { vat_mode: q?.vat_mode ?? (c?.vat_status === 'VAT-registered' ? 'exclusive' : 'none'), vat_rate: q?.vat_rate ?? db().settings.vat_rate };
};
export interface FinalReviewInput { items: QuoteItem[]; deposit?: number; deposit_note?: string }

/** Team Leader / Admin prepares the additional work before presenting the final quote. The original quotation is never touched. */
export function saveFinalReview(id: string, f: FinalReviewInput) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.arr_at) fail('Check in at the site first.');
  if (wf.conf_at) fail('The scope is already approved. Further additional work goes through a variation.');
  const authorised = canEditRates();
  for (const it of f.items) {
    if (!it.category) fail('Choose a service category for every additional line.');
    if (!it.unit.trim()) fail('Choose a unit of measure for every additional line.');
    const def = categoryDefaults(db().services, it.category!);
    if (it.category !== 'other' && Math.abs(it.rate - def.rate) > 0.004 && !authorised) fail(`The price list rate (${def.rate} per ${def.unit}) for ${it.description || 'this line'} can only be changed by an Operations Manager or Admin.`);
    if (it.discount < 0) fail('Discount cannot be negative.');
    if (it.discount > 0 && !store.can('discount.approve')) fail('Only the Owner / Admin can apply a discount. Submit a Discount Request instead.');
    if (it.rate < 0) fail('Unit rate cannot be negative.');
  }
  const items = resolveReviewItems(db(), wf.panels, f.items);
  for (const it of items) {
    if (!it.description.trim()) fail('Describe the area or work for every additional line.');
    if (!(it.qty > 0)) fail(it.linked_panels ? 'No additional panels are marked in the panel-counting table. Tick “Extra” on the rows beyond the quoted scope.' : `Enter a quantity for ${it.description}.`);
    if (it.discount > it.qty * it.rate + 0.005) fail(`The discount on ${it.description} is more than the line amount.`);
  }
  const vat = reviewVat(job);
  const deposit = Math.max(0, f.deposit ?? 0);
  const sum_ = finalQuoteSummary(db(), job, { pending: { items, ...vat }, deposit });
  if (deposit > sum_.finalTotal + 0.005) fail('The deposit / prior payment is more than the final total.');
  const glass = wf.panels.filter((p) => p.additional).map((p) => p.id);
  const cur = reviewDraft(job.id);
  const patch = { items, discount: 0, ...vat, panel_row_ids: items.some((i) => i.linked_panels) ? glass : [], reason: items.length ? `Additional work requested / identified at site: ${items.map((i) => i.note?.trim() || i.description).join('; ')}`.slice(0, 480) : 'Additional work (none)', revision_open: false };
  if (cur) store.update('variations', cur.id, patch as never, 'update', `${cur.number}: additional work ${cur.revision_open ? 're-presented after revision request' : 'updated'} (${items.length} line(s))`);
  else if (items.length) store.insert('variations', { job_id: job.id, number: varNumber(job), ...patch, status: 'Draft', source: 'final_review' } as never, `Additional work drafted for ${job.number} (${items.length} line(s))`);
  store.update('workflows', id, { conf_deposit: deposit || undefined, conf_deposit_note: f.deposit_note?.trim() || undefined } as never, 'update', `${job.number}: variation approval prepared${deposit ? ` (deposit ${deposit})` : ''}`);
}

/** The client asks for changes: the review stays open and cannot be signed until the Team Leader re-presents it. */
export function requestFinalQuoteRevision(id: string, note: string) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (wf.conf_at) fail('The scope is already approved.');
  const v = reviewDraft(job.id) ?? fail('There is no additional work under review.');
  if (!note.trim()) fail('Record what the client would like changed.');
  store.update('variations', v.id, { revision_open: true, revision_note: note.trim(), revision_at: new Date().toISOString() } as never, 'update', `${v.number}: client requested a revision — ${note.trim()}`);
}

/** The client declines the additional work: it leaves the final amount but stays on record as offered and declined. */
export function declineAdditionalWork(id: string, f: { client_name: string; reason?: string; lat?: number; lng?: number; gps_note?: string; device?: string }) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (wf.conf_at) fail('The scope is already approved.');
  const v = reviewDraft(job.id); if (!v || !v.items.length) fail('There is no additional work to decline.');
  if (!f.client_name.trim()) fail('Enter the client name.');
  store.update('variations', v!.id, { status: 'Rejected', client_name: f.client_name.trim(), notes: f.reason?.trim() || 'Declined by the client at the site', decided_by: uidNow(), decided_at: new Date().toISOString(), revision_open: false, sign_lat: f.lat, sign_lng: f.lng, sign_gps_note: f.gps_note, sign_device: f.device } as never, 'update', `${v!.number}: additional work offered and declined by ${f.client_name.trim()}`);
  runAutomations();
}

/** "Approve and Sign": the client signs the quotation / conforme (new or changed scope) and any additional work, saved as a linked variation / change order. */
export function approveFinalQuote(id: string, f: { name: string; signature?: string; notes?: string; confirmed: boolean; lat?: number; lng?: number; gps_note?: string; device?: string }) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.arr_at) fail('Check in at the site first.');
  if (wf.conf_at) fail('The scope is already approved.');
  const v = reviewDraft(job.id);
  if (v?.revision_open) fail('The client asked for a revision. Update the additional work and present it again before signing.');
  if ((!isRecurringJob(db(), job) || wf.scope_changed) && hasGlass(job) && !wf.panels.length) fail('Count the glass panels (floor, side, external, internal) before the client signs.');
  if (!f.confirmed) fail('Confirm that the quotation and any additional work were reviewed with the client on site.');
  if (!f.name.trim()) fail('Enter the client name.');
  if (!f.signature) fail('Capture the client signature.');
  const dBlock = discountBlock(db(), job, wf, billBase(job).base); if (dBlock) fail(dBlock);
  const q = db().quotations.find((x) => x.id === job.quotation_id);
  const now = new Date().toISOString();
  let variationId: string | undefined;
  if (v && v.items.length) {
    const items = resolveReviewItems(db(), wf.panels, v.items);
    if (items.some((i) => !(i.qty > 0))) fail('An additional line has no quantity. Update the additional work first.');
    store.update('variations', v.id, { items, status: 'Approved', client_name: f.name.trim(), client_signature: f.signature, signed_at: now, decided_at: now, decided_by: uidNow(), sign_lat: f.lat, sign_lng: f.lng, sign_gps_note: f.gps_note, sign_device: f.device } as never, 'approve', `${v.number}: additional work approved by ${f.name.trim()} — change order`);
    variationId = v.id;
    const fc = finalContract(db(), db().jobs.find((j) => j.id === job.id)!);
    store.update('jobs', job.id, { contract_amount: fc.finalNet }, 'update', `${job.number}: contract value ${fc.originalNet} + approved additions ${fc.variationsNet} = ${fc.finalNet}`);
  }
  const sm = finalQuoteSummary(db(), db().jobs.find((j) => j.id === job.id)!, { deposit: wf.conf_deposit });
  store.update('workflows', id, { conf_mode: 'approval', conf_at: nowLocal(), conf_by: uidNow(), conf_quotation_id: q?.id, conf_original_total: sm.originalTotal, conf_final_total: sm.finalTotal, conf_variation_id: variationId, conf_name: f.name.trim(), conf_signature: f.signature, conf_notes: f.notes, conf_lat: f.lat, conf_lng: f.lng, conf_gps_note: f.gps_note, conf_device: f.device } as never, 'approve', `${job.number}: scope approved and signed by ${f.name.trim()} (final total ${sm.finalTotal})`);
  runAutomations();
}

/* ================= Step 5: Work in Progress (start time, finish time, notes, incident) ================= */
export function startWork(id: string, f: { at?: string; notes?: string } = {}) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.conf_at) fail('Work cannot start until the scope is approved: the client must sign the quotation (step 4).');
  if (wf.conf_mode === 'declined') fail('The client declined the job — go to Close-Out.');
  const ob = discountBlock(db(), job, wf, billBase(job).base); if (ob && /waiting|not yet applied/.test(ob)) fail(ob);
  if (wf.start_at) fail('Work has already started.');
  const at = pickTime(f.at, 'work start', wf.arr_at, 'the check-in');
  store.update('workflows', id, { start_at: at, start_by: uidNow(), work_notes: f.notes ?? wf.work_notes } as never, 'update', `${job.number}: work started ${at.slice(11)}`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'In Progress', `${job.number}: work started on site`);
}
export function finishWork(id: string, f: { at?: string; notes?: string } = {}) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.start_at) fail('Start the work first.');
  if (wf.finish_at) fail('Work has already been finished.');
  const open = openVariations(db(), job.id);
  if (open.length) fail(`${open.length} variation(s) are waiting for client approval (${open.map((v) => v.number).join(', ')}). Approve or decline them before finishing.`);
  const at = pickTime(f.at, 'work finish', wf.start_at, 'the work start');
  store.update('workflows', id, { finish_at: at, finish_by: uidNow(), work_notes: f.notes ?? wf.work_notes } as never, 'update', `${job.number}: work finished ${at.slice(11)}`);
  runAutomations();
}
export function saveWorkNotes(id: string, notes: string) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (wf.closed_at) fail('The job is closed.');
  return store.update('workflows', id, { work_notes: notes } as never, 'update', `${job.number}: work notes updated`);
}

/* ---- Variations raised after work has started (additional work discovered during the job) ---- */
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
  if (v.source === 'final_review') fail('Edit this addition from the Scope Approval step.');
  if (v.status !== 'Draft') fail('Only draft variations can be edited. Create a new variation instead.');
  validateVariation(f);
  return store.update('variations', id, f as never, 'update', `Variation ${v.number} updated`);
}
/** Client approval + signature. Additional work may only begin after this. */
export function approveVariation(id: string, f: { client_name: string; signature?: string }) {
  const v = db().variations.find((x) => x.id === id) ?? fail('Variation not found.');
  const job = db().jobs.find((j) => j.id === v.job_id)!;
  needRun(job);
  if (v.source === 'final_review') fail('Approve this addition from the Scope Approval step.');
  if (v.status !== 'Draft') fail(`This variation is already ${v.status.toLowerCase()}.`);
  if (!f.client_name.trim()) fail('Enter the client name.');
  if (!f.signature) fail('Client approval needs the client signature.');
  const cr = currentRequest(db(), job.id);
  if (cr && cr.status !== 'Applied') fail(discountBlock(db(), job, workflowFor(job.id), cr.approved_base ?? 0) ?? 'A discount request is still open on this job.');
  store.update('variations', id, { status: 'Approved', client_name: f.client_name.trim(), client_signature: f.signature, signed_at: new Date().toISOString(), decided_by: uidNow() } as never, 'approve', `Variation ${v.number} approved by ${f.client_name.trim()}`);
  const fc = finalContract(db(), db().jobs.find((j) => j.id === job.id)!);
  store.update('jobs', job.id, { contract_amount: fc.finalNet }, 'update', `${job.number}: contract value ${fc.originalNet} + variations ${fc.variationsNet} = ${fc.finalNet}`);
  runAutomations();
}
export function rejectVariation(id: string, note: string) {
  const v = db().variations.find((x) => x.id === id) ?? fail('Variation not found.');
  needRun(db().jobs.find((j) => j.id === v.job_id)!);
  if (v.source === 'final_review') fail('Decline this addition from the Scope Approval step.');
  if (v.status !== 'Draft') fail(`This variation is already ${v.status.toLowerCase()}.`);
  if (!note.trim()) fail('Enter the reason the client declined.');
  store.update('variations', id, { status: 'Rejected', notes: note.trim(), decided_by: uidNow() } as never, 'update', `Variation ${v.number} declined by client`);
  runAutomations();
}

/* ================= Step 6: Client Handover (Service Accomplishment Report) ================= */
export interface ReportForm {
  scope: string; findings: string; limits: string; recs: string; method?: string; complimentary?: string;
  client_name: string; client_sig?: string; tm_name: string; tm_sig?: string; notes?: string;
  /** Client Satisfaction Check: one tap, optional ticks, optional comment. Not Satisfied needs an issue category from the Team Leader. */
  satisfaction?: SatisfactionInput;
}
export interface SatisfactionInput { rating: SatisfactionRating; aspects?: string[]; comment?: string; issue_category?: IssueCategory }
export function signServiceReport(id: string, f: ReportForm) {
  store.require('jobs.complete');
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.finish_at) fail('Finish the work (step 5) before the client handover.');
  if (wf.rep_at) fail('The service report is already signed.');
  const open = openVariations(db(), job.id);
  if (open.length) fail(`${open.length} variation(s) are waiting for client approval (${open.map((v) => v.number).join(', ')}). Approve or decline them before the report is signed.`);
  if (!f.scope.trim()) fail('Describe the work completed.');
  if (!f.findings.trim()) fail('Enter the findings (or “None”).');
  if (!f.recs.trim()) fail('Enter the recommendations (or “None”).');
  if (!f.limits.trim()) fail('Enter the limitations / exclusions (or “None”).');
  if (!f.client_name.trim()) fail('Enter the client name.');
  if (!f.client_sig) fail('The client signature is required.');
  if (!f.tm_name.trim() || !f.tm_sig) fail('The TopMop team leader name and signature are required.');
  const dBlock = discountBlock(db(), job, wf, billBase(job).base); if (dBlock) fail(dBlock);
  const sat = f.satisfaction;
  if (!sat || ![1, 2, 3].includes(sat.rating)) fail('Ask the client how satisfied they are with today’s service (one tap).');
  if (sat!.rating === 1 && !ISSUE_CATEGORIES.includes(sat!.issue_category as IssueCategory)) fail('The client is not satisfied: choose the issue category (Quality, Damage, Delay, Communication, Scope or Other).');
  const aspects = (sat!.aspects ?? []).filter((a) => (FEEDBACK_ASPECTS as readonly string[]).includes(a));
  const cur = db().jobs.find((j) => j.id === job.id)!;
  const at = nowLocal();
  store.update('jobs', job.id, { findings: f.findings, signoff_name: f.client_name.trim(), signoff_data: f.client_sig, signoff_at: at, client_rating: RATING_STARS[sat!.rating], completed_at: at }, 'approve', `Service report signed for ${job.number}`);
  void cur;
  store.update('workflows', id, { rep_at: at, rep_by: uidNow(), rep_scope: f.scope, rep_method: f.method, rep_findings: f.findings, rep_limits: f.limits, rep_recs: f.recs, rep_complimentary: f.complimentary, rep_client_name: f.client_name.trim(), rep_client_sig: f.client_sig, rep_client_at: at, rep_tm_name: f.tm_name.trim(), rep_tm_sig: f.tm_sig, rep_rating: RATING_STARS[sat!.rating], rep_notes: f.notes } as never, 'approve', `${job.number}: service accomplishment report signed by ${f.client_name.trim()}`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'Work Completed');
  const neg = sat!.rating === 1;
  store.insert('client_feedback', {
    job_id: job.id, workflow_id: id, client_id: job.client_id, leader_id: job.leader_id, crew_ids: [...job.crew_ids], service_codes: [...job.service_codes], service_date: job.start_at.slice(0, 10),
    rating: sat!.rating, aspects, comment: sat!.comment?.trim() || undefined, issue_category: neg ? sat!.issue_category : undefined, follow_up: neg ? 'Required' : 'None', submitted_by: uidNow(), submitted_at: new Date().toISOString(),
  } as never, `${job.number}: client satisfaction ${sat!.rating === 1 ? 'Not Satisfied' : sat!.rating === 2 ? 'Satisfied' : 'Very Satisfied'}${neg ? ` (${sat!.issue_category}) — follow-up required` : ''}`);
  runAutomations();
}

/** Owner / Admin acknowledges negative feedback (with a note). This releases the job so it can be fully closed. */
export function acknowledgeFeedback(id: string, note: string): ClientFeedback {
  store.require('feedback.acknowledge');
  const fb = db().client_feedback.find((x) => x.id === id) ?? fail('Feedback not found.');
  if (fb.follow_up !== 'Required') fail('This feedback does not need a follow-up.');
  if (!note.trim()) fail('Enter the follow-up note (what was done or agreed with the client).');
  const r = store.update('client_feedback', id, { follow_up: 'Acknowledged', ack_note: note.trim(), ack_by: uidNow(), ack_at: new Date().toISOString() } as never, 'approve', `Negative client feedback acknowledged for ${db().jobs.find((j) => j.id === fb.job_id)?.number}: ${note.trim()}`) as ClientFeedback;
  const job = db().jobs.find((j) => j.id === fb.job_id); const wf = workflowFor(fb.job_id);
  if (job && wf?.closed_at && job.status === 'Work Completed') setStatus(job, 'Closed', `${job.number} closed after the Admin acknowledged the client feedback`);
  runAutomations();
  return r;
}

/* ================= Step 7: Close-Out (equipment return + leave site + arrival at HQ + leader confirmation) ================= */
export interface ReturnSummary { awaitingAck?: boolean; missing: number; damaged: number; incidents: number; tickets: number; used: { label: string; qty: number; unit?: string }[] }
export interface CloseReady { key: string; label: string; ok: boolean }
export function closeOutReady(d: DB, job: Job, wf?: JobWorkflow): CloseReady[] {
  return [
    { key: 'conf', label: 'Scope approved', ok: !!wf?.conf_at },
    { key: 'att', label: 'Site attendance confirmed', ok: !!wf?.arr_at && !!wf.arr_crew_present?.length },
    { key: 'fin', label: 'Work finished', ok: !!wf?.finish_at || wf?.conf_mode === 'declined' },
    { key: 'rep', label: 'Client handover signed', ok: !!wf?.rep_at || wf?.conf_mode === 'declined' },
    { key: 'var', label: 'No variation waiting for client approval', ok: openVariations(d, job.id).length === 0 },
  ];
}
export function completeCloseOut(id: string, f: { items: CheckItem[]; leave_at?: string; hqa_at?: string; fuel?: FuelLevel; notes?: string; confirmed: boolean }): ReturnSummary {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (wf.closed_at) fail('The job is already closed.');
  const bad = closeOutReady(db(), job, wf).filter((g) => !g.ok);
  if (bad.length) fail(`Finish the earlier steps first: ${bad.map((g) => g.label).join('; ')}.`);
  const leave = pickTime(f.leave_at, 'leave-site', wf.finish_at ?? wf.arr_at, wf.finish_at ? 'the work finish' : 'the check-in');
  const hqa = pickTime(f.hqa_at, 'arrival at HQ', leave, 'leaving the site');
  const issued = (i: CheckItem) => i.loaded_qty ?? 0;
  const items = f.items.map((i) => ({ ...i }));
  for (const it of items) {
    if (issued(it) <= 0) continue;
    if (it.returned_qty === undefined || Number.isNaN(it.returned_qty)) fail(`Enter the returned quantity for ${it.label}.`);
    if (it.returned_qty! < 0 || it.returned_qty! > issued(it) + 1e-9) fail(`${it.label}: returned quantity must be between 0 and ${issued(it)}.`);
    if (it.kind === 'material') it.used_qty = round2Safe(issued(it) - it.returned_qty!);
    if (it.returned_qty! < issued(it) && it.kind !== 'material') it.ret_condition = it.returned_qty === 0 ? 'Missing' : it.ret_condition ?? 'Good';
    if (!it.ret_condition) fail(`Record the condition of ${it.label} on return.`);
    if ((it.ret_condition === 'Damaged' || it.ret_condition === 'Missing') && !it.ret_note?.trim()) fail(`Add a note for ${it.label} (${it.ret_condition.toLowerCase()}).`);
  }
  if (!f.confirmed) fail('Tick the Team Leader confirmation.');

  let tickets = 0, missing = 0, damaged = 0;
  const before = db().incidents.filter((x) => x.workflow_id === id).length;
  const used: ReturnSummary['used'] = [];
  const inc = (type: IncidentType, sev: IncidentReport['severity'], text: string, extra: Partial<IncidentReport> = {}) => raise(job, wf, type, sev, text, extra);
  for (const it of items) {
    if (issued(it) <= 0) continue;
    const lostQty = it.kind === 'material' ? 0 : round2Safe(issued(it) - it.returned_qty!);
    const dmg = it.ret_condition === 'Damaged' && it.returned_qty! > 0;
    if (it.kind === 'material') {
      const inv = db().items.find((x) => x.id === it.item_id)!;
      if (it.returned_qty! > 0) store.insert('stock', { item_id: inv.id, type: 'Return from Job', qty: it.returned_qty!, unit_cost: inv.cost, location_id: inv.location_id, job_id: job.id, date: today(), approval: 'Approved', reason: 'Unused returned at close-out' } as never, `Returned ${it.returned_qty} ${inv.uom} ${inv.name} from ${job.number}`);
      used.push({ label: it.label, qty: it.used_qty!, unit: it.unit });
      if (it.ret_condition === 'Missing') { missing++; inc('Material shortage', 'Medium', `${it.label}: container reported missing at close-out of ${job.number}. ${it.ret_note ?? ''}`.trim(), { item_id: inv.id }); }
      else if (it.ret_condition === 'Damaged') { damaged++; inc('Other', 'Low', `${it.label}: container damaged at ${job.number}. ${it.ret_note ?? ''}`.trim(), { item_id: inv.id }); }
      continue;
    }
    if (it.asset_id) {
      const a = db().assets.find((x) => x.id === it.asset_id)!;
      const co = db().checkouts.find((c) => c.asset_id === a.id && c.job_id === job.id && c.status === 'Released' && !c.deleted_at);
      const veh = it.kind === 'vehicle';
      if (it.returned_qty === 0 || it.ret_condition === 'Missing') {
        missing++;
        store.update('assets', a.id, { status: 'Missing', location: 'Unknown – last seen on ' + job.number }, 'update', `${a.name} reported missing at ${job.number}`);
        inc(veh ? 'Vehicle damage' : 'Missing asset', 'High', `${a.code} ${a.name} was issued for ${job.number} but not accounted for at close-out. ${it.ret_note ?? ''}`.trim(), { asset_id: a.id });
      } else if (co && dmg) {
        const repair = it.repair_required !== false;
        const r = performReturn(co.id, { condition: 'Damaged', damage_notes: it.ret_note ?? 'Damaged', missing: '', repair: true });
        // sent for repair → Under Maintenance; otherwise flagged Damaged (out of service until Operations decides)
        store.update('assets', a.id, { status: repair ? 'Under Maintenance' : 'Damaged', condition: 'Damaged' }, 'update', `${a.name} → ${repair ? 'Under Maintenance' : 'Damaged'} after ${job.number}`);
        damaged++; if (r.ticketId) tickets++;
        inc(veh ? 'Vehicle damage' : 'Damaged asset', 'Medium', `${a.code} ${a.name} damaged at ${job.number}. ${it.ret_note ?? ''}`.trim(), { asset_id: a.id, ticket_id: r.ticketId });
      } else if (co) performReturn(co.id, { condition: 'Good', damage_notes: '', missing: '', repair: false });   // back at HQ → Available
    } else {
      if (lostQty > 0) { missing++; inc(it.kind === 'ppe' ? 'Missing PPE' : 'Other', 'Medium', `${it.label}: ${lostQty} of ${issued(it)} not accounted for at ${job.number}. ${it.ret_note ?? ''}`.trim()); }
      if (dmg) { damaged++; inc('Damaged asset', 'Low', `${it.label} damaged at ${job.number}. ${it.ret_note ?? ''}`.trim()); }
    }
  }
  const usedMap = new Map(items.filter((i) => i.kind === 'material').map((i) => [i.item_id!, i.used_qty!]));
  const cur = db().jobs.find((j) => j.id === job.id)!;
  store.update('jobs', job.id, { materials: cur.materials.map((m) => (usedMap.has(m.item_id) ? { ...m, used_qty: usedMap.get(m.item_id) } : m)) }, 'update', `Material usage recorded for ${job.number}`);
  const incidents = db().incidents.filter((x) => x.workflow_id === id).length - before;
  const now = nowLocal();
  store.update('workflows', id, { items, rc_at: now, rc_by: uidNow(), rc_notes: f.notes, leave_at: leave, leave_by: uidNow(), hqa_at: hqa, hqa_by: uidNow(), hqa_fuel: f.fuel, closed_at: now, closed_by: uidNow(), closed_notes: f.notes } as never, 'approve', `${job.number}: close-out confirmed — left site ${leave.slice(11)}, at HQ ${hqa.slice(11)}${incidents ? `, ${incidents} incident(s) raised` : ''}`);
  const hold = !!openFollowUp(db(), job.id);
  if (!hold) setStatus(db().jobs.find((j) => j.id === job.id)!, 'Closed', `${job.number} closed`);
  runAutomations();
  return { missing, damaged, incidents, tickets, used, awaitingAck: hold };
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
      if (co) performReturn(co.id, { condition: 'Good', damage_notes: '', missing: '' });
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
  if (status === 'Closed' && openFollowUp(db(), id)) fail('The client was not satisfied: the Admin must acknowledge the feedback before the job can be closed.');
  return store.withReason(reason, () => store.update('jobs', id, { status } as never, 'update', `Status override ${job.number}: ${job.status} → ${status}`));
}

export { variationTotals };


/* ================= Controlled discounts: Team Leader requests → Owner / Admin decides → applied to the final bill ================= */
/** The bill the client is looking at (VAT-inclusive), before any discount: original quotation + additional work (approved or presented). */
export function billBase(job: Job): { original: number; additional: number; base: number } {
  const wf = workflowFor(job.id);
  const draft = reviewDraft(job.id);
  const vat = reviewVat(job);
  const pending = draft && draft.items.length && !wf?.conf_at ? { items: resolveReviewItems(db(), wf?.panels ?? [], draft.items), ...vat } : undefined;
  const sm = finalQuoteSummary(db(), job, { pending });
  return { original: sm.originalTotal, additional: sm.additionalTotal, base: sm.subtotal };
}
const reqOf = (id: string) => db().discount_requests.find((r) => r.id === id) ?? fail('Discount request not found.');
const jobHasInvoice = (jobId: string) => db().invoices.some((i) => i.job_id === jobId && i.status !== 'Reversed' && !i.deleted_at);
const canTouchJob = (job: Job) => store.can('discount.approve') || canRunWorkflow(job) || (store.can('discount.request') && !!store.user?.employee_id && (job.leader_id === store.user.employee_id || job.crew_ids.includes(store.user.employee_id)));
function checkAmount(kind: DiscountKind, value: number, base: number): number {
  if (!(value > 0)) fail('Enter the discount amount.');
  if (kind === 'percent' && value >= 100) fail('A percentage discount must be below 100%.');
  const amt = discountAmount(kind, value, base);
  if (!(amt > 0)) fail('The discount works out to ₱0.');
  if (amt >= base) fail('The discount cannot be equal to or more than the bill total.');
  return amt;
}
export interface DiscountRequestForm { kind: DiscountKind; value: number; reason: string; reason_note?: string; client_notes?: string }

/** Team Leader (or Ops) submits a request. This never changes the bill — only the Owner / Admin can approve it. */
export function submitDiscountRequest(jobId: string, f: DiscountRequestForm): DiscountRequest {
  store.require('discount.request');
  const job = db().jobs.find((j) => j.id === jobId) ?? fail('Job not found.');
  if (!canTouchJob(job)) fail('Only the assigned Team Leader or a manager can request a discount for this job.');
  if (['Cancelled', 'Closed'].includes(job.status)) fail(`A ${job.status.toLowerCase()} job cannot take a discount request.`);
  const wf = workflowFor(jobId);
  if (!wf || !wf.arr_at) return fail('A discount can be requested once the crew has checked in at the site.');
  if (wf.conf_at) fail('The client has already signed the quotation. A discount must be agreed before the client signs.');
  if (jobHasInvoice(jobId)) fail('This job is already invoiced.');
  if (jobRequests(db(), jobId).some((r) => r.status === 'Rejected') && !store.can('discount.approve')) fail('The Admin already rejected a discount for this job. The decision stands: the client can approve the original quotation or decline the job.');
  const open = currentRequest(db(), jobId);
  if (open) fail(`${open.number} is already ${open.status === 'Pending Admin Approval' ? 'waiting for Admin approval' : open.status.toLowerCase()} for this job.`);
  if (!f.reason.trim()) fail('Choose the reason for the discount.');
  if (f.reason === 'Other' && !f.reason_note?.trim()) fail('Describe the reason for the discount.');
  const b = billBase(job);
  const amt = checkAmount(f.kind, f.value, b.base);
  const r = store.insert('discount_requests', {
    number: store.nextNumber('DR'), job_id: jobId, client_id: job.client_id, quotation_id: job.quotation_id,
    original_total: b.original, additional_total: b.additional, base_total: b.base,
    kind: f.kind, value: f.value, requested_amount: amt, proposed_final: round2d(b.base - amt),
    reason: f.reason.trim(), reason_note: f.reason_note?.trim() || undefined, client_notes: f.client_notes?.trim() || undefined,
    status: 'Pending Admin Approval', submitted_by: store.user?.id, submitted_at: new Date().toISOString(),
  } as never, `${job.number}: discount requested — ${f.kind === 'percent' ? `${f.value}%` : `₱${f.value}`} (₱${amt}) on ₱${b.base}`) as DiscountRequest;
  runAutomations();
  return r;
}
const round2d = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Owner / Admin only: approve (optionally at a modified amount) or reject. An approval note is mandatory. */
export function decideDiscount(id: string, f: { approve: boolean; kind?: DiscountKind; value?: number; note: string }): DiscountRequest {
  store.require('discount.approve');
  const r = reqOf(id); const job = db().jobs.find((j) => j.id === r.job_id)!;
  const wf = workflowFor(job.id);
  if (r.status === 'Rejected') fail('This request was rejected. The Team Leader can submit a new one.');
  if (discountLocked(wf, r)) fail('The client has already signed the discounted bill — the discount is final.');
  if (jobHasInvoice(job.id)) fail('This job is already invoiced.');
  if (!f.note.trim()) fail(f.approve ? 'Enter an approval note.' : 'Enter the reason for rejecting the discount.');
  if (!f.approve) {
    return store.update('discount_requests', id, { status: 'Rejected', decision_note: f.note.trim(), decided_by: store.user?.id, decided_at: new Date().toISOString(), applied_at: undefined, applied_by: undefined, net_amount: undefined, approved_amount: undefined, approved_final: undefined } as never, 'update', `${r.number}: discount rejected — ${f.note.trim()}`);
  }
  const b = billBase(job);
  const kind = f.kind ?? r.kind, value = f.value ?? r.value;
  const amt = checkAmount(kind, value, b.base);
  const im = discountImpact(db(), job, b, amt);
  const modified = Math.abs(amt - r.requested_amount) > 0.004;
  const approved = store.update('discount_requests', id, {
    status: 'Approved', approved_kind: kind, approved_value: value, approved_amount: amt, approved_final: round2d(b.base - amt), approved_base: b.base,
    original_total: b.original, additional_total: b.additional,
    est_cost: im.cost, gp_before: im.gpBefore, gp_after: im.gpAfter, margin_after: im.marginAfter, net_amount: im.net,
    decision_note: f.note.trim(), decided_by: store.user?.id, decided_at: new Date().toISOString(), applied_at: undefined, applied_by: undefined,
  } as never, 'approve', `${r.number}: discount ${modified ? `approved at a modified ₱${amt} (requested ₱${r.requested_amount})` : `approved ₱${amt}`} — ${f.note.trim()}`) as DiscountRequest;
  // The client is waiting at the quotation screen: the approved discount goes straight onto the final bill so they can sign.
  if (wf?.arr_at && !wf.conf_at) return store.update('discount_requests', id, { status: 'Applied', applied_at: new Date().toISOString(), applied_by: store.user?.id } as never, 'approve', `${r.number}: approved discount ₱${amt} applied to the final bill of ${job.number}`) as DiscountRequest;
  return approved;
}

/** Put the approved discount on the final bill. After this the client may sign. */
export function applyDiscount(id: string): DiscountRequest {
  const r = reqOf(id); const job = db().jobs.find((j) => j.id === r.job_id)!;
  if (!canTouchJob(job)) fail('Only the assigned Team Leader or a manager can apply the approved discount.');
  if (r.status !== 'Approved') fail(r.status === 'Applied' ? 'This discount is already applied.' : 'Only an approved discount can be applied.');
  if (jobHasInvoice(job.id)) fail('This job is already invoiced.');
  const wf = workflowFor(job.id);
  if (wf?.conf_at) fail('The client has already signed the quotation.');
  const b = billBase(job);
  if (Math.abs((r.approved_base ?? b.base) - b.base) > 0.01) fail('The final bill changed after the discount was approved. Ask the Admin to re-approve it.');
  return store.update('discount_requests', id, { status: 'Applied', applied_at: new Date().toISOString(), applied_by: store.user?.id } as never, 'approve', `${r.number}: approved discount ₱${r.approved_amount} applied to the final bill of ${job.number}`);
}
export { jobRequests };


/* ================= The client turns the job down on site (e.g. after a rejected discount) ================= */
/** Records that the client declined the job. No work is done and nothing is billed; the crew goes straight to Close-Out to return equipment. */
export function declineJob(id: string, f: { client_name: string; reason?: string; lat?: number; lng?: number; gps_note?: string; device?: string }) {
  const wf = getWf(id); const job = jobOf(wf);
  needRun(job);
  if (!wf.arr_at) fail('Check in at the site first.');
  if (wf.conf_at) fail('The quotation is already signed.');
  if (!f.client_name.trim()) fail('Enter the client name.');
  const cr = currentRequest(db(), job.id);
  if (cr && ['Pending Admin Approval', 'Approved'].includes(cr.status)) fail('Wait for the Admin to decide the discount request first.');
  const draft = reviewDraft(job.id);
  if (draft?.items.length) store.update('variations', draft.id, { status: 'Rejected', client_name: f.client_name.trim(), notes: 'Client declined the job', decided_by: uidNow(), decided_at: new Date().toISOString(), revision_open: false } as never, 'update', `${draft.number}: additional work not taken — client declined the job`);
  store.update('workflows', id, { conf_mode: 'declined', conf_at: nowLocal(), conf_by: uidNow(), conf_name: f.client_name.trim(), conf_notes: f.reason?.trim() || 'Client declined the job on site', conf_lat: f.lat, conf_lng: f.lng, conf_gps_note: f.gps_note, conf_device: f.device } as never, 'update', `${job.number}: client ${f.client_name.trim()} declined the job on site — ${f.reason?.trim() || 'no reason given'}`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'Work Completed', `${job.number}: client declined — no work done, proceed to close-out`);
  runAutomations();
}


/* ================= Payment Method Confirmation (shown just before Client Handover; never blocks it) ================= */
export interface PaymentConfirmInput {
  method: ConfirmMethod; collection?: 'Received' | 'To Be Paid Later'; expected_today?: number; note?: string; confirmed: boolean;
  gcash_ref?: string; bank_name?: string; transfer_ref?: string; cheque_no?: string; cheque_date?: string; terms?: string; due_date?: string;
}
/** The remaining balance shown to the Team Leader: final approved bill (additional work, VAT and discount included) less any deposit and what is expected today. */
export function paymentBalance(job: Job, wf: JobWorkflow | undefined, expectedToday: number) {
  const sm = finalQuoteSummary(db(), job, { deposit: wf?.conf_deposit });
  return { finalBill: sm.finalTotal, deposit: sm.deposit, due: sm.balance, remaining: Math.max(0, Math.round((sm.balance - (expectedToday || 0)) * 100) / 100) };
}
/** The Team Leader records how the client will pay. Money received becomes a Pending Verification payment (Finance verifies); the Team Leader can never mark it Verified. This is separate from the service record: handover and the service report are not held up. */
export function confirmPaymentMethod(jobId: string, f: PaymentConfirmInput): PaymentConfirmation {
  const job = db().jobs.find((j) => j.id === jobId) ?? fail('Job not found.');
  needRun(job);
  const wf = workflowFor(jobId) ?? fail('Open the job workflow first.');
  if (!wf.finish_at) fail('Payment can be confirmed once the work is finished.');
  if (job.back_job_id && db().back_jobs.find((b) => b.id === job.back_job_id)?.charge_type === 'No Charge') fail('This is a no-charge back job: there is nothing to pay.');
  if (wf.conf_mode === 'declined') fail('The client declined this job: there is nothing to pay.');
  if (!['Cash', 'GCash', 'Bank Transfer', 'Cheque', 'Terms / To Be Billed'].includes(f.method)) fail('Ask the client how payment will be made and choose one option.');
  if (!f.confirmed) fail('Confirm with the client that this is how payment will be made.');
  const prev = db().payment_confirmations.find((c) => c.job_id === jobId && !c.deleted_at);
  if (prev?.payment_id) fail('A payment was already recorded from this confirmation. Finance handles it from here.');
  const terms = f.method === 'Terms / To Be Billed';
  const collection = terms ? 'To Be Paid Later' : f.collection ?? fail('Choose whether the payment was received or will be paid later.');
  const bill = paymentBalance(job, wf, 0);
  if (bill.finalBill <= 0) fail('There is no bill to pay for this job.');
  const expected = Math.round(((terms ? 0 : f.expected_today ?? 0) + Number.EPSILON) * 100) / 100;
  if (expected < 0) fail('The amount cannot be negative.');
  if (expected > bill.due + 0.005) fail(`The amount is more than the balance due (${bill.due.toFixed(2)}).`);
  if (collection === 'Received') {
    if (!(expected > 0)) fail(f.method === 'Cash' ? 'Enter the amount received.' : 'Enter the amount received.');
    if (f.method === 'GCash' && !f.gcash_ref?.trim()) fail('Enter the GCash reference number.');
    if (f.method === 'Bank Transfer' && (!f.bank_name?.trim() || !f.transfer_ref?.trim())) fail('Enter the bank name and the transfer reference number.');
    if (f.method === 'Cheque' && (!f.bank_name?.trim() || !f.cheque_no?.trim() || !f.cheque_date)) fail('Enter the bank name, cheque number and cheque date.');
  }
  if (terms && !f.terms?.trim() && !f.due_date) fail('Enter the agreed payment terms or due date.');
  if (f.due_date && f.due_date < today()) fail('The due date cannot be in the past.');
  const row = {
    job_id: jobId, workflow_id: wf.id, client_id: job.client_id, final_bill: bill.finalBill, method: f.method, collection, expected_today: expected, balance_later: Math.max(0, Math.round((bill.due - expected) * 100) / 100),
    note: f.note?.trim() || undefined, amount_received: f.method === 'Cash' && collection === 'Received' ? expected : undefined,
    gcash_ref: f.method === 'GCash' ? f.gcash_ref?.trim() : undefined, bank_name: f.method === 'Bank Transfer' || f.method === 'Cheque' ? f.bank_name?.trim() : undefined, transfer_ref: f.method === 'Bank Transfer' ? f.transfer_ref?.trim() : undefined,
    cheque_no: f.method === 'Cheque' ? f.cheque_no?.trim() : undefined, cheque_date: f.method === 'Cheque' ? f.cheque_date : undefined, terms: terms ? f.terms?.trim() || undefined : undefined, due_date: f.due_date || undefined,
    confirmed_by: uidNow(), confirmed_at: nowLocal(),
  };
  const summary = `${job.number}: client payment — ${f.method}${terms ? '' : ` (${collection === 'Received' ? 'received on site' : 'to be paid later'})`}, final bill ${row.final_bill}, expected today ${expected}, balance later ${row.balance_later}`;
  const saved = (prev ? store.update('payment_confirmations', prev.id, row as never, 'update', summary) : store.insert('payment_confirmations', row as never, summary)) as PaymentConfirmation;
  settleConfirmation(jobId);          // creates the Pending Verification payment when money was received and an approved invoice exists
  return db().payment_confirmations.find((c) => c.id === saved.id) ?? saved;
}
