// Domain operations. Every function validates permissions and business rules, then writes through the audited store.
import { store, RuleError } from './store';
import type {
  Attendance, Checkout, ChequeStatus, Condition, Expense, Invoice, Job, JobStatus, MaintenanceTicket, Notification, PayMethod, PayrollAdjustment,
  Payment, Quotation, QuoteStatus, StockTx,
} from './types';
import {
  appliedDiscount, backJobStatusFor, paymentPlanLabel, buildPayrollLines, computeTimes, currentRequest, docTotals, finalContract, findConflicts, invoiceBalance, invoiceLedger, invoiceTotals, isDone, isOpen, LIVE_JOB, onHand, overlaps, stockSummary,
} from './business';
import { addDays, isoNow, uid, money, nowLocal, round2, sum, today } from './util';

const db = () => store.getDB();
const me = () => store.user;
const fail = (m: string): never => { throw new RuleError(m); };
export interface Geo { lat?: number; lng?: number }

/* ================= Attendance ================= */
export function clockIn(employeeId: string, geo: Geo, jobId?: string) {
  store.require('attendance.own');
  const d = db(); const emp = d.employees.find((e) => e.id === employeeId)!;
  if (store.role !== 'owner' && store.user?.employee_id !== employeeId && !store.can('attendance.approve')) fail('You can only clock in for yourself.');
  const date = today();
  const existing = d.attendance.find((a) => a.employee_id === employeeId && a.date === date && !a.deleted_at);
  if (existing?.clock_in) fail('Already clocked in today.');
  const at = nowLocal();
  const t = computeTimes(emp, at, undefined, d.settings.grace_minutes);
  const patch = { kind: 'Present' as const, clock_in: at, job_id: jobId, field_work: !!jobId, in_lat: geo.lat, in_lng: geo.lng, late_min: t.late_min };
  if (existing) return store.update('attendance', existing.id, patch, 'update', `${emp.full_name} clocked in`);
  return store.insert('attendance', { employee_id: employeeId, date, undertime_min: 0, ot_min: 0, worked_hours: 0, approval: 'Pending', ...patch } as never, `${emp.full_name} clocked in ${at.slice(11)}`);
}
export function clockOut(employeeId: string, geo: Geo) {
  store.require('attendance.own');
  const d = db(); const emp = d.employees.find((e) => e.id === employeeId)!;
  if (store.role !== 'owner' && store.user?.employee_id !== employeeId && !store.can('attendance.approve')) fail('You can only clock out for yourself.');
  const rec = d.attendance.find((a) => a.employee_id === employeeId && a.date === today() && a.clock_in && !a.clock_out && !a.deleted_at);
  if (!rec) fail('No open clock-in found for today.');
  const at = nowLocal();
  const t = computeTimes(emp, rec!.clock_in, at, d.settings.grace_minutes);
  return store.update('attendance', rec!.id, { clock_out: at, out_lat: geo.lat, out_lng: geo.lng, ...t }, 'update', `${emp.full_name} clocked out ${at.slice(11)}`);
}
export function decideAttendance(id: string, approve: boolean, note?: string) {
  store.require('attendance.approve');
  const a = db().attendance.find((x) => x.id === id)!;
  if (a.employee_id === store.user?.employee_id && store.role !== 'owner') fail('You cannot approve your own attendance.');
  return store.update('attendance', id, { approval: approve ? 'Approved' : 'Rejected', approved_by: me()!.id, approved_at: isoNow(), notes: note ?? a.notes }, 'approve', `${approve ? 'Approved' : 'Rejected'} attendance ${a.date}`);
}
export function bulkApproveAttendance(ids: string[]) { ids.forEach((id) => { try { decideAttendance(id, true); } catch { /* skip own records */ } }); }
export function manualAttendance(p: { employee_id: string; date: string; kind: Attendance['kind']; clock_in?: string; clock_out?: string; job_id?: string; paid_leave?: boolean; notes?: string }) {
  store.require('attendance.approve');
  const d = db(); const emp = d.employees.find((e) => e.id === p.employee_id)!;
  if (d.attendance.some((a) => a.employee_id === p.employee_id && a.date === p.date && !a.deleted_at)) fail('An attendance record already exists for that employee and date. Use a correction instead.');
  const t = p.kind === 'Present' ? computeTimes(emp, p.clock_in, p.clock_out, d.settings.grace_minutes) : { late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0 };
  return store.insert('attendance', { ...p, field_work: !!p.job_id, ...t, approval: 'Approved', approved_by: me()!.id, approved_at: isoNow() } as never, `Manual attendance ${emp.full_name} ${p.date}`);
}
export function requestCorrection(p: { employee_id: string; date: string; clock_in: string; clock_out: string; reason: string }) {
  store.require('attendance.own');
  if (!p.reason.trim()) fail('A reason is required.');
  if (p.clock_out <= p.clock_in) fail('Clock-out must be after clock-in.');
  const att = db().attendance.find((a) => a.employee_id === p.employee_id && a.date === p.date && !a.deleted_at);
  return store.insert('corrections', { ...p, attendance_id: att?.id, status: 'Pending' } as never, `Correction requested for ${p.date}`);
}
export function decideCorrection(id: string, approve: boolean, note?: string) {
  store.require('attendance.approve');
  const c = db().corrections.find((x) => x.id === id)!;
  if (c.status !== 'Pending') fail('Already decided.');
  if (c.employee_id === store.user?.employee_id && store.role !== 'owner') fail('You cannot approve your own correction.');
  store.update('corrections', id, { status: approve ? 'Approved' : 'Rejected', decided_by: me()!.id, decided_at: isoNow(), decision_note: note }, 'approve', `${approve ? 'Approved' : 'Rejected'} attendance correction ${c.date}`);
  if (approve) {
    const emp = db().employees.find((e) => e.id === c.employee_id)!;
    const t = computeTimes(emp, c.clock_in, c.clock_out, db().settings.grace_minutes);
    const att = db().attendance.find((a) => a.employee_id === c.employee_id && a.date === c.date && !a.deleted_at);
    const patch = { kind: 'Present' as const, clock_in: c.clock_in, clock_out: c.clock_out, ...t, approval: 'Approved' as const, approved_by: me()!.id, approved_at: isoNow(), notes: `Corrected: ${c.reason}` };
    if (att) store.update('attendance', att.id, patch, 'update', `Attendance corrected ${c.date}`);
    else store.insert('attendance', { employee_id: c.employee_id, date: c.date, field_work: false, ...patch } as never, `Attendance created from correction ${c.date}`);
  }
}

