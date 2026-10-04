import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, Modal, attempt } from '@/components/ui';
import { DraftBar, PresetChips } from '@/components/touch';
import { useDraft } from '@/lib/useDraft';
import { confirmLeave } from '@/lib/sync';
import { DISCOUNT_REASONS, currentRequest, discountAmount, discountImpact, jobRequests, requestStatusLabel } from '@/lib/business';
import { applyDiscount, billBase, canRunWorkflow, declineJob, decideDiscount, submitDiscountRequest } from '@/lib/workflow';
import { fmtDateTime, money, pct } from '@/lib/util';
import type { DiscountKind, DiscountRequest, Job, JobWorkflow } from '@/lib/types';

export const DISCOUNT_NOTICE = 'Discount approved by TopMop management and reflected in the final agreed amount.';
const TONE: Record<DiscountRequest['status'], string> = { 'Pending Admin Approval': 'amber', Approved: 'teal', Rejected: 'red', Applied: 'green' };
const userName = (db: ReturnType<typeof useAuth>['db'], id?: string) => db.users.find((u) => u.id === id)?.name ?? '—';
const kindLabel = (k: DiscountKind, v: number) => (k === 'percent' ? `${v}%` : money(v));

const canRunHere = (job: Job) => canRunWorkflow(job);

/** Section 4 of the client-facing quotation screen: request a discount (Team Leader), see its status, or decide it (Owner / Admin). */
export function DiscountSection({ job, wf, run, onDecline }: { job: Job; wf: JobWorkflow; run: boolean; onDecline?: () => void }) {
  const { db, can } = useAuth();
  const all = jobRequests(db, job.id);
  const cur = currentRequest(db, job.id);
  const rejected = [...all].reverse().find((r) => r.status === 'Rejected');
  const admin = can('discount.approve');
  const mine = can('discount.request') && (admin || canRunHere(job));
  const signed = !!wf.conf_at;
  const invoiced = db.invoices.some((i) => i.job_id === job.id && i.status !== 'Reversed' && !i.deleted_at);
  const canRequest = mine && !cur && !signed && !invoiced && (!rejected || admin);
  const [form, setForm] = useState(false);
  const [review, setReview] = useState<DiscountRequest | null>(null);
  const shown = cur ?? rejected;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {!shown && <p className="muted" style={{ margin: 0 }}>{signed ? 'No discount was requested.' : 'No discount requested.'}</p>}
      {shown && (
        <div className={`itemcard ${shown.status === 'Applied' ? 'ok' : shown.status === 'Rejected' ? 'bad' : ''}`}>
          <div className="row between"><div><b>{shown.number}</b> <Badge tone={TONE[shown.status]}>{requestStatusLabel(shown.status)}</Badge></div></div>
          <table className="tbl finalsum"><tbody>
            <tr><td>Original total</td><td className="num">{money(shown.base_total)}</td></tr>
            <tr><td>Requested discount ({kindLabel(shown.kind, shown.value)})</td><td className="num">− {money(shown.requested_amount)}</td></tr>
            {shown.status === 'Applied' && shown.approved_amount !== undefined && Math.abs(shown.approved_amount - shown.requested_amount) > 0.004 && <tr><td>Approved discount</td><td className="num">− {money(shown.approved_amount)}</td></tr>}
            <tr className="big"><td>{shown.status === 'Rejected' ? 'Final amount (original stands)' : shown.status === 'Pending Admin Approval' ? 'Proposed final amount' : 'Revised final amount'}</td><td className="num">{money(shown.status === 'Rejected' ? shown.base_total : shown.status === 'Pending Admin Approval' ? shown.proposed_final : shown.approved_final ?? shown.proposed_final)}</td></tr>
          </tbody></table>
          <div className="small muted">{shown.reason}{shown.reason_note ? ` — ${shown.reason_note}` : ''}{shown.client_notes ? ` · Notes: ${shown.client_notes}` : ''}</div>
          <div className="small muted">Requested by {userName(db, shown.submitted_by)} · {fmtDateTime(shown.submitted_at)}</div>
          {shown.status === 'Pending Admin Approval' && <div className="alert warn" style={{ marginTop: 8 }}>Sent to the Owner / Admin for approval. The client cannot sign the quotation until they approve or reject it.</div>}
          {shown.status === 'Applied' && <div className="small" style={{ color: 'var(--green)', marginTop: 6 }}>{DISCOUNT_NOTICE}</div>}
          {shown.status === 'Approved' && <div className="alert info" style={{ marginTop: 8 }}>Approved — apply it to the final bill, then present the revised quotation to the client.</div>}
          {shown.status === 'Rejected' && <div className="alert err" style={{ marginTop: 8 }}>Rejected by {userName(db, shown.decided_by)}{shown.decision_note ? ` — “${shown.decision_note}”` : ''}. The original final amount stands: present the quotation again for the client to sign, or record that the client declined the job.</div>}
          <div className="row" style={{ marginTop: 8 }}>
            {admin && shown.status === 'Pending Admin Approval' && <button className="btn primary" onClick={() => setReview(shown)}>Approve / Reject</button>}
            {admin && !signed && shown.id === cur?.id && ['Approved', 'Applied'].includes(shown.status) && <button className="btn sm" onClick={() => setReview(shown)}>Modify / re-approve</button>}
            {shown.status === 'Approved' && (mine || admin) && <button className="btn primary" onClick={() => attempt(() => applyDiscount(shown.id), 'Discount applied — the client can now sign the revised amount')}>Apply to final bill</button>}
            {shown.status === 'Rejected' && run && !signed && onDecline && <button className="btn danger" onClick={onDecline}>Client declines the job</button>}
          </div>
        </div>
      )}
      {canRequest && <div><button className="btn navy lg" onClick={() => setForm(true)}>Request Discount</button><div className="small muted" style={{ marginTop: 4 }}>Only the Owner / Admin can approve a discount.</div></div>}
      {form && <RequestModal job={job} onClose={() => setForm(false)} />}
      {review && <ReviewModal job={job} req={review} onClose={() => setReview(null)} />}
    </div>
  );
}

