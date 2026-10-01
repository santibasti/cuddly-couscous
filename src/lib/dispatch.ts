// Dispatch & Return Checklist: Confirmed → Dispatch Checklist Pending → Departed from HQ → Arrived at Site → In Progress
//   → Work Completed → Return Checklist Pending → Returned to HQ → Closed.
// Each transition is validated here; discrepancies create incident reports, maintenance tickets and alerts.
import { store, RuleError } from './store';
import type {
  Asset, ContainerCondition, DB, Dispatch, DispatchItem, FuelLevel, IncidentReport, IncidentType, ItemCondition, Job, JobPhoto, JobStatus, VehicleCondition,
} from './types';
import { buildDispatchItems, dispatchGaps, kindOfAsset, onHand, round2Safe } from './business';
import { performRelease, performReturn, requestCheckout, requestMaterials, runAutomations } from './actions';
import { nowLocal, today } from './util';

const db = (): DB => store.getDB();
const fail = (m: string): never => { throw new RuleError(m); };
const sumBy = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);

export { buildDispatchItems, dispatchGaps, kindOfAsset };

/** Match a scanned / typed code to an item on the checklist. */
export function matchScan(items: DispatchItem[], code: string): DispatchItem | undefined {
  const c = code.trim().toUpperCase();
  return items.find((i) => i.code?.toUpperCase() === c);
}
export const FUEL_LEVELS: FuelLevel[] = ['Empty', '1/4', '1/2', '3/4', 'Full'];
export const ITEM_CONDITIONS: ItemCondition[] = ['Good', 'Damaged', 'Missing'];
export const VEHICLE_CONDITIONS: VehicleCondition[] = ['Good', 'With Issue'];
export const CONTAINER_CONDITIONS: ContainerCondition[] = ['Good', 'Damaged', 'Leaking'];

export function canRunDispatch(job: Job): boolean {
  if (!store.can('dispatch.run')) return false;
  const emp = store.user?.employee_id;
  return store.can('jobs.all') || (!!emp && (job.leader_id === emp || job.crew_ids.includes(emp)));
}
const needRun = (job: Job) => { store.require('dispatch.run'); if (!canRunDispatch(job)) fail('Only the assigned Team Leader or a manager can complete this checklist.'); };
const jobOf = (dp: Dispatch) => db().jobs.find((j) => j.id === dp.job_id)!;
const nameOf = (id: string) => db().employees.find((e) => e.id === id)?.full_name ?? id;
const setStatus = (job: Job, status: JobStatus, summary?: string) => store.update('jobs', job.id, { status }, 'update', summary ?? `${job.number}: ${job.status} → ${status}`);
const gpsOk = (lat?: number, lng?: number, note?: string) => (lat !== undefined && lng !== undefined) || !!note?.trim();
const issuedNet = (jobId: string, itemId: string) => -sumBy(db().stock.filter((t) => t.approval === 'Approved' && t.job_id === jobId && t.item_id === itemId && ['Issue to Job', 'Return from Job'].includes(t.type)), (t) => t.qty);

export const dispatchFor = (jobId: string) => db().dispatches.find((x) => x.job_id === jobId && !x.deleted_at);

/** Start (or resume) the dispatch checklist. Moves a Confirmed job to "Dispatch Checklist Pending". */
export function openDispatch(jobId: string): Dispatch {
  const job = db().jobs.find((j) => j.id === jobId);
  if (!job) return fail('Job not found.');
  const cur = dispatchFor(jobId);
  if (cur) return cur;
  needRun(job);
  if (!['Confirmed', 'Dispatch Checklist Pending'].includes(job.status)) fail(job.status === 'Pending' ? 'Confirm the booking first — only confirmed jobs can be dispatched.' : `A job that is ${job.status.toLowerCase()} cannot be dispatched.`);
  const clocked = [...new Set([...(job.leader_id ? [job.leader_id] : []), ...job.crew_ids])].filter((e) => db().attendance.some((a) => a.employee_id === e && a.date === today() && a.clock_in && !a.deleted_at));
  const dp = store.insert('dispatches', { job_id: jobId, stage: 'Pending', items: buildDispatchItems(db(), job), crew_present: clocked, arr_photos: [], ret_photos: [], dep_veh_condition: 'Good' } as never, `Dispatch checklist opened for ${job.number}`) as Dispatch;
  if (job.status === 'Confirmed') setStatus(job, 'Dispatch Checklist Pending');
  return dp;
}

