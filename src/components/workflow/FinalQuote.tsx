import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, Modal, SignaturePad, attempt } from '@/components/ui';
import { DraftBar, PresetChips, Stepper, Toggle } from '@/components/touch';
import { useDraft } from '@/lib/useDraft';
import { confirmLeave } from '@/lib/sync';
import { getGeo } from '@/lib/geo';
import { ADDITIONAL_CATEGORIES, UNIT_OPTIONS, categoryDefaults, categoryLabel, finalQuoteSummary, lineTotals, panelBreakdown, resolveReviewItems, rowPanels } from '@/lib/business';
import { approveFinalQuote, declineAdditionalWork, requestFinalQuoteRevision, reviewVat, saveFinalReview } from '@/lib/workflow';
import { conformePdf } from '@/lib/export';
import { fmtDateTime, fmtStamp, money } from '@/lib/util';
import type { AdditionalCategory, Job, JobWorkflow, QuoteItem, Variation } from '@/lib/types';

export const NOTICE = 'Any additional work listed above has been discussed with and approved by the client before commencement.';
const DECLINE = ['Not needed', 'Too expensive', 'Will decide later', 'Will arrange separately'] as const;
const REVISE = ['Reduce the quantity', 'Remove an item', 'Adjust the price', 'Need approval from my manager'] as const;
const deviceInfo = () => { try { const n = navigator as Navigator & { userAgentData?: { platform?: string } }; const ua = n.userAgent.match(/\(([^)]+)\)/)?.[1] ?? n.userAgent; return `${n.userAgentData?.platform ?? ua}`.slice(0, 80) + ` · ${screen.width}×${screen.height}`; } catch { return ''; } };