/* ================= Jobs & scheduling ================= */
export type JobInput = Omit<Job, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'number'> & { id?: string; number?: string };
function checkJob(j: Pick<Job, 'id' | 'start_at' | 'end_at' | 'leader_id' | 'crew_ids' | 'vehicle_id' | 'equipment_ids' | 'status'>) {
  if (j.end_at <= j.start_at) fail('End time must be after start time.');
  if (['Cancelled', 'Rescheduled'].includes(j.status) || isDone(j.status)) return;
  const d = db();
  const conflicts = findConflicts(d, j);
  if (conflicts.length) {
    const name = (c: (typeof conflicts)[number]) =>
      c.kind === 'crew' ? d.employees.find((e) => e.id === c.refId)?.full_name : d.assets.find((a) => a.id === c.refId)?.name;
    fail('Double-booking blocked: ' + [...new Set(conflicts.map((c) => `${c.kind} “${name(c)}” is already on ${c.job.number}`))].join('; '));
  }
  for (const aid of [...(j.vehicle_id ? [j.vehicle_id] : []), ...j.equipment_ids]) {
    const a = d.assets.find((x) => x.id === aid);
    if (a && ['Retired', 'Damaged', 'Under Maintenance', 'Missing'].includes(a.status)) fail(`${a.name} is ${a.status.toLowerCase()} and cannot be assigned.`);
  }
}
export function saveJob(j: JobInput): Job {
  store.require('jobs.edit');
  checkJob({ ...j, id: j.id ?? '' });
  if (j.id) return store.update('jobs', j.id, j as never, 'update', `Updated job ${j.number}`);
  return store.insert('jobs', { ...j, number: store.nextNumber('JOB') } as never);
}
export function moveJob(id: string, startAt: string) {
  store.require('jobs.edit');
  const j = db().jobs.find((x) => x.id === id)!;
  if (!['Pending', 'Confirmed', 'Dispatch Checklist Pending', 'Rescheduled'].includes(j.status)) fail(`A job that is ${j.status.toLowerCase()} cannot be rescheduled.`);
  const len = Math.round((Date.parse(j.end_at + ':00Z') - Date.parse(j.start_at + ':00Z')) / 60000);
  const end = new Date(Date.parse(startAt + ':00Z') + len * 60000).toISOString().slice(0, 16);
  checkJob({ ...j, start_at: startAt, end_at: end });
  return store.update('jobs', id, { start_at: startAt, end_at: end, rescheduled_from: j.start_at, reminder_sent: false }, 'update', `Rescheduled ${j.number}: ${j.start_at} → ${startAt}`);
}
export function setJobStatus(id: string, status: JobStatus, note?: string) {
  const j = db().jobs.find((x) => x.id === id)!;
  if (!store.can('jobs.edit')) fail('Not permitted.');
  if (!['Pending', 'Confirmed', 'Cancelled', 'Rescheduled'].includes(status)) fail('That status is set by the job workflow inside the Job Card.');
  if (!['Pending', 'Confirmed', 'Dispatch Checklist Pending'].includes(j.status)) fail(`A job that is ${j.status.toLowerCase()} can only change status through the job workflow, or by an Operations Manager / Admin override with a reason.`);
  if (j.back_job_id && status === 'Confirmed') { const bj = db().back_jobs.find((b) => b.id === j.back_job_id); if (bj && ['Reported', 'Under Review', 'Rejected'].includes(bj.status)) fail(`Back job ${bj.number} must be approved by Admin / Operations before it can be scheduled.`); }
  const r = status === 'Cancelled' && note ? store.update('jobs', id, { status, damage_report: note }, 'update', `Cancelled ${j.number}: ${note}`) : store.update('jobs', id, { status }, 'update', `${j.number} → ${status}`);
  syncBackJobs();
  return r;
}
export function updateJobField(id: string, patch: Partial<Job>) {
  if (!store.can('jobs.complete') && !store.can('jobs.edit')) fail('Not permitted.');
  const j = db().jobs.find((x) => x.id === id)!;
  if (isDone(j.status) && !store.can('jobs.edit')) fail('Completed jobs are locked.');
  return store.update('jobs', id, patch as never, 'update', `Updated job ${j.number}`);
}
/* ================= Sales ================= */
export function saveQuotation(q: Omit<Quotation, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'number'> & { id?: string; number?: string }) {
  store.require('sales.edit');
  if (!q.items.length) fail('Add at least one line item.');
  const cur = q.id ? db().quotations.find((x) => x.id === q.id) : undefined;
  if (cur && cur.status !== 'Draft') fail('Only draft quotations can be edited. Duplicate it to revise.');
  if (q.id) return store.update('quotations', q.id, q as never);
  return store.insert('quotations', { ...q, number: store.nextNumber('QT') } as never);
}
export function setQuoteStatus(id: string, status: QuoteStatus, reason?: string) {
  store.require('sales.approve');
  const q = db().quotations.find((x) => x.id === id)!;
  const patch: Partial<Quotation> = { status };
  if (status === 'Sent') patch.sent_at = isoNow();
  if (status === 'Approved' || status === 'Rejected') { patch.decided_at = isoNow(); if (status === 'Rejected') patch.reject_reason = reason; }
  store.update('quotations', id, patch, status === 'Approved' ? 'approve' : 'update', `Quotation ${q.number} → ${status}`);
  if (q.inquiry_id) {
    const stage = status === 'Sent' ? 'Client Approval' : status === 'Approved' ? 'Booked' : status === 'Rejected' ? 'Lost' : undefined;
    if (stage) store.update('inquiries', q.inquiry_id, { stage, lost_reason: status === 'Rejected' ? reason : undefined } as never);
  }
}
export function duplicateQuotation(id: string) {
  store.require('sales.edit');
  const q = db().quotations.find((x) => x.id === id)!;
  const { id: _i, number: _n, created_at: _c, updated_at: _u, created_by: _b, sent_at: _s, decided_at: _d, reject_reason: _r, ...rest } = q; void [_i, _n, _c, _u, _b, _s, _d, _r];
  return store.insert('quotations', { ...rest, status: 'Draft', issue_date: today(), valid_until: addDays(today(), db().settings.quote_validity_days), number: store.nextNumber('QT') } as never, `Duplicated ${q.number}`);
}
export function moveInquiry(id: string, stage: import('./types').InquiryStage) {
  store.require('sales.edit');
  return store.update('inquiries', id, { stage } as never);
}