export type DepartureDraft = Partial<Pick<Dispatch, 'items' | 'crew_present' | 'crew_notes' | 'dep_veh_condition' | 'dep_veh_photo' | 'dep_veh_notes' | 'dep_fuel' | 'dep_odo' | 'dep_photo' | 'dep_lat' | 'dep_lng' | 'dep_gps_note'>>;

/** Save in-progress checklist input without completing the phase. */
export function saveDispatchDraft(id: string, patch: DepartureDraft) {
  const d = db().dispatches.find((x) => x.id === id)!; const job = jobOf(d);
  needRun(job);
  if (d.stage !== 'Pending') fail('Departure has already been recorded.');
  return store.update('dispatches', id, patch as never, 'update', `Dispatch draft saved for ${job.number}`);
}

/* ---------------- exception approval ---------------- */
export function requestDepartureException(id: string, reason: string, draft: DepartureDraft) {
  const d = db().dispatches.find((x) => x.id === id)!; const job = jobOf(d);
  needRun(job);
  if (d.stage !== 'Pending') fail('Departure has already been recorded.');
  if (!reason.trim()) fail('Enter the reason the job must depart with missing or damaged items.');
  const merged = { ...d, ...draft };
  const gaps = dispatchGaps(job, merged, nameOf);
  if (gaps.incomplete.length) fail(`Finish the checklist first. Still needed: ${gaps.incomplete.join(', ')}.`);
  if (!gaps.discrepancies.length) fail('Nothing is missing or damaged — no exception is needed.');
  store.update('dispatches', id, { ...draft, dep_exception_reason: reason.trim(), dep_exception_sig: gaps.signature, dep_exception_status: 'Pending', dep_exception_by: store.user?.id, dep_exception_at: new Date().toISOString(), dep_exception_note: undefined } as never, 'update', `Exception requested for ${job.number}: ${reason.trim()}`);
  runAutomations();
}
export function decideDepartureException(id: string, approve: boolean, note: string) {
  store.require('dispatch.approve');
  const d = db().dispatches.find((x) => x.id === id)!; const job = jobOf(d);
  if (d.dep_exception_status !== 'Pending') fail('There is no pending exception request.');
  if (!approve && !note.trim()) fail('Enter a reason for rejecting the exception.');
  store.update('dispatches', id, { dep_exception_status: approve ? 'Approved' : 'Rejected', dep_exception_note: note.trim() || undefined, dep_exception_by: store.user?.id, dep_exception_at: new Date().toISOString() } as never, approve ? 'approve' : 'update', `Exception ${approve ? 'approved' : 'rejected'} for ${job.number}${note.trim() ? ': ' + note.trim() : ''}`);
  runAutomations();
}

function raise(job: Job, dp: Dispatch, type: IncidentType, severity: IncidentReport['severity'], description: string, extra: Partial<IncidentReport> = {}) {
  return store.insert('incidents', { number: store.nextNumber('INC'), job_id: job.id, dispatch_id: dp.id, type, severity, description, status: 'Open', auto: true, ...extra } as never, `Incident raised for ${job.number}: ${type}`) as IncidentReport;
}

/* ================= Departure from HQ ================= */
export type DepartureForm = DepartureDraft & { items: DispatchItem[]; confirmed: boolean };

