// Deleting clients and inventory items. Nothing is destroyed: a deleted record goes to Admin → Recycle bin and can be restored.
// A client or item that has money, completed service or stock history is refused (that history must stay); anything else can be removed,
// together with the client's unstarted bookings, drafts and contact records.
import { store, RuleError } from './store';
import type { DB, TableName } from './types';
import { isDone } from './business';
import { performReturn } from './actions';

const fail = (m: string): never => { throw new RuleError(m); };
const live = <X extends { deleted_at?: string | null }>(a: X[] | undefined) => (a ?? []).filter((x) => !x.deleted_at);
const UNSTARTED = ['Pending', 'Confirmed', 'Cancelled', 'Rescheduled'];

export interface DeletePlan { blockers: string[]; cascade: { table: TableName; id: string }[]; counts: string[] }
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function planClientDelete(db: DB, clientId: string): DeletePlan {
  const blockers: string[] = []; const cascade: DeletePlan['cascade'] = []; const counts: string[] = [];
  const mine = <X extends { client_id?: string; deleted_at?: string | null }>(a: X[] | undefined) => live(a).filter((x) => x.client_id === clientId);
  const jobs = mine(db.jobs); const jobIds = new Set(jobs.map((j) => j.id));
  const started = (j: DB['jobs'][number]) => !UNSTARTED.includes(j.status) || isDone(j.status) || live(db.workflows).some((w) => w.job_id === j.id);
  const inv = mine(db.invoices).filter((i) => i.status !== 'Draft'); if (inv.length) blockers.push(`${plural(inv.length, 'approved or reversed invoice')} (billing history)`);
  const pay = mine(db.payments); if (pay.length) blockers.push(`${plural(pay.length, 'recorded payment')}`);
  const run = jobs.filter(started); if (run.length) blockers.push(`${plural(run.length, 'job')} already started or completed (${run.slice(0, 3).map((j) => j.number).join(', ')}${run.length > 3 ? '…' : ''})`);
  for (const [n, a] of [['back job', mine(db.back_jobs)], ['client feedback record', mine(db.client_feedback)]] as const) if (a.length) blockers.push(plural(a.length, n));
  const so = live(db.job_orders).filter((o) => o.client_id === clientId && ['Sent to Client', 'Superseded'].includes(o.status)); if (so.length) blockers.push(`${plural(so.length, 'Job Order')} already sent to the client`);
  if (blockers.length) return { blockers, cascade: [], counts };
  const add = (table: TableName, rows: { id: string }[], label: string) => { rows.forEach((r) => cascade.push({ table, id: r.id })); if (rows.length) counts.push(plural(rows.length, label)); };
  add('sites', mine(db.sites ?? []) as { id: string }[], 'service site');
  add('quotations', mine(db.quotations), 'quotation'); add('jobs', jobs, 'unstarted booking');
  add('job_orders', live(db.job_orders).filter((o) => jobIds.has(o.job_id)), 'draft Job Order');
  add('ocular_visits', mine(db.ocular_visits), 'ocular visit'); add('inquiries', mine(db.inquiries), 'inquiry');
  add('communications', mine(db.communications), 'communication note'); add('complaints', mine(db.complaints), 'complaint');
  add('invoices', mine(db.invoices).filter((i) => i.status === 'Draft'), 'draft invoice');
  add('followups', mine(db.followups), 'follow-up'); add('followup_rules', mine(db.followup_rules), 'follow-up rule');
  return { blockers, cascade, counts };
}

export function planItemDelete(db: DB, itemId: string): DeletePlan {
  const blockers: string[] = [];
  const moves = live(db.stock).filter((t) => t.item_id === itemId && t.type !== 'Opening'); if (moves.length) blockers.push(`${plural(moves.length, 'stock movement')} (received, issued, adjusted or counted)`);
  const reqs = live(db.requests).filter((r) => r.lines.some((l) => l.item_id === itemId)); if (reqs.length) blockers.push(`${plural(reqs.length, 'material request')}`);
  const jobs = live(db.jobs).filter((j) => !['Cancelled', 'Rescheduled'].includes(j.status) && j.materials.some((m) => m.item_id === itemId)); if (jobs.length) blockers.push(`planned or used in ${plural(jobs.length, 'job')} (${jobs.slice(0, 3).map((j) => j.number).join(', ')}${jobs.length > 3 ? '…' : ''})`);
  return { blockers, cascade: [], counts: [] };
}