/** Owner / Admin: pending requests with one-tap approve / reject (dashboard card; works on a phone). */
export function DiscountInbox() {
  const { db, can } = useAuth();
  const [review, setReview] = useState<DiscountRequest | null>(null);
  if (!can('discount.approve')) return null;
  const pend = db.discount_requests.filter((r) => r.status === 'Pending Admin Approval' && !r.deleted_at);
  if (!pend.length) return null;
  const job = review ? db.jobs.find((j) => j.id === review.job_id) : undefined;
  return (
    <div className="card" style={{ padding: 12, marginBottom: 14, borderLeft: '4px solid var(--amber)' }}>
      <div className="row between"><b>Discount requests waiting for your approval ({pend.length})</b></div>
      <ul className="list" style={{ marginTop: 6 }}>
        {pend.map((r) => { const j = db.jobs.find((x) => x.id === r.job_id); return (
          <li key={r.id}><div><b>{j?.number}</b> · {db.clients.find((c) => c.id === r.client_id)?.name}<div className="small muted">{kindLabel(r.kind, r.value)} = {money(r.requested_amount)} off {money(r.base_total)} · {r.reason} · by {userName(db, r.submitted_by)}</div></div>
            <div className="row"><button className="btn sm primary" onClick={() => setReview(r)}>Review</button><a className="btn sm" href={`#/jobs/${r.job_id}`}>Open job</a></div></li>
        ); })}
      </ul>
      {review && job && <ReviewModal job={job} req={review} onClose={() => setReview(null)} />}
    </div>
  );
}

/** The client turned the job down (usually after a rejected discount). */
export function DeclineJobModal({ wf, job, onClose, onDone }: { wf: JobWorkflow; job: Job; onClose: () => void; onDone: () => void }) {
  const { db } = useAuth();
  const [name, setName] = useState(db.sites.find((s) => s.id === job.site_id)?.contact_person ?? '');
  const [reason, setReason] = useState('');
  const go = () => { if (attempt(() => declineJob(wf.id, { client_name: name, reason }), 'Recorded — the client declined the job. Go to Close-Out to return the equipment.')) onDone(); };
  return (
    <Modal title="Client declines the job" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Back</button><button className="btn danger" onClick={go}>Confirm: job declined</button></>}>
      <div className="stack">
        <div className="alert warn">No work will start and nothing is billed. The crew goes straight to Close-Out to return the equipment.</div>
        <Field label="Client name" required><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} /><PresetChips replace options={['Price too high', 'Went with another provider', 'Will decide later', 'Budget not approved']} value={reason} onChange={setReason} /></Field>
      </div>
    </Modal>
  );
}

export function RequestModal({ job, onClose }: { job: Job; onClose: () => void }) {
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
        <Field label="Notes"><textarea value={cnotes} onChange={(e) => setCnotes(e.target.value)} placeholder="What the client asked for and what was discussed" /></Field>
      </div>
    </Modal>
  );
}

export function ReviewModal({ job, req, onClose }: { job: Job; req: DiscountRequest; onClose: () => void }) {
  const { db } = useAuth();
  const b = billBase(job);
  const client = db.clients.find((c) => c.id === job.client_id);
  const [kind, setKind] = useState<DiscountKind>(req.approved_kind ?? req.kind);
  const [value, setValue] = useState<number | undefined>(req.approved_value ?? req.value);
  const [note, setNote] = useState('');
  const amt = value && value > 0 ? discountAmount(kind, value, b.base) : 0;
  const im = discountImpact(db, job, b, amt);
  const modified = Math.abs(amt - req.requested_amount) > 0.004;
  const run = (approve: boolean) => { if (attempt(() => decideDiscount(req.id, { approve, kind, value, note }), approve ? 'Discount approved — the revised bill is ready for the client to sign' : 'Discount rejected')) onClose(); };
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