/** Open additions waiting for the client, plus the history of what was offered. */
export const useReview = (job: Job) => {
  const { db } = useAuth();
  const all = db.variations.filter((v) => v.job_id === job.id && v.source === 'final_review' && !v.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { draft: all.find((v) => v.status === 'Draft'), history: all.filter((v) => v.status !== 'Draft'), all };
};

/* ---------------- shared tables ---------------- */
export function QuoteLines({ items, mode, rate }: { items: QuoteItem[]; mode: Variation['vat_mode']; rate: number }) {
  return (
    <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Service</th><th>Description / area</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate</th><th className="num">Discount</th><th className="num">VAT</th><th className="num">Line total</th></tr></thead><tbody>
      {items.map((i, k) => { const t = lineTotals(i, mode, rate); return (
        <tr key={k}><td>{categoryLabel(i.category)}</td>
          <td><b>{i.description}</b>{i.note && <div className="small muted">Reason: {i.note}</div>}{i.entered_qty !== undefined && i.entered_qty !== i.qty && <div className="small" style={{ color: 'var(--amber)' }}>Counted {i.entered_qty} — minimum of {i.qty} {i.unit} applies</div>}</td>
          <td className="num">{i.qty}</td><td>{i.unit}</td><td className="num">{money(i.rate)}</td><td className="num">{i.discount ? money(i.discount) : '—'}</td><td className="num">{money(t.vat)}</td><td className="num"><b>{money(t.total)}</b></td></tr>
      ); })}
    </tbody></table></div>
  );
}

export function FinalSummary({ sm, pendingLabel }: { sm: ReturnType<typeof finalQuoteSummary>; pendingLabel?: string }) {
  const row = (k: string, v: string, cls = '') => <tr className={cls}><td>{k}</td><td className="num">{v}</td></tr>;
  return (
    <table className="tbl finalsum"><tbody>
      {row('Original quote total', money(sm.originalTotal))}
      {row(pendingLabel ?? 'Approved additional work total', money(sm.additionalTotal))}
      {row('Discount included', money(sm.discount), 'sub')}
      {row('VAT included', money(sm.vat), 'sub')}
      {row('Final total bill', money(sm.finalTotal), 'big')}
      {sm.deposit > 0 && row('Less: deposit / prior payment', `− ${money(sm.deposit)}`)}
      {row('Balance due', money(sm.balance), 'big')}
    </tbody></table>
  );
}

export function PanelBreakdown({ wf, job }: { wf: JobWorkflow; job: Job }) {
  const { db } = useAuth();
  const q = db.quotations.find((x) => x.id === job.quotation_id);
  const b = panelBreakdown(db, q, wf.panels);
  const cell = (k: string, v: number, tone?: string) => <div className={`pbk ${tone ?? ''}`}><span>{k}</span><b>{v}</b></div>;
  return <div className="pbks" aria-label="Panel breakdown">{cell('Original panels', b.original)}{cell('Additional panels', b.additional, b.additional ? 'warn' : '')}{cell('External', b.external)}{cell('Internal', b.internal)}{cell('Total counted', b.total, 'navy')}</div>;
}

/* ---------------- Team Leader / Admin: prepare additional work ---------------- */
export function AdditionalWork({ wf, job, run, onPresent }: { wf: JobWorkflow; job: Job; run: boolean; onPresent: () => void }) {
  const { db } = useAuth();
  const { draft, history } = useReview(job);
  const vat = reviewVat(job);
  const [items, setItems] = useState<QuoteItem[]>(() => draft?.items ?? []);
  const [deposit, setDeposit] = useState<number | undefined>(wf.conf_deposit);
  const [depNote, setDepNote] = useState(wf.conf_deposit_note ?? '');
  const [edit, setEdit] = useState<{ idx: number | null; line?: QuoteItem } | null>(null);
  const dr = useDraft(`d:${wf.id}:conf:extra`, { items, deposit, depNote }, (d) => { setItems(d.items); setDeposit(d.deposit); setDepNote(d.depNote); }, run && !wf.conf_at);
  const resolved = useMemo(() => resolveReviewItems(db, wf.panels, items), [db, wf.panels, items]);
  const sm = finalQuoteSummary(db, job, { pending: { items: resolved, ...vat }, deposit });
  const save = () => { const ok = attempt(() => saveFinalReview(wf.id, { items, deposit, deposit_note: depNote }), 'Additional work saved'); if (ok) dr.markSaved(); return !!ok; };
  const present = () => { if (save()) onPresent(); };
  return (
    <div className="stack">
      <div className="row between"><div><b>Additional work (optional)</b><div className="small muted">Work requested or found on site. It is only billed if the client approves and signs.</div></div>{run && <button className="btn navy" onClick={() => setEdit({ idx: null })}>+ Add additional work</button>}</div>
      {run && <DraftBar d={dr} />}
      {draft?.revision_open && <div className="alert warn"><b>The client asked for a revision:</b> “{draft.revision_note}”. Update the lines below, then present the final quote again.</div>}
      {resolved.length ? <QuoteLines items={resolved} mode={vat.vat_mode} rate={vat.vat_rate} /> : <div className="muted">No additional work. The original quotation is the final bill.</div>}
      {run && resolved.length > 0 && <div className="row">{items.map((it, k) => <span key={k} className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => setEdit({ idx: k, line: it })}>Edit line {k + 1}</button><button className="btn sm danger" onClick={() => setItems(items.filter((_, x) => x !== k))}>Remove {k + 1}</button></span>)}</div>}
      {history.length > 0 && <div className="small muted">Previously offered: {history.map((h) => `${h.number} ${h.status === 'Rejected' ? 'declined' : h.status.toLowerCase()}`).join(' · ')}</div>}
      <div className="form-grid">
        <Field label="Deposit / prior payment (₱), if any" hint="Shown on the client's final bill and noted on the invoice."><input type="number" inputMode="decimal" min="0" disabled={!run} value={deposit ?? ''} onChange={(e) => setDeposit(e.target.value === '' ? undefined : Math.max(0, +e.target.value))} /></Field>
        <Field label="Payment reference"><input disabled={!run} value={depNote} onChange={(e) => setDepNote(e.target.value)} placeholder="e.g. OR-2026-0123, bank transfer" /></Field>
      </div>
      <div className="card" style={{ padding: 12 }}><div className="small muted" style={{ marginBottom: 6 }}>Final bill preview</div><FinalSummary sm={sm} pendingLabel={resolved.length ? 'Additional work (pending client approval)' : 'Additional work'} /></div>
      {run && <button className="btn primary lg" onClick={present}>Present final quote to client →</button>}
      {edit && <LineModal wf={wf} job={job} initial={edit.line} onClose={() => setEdit(null)} onSave={(l) => { setItems(edit.idx === null ? [...items, l] : items.map((x, k) => (k === edit.idx ? l : x))); setEdit(null); }} />}
    </div>
  );
}

