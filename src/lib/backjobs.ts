// Back Job / Callback: a finished job is never reopened or changed. A linked follow-up job is created instead, with its own job number,
// schedule, attendance, equipment checklist, service report and closure record (it runs through the same 7-step workflow).
import { store, RuleError } from './store';
import type { BackJob, BackJobCharge, BackJobReason, DB, Job, Quotation } from './types';
import { BACKJOB_REASONS, docTotals } from './business';
import { runAutomations } from './actions';
import { addDays, dow, isoNow, round2, today } from './util';

const db = (): DB => store.getDB();
const fail = (m: string): never => { throw new RuleError(m); };
const bjOf = (id: string) => db().back_jobs.find((b) => b.id === id) ?? fail('Back job not found.');
export const BACKJOB_ELIGIBLE = ['Work Completed', 'Closed', 'Completed'];
export const canCreateBackJob = (job: Job) => store.can('backjobs.create') && BACKJOB_ELIGIBLE.includes(job.status) && !job.deleted_at;

export interface BackJobForm { reason: BackJobReason; description: string; reported_on: string; reported_by: string; responsible: string; charge_type: BackJobCharge }

/** Create the back-job record and its linked follow-up job. The original job, service report, quotation, invoice and payments are not touched. */
export function createBackJob(originId: string, f: BackJobForm): { backJob: BackJob; job: Job } {
  store.require('backjobs.create');
  const origin = db().jobs.find((j) => j.id === originId) ?? fail('Job not found.');
  if (!BACKJOB_ELIGIBLE.includes(origin.status)) fail('A Back Job / Callback can only be created for a completed or closed job.');
  if (!BACKJOB_REASONS.includes(f.reason)) fail('Choose the back job reason.');
  if (!f.description.trim()) fail('Describe what needs to be redone or fixed.');
  if (!f.reported_on) fail('Enter the date reported.');
  if (f.reported_on > today()) fail('The date reported cannot be in the future.');
  if (!f.reported_by.trim()) fail('Enter who reported the problem.');
  if (!f.responsible.trim()) fail('Enter the responsible department or person.');
  if (!['No Charge', 'Chargeable Additional Work'].includes(f.charge_type)) fail('Choose No Charge or Chargeable Additional Work.');
  const wf = db().workflows.find((w) => w.job_id === originId && !w.deleted_at);
  const inv = db().invoices.find((i) => i.job_id === originId && i.status !== 'Reversed' && !i.deleted_at);
  let day = addDays(today(), 1); if (dow(day) === 0) day = addDays(day, 1);       // provisional slot: next working day, to be set when scheduled
  const bjId = crypto_id();
  const job = store.insert('jobs', {
    number: store.nextNumber('JOB'), client_id: origin.client_id, site_id: origin.site_id, branch_id: origin.branch_id, service_codes: [...origin.service_codes],
    scope: `BACK JOB (${f.reason}) for ${origin.number}: ${f.description.trim()}`, start_at: `${day}T08:00`, end_at: `${day}T17:00`, status: 'Pending',
    leader_id: undefined, crew_ids: [], equipment_ids: [], materials: [], ppe: [...origin.ppe], checklist: [], findings: '', damage_report: '', equipment_condition_notes: '',
    contract_amount: 0, estimated_cost: 0, back_job_id: bjId, origin_job_id: originId,
  } as never, `Back job follow-up created for ${origin.number}`) as Job;
  const backJob = store.insert('back_jobs', {
    id: bjId, number: store.nextNumber('BJ'), origin_job_id: originId, job_id: job.id, client_id: origin.client_id, site_id: origin.site_id,
    origin_workflow_id: wf?.id, origin_quotation_id: origin.quotation_id, origin_invoice_id: inv?.id, origin_leader_id: origin.leader_id, origin_crew_ids: [...origin.crew_ids],
    reason: f.reason, description: f.description.trim(), reported_on: f.reported_on, reported_by: f.reported_by.trim(), responsible: f.responsible.trim(), charge_type: f.charge_type, status: 'Reported',
  } as never, `Back job reported on ${origin.number}: ${f.reason} (${f.charge_type})`) as BackJob;
  runAutomations();
  return { backJob, job };
}
const crypto_id = () => `bj-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function reviewBackJob(id: string) {
  store.require('backjobs.approve');
  const b = bjOf(id);
  if (b.status !== 'Reported') fail('Only a reported back job can be moved to review.');
  const r = store.update('back_jobs', id, { status: 'Under Review', reviewed_by: store.user?.id, reviewed_at: isoNow() } as never, 'update', `${b.number}: under review`);
  runAutomations();
  return r;
}

/** Admin / Operations Manager approval. A chargeable back job also gets a new quotation, which the client must approve before work starts. */
export function approveBackJob(id: string, f: { note: string; amount?: number }) {
  store.require('backjobs.approve');
  const b = bjOf(id);
  if (!['Reported', 'Under Review'].includes(b.status)) fail('This back job has already been decided.');
  if (!f.note.trim()) fail('Enter an approval note.');
  const job = db().jobs.find((j) => j.id === b.job_id)!;
  let quotation: Quotation | undefined;
  if (b.charge_type === 'Chargeable Additional Work') {
    const amt = f.amount ?? 0;
    if (!(amt > 0)) fail('Enter the quoted amount (ex-VAT) for the chargeable work.');
    const client = db().clients.find((c) => c.id === b.client_id)!;
    const mode = client.vat_status === 'VAT-registered' ? 'exclusive' : 'none';
    const origin = db().jobs.find((j) => j.id === b.origin_job_id)!;
    const items = [{ service_code: job.service_codes[0], description: `Additional work after ${origin.number} (${b.reason}): ${b.description}`, qty: 1, unit: 'lot', rate: round2(amt), discount: 0 }];
    quotation = store.insert('quotations', { number: store.nextNumber('QT'), client_id: b.client_id, site_id: b.site_id, issue_date: today(), valid_until: addDays(today(), 30), scope: job.scope, items, vat_mode: mode, vat_rate: db().settings.vat_rate, discount: 0, terms: db().settings.default_terms, status: 'Sent', sent_at: isoNow(), branch_id: job.branch_id } as never, `Quotation for back job ${b.number}`) as Quotation;
    const t = docTotals(quotation.items, 0, quotation.vat_mode, quotation.vat_rate);
    store.update('jobs', job.id, { quotation_id: quotation.id, contract_amount: t.net } as never, 'update', `${job.number}: chargeable back job linked to ${quotation.number}`);
  }
  const r = store.update('back_jobs', id, { status: 'Approved', approved_by: store.user?.id, approved_at: isoNow(), approval_note: f.note.trim(), quotation_id: quotation?.id, reviewed_by: b.reviewed_by ?? store.user?.id, reviewed_at: b.reviewed_at ?? isoNow() } as never, 'approve', `${b.number}: back job approved${quotation ? ` — quotation ${quotation.number}` : ' — no charge'}: ${f.note.trim()}`);
  runAutomations();
  return r;
}

export function rejectBackJob(id: string, note: string) {
  store.require('backjobs.approve');
  const b = bjOf(id);
  if (!['Reported', 'Under Review'].includes(b.status)) fail('This back job has already been decided.');
  if (!note.trim()) fail('Enter the reason for rejecting the back job.');
  const job = db().jobs.find((j) => j.id === b.job_id);
  if (job && job.status === 'Pending') store.update('jobs', job.id, { status: 'Cancelled', damage_report: `Back job rejected: ${note.trim()}` } as never, 'update', `${job.number} cancelled — back job ${b.number} rejected`);
  const r = store.update('back_jobs', id, { status: 'Rejected', approved_by: store.user?.id, approved_at: isoNow(), approval_note: note.trim() } as never, 'update', `${b.number}: back job rejected — ${note.trim()}`);
  runAutomations();
  return r;
}