export function deleteClient(id: string, reason: string) {
  store.require('clients.delete');
  const db = store.getDB(); const c = live(db.clients).find((x) => x.id === id) ?? fail('Client not found.');
  const plan = planClientDelete(db, id);
  if (plan.blockers.length) fail(`${c.name} cannot be deleted: it has ${plan.blockers.join('; ')}. That history must stay — set the client to Inactive instead.`);
  if (!reason.trim()) fail('Give a reason for the deletion.');
  store.withReason(reason.trim(), () => {
    for (const x of plan.cascade) store.remove(x.table, x.id, { cascade: true });
    store.remove('clients', id);
  });
  return plan;
}

export function deleteItem(id: string, reason: string) {
  store.require('inventory.delete');
  const db = store.getDB(); const i = live(db.items).find((x) => x.id === id) ?? fail('Item not found.');
  const plan = planItemDelete(db, id);
  if (plan.blockers.length) fail(`${i.name} cannot be deleted: it has ${plan.blockers.join('; ')}. Keep it for the record and set its stock to zero by adjustment instead.`);
  if (!reason.trim()) fail('Give a reason for the deletion.');
  store.withReason(reason.trim(), () => store.remove('items', id));
}

/**
 * Owner only: delete a booking even after it has started (test bookings). The crew, vehicle and equipment are released at once,
 * anything still checked out for it is returned, and its job order, workflow and service report go to the Recycle bin with it.
 * A job with an approved invoice or a verified payment is refused: that money history must stay.
 */
export function planBookingDelete(db: DB, jobId: string): DeletePlan {
  const blockers: string[] = []; const cascade: DeletePlan['cascade'] = []; const counts: string[] = [];
  const inv = live(db.invoices).filter((i) => i.job_id === jobId && i.status !== 'Draft' && i.status !== 'Reversed'); if (inv.length) blockers.push(`${plural(inv.length, 'approved invoice')} (billing history)`);
  const invIds = new Set(live(db.invoices).filter((i) => i.job_id === jobId).map((i) => i.id));
  const pay = live(db.payments).filter((p) => !p.reversed && (p.job_id === jobId || (p.invoice_id && invIds.has(p.invoice_id)))); if (pay.length) blockers.push(plural(pay.length, 'recorded payment'));
  if (blockers.length) return { blockers, cascade, counts };
  const add = (table: TableName, rows: { id: string }[], label: string) => { rows.forEach((r) => cascade.push({ table, id: r.id })); if (rows.length) counts.push(plural(rows.length, label)); };
  add('job_orders', live(db.job_orders).filter((o) => o.job_id === jobId), 'Job Order');
  add('workflows', live(db.workflows).filter((w) => w.job_id === jobId), 'job workflow');
  add('service_reports', live(db.service_reports).filter((r) => r.job_id === jobId), 'service report');
  add('invoices', live(db.invoices).filter((i) => i.job_id === jobId && (i.status === 'Draft' || i.status === 'Reversed')), 'draft invoice');
  return { blockers, cascade, counts };
}

export function deleteBooking(id: string, reason: string) {
  if (store.user?.role !== 'owner') fail('Only the Owner can delete a booking.');
  const db = store.getDB(); const j = live(db.jobs).find((x) => x.id === id) ?? fail('Booking not found.');
  const plan = planBookingDelete(db, id);
  if (plan.blockers.length) fail(`${j.number} cannot be deleted: it has ${plan.blockers.join('; ')}. That history must stay — cancel the booking instead.`);
  if (!reason.trim()) fail('Give a reason for the deletion.');
  const held = [...(j.leader_id ? [j.leader_id] : []), ...j.crew_ids];
  const names = held.map((e) => db.employees.find((x) => x.id === e)?.full_name ?? e).join(', ');
  store.withReason(reason.trim(), () => {
    for (const c of live(db.checkouts).filter((x) => x.job_id === id)) {
      if (c.status === 'Released') performReturn(c.id, { condition: 'Good', damage_notes: '', missing: '' });
      else if (c.status === 'Requested') store.update('checkouts', c.id, { status: 'Rejected', note: `Booking ${j.number} deleted` } as never, 'update', `Equipment request cancelled — booking ${j.number} deleted`);
    }
    store.update('jobs', id, { leader_id: undefined, crew_ids: [], vehicle_id: undefined, equipment_ids: [] } as never, 'update', `Booking ${j.number} deleted — released ${names || 'no crew'}${j.vehicle_id || j.equipment_ids.length ? ' and its vehicle / equipment' : ''}`);
    for (const x of plan.cascade) store.remove(x.table, x.id, { cascade: true });
    store.remove('jobs', id, { cascade: true });
  });
  return plan;
}
