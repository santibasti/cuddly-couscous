import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '@/ctx';
import { CATEGORIES, DOC_TYPES, PAYMENT_METHODS, checkReceipt, formatTin, hasErrors, num, round2, splitVat } from '@/lib/bir';
import type { Receipt } from '@/lib/types';

const LOW = 0.6;

export default function ReceiptEditor({ initial, onClose }: { initial: Receipt; onClose: () => void }) {
  const { api, company, receipts, canWrite, reload } = useApp();
  const [r, setR] = useState<Receipt>(initial);
  const [img, setImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isNew = !receipts.some((x) => x.id === initial.id);

  useEffect(() => {
    let live = true;
    if (initial.imagePath) api.imageUrl(initial.imagePath).then((u) => live && setImg(u));
    return () => { live = false; };
  }, [api, initial.imagePath]);

  const issues = useMemo(() => checkReceipt(r, receipts, company), [r, receipts, company]);
  const set = <K extends keyof Receipt>(k: K, v: Receipt[K]) => setR((p) => ({ ...p, [k]: v }));
  const money = (k: 'vatable' | 'vatAmount' | 'vatExempt' | 'zeroRated' | 'total' | 'withholdingTax') => (v: string) => set(k, num(v));
  const cls = (k: string) => (issues.some((i) => i.field === k && i.severity === 'error') ? 'bad' : (r.confidence[k] ?? 1) < LOW ? 'low' : '');

  async function save(status: Receipt['status']) {
    setBusy(true); setErr('');
    try { await api.saveReceipt({ ...r, status }); await reload(); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  async function remove() {
    if (!confirm('Delete this receipt? This cannot be undone.')) return;
    setBusy(true);
    try { await api.deleteReceipt(r.id); await reload(); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  const computeVat = () => { const s = splitVat(r.total); setR((p) => ({ ...p, vatable: s.vatable, vatAmount: s.vat, vatExempt: 0, zeroRated: 0 })); };

  const F = ({ k, label, children }: { k: string; label: string; children: ReactNode }) => (
    <label className={`f ${cls(k)}`}><span className="lbl">{label}</span>{children}</label>
  );
  const ro = !canWrite;

  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Receipt details" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="row between" style={{ marginBottom: '.75rem' }}>
          <h2 style={{ margin: 0 }}>{isNew ? 'Review new receipt' : 'Receipt details'} {r.status === 'verified' ? <span className="chip ok">Verified</span> : <span className="chip warn">Needs review</span>}</h2>
          <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="split">
          <div className="pad-img">
            {img ? <img src={img} alt="Receipt" /> : <div className="card muted">{r.imagePath ? 'Loading photo…' : 'No photo attached'}</div>}
            {img && <a className="small" href={img} target="_blank" rel="noreferrer">Open full size</a>}
          </div>
          <div className="stack">
            {Object.keys(r.confidence).length > 0 && <div className="notice info small">Highlighted fields were hard to read — please check them against the photo.</div>}
            <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="form">
                <F k="docType" label="Document type"><select value={r.docType} onChange={(e) => set('docType', e.target.value as Receipt['docType'])}>{DOC_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></F>
                <F k="invoiceNo" label="Invoice / OR no."><input value={r.invoiceNo} onChange={(e) => set('invoiceNo', e.target.value)} /></F>
                <F k="date" label="Date"><input type="date" value={r.date} onChange={(e) => set('date', e.target.value)} /></F>
                <F k="supplierName" label="Supplier name"><input value={r.supplierName} onChange={(e) => set('supplierName', e.target.value)} /></F>
                <F k="supplierTin" label="Supplier TIN"><input inputMode="numeric" placeholder="000-000-000-00000" value={r.supplierTin} onChange={(e) => set('supplierTin', formatTin(e.target.value))} /></F>
                <F k="supplierVatRegistered" label="Supplier is"><select value={r.supplierVatRegistered ? 'vat' : 'non'} onChange={(e) => set('supplierVatRegistered', e.target.value === 'vat')}><option value="vat">VAT-registered</option><option value="non">NON-VAT</option></select></F>
                <div className="full"><F k="supplierAddress" label="Supplier address"><input value={r.supplierAddress} onChange={(e) => set('supplierAddress', e.target.value)} /></F></div>
                <F k="total" label="Total amount (₱)"><input inputMode="decimal" value={r.total || ''} onChange={(e) => money('total')(e.target.value)} /></F>
                <F k="vatable" label="VATable (₱)"><input inputMode="decimal" value={r.vatable || ''} onChange={(e) => money('vatable')(e.target.value)} /></F>
                <F k="vatAmount" label="Input VAT 12% (₱)"><input inputMode="decimal" value={r.vatAmount || ''} onChange={(e) => money('vatAmount')(e.target.value)} /></F>
                <F k="vatExempt" label="VAT-exempt (₱)"><input inputMode="decimal" value={r.vatExempt || ''} onChange={(e) => money('vatExempt')(e.target.value)} /></F>
                <F k="zeroRated" label="Zero-rated (₱)"><input inputMode="decimal" value={r.zeroRated || ''} onChange={(e) => money('zeroRated')(e.target.value)} /></F>
                <F k="withholdingTax" label="Tax withheld (₱)"><input inputMode="decimal" value={r.withholdingTax || ''} onChange={(e) => money('withholdingTax')(e.target.value)} /></F>
                <F k="atc" label="ATC (if withheld)"><input value={r.atc} onChange={(e) => set('atc', e.target.value.toUpperCase())} /></F>
                <F k="category" label="Category"><select value={r.category} onChange={(e) => set('category', e.target.value)}>{[...new Set([...CATEGORIES, r.category])].map((c) => <option key={c}>{c}</option>)}</select></F>
                <F k="purchaseType" label="Purchase of"><select value={r.purchaseType} onChange={(e) => set('purchaseType', e.target.value as Receipt['purchaseType'])}><option value="goods">Goods</option><option value="services">Services</option><option value="capital">Capital goods</option></select></F>
                <F k="paymentMethod" label="Paid by"><select value={r.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>{[...new Set([...PAYMENT_METHODS, r.paymentMethod])].map((c) => <option key={c}>{c}</option>)}</select></F>
                <label className="row" style={{ gap: '.5rem', alignSelf: 'end' }}><input type="checkbox" checked={r.deductible} onChange={(e) => set('deductible', e.target.checked)} /> Deductible business expense</label>
                <div className="full"><F k="notes" label="Notes"><textarea rows={2} value={r.notes} onChange={(e) => set('notes', e.target.value)} /></F></div>
              </div>
              <div className="row" style={{ marginTop: '.5rem' }}>
                <button type="button" onClick={computeVat} disabled={!r.total}>Compute VAT from total</button>
                <span className="small muted">Splits a VAT-inclusive total: vatable = total ÷ 1.12</span>
              </div>
            </fieldset>

            {issues.length > 0 && (
              <ul className="issues" aria-label="Checks">
                {issues.map((i, n) => <li key={n} className={i.severity}>{i.severity === 'error' ? '⛔' : '⚠️'} {i.message}</li>)}
              </ul>
            )}
            {issues.length === 0 && <div className="notice ok">All checks passed. Subtotals: {round2(r.vatable + r.vatAmount + r.vatExempt + r.zeroRated).toFixed(2)}</div>}
            {err && <div className="notice bad" role="alert">{err}</div>}

            <div className="row between">
              {!isNew && !ro ? <button className="danger" onClick={remove} disabled={busy}>Delete</button> : <span />}
              {!ro && (
                <div className="row">
                  <button onClick={() => save('needs_review')} disabled={busy}>Save for later</button>
                  <button className="primary" onClick={() => save('verified')} disabled={busy || hasErrors(issues)} title={hasErrors(issues) ? 'Fix the red items first' : ''}>Save & verify</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
