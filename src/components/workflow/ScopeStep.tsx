import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, attempt } from '@/components/ui';
import { Toggle } from '@/components/touch';
import { AdditionalWork, ClientReview, PanelBreakdown, useReview } from './FinalQuote';
import { VariationStep } from './VariationStep';
import { QuoteImageGallery } from '@/components/QuoteImages';
import { DeclineJobModal, DiscountSection } from './DiscountPanel';
import { DraftBar, Stepper } from '@/components/touch';
import { useDraft } from '@/lib/useDraft';
import { PANEL_AREAS, PANEL_SIDES, confirmScopeNoChanges, savePanels, setScopeChanged } from '@/lib/workflow';
import { countPanels, docTotals, scopeRoute, panelTotals, quotedPanels, rowPanels } from '@/lib/business';
import { fmtDateTime, money, uid } from '@/lib/util';
import { conformePdf } from '@/lib/export';
import type { Job, JobWorkflow, PanelRow } from '@/lib/types';

const newRow = (): PanelRow => ({ id: uid(), area: '1st Floor', side: 'Front', external: 0, internal: 0 });

/** Glass panel-counting table: Area/Floor | Side/Location | External | Internal | Total | Notes — totals are automatic. */
export function PanelTable({ wf, editable }: { wf: JobWorkflow; editable: boolean }) {
  const { db } = useAuth();
  const [rows, setRows] = useState<PanelRow[]>(wf.panels);
  const [pkg, setPkg] = useState<number | undefined>(wf.package_panels);
  const dr = useDraft(`d:${wf.id}:conf:panels2`, { rows, pkg }, (d) => { setRows(d.rows); setPkg(d.pkg); }, editable);
  useEffect(() => { if (!dr.dirty) { setRows(wf.panels); setPkg(wf.package_panels); } }, [wf.panels, wf.package_panels]); // eslint-disable-line react-hooks/exhaustive-deps
  const [calc, setCalc] = useState({ w: 2, h: 1, qty: 1, grouped: false, kind: 'external' as 'external' | 'internal', row: '' });
  const t = panelTotals(rows);
  const set = (id: string, p: Partial<PanelRow>) => setRows((a) => a.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const q = db.quotations.find((x) => x.id === wf.conf_quotation_id) ?? db.quotations.find((x) => x.id === db.jobs.find((j) => j.id === wf.job_id)?.quotation_id);
  const job = db.jobs.find((j) => j.id === wf.job_id);
  const fromQuote = quotedPanels(db, q);
  const quoted = pkg ?? fromQuote;
  const auto = pkg !== undefined || (fromQuote > 0 && !rows.some((r) => r.additional));
  const extra = auto ? Math.max(0, t.total - quoted) : t.additional;
  const cp = countPanels([{ w: calc.w, h: calc.h, qty: calc.qty, grouped: calc.grouped }], db.settings.glass_group_size);
  const dirty = JSON.stringify(rows) !== JSON.stringify(wf.panels) || (pkg ?? undefined) !== wf.package_panels;
  const [open, setOpen] = useState(false);
  const canEdit = editable; editable = false; // the table below is the summary; counting happens in the counter window
  const finish = () => { if (!dirty || attempt(() => savePanels(wf.id, rows, pkg), 'Panel count saved')) { dr.markSaved(); setOpen(false); } };
  const numIn = (r: PanelRow, k: 'external' | 'internal') => <Stepper label={`${k} panels ${r.area} ${r.side}`} value={r[k]} onChange={(v) => set(r.id, { [k]: v ?? 0 })} />;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between"><b>Glass panel count</b>{(auto || extra > 0) && <span className="small muted">{auto ? `Starter package: ${quoted} panels` : 'No starter package set'}{extra > 0 && <> · counted {t.total} (<b>{extra} additional</b>)</>}</span>}</div>
      <div className="small muted">Up to 2 m × 1 m = 1 panel · larger than 2 m × 1 m = 2 panels · smaller standard windows still count as 1 · small sections may be grouped into 1.</div>
      <div className="pcount-wrap"><table className="tbl pcount"><colgroup><col style={{ width: '17%' }} /><col style={{ width: '17%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /><col style={{ width: '7%' }} /><col />{editable && <col style={{ width: '8%' }} />}{editable && <col style={{ width: '5%' }} />}</colgroup><thead><tr><th>Area / Floor</th><th>Side / Location</th><th className="num">External</th><th className="num">Internal</th><th className="num">Total</th><th>Notes</th>{editable && <th>Extra</th>}{editable && <th />}</tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td data-label="Area / Floor">{editable ? <select value={r.area} onChange={(e) => set(r.id, { area: e.target.value })}>{PANEL_AREAS.map((a) => <option key={a}>{a}</option>)}</select> : r.area}</td>
            <td data-label="Side / Location">{editable ? <select value={r.side} onChange={(e) => set(r.id, { side: e.target.value })}>{PANEL_SIDES.map((a) => <option key={a}>{a}</option>)}</select> : r.side}</td>
            <td className="num" data-label="External">{editable ? numIn(r, 'external') : r.external}</td><td className="num" data-label="Internal">{editable ? numIn(r, 'internal') : r.internal}</td>
            <td className="num" data-label="Total"><b>{rowPanels(r)}</b></td>
            <td data-label="Notes" className="pc-notes">{editable ? <input value={r.notes ?? ''} onChange={(e) => set(r.id, { notes: e.target.value })} aria-label="Notes" /> : <>{r.notes}{r.additional && <> <Badge tone="amber">additional</Badge></>}</>}</td>
            {editable && <td data-label="Extra" className="pc-extra"><label className="check" title="Beyond the quoted scope — can be added to a variation"><input type="checkbox" checked={!!r.additional} onChange={(e) => set(r.id, { additional: e.target.checked })} />Add’l</label></td>}
            {editable && <td className="pc-x"><button className="btn sm danger" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} aria-label="Remove row">✕</button></td>}
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={8} className="muted">No areas counted yet.</td></tr>}
      </tbody><tfoot><tr><th colSpan={2}>Total</th><th className="num" data-label="External">{t.external}</th><th className="num" data-label="Internal">{t.internal}</th><th className="num" data-label="Total">{t.total}</th><th colSpan={3}>{t.additional > 0 && <Badge tone="amber">{t.additional} additional panels</Badge>}</th></tr></tfoot></table></div>
      {canEdit && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => setOpen(true)}>{rows.length ? 'Open panel counter' : 'Start counting panels'}</button>
          {dirty && <button className="btn" onClick={() => { if (attempt(() => savePanels(wf.id, rows, pkg), 'Panel count saved')) dr.markSaved(); }}>Save panel count</button>}
          {dirty && <span className="small" style={{ color: 'var(--amber)' }}>Unsaved panel changes</span>}
        </div>
      )}
      {open && (
        <div className="pcwin" role="dialog" aria-modal="true" aria-label="Panel counter">
          <div className="pcwin-h">
            <div style={{ flex: 1, minWidth: 0 }}><b>Count glass panels</b><div className="small muted">Add each area, side and the number of panels</div></div>
            <button className="btn" onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="pcwin-b">
            <div className="pcrow pkgbox">
              <div className="pcrow-g">
                <Field label="Starter package panels" hint={fromQuote > 0 ?  `The quotation covers ${fromQuote} panels.` : 'Set it and the panels counted beyond it become the additional work automatically.'}><Stepper label="Starter package panels" min={0} value={quoted} onChange={(v) => setPkg(v ?? 0)} /></Field>
                <div><div className="small muted">Counted</div><b style={{ fontSize: 20 }}>{t.total}</b> <span className="small muted">of {quoted} in package</span><div style={{ marginTop: 4 }}>{extra > 0 ? <Badge tone="amber">{extra} additional panel{extra === 1 ? '' : 's'}</Badge> : <Badge tone="teal">within the package</Badge>}</div></div>
              </div>
              {fromQuote > 0 && quoted !== fromQuote && <button className="btn sm" onClick={() => setPkg(fromQuote)}>Use the quotation ({fromQuote})</button>}
            </div>
            <div className="small muted">Up to 2 m × 1 m = 1 panel · larger = 2 panels · small sections may be grouped into 1. Totals are automatic.</div>
            {rows.map((r, n) => (
              <div key={r.id} className="pcrow">
                <div className="pcrow-h"><b>Area {n + 1}</b><span className="pcrow-t">{rowPanels(r)} panel{rowPanels(r) === 1 ? '' : 's'}</span><button className="btn sm danger" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} aria-label="Remove area">Remove</button></div>
                <div className="pcrow-g">
                  <Field label="Area / Floor"><select value={r.area} onChange={(e) => set(r.id, { area: e.target.value })}>{PANEL_AREAS.map((a) => <option key={a}>{a}</option>)}</select></Field>
                  <Field label="Side / Location"><select value={r.side} onChange={(e) => set(r.id, { side: e.target.value })}>{PANEL_SIDES.map((a) => <option key={a}>{a}</option>)}</select></Field>
                  <Field label="External panels">{numIn(r, 'external')}</Field>
                  <Field label="Internal panels">{numIn(r, 'internal')}</Field>
                  <Field label="Notes"><input value={r.notes ?? ''} onChange={(e) => set(r.id, { notes: e.target.value })} placeholder="Optional" /></Field>
                  {!auto && <Field label="Extra work"><label className="check" title="Beyond the quoted scope — can be added to a variation"><input type="checkbox" checked={!!r.additional} onChange={(e) => set(r.id, { additional: e.target.checked })} />Beyond the quoted scope</label></Field>}
                </div>
              </div>
            ))}
            <button className="btn primary lg" onClick={() => setRows([...rows, { ...newRow(), area: rows[rows.length - 1]?.area ?? '1st Floor' }])}>+ Add area</button>
            <details><summary className="small" style={{ cursor: 'pointer' }}>Count by window size</summary>
              <div className="form-grid" style={{ marginTop: 8 }}>
                <Field label="Width (m)"><Stepper label="Width in metres" step={0.1} min={0.1} unit="m" value={calc.w} onChange={(v) => setCalc({ ...calc, w: v ?? 1 })} /></Field>
                <Field label="Height (m)"><Stepper label="Height in metres" step={0.1} min={0.1} unit="m" value={calc.h} onChange={(v) => setCalc({ ...calc, h: v ?? 1 })} /></Field>
                <Field label="How many windows"><Stepper label="Number of windows" min={1} value={calc.qty} onChange={(v) => setCalc({ ...calc, qty: v ?? 1 })} /></Field>
                <Field label="Small sections to group"><label className="check"><input type="checkbox" checked={calc.grouped} onChange={(e) => setCalc({ ...calc, grouped: e.target.checked })} />Group (≤ 0.5 m² each, {db.settings.glass_group_size} = 1 panel)</label></Field>
                <Field label="Add to row"><select value={calc.row} onChange={(e) => setCalc({ ...calc, row: e.target.value })}><option value="">New row</option>{rows.map((r) => <option key={r.id} value={r.id}>{r.area} · {r.side}</option>)}</select></Field>
                <Field label="Side counted"><select value={calc.kind} onChange={(e) => setCalc({ ...calc, kind: e.target.value as 'external' | 'internal' })}><option value="external">External</option><option value="internal">Internal</option></select></Field>
              </div>
              <div className="row" style={{ marginTop: 6 }}><Badge tone="teal">= {cp.panels} panel{cp.panels === 1 ? '' : 's'}</Badge><span className="small muted">{cp.detail[0]?.label}</span>
                <button className="btn sm" onClick={() => { if (calc.row) set(calc.row, { [calc.kind]: (rows.find((r) => r.id === calc.row)![calc.kind] || 0) + cp.panels }); else setRows([...rows, { ...newRow(), [calc.kind]: cp.panels }]); }}>Add to count</button></div>
            </details>
          </div>
          <div className="pcwin-f">
            <div className="pcwin-sum"><span>External <b>{t.external}</b></span><span>Internal <b>{t.internal}</b></span><span>Total <b className="big">{t.total}</b></span><span className="small muted">{extra > 0 ? `${extra} additional beyond the package` : auto && t.total < quoted ? `${quoted - t.total} to go in the package` : 'no additional panels'}</span></div>
            <button className="btn primary lg" onClick={finish}>Finish counting</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ScopeStep({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db } = useAuth();
  const q = db.quotations.find((x) => x.id === (wf.conf_quotation_id ?? job.quotation_id));
  const t = q ? docTotals(q.items, q.discount, q.vat_mode, q.vat_rate) : undefined;
  const client = db.clients.find((c) => c.id === job.client_id); const site = db.sites.find((s) => s.id === job.site_id);
  const signed = !!wf.conf_at;
  const route = scopeRoute(db, job, wf);
  const recurring = route === 'recurring';
  const glass = job.service_codes.some((c) => c === 'GLASS_EXT' || c === 'GLASS_INT');
  const [view, setView] = useState(false);
  const [declineJob, setDeclineJob] = useState(false);
  const { history } = useReview(job);
  const prior = db.jobs.filter((j) => j.id !== job.id && j.client_id === job.client_id && j.site_id === job.site_id && ['Closed', 'Completed'].includes(j.status) && j.start_at < job.start_at).sort((a, b) => b.start_at.localeCompare(a.start_at))[0];
  return (
    <div className="stack">
      {!signed && (
        <div className={`alert ${recurring ? 'info' : 'warn'}`}>
          {recurring
            ? <>Recurring job — the existing approved scope is shown below{prior ? ` (last serviced ${prior.number})` : ''}. No new signature is needed if nothing changed.</>
            : <>New client / new job / changed scope — the client must review and sign the quotation (conforme){glass ? ' with the glass panel count' : ''}.</>}
          {run && <div style={{ marginTop: 8 }}><Toggle checked={!!wf.scope_changed} onChange={(v) => attempt(() => setScopeChanged(wf.id, v))}>The scope has changed — client approval is required</Toggle></div>}
        </div>
      )}
      <div className="card" style={{ padding: 12 }}>
        <div className="row between"><b>{recurring && !signed ? 'Existing approved scope' : 'Original quotation'} {q?.number ?? '—'}</b><Badge tone="gray">approved — read-only</Badge></div>
        <dl className="kv"><dt>Client / site</dt><dd>{client?.name ?? ''}{client ? ' · ' : ''}{site?.name}</dd><dt>Scope</dt><dd>{q?.scope ?? job.scope}</dd></dl>
        {q && t ? (
          <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Description</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead><tbody>
            {q.items.map((i, k) => <tr key={k}><td>{i.description}</td><td className="num">{i.qty}</td><td>{i.unit}</td><td className="num">{money(i.rate)}</td><td className="num">{money(i.qty * i.rate - i.discount)}</td></tr>)}
          </tbody><tfoot>
            <tr><td colSpan={4} className="num">Subtotal</td><td className="num">{money(t.gross)}</td></tr>
            {t.discount > 0 && <tr><td colSpan={4} className="num">Discount (in the approved quotation)</td><td className="num">- {money(t.discount)}</td></tr>}
            {q.vat_mode !== 'none' && <tr><td colSpan={4} className="num">VAT {q.vat_rate}%{q.vat_mode === 'inclusive' ? ' (included)' : ''}</td><td className="num">{money(t.vat)}</td></tr>}
            <tr><th colSpan={4} className="num">Total</th><th className="num">{money(t.total)}</th></tr></tfoot></table></div>
        ) : <div className="muted">No quotation is linked to this job — agreed contract amount {money(job.contract_amount)}.</div>}
        {q && <div style={{ marginTop: 8 }}><QuoteImageGallery target={{ quotation_id: q.id }} items={q.items} compact title="Quotation images (optional)" /></div>}
        {q?.terms && <details><summary className="small" style={{ cursor: 'pointer' }}>Terms &amp; exclusions</summary><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{q.terms}</p></details>}
      </div>

      {!signed && wf.arr_at && (
        <div className="card" style={{ padding: 12 }}>
          <div className="row between"><b>Discount</b><span className="small muted">Internal — the client does not see this. Only an approved discount appears on the quotation.</span></div>
          <div style={{ marginTop: 8 }}><DiscountSection job={job} wf={wf} run={run} onDecline={() => setDeclineJob(true)} /></div>
        </div>
      )}
      {!signed && !recurring && <><PanelTable wf={wf} editable={run && !wf.closed_at} />{wf.panels.length > 0 && <PanelBreakdown wf={wf} job={job} />}</>}
      {signed && wf.panels.length > 0 && <><PanelTable wf={wf} editable={false} /><PanelBreakdown wf={wf} job={job} /></>}

      {!signed && recurring && (
        <>
          {run && <button className="btn primary lg" onClick={() => attempt(() => confirmScopeNoChanges(wf.id), 'Scope confirmed — no changes')}>Scope Confirmed – No Changes</button>}
          <details><summary className="small" style={{ cursor: 'pointer' }}>Additional work requested at the site?</summary><div style={{ marginTop: 10 }}><AdditionalWork wf={wf} job={job} run={run} onPresent={() => setView(true)} /></div></details>
        </>
      )}
      {!signed && !recurring && <AdditionalWork wf={wf} job={job} run={run} onPresent={() => setView(true)} />}
      {!signed && !run && <div className="alert info">Only the Team Leader or a manager can complete this step.</div>}

      {signed && (
        <div className="stack">
          {wf.conf_mode === 'declined' ? <div className="alert err">The client declined the job — {wf.conf_name} · {fmtDateTime(wf.conf_at)}{wf.conf_notes ? `: ${wf.conf_notes}` : ''}. No work, no billing; continue to Close-Out.</div>
            : wf.conf_mode === 'confirmed'
            ? <div className="alert info">Scope confirmed — <b>no changes</b> · {fmtDateTime(wf.conf_at)}. The existing approved scope applies; no new client signature was required.</div>
            : <div className="alert info">Approved and signed by <b>{wf.conf_name}</b> · {fmtDateTime(wf.conf_at)} — final total <b>{money(wf.conf_final_total ?? wf.conf_original_total ?? 0)}</b>{wf.conf_variation_id ? ' (includes approved additional work, recorded as a change order)' : ''}.</div>}
          {history.filter((h) => h.status === 'Rejected').map((h) => <div key={h.id} className="small muted">Offered and declined: {h.number} — {h.items.map((i) => i.description).join('; ')}</div>)}
          <div className="row">{wf.conf_mode === 'approval' && <button className="btn navy" onClick={() => setView(true)}>View final quote</button>}<button className="btn" onClick={() => attempt(() => conformePdf(db, job))}>Download scope &amp; final quote (PDF)</button></div>
        </div>
      )}
      {signed && wf.start_at && <div><div className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', margin: '8px 0' }}>Variation approval — additional work during the job</div><VariationStep wf={wf} job={job} run={run} /></div>}
      {signed && !wf.start_at && <div className="small muted">Additional work found after work starts is added here as a variation and needs the client's signature before it begins.</div>}
      {declineJob && <DeclineJobModal wf={wf} job={job} onClose={() => setDeclineJob(false)} onDone={() => setDeclineJob(false)} />}
      {view && <ClientReview wf={wf} job={job} run={run} onClose={() => setView(false)} />}
    </div>
  );
}