export function completeDeparture(id: string, f: DepartureForm) {
  const d = db().dispatches.find((x) => x.id === id)!; const job = jobOf(d);
  needRun(job);
  if (d.stage !== 'Pending') fail('Departure has already been recorded.');
  const merged = { ...d, ...f };
  const gaps = dispatchGaps(job, merged, nameOf);
  if (gaps.incomplete.length) fail(`Complete the checklist before departure. Still needed: ${gaps.incomplete.join(', ')}.`);
  if (gaps.discrepancies.length) {
    if (d.dep_exception_status !== 'Approved' || d.dep_exception_sig !== gaps.signature) {
      fail(d.dep_exception_status === 'Pending' ? 'Waiting for the Operations Manager to approve your exception.' : `Required items are missing, damaged or short (${gaps.discrepancies.map((x) => x.text).join('; ')}). Enter a reason and request Operations Manager approval to depart anyway.`);
    }
  }
  if (!f.confirmed) fail('Tick the Team Leader confirmation to complete the departure.');
  if (!['Confirmed', 'Dispatch Checklist Pending'].includes(job.status)) fail(`The job is ${job.status.toLowerCase()} and cannot be dispatched.`);
  const crewPresent = f.crew_present ?? [];

  // stock check for chemicals / materials
  for (const it of f.items.filter((i) => i.kind === 'material' && i.item_id && (i.loaded_qty ?? 0) > 0)) {
    const inv = db().items.find((x) => x.id === it.item_id)!;
    const need = round2Safe(it.loaded_qty! - issuedNet(job.id, inv.id));
    if (need > 0 && onHand(db(), inv.id, inv.location_id) < need) fail(`Insufficient stock of ${inv.name}: ${onHand(db(), inv.id, inv.location_id)} ${inv.uom} on hand, ${need} needed. Ask Operations to receive stock.`);
  }
  // assets: release each loaded, serviceable asset to this job (approver releases; otherwise a request goes to Operations)
  const pending: string[] = [];
  const addedAssets: string[] = [];
  for (const it of f.items.filter((i) => i.asset_id && (i.loaded_qty ?? 0) > 0 && (i.out_condition ?? 'Good') === 'Good')) {
    let co = db().checkouts.find((c) => c.asset_id === it.asset_id && c.job_id === job.id && ['Requested', 'Released'].includes(c.status) && !c.deleted_at);
    if (!co) co = requestCheckout({ asset_id: it.asset_id!, job_id: job.id, responsible_id: it.responsible_id ?? job.leader_id ?? store.user?.employee_id ?? '', expected_return: job.end_at, note: 'Raised from dispatch checklist' }) as never;
    if (co!.status === 'Requested') {
      if (store.can('assets.approve')) performRelease(co!.id, { condition: 'Good', meter: it.kind === 'vehicle' ? f.dep_odo : undefined, photos: it.out_photo ? [it.out_photo] : [] });
      else pending.push(it.label);
    }
    if (it.extra && it.kind !== 'vehicle') addedAssets.push(it.asset_id!);
  }
  if (pending.length) fail(`Waiting for Operations to approve release of: ${pending.join(', ')}. The request has been sent — try again once released.`);

  // ---- all checks passed: write ----
  // crew attendance sync
  const geo = { lat: f.dep_lat, lng: f.dep_lng };
  for (const e of crewPresent) {
    const att = db().attendance.find((a) => a.employee_id === e && a.date === today() && !a.deleted_at);
    if (!att) {
      const emp = db().employees.find((x) => x.id === e);
      store.insert('attendance', { employee_id: e, date: today(), kind: 'Present', clock_in: nowLocal(), job_id: job.id, field_work: true, in_lat: geo.lat, in_lng: geo.lng, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0, approval: 'Pending', notes: 'Presence confirmed by Team Leader at dispatch' } as never, `Attendance synced from dispatch: ${emp?.full_name}`);
    } else if (!att.job_id || !att.field_work) store.update('attendance', att.id, { job_id: job.id, field_work: true }, 'update', `Attendance linked to ${job.number} at dispatch`);
  }
  // issue chemicals / materials from stock
  const jobMaterials = [...job.materials];
  for (const it of f.items.filter((i) => i.kind === 'material' && i.item_id && (i.loaded_qty ?? 0) > 0)) {
    const inv = db().items.find((x) => x.id === it.item_id)!;
    const need = round2Safe(it.loaded_qty! - issuedNet(job.id, inv.id));
    if (need > 0) store.insert('stock', { item_id: inv.id, type: 'Issue to Job', qty: -need, unit_cost: inv.cost, location_id: inv.location_id, job_id: job.id, date: today(), approval: 'Approved', reason: 'Issued at dispatch' } as never, `Issued ${need} ${inv.uom} ${inv.name} to ${job.number} at dispatch`);
    const k = jobMaterials.findIndex((m) => m.item_id === inv.id);
    if (k >= 0) jobMaterials[k] = { ...jobMaterials[k], planned_qty: it.loaded_qty! }; else jobMaterials.push({ item_id: inv.id, planned_qty: it.loaded_qty! });
  }
  // discrepancy incidents (departure side)
  const draftDp = d;
  for (const it of f.items) {
    const damaged = (it.kind === 'material' ? it.out_container : it.out_condition) === 'Damaged' || it.out_container === 'Leaking';
    const missing = it.kind !== 'material' && it.out_condition === 'Missing';
    if (it.asset_id && damaged) {
      store.update('assets', it.asset_id, { status: 'Damaged', condition: 'Damaged', location: 'Workshop' }, 'update', `${it.label} found damaged at dispatch`);
      const t = store.insert('tickets', { asset_id: it.asset_id, source: 'Damage report', description: `Found damaged at dispatch for ${job.number}. ${it.out_note ?? ''}`.trim(), status: 'Open', opened_on: today(), cost: 0 } as never, `Maintenance ticket auto-created for ${it.label}`) as { id: string };
      raise(job, draftDp, 'Damaged asset', 'Medium', `${it.code} ${it.label} damaged before departure for ${job.number}. ${it.out_note ?? ''}`.trim(), { asset_id: it.asset_id, ticket_id: t.id });
    } else if (damaged) raise(job, draftDp, it.kind === 'material' ? 'Other' : 'Damaged asset', 'Low', `${it.label} ${it.out_container === 'Leaking' ? 'container leaking' : 'damaged'} at dispatch for ${job.number}. ${it.out_note ?? ''}`.trim(), { item_id: it.item_id });
    if (missing || (it.kind !== 'material' && (it.loaded_qty ?? 0) < it.qty && !damaged)) raise(job, draftDp, it.kind === 'ppe' ? 'Missing PPE' : 'Other', 'Medium', `${it.label} ${missing ? 'not available' : `short: loaded ${it.loaded_qty ?? 0} of ${it.qty}`} at dispatch for ${job.number}. Departed under approved exception.`, { asset_id: it.asset_id });
  }
  if (f.dep_veh_condition === 'With Issue') raise(job, draftDp, 'Vehicle damage', 'Low', `Vehicle departed with a reported issue: ${f.dep_veh_notes}`, { asset_id: job.vehicle_id });
  if (addedAssets.length) store.update('jobs', job.id, { equipment_ids: [...new Set([...job.equipment_ids, ...addedAssets])] }, 'update', `Additional tools added to ${job.number} at dispatch`);
  store.update('jobs', job.id, { materials: jobMaterials }, 'update', `Materials issued for ${job.number}`);
  const at = nowLocal();
  const out = store.update('dispatches', id, {
    ...f, confirmed: undefined, stage: 'Departed', dep_at: at, dep_confirmed_by: store.user?.id, dep_confirmed_at: new Date().toISOString(),
  } as never, 'approve', `${job.number} departed from HQ`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'Departed from HQ');
  runAutomations();
  return out;
}

