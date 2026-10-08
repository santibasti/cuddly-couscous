// "Service & price": what the client agreed to pay for this booking — approved quotation, approved additional work, and any additional work
// still waiting for the client. The Team Leader checks it with the client on site; it follows the quotation and variations live (an addition
// the Owner makes shows up here at once).
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { VariationModal } from '@/components/workflow/VariationStep';
import { docTotals, finalContract, variationTotals } from '@/lib/business';
import { Badge, Card } from '@/components/ui';
import { Fold } from '@/components/Fold';
import { money } from '@/lib/util';
import type { Job, QuoteItem } from '@/lib/types';

/** Who may see prices: Team Leaders (they verify the price with the client), Operations and the Owner / Finance. Plain crew do not. */
export const useCanSeePrice = () => { const { can } = useAuth(); return can('dispatch.run') || can('sales.view') || can('invoices.view'); };

const lineAmt = (i: QuoteItem) => i.qty * i.rate - i.discount;

export function usePriceView(job: Job) {
  const { db } = useAuth();
  const q = db.quotations.find((x) => x.id === job.quotation_id && !x.deleted_at);
  const vars = db.variations.filter((v) => v.job_id === job.id && !v.deleted_at && v.items.length > 0 && v.status !== 'Rejected');
  const approved = vars.filter((v) => v.status === 'Approved'); const waiting = vars.filter((v) => v.status === 'Draft');
  const fc = finalContract(db, job);
  const qt = q ? docTotals(q.items, q.discount, q.vat_mode, q.vat_rate) : undefined;
  const waitingTotal = waiting.reduce((n, v) => n + variationTotals(v).total, 0);
  return { q, approved, waiting, fc, qt, waitingTotal };
}

const Lines = ({ items }: { items: QuoteItem[] }) => (
  <ul className="list" style={{ margin: 0 }}>{items.map((i, k) => <li key={k}><span>{i.description}<div className="small muted">{i.qty.toLocaleString('en-PH')} {i.unit} × {money(i.rate)}{i.discount ? ` − ${money(i.discount)}` : ''}</div></span><b className="mono">{money(lineAmt(i))}</b></li>)}</ul>
);

/** `step` = the workflow step on screen (0-6, -1 before the workflow starts). The full card shows before Scope Approval; Scope Approval already
 *  carries the quotation, so it is left out there; after it the card folds into one line. */
export function ServicePriceCard({ job, step = -1 }: { job: Job; step?: number }) {
  const ok = useCanSeePrice(); const { can } = useAuth(); const [add, setAdd] = useState(false);
  const canAdd = can('jobs.edit') && can('dispatch.run') && ['Confirmed', 'Dispatch Checklist Pending', 'Dispatched', 'On Site', 'In Progress'].includes(job.status);
  const { q, approved, waiting, fc, qt, waitingTotal } = usePriceView(job);
  if (!ok || step === 3) return null;
  if (!q && !approved.length && !waiting.length) return <Card title="Service & price"><div className="small muted">No approved quotation is linked to this booking yet.</div></Card>;
  const body = (
    <Card title={step >= 4 ? undefined : 'Service & price'} actions={step >= 4 ? undefined : <span className="small muted">Verify this with the client on site</span>}>
      {q && <>
        <div className="row between" style={{ marginBottom: 4 }}><b>Quotation {q.number}</b><Badge tone="green">{q.status}</Badge></div>
        {q.scope && <div className="small" style={{ marginBottom: 6 }}>{q.scope}</div>}
        <Lines items={q.items} />
        {qt && <div className="small" style={{ marginTop: 6, display: 'grid', gap: 2 }}>
          {qt.discount > 0 && <div className="row between"><span className="muted">Discount</span><span>− {money(qt.discount)}</span></div>}
          {q.vat_mode !== 'none' && <div className="row between"><span className="muted">VAT {q.vat_rate}%{q.vat_mode === 'inclusive' ? ' (included)' : ''}</span><span>{money(qt.vat)}</span></div>}
          <div className="row between"><b>Quotation total</b><b>{money(qt.total)}</b></div></div>}
        {q.payment_option && <div className="small muted" style={{ marginTop: 4 }}>Payment: {q.payment_option === 'completion' ? 'upon job completion' : `net ${q.payment_option.replace('net_', '')} days`}</div>}
      </>}
      {approved.map((v) => <div key={v.id} style={{ marginTop: 12 }}><div className="row between"><b>Additional work {v.number}</b><Badge tone="green">Approved by client</Badge></div>{v.reason && <div className="small muted">{v.reason}</div>}<Lines items={v.items} /><div className="row between small" style={{ marginTop: 4 }}><span className="muted">Total incl. VAT</span><b>{money(variationTotals(v).total)}</b></div></div>)}
      {waiting.map((v) => <div key={v.id} className="alert warn" style={{ marginTop: 12 }}><div className="row between"><b>Additional work {v.number}</b><Badge tone="amber">Waiting for the client's OK</Badge></div>{v.reason && <div className="small">{v.reason}</div>}<Lines items={v.items} /><div className="row between small" style={{ marginTop: 4 }}><span>Total incl. VAT</span><b>{money(variationTotals(v).total)}</b></div><div className="small muted">The Team Leader gets the client's signature on site, in the Scope Approval step.</div></div>)}
      {canAdd && <div style={{ marginTop: 10 }}><button className="btn sm navy" onClick={() => setAdd(true)}>+ Add extra work to this booking</button><span className="small muted"> — shows here for the Team Leader; the client approves it on site</span></div>}
      {add && <VariationModal job={job} onClose={() => setAdd(false)} />}
      <div className="alert info" style={{ marginTop: 12, marginBottom: 0 }}>
        <div className="row between"><span>Agreed contract value</span><b>{money(fc.payableTotal)}</b></div>
        {waiting.length > 0 && <div className="row between"><span>If the client also approves the additional work</span><b>{money(fc.payableTotal + waitingTotal)}</b></div>}
        {fc.discount > 0 && <div className="small">Includes an approved management discount of {money(fc.discount)}.</div>}
      </div>
    </Card>
  );
  return step >= 4 ? <Fold title="Service & price" hint={<>{money(fc.payableTotal)} · tap to see the lines</>}>{body}</Fold> : body;
}

/** One-line version for the confirmation banner. */
export function PriceLine({ job }: { job: Job }) {
  const ok = useCanSeePrice(); const { fc, waiting, waitingTotal, q } = usePriceView(job);
  if (!ok || (!q && !fc.payableTotal)) return null;
  return <><b>{money(fc.payableTotal)}</b> incl. VAT{q ? ` (quotation ${q.number})` : ''}{waiting.length > 0 && <span style={{ color: 'var(--amber)' }}> · +{money(waitingTotal)} additional work waiting for the client</span>}</>;
}
