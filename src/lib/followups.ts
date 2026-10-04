// Client follow-up actions (store side). Kept free of imports from ./actions so that actions.ts can call syncFollowUps without a cycle.
import { store, RuleError } from './store';
import type { DB, FollowUp, FollowUpRule, ServiceCode } from './types';
import { ACTION_STATES, FINAL_STATES, planFollowUps } from './followup-core';
import { addDays, isoNow, today } from './util';

const db = (): DB => store.getDB();
const fail = (m: string): never => { throw new RuleError(m); };
const me = () => store.user;

/** Re-count follow-ups from each client's newest completed service (reset old open ones, add the 6-month / 1-year dates once). Safe to run repeatedly. */
export function syncFollowUps() {
  const plan = planFollowUps(db(), today());
  for (const p of plan.patches) {
    const cur = db().followups.find((f) => f.id === p.id); if (!cur) continue;
    const history = p.patch.status && p.patch.status !== cur.status ? [...cur.history, { at: isoNow(), by: 'System', status: p.patch.status, note: p.summary }] : cur.history;
    store.system('followups', p.id, { ...p.patch, history }, p.summary);
  }
  for (const n of plan.inserts) {
    const c = db().clients.find((x) => x.id === n.client_id);
    store.systemInsert('followups', n as never, `Follow-up scheduled for ${c?.name}: ${n.months} months after ${n.reference_date} (due ${n.due_date})`);
  }
}

export interface FollowUpUpdate { status: (typeof ACTION_STATES)[number]; note?: string; snoozed_until?: string; booked_job_id?: string }
/** Admin records what happened with a follow-up. */
export function setFollowUpStatus(id: string, u: FollowUpUpdate): FollowUp {
  store.require('followups.manage');
  const f = db().followups.find((x) => x.id === id && !x.deleted_at) ?? fail('Follow-up not found.');
  if (f.status === 'Superseded') fail('This follow-up was replaced by a newer completed service.');
  if (!ACTION_STATES.includes(u.status)) fail('Choose a follow-up status.');
  const note = u.note?.trim() || undefined;
  if (u.status === 'Not Interested' && !note) fail('Add a short reason the client is not interested.');
  if (u.status === 'Snoozed') {
    if (!u.snoozed_until) fail('Choose the date to be reminded again.');
    if (u.snoozed_until! <= today()) fail('The snooze date must be in the future.');
    if (u.snoozed_until! > addDays(today(), 366)) fail('Snooze for one year at most.');
  }
  let booked: string | undefined;
  if (u.status === 'Booked' && u.booked_job_id) {
    const j = db().jobs.find((x) => x.id === u.booked_job_id && !x.deleted_at) ?? fail('Booking not found.');
    if (j.client_id !== f.client_id) fail('That job belongs to another client.');
    if (['Cancelled', 'Rescheduled'].includes(j.status)) fail('That job is cancelled.');
    booked = j.id;
  }
  const at = isoNow();
  return store.update('followups', id, {
    status: u.status, note, snoozed_until: u.status === 'Snoozed' ? u.snoozed_until : undefined, booked_job_id: u.status === 'Booked' ? booked : undefined,
    actioned_by: me()?.id, actioned_at: at, history: [...f.history, { at, by: me()?.name ?? 'Admin', status: u.status, note }],
  }, 'update', `Follow-up for ${db().clients.find((c) => c.id === f.client_id)?.name} → ${u.status}${note ? `: ${note}` : ''}`);
}

export interface RuleInput { client_id?: string; service_code?: ServiceCode; short_months: number; long_months: number; note?: string }
/** Admin sets a custom recommended interval for one client or for a service type. Open follow-ups are recalculated; acted-on ones keep their dates. */
export function saveFollowUpRule(r: RuleInput): FollowUpRule {
  store.require('followups.manage');
  if (!!r.client_id === !!r.service_code) fail('Choose either a client or a service type.');
  if (!Number.isInteger(r.short_months) || r.short_months < 1 || r.short_months > 36) fail('The first follow-up must be 1 to 36 whole months.');
  if (!Number.isInteger(r.long_months) || r.long_months <= r.short_months || r.long_months > 60) fail('The second follow-up must be a whole number of months after the first (up to 60).');
  if (r.client_id && !db().clients.some((c) => c.id === r.client_id && !c.deleted_at)) fail('Client not found.');
  const cur = db().followup_rules.find((x) => !x.deleted_at && (r.client_id ? x.client_id === r.client_id : x.service_code === r.service_code));
  const data = { short_months: r.short_months, long_months: r.long_months, note: r.note?.trim() || undefined };
  const what = r.client_id ? `client ${db().clients.find((c) => c.id === r.client_id)?.name}` : `service type ${db().services.find((s) => s.code === r.service_code)?.name ?? r.service_code}`;
  const row = cur ? store.update('followup_rules', cur.id, data, 'update', `Follow-up interval for ${what}: ${r.short_months} / ${r.long_months} months`)
    : store.insert('followup_rules', { client_id: r.client_id, service_code: r.service_code, ...data } as never, `Follow-up interval for ${what}: ${r.short_months} / ${r.long_months} months`);
  syncFollowUps();
  return row;
}
export function removeFollowUpRule(id: string) {
  store.require('followups.manage');
  store.remove('followup_rules', id);
  syncFollowUps();
}
export const isFinalState = (s: FollowUp['status']) => FINAL_STATES.includes(s);
