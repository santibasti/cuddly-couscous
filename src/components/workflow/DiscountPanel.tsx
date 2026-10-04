import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, Modal, attempt } from '@/components/ui';
import { DraftBar, PresetChips } from '@/components/touch';
import { useDraft } from '@/lib/useDraft';
import { confirmLeave } from '@/lib/sync';
import { DISCOUNT_REASONS, currentRequest, discountAmount, discountImpact, discountLocked, jobRequests } from '@/lib/business';
import { applyDiscount, billBase, decideDiscount, submitDiscountRequest, canRunWorkflow } from '@/lib/workflow';
import { fmtDateTime, money, pct } from '@/lib/util';
import type { DiscountKind, DiscountRequest, Job, JobWorkflow } from '@/lib/types';

export const DISCOUNT_NOTICE = 'Discount approved by TopMop management and reflected in the final agreed amount.';
const TONE: Record<DiscountRequest['status'], string> = { 'Pending Admin Approval': 'amber', Approved: 'teal', Rejected: 'red', Applied: 'green' };
const userName = (db: ReturnType<typeof useAuth>['db'], id?: string) => db.users.find((u) => u.id === id)?.name ?? '—';
const kindLabel = (k: DiscountKind, v: number) => (k === 'percent' ? `${v}%` : money(v));

