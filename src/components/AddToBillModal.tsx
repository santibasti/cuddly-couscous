// "Add to total bill": a charge the client has already agreed to (more panels, an extra area …), with a short message so everyone knows why.
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Field, Modal, attempt } from '@/components/ui';
import { addToBill } from '@/lib/workflow';
import { docTotals, finalContract } from '@/lib/business';
import { money } from '@/lib/util';
import type { Job } from '@/lib/types';

const HOW = ['Signed by the client', 'Client message (chat / email)', 'Phone call', 'In person'];
const UNITS = ['panel', 'sqm', 'unit', 'lot'];

export function AddToBillModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const { db } = useAuth();
  const q = db.quotations.find((x) => x.id === job.quotation_id);
  const glass = db.services.find((s) => s.code === 'GLASS_EXT');
  const [f, setF] = useState({ description: 'Additional glass panels', qty: 0, unit: 'panel', rate: glass?.excess_rate ?? glass?.rate ?? 0, message: '', agreed_by: db.sites.find((x) => x.id === job.site_id)?.contact_person ?? '', agreed_via: HOW[1] });
  const vat_mode = q?.vat_mode ?? 'exclusive', vat_rate = q?.vat_rate ?? db.settings.vat_rate ?? 12;
  const t = docTotals([{ service_code: job.service_codes[0] ?? 'OTHER', description: f.description, qty: f.qty || 0, unit: f.unit, rate: f.rate || 0, discount: 0 }], 0, vat_mode, vat_rate);
  const fc = finalContract(db, job);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  return (
    <Modal title={`Add to total bill — ${job.number}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => addToBill(job.id, f), 'Added to the total bill')) onClose(); }}>Add to bill</button></>}>
      <div className="stack">
        <div className="alert info">Use this when the client has already agreed to the extra charge. It is added to the final bill and the invoice, and the team can see why.</div>
        <Field label="What is being added" required><input value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Additional glass panels" /></Field>
        <div className="form-grid">
          <Field label="How many" required><input type="number" inputMode="decimal" min="0" step="any" value={f.qty || ''} onChange={(e) => set({ qty: +e.target.value })} placeholder="e.g. 92" /></Field>
          <Field label="Unit"><select value={f.unit} onChange={(e) => set({ unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
          <Field label="Rate per unit (₱)" required><input type="number" inputMode="decimal" min="0" step="any" value={f.rate || ''} onChange={(e) => set({ rate: +e.target.value })} /></Field>
        </div>
        <Field label="Message" required hint="Why it was added, shown on the bill record."><textarea value={f.message} onChange={(e) => set({ message: e.target.value })} placeholder="e.g. 92 additional panels found on the east side — client agreed on site" /></Field>
        <div className="form-grid">
          <Field label="Agreed by (client)" required><input value={f.agreed_by} onChange={(e) => set({ agreed_by: e.target.value })} /></Field>
          <Field label="How they agreed"><select value={f.agreed_via} onChange={(e) => set({ agreed_via: e.target.value })}>{HOW.map((h) => <option key={h}>{h}</option>)}</select></Field>
        </div>
        <table className="tbl"><tbody>
          <tr><td>This addition</td><td className="num">{money(t.gross)}</td></tr>
          {vat_mode !== 'none' && <tr><td>VAT {vat_rate}%</td><td className="num">{money(t.vat)}</td></tr>}
          <tr><td>Bill now</td><td className="num">{money(fc.payableTotal)}</td></tr>
          <tr><th>Total bill after adding</th><th className="num">{money(fc.payableTotal + t.total)}</th></tr>
        </tbody></table>
      </div>
    </Modal>
  );
}
