import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, PhotoInput, SignaturePad, attempt } from '@/components/ui';
import { Confirm } from './shared';
import { PANEL_AREAS, PANEL_SIDES, savePanels, signConforme } from '@/lib/workflow';
import { countPanels, docTotals, panelTotals, quotedPanels, rowPanels } from '@/lib/business';
import { fmtDateTime, money } from '@/lib/util';
import { conformePdf } from '@/lib/export';
import type { Job, JobWorkflow, PanelRow } from '@/lib/types';

const newRow = (): PanelRow => ({ id: crypto.randomUUID(), area: '1st Floor', side: 'Front', external: 0, internal: 0 });

/** Glass panel-counting table: Area/Floor | Side/Location | External | Internal | Total | Notes — totals are automatic. */
export function PanelTable({ wf, editable }: { wf: JobWorkflow; editable: boolean }) {
  const { db } = useAuth();
  const [rows, setRows] = useState<PanelRow[]>(wf.panels);
  useEffect(() => setRows(wf.panels), [wf.panels]);
  const [calc, setCalc] = useState({ w: 2, h: 1, qty: 1, grouped: false, kind: 'external' as 'external' | 'internal', row: '' });
  const t = panelTotals(rows);
  const set = (id: string, p: Partial<PanelRow>) => setRows((a) => a.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const q = db.quotations.find((x) => x.id === wf.conf_quotation_id) ?? db.quotations.find((x) => x.id === db.jobs.find((j) => j.id === wf.job_id)?.quotation_id);
  const quoted = quotedPanels(db, q);
  const cp = countPanels([{ w: calc.w, h: calc.h, qty: calc.qty, grouped: calc.grouped }], db.settings.glass_group_size);
  const dirty = JSON.stringify(rows) !== JSON.stringify(wf.panels);
  const numIn = (r: PanelRow, k: 'external' | 'internal') => <input type="number" min="0" inputMode="numeric" disabled={!editable} value={r[k] || ''} onChange={(e) => set(r.id, { [k]: Math.max(0, +e.target.value || 0) })} style={{ width: 80 }} aria-label={`${k} panels ${r.area} ${r.side}`} />;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between"><b>Glass panel count</b>{quoted > 0 && <span className="small muted">Quoted: {quoted} panels{t.total > quoted && <> · counted {t.total} (<b>{t.total - quoted} more</b>)</>}</span>}</div>
      <div className="small muted">Up to 2 m × 1 m = 1 panel · larger than 2 m × 1 m = 2 panels · smaller standard windows still count as 1 · small sections may be grouped into 1.</div>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Area / Floor</th><th>Side / Location</th><th className="num">External</th><th className="num">Internal</th><th className="num">Total</th><th>Notes</th>{editable && <th>Extra</th>}{editable && <th />}</tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{editable ? <select value={r.area} onChange={(e) => set(r.id, { area: e.target.value })}>{PANEL_AREAS.map((a) => <option key={a}>{a}</option>)}</select> : r.area}</td>
            <td>{editable ? <select value={r.side} onChange={(e) => set(r.id, { side: e.target.value })}>{PANEL_SIDES.map((a) => <option key={a}>{a}</option>)}</select> : r.side}</td>
            <td className="num">{editable ? numIn(r, 'external') : r.external}</td><td className="num">{editable ? numIn(r, 'internal') : r.internal}</td>
            <td className="num"><b>{rowPanels(r)}</b></td>
            <td>{editable ? <input value={r.notes ?? ''} onChange={(e) => set(r.id, { notes: e.target.value })} aria-label="Notes" /> : <>{r.notes}{r.additional && <> <Badge tone="amber">additional</Badge></>}</>}</td>
            {editable && <td><label className="check" title="Beyond the quoted scope — can be added to a variation"><input type="checkbox" checked={!!r.additional} onChange={(e) => set(r.id, { additional: e.target.checked })} />Add’l</label></td>}
            {editable && <td><button className="btn sm danger" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} aria-label="Remove row">✕</button></td>}
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={8} className="muted">No areas counted yet.</td></tr>}
      </tbody><tfoot><tr><th colSpan={2}>Total</th><th className="num">{t.external}</th><th className="num">{t.internal}</th><th className="num">{t.total}</th><th colSpan={3}>{t.additional > 0 && <Badge tone="amber">{t.additional} additional panels</Badge>}</th></tr></tfoot></table></div>
      {editable && (
        <>
          <div className="row"><button className="btn sm" onClick={() => setRows([...rows, newRow()])}>+ Add area</button>{dirty && <button className="btn sm primary" onClick={() => attempt(() => savePanels(wf.id, rows), 'Panel count saved')}>Save panel count</button>}</div>
          <details><summary className="small" style={{ cursor: 'pointer' }}>Count by window size</summary>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <Field label="Width (m)"><input type="number" step="0.1" min="0" value={calc.w} onChange={(e) => setCalc({ ...calc, w: +e.target.value })} /></Field>
              <Field label="Height (m)"><input type="number" step="0.1" min="0" value={calc.h} onChange={(e) => setCalc({ ...calc, h: +e.target.value })} /></Field>
              <Field label="How many windows"><input type="number" min="1" value={calc.qty} onChange={(e) => setCalc({ ...calc, qty: +e.target.value })} /></Field>
              <Field label="Small sections to group"><label className="check"><input type="checkbox" checked={calc.grouped} onChange={(e) => setCalc({ ...calc, grouped: e.target.checked })} />Group (≤ 0.5 m² each, {db.settings.glass_group_size} = 1 panel)</label></Field>
              <Field label="Add to row"><select value={calc.row} onChange={(e) => setCalc({ ...calc, row: e.target.value })}><option value="">New row</option>{rows.map((r) => <option key={r.id} value={r.id}>{r.area} · {r.side}</option>)}</select></Field>
              <Field label="Side counted"><select value={calc.kind} onChange={(e) => setCalc({ ...calc, kind: e.target.value as 'external' | 'internal' })}><option value="external">External</option><option value="internal">Internal</option></select></Field>
            </div>
            <div className="row" style={{ marginTop: 6 }}><Badge tone="teal">= {cp.panels} panel{cp.panels === 1 ? '' : 's'}</Badge><span className="small muted">{cp.detail[0]?.label}</span>
              <button className="btn sm" onClick={() => { if (calc.row) set(calc.row, { [calc.kind]: (rows.find((r) => r.id === calc.row)![calc.kind] || 0) + cp.panels }); else setRows([...rows, { ...newRow(), [calc.kind]: cp.panels }]); }}>Add to count</button></div>
          </details>
        </>
      )}
    </div>
  );
}