/** Discount Request status, history and actions for one job. Team Leaders only ever submit; the Owner / Admin decides. */
export function DiscountPanel({ job, wf }: { job: Job; wf?: JobWorkflow }) {
  const { db, can } = useAuth();
  const all = jobRequests(db, job.id);
  const cur = currentRequest(db, job.id);
  const admin = can('discount.approve');
  const mine = can('discount.request') && (admin || canRunWorkflow(job));
  const signedBill = !!wf && ((wf.conf_mode === 'approval' && !!wf.conf_at) || !!wf.rep_client_at);
  const invoiced = db.invoices.some((i) => i.job_id === job.id && i.status !== 'Reversed' && !i.deleted_at);
  const closed = ['Cancelled', 'Closed'].includes(job.status);
  const canRequest = mine && !cur && !signedBill && !invoiced && !closed && !!wf?.arr_at;
  const [form, setForm] = useState(false);
  const [review, setReview] = useState<DiscountRequest | null>(null);
  const locked = cur ? discountLocked(wf, cur) : false;
  if (!all.length && !canRequest) return null;
  return (
    <div className="card discpanel" style={{ padding: 12 }}>
      <div className="row between">
        <div><b>Discount</b><div className="small muted">Discounts are only granted through a request approved by the Owner / Admin. The original quotation and rates never change.</div></div>
        {canRequest && <button className="btn navy" onClick={() => setForm(true)}>Request discount</button>}
      </div>
      {all.length > 0 && (
        <div className="stack" style={{ marginTop: 10 }}>
          {[...all].reverse().map((r) => (
            <div key={r.id} className={`itemcard ${r.status === 'Applied' ? 'ok' : r.status === 'Rejected' ? 'bad' : ''}`}>
              <div className="row between">
                <div><b>{r.number}</b> <Badge tone={TONE[r.status]}>{r.status}</Badge></div>
                <b>{money(r.status === 'Pending Admin Approval' || r.status === 'Rejected' ? r.requested_amount : r.approved_amount ?? r.requested_amount)}</b>
              </div>
              <div className="small">
                Requested {kindLabel(r.kind, r.value)} off {money(r.base_total)} → proposed {money(r.proposed_final)} · {r.reason}{r.reason_note ? ` (${r.reason_note})` : ''}
              </div>
              {r.client_notes && <div className="small muted">Client: {r.client_notes}</div>}
              <div className="small muted">Submitted by {userName(db, r.submitted_by)} · {fmtDateTime(r.submitted_at)}</div>
              {r.status !== 'Pending Admin Approval' && r.decided_at && (
                <div className="small muted">
                  {r.status === 'Rejected' ? 'Rejected' : 'Approved'} by {userName(db, r.decided_by)} · {fmtDateTime(r.decided_at)}
                  {r.status !== 'Rejected' && r.approved_amount !== undefined && Math.abs(r.approved_amount - r.requested_amount) > 0.004 ? ` — modified to ${money(r.approved_amount)}` : ''} — “{r.decision_note}”
                </div>
              )}
              {r.status === 'Applied' && <div className="small" style={{ color: 'var(--green)' }}>Applied to the final bill → final amount {money(r.approved_final ?? 0)}. {DISCOUNT_NOTICE}</div>}
              <div className="row" style={{ marginTop: 6 }}>
                {admin && r.status === 'Pending Admin Approval' && <button className="btn sm primary" onClick={() => setReview(r)}>Review &amp; decide</button>}
                {admin && (r.status === 'Approved' || (r.status === 'Applied' && !locked)) && r.id === cur?.id && <button className="btn sm" onClick={() => setReview(r)}>Modify / re-approve</button>}
                {r.status === 'Approved' && (mine || admin) && <button className="btn sm primary" onClick={() => attempt(() => applyDiscount(r.id), 'Discount applied to the final bill — the client can now review and sign')}>Apply to final bill</button>}
                {r.status === 'Applied' && locked && <span className="small muted">Signed by the client — final.</span>}
                {r.status === 'Pending Admin Approval' && !admin && <span className="small muted">Waiting for the Owner / Admin. The client cannot sign the final bill until this is decided.</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {form && <RequestModal job={job} onClose={() => setForm(false)} />}
      {review && <ReviewModal job={job} req={review} onClose={() => setReview(null)} />}
    </div>
  );
}

function RequestModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const { db, user } = useAuth();
  const client = db.clients.find((c) => c.id === job.client_id);
  const b = billBase(job);
  const [kind, setKind] = useState<DiscountKind>('percent');
  const [value, setValue] = useState<number | undefined>();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [cnotes, setCnotes] = useState('');
  const dr = useDraft(`d:${job.id}:discreq`, { kind, value, reason, note, cnotes }, (d) => { setKind(d.kind); setValue(d.value); setReason(d.reason); setNote(d.note); setCnotes(d.cnotes); });
  const amt = value && value > 0 ? discountAmount(kind, value, b.base) : 0;
  const final = Math.round((b.base - amt) * 100) / 100;
  const close = () => { if (dr.dirty && !confirmLeave()) return; onClose(); };
  const submit = () => { if (attempt(() => submitDiscountRequest(job.id, { kind, value: value ?? 0, reason, reason_note: note, client_notes: cnotes }), 'Discount request submitted — waiting for Admin approval')) { dr.markSaved(); onClose(); } };
  return (
    <Modal title="Request a discount" size="wide" onClose={close} footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={submit}>Submit for Admin approval</button></>}>
      <div className="stack">
        <DraftBar d={dr} />
        <div className="alert info">This only sends a request. The bill does not change until the Owner / Admin approves it and it is applied.</div>
        <dl className="kv">
          <dt>Job reference</dt><dd>{job.number}</dd>
          <dt>Client name</dt><dd>{client?.name}</dd>
          <dt>Original total</dt><dd><b>{money(b.base)}</b> <span className="small muted">(quotation {money(b.original)}{b.additional ? ` + additional work ${money(b.additional)}` : ''}, incl. VAT)</span></dd>
          <dt>Submitted by</dt><dd>{user?.name}</dd>
          <dt>Date and time</dt><dd>{fmtDateTime(new Date().toISOString())}</dd>
        </dl>
        <Field label="Requested discount type" required>
          <div className="chips" role="group" aria-label="Discount type">
            <button type="button" className={kind === 'percent' ? 'on' : ''} onClick={() => setKind('percent')}>Percentage (%)</button>
            <button type="button" className={kind === 'fixed' ? 'on' : ''} onClick={() => setKind('fixed')}>Fixed peso amount (₱)</button>
          </div>
        </Field>
        <Field label={kind === 'percent' ? 'Requested discount (%)' : 'Requested discount (₱)'} required>
          <input type="number" inputMode="decimal" min="0" step="any" value={value ?? ''} onChange={(e) => setValue(e.target.value === '' ? undefined : +e.target.value)} />
        </Field>
        <div className="finalsum card" style={{ padding: 12 }}>
          <div className="row between"><span>Requested discount</span><b>− {money(amt)}</b></div>
          <div className="row between big"><span>Proposed final amount</span><b>{money(final)}</b></div>
        </div>
        <Field label="Reason for discount" required><PresetChips replace options={DISCOUNT_REASONS} value={reason} onChange={setReason} />{reason === 'Other' && <input style={{ marginTop: 6 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe the reason" aria-label="Other reason" />}</Field>
        <Field label="Client request / negotiation notes"><textarea value={cnotes} onChange={(e) => setCnotes(e.target.value)} placeholder="What the client asked for and what was discussed" /></Field>
      </div>
    </Modal>
  );
}

function ReviewModal({ job, req, onClose }: { job: Job; req: DiscountRequest; onClose: () => void }) {
  const { db } = useAuth();
  const b = billBase(job);
  const client = db.clients.find((c) => c.id === job.client_id);
  const [kind, setKind] = useState<DiscountKind>(req.approved_kind ?? req.kind);
  const [value, setValue] = useState<number | undefined>(req.approved_value ?? req.value);
  const [note, setNote] = useState('');
  const amt = value && value > 0 ? discountAmount(kind, value, b.base) : 0;
  const im = discountImpact(db, job, b, amt);
  const modified = Math.abs(amt - req.requested_amount) > 0.004;
  const run = (approve: boolean) => { if (attempt(() => decideDiscount(req.id, { approve, kind, value, note }), approve ? 'Discount approved — the Team Leader can now apply it to the final bill' : 'Discount rejected')) onClose(); };
  const row = (k: string, v: string, tone?: string) => <tr><td>{k}</td><td className="num" style={tone ? { color: tone, fontWeight: 700 } : undefined}>{v}</td></tr>;
  return (
    <Modal title={`Discount ${req.number} — ${job.number}`} size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn danger" onClick={() => run(false)}>Reject</button><button className="btn primary" onClick={() => run(true)}>{modified ? 'Approve modified discount' : 'Approve discount'}</button></>}>
      <div className="stack">
        <div className="small muted">{client?.name} · requested by {userName(db, req.submitted_by)} · {fmtDateTime(req.submitted_at)}</div>
        <div className="small"><b>Reason:</b> {req.reason}{req.reason_note ? ` — ${req.reason_note}` : ''}{req.client_notes && <><br /><b>Client request / negotiation:</b> {req.client_notes}</>}</div>
        <div className="tbl-wrap"><table className="tbl finalsum"><tbody>
          {row('Original quotation total', money(b.original))}
          {row('Approved additional work total', money(b.additional))}
          {row('Total before discount', money(b.base))}
          {row(`Requested discount (${kindLabel(req.kind, req.value)})`, `− ${money(req.requested_amount)}`)}
          {row('Final amount after discount', money(im.after))}
          {row('Estimated job cost', money(im.cost))}
          {row('Gross profit before discount (ex-VAT)', money(im.gpBefore), im.gpBefore < 0 ? 'var(--red)' : undefined)}
          {row('Gross profit after discount (ex-VAT)', money(im.gpAfter), im.gpAfter < 0 ? 'var(--red)' : undefined)}
          {row('Gross margin after discount', pct(im.marginAfter), im.marginAfter < 15 ? 'var(--red)' : undefined)}
        </tbody></table></div>
        <div className="small muted">Amounts are VAT-inclusive; profit is on the ex-VAT amount against the estimated cost (labor, materials, transport, equipment). The original quotation and rates are not changed.</div>
        <div className="form-grid">
          <Field label="Approved discount type (you may modify)"><div className="chips" role="group"><button type="button" className={kind === 'percent' ? 'on' : ''} onClick={() => setKind('percent')}>Percentage (%)</button><button type="button" className={kind === 'fixed' ? 'on' : ''} onClick={() => setKind('fixed')}>Fixed ₱</button></div></Field>
          <Field label={kind === 'percent' ? 'Approved discount (%)' : 'Approved discount (₱)'}><input type="number" inputMode="decimal" min="0" step="any" value={value ?? ''} onChange={(e) => setValue(e.target.value === '' ? undefined : +e.target.value)} /></Field>
        </div>
        {modified && <div className="alert warn">You are changing the request: {money(req.requested_amount)} → <b>{money(amt)}</b> (final {money(im.after)}).</div>}
        <Field label="Approval / rejection note" required hint="Required. It is saved with the decision in the audit trail."><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Approved for the repeat contract — one time only" /></Field>
      </div>
    </Modal>
  );
}
