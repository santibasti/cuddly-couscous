// "Remove from the booking": the client dropped part of it (e.g. booked 2 packages, wants 1). Office only. Taken off the final bill and the invoice; the crew's Job Order shows what was removed.
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Field, Modal, attempt } from '@/components/ui';
import { reduceBill } from '@/lib/workflow';
import { docTotals, finalContract } from '@/lib/business';
import { money } from '@/lib/util';
import type { Job } from '@/lib/types';

const HOW = ['Client message (chat / email)', 'Phone call', 'In person', 'Signed by the client'];

export function RemoveFromBillModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const { db } = useAuth();
  const q = db.quotations.find((x) => x.id === job.quotation_id);
  const lines = (q?.items ?? []).filter((i) => !i.measure);
  const first = lines[0];
  const [f, setF] = useState({ description: first?.description ?? '', qty: first?.qty ?? 0, unit: first?.unit ?? 'lot', rate: first?.rate ?? 0, message: '', agreed_by: db.sites.find((x) => x.id === job.site_id)?.contact_person ?? '', agreed_via: HOW[0] });
  const vat_mode = q?.vat_mode ?? 'exclusive', vat_rate = q?.vat_rate ?? db.settings.vat_rate ?? 12;
  const t = docTotals([{ service_code: job.service_codes[0] ?? 'OTHER', description: f.description, qty: f.qty || 0, unit: f.unit, rate: f.rate || 0, discount: 0 }], 0, vat_mode, vat_rate);
  const fc = finalContract(db, job);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const pick = (i: number) => { const l = lines[i]; if (l) set({ description: l.description, qty: l.qty, unit: l.unit, rate: l.rate }); };
  return (
    <Modal title={`Remove from the booking — ${job.number}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => reduceBill(job.id, f), 'Removed from the booking')) onClose(); }}>Remove from bill</button></>}>
      <div className="stack">
        <div className="alert info">Use this when the client dropped part of the booking (for example 2 packages booked, only 1 wanted). It is taken off the final bill and the invoice, and the crew's Job Order shows what was removed. The original quotation is never changed.</div>
        {lines.length > 0 && <Field label="Pick the line to remove"><select onChange={(e) => pick(+e.target.value)}>{lines.map((l, i) => <option key={i} value={i}>{l.description || l.service_code} — {l.qty} {l.unit} × {money(l.rate)}</option>)}</select></Field>}
        <Field label="What is being removed" required><input value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Package 2 — Solar panel cleaning" /></Field>
        <div className="form-grid">
          <Field label="How many removed" required><input type="number" inputMode="decimal" min="0" step="any" value={f.qty || ''} onChange={(e) => set({ qty: +e.target.value })} /></Field>
          <Field label="Unit"><input value={f.unit} onChange={(e) => set({ unit: e.target.value })} /></Field>
          <Field label="Rate per unit (₱)" required><input type="number" inputMode="decimal" min="0" step="any" value={f.rate || ''} onChange={(e) => set({ rate: +e.target.value })} /></Field>
        </div>
        <Field label="Message" required hint="Why it was removed; shown on the bill record."><textarea value={f.message} onChange={(e) => set({ message: e.target.value })} placeholder="e.g. Client decided on site to keep only 1 package" /></Field>
        <div className="form-grid">
          <Field label="Asked by (client)" required><input value={f.agreed_by} onChange={(e) => set({ agreed_by: e.target.value })} /></Field>
          <Field label="How they told us"><select value={f.agreed_via} onChange={(e) => set({ agreed_via: e.target.value })}>{HOW.map((h) => <option key={h}>{h}</option>)}</select></Field>
        </div>
        <table className="tbl"><tbody>
          <tr><td>Removed</td><td className="num">− {money(t.gross)}</td></tr>
          {vat_mode !== 'none' && <tr><td>VAT {vat_rate}%</td><td className="num">− {money(t.vat)}</td></tr>}
          <tr><td>Bill now</td><td className="num">{money(fc.payableTotal)}</td></tr>
          <tr><th>Total bill after removing</th><th className="num">{money(Math.max(0, fc.payableTotal - t.total))}</th></tr>
        </tbody></table>
      </div>
    </Modal>
  );
}
