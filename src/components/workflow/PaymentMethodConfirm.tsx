import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, attempt } from '@/components/ui';
import { Stepper } from '@/components/touch';
import { useDraft } from '@/lib/useDraft';
import { Confirm } from './shared';
import { confirmPaymentMethod, paymentBalance, type PaymentConfirmInput } from '@/lib/workflow';
import { CONFIRM_METHODS, finalQuoteSummary, paymentPlanLabel, paymentStatusLabel } from '@/lib/business';
import { fmtDate, fmtDateTime, money, today } from '@/lib/util';
import type { ConfirmMethod, Job, JobWorkflow } from '@/lib/types';

/**
 * Payment Method Confirmation: shown at the top of Client Handover. The Team Leader asks the client how payment will be made.
 * It never blocks the handover or the service report signature; Finance verifies any money separately.
 */
export function PaymentMethodConfirm({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db } = useAuth();
  const saved = db.payment_confirmations.find((c) => c.job_id === job.id && !c.deleted_at);
  const pay = saved?.payment_id ? db.payments.find((p) => p.id === saved.payment_id) : undefined;
  const sm = finalQuoteSummary(db, job, { deposit: wf.conf_deposit });
  const [editing, setEditing] = useState(!saved);
  const [method, setMethod] = useState<ConfirmMethod | ''>(saved?.method ?? '');
  const [collection, setCollection] = useState<'Received' | 'To Be Paid Later' | ''>(saved?.collection ?? '');
  const [amount, setAmount] = useState<number | undefined>(saved?.expected_today || undefined);
  const [note, setNote] = useState(saved?.note ?? '');
  const [gref, setGref] = useState(saved?.gcash_ref ?? '');
  const [bank, setBank] = useState(saved?.bank_name ?? '');
  const [tref, setTref] = useState(saved?.transfer_ref ?? '');
  const [chqNo, setChqNo] = useState(saved?.cheque_no ?? '');
  const [chqDate, setChqDate] = useState(saved?.cheque_date ?? today());
  const [terms, setTerms] = useState(saved?.terms ?? '');
  const [due, setDue] = useState(saved?.due_date ?? '');
  const [ok, setOk] = useState(false);
  const isTerms = method === 'Terms / To Be Billed';
  const bal = paymentBalance(job, wf, isTerms ? 0 : amount ?? 0);
  const form = (): PaymentConfirmInput => ({ method: method as ConfirmMethod, collection: collection || undefined, expected_today: amount, note, confirmed: ok, gcash_ref: gref, bank_name: bank, transfer_ref: tref, cheque_no: chqNo, cheque_date: chqDate, terms, due_date: due || undefined });
  const dr = useDraft(`d:${wf.id}:paymethod`, { method, collection, amount, note, gref, bank, tref, chqNo, chqDate, terms, due }, (d) => { setMethod(d.method); setCollection(d.collection); setAmount(d.amount); setNote(d.note); setGref(d.gref); setBank(d.bank); setTref(d.tref); setChqNo(d.chqNo); setChqDate(d.chqDate); setTerms(d.terms); setDue(d.due); }, run && editing && !pay);
  const save = () => { if (attempt(() => confirmPaymentMethod(job.id, form()), 'Payment method confirmed')) { dr.markSaved(); setEditing(false); setOk(false); } };
  const pick = (m: ConfirmMethod) => { setMethod(m); if (m === 'Terms / To Be Billed') setCollection('To Be Paid Later'); else if (collection === 'To Be Paid Later' && saved?.method === 'Terms / To Be Billed') setCollection(''); };

  const head = (
    <>
      <div className="row between"><b>Payment method</b><span className="small muted">Asked of the client at handover · does not hold up the signatures</span></div>
      <table className="tbl finalsum" style={{ marginTop: 6 }}><tbody>
        <tr><td>Original Quote Total</td><td className="num">{money(sm.originalTotal)}</td></tr>
        {sm.additionalTotal > 0 && <tr className="sub"><td>Approved additional work</td><td className="num">{money(sm.additionalTotal)}</td></tr>}
        {sm.granted > 0 && <tr className="sub"><td>Discount (approved by management)</td><td className="num">− {money(sm.granted)}</td></tr>}
        <tr className="big"><td>Final approved bill (incl. VAT)</td><td className="num">{money(sm.finalTotal)}</td></tr>
        {sm.deposit > 0 && <tr className="sub"><td>Less: deposit / prior payment</td><td className="num">− {money(sm.deposit)}</td></tr>}
      </tbody></table>
    </>
  );

  if (saved && !editing) {
    return (
      <div className="card" style={{ padding: 12 }}>
        {head}
        <dl className="kv" style={{ marginTop: 8 }}>
          <dt>Client will pay by</dt><dd><b>{paymentPlanLabel(saved)}</b></dd>
          <dt>Expected today</dt><dd>{money(saved.expected_today)}</dd>
          <dt>Balance to bill / collect later</dt><dd><b>{money(saved.balance_later)}</b></dd>
          {saved.method === 'GCash' && <><dt>GCash ref</dt><dd>{saved.gcash_ref}</dd></>}
          {saved.method === 'Bank Transfer' && <><dt>Bank / reference</dt><dd>{saved.bank_name} · {saved.transfer_ref}</dd></>}
          {saved.method === 'Cheque' && <><dt>Cheque</dt><dd>{saved.bank_name} · #{saved.cheque_no} · {fmtDate(saved.cheque_date)}</dd></>}
          {saved.terms && <><dt>Agreed terms</dt><dd>{saved.terms}</dd></>}{saved.due_date && <><dt>Due date</dt><dd>{fmtDate(saved.due_date)}</dd></>}
          {saved.note && <><dt>Client note</dt><dd>{saved.note}</dd></>}
          <dt>Confirmed by</dt><dd>{db.users.find((u) => u.id === saved.confirmed_by)?.name} · {fmtDateTime(saved.confirmed_at)}</dd>
        </dl>
        {saved.collection === 'Received' && (
          <div className="alert info" style={{ marginTop: 8 }}>
            {pay ? <>Payment <b>{pay.receipt_no}</b> <Badge tone={pay.status === 'Verified' ? 'green' : 'amber'}>{pay.status === 'Pending Verification' ? 'Pending Finance Verification' : paymentStatusLabel(pay)}</Badge> — Finance verifies it separately.</>
              : <>The payment entry (Pending Finance Verification) is created automatically as soon as Finance approves the invoice.</>}
          </div>
        )}
        {run && !pay && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setEditing(true)}>Change</button>}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      {head}
      {!run ? <div className="small muted" style={{ marginTop: 8 }}>The Team Leader records the client’s payment method here.</div> : (
        <div className="stack" style={{ marginTop: 10 }}>
          <Field label="How will the client pay?" required>
            <div className="chips big" role="group" aria-label="Payment method">{CONFIRM_METHODS.map((m) => <button key={m} type="button" className={method === m ? 'on' : ''} onClick={() => pick(m)}>{m}</button>)}</div>
          </Field>
          {method && !isTerms && (
            <Field label="Payment" required>
              <div className="chips" role="group" aria-label="Payment received or later">{(['Received', 'To Be Paid Later'] as const).map((c) => <button key={c} type="button" className={collection === c ? 'on' : ''} onClick={() => setCollection(c)}>{c}</button>)}</div>
            </Field>
          )}
          {method && !isTerms && collection && (
            <Field label={collection === 'Received' ? (method === 'Cash' ? 'Amount received (₱)' : 'Amount received (₱)') : 'Amount expected to be paid today (₱, optional)'} required={collection === 'Received'} hint={`Balance due ${money(bal.due)}`}>
              <Stepper label="Amount" min={0} step={100} value={amount} onChange={setAmount} />
            </Field>
          )}
          {collection === 'Received' && method === 'GCash' && <Field label="GCash reference number" required><input value={gref} onChange={(e) => setGref(e.target.value)} /></Field>}
          {collection === 'Received' && method === 'Bank Transfer' && <div className="form-grid"><Field label="Bank name" required><input value={bank} onChange={(e) => setBank(e.target.value)} /></Field><Field label="Transfer reference number" required><input value={tref} onChange={(e) => setTref(e.target.value)} /></Field></div>}
          {collection === 'Received' && method === 'Cheque' && <div className="form-grid"><Field label="Bank name" required><input value={bank} onChange={(e) => setBank(e.target.value)} /></Field><Field label="Cheque number" required><input value={chqNo} onChange={(e) => setChqNo(e.target.value)} /></Field><Field label="Cheque date" required><input type="date" value={chqDate} onChange={(e) => setChqDate(e.target.value)} /></Field></div>}
          {isTerms && <div className="form-grid"><Field label="Agreed payment terms" required hint="Terms or a due date is required"><input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. Net 30, bill to accounts payable" /></Field><Field label="Due date"><input type="date" min={today()} value={due} onChange={(e) => setDue(e.target.value)} /></Field></div>}
          {method && (
            <>
              <div className="finalsum card" style={{ padding: 10 }}>
                <div className="row between"><span>Final approved bill</span><b>{money(bal.finalBill)}</b></div>
                {bal.deposit > 0 && <div className="row between"><span>Less: deposit / prior payment</span><b>− {money(bal.deposit)}</b></div>}
                <div className="row between"><span>Expected today</span><b>{money(isTerms ? 0 : amount ?? 0)}</b></div>
                <div className="row between big"><span>Balance to bill / collect later</span><b>{money(bal.remaining)}</b></div>
              </div>
              <Field label="Client payment note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Will transfer on Friday" /></Field>
              {collection === 'Received' && <div className="alert info">Money received is saved as a payment <b>Pending Finance Verification</b>. Only Finance / Admin can verify it.</div>}
              <Confirm checked={ok} onChange={setOk}>I confirmed this payment arrangement with the client.</Confirm>
              <div className="row"><button className="btn primary lg" disabled={!ok || !method} onClick={save}>Save payment method</button>{saved && <button className="btn lg" onClick={() => setEditing(false)}>Cancel</button>}<span className="small muted">Optional — you can sign the handover without it.</span></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
