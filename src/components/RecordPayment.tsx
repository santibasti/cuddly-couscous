import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, Modal, attempt } from '@/components/ui';
import { CHEQUE_STATUSES, PAY_METHODS, editPayment, recordPayment, verifyPayment, type PaymentInput } from '@/lib/actions';
import { invoiceLedger, invoiceTotals, invoiceState, paymentPending, paymentPlanLabel } from '@/lib/business';
import { receiptPdf } from '@/lib/export';
import { fmtDateTime, money, nowLocal, round2 } from '@/lib/util';
import type { Invoice, Payment, PayMethod } from '@/lib/types';

/** Invoices of a client / job that still have an unpaid balance. */
export function payableInvoices(db: ReturnType<typeof useAuth>['db'], o: { clientId?: string; jobId?: string }) {
  return db.invoices.filter((i) => i.status === 'Approved' && !i.deleted_at && (!o.clientId || i.client_id === o.clientId) && (!o.jobId || i.job_id === o.jobId) && invoiceLedger(db, i).balance > 0.005).sort((a, b) => a.issue_date.localeCompare(b.issue_date));
}
export const canRecordPayment = (can: (p: string) => boolean) => can('payments.record') || can('invoices.edit') || can('payments.record_cash');

/** Record Payment: used from the completed job, invoice, client account and receivables screens. */
export function RecordPaymentModal({ invoice, clientId, jobId, edit, onClose }: { invoice?: Invoice; clientId?: string; jobId?: string; edit?: Payment; onClose: () => void }) {
  const { db, can, user } = useAuth();
  const full = can('payments.record') || can('invoices.edit');
  const verifier = can('payments.verify');
  const options = useMemo(() => (edit ? db.invoices.filter((i) => i.id === edit.invoice_id) : invoice ? [invoice] : payableInvoices(db, { clientId, jobId })), [db, invoice, clientId, jobId, edit]);
  const [invId, setInvId] = useState(options[0]?.id ?? '');
  const inv = options.find((i) => i.id === invId);
  const lg = inv ? invoiceLedger(db, inv) : undefined;
  const room = lg ? round2(lg.available + (edit && edit.status !== 'Rejected' ? edit.amount + edit.wht_amount : 0)) : 0;
  const t = inv ? invoiceTotals(inv) : undefined;
  // everything still owed is already recorded and only waiting for Finance to verify it (e.g. cash the Team Leader collected on site)
  const pending = inv ? db.payments.filter((p) => p.invoice_id === inv.id && paymentPending(p)) : [];
  const nothingLeft = !edit && !!lg && room <= 0.005 && pending.length > 0;
  const pc = inv ? db.payment_confirmations.find((c) => c.job_id === inv.job_id && !c.deleted_at) : undefined;
  const [method, setMethod] = useState<PayMethod>(edit?.method ?? (pc && pc.method !== 'Terms / To Be Billed' ? (pc.method as PayMethod) : 'Cash'));
  const [amount, setAmount] = useState<number | undefined>(edit?.amount ?? (room > 0 ? room : undefined));
  const [wht, setWht] = useState<number | undefined>(edit?.wht_amount || undefined);
  const [paidAt, setPaidAt] = useState((edit?.paid_at ?? nowLocal()).slice(0, 16));
  const [receivedBy, setReceivedBy] = useState(edit?.received_by ?? user?.name ?? '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const [ref, setRef] = useState(edit?.method === 'Bank Transfer' ? edit.reference : '');
  const [bank, setBank] = useState(edit?.bank_name ?? '');
  const [tdate, setTdate] = useState(edit?.transfer_date ?? nowLocal().slice(0, 10));
  const [chqNo, setChqNo] = useState(edit?.cheque_no ?? '');
  const [chqDate, setChqDate] = useState(edit?.cheque_date ?? nowLocal().slice(0, 10));
  const [chqSt, setChqSt] = useState(edit?.cheque_status ?? 'Pending Clearance');
  const [gref, setGref] = useState(edit?.gcash_ref ?? '');
  const [sender, setSender] = useState(edit?.sender ?? '');
  const [verifyNow, setVerifyNow] = useState(false);
  const methods = full ? PAY_METHODS : (['Cash'] as PayMethod[]);
  const after = round2(Math.max(0, (lg?.balance ?? 0) - (amount ?? 0) - (wht ?? 0)));
  const form = (): PaymentInput => ({ invoice_id: invId, method, amount: amount ?? 0, wht_amount: full ? wht ?? 0 : 0, paid_at: paidAt, received_by: receivedBy, notes, reference: ref, bank_name: bank, transfer_date: tdate, cheque_no: chqNo, cheque_date: chqDate, cheque_status: chqSt, gcash_ref: gref, sender, verify_now: verifyNow });
  const save = () => {
    if (edit) { if (attempt(() => editPayment(edit.id, form()), 'Payment updated')) onClose(); return; }
    const r = attempt(() => recordPayment(form()), full && verifyNow ? 'Payment recorded and verified' : 'Payment recorded — pending verification') as Payment | undefined;
    if (r) { onClose(); attempt(() => receiptPdf(db.invoices ? { ...db, payments: [...db.payments, r] } : db, r)); }
  };
  if (!options.length) {
    return <Modal title="Record payment" onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}><div className="alert info">There is no approved invoice with an unpaid balance{jobId ? ' for this job. Create and approve the invoice first (Finance)' : ''}.</div></Modal>;
  }
  return (
    <Modal title={edit ? `Edit payment ${edit.receipt_no}` : 'Record payment'} size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary lg" onClick={save} disabled={nothingLeft}>{edit ? 'Save changes' : 'Save payment & receipt'}</button></>}>
      <div className="stack">
        {options.length > 1 && <Field label="Invoice" required><select value={invId} onChange={(e) => { setInvId(e.target.value); setAmount(undefined); }}>{options.map((i) => <option key={i.id} value={i.id}>{i.number} · {db.clients.find((c) => c.id === i.client_id)?.name} · balance {money(invoiceLedger(db, i).balance)} · {invoiceState(db, i)}</option>)}</select></Field>}
        {nothingLeft && (
          <div className="alert warn">
            <b>Nothing left to record.</b> The whole balance is already recorded and waiting for verification, so it does not count yet:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{pending.map((p) => (
              <li key={p.id}>{p.receipt_no} · {p.method} · {money(p.amount)} · received by {p.received_by}{' '}
                {verifier ? <button type="button" className="btn sm primary" onClick={() => { if (attempt(() => verifyPayment(p.id), 'Payment verified')) onClose(); }}>Verify it now</button> : <span className="muted">(Finance / Admin verifies it)</span>}</li>))}</ul>
          </div>
        )}
        {inv && lg && t && (
          <div className="card" style={{ padding: 12 }}>
            <dl className="kv">
              <dt>Client</dt><dd>{db.clients.find((c) => c.id === inv.client_id)?.name}</dd>
              <dt>Job / invoice</dt><dd>{db.jobs.find((j) => j.id === inv.job_id)?.number ?? '—'} · {inv.number}</dd>
            </dl>
            <table className="tbl finalsum"><tbody>
              <tr><td>Final bill</td><td className="num">{money(lg.total)}</td></tr>
              <tr><td>− Payments received (verified)</td><td className="num">{money(lg.received)}</td></tr>
              {lg.waiting > 0 && <tr className="sub"><td>Recorded, waiting for verification / clearing</td><td className="num">{money(lg.waiting)}</td></tr>}
              <tr className="big"><td>Outstanding balance</td><td className="num">{money(lg.balance)}</td></tr>
              {(amount ?? 0) > 0 && <tr className="sub"><td>Balance after this payment is verified</td><td className="num">{money(after)}</td></tr>}
            </tbody></table>
          </div>
        )}
        {pc && !edit && <div className="alert info">Team Leader’s note from the site: <b>{paymentPlanLabel(pc)}</b>{pc.expected_today > 0 ? ` · ${money(pc.expected_today)} expected today` : ''}{pc.note ? ` — “${pc.note}”` : ''}.{pc.payment_id ? ' A pending payment was already created from this — verify it in Finance → Payments instead of recording it again.' : ''}</div>}
        <Field label="Payment method" required>
          <div className="chips" role="group" aria-label="Payment method">{methods.map((m) => <button key={m} type="button" className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>{m}</button>)}</div>
          {!full && <div className="small muted" style={{ marginTop: 4 }}>Team Leaders can record cash only. It is saved as <b>Pending Verification</b> until Finance / Admin verifies it.</div>}
        </Field>
        <div className="form-grid">
          <Field label="Amount received (₱)" required hint={room > 0 ? `Up to ${money(room)}` : undefined}><input type="number" inputMode="decimal" min="0" step="0.01" value={amount ?? ''} onChange={(e) => setAmount(e.target.value === '' ? undefined : +e.target.value)} /></Field>
          <Field label="Payment date and time" required><input type="datetime-local" max={nowLocal()} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
          <Field label="Received by" required><input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} /></Field>
          {full && method !== 'Cash' && <Field label="Withholding tax credited (₱)" hint="BIR 2307 amount the client withheld, if any"><input type="number" inputMode="decimal" min="0" step="0.01" value={wht ?? ''} onChange={(e) => setWht(e.target.value === '' ? undefined : +e.target.value)} /></Field>}
          {method === 'Bank Transfer' && <>
            <Field label="Bank name" required><input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. BDO, BPI, Metrobank" /></Field>
            <Field label="Account / reference number" required><input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
            <Field label="Transfer date" required><input type="date" value={tdate} max={nowLocal().slice(0, 10)} onChange={(e) => setTdate(e.target.value)} /></Field>
          </>}
          {method === 'Cheque' && <>
            <Field label="Bank name" required><input value={bank} onChange={(e) => setBank(e.target.value)} /></Field>
            <Field label="Cheque number" required><input value={chqNo} onChange={(e) => setChqNo(e.target.value)} /></Field>
            <Field label="Cheque date" required><input type="date" value={chqDate} onChange={(e) => setChqDate(e.target.value)} /></Field>
            <Field label="Clearing status" required><div className="chips" role="group" aria-label="Clearing status">{CHEQUE_STATUSES.map((c) => <button key={c} type="button" className={chqSt === c ? 'on' : ''} onClick={() => setChqSt(c)}>{c}</button>)}</div></Field>
          </>}
          {method === 'GCash' && <>
            <Field label="GCash reference number" required><input value={gref} onChange={(e) => setGref(e.target.value)} /></Field>
            <Field label="Sender name or mobile number" required><input value={sender} onChange={(e) => setSender(e.target.value)} /></Field>
          </>}
          <Field label="Notes" className="full"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
        </div>
        {!edit && verifier && <label className="check"><input type="checkbox" checked={verifyNow} onChange={(e) => setVerifyNow(e.target.checked)} />Verify now (I have confirmed the money was received){method === 'Cheque' ? ' — a cheque still counts only after it is Cleared' : ''}</label>}
        {method === 'Cheque' && <div className="alert info">The invoice is not marked fully paid until the cheque is <b>Cleared</b>.</div>}
        {!verifier && !edit && <div className="small muted"><Badge tone="amber">Pending Verification</Badge> The invoice balance, statement, aging, revenue and profitability update only after Finance / Admin verifies this payment.</div>}
        {edit && <div className="small muted">Last recorded {fmtDateTime(edit.created_at)}. Editing resets the payment to Pending Verification.</div>}
      </div>
    </Modal>
  );
}