/* ================= Arrival at client site ================= */
export interface ArrivalForm {
  arr_lat?: number; arr_lng?: number; arr_gps_note?: string; arr_photos: string[]; arr_contact_name: string; arr_contact_mobile?: string;
  arr_safety_briefing: boolean; arr_briefing_notes?: string; arr_site_notes?: string; arr_requests?: string;
  extra_materials?: { item_id: string; qty: number }[]; extra_equipment?: string[];
}
export function completeArrival(jobId: string, f: ArrivalForm) {
  const job = db().jobs.find((j) => j.id === jobId)!; const d = dispatchFor(jobId);
  if (!d) fail('This job has no dispatch checklist.');
  needRun(job);
  if (d!.stage !== 'Departed' || job.status !== 'Departed from HQ') fail(job.status === 'Arrived at Site' || job.status === 'In Progress' ? 'Arrival has already been recorded.' : 'The crew must depart from headquarters first.');
  if (!gpsOk(f.arr_lat, f.arr_lng, f.arr_gps_note)) fail('Capture GPS location on arrival, or explain why it is unavailable.');
  if (!f.arr_contact_name.trim()) fail('Enter the site contact person.');
  if (!f.arr_photos.length) fail('Take at least one before-work photo.');
  if (!f.arr_safety_briefing) fail('Confirm the safety briefing before work starts.');
  const at = nowLocal();
  const photos: JobPhoto[] = f.arr_photos.map((data, i) => ({ kind: 'before', caption: `Arrival – before work ${i + 1}`, data, taken_at: at }));
  store.update('jobs', job.id, { photos: [...job.photos, ...photos] }, 'update', `Before-work photos added to ${job.number}`);
  const { extra_materials, extra_equipment, ...rest } = f;
  store.update('dispatches', d!.id, { ...rest, stage: 'On Site', arr_at: at } as never, 'update', `${job.number} arrived at site`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'Arrived at Site');
  // additional equipment / material requests from site
  if (extra_materials?.some((m) => m.qty > 0)) { try { requestMaterials(job.id, extra_materials.filter((m) => m.qty > 0), `Requested from site: ${f.arr_requests ?? ''}`); } catch (e) { if (!(e instanceof RuleError)) throw e; } }
  for (const a of extra_equipment ?? []) { try { requestCheckout({ asset_id: a, job_id: job.id, responsible_id: job.leader_id ?? '', expected_return: job.end_at, note: `Requested from site: ${f.arr_requests ?? ''}` }); } catch (e) { if (!(e instanceof RuleError)) throw e; } }
  runAutomations();
}