function LineModal({ wf, job, initial, onClose, onSave }: { wf: JobWorkflow; job: Job; initial?: QuoteItem; onClose: () => void; onSave: (l: QuoteItem) => void }) {
  const { db, can } = useAuth();
  const authorised = can('admin.settings') || can('dispatch.approve');
  const q = db.quotations.find((x) => x.id === job.quotation_id);
  const vat = reviewVat(job);
  const pb = panelBreakdown(db, q, wf.panels);
  const [cat, setCat] = useState<AdditionalCategory>(initial?.category ?? (pb.additional > 0 ? 'glass' : 'solar'));
  const def = categoryDefaults(db.services, cat);
  const known = (UNIT_OPTIONS as readonly string[]).includes(initial?.unit ?? '');
  const [unitSel, setUnitSel] = useState<string>(initial ? (known ? initial.unit : 'custom') : def.unit);
  const [customUnit, setCustomUnit] = useState(initial && !known ? initial.unit : '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [qty, setQty] = useState<number | undefined>(initial?.entered_qty ?? initial?.qty);
  const [linked, setLinked] = useState(initial?.linked_panels ?? true);
  const [rate, setRate] = useState<number>(initial?.rate ?? def.rate);
  const [disc, setDisc] = useState<number>(initial?.discount ?? 0);
  const [note, setNote] = useState(initial?.note ?? '');
  const dr = useDraft(`d:${wf.id}:conf:line:${initial ? 'edit' : 'new'}`, { cat, unitSel, customUnit, desc, qty, linked, rate, disc, note }, (d) => { setCat(d.cat); setUnitSel(d.unitSel); setCustomUnit(d.customUnit); setDesc(d.desc); setQty(d.qty); setLinked(d.linked); setRate(d.rate); setDisc(d.disc); setNote(d.note); });
  const pickCat = (k: AdditionalCategory) => { const d = categoryDefaults(db.services, k); setCat(k); setRate(d.rate); setUnitSel(d.unit); setLinked(k === 'glass'); };
  const unit = unitSel === 'custom' ? customUnit.trim() : unitSel;
  const line: QuoteItem = { service_code: ADDITIONAL_CATEGORIES.find((c) => c.key === cat)!.code, category: cat, description: desc, qty: qty ?? 0, entered_qty: qty ?? 0, unit, rate, discount: disc, note: note.trim() || undefined, linked_panels: cat === 'glass' && linked };
  const [res] = resolveReviewItems(db, wf.panels, [line]);
  const t = lineTotals(res, vat.vat_mode, vat.vat_rate);
  const minApplied = def.min > 0 && (res.entered_qty ?? 0) > 0 && res.qty > (res.entered_qty ?? 0);
  const close = () => { if (dr.dirty && !confirmLeave()) return; onClose(); };
  const ok = () => {
    if (!desc.trim() && !(cat === 'glass' && linked)) return attempt(() => { throw new Error('Describe the area or work.'); });
    if (!unit) return attempt(() => { throw new Error('Enter the unit of measure.'); });
    dr.markSaved(); onSave(res);
  };
  return (
    <Modal title={initial ? 'Edit additional work' : 'Add additional work'} size="wide" onClose={close} footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={ok}>Add to final quote</button></>}>
      <div className="stack">
        <DraftBar d={dr} />
        <Field label="Service category" required><div className="chips" role="group" aria-label="Service category">{ADDITIONAL_CATEGORIES.map((c) => <button key={c.key} type="button" className={cat === c.key ? 'on' : ''} onClick={() => pickCat(c.key)}>{c.label}</button>)}</div></Field>
        {cat === 'glass' && (
          <div className="card" style={{ padding: 12 }}>
            <div className="row between"><b>Panel-counting table</b><Toggle checked={linked} onChange={setLinked}>Use the counted additional panels</Toggle></div>
            <PanelBreakdown wf={wf} job={job} />
            {linked && pb.additional === 0 && <div className="alert warn" style={{ marginTop: 8 }}>No rows are marked “Extra” in the panel table. Mark the panels beyond the quoted scope, or turn the switch off to type a quantity.</div>}
            {linked && pb.additional > 0 && <div className="small muted" style={{ marginTop: 6 }}>Additional rows: {wf.panels.filter((p) => p.additional).map((p) => `${p.area} ${p.side} (${rowPanels(p)})`).join(', ')}</div>}
          </div>
        )}
        <div className="form-grid">
          <Field label="Description / area" required={!(cat === 'glass' && linked)} className="full"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={cat === 'glass' && linked ? 'Filled in from the panel table' : 'e.g. Roof deck, east wing'} /></Field>
          <Field label="Quantity">{cat === 'glass' && linked ? <input disabled value={`${pb.additional} (from panel table)`} /> : <Stepper label="Quantity" min={0} step={1} value={qty} onChange={setQty} />}</Field>
          <Field label="Unit of measure"><div className="stack" style={{ gap: 6 }}><select value={unitSel} onChange={(e) => setUnitSel(e.target.value)}>{UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}</select>{unitSel === 'custom' && <input value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="e.g. window, door, set" aria-label="Custom unit" />}</div></Field>
          <Field label="Unit rate (₱)" hint={authorised ? `Price-list default ${money(def.rate)}${def.min ? `, minimum ${def.min} ${def.unit}` : ''}` : `Price-list rate ${money(def.rate)}${def.min ? `, minimum ${def.min} ${def.unit}` : ''} — only an Operations Manager / Admin can change it`}><input type="number" inputMode="decimal" min="0" disabled={!authorised && cat !== 'other'} value={rate || ''} onChange={(e) => setRate(+e.target.value)} /></Field>
          <Field label="Discount (₱)" hint={authorised ? undefined : 'Discounts need Operations Manager / Admin'}><input type="number" inputMode="decimal" min="0" disabled={!authorised} value={disc || ''} onChange={(e) => setDisc(Math.max(0, +e.target.value))} /></Field>
        </div>
        {minApplied && <div className="alert info">Minimum of {def.min} {def.unit} applies — counted {res.entered_qty}, billed {res.qty}.</div>}
        <div className="finalsum card" style={{ padding: 12 }}>
          <div className="row between"><span>Line amount ({res.qty} × {money(rate)}{disc ? ` − ${money(disc)}` : ''})</span><b>{money(t.amount)}</b></div>
          <div className="row between"><span>VAT {vat.vat_mode === 'none' ? '(none)' : `${vat.vat_rate}%${vat.vat_mode === 'inclusive' ? ' included' : ''}`}</span><b>{money(t.vat)}</b></div>
          <div className="row between big"><span>Line total</span><b>{money(t.total)}</b></div>
        </div>
        <Field label="Notes / reason for additional work"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this work is needed" /><PresetChips replace options={['Client requested at site', 'Found on site – not in original scope', 'Quantity higher than quoted', 'Safety / access requirement']} value={note} onChange={setNote} /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- client-facing Final Quote Review ---------------- */
export function ClientReview({ wf, job, run, onClose }: { wf: JobWorkflow; job: Job; run: boolean; onClose: () => void }) {
  const { db } = useAuth();
  const q = db.quotations.find((x) => x.id === (wf.conf_quotation_id ?? job.quotation_id));
  const client = db.clients.find((c) => c.id === job.client_id)!; const site = db.sites.find((s) => s.id === job.site_id);
  const { draft, history } = useReview(job);
  const vat = reviewVat(job);
  const signed = !!wf.conf_at;
  const pendingItems = useMemo(() => (draft && !signed ? resolveReviewItems(db, wf.panels, draft.items) : []), [db, wf.panels, draft, signed]);
  const approved = db.variations.filter((v) => v.job_id === job.id && v.status === 'Approved' && !v.deleted_at);
  const sm = finalQuoteSummary(db, job, { pending: pendingItems.length ? { items: pendingItems, ...vat } : undefined, deposit: wf.conf_deposit });
  const pb = panelBreakdown(db, q, wf.panels);
  const hasAdds = pendingItems.length > 0;
  const revision = !!draft?.revision_open;
  const [mode, setMode] = useState<'approve' | 'decline' | 'revise' | null>(null);
  const [name, setName] = useState(site?.contact_person ?? ''); const [sig, setSig] = useState<string>();
  const [agree, setAgree] = useState(false); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const dr = useDraft(`d:${wf.id}:conf`, { name, sig }, (d) => { setName(d.name); setSig(d.sig); }, run && !signed);
  useEffect(() => { document.body.classList.add('noscroll'); return () => document.body.classList.remove('noscroll'); }, []);
  const close = () => { if (dr.dirty && !confirmLeave()) return; onClose(); };
  const geo = async () => { const g = await getGeo(); return { lat: g.lat, lng: g.lng, gps_note: g.lat === undefined ? 'Location unavailable on this device' : undefined, device: deviceInfo() }; };
  const doApprove = async () => { setBusy(true); const g = await geo(); const r = attempt(() => approveFinalQuote(wf.id, { name, signature: sig, confirmed: agree, ...g }), hasAdds ? 'Final quote approved — additional work recorded as a change order' : 'Final quote signed'); setBusy(false); if (r) { dr.markSaved(); onClose(); } };
  const doDecline = async () => { setBusy(true); const g = await geo(); const r = attempt(() => declineAdditionalWork(wf.id, { client_name: name, reason, ...g }), 'Additional work declined — recorded as offered and declined'); setBusy(false); if (r) { setMode(null); setReason(''); } };
  const doRevise = () => { if (attempt(() => requestFinalQuoteRevision(wf.id, reason), 'Revision requested')) onClose(); };
  const adds = signed ? approved : [];

  return (
    <div className="clientreview" role="dialog" aria-modal="true" aria-label="Client Final Quote Review">
      <div className="crbar"><b>Client Final Quote Review</b><span className="grow" />{!signed && run && <DraftBar d={dr} />}<button className="btn" onClick={close}>{signed ? 'Close' : '← Back to editing'}</button></div>
      <div className="crpaper">
        <header className="crhead">
          <div><div className="crbrand">TOPMOP</div><div className="small muted">Window Cleaning Solutions Corp.</div></div>
          <div className="right"><b>Final Quote</b><div className="small muted">{q?.number ?? '—'} · Job {job.number}</div><div className="small muted">{signed ? fmtDateTime(wf.conf_at) : fmtStamp(new Date().toISOString())}</div></div>
        </header>
        <div className="crparty"><div><span className="small muted">Client</span><br /><b>{client.name}</b></div><div><span className="small muted">Site</span><br /><b>{site?.name}</b><div className="small muted">{site?.address}</div></div></div>

        <h3 className="crh">1 · Original Scope of Work <Badge tone="gray">approved quotation — unchanged</Badge></h3>
        <p style={{ margin: '4px 0 8px' }}>{q?.scope ?? job.scope}</p>
        {q && <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Description</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead><tbody>{q.items.map((i, k) => <tr key={k}><td>{i.description}</td><td className="num">{i.qty}</td><td>{i.unit}</td><td className="num">{money(i.rate)}</td><td className="num">{money(i.qty * i.rate - i.discount)}</td></tr>)}</tbody></table></div>}
        {wf.panels.length > 0 && <div style={{ marginTop: 8 }}><div className="small muted">Glass panels counted on site</div><div className="pbks"><div className="pbk"><span>Original</span><b>{pb.original}</b></div><div className={`pbk ${pb.additional ? 'warn' : ''}`}><span>Additional</span><b>{pb.additional}</b></div><div className="pbk"><span>External</span><b>{pb.external}</b></div><div className="pbk"><span>Internal</span><b>{pb.internal}</b></div><div className="pbk navy"><span>Total</span><b>{pb.total}</b></div></div></div>}

        <h3 className="crh">2 · Additional Work Requested / Confirmed at Site</h3>
        {revision && <div className="alert warn">A revision was requested: “{draft?.revision_note}”. The additional work is being updated.</div>}
        {hasAdds ? <QuoteLines items={pendingItems} mode={vat.vat_mode} rate={vat.vat_rate} /> : adds.length ? adds.map((v) => <div key={v.id}><div className="small muted">{v.number} · approved {fmtDateTime(v.signed_at)}</div><QuoteLines items={v.items} mode={v.vat_mode} rate={v.vat_rate} /></div>) : <p className="muted">No additional work.</p>}
        {history.filter((h) => h.status === 'Rejected').map((h) => <div key={h.id} className="alert info" style={{ marginTop: 8 }}>Offered and declined by the client ({h.number}): {h.items.map((i) => i.description).join('; ')} — <b>not included</b> in the final bill.</div>)}

        <h3 className="crh">3 · Final Billing Summary</h3>
        <FinalSummary sm={sm} pendingLabel={hasAdds ? 'Additional work (for your approval)' : undefined} />
        <p className="crnotice">{NOTICE}</p>

        {signed ? (
          <div className="card" style={{ padding: 14 }}>
            <b>Approved and signed</b>
            <dl className="kv" style={{ marginTop: 8 }}><dt>Client</dt><dd>{wf.conf_name}</dd><dt>Date & time</dt><dd>{fmtDateTime(wf.conf_at)}</dd><dt>Location</dt><dd>{wf.conf_lat !== undefined ? `${wf.conf_lat}, ${wf.conf_lng}` : wf.conf_gps_note ?? '—'}</dd><dt>Device</dt><dd>{wf.conf_device || '—'}</dd></dl>
            {wf.conf_signature && <img src={wf.conf_signature} alt="Client signature" style={{ maxHeight: 90, border: '1px solid var(--line)', borderRadius: 6 }} />}
            <div style={{ marginTop: 10 }}><button className="btn" onClick={() => attempt(() => conformePdf(db, job))}>Download scope &amp; final quote (PDF)</button></div>
          </div>
        ) : run ? (
          <div className="cractions">
            {!mode && <>
              <button className="btn primary lg" disabled={revision} onClick={() => setMode('approve')}>Approve Final Quote and Sign</button>
              {hasAdds && <button className="btn lg" onClick={() => setMode('decline')}>Decline Additional Work</button>}
              {hasAdds && <button className="btn lg" onClick={() => setMode('revise')}>Request Revision</button>}
            </>}
            {revision && !mode && <div className="small muted">Present the updated additional work again before the client can sign.</div>}
            {mode === 'approve' && (
              <div className="stack card" style={{ padding: 14 }}>
                <b>Client approval{hasAdds ? ` — final total ${money(sm.finalTotal)}` : ''}</b>
                <Field label="Client name" required><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Client signature</div><SignaturePad value={sig} onChange={setSig} /></div>
                <Toggle checked={agree} onChange={setAgree}>{hasAdds ? 'I have reviewed the original quotation, the additional work and the final bill, and I approve them.' : 'I have reviewed the quotation and I agree to its scope, rates and terms.'}</Toggle>
                <div className="small muted">Date, time, device and GPS location are recorded when you tap Approve.</div>
                <div className="row"><button className="btn lg" onClick={() => setMode(null)}>Back</button><button className="btn primary lg" disabled={busy} onClick={doApprove}>{busy ? 'Saving…' : 'Approve & Sign'}</button></div>
              </div>
            )}
            {mode === 'decline' && (
              <div className="stack card" style={{ padding: 14 }}>
                <b>Decline additional work</b><div className="small muted">The additional work is removed from the final bill and kept on record as offered and declined. You can then sign the original quotation.</div>
                <Field label="Client name" required><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Reason (optional)"><input value={reason} onChange={(e) => setReason(e.target.value)} /><PresetChips replace options={DECLINE} value={reason} onChange={setReason} /></Field>
                <div className="row"><button className="btn lg" onClick={() => setMode(null)}>Back</button><button className="btn danger lg" disabled={busy} onClick={doDecline}>Decline additional work</button></div>
              </div>
            )}
            {mode === 'revise' && (
              <div className="stack card" style={{ padding: 14 }}>
                <b>Request revision</b><div className="small muted">The final quote stays open. The Team Leader updates the additional work and presents it again.</div>
                <Field label="What should change?" required><textarea value={reason} onChange={(e) => setReason(e.target.value)} /><PresetChips replace options={REVISE} value={reason} onChange={setReason} /></Field>
                <div className="row"><button className="btn lg" onClick={() => setMode(null)}>Back</button><button className="btn navy lg" onClick={doRevise}>Send revision request</button></div>
              </div>
            )}
          </div>
        ) : <div className="alert info">Only the Team Leader or a manager can record the client's decision.</div>}
      </div>
    </div>
  );
}
