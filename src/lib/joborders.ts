// Job Order Confirmation (store side). Free of imports from ./actions so actions can call syncJobOrders without a cycle.
import { store, RuleError } from './store';
import type { DB, JobOrder } from './types';
import { buildContent, changeSummary, contentKey, headOrder, planJobOrders } from './joborder-core';
import { isoNow, today, uid } from './util';

const db = (): DB => store.getDB();
const fail = (m: string): never => { throw new RuleError(m); };
const me = () => store.user?.name ?? 'System';
const token = () => (uid() + uid()).replace(/-/g, '').slice(0, 24);
const orderOf = (id: string) => db().job_orders.find((o) => o.id === id && !o.deleted_at) ?? fail('Job Order not found.');
const event = (o: JobOrder, action: string, note?: string) => [...o.history, { at: isoNow(), by: me(), action, ...(note ? { note } : {}) }];

/**
 * Keeps every confirmed booking's Job Order up to date. Confirming a booking creates the Draft. Until it is sent a Draft simply follows the booking;
 * once sent, a change to the schedule, approved scope, final price or team creates a Revised version and marks the sent one Superseded (never edited).
 * Only Admin / Operations run this (they are the people who review and send it).
 */
export function syncJobOrders(jobId?: string) {
  if (!store.can('joborders.manage')) return;
  for (const step of planJobOrders(db(), jobId)) {
    try {
      if (step.kind === 'create') {
        const content = buildContent(db(), step.job);
        store.systemInsert('job_orders', {
          number: store.nextNumber('JO'), version: 1, job_id: step.job.id, quotation_id: step.job.quotation_id, client_id: step.job.client_id, status: 'Draft', issued_on: today(),
          content, content_key: contentKey(content), sent_count: 0, share_token: token(),
          history: [{ at: isoNow(), by: 'System', action: 'Draft created when the booking was confirmed' }],
        } as never, `Job Order created for ${step.job.number}`);
      } else if (step.kind === 'refresh') {
        store.system('job_orders', step.order.id, { content: step.content, content_key: step.key, quotation_id: db().jobs.find((j) => j.id === step.order.job_id)?.quotation_id, history: event(step.order, 'Draft updated after the booking changed') } as never, `Job Order ${step.order.number} refreshed (not yet sent)`);
      } else {
        const o = step.order; const reason = changeSummary(o.content, step.content);
        const next = store.systemInsert('job_orders', {
          number: o.number, version: o.version + 1, job_id: o.job_id, quotation_id: db().jobs.find((j) => j.id === o.job_id)?.quotation_id, client_id: o.client_id, status: 'Revised', issued_on: today(),
          content: step.content, content_key: step.key, sent_count: 0, share_token: token(), supersedes_id: o.id, revision_reason: reason,
          history: [{ at: isoNow(), by: 'System', action: `Revised version created — ${reason}` }],
        } as never, `Job Order ${o.number} revised (version ${o.version + 1})`) as JobOrder;
        store.system('job_orders', o.id, { status: 'Superseded', superseded_by_id: next.id, history: event(o, `Superseded by version ${next.version}`, reason) } as never, `Job Order ${o.number} v${o.version} superseded`);
      }
    } catch (e) { if (!(e instanceof RuleError)) throw e; /* numbers still loading: retried on the next run */ }
  }
}

export const SEND_VIA = ['Email', 'Share link', 'WhatsApp / Viber', 'Printed copy', 'Other'] as const;
/** Admin / Operations mark the Job Order as sent to the client (after reviewing it). */
export function markJobOrderSent(id: string, via: string, note?: string): JobOrder {
  store.require('joborders.manage');
  const o = orderOf(id);
  if (headOrder(db(), o.job_id)?.id !== id) fail('Only the latest version can be sent.');
  if (!['Draft', 'Revised'].includes(o.status)) fail('This Job Order has already been sent. Use Resend.');
  if (o.content.blocker) fail(o.content.blocker);
  const at = isoNow();
  return store.update('job_orders', id, { status: 'Sent to Client', sent_at: at, sent_by: store.user?.id, sent_via: via, last_sent_at: at, sent_count: 1, history: event(o, `Marked as sent to the client via ${via}`, note) } as never, 'update', `Job Order ${o.number} v${o.version} sent to client via ${via}`);
}
/** Send it again (same version, same content); the date and time of every send stays in the trail. */
export function resendJobOrder(id: string, via: string, note?: string): JobOrder {
  store.require('joborders.manage');
  const o = orderOf(id);
  if (o.status !== 'Sent to Client') fail(o.status === 'Superseded' ? 'This version was replaced by a newer one. Send the latest version.' : 'Send it to the client first.');
  return store.update('job_orders', id, { last_sent_at: isoNow(), sent_count: o.sent_count + 1, history: event(o, `Resent to the client via ${via}`, note) } as never, 'update', `Job Order ${o.number} v${o.version} resent via ${via}`);
}
/** Download / print / link / e-mail actions go into the trail too. */
export function logJobOrderEvent(id: string, action: string) {
  if (!store.can('joborders.manage')) return;
  const o = db().job_orders.find((x) => x.id === id); if (!o) return;
  store.update('job_orders', id, { history: event(o, action) } as never, 'update', `Job Order ${o.number} v${o.version}: ${action}`);
}
