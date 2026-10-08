import { PAYMENT_OPTIONS, defaultCrew, defaultDisclaimer, defaultIntro, defaultMethodology, durationText, manpowerText } from '@/lib/quote-text';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, attempt, ask, useObj } from '@/components/ui';
import { countPanels, docTotals, priceService, type GlassRow } from '@/lib/business';
import { duplicateQuotation, quoteLink, saveQuotation, setQuoteStatus } from '@/lib/actions';
import { quotationPdf, shareTextQuote } from '@/lib/export';
import { IncludeImagesToggle, QuoteImageGallery } from '@/components/QuoteImages';
import { SiteForm } from './ClientDetail';
import { addDays, fmtDate, fmtStamp, money, today } from '@/lib/util';
import type { Quotation, QuoteItem, ServiceCode } from '@/lib/types';

type Form = Omit<Quotation, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'number'>;

function PanelCalc({ onAdd, onClose }: { onAdd: (panels: number) => void; onClose: () => void }) {
  const { db } = useAuth();
  const [rows, setRows] = useState<GlassRow[]>([{ w: 1.5, h: 1, qty: 10 }]);
  const res = useMemo(() => countPanels(rows, db.settings.glass_group_size), [rows, db.settings.glass_group_size]);
  const upd = (i: number, p: Partial<GlassRow>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  return (
    <Modal title="Glass panel counter" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!res.panels} onClick={() => onAdd(res.panels)}>Use {res.panels} panels</button></>}>
      <p className="muted small" style={{ marginTop: 0 }}>Up to 2 m × 1 m (2 m²) counts as 1 panel; anything larger counts as 2. Small panels (≤ 0.5 m²) marked “group” are bundled {db.settings.glass_group_size} per panel.</p>
      <div className="stack">
        {rows.map((r, i) => (
          <div key={i} className="row" style={{ alignItems: 'end' }}>
            <Field label="Width (m)"><input type="number" step="0.05" min="0" value={r.w} onChange={(e) => upd(i, { w: +e.target.value })} /></Field>
            <Field label="Height (m)"><input type="number" step="0.05" min="0" value={r.h} onChange={(e) => upd(i, { h: +e.target.value })} /></Field>
            <Field label="Qty"><input type="number" min="1" value={r.qty} onChange={(e) => upd(i, { qty: +e.target.value })} /></Field>
            <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={!!r.grouped} onChange={(e) => upd(i, { grouped: e.target.checked })} />Group small</label>
            <button className="btn sm danger" onClick={() => setRows((x) => x.filter((_, k) => k !== i))} aria-label="Remove row"><Icon name="x" size={14} /></button>
          </div>
        ))}
        <div><button className="btn sm" onClick={() => setRows((r) => [...r, { w: 2, h: 1, qty: 1 }])}><Icon name="plus" />Add size</button></div>
        <div className="alert info">{res.detail.map((d, i) => <div key={i}>{d.label} → <b>{d.panels}</b></div>)}<div style={{ marginTop: 6 }}>Total billable panels: <b>{res.panels}</b></div></div>
      </div>
    </Modal>
  );
}