/** Arrived at Site → In Progress. */
export function startWork(jobId: string) {
  const job = db().jobs.find((j) => j.id === jobId)!;
  needRun(job);
  if (job.status !== 'Arrived at Site') fail(job.status === 'In Progress' ? 'Work has already started.' : 'Record the arrival at the client site first.');
  setStatus(job, 'In Progress', `${job.number}: work started on site`);
}

/** Work Completed → Return Checklist Pending. */
export function startReturnChecklist(jobId: string) {
  const job = db().jobs.find((j) => j.id === jobId)!;
  needRun(job);
  if (job.status === 'Return Checklist Pending') return;
  if (job.status !== 'Work Completed') fail('Submit the job completion first (checklist, photos and client sign-off).');
  setStatus(job, 'Return Checklist Pending');
}

/* ================= Return to headquarters ================= */
export interface ReturnForm {
  items: DispatchItem[]; ret_photos: string[]; ret_fuel?: FuelLevel; ret_odo?: number; ret_veh_condition?: VehicleCondition; ret_veh_notes?: string; ret_notes?: string;
  ret_lat?: number; ret_lng?: number; ret_gps_note?: string; confirmed: boolean;
}
export interface ReturnSummary { missing: number; damaged: number; issues: number; incidents: number; tickets: number; distance?: number; used: { label: string; qty: number; unit?: string }[] }

