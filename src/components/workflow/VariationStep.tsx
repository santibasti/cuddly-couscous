import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, Modal, SignaturePad, attempt, ask } from '@/components/ui';
import { DraftBar, PresetChips, Stepper } from '@/components/touch';
import { useDraft } from '@/lib/useDraft';
import { PRESETS } from '@/lib/presets';
import { confirmLeave } from '@/lib/sync';
import { approveVariation, createVariation, rejectVariation, updateVariation, type VariationInput } from '@/lib/workflow';
import { docTotals, finalContract, rowPanels, variationTotals } from '@/lib/business';
import { variationPdf } from '@/lib/export';
import { fmtDateTime, money } from '@/lib/util';
import type { Job, JobWorkflow, QuoteItem, Variation } from '@/lib/types';

export function VariationStep({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db } = useAuth();
  const vars = db.variations.filter((v) => v.job_id === job.id && !v.deleted_at && !(v.source === 'final_review' && v.status === 'Draft' && !v.items.length));
  const fc = finalContract(db, job);
  const [edit, setEdit] = useState<Variation | 'new' | null>(null);
  const [sign, setSign] = useState<Variation | null>(null);
  const canAdd = run && !wf.rep_at;
  return (
    <div className="stack">
      <div className="tbl-wrap"><table className="tbl"><tbody>
        <tr><td>Original quotation <span className="muted small">(unchanged)</span></td><td className="num">{money(fc.originalTotal)}</td></tr>
        <tr><td>Approved variations</td><td className="num">{money(fc.variationsTotal)}</td></tr>
        {fc.discount > 0 && <tr><td>Discount granted <span className="muted small">(approved by TopMop management)</span></td><td className="num">− {money(fc.discount)}</td></tr>}
        <tr><th>Final contract value <span className="muted small">(incl. VAT)</span></th><th className="num">{money(fc.payableTotal)}</th></tr>
      </tbody></table></div>
      {vars.map((v) => {
        const t = variationTotals(v);
        return (
          <div key={v.id} className={`itemcard ${v.status === 'Approved' ? 'ok' : v.status === 'Rejected' ? 'bad' : ''}`}>
            <div className="row between"><div><b>{v.number}</b> {v.source === 'final_review' && <Badge tone="gray">Final quote review</Badge>} <Badge tone={v.status === 'Approved' ? 'green' : v.status === 'Rejected' ? 'red' : 'amber'}>{v.status === 'Draft' ? 'Awaiting client approval' : v.status === 'Rejected' ? 'Declined' : v.status}</Badge></div><b>{money(t.total)}</b></div>
            <div className="small">{v.reason}</div>
            <ul className="small" style={{ margin: '6px 0', paddingLeft: 18 }}>{v.items.map((i, k) => <li key={k}>{i.description} — {i.qty} {i.unit} × {money(i.rate)}{i.discount ? ` − ${money(i.discount)}` : ''}</li>)}</ul>
            {v.panel_row_ids.length > 0 && <div className="small muted">Linked panels: {wf.panels.filter((p) => v.panel_row_ids.includes(p.id)).map((p) => `${p.area} ${p.side} (${rowPanels(p)})`).join(', ')}</div>}
            {v.status === 'Approved' && <div className="small muted">Approved by {v.client_name} · {fmtDateTime(v.signed_at)}</div>}
            {v.status === 'Rejected' && <div className="small muted">Offered and declined: {v.notes}</div>}
            {v.source === 'final_review' && v.status === 'Draft' && <div className="small muted">Waiting for the client's decision in step 4 (Client Final Quote Review).</div>}
            <div className="row" style={{ marginTop: 6 }}>
              {run && v.status === 'Draft' && v.source !== 'final_review' && <><button className="btn sm" onClick={() => setEdit(v)}>Edit</button><button className="btn sm primary" onClick={() => setSign(v)}>Client approval &amp; signature</button><button className="btn sm danger" onClick={async () => { const n = await ask('Client declined variation', 'Reason'); if (n) attempt(() => rejectVariation(v.id, n), 'Variation declined'); }}>Declined</button></>}
              <button className="btn sm" onClick={() => attempt(() => variationPdf(db, v))}>PDF</button>
            </div>
          </div>
        );
      })}
      {!vars.length && <div className="muted">No variations. The original quotation is the final contract value.</div>}
      {canAdd && <div><button className="btn navy" onClick={() => setEdit('new')}>+ New variation / final quotation</button></div>}
      {!canAdd && wf.rep_at && <div className="small muted">The service report is signed — variations are closed for this job.</div>}
      {edit && <VariationModal wf={wf} job={job} initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {sign && <ApproveModal v={sign} onClose={() => setSign(null)} />}
    </div>
  );
}

function VariationModal({ wf, job, initial, onClose }: { wf: JobWorkflow; job: Job; initial?: Variation; onClose: () => void }) {
  const { db, can } = useAuth();
  const q = db.quotations.find((x) => x.id === job.quotation_id);
  const [f, setF] = useState<VariationInput>(() => initial ? { reason: initial.reason, items: initial.items, discount: initial.discount, vat_mode: initial.vat_mode, vat_rate: initial.vat_rate, panel_row_ids: initial.panel_row_ids, notes: initial.notes } : { reason: '', items: [], discount: 0, vat_mode: q?.vat_mode ?? 'exclusive', vat_rate: q?.vat_rate ?? db.settings.vat_rate ?? 12, panel_row_ids: [] });
  const t = docTotals(f.items, f.discount, f.vat_mode, f.vat_rate);
  const dr = useDraft(`d:${wf.id}:var:${initial?.id ?? 'new'}`, f, (d) => setF(d));
  const close = () => { if (dr.dirty && !confirmLeave()) return; onClose(); };
  const setItem = (i: number, p: Partial<QuoteItem>) => setF({ ...f, items: f.items.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const extra = wf.panels.filter((p) => p.additional);
  const toggle = (id: string) => setF({ ...f, panel_row_ids: f.panel_row_ids.includes(id) ? f.panel_row_ids.filter((x) => x !== id) : [...f.panel_row_ids, id] });
  const glass = db.services.find((s) => s.code === 'GLASS_EXT');
  const fromPanels = () => {
    const rows = wf.panels.filter((p) => f.panel_row_ids.includes(p.id));
    const ext = rows.reduce((s, r) => s + r.external, 0), int = rows.reduce((s, r) => s + r.internal, 0);
    const rate = glass?.excess_rate ?? glass?.rate ?? 0;
    const add: QuoteItem[] = [];
    if (ext) add.push({ service_code: 'GLASS_EXT', description: `Additional external glass panels (${rows.map((r) => `${r.area} ${r.side}`).join(', ')})`, qty: ext, unit: 'panel', rate, discount: 0 });
    if (int) add.push({ service_code: 'GLASS_INT', description: `Additional internal glass panels (${rows.map((r) => `${r.area} ${r.side}`).join(', ')})`, qty: int, unit: 'panel', rate, discount: 0 });
    setF({ ...f, items: [...f.items, ...add] });
  };
  const save = () => { if (attempt(() => (initial ? updateVariation(initial.id, f) : createVariation(job.id, f)), 'Variation saved')) { dr.markSaved(); onClose(); } };
  return (
    <Modal title={initial ? `Edit ${initial.number}` : 'New variation / final quotation'} size="wide" onClose={close} footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>Save variation</button></>}>
      <div className="stack">
        <DraftBar d={dr} />
        <div className="alert info">The original quotation {q?.number} stays unchanged. This variation adds to it once the client approves and signs.</div>
        <Field label="Reason for variation" required><textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Tap a reason below or type" /><PresetChips replace options={PRESETS.variation} value={f.reason} onChange={(v) => setF({ ...f, reason: v })} /></Field>
        {extra.length > 0 && <div><b>Additional panels counted (step 4)</b><div className="stack" style={{ gap: 4, marginTop: 4 }}>{extra.map((p) => <label key={p.id} className="check"><input type="checkbox" checked={f.panel_row_ids.includes(p.id)} onChange={() => toggle(p.id)} />{p.area} · {p.side} — {p.external} external, {p.internal} internal</label>)}</div>
          <button className="btn sm" style={{ marginTop: 6 }} disabled={!f.panel_row_ids.length} onClick={fromPanels}>Add line items from selected panels</button></div>}
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Description</th><th>Service</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate</th><th className="num">Discount</th><th /></tr></thead><tbody>
          {f.items.map((i, k) => (
            <tr key={k}><td><input value={i.description} onChange={(e) => setItem(k, { description: e.target.value })} aria-label="Description" /></td>
              <td><select value={i.service_code} onChange={(e) => setItem(k, { service_code: e.target.value as QuoteItem['service_code'] })}>{db.services.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></td>
              <td className="num"><Stepper label="Qty" min={0} value={i.qty} onChange={(v) => setItem(k, { qty: v ?? 0 })} /></td><td><input value={i.unit} onChange={(e) => setItem(k, { unit: e.target.value })} style={{ width: 70 }} /></td>
              <td className="num"><input type="number" inputMode="decimal" min="0" step="any" value={i.rate || ''} onChange={(e) => setItem(k, { rate: +e.target.value })} style={{ width: 120 }} aria-label="Rate" /></td><td className="num"><input type="number" min="0" disabled={!can('discount.approve')} title={can('discount.approve') ? undefined : 'Only the Owner / Admin can apply a discount'} value={i.discount || ''} onChange={(e) => setItem(k, { discount: +e.target.value })} style={{ width: 80 }} /></td>
              <td><button className="btn sm danger" onClick={() => setF({ ...f, items: f.items.filter((_, x) => x !== k) })}>✕</button></td></tr>
          ))}
          {!f.items.length && <tr><td colSpan={7} className="muted">No lines yet.</td></tr>}
        </tbody></table></div>
        <button className="btn sm" onClick={() => setF({ ...f, items: [...f.items, { service_code: job.service_codes[0] ?? 'OTHER', description: '', qty: 1, unit: 'lot', rate: 0, discount: 0 }] })}>+ Add line</button>
        <div className="form-grid">{can('discount.approve') && <Field label="Overall discount (₱)" hint="Owner / Admin only. Others use a Discount Request."><input type="number" min="0" value={f.discount || ''} onChange={(e) => setF({ ...f, discount: +e.target.value })} /></Field>}
          <Field label="VAT"><select value={f.vat_mode} onChange={(e) => setF({ ...f, vat_mode: e.target.value as VariationInput['vat_mode'] })}><option value="exclusive">Exclusive</option><option value="inclusive">Inclusive</option><option value="none">None</option></select></Field></div>
        <table className="tbl"><tbody><tr><td>Subtotal</td><td className="num">{money(t.gross)}</td></tr>{t.discount > 0 && <tr><td>Discount</td><td className="num">- {money(t.discount)}</td></tr>}{f.vat_mode !== 'none' && <tr><td>VAT {f.vat_rate}%</td><td className="num">{money(t.vat)}</td></tr>}<tr><th>Revised amount (this variation)</th><th className="num">{money(t.total)}</th></tr></tbody></table>
      </div>
    </Modal>
  );
}

function ApproveModal({ v, onClose }: { v: Variation; onClose: () => void }) {
  const { db } = useAuth();
  const job = db.jobs.find((j) => j.id === v.job_id)!;
  const [name, setName] = useState(db.sites.find((s) => s.id === job.site_id)?.contact_person ?? '');
  const [sig, setSig] = useState<string>();
  const dr = useDraft(`d:${v.job_id}:varsign:${v.id}`, { name, sig }, (d) => { setName(d.name); setSig(d.sig); });
  const close = () => { if (dr.dirty && !confirmLeave()) return; onClose(); };
  return (
    <Modal title={`Client approval – ${v.number}`} onClose={close} footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => approveVariation(v.id, { client_name: name, signature: sig }), 'Variation approved — additional work may begin')) { dr.markSaved(); onClose(); } }}>Approve &amp; sign</button></>}>
      <div className="alert warn" style={{ marginBottom: 10 }}>Additional work must not begin until the client has approved and signed. Variation total: <b>{money(variationTotals(v).total)}</b>.</div>
      <div className="stack">
        <Field label="Client name" required><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Client signature</div><SignaturePad value={sig} onChange={setSig} /></div>
      </div>
    </Modal>
  );
}