/* ================= Inventory ================= */
const item = (id: string) => db().items.find((i) => i.id === id)!;
function stockTx(t: Omit<StockTx, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'unit_cost' | 'date' | 'approval'> & Partial<StockTx>, summary: string) {
  const it = item(t.item_id);
  return store.insert('stock', { unit_cost: it.cost, date: today(), approval: 'Approved', ...t } as never, summary);
}
function needQty(qty: number) { if (!(qty > 0)) fail('Quantity must be greater than zero.'); }
export function receivePurchase(p: { item_id: string; qty: number; unit_cost: number; supplier: string; reference: string; location_id: string; batch_no?: string; expiry_date?: string; date?: string }) {
  store.require('inventory.edit'); needQty(p.qty);
  const it = item(p.item_id);
  const oh = Math.max(0, onHand(db(), it.id));
  const avg = oh + p.qty > 0 ? round2((oh * it.cost + p.qty * p.unit_cost) / (oh + p.qty)) : p.unit_cost;
  stockTx({ item_id: it.id, type: 'Purchase', qty: p.qty, unit_cost: p.unit_cost, location_id: p.location_id, supplier: p.supplier, reference: p.reference, batch_no: p.batch_no, expiry_date: p.expiry_date, date: p.date ?? today() }, `Received ${p.qty} ${it.uom} ${it.name} @ ${money(p.unit_cost)}`);
  store.update('items', it.id, { cost: avg, ...(p.batch_no ? { batch_no: p.batch_no } : {}), ...(p.expiry_date ? { expiry_date: p.expiry_date } : {}), supplier: p.supplier || it.supplier });
}
export function issueToJob(p: { item_id: string; qty: number; job_id: string; location_id: string }) {
  store.require('inventory.edit'); needQty(p.qty);
  const it = item(p.item_id);
  if (onHand(db(), it.id, p.location_id) < p.qty) fail(`Only ${onHand(db(), it.id, p.location_id)} ${it.uom} of ${it.name} on hand at that location.`);
  const j = db().jobs.find((x) => x.id === p.job_id);
  stockTx({ item_id: it.id, type: 'Issue to Job', qty: -p.qty, location_id: p.location_id, job_id: p.job_id }, `Issued ${p.qty} ${it.uom} ${it.name} to ${j?.number}`);
}
export function returnFromJob(p: { item_id: string; qty: number; job_id: string; location_id: string }) {
  store.require('inventory.edit'); needQty(p.qty);
  const issued = -sum(db().stock.filter((t) => t.approval === 'Approved' && t.job_id === p.job_id && t.item_id === p.item_id && ['Issue to Job', 'Return from Job'].includes(t.type)), (t) => t.qty);
  if (p.qty > issued) fail(`Only ${issued} were issued to this job.`);
  stockTx({ item_id: p.item_id, type: 'Return from Job', qty: p.qty, location_id: p.location_id, job_id: p.job_id }, `Returned ${p.qty} ${item(p.item_id).name} from job`);
}
export function wasteMaterial(p: { item_id: string; qty: number; location_id: string; reason: string; job_id?: string }) {
  store.require('inventory.edit'); needQty(p.qty);
  if (!p.reason.trim()) fail('A reason is required.');
  if (onHand(db(), p.item_id, p.location_id) < p.qty) fail('Not enough stock at that location.');
  stockTx({ item_id: p.item_id, type: 'Damaged / Wasted', qty: -p.qty, location_id: p.location_id, job_id: p.job_id, reason: p.reason }, `Wasted ${p.qty} ${item(p.item_id).name}: ${p.reason}`);
}
export function requestAdjustment(p: { item_id: string; qty: number; location_id: string; reason: string }) {
  store.require('inventory.edit');
  if (!p.qty) fail('Adjustment quantity cannot be zero.');
  if (!p.reason.trim()) fail('A reason is required.');
  stockTx({ item_id: p.item_id, type: 'Adjustment', qty: p.qty, location_id: p.location_id, reason: p.reason, approval: 'Pending' }, `Adjustment requested: ${p.qty > 0 ? '+' : ''}${p.qty} ${item(p.item_id).name}`);
}
export function decideAdjustment(txId: string, approve: boolean) {
  store.require('inventory.approve');
  const t = db().stock.find((x) => x.id === txId)!;
  if (t.approval !== 'Pending') fail('Already decided.');
  if (t.created_by === me()!.id && store.role !== 'owner') fail('Someone else must approve your adjustment.');
  if (approve && t.qty < 0 && onHand(db(), t.item_id, t.location_id) + t.qty < 0) fail('Approving would make stock negative.');
  store.update('stock', txId, { approval: approve ? 'Approved' : 'Rejected', approved_by: me()!.id } as never, approve ? 'approve' : 'update', `${approve ? 'Approved' : 'Rejected'} stock ${t.type.toLowerCase()}`);
}
export function transferStock(p: { item_id: string; qty: number; from: string; to: string }) {
  store.require('inventory.edit'); needQty(p.qty);
  if (p.from === p.to) fail('Choose two different locations.');
  if (onHand(db(), p.item_id, p.from) < p.qty) fail('Not enough stock at the source location.');
  const tid = uid();
  stockTx({ item_id: p.item_id, type: 'Transfer Out', qty: -p.qty, location_id: p.from, transfer_id: tid }, `Transfer out ${p.qty} ${item(p.item_id).name}`);
  stockTx({ item_id: p.item_id, type: 'Transfer In', qty: p.qty, location_id: p.to, transfer_id: tid }, `Transfer in ${p.qty} ${item(p.item_id).name}`);
}
export function physicalCount(p: { item_id: string; location_id: string; counted: number }) {
  store.require('inventory.edit');
  const sys = onHand(db(), p.item_id, p.location_id);
  const diff = round2(p.counted - sys);
  if (!diff) return { variance: 0 };
  stockTx({ item_id: p.item_id, type: 'Count Variance', qty: diff, location_id: p.location_id, approval: 'Pending', reason: `Physical count ${p.counted} vs system ${sys}` }, `Count variance ${diff} ${item(p.item_id).name}`);
  return { variance: diff };
}
export function reverseStockTx(txId: string, reason: string) {
  store.require('inventory.approve');
  const t = db().stock.find((x) => x.id === txId)!;
  if (db().stock.some((x) => x.reversal_of === txId)) fail('This transaction has already been reversed.');
  if (t.reversal_of) fail('A reversal cannot itself be reversed.');
  if (t.approval !== 'Approved') fail('Only approved transactions can be reversed.');
  if (!reason.trim()) fail('A reason is required.');
  if (onHand(db(), t.item_id, t.location_id) - t.qty < 0) fail('Reversal would make stock negative.');
  stockTx({ item_id: t.item_id, type: 'Adjustment', qty: -t.qty, location_id: t.location_id, job_id: t.job_id, reversal_of: t.id, reason: `Reversal: ${reason}`, unit_cost: t.unit_cost }, `Reversed stock transaction (${t.type})`);
}
export function requestMaterials(jobId: string, lines: { item_id: string; qty: number }[], note?: string) {
  store.require('inventory.request');
  const l = lines.filter((x) => x.qty > 0);
  if (!l.length) fail('Add at least one material.');
  return store.insert('requests', { job_id: jobId, requested_by: store.user?.employee_id ?? me()!.id, lines: l, status: 'Pending', note } as never, 'Material request submitted');
}
export function decideRequest(id: string, approve: boolean) {
  store.require('inventory.approve');
  const r = db().requests.find((x) => x.id === id)!;
  if (r.status !== 'Pending') fail('Already decided.');
  if (approve) {
    for (const l of r.lines) {
      const it = item(l.item_id);
      if (onHand(db(), it.id, it.location_id) < l.qty) fail(`Insufficient stock for ${it.name}.`);
    }
    for (const l of r.lines) issueToJob({ item_id: l.item_id, qty: l.qty, job_id: r.job_id, location_id: item(l.item_id).location_id });
  }
  store.update('requests', id, { status: approve ? 'Issued' : 'Rejected', decided_by: me()!.id } as never, approve ? 'approve' : 'update', `Material request ${approve ? 'issued' : 'rejected'}`);
}

/* ================= Assets ================= */
const asset = (id: string) => db().assets.find((a) => a.id === id)!;
export function requestCheckout(p: { asset_id: string; job_id: string; responsible_id: string; expected_return: string; note?: string }) {
  store.require('assets.request');
  const a = asset(p.asset_id); const job = db().jobs.find((j) => j.id === p.job_id)!;
  if (['Retired', 'Damaged', 'Under Maintenance', 'Missing'].includes(a.status)) fail(`${a.name} is ${a.status.toLowerCase()} and cannot be requested.`);
  const clash = db().checkouts.find((c) => c.asset_id === p.asset_id && c.job_id !== p.job_id && ['Released', 'Requested'].includes(c.status) && c.status === 'Released');
  if (clash) fail(`${a.name} is currently checked out to another job.`);
  const other = db().jobs.find((j) => j.id !== job.id && !j.deleted_at && isOpen(j.status) && (j.equipment_ids.includes(a.id) || j.vehicle_id === a.id) && overlaps(j.start_at, j.end_at, job.start_at, job.end_at));
  if (other) fail(`${a.name} is already assigned to ${other.number} at that time.`);
  if (db().checkouts.some((c) => c.asset_id === p.asset_id && c.job_id === p.job_id && ['Requested', 'Released'].includes(c.status))) fail('This asset is already requested or checked out for that job.');
  return store.insert('checkouts', { ...p, requested_by: store.user?.employee_id ?? me()!.id, status: 'Requested' } as never, `Requested ${a.name} for ${job.number}`);
}
export function releaseCheckout(id: string, p: { condition: Condition; meter?: number }) {
  store.require('assets.approve');
  return performRelease(id, p);
}
/** Release without a permission check — used by the job workflow when an approver completes the HQ checklist. */
export function performRelease(id: string, p: { condition: Condition; meter?: number }) {
  const c = db().checkouts.find((x) => x.id === id)!; const a = asset(c.asset_id);
  if (c.status !== 'Requested') fail('Only requested items can be released.');
  if (['Retired', 'Damaged', 'Under Maintenance', 'Missing'].includes(a.status)) fail(`${a.name} is ${a.status.toLowerCase()}.`);
  const active = db().checkouts.find((x) => x.asset_id === c.asset_id && x.status === 'Released');
  if (active) fail(`${a.name} is still checked out to ${db().jobs.find((j) => j.id === active.job_id)?.number ?? 'another job'}. Return it first – equipment can never be on two jobs at once.`);
  store.update('checkouts', id, { status: 'Released', approved_by: me()!.id, out_at: nowLocal(), out_condition: p.condition, out_meter: p.meter }, 'approve', `Released ${a.name}`);
  store.update('assets', a.id, { status: 'In Use', custodian_id: c.responsible_id, location: 'On site', condition: p.condition, ...(p.meter ? { meter_reading: p.meter } : {}) });
}
export function rejectCheckout(id: string, note: string) {
  store.require('assets.approve');
  store.update('checkouts', id, { status: 'Rejected', approved_by: me()!.id, note }, 'update', 'Equipment request rejected');
}
export function returnCheckout(id: string, p: { condition: Condition; meter?: number; damage_notes: string; missing: string }) {
  store.require('assets.request');
  return performReturn(id, p);
}
export function performReturn(id: string, p: { condition: Condition; meter?: number; damage_notes: string; missing: string; repair?: boolean }): { ticketId?: string } {
  const c = db().checkouts.find((x) => x.id === id)!; const a = asset(c.asset_id);
  if (c.status !== 'Released') fail('This item is not checked out.');
  const damaged = p.condition === 'Damaged' || p.condition === 'Poor' || !!p.damage_notes.trim();
  if (damaged && !p.damage_notes.trim()) fail('Describe the damage.');
  if (p.meter !== undefined && c.out_meter !== undefined && p.meter < c.out_meter) fail('Return meter reading cannot be lower than the reading at release.');
  store.update('checkouts', id, { status: 'Returned', in_at: nowLocal(), in_condition: p.condition, in_meter: p.meter, damage_notes: p.damage_notes, missing_accessories: p.missing }, 'update', `Returned ${a.name}`);
  store.update('assets', a.id, {
    status: damaged && p.repair !== false ? 'Damaged' : 'Available', condition: damaged && p.repair === false ? 'Fair' : p.condition, location: damaged && p.repair !== false ? 'Workshop' : (a.category === 'Vehicle' ? 'Yard' : 'Main Warehouse'),
    custodian_id: undefined, ...(p.meter ? { meter_reading: p.meter } : {}),
  });
  let ticketId: string | undefined;
  if (damaged && p.repair !== false) {
    ticketId = (store.insert('tickets', { asset_id: a.id, source: 'Damage report', checkout_id: id, description: `${p.damage_notes}${p.missing ? ` | Missing: ${p.missing}` : ''}`, status: 'Open', opened_on: today(), cost: 0 } as never, `Maintenance ticket auto-created for ${a.name}`) as { id: string }).id;
  }
  return { ticketId };
}
export function updateTicket(id: string, patch: Partial<MaintenanceTicket>) {
  store.require('assets.edit');
  const t = db().tickets.find((x) => x.id === id)!; const a = asset(t.asset_id);
  if (patch.status === 'In Repair') store.update('assets', a.id, { status: 'Under Maintenance', location: 'Workshop' });
  if (patch.status === 'Closed') {
    const cost = patch.cost ?? t.cost;
    patch.closed_on = today();
    store.update('assets', a.id, { status: 'Available', condition: 'Good', last_maintenance: today(), location: 'Main Warehouse' });
    if (cost > 0 && !db().expenses.some((e) => e.source === 'maintenance' && e.source_id === id)) {
      store.insert('expenses', { date: today(), payee: patch.vendor ?? t.vendor ?? 'Repair vendor', category: 'Equipment Repair', branch_id: db().branches[0].id, amount: cost, vat: 0, wht: 0, method: 'Cash', approval: 'Pending', paid: false, petty_cash: false, source: 'maintenance', source_id: id, notes: `${a.code} ${a.name}: ${t.description}` } as never, `Repair expense drafted for ${a.name}`);
    }
  }
  return store.update('tickets', id, patch as never);
}
export function scheduleMaintenance(assetId: string, description: string) {
  store.require('assets.edit');
  return store.insert('tickets', { asset_id: assetId, source: 'Manual', description, status: 'Open', opened_on: today(), cost: 0 } as never);
}
export const isOverdue = (c: Checkout) => c.status === 'Released' && c.expected_return < nowLocal();