export default function QuoteEditor() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { db, can } = useAuth();
  const existing = id !== 'new' ? db.quotations.find((q) => q.id === id) : undefined;
  const locked = !!existing && existing.status !== 'Draft';
  const readOnly = locked || !can('sales.edit');
  const [calc, setCalc] = useState(false);
  const [pdfImg, setPdfImg] = useState(false);
  const [svc, setSvc] = useState<ServiceCode>('GLASS_EXT');
  const [newSite, setNewSite] = useState(false);
  const [qty, setQty] = useState(31);
  const [note, setNote] = useState('');
  const f = useObj<Form>(() => existing ? { ...existing } : {
    client_id: sp.get('client') ?? live(db.clients)[0]?.id ?? '', site_id: undefined, inquiry_id: sp.get('inquiry') ?? undefined, issue_date: today(), valid_until: addDays(today(), db.settings.quote_validity_days),
    scope: '', items: [], vat_mode: 'exclusive', vat_rate: db.settings.vat_rate, discount: 0, terms: db.settings.default_terms, payment_option: 'completion', crew_size: defaultCrew(db.settings), safety_officer: true, work_days: 1, disclaimer: defaultDisclaimer(db.settings), intro: defaultIntro(db.settings), methodology: defaultMethodology(db.settings), status: 'Draft', branch_id: db.branches[0].id,
  });
  const v = f.v;
  const client = db.clients.find((c) => c.id === v.client_id);
  const sites = live(db.sites).filter((s) => s.client_id === v.client_id);
  const pct = v.discount_type === 'percent';
  const baseAfterLines = Math.max(0, docTotals(v.items, 0, v.vat_mode, v.vat_rate).gross - docTotals(v.items, 0, v.vat_mode, v.vat_rate).lineDiscount);
  const discountPesos = pct ? Math.round(baseAfterLines * Math.min(100, Math.max(0, v.discount_percent ?? 0))) / 100 : v.discount;
  const t = docTotals(v.items, discountPesos, v.vat_mode, v.vat_rate);
  const ov = v.ocular_visit_id ? db.ocular_visits.find((o) => o.id === v.ocular_visit_id) : undefined;
  const def = db.services.find((s) => s.code === svc)!;

  const setItems = (items: QuoteItem[]) => f.set('items', items);
  const updItem = (i: number, p: Partial<QuoteItem>) => setItems(v.items.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const addPriced = (code: ServiceCode, q: number) => {
    const d = db.services.find((s) => s.code === code)!;
    const r = priceService(d, q);
    setItems([...v.items, ...r.lines]); setNote(r.note);
    if (!v.scope) f.set('scope', `${d.name} at ${(db.sites.find((s) => s.id === v.site_id)?.name ?? client?.name ?? 'site').replace(/\.+$/, '')}.`);
  };
  const save = () => {
    if (!v.client_id) return attempt(() => { throw new Error('Choose a client.'); });
    if (v.valid_until < v.issue_date) return attempt(() => { throw new Error('Validity date is before the issue date.'); });
    const r = attempt(() => saveQuotation({ ...v, discount: discountPesos, id: existing?.id, number: existing?.number, branch_id: client?.branch_id ?? v.branch_id }), 'Quotation saved') as Quotation | undefined;
    if (r && !existing) nav(`/sales/quote/${r.id}`, { replace: true });
    return r;
  };
  const doStatus = async (s: Quotation['status']) => {
    if (!existing) return;
    if (s === 'Rejected') { const r = await ask('Reject quotation', 'Reason for rejection'); if (r) attempt(() => setQuoteStatus(existing.id, s, r), 'Marked rejected'); return; }
    attempt(() => setQuoteStatus(existing.id, s), `Marked ${s.toLowerCase()}`);
  };
  const share = existing ? shareTextQuote(db, existing) : '';
  const wa = (client?.mobile ?? '').replace(/[^\d]/g, '').replace(/^0/, '63');
  const job = existing ? db.jobs.find((j) => j.quotation_id === existing.id && !j.deleted_at) : undefined;

  return (
    <>
      <PageHead title={existing ? `Quotation ${existing.number}` : 'New quotation'} sub={existing ? <><Badge>{existing.status}</Badge> · created {fmtStamp(existing.created_at)} by {db.users.find((u) => u.id === existing.created_by)?.name}</> : 'Draft — save to assign a quotation number'}>
        <Link to="/sales" className="btn">← Quotations</Link>
        {existing && <IncludeImagesToggle target={{ quotation_id: existing.id }} checked={pdfImg} onChange={setPdfImg} />}
        {existing && <button className="btn" onClick={() => attempt(() => quotationPdf(db, existing, { includeImages: pdfImg }))}><Icon name="download" />PDF</button>}
        {existing && client?.email && <a className="btn" href={`mailto:${client.email}?subject=${encodeURIComponent(`Quotation ${existing.number} – ${db.settings.company.name}`)}&body=${encodeURIComponent(share + '\n\n(Attach the downloaded PDF.)')}`}><Icon name="mail" />Email</a>}
        {existing && <a className="btn" target="_blank" rel="noreferrer" href={`https://wa.me/${wa}?text=${encodeURIComponent(share)}`}><Icon name="share" />WhatsApp</a>}
        {existing && ['Sent', 'Approved'].includes(existing.status) && <button className="btn" onClick={async () => { const url = quoteLink(existing.id); try { await navigator.clipboard.writeText(url); attempt(() => true, 'Client link copied — paste it in WhatsApp, Viber or email'); } catch { window.prompt('Copy this link for the client', url); } }}><Icon name="share" />Copy client link</button>}
        {existing && can('sales.edit') && <button className="btn" onClick={() => { const q = attempt(() => duplicateQuotation(existing.id), 'Duplicated as draft') as Quotation | undefined; if (q && (q as Quotation).id) nav(`/sales/quote/${(q as Quotation).id}`); }}>Duplicate</button>}
      </PageHead>

      {existing?.client_sig && <div className="alert info" style={{ marginBottom: 12 }}><b>Accepted and signed by {existing.client_sig_name}</b> on {fmtStamp(existing.client_sig_at ?? existing.decided_at ?? '')} through the client link. <img src={existing.client_sig} alt="Client signature" style={{ display: 'block', background: '#fff', borderRadius: 6, maxWidth: 220, marginTop: 6 }} /></div>}
      {existing?.status === 'Sent' && existing.valid_until < today() && <div className="alert warn" style={{ marginBottom: 12 }}><b>This quotation expired on {fmtDate(existing.valid_until)}.</b> The client can open the link but cannot sign it. Duplicate it to issue a new one with a fresh validity date.</div>}
      {existing?.status === 'Draft' && <div className="muted small" style={{ marginBottom: 8 }}>Mark the quotation as sent to get a link the client can open to review and sign it.</div>}
      {locked && <div className="alert info" style={{ marginBottom: 12 }}>This quotation is {existing!.status.toLowerCase()} and read-only. Use Duplicate to prepare a revised quote.</div>}
      {ov && <div className="alert info" style={{ marginBottom: 12 }}>Created from ocular visit <b>{ov.number}</b> ({v.ocular_assignee_id ? db.employees.find((e) => e.id === v.ocular_assignee_id)?.full_name : '—'}). Carried forward: {ov.panels.length ? `${ov.panels.reduce((n, p) => n + p.external + p.internal, 0)} counted glass panels across ${ov.panels.length} area(s)` : 'no panel count'}{ov.measurements.length ? `, ${ov.measurements.map((m) => `${m.label} ${m.qty} ${m.unit}`).join(', ')}` : ''}. Check the quantities and rates before sending.</div>}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <Card title="Client & scope">
          <div className="form-grid">
            <Field label="Client" required><select value={v.client_id} disabled={readOnly} onChange={(e) => { f.set('client_id', e.target.value); f.set('site_id', undefined); const c = db.clients.find((x) => x.id === e.target.value); if (c) f.set('vat_mode', c.vat_status === 'VAT-registered' ? 'exclusive' : 'none'); }}>{live(db.clients).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Service location" hint={v.client_id && !sites.length ? 'This client has no service site yet.' : undefined}><div className="row" style={{ gap: 6 }}><select style={{ flex: 1 }} value={v.site_id ?? ''} disabled={readOnly} onChange={(e) => f.set('site_id', e.target.value || undefined)}><option value="">— select site —</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>{v.client_id && !readOnly && can('clients.edit') && <button type="button" className="btn sm" onClick={() => setNewSite(true)}>+ Site</button>}</div></Field>
            <Field label="Issue date"><input type="date" disabled={readOnly} {...f.bind('issue_date')} /></Field>
            <Field label="Valid until"><input type="date" disabled={readOnly} {...f.bind('valid_until')} /></Field>
            <Field label="Scope of work" className="full"><textarea disabled={readOnly} {...f.bind('scope')} placeholder="Describe the work, areas, exclusions and access requirements…" /></Field>
          </div>
        </Card>

        <Card title="Line items">
          {!readOnly && (
            <div className="filterbar" style={{ marginTop: 0 }}>
              <Field label="Add from price list"><select value={svc} onChange={(e) => { const c = e.target.value as ServiceCode; setSvc(c); const d = db.services.find((s) => s.code === c)!; setQty(d.package_qty ?? Math.max(d.minimum_qty, 1)); }}>{db.services.map((s) => <option key={s.code} value={s.code}>{s.name}{s.custom_quote ? ' (custom)' : ''}</option>)}</select></Field>
              <Field label={`Quantity (${def.unit}s)`}><input type="number" min="1" value={qty} onChange={(e) => setQty(+e.target.value)} /></Field>
              <button className="btn navy" onClick={() => addPriced(svc, qty)}><Icon name="plus" />Add with pricing rules</button>
              {(svc === 'GLASS_EXT' || svc === 'GLASS_INT') && <button className="btn" onClick={() => setCalc(true)}>Panel counter…</button>}
              <button className="btn" onClick={() => setItems([...v.items, { service_code: 'OTHER', description: '', qty: 1, unit: 'lot', rate: 0, discount: 0 }])}>Blank line</button>
            </div>
          )}
          {note && <div className="alert info" style={{ marginBottom: 10 }}>{note}</div>}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Description</th><th style={{ width: 90 }}>Qty</th><th style={{ width: 100 }}>Unit</th><th style={{ width: 120 }}>Unit rate (₱)</th><th style={{ width: 110 }}>Discount (₱)</th><th className="num" style={{ width: 130 }}>Amount</th><th /></tr></thead>
              <tbody>
                {v.items.map((it, i) => (
                  <tr key={i}>
                    <td><input disabled={readOnly} value={it.description} onChange={(e) => updItem(i, { description: e.target.value })} aria-label="Description" /></td>
                    <td><input type="number" min="0" disabled={readOnly} value={it.qty} onChange={(e) => updItem(i, { qty: +e.target.value })} aria-label="Quantity" /></td>
                    <td><input disabled={readOnly} value={it.unit} onChange={(e) => updItem(i, { unit: e.target.value })} aria-label="Unit" /></td>
                    <td><input type="number" min="0" step="0.01" disabled={readOnly} value={it.rate} onChange={(e) => updItem(i, { rate: +e.target.value })} aria-label="Rate" /></td>
                    <td><input type="number" min="0" step="0.01" disabled={readOnly || !can('discount.approve')} title={can('discount.approve') ? undefined : 'Only the Owner / Admin can apply a discount'} value={it.discount} onChange={(e) => updItem(i, { discount: +e.target.value })} aria-label="Discount" /></td>
                    <td className="num">{money(it.qty * it.rate - it.discount)}</td>
                    <td>{!readOnly && <button className="icon-btn" onClick={() => setItems(v.items.filter((_, k) => k !== i))} aria-label="Remove line"><Icon name="trash" /></button>}</td>
                  </tr>
                ))}
                {!v.items.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 24 }}>No line items yet — add services using TopMop's pricing rules above.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="grid g2" style={{ marginTop: 14 }}>
            <div className="form-grid">
              <Field label="VAT treatment"><select disabled={readOnly} value={v.vat_mode} onChange={(e) => f.set('vat_mode', e.target.value as Form['vat_mode'])}><option value="exclusive">VAT exclusive (add VAT)</option><option value="inclusive">VAT inclusive</option><option value="none">No VAT (Non-VAT / exempt)</option></select></Field>
              <Field label="VAT rate (%)"><input type="number" disabled={readOnly || v.vat_mode === 'none'} {...f.bind('vat_rate')} /></Field>
              <Field label="Additional discount" hint={can('discount.approve') ? (pct ? `= ${money(discountPesos)} off the subtotal` : undefined) : 'Owner / Admin only. Others submit a Discount Request on the job.'}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select style={{ width: 'auto' }} disabled={readOnly || !can('discount.approve')} value={pct ? 'percent' : 'amount'} aria-label="Discount type" onChange={(e) => { if (e.target.value === 'percent') f.set('discount_type', 'percent'); else { f.set('discount_type', 'amount'); f.set('discount', discountPesos); } }}><option value="amount">₱ Peso</option><option value="percent">% Percent</option></select>
                  {pct ? <input type="number" min="0" max="100" step="0.01" disabled={readOnly || !can('discount.approve')} value={v.discount_percent ?? 0} onChange={(e) => f.set('discount_percent', +e.target.value)} aria-label="Discount percent" /> : <input type="number" min="0" disabled={readOnly || !can('discount.approve')} {...f.bind('discount')} />}
                </div>
              </Field>
            </div>
            <table className="tbl"><tbody>
              <tr><td>Subtotal</td><td className="num">{money(t.gross)}</td></tr>
              {t.discount > 0 && <tr><td>Discounts</td><td className="num">− {money(t.discount)}</td></tr>}
              {v.vat_mode !== 'none' && <tr><td>VAT {v.vat_rate}%{v.vat_mode === 'inclusive' ? ' (included)' : ''}</td><td className="num">{money(t.vat)}</td></tr>}
              <tr><td><b>Total</b></td><td className="num"><b style={{ fontSize: 18 }}>{money(t.total)}</b></td></tr>
              {client && client.withholding_rate > 0 && <tr><td className="muted small">Client withholds {client.withholding_rate}% → expected net collection</td><td className="num muted small">{money(t.total - t.net * (client.withholding_rate / 100))}</td></tr>}
            </tbody></table>
          </div>
        </Card>

        <Card title="Images / attachments (optional)" actions={<span className="small muted">Kept apart from job photos</span>}>
          {existing
            ? <QuoteImageGallery target={{ quotation_id: existing.id }} items={existing.items} title="Pictures that explain this quotation" />
            : <div className="small muted">Save the quotation first, then add pictures if they help explain the scope (site areas, panel-counting areas, access limits, exclusions). They are optional.</div>}
        </Card>
        <Card title="Introduction & cleaning methodology" actions={<span className="small muted">Printed on the quotation — edit for this client if needed</span>}>
          <Field label="Introduction (after “Dear Sir/Ma'am,”)" className="full"><textarea rows={4} style={{ width: '100%' }} disabled={readOnly} value={v.intro ?? ''} onChange={(e) => f.set('intro', e.target.value)} /></Field>
          <Field label="Our cleaning system methodology" className="full" hint="Leave a blank line between paragraphs. A block starting “Process:” lists steps as “Name: what happens”; a paragraph starting “Note:” is shown as a note."><textarea rows={12} style={{ width: '100%' }} disabled={readOnly} value={v.methodology ?? ''} onChange={(e) => f.set('methodology', e.target.value)} /></Field>
          {!readOnly && <div className="row" style={{ gap: 8 }}><button type="button" className="btn sm" onClick={() => f.set('intro', defaultIntro(db.settings))}>Reset introduction</button><button type="button" className="btn sm" onClick={() => f.set('methodology', defaultMethodology(db.settings))}>Reset methodology</button></div>}
        </Card>
        <Card title="Manpower, duration & disclaimer" actions={<span className="small muted">Shown on the quotation sent to the client</span>}>
          <div className="form-grid">
            <Field label="Crew deployed" hint="e.g. 6-7 — edit for each job"><input disabled={readOnly} value={v.crew_size ?? ''} onChange={(e) => f.set('crew_size', e.target.value)} placeholder="6-7" /></Field>
            <Field label="Working days"><input type="number" min={1} step={1} disabled={readOnly} value={v.work_days ?? ''} onChange={(e) => f.set('work_days', e.target.value === '' ? undefined : Math.max(1, Math.round(Number(e.target.value))))} /></Field>
            <label className="check full"><input type="checkbox" disabled={readOnly} checked={!!v.safety_officer} onChange={(e) => f.set('safety_officer', e.target.checked)} /> Include a Designated Safety Officer</label>
          </div>
          {(manpowerText(v) || durationText(v)) && <div className="alert info" style={{ margin: '10px 0' }}>{manpowerText(v) && <div><b>Manpower Deployment:</b> {manpowerText(v)}</div>}{durationText(v) && <div style={{ marginTop: 4 }}><b>Estimated Duration:</b> {durationText(v)}</div>}</div>}
          <Field label="Service disclaimer" hint="Printed on the quotation. Edit it for this client, or reset to the company default." className="full"><textarea rows={8} style={{ width: '100%' }} disabled={readOnly} value={v.disclaimer ?? ''} onChange={(e) => f.set('disclaimer', e.target.value)} /></Field>
          {!readOnly && <button type="button" className="btn sm" onClick={() => f.set('disclaimer', defaultDisclaimer(db.settings))}>Reset to company default</button>}
        </Card>
        <Card title="Payment terms" actions={<span className="small muted">Printed on the quotation and carried to the Job Order and invoice due date</span>}>
          <Field label="Client pays"><select disabled={readOnly} value={v.payment_option ?? ''} onChange={(e) => f.set('payment_option', e.target.value || undefined)}><option value="">— not specified (company default) —</option>{PAYMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        </Card>
        <Card title="Terms & conditions"><textarea rows={5} style={{ width: '100%' }} disabled={readOnly} {...f.bind('terms')} /></Card>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {!readOnly && <button className="btn primary lg" onClick={save}>Save draft</button>}
          {existing?.status === 'Draft' && can('sales.approve') && <button className="btn navy lg" onClick={() => { const q = save(); if (q !== undefined) doStatus('Sent'); }}>Save & mark as sent</button>}
          {existing?.status === 'Sent' && can('sales.approve') && <><button className="btn primary lg" onClick={() => doStatus('Approved')}>Client approved</button><button className="btn danger lg" onClick={() => doStatus('Rejected')}>Rejected</button></>}
          {existing?.status === 'Approved' && can('jobs.edit') && !job && <button className="btn primary lg" onClick={() => nav(`/jobs?fromQuote=${existing.id}`)}>Convert to booking →</button>}
          {job && <Link to={`/jobs/${job.id}`} className="btn lg">View job {job.number}</Link>}
        </div>
      </div>
      {newSite && <SiteForm clientId={v.client_id} onClose={() => setNewSite(false)} onSaved={(st) => f.set('site_id', st.id)} />}
      {calc && <PanelCalc onClose={() => setCalc(false)} onAdd={(p) => { setQty(p); addPriced('GLASS_EXT', p); setCalc(false); }} />}
    </>
  );
}