export function completeReturn(id: string, f: ReturnForm): ReturnSummary {
  const d = db().dispatches.find((x) => x.id === id)!; const job = jobOf(d);
  needRun(job);
  if (d.stage === 'Returned') fail('Return has already been recorded.');
  if (job.status !== 'Return Checklist Pending') fail(job.status === 'Work Completed' ? 'Start the return checklist first.' : 'The work must be completed before the return checklist.');
  const issued = (i: DispatchItem) => i.loaded_qty ?? 0;
  const items = f.items.map((i) => ({ ...i }));
  for (const it of items) {
    if (issued(it) <= 0) continue;
    if (it.returned_qty === undefined || Number.isNaN(it.returned_qty)) fail(`Enter the returned quantity for ${it.label}.`);
    if (it.returned_qty! < 0 || it.returned_qty! > issued(it) + 1e-9) fail(`${it.label}: returned quantity must be between 0 and ${issued(it)}.`);
    if (it.kind === 'material') it.used_qty = round2Safe(issued(it) - it.returned_qty!);
    if (it.returned_qty! < issued(it) && it.kind !== 'material') it.ret_condition = it.returned_qty === 0 ? 'Missing' : it.ret_condition ?? 'Good';
    if (!it.ret_condition) fail(`Record the condition of ${it.label} on return.`);
    if ((it.ret_condition === 'Damaged' || it.ret_condition === 'Missing') && !it.ret_note?.trim()) fail(`Add a note for ${it.label} (${it.ret_condition.toLowerCase()}).`);
    if (it.kind === 'equipment' && it.returned_qty! > 0 && !it.ret_photo) fail(`Take a return photo of ${it.label} (major equipment).`);
    if (!it.ret_responsible_id) it.ret_responsible_id = it.responsible_id ?? job.leader_id;
  }
  const veh = items.find((i) => i.kind === 'vehicle');
  if (veh) {
    if (!f.ret_fuel) fail('Record the ending fuel level.');
    if (!(f.ret_odo && f.ret_odo > 0)) fail('Enter the ending odometer reading.');
    if (d.dep_odo !== undefined && f.ret_odo! < d.dep_odo) fail(`Ending odometer (${f.ret_odo}) cannot be lower than the starting reading (${d.dep_odo}).`);
    if (!f.ret_veh_condition) fail('Record the vehicle condition on return.');
    if (f.ret_veh_condition === 'With Issue' && !f.ret_veh_notes?.trim()) fail('Describe the vehicle issue.');
  }
  if (!f.ret_photos.length) fail('Take the return / loading photo at headquarters.');
  if (!gpsOk(f.ret_lat, f.ret_lng, f.ret_gps_note)) fail('Capture GPS location at headquarters, or explain why it is unavailable.');
  if (!f.confirmed) fail('Tick the Team Leader confirmation to complete the return.');

  let tickets = 0, missing = 0, damaged = 0;
  const incBefore = db().incidents.filter((x) => x.dispatch_id === id).length;
  const inc = (type: IncidentType, sev: IncidentReport['severity'], text: string, extra: Partial<IncidentReport> = {}) => raise(job, d, type, sev, text, extra);
  const used: ReturnSummary['used'] = [];
  for (const it of items) {
    if (issued(it) <= 0) continue;
    const lostQty = it.kind === 'material' ? 0 : round2Safe(issued(it) - it.returned_qty!);
    const dmg = it.ret_condition === 'Damaged' && it.returned_qty! > 0;
    if (it.kind === 'material') {
      const inv = db().items.find((x) => x.id === it.item_id)!;
      if (it.returned_qty! > 0) store.insert('stock', { item_id: inv.id, type: 'Return from Job', qty: it.returned_qty!, unit_cost: inv.cost, location_id: inv.location_id, job_id: job.id, date: today(), approval: 'Approved', reason: 'Unused returned at dispatch return' } as never, `Returned ${it.returned_qty} ${inv.uom} ${inv.name} from ${job.number}`);
      used.push({ label: it.label, qty: it.used_qty!, unit: it.unit });
      if (it.ret_condition === 'Missing') { missing++; inc('Material shortage', 'Medium', `${it.label}: container reported missing on return from ${job.number}. ${it.ret_note ?? ''}`.trim(), { item_id: inv.id }); }
      else if (it.ret_condition === 'Damaged') { damaged++; inc('Other', 'Low', `${it.label}: container returned damaged from ${job.number}. ${it.ret_note ?? ''}`.trim(), { item_id: inv.id }); }
      continue;
    }
    if (it.asset_id) {
      const a = db().assets.find((x) => x.id === it.asset_id)!;
      const co = db().checkouts.find((c) => c.asset_id === a.id && c.job_id === job.id && c.status === 'Released' && !c.deleted_at);
      if (it.returned_qty === 0 || it.ret_condition === 'Missing') {
        missing++;
        store.update('assets', a.id, { status: 'Missing', location: 'Unknown – last seen on ' + job.number }, 'update', `${a.name} reported missing on return from ${job.number}`);
        inc('Missing asset', 'High', `${a.code} ${a.name} was issued for ${job.number} but not returned. ${it.ret_note ?? ''}`.trim(), { asset_id: a.id });
        continue;
      }
      const isVeh = it.kind === 'vehicle';
      const vehIssue = isVeh && f.ret_veh_condition === 'With Issue';
      if (co) {
        const cond = dmg ? 'Damaged' : vehIssue ? 'Fair' : 'Good';
        const note = dmg ? (it.ret_note ?? 'Damaged') : '';
        const r = performReturn(co.id, { condition: cond, meter: isVeh ? f.ret_odo : undefined, damage_notes: note, missing: '', photos: it.ret_photo ? [it.ret_photo] : [], repair: dmg ? it.repair_required !== false : undefined });
        if (dmg) { damaged++; if (r.ticketId) tickets++; inc('Damaged asset', 'Medium', `${a.code} ${a.name} returned damaged from ${job.number}. ${note}`, { asset_id: a.id, ticket_id: r.ticketId }); }
      }
      if (vehIssue) {
        const t = store.insert('tickets', { asset_id: a.id, source: 'Damage report', description: `Vehicle issue reported on return from ${job.number}: ${f.ret_veh_notes}`, status: 'Open', opened_on: today(), cost: 0 } as never, `Maintenance ticket auto-created for ${a.name}`) as { id: string };
        store.update('assets', a.id, { status: 'Under Maintenance', location: 'Workshop' }, 'update', `${a.name} → Under Maintenance (vehicle issue)`);
        tickets++; damaged++;
        inc('Vehicle damage', 'Medium', `${a.code} ${a.name}: ${f.ret_veh_notes}`, { asset_id: a.id, ticket_id: t.id });
      }
    } else {
      // PPE sets and free-text tools (no asset record)
      if (lostQty > 0) { missing++; inc(it.kind === 'ppe' ? 'Missing PPE' : 'Other', 'Medium', `${it.label}: ${lostQty} of ${issued(it)} not returned from ${job.number}. ${it.ret_note ?? ''}`.trim()); }
      if (dmg) { damaged++; inc('Damaged asset', 'Low', `${it.label} returned damaged from ${job.number}. ${it.ret_note ?? ''}`.trim()); }
    }
  }
  const incidents = db().incidents.filter((x) => x.dispatch_id === id).length - incBefore;
  const at = nowLocal();
  const usedMap = new Map(items.filter((i) => i.kind === 'material').map((i) => [i.item_id!, i.used_qty!]));
  const cur = db().jobs.find((j) => j.id === job.id)!;
  store.update('jobs', job.id, {
    materials: cur.materials.map((m) => (usedMap.has(m.item_id) ? { ...m, used_qty: usedMap.get(m.item_id) } : m)),
    photos: [...cur.photos, ...f.ret_photos.map((data, i): JobPhoto => ({ kind: 'after', caption: `Return – at HQ ${i + 1}`, data, taken_at: at }))],
  }, 'update', `Material usage and return photos recorded for ${job.number}`);
  const distance = veh && d.dep_odo !== undefined ? round2Safe(f.ret_odo! - d.dep_odo) : undefined;
  store.update('dispatches', id, {
    items, stage: 'Returned', ret_at: at, ret_photos: f.ret_photos, ret_fuel: f.ret_fuel, ret_odo: f.ret_odo, ret_veh_condition: f.ret_veh_condition, ret_veh_notes: f.ret_veh_notes,
    ret_notes: f.ret_notes, ret_lat: f.ret_lat, ret_lng: f.ret_lng, ret_gps_note: f.ret_gps_note, distance_km: distance, ret_confirmed_by: store.user?.id, ret_confirmed_at: new Date().toISOString(),
  } as never, 'approve', `${job.number} returned to headquarters${incidents ? ` — ${incidents} incident(s) raised` : ''}`);
  setStatus(db().jobs.find((j) => j.id === job.id)!, 'Returned to HQ');
  runAutomations();
  return { missing, damaged, issues: missing + damaged, incidents, tickets, distance, used };
}