/* ================= Finance ================= */
export function saveInvoice(i: Omit<Invoice, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'number'> & { id?: string; number?: string }) {
  store.require('invoices.edit');
  if (!i.items.length) fail('Add at least one line item.');
  if (i.id) { const cur = db().invoices.find((x) => x.id === i.id)!; if (cur.status !== 'Draft') fail('Approved invoices are locked.'); return store.update('invoices', i.id, i as never); }
  return store.insert('invoices', { ...i, number: store.nextNumber('INV') } as never);
}
export function invoiceFromJob(jobId: string): Invoice {
  store.require('invoices.edit');
  const j = db().jobs.find((x) => x.id === jobId)!;
  if (!isDone(j.status)) fail('Only jobs with completed work can be invoiced.');
  if (db().invoices.some((i) => i.job_id === jobId && i.status !== 'Reversed' && !i.deleted_at)) fail('This job already has an invoice.');
  { const bj = j.back_job_id ? db().back_jobs.find((b) => b.id === j.back_job_id) : undefined; if (bj?.charge_type === 'No Charge') fail(`${bj.number} is a no-charge back job: there is nothing to bill. Its cost is tracked against the original job.`); }
  if (db().workflows.some((w) => w.job_id === jobId && w.conf_mode === 'declined' && !w.deleted_at)) fail('The client declined this job — there is nothing to invoice.');
  const open = currentRequest(db(), jobId);
  if (open && open.status !== 'Applied') fail(`Discount request ${open.number} is ${open.status === 'Approved' ? 'approved but not yet applied to the final bill' : 'waiting for Admin approval'}. Settle it before invoicing.`);
  const client = db().clients.find((c) => c.id === j.client_id)!;
  const q = db().quotations.find((x) => x.id === j.quotation_id);
  // approved variations are billed as extra lines; the original quotation lines are copied unchanged
  const fc = finalContract(db(), j);
  const varItems = db().variations.filter((v) => v.job_id === jobId && v.status === 'Approved' && !v.deleted_at)
    .flatMap((v) => v.items.map((it, k) => ({ ...it, description: `${v.number}: ${it.description}`, discount: it.discount + (k === 0 ? v.discount : 0) })));
  const wfr = db().workflows.find((w) => w.job_id === jobId && !w.deleted_at);
  const approvedVars = db().variations.filter((v) => v.job_id === jobId && v.status === 'Approved' && !v.deleted_at).map((v) => v.number);
  const notes = [approvedVars.length ? `Includes approved additional work: ${approvedVars.join(', ')}.` : '', wfr?.conf_deposit ? `Deposit / prior payment recorded at the site conforme: ${money(wfr.conf_deposit)}${wfr.conf_deposit_note ? ` (${wfr.conf_deposit_note})` : ''} — record the payment against this invoice.` : ''].filter(Boolean).join(' ');
  const pc = db().payment_confirmations.find((x) => x.job_id === jobId && !x.deleted_at);
  const dr = appliedDiscount(db(), jobId);
  const mode = q?.vat_mode ?? (client.vat_status === 'VAT-registered' ? 'exclusive' : 'none'), vrate = db().settings.vat_rate;
  // The management-approved discount is VAT-inclusive; in an exclusive invoice it is taken off the ex-VAT subtotal so the invoice total drops by exactly that amount.
  const grantedNet = dr ? (mode === 'exclusive' ? round2((dr.approved_amount ?? 0) / (1 + vrate / 100)) : dr.approved_amount ?? 0) : 0;
  const drNote = dr ? `Discount ${dr.number} approved by TopMop management (${money(dr.approved_amount ?? 0)}) and reflected in the final agreed amount.` : '';
  return store.allowDiscount(() => saveInvoice({
    notes: [notes, drNote, pc ? `Client payment arrangement confirmed on site: ${paymentPlanLabel(pc)}.${pc.note ? ` Note: ${pc.note}` : ''}` : ''].filter(Boolean).join(' ') || undefined, client_id: j.client_id, site_id: j.site_id, job_id: j.id, quotation_id: q?.id, issue_date: today(), due_date: pc?.due_date && pc.due_date >= today() ? pc.due_date : addDays(today(), db().settings.payment_terms_days),
    items: [...(q?.items ?? [{ service_code: j.service_codes[0], description: j.scope, qty: 1, unit: 'lot', rate: fc.originalNet, discount: 0 }]), ...varItems],
    vat_mode: mode, vat_rate: vrate, discount: round2((q?.discount ?? 0) + grantedNet), discount_request_id: dr?.id, discount_granted: dr?.approved_amount,
    withholding_rate: client.withholding_rate, status: 'Draft', branch_id: j.branch_id,
  }) as Invoice);
}
/** Money the Team Leader collected on site becomes a Pending Verification payment on the invoice (never Verified by the Team Leader). Runs as soon as an approved invoice exists. */
export function settleConfirmation(jobId: string) {
  const c = db().payment_confirmations.find((x) => x.job_id === jobId && !x.deleted_at);
  if (!c || c.collection !== 'Received' || c.payment_id || c.method === 'Terms / To Be Billed') return;
  const inv = db().invoices.find((i) => i.job_id === jobId && i.status === 'Approved' && !i.deleted_at);
  if (!inv) return;
  const avail = invoiceLedger(db(), inv).available;
  const amount = round2(Math.min(c.expected_today, avail));
  if (amount <= 0.005) return;
  const who = db().users.find((u) => u.id === c.confirmed_by)?.name ?? 'Team Leader';
  const client = db().clients.find((x) => x.id === c.client_id);
  const m = c.method as PayMethod;
  const input: PaymentInput = { invoice_id: inv.id, method: m, amount, received_by: who, paid_at: c.confirmed_at.slice(0, 16),
    ...(m === 'GCash' ? { gcash_ref: c.gcash_ref, sender: client?.contact_person || client?.name } : {}),
    ...(m === 'Bank Transfer' ? { bank_name: c.bank_name, reference: c.transfer_ref, transfer_date: c.confirmed_at.slice(0, 10) } : {}),
    ...(m === 'Cheque' ? { bank_name: c.bank_name, cheque_no: c.cheque_no, cheque_date: c.cheque_date, cheque_status: 'Pending Clearance' as ChequeStatus } : {}) };
  checkPayment(input);
  const when = c.confirmed_at.slice(0, 16);
  const pay = store.insert('payments', { ...payFields(input), notes: ['Collected on site — confirmed by the Team Leader.', c.note].filter(Boolean).join(' '), invoice_id: inv.id, client_id: inv.client_id, job_id: jobId, confirmation_id: c.id, date: when.slice(0, 10), paid_at: when, receipt_no: store.nextNumber('OR'), wht_amount: 0, status: 'Pending Verification' } as never,
    `Payment ${money(amount)} (${m}) collected on site for ${inv.number} — pending Finance verification`) as Payment;
  store.system('payment_confirmations', c.id, { payment_id: pay.id } as never, 'Payment entry created from the Team Leader’s payment confirmation');
}
export function approveInvoice(id: string) {
  store.require('invoices.approve');
  const i = db().invoices.find((x) => x.id === id)!;
  if (i.status !== 'Draft') fail('Only draft invoices can be approved.');
  const r = store.update('invoices', id, { status: 'Approved', approved_by: me()!.id, approved_at: isoNow() }, 'approve', `Approved invoice ${i.number} (${money(invoiceTotals(i).total)})`);
  if (i.job_id) settleConfirmation(i.job_id);      // money the Team Leader collected on site now lands on the invoice, awaiting verification
  runAutomations();
  return r;
}
export function reverseInvoice(id: string, reason: string) {
  store.require('invoices.approve');
  const i = db().invoices.find((x) => x.id === id)!;
  if (i.status !== 'Approved') fail('Only approved invoices can be reversed.');
  if (!reason.trim()) fail('A reason is required.');
  if (db().payments.some((p) => p.invoice_id === id && !p.reversed)) fail('Reverse the payments on this invoice first.');
  return store.update('invoices', id, { status: 'Reversed', reversal_reason: reason, reversed_at: isoNow() }, 'reverse', `Reversed invoice ${i.number}: ${reason}`);
}
/* ---- Payments: recorded as Pending Verification; only Admin / Finance verify. Verified money (and Cleared cheques) is what counts. ---- */
export interface PaymentInput {
  invoice_id: string; method: PayMethod; amount: number; wht_amount?: number; paid_at?: string; received_by: string; notes?: string; reference?: string;
  bank_name?: string; transfer_date?: string;                     // Bank Transfer / Cheque
  cheque_no?: string; cheque_date?: string; cheque_status?: ChequeStatus;
  gcash_ref?: string; sender?: string;
  verify_now?: boolean;
}
export const PAY_METHODS: PayMethod[] = ['Cash', 'Bank Transfer', 'Cheque', 'GCash'];
export const CHEQUE_STATUSES: ChequeStatus[] = ['Pending Clearance', 'Deposited', 'Cleared', 'Bounced'];
function checkPayment(p: PaymentInput) {
  if (!PAY_METHODS.includes(p.method)) fail('Choose the payment method.');
  if (!(p.amount > 0)) fail('Enter the amount received.');
  if ((p.wht_amount ?? 0) < 0) fail('Withholding tax cannot be negative.');
  if (!p.received_by.trim()) fail('Enter who received the payment.');
  if (p.paid_at && p.paid_at.slice(0, 16) > nowLocal().slice(0, 16)) fail('The payment date and time cannot be in the future.');
  if (p.method === 'Bank Transfer') {
    if (!p.bank_name?.trim()) fail('Enter the bank name.');
    if (!p.reference?.trim()) fail('Enter the account / reference number.');
    if (!p.transfer_date) fail('Enter the transfer date.');
  }
  if (p.method === 'Cheque') {
    if (!p.bank_name?.trim()) fail('Enter the bank name.');
    if (!p.cheque_no?.trim()) fail('Enter the cheque number.');
    if (!p.cheque_date) fail('Enter the cheque date.');
    if (!p.cheque_status) fail('Choose the cheque clearing status.');
  }
  if (p.method === 'GCash') {
    if (!p.gcash_ref?.trim()) fail('Enter the GCash reference number.');
    if (!p.sender?.trim()) fail('Enter the sender name or mobile number.');
  }
}
const payFields = (p: PaymentInput) => ({
  amount: round2(p.amount), wht_amount: round2(p.wht_amount ?? 0), method: p.method, received_by: p.received_by.trim(), notes: p.notes?.trim() || undefined,
  reference: (p.method === 'Cheque' ? p.cheque_no : p.method === 'GCash' ? p.gcash_ref : p.reference)?.trim() ?? '',
  bank_name: p.method === 'Bank Transfer' || p.method === 'Cheque' ? p.bank_name?.trim() : undefined, transfer_date: p.method === 'Bank Transfer' ? p.transfer_date : undefined,
  cheque_no: p.method === 'Cheque' ? p.cheque_no?.trim() : undefined, cheque_date: p.method === 'Cheque' ? p.cheque_date : undefined, cheque_status: p.method === 'Cheque' ? p.cheque_status : undefined,
  gcash_ref: p.method === 'GCash' ? p.gcash_ref?.trim() : undefined, sender: p.method === 'GCash' ? p.sender?.trim() : undefined,
});
export function recordPayment(p: PaymentInput): Payment {
  const canAny = store.can('payments.record') || store.can('invoices.edit');
  const canCash = store.can('payments.record_cash');
  if (!canAny && !canCash) fail('Your role cannot record payments.');
  if (!canAny && p.method !== 'Cash') fail('Team Leaders can only record a cash payment (it is saved as Pending Verification).');
  const inv = db().invoices.find((x) => x.id === p.invoice_id) ?? fail('Invoice not found.');
  if (inv.status !== 'Approved') fail('Payments can only be recorded on approved invoices.');
  checkPayment(p);
  const lg = invoiceLedger(db(), inv);
  const total = round2(p.amount + (p.wht_amount ?? 0));
  if (total > lg.available + 0.005) fail(`Payment exceeds the remaining balance of ${money(lg.available)}${lg.waiting ? ` (${money(lg.waiting)} more is already recorded and waiting for verification / clearing)` : ''}.`);
  const when = p.paid_at?.slice(0, 16) || nowLocal().slice(0, 16);
  const verifyNow = !!p.verify_now && store.can('payments.verify');
  const now = isoNow();
  const row = store.insert('payments', {
    ...payFields(p), invoice_id: inv.id, client_id: inv.client_id, job_id: inv.job_id, date: when.slice(0, 10), paid_at: when, receipt_no: store.nextNumber('OR'),
    status: verifyNow ? 'Verified' : 'Pending Verification', ...(verifyNow ? { verified_by: me()?.id, verified_at: now } : {}),
  } as never, `Payment ${money(p.amount)} (${p.method}) recorded on ${inv.number}${verifyNow ? '' : ' — pending verification'}`) as Payment;
  runAutomations();
  return row;
}
const payOf = (id: string) => db().payments.find((x) => x.id === id) ?? fail('Payment not found.');
const payIs = (p: Payment) => p.status ?? 'Verified';
export function verifyPayment(id: string) {
  store.require('payments.verify');
  const p = payOf(id);
  if (p.reversed || p.deleted_at) fail('This payment is no longer active.');
  if (payIs(p) === 'Verified') fail('This payment is already verified.');
  const r = store.update('payments', id, { status: 'Verified', verified_by: me()?.id, verified_at: isoNow(), reject_reason: undefined } as never, 'approve', `Verified payment ${p.receipt_no} (${money(p.amount)} ${p.method})`);
  runAutomations();
  return r;
}
export function rejectPayment(id: string, reason: string) {
  store.require('payments.verify');
  const p = payOf(id);
  if (payIs(p) === 'Verified') fail('A verified payment cannot be rejected — reverse it with a reason instead.');
  if (!reason.trim()) fail('A reason is required.');
  const r = store.update('payments', id, { status: 'Rejected', verified_by: me()?.id, verified_at: isoNow(), reject_reason: reason.trim() } as never, 'update', `Rejected payment ${p.receipt_no}: ${reason.trim()}`);
  runAutomations();
  return r;
}
export function setChequeStatus(id: string, status: ChequeStatus) {
  store.require('payments.verify');
  const p = payOf(id);
  if (p.method !== 'Cheque') fail('Only cheque payments have a clearing status.');
  if (p.reversed) fail('This payment was reversed.');
  const r = store.update('payments', id, { cheque_status: status, cleared_at: status === 'Cleared' ? isoNow() : undefined } as never, 'update', `Cheque ${p.cheque_no} (${p.receipt_no}) → ${status}`);
  runAutomations();
  return r;
}
/** Edit a payment that is still waiting for verification (verified payments are locked — reverse them instead). */
export function editPayment(id: string, p: PaymentInput) {
  store.require('payments.verify');
  const cur = payOf(id);
  if (payIs(cur) === 'Verified') fail('A verified payment is locked. Reverse it with a reason and record a new one.');
  checkPayment(p);
  const inv = db().invoices.find((x) => x.id === cur.invoice_id)!;
  const lg = invoiceLedger(db(), inv);
  const others = cur.deleted_at || cur.reversed || payIs(cur) === 'Rejected' ? 0 : cur.amount + cur.wht_amount;
  if (round2(p.amount + (p.wht_amount ?? 0)) > lg.available + others + 0.005) fail(`Payment exceeds the remaining balance of ${money(lg.available + others)}.`);
  const when = p.paid_at?.slice(0, 16) || cur.paid_at || nowLocal().slice(0, 16);
  return store.update('payments', id, { ...payFields(p), date: when.slice(0, 10), paid_at: when, status: 'Pending Verification' } as never, 'update', `Edited payment ${cur.receipt_no}`);
}
export function reversePayment(id: string, reason: string) {
  store.require('payments.verify');
  const p = payOf(id);
  if (p.reversed) fail('Already reversed.');
  if (payIs(p) !== 'Verified') fail('Only verified payments are reversed. Reject or delete a pending one instead.');
  if (!reason.trim()) fail('A reason is required.');
  const r = store.update('payments', id, { reversed: true, reversal_reason: reason.trim() }, 'reverse', `Reversed payment ${p.receipt_no}: ${reason.trim()}`);
  runAutomations();
  return r;
}
/** Remove a payment entry that never counted (pending or rejected). It stays in the audit log. */
export function deletePayment(id: string, reason: string) {
  store.require('payments.verify');
  const p = payOf(id);
  if (payIs(p) === 'Verified' || p.reversed) fail('A verified payment cannot be deleted — reverse it instead.');
  if (!reason.trim()) fail('A reason is required.');
  store.withReason(reason.trim(), () => store.remove('payments', id));
  runAutomations();
}
export function saveExpense(e: Omit<Expense, 'id' | 'created_at' | 'updated_at' | 'created_by'> & { id?: string }) {
  store.require('expenses.edit');
  if (!(e.amount > 0)) fail('Enter an amount.');
  if (e.vat > e.amount) fail('VAT cannot exceed the amount.');
  if (e.id) { const cur = db().expenses.find((x) => x.id === e.id)!; if (cur.approval === 'Approved') fail('Approved expenses are locked. Reverse and re-enter.'); return store.update('expenses', e.id, e as never); }
  return store.insert('expenses', e as never);
}
export function decideExpense(id: string, approve: boolean) {
  store.require('expenses.approve');
  const e = db().expenses.find((x) => x.id === id)!;
  if (e.approval !== 'Pending') fail('Already decided.');
  store.update('expenses', id, { approval: approve ? 'Approved' : 'Rejected', approved_by: me()!.id }, approve ? 'approve' : 'update', `${approve ? 'Approved' : 'Rejected'} expense ${e.payee} ${money(e.amount)}`);
}
export function reverseExpense(id: string, reason: string) {
  store.require('expenses.approve');
  const e = db().expenses.find((x) => x.id === id)!;
  if (e.source === 'payroll') fail('Payroll expenses are managed from the payroll module.');
  if (!reason.trim()) fail('A reason is required.');
  store.update('expenses', id, { reversed: true, notes: `${e.notes ?? ''} [Reversed: ${reason}]`.trim() }, 'reverse', `Reversed expense ${e.payee}`);
}
export function pettyCash(kind: 'Replenishment' | 'Disbursement', amount: number, description: string) {
  store.require('expenses.edit');
  if (!(amount > 0)) fail('Enter an amount.');
  return store.insert('petty', { date: today(), kind, amount, description } as never);
}
export function pettyBalance() {
  return sum(db().petty.filter((p) => !p.deleted_at), (p) => (p.kind === 'Replenishment' ? p.amount : -p.amount));
}