export function ConformeStep({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db } = useAuth();
  const q = db.quotations.find((x) => x.id === (wf.conf_quotation_id ?? job.quotation_id));
  const t = q ? docTotals(q.items, q.discount, q.vat_mode, q.vat_rate) : undefined;
  const client = db.clients.find((c) => c.id === job.client_id)!; const site = db.sites.find((s) => s.id === job.site_id);
  const signed = !!wf.conf_at;
  const [name, setName] = useState(site?.contact_person ?? ''); const [sig, setSig] = useState<string>(); const [file, setFile] = useState<{ data: string; name: string }>();
  const [notes, setNotes] = useState(''); const [ok, setOk] = useState(false);
  return (
    <div className="stack">
      <div className="card" style={{ padding: 12 }}>
        <div className="row between"><b>Original quotation {q?.number ?? '—'}</b><Badge tone="gray">retained unchanged</Badge></div>
        <dl className="kv"><dt>Client / site</dt><dd>{client.name} · {site?.name}</dd><dt>Scope</dt><dd>{q?.scope ?? job.scope}</dd></dl>
        {q && t ? (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Description</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead><tbody>
            {q.items.map((i, k) => <tr key={k}><td>{i.description}</td><td className="num">{i.qty}</td><td>{i.unit}</td><td className="num">{money(i.rate)}</td><td className="num">{money(i.qty * i.rate - i.discount)}</td></tr>)}
          </tbody><tfoot>
            <tr><td colSpan={4} className="num">Subtotal</td><td className="num">{money(t.gross)}</td></tr>
            {t.discount > 0 && <tr><td colSpan={4} className="num">Discount</td><td className="num">- {money(t.discount)}</td></tr>}
            {q.vat_mode !== 'none' && <tr><td colSpan={4} className="num">VAT {q.vat_rate}%{q.vat_mode === 'inclusive' ? ' (included)' : ''}</td><td className="num">{money(t.vat)}</td></tr>}
            <tr><th colSpan={4} className="num">Total</th><th className="num">{money(t.total)}</th></tr></tfoot></table></div>
        ) : <div className="muted">No quotation is linked to this job — agreed contract amount {money(job.contract_amount)}.</div>}
        {q?.terms && <details><summary className="small" style={{ cursor: 'pointer' }}>Terms &amp; exclusions</summary><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{q.terms}</p></details>}
      </div>

      <PanelTable wf={wf} editable={run && !wf.closed_at} />

      {signed ? (
        <div className="stack">
          <dl className="kv"><dt>Conforme signed by</dt><dd>{wf.conf_name} · {fmtDateTime(wf.conf_at)}</dd><dt>Original total</dt><dd>{money(wf.conf_original_total ?? 0)}</dd>{wf.conf_notes && <><dt>Notes</dt><dd>{wf.conf_notes}</dd></>}</dl>
          {wf.conf_signature && <img src={wf.conf_signature} alt="Client signature" style={{ maxHeight: 90, border: '1px solid var(--line)', borderRadius: 6 }} />}
          {wf.conf_file && (wf.conf_file.startsWith('data:image') ? <img src={wf.conf_file} alt="Signed copy" style={{ maxHeight: 160, borderRadius: 6 }} /> : <a href={wf.conf_file} download={wf.conf_file_name ?? 'conforme.pdf'}>Signed copy: {wf.conf_file_name ?? 'download'}</a>)}
          <div><button className="btn sm" onClick={() => attempt(() => conformePdf(db, job))}>Download conforme (PDF)</button></div>
        </div>
      ) : (
        <div className="stack">
          <Confirm checked={ok} onChange={setOk} disabled={!run}>The quotation, scope, rates, quantities, terms and exclusions were reviewed with the client on site.</Confirm>
          <div className="form-grid"><Field label="Client conforme — printed name" required><input disabled={!run} value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Date & time signed"><input disabled value={fmtDateTime(new Date().toISOString())} /></Field></div>
          {run && <><div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Client signature</div><SignaturePad onChange={setSig} /></div>
            <div className="row"><PhotoInput label="Attach photo / PDF of signed copy" accept="image/*,application/pdf" onAdd={(d, n) => setFile({ data: d, name: n })} />{file && <Badge tone="green">{file.name}</Badge>}</div></>}
          <Field label="Notes"><input disabled={!run} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {run && <button className="btn primary lg" onClick={() => attempt(() => signConforme(wf.id, { name, signature: sig, file: file?.data, file_name: file?.name, notes, confirmed: ok }), 'Conforme signed — work can start')}>Save signed conforme</button>}
        </div>
      )}
    </div>
  );
}