/** Returned to HQ → Closed. Blocked while incidents on the job are still open. */
export function closeJob(jobId: string) {
  const job = db().jobs.find((j) => j.id === jobId)!;
  if (!(canRunDispatch(job) || store.can('incidents.manage'))) fail('Only the Team Leader, an Operations Manager or Admin can close the job.');
  if (job.status !== 'Returned to HQ') fail('Complete the return checklist before closing the job.');
  const open = db().incidents.filter((i) => i.job_id === jobId && !i.deleted_at && ['Open', 'Investigating'].includes(i.status));
  if (open.length) fail(`${open.length} incident report(s) are still open (${open.map((i) => i.number).join(', ')}). Resolve or acknowledge them before closing the job.`);
  setStatus(job, 'Closed', `${job.number} closed`);
  runAutomations();
}

/* ================= Incidents ================= */
export function reportIncident(p: { job_id?: string; asset_id?: string; type: IncidentType; severity: IncidentReport['severity']; description: string }) {
  if (!store.can('dispatch.run') && !store.can('incidents.manage')) fail('Not permitted to report incidents.');
  if (!p.description.trim()) fail('Describe what happened.');
  const r = store.insert('incidents', { ...p, number: store.nextNumber('INC'), status: 'Open', auto: false } as never, `Incident reported: ${p.type}`) as IncidentReport;
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
  const inc = db().incidents.find((x) => x.id === id)!;
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
export function correctDispatch(id: string, patch: Partial<Dispatch>, reason: string) {
  store.require('incidents.manage');
  const d = db().dispatches.find((x) => x.id === id)!; const job = jobOf(d);
  return store.withReason(reason, () => store.update('dispatches', id, patch as never, 'update', `Dispatch record corrected for ${job.number}: ${reason}`));
}
export function overrideJobStatus(id: string, status: JobStatus, reason: string) {
  store.require('dispatch.approve');
  const job = db().jobs.find((j) => j.id === id)!;
  if (status === job.status) fail('The job already has that status.');
  return store.withReason(reason, () => store.update('jobs', id, { status } as never, 'update', `Status override ${job.number}: ${job.status} → ${status}`));
}

export const assetStatusOptions = (a: Asset) => a.status;