/* ================= Payroll ================= */
export function createPeriod(p: { label: string; start: string; end: string; type: import('./types').PayrollType }) {
  store.require('payroll.edit');
  if (p.end < p.start) fail('End date is before start date.');
  const clash = db().periods.find((x) => !x.deleted_at && x.type === p.type && x.start <= p.end && p.start <= x.end);
  if (clash) fail(`Overlaps existing ${p.type} period “${clash.label}”.`);
  return store.insert('periods', { ...p, status: 'Draft', locked: false } as never);
}
export function generateRun(periodId: string) {
  store.require('payroll.edit');
  const per = db().periods.find((x) => x.id === periodId)!;
  if (per.status !== 'Draft') fail('Only draft payroll can be recalculated.');
  const { lines, pending } = buildPayrollLines(db(), per);
  const existing = db().runs.find((r) => r.period_id === periodId);
  if (existing) store.update('runs', existing.id, { lines }, 'update', `Recalculated payroll ${per.label}`);
  else store.insert('runs', { period_id: periodId, lines } as never, `Generated payroll ${per.label}`);
  return { pending, employees: lines.length };
}
export function submitPayroll(periodId: string) {
  store.require('payroll.edit');
  const per = db().periods.find((x) => x.id === periodId)!;
  if (per.status !== 'Draft') fail('Not a draft.');
  const run = db().runs.find((r) => r.period_id === periodId);
  if (!run) fail('Generate the payroll first.');
  const pend = db().attendance.filter((a) => !a.deleted_at && a.approval === 'Pending' && a.date >= per.start && a.date <= per.end && db().employees.find((e) => e.id === a.employee_id)?.payroll_type === per.type);
  if (pend.length) fail(`${pend.length} attendance record(s) in this period are still pending approval. Approve them, then recalculate.`);
  store.update('periods', periodId, { status: 'For Approval', submitted_by: me()!.id }, 'update', `Submitted payroll ${per.label} for approval`);
}
export function returnPayroll(periodId: string, note: string) {
  store.require('payroll.approve');
  store.update('periods', periodId, { status: 'Draft' }, 'update', `Returned payroll to draft: ${note}`);
}
export function approvePayroll(periodId: string) {
  store.require('payroll.approve');
  const per = db().periods.find((x) => x.id === periodId)!;
  if (per.status !== 'For Approval') fail('Payroll must be submitted for approval first.');
  const run = db().runs.find((r) => r.period_id === periodId)!;
  const gross = round2(sum(run.lines, (l) => l.gross));
  if (!(gross > 0)) fail('This payroll has no earnings to approve. Check that attendance has been approved for the period.');
  const exp = store.insert('expenses', { date: per.end, payee: `Payroll – ${per.label}`, category: 'Payroll', branch_id: db().branches[0].id, amount: gross, vat: 0, wht: 0, method: 'Bank Transfer', approval: 'Approved', approved_by: me()!.id, paid: false, petty_cash: false, source: 'payroll', source_id: periodId, notes: `Gross payroll for ${run.lines.length} employees` } as never) as Expense;
  store.update('periods', periodId, { status: 'Approved', approved_by: me()!.id, approved_at: isoNow(), expense_id: exp.id }, 'approve', `Approved payroll ${per.label}`);
}
export function finalizePayroll(periodId: string) {
  store.require('payroll.approve');
  const per = db().periods.find((x) => x.id === periodId)!;
  if (per.status !== 'Approved') fail('Approve the payroll before finalizing.');
  const run = db().runs.find((r) => r.period_id === periodId)!;
  for (const l of run.lines) for (const aid of l.adjustment_ids) {
    const a = db().adjustments.find((x) => x.id === aid);
    if (a && a.balance !== undefined && a.period_id == null) {
      const bal = round2(Math.max(0, a.balance - Math.min(a.amount, a.balance)));
      store.update('adjustments', aid, { balance: bal, ...(bal === 0 && ['Cash Advance', 'Loan', 'Other Deduction'].includes(a.kind) ? { active: false } : {}) });
    }
  }
  if (per.expense_id) store.update('expenses', per.expense_id, { paid: true }, 'update', `Payroll ${per.label} marked paid`);
  store.update('periods', periodId, { status: 'Finalized', locked: true, finalized_by: me()!.id, finalized_at: isoNow() }, 'lock', `Finalized & locked payroll ${per.label}`);
}
export function saveAdjustment(a: Omit<PayrollAdjustment, 'id' | 'created_at' | 'updated_at' | 'created_by'> & { id?: string }) {
  store.require('payroll.edit');
  if (!(a.amount > 0)) fail('Enter an amount.');
  if (a.id) return store.update('adjustments', a.id, a as never);
  return store.insert('adjustments', a as never);
}

/* ================= Automations & notifications ================= */
const addMinutes = (local: string, m: number) => new Date(Date.parse(local + ':00Z') + m * 60000).toISOString().slice(0, 16);
const daysTo = (d: string) => Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(today() + 'T00:00:00Z')) / 86400000);

/** Recompute the in-app notification set from current data. Queues external channels per Settings. */
/** Keep each Back Job's status in step with its linked follow-up job (Approved → Scheduled → In Progress → Resolved → Closed) and mark a chargeable quotation approved once the client has signed. */
export function syncBackJobs() {
  for (const b of db().back_jobs) {
    if (b.deleted_at) continue;
    const job = db().jobs.find((j) => j.id === b.job_id);
    const st = backJobStatusFor(b, job);
    if (st !== b.status) store.system('back_jobs', b.id, { status: st, ...(st === 'Resolved' ? { resolved_at: isoNow() } : {}), ...(st === 'Closed' ? { closed_at: isoNow(), resolved_at: b.resolved_at ?? isoNow() } : {}) } as never, `${b.number}: ${b.status} → ${st}`);
    const wf = db().workflows.find((w) => w.job_id === b.job_id && !w.deleted_at);
    const q = b.quotation_id ? db().quotations.find((x) => x.id === b.quotation_id) : undefined;
    if (q && q.status !== 'Approved' && wf?.conf_mode === 'approval' && wf.conf_at) store.system('quotations', q.id, { status: 'Approved', decided_at: isoNow() } as never, `${q.number} approved by the client for back job ${b.number}`);
  }
}
export function runAutomations() {
  syncBackJobs();
  const d = db(); const s = d.settings; const now = nowLocal(); const t = today();
  const list: Omit<Notification, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'read_by'>[] = [];
  const add = (key: string, type: string, title: string, body: string, severity: Notification['severity'], link: string, roles: Notification['for_roles'], external = false) => {
    const ch: Notification['channels_queued'] = external ? [...(s.channels.email ? ['email' as const] : []), ...(s.channels.sms ? ['sms' as const] : []), ...(s.channels.whatsapp ? ['whatsapp' as const] : [])] : [];
    list.push({ key, type, title, body, severity, link, for_roles: roles, channels_queued: ch });
  };
  const ops = ['owner', 'ops'] as const, fin = ['owner', 'finance'] as const;
  // attendance
  const todaysJobs = d.jobs.filter((j) => !j.deleted_at && j.start_at.startsWith(t) && LIVE_JOB.includes(j.status));
  for (const j of todaysJobs) for (const eid of [...j.crew_ids, ...(j.leader_id ? [j.leader_id] : [])]) {
    const emp = d.employees.find((e) => e.id === eid); if (!emp) continue;
    const rec = d.attendance.find((a) => a.employee_id === eid && a.date === t && !a.deleted_at);
    if (!rec?.clock_in && now.slice(11) > '09:00') add(`att-missing:${eid}:${t}`, 'attendance', 'Missing attendance', `${emp.full_name} has not clocked in for ${j.number}.`, 'critical', '/attendance', [...ops, 'leader'], true);
    else if (rec && rec.late_min > s.grace_minutes) add(`att-late:${eid}:${t}`, 'attendance', 'Late arrival', `${emp.full_name} was ${rec.late_min} min late today.`, 'warn', '/attendance', [...ops, 'leader']);
  }
  const pendCor = d.corrections.filter((c) => c.status === 'Pending' && !c.deleted_at);
  if (pendCor.length) add('cor-pending', 'attendance', 'Unapproved attendance corrections', `${pendCor.length} correction request(s) awaiting approval.`, 'warn', '/attendance?tab=corrections', [...ops, 'leader']);
  // jobs
  for (const j of d.jobs.filter((x) => !x.deleted_at && x.status === 'Confirmed')) {
    const dt = daysTo(j.start_at.slice(0, 10)); const c = d.clients.find((x) => x.id === j.client_id);
    if (dt >= 0 && dt <= 1) add(`job-upcoming:${j.id}`, 'job', dt === 0 ? 'Job today' : 'Job tomorrow', `${j.number} • ${c?.name} • ${j.start_at.slice(11)}`, 'info', `/jobs/${j.id}`, [...ops, 'leader', 'field'], true);
    if (dt >= 0 && dt <= 3) add(`job-confirm:${j.id}`, 'client', 'Client booking confirmation', `Send confirmation to ${c?.contact_person} (${c?.mobile}) for ${j.number} on ${j.start_at.replace('T', ' ')}.`, 'info', `/jobs/${j.id}`, [...ops], true);
  }
  for (const c of d.communications.filter((x) => !x.deleted_at && x.follow_up_date && !x.follow_up_done && x.follow_up_date <= t)) {
    add(`followup:${c.id}`, 'crm', 'Overdue follow-up', `${d.clients.find((x) => x.id === c.client_id)?.name}: ${c.summary}`, 'warn', `/clients/${c.client_id}`, [...ops]);
  }
  for (const q of d.quotations.filter((x) => !x.deleted_at && x.status === 'Sent')) {
    const dt = daysTo(q.valid_until);
    if (dt <= s.reminder_days.quote_expiry) add(`quote-exp:${q.id}`, 'sales', dt < 0 ? 'Quotation expired' : 'Quotation expiring', `${q.number} for ${d.clients.find((c) => c.id === q.client_id)?.name} ${dt < 0 ? 'expired' : `expires in ${dt} day(s)`}.`, dt < 0 ? 'warn' : 'info', '/sales', [...ops]);
  }
  // inventory
  for (const it of d.items.filter((i) => !i.deleted_at)) {
    const sm = stockSummary(d, it.id);
    if (sm.available <= it.reorder_level) add(`low:${it.id}`, 'inventory', 'Low inventory', `${it.name}: ${sm.available} ${it.uom} available (reorder at ${it.reorder_level}).`, sm.available <= 0 ? 'critical' : 'warn', '/inventory', [...ops]);
    if (it.track_expiry && it.expiry_date) {
      const dt = daysTo(it.expiry_date);
      if (dt <= s.reminder_days.chemical_expiry) add(`expiry:${it.id}`, 'inventory', dt < 0 ? 'Expired material' : 'Expiring material', `${it.name} ${it.category === 'PPE' ? '(PPE) ' : ''}${dt < 0 ? 'expired' : `expires in ${dt} day(s)`} (batch ${it.batch_no ?? '—'}).`, dt < 0 ? 'critical' : 'warn', '/inventory', [...ops], true);
    }
  }
  // assets
  for (const c of d.checkouts.filter(isOverdue)) {
    const a = d.assets.find((x) => x.id === c.asset_id);
    add(`overdue:${c.id}`, 'asset', 'Overdue equipment return', `${a?.name} was due ${c.expected_return.replace('T', ' ')}.`, 'critical', '/assets', [...ops, 'leader'], true);
  }
  for (const a of d.assets.filter((x) => !x.deleted_at && x.status !== 'Retired' && x.maintenance_interval_days)) {
    const due = addDays(a.last_maintenance || a.purchase_date, a.maintenance_interval_days); const dt = daysTo(due);
    if (dt <= s.reminder_days.maintenance) add(`maint:${a.id}`, 'asset', dt < 0 ? 'Maintenance overdue' : 'Maintenance due', `${a.code} ${a.name}: ${dt < 0 ? `${-dt} day(s) overdue` : `due in ${dt} day(s)`}.`, dt < 0 ? 'warn' : 'info', '/assets', [...ops]);
  }
  // job workflow, equipment & incidents
  for (const x of d.incidents.filter((i) => !i.deleted_at && ['Open', 'Investigating'].includes(i.status))) {
    add(`inc:${x.id}`, 'incident', `Incident ${x.number}: ${x.type}`, x.description, x.severity === 'High' ? 'critical' : x.severity === 'Medium' ? 'warn' : 'info', '/assets?tab=incidents', [...ops, 'leader'], x.severity === 'High');
  }
  for (const r of d.requests.filter((x) => !x.deleted_at && x.status === 'Pending' && x.note?.startsWith('Requested from site'))) {
    add(`req-site:${r.id}`, 'job', 'Material request from site', `${d.jobs.find((x) => x.id === r.job_id)?.number}: ${r.lines.map((l) => `${l.qty} × ${d.items.find((i) => i.id === l.item_id)?.name}`).join(', ')}`, 'info', '/inventory?tab=requests', [...ops]);
  }
  for (const j of d.jobs.filter((x) => !x.deleted_at && x.start_at.startsWith(t))) {
    if (['Confirmed', 'Dispatch Checklist Pending'].includes(j.status) && now > addMinutes(j.start_at, 30)) add(`wf-late:${j.id}`, 'job', 'Crew not yet dispatched', `${j.number} was due to start ${j.start_at.slice(11)} — HQ checklist / dispatch not completed.`, 'warn', `/jobs/${j.id}`, [...ops, 'leader'], true);
  }
  for (const j of d.jobs.filter((x) => !x.deleted_at && x.status === 'Work Completed' && !d.workflows.some((w) => w.job_id === x.id && w.closed_at && !w.deleted_at))) {
    add(`wf-return:${j.id}`, 'job', 'Close-out pending', `${j.number}: client handover signed — complete the close-out (equipment return, leave site, arrival at HQ).`, 'info', `/jobs/${j.id}`, [...ops, 'leader']);
  }
  for (const b of d.back_jobs.filter((x) => !x.deleted_at && ['Reported', 'Under Review'].includes(x.status))) {
    add(`bj-new:${b.id}`, 'job', `Back job ${b.status === 'Reported' ? 'reported' : 'under review'}`, `${b.number} · ${d.jobs.find((j) => j.id === b.origin_job_id)?.number}: ${b.reason} — ${b.description}. ${b.charge_type}. Needs approval by Admin / Operations.`, 'warn', `/jobs/${b.job_id}`, ['owner', 'ops']);
  }
  for (const pay of d.payments.filter((x) => !x.deleted_at && !x.reversed && (x.status ?? 'Verified') === 'Pending Verification')) {
    const inv = d.invoices.find((i) => i.id === pay.invoice_id);
    add(`pay-verify:${pay.id}`, 'finance', 'Payment awaiting verification', `${pay.receipt_no} · ${inv?.number}: ${money(pay.amount)} by ${pay.method}, received by ${pay.received_by}. It does not reduce the balance until verified.`, 'warn', '/finance?tab=payments', ['owner', 'finance']);
  }
  for (const pay of d.payments.filter((x) => !x.deleted_at && !x.reversed && x.method === 'Cheque' && x.cheque_status === 'Bounced')) {
    add(`chq-bounced:${pay.id}`, 'finance', 'Cheque bounced', `${pay.receipt_no} · cheque ${pay.cheque_no} (${money(pay.amount)}) bounced. The invoice balance was not reduced.`, 'critical', '/finance?tab=payments', ['owner', 'finance']);
  }
  for (const fb of d.client_feedback.filter((x) => !x.deleted_at && x.follow_up === 'Required')) {
    const j = d.jobs.find((x) => x.id === fb.job_id);
    add(`fb-follow:${fb.id}`, 'job', 'Follow-Up Required: client not satisfied', `${j?.number} · ${d.clients.find((c) => c.id === fb.client_id)?.name}: ${fb.issue_category}${fb.comment ? ` — “${fb.comment}”` : ''}. The job cannot be closed until you acknowledge it.`, 'critical', `/jobs/${fb.job_id}`, ['owner']);
  }
  for (const r of d.discount_requests.filter((x) => !x.deleted_at && x.status === 'Pending Admin Approval')) {
    const j = d.jobs.find((x) => x.id === r.job_id);
    add(`disc-pend:${r.id}`, 'job', 'Discount request awaiting approval', `${r.number} · ${j?.number}: ${money(r.requested_amount)} off ${money(r.base_total)} — ${r.reason}. The client cannot sign the final bill until it is decided.`, 'warn', `/jobs/${r.job_id}`, ['owner']);
  }
  for (const r of d.discount_requests.filter((x) => !x.deleted_at && x.status === 'Approved')) {
    const j = d.jobs.find((x) => x.id === r.job_id);
    add(`disc-apply:${r.id}`, 'job', 'Approved discount ready to apply', `${r.number} · ${j?.number}: ${money(r.approved_amount ?? 0)} approved. Apply it to the final bill before the client signs.`, 'info', `/jobs/${r.job_id}`, [...ops, 'leader']);
  }
  for (const v of d.variations.filter((x) => !x.deleted_at && x.status === 'Pending Approval')) {
    add(`var-pend:${v.id}`, 'job', 'Variation awaiting client approval', `${v.number}: ${v.reason}`, 'warn', `/jobs/${v.job_id}`, [...ops, 'leader']);
  }
  // finance
  for (const i of d.invoices.filter((x) => x.status === 'Approved' && !x.deleted_at)) {
    const bal = invoiceBalance(d, i); if (bal <= 0.005) continue;
    const dt = daysTo(i.due_date); const cn = d.clients.find((c) => c.id === i.client_id)?.name;
    if (dt < 0) add(`inv-over:${i.id}`, 'finance', 'Invoice overdue', `${i.number} • ${cn} • ${money(bal)} overdue ${-dt} day(s).`, dt < -30 ? 'critical' : 'warn', '/finance', [...fin], true);
    else if (dt <= s.reminder_days.invoice_due) add(`inv-due:${i.id}`, 'finance', 'Invoice due soon', `${i.number} • ${cn} • ${money(bal)} due in ${dt} day(s).`, 'info', '/finance', [...fin], true);
  }
  const pend = d.periods.filter((p) => !p.deleted_at && p.status === 'For Approval');
  for (const p of pend) add(`pay-appr:${p.id}`, 'payroll', 'Payroll awaiting approval', `${p.label} has been submitted and awaits Owner approval.`, 'warn', `/payroll/${p.id}`, ['owner', 'finance'], true);
  for (const e of d.expenses.filter((x) => !x.deleted_at && x.approval === 'Pending')) add(`exp-pend:${e.id}`, 'finance', 'Expense awaiting approval', `${e.payee} ${money(e.amount)}`, 'info', '/finance?tab=expenses', [...fin]);
  // HR docs
  for (const e of d.employees.filter((x) => !x.deleted_at && x.status !== 'inactive')) {
    for (const doc of e.documents) if (doc.expires && daysTo(doc.expires) <= s.reminder_days.doc_expiry) add(`doc:${e.id}:${doc.name}`, 'hr', daysTo(doc.expires) < 0 ? 'Document expired' : 'Document expiring', `${e.full_name} – ${doc.name} ${daysTo(doc.expires) < 0 ? 'expired' : `expires ${doc.expires}`}.`, daysTo(doc.expires) < 0 ? 'critical' : 'warn', `/employees/${e.id}`, [...ops, 'finance']);
    for (const tr of e.trainings) if (tr.expires && daysTo(tr.expires) <= s.reminder_days.doc_expiry) add(`train:${e.id}:${tr.name}`, 'hr', 'Certification expiring', `${e.full_name} – ${tr.name} ${daysTo(tr.expires) < 0 ? 'expired' : `expires ${tr.expires}`}.`, daysTo(tr.expires) < 0 ? 'critical' : 'warn', `/employees/${e.id}`, [...ops]);
  }
  store.syncNotifications(list as never);
  // auto-expire sent quotations
  for (const q of d.quotations.filter((x) => x.status === 'Sent' && x.valid_until < t && !x.deleted_at)) store.system('quotations', q.id, { status: 'Expired' } as never, `Quotation ${q.number} auto-expired`);
  // recurring expenses: create the next month's pending copy
  const latest = new Map<string, Expense>();
  for (const e of d.expenses.filter((x) => x.recurring && !x.deleted_at && !x.reversed)) { const k = `${e.payee}|${e.category}`; const cur = latest.get(k); if (!cur || cur.date < e.date) latest.set(k, e); }
  for (const e of latest.values()) {
    const next = new Date(Date.UTC(+e.date.slice(0, 4), +e.date.slice(5, 7), +e.date.slice(8, 10))).toISOString().slice(0, 10);
    if (next <= t && e.recurring === 'monthly') {
      const { id: _i, created_at: _c, updated_at: _u, created_by: _b, ...rest } = e; void [_i, _c, _u, _b];
      store.system('expenses', e.id, { recurring: null } as never, undefined);
      store.systemInsert('expenses', { ...rest, date: next, approval: 'Pending', approved_by: undefined, paid: false, receipt: undefined, recurring: 'monthly', notes: 'Auto-generated recurring expense' } as never);
    }
  }
}
