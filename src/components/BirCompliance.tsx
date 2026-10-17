// Finance → BIR compliance: the Summary List of Sales (SLS) and Summary List of Purchases (SLP) of a tax month, ready to key into RELIEF,
// with what still needs fixing, and a VAT reconciliation. Built from approved invoices and expenses; nothing is invented.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { store, useAuth } from '@/lib/store';
import { Badge, Card, Stat, Tabs, attempt } from '@/components/ui';
import { exportCsv, exportXlsx, type ExportTable } from '@/lib/export';
import { listReceipts, type Receipt } from '@/lib/receipts';
import { buildSlp, buildSls, fmtTin, groupSlsByBuyer, reconcile, reliefDate, slpIssues, slpTotals, slsIncluded, slsIssues, slsTotals, type Flag, type SalesClass, type SlpRow, type SlsRow } from '@/lib/bir';
import { money, today } from '@/lib/util';

type Sub = 'guide' | 'sls' | 'slp' | 'recon';
const CLS_LABEL: Record<SalesClass, string> = { vatable: 'VATable', zero: 'Zero-rated', exempt: 'VAT-exempt', none: 'No VAT charged' };
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Flags({ flags }: { flags: Flag[] }) {
  if (!flags.length) return <Badge tone="green">Ready</Badge>;
  return <div className="stack" style={{ gap: 3 }}>{flags.map((f, i) => <div key={i} className="small" style={{ color: f.level === 'error' ? 'var(--red)' : f.level === 'warn' ? 'var(--amber)' : 'var(--muted)' }}>{f.level === 'error' ? '⛔' : f.level === 'warn' ? '⚠️' : 'ℹ️'} {f.text}</div>)}</div>;
}

export function BirCompliance() {
  const { db, can } = useAuth();
  const [month, setMonth] = useState(today().slice(0, 7)); const [sub, setSub] = useState<Sub>('sls');
  const [byBuyer, setByBuyer] = useState(false); const [onlyFix, setOnlyFix] = useState(false);
  const edit = can('reports.finance');
  const [rcs, setRcs] = useState<Receipt[]>([]);
  useEffect(() => { let off = false; listReceipts().then((r) => { if (!off) setRcs(r); }).catch(() => undefined); return () => { off = true; }; }, []);   // scanned receipts decided "BIR only" join the purchases list
  const sls = useMemo(() => buildSls(db, month), [db, month]); const slp = useMemo(() => buildSlp(db, month, rcs), [db, month, rcs]);
  const st = slsTotals(sls); const pt = slpTotals(slp); const rec = useMemo(() => reconcile(db, month, rcs), [db, month, rcs]);
  const co = db.settings.company;

  const setBir = (patch: Partial<NonNullable<typeof db.settings.bir>>) => attempt(() => { store.require('reports.finance'); store.patchSettings({ bir: { ...(db.settings.bir ?? {}), ...patch } }, 'Updated BIR compliance settings'); });
  const toggle = (key: 'sls_skip' | 'slp_skip', id: string) => { const cur = db.settings.bir?.[key] ?? []; setBir({ [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }); };
  const setClass = (id: string, v: string) => { const cur = { ...(db.settings.bir?.sls_class ?? {}) }; if (v === 'auto') delete cur[id]; else cur[id] = v as 'vatable' | 'zero' | 'exempt'; setBir({ sls_class: cur }); };

  const slsRows: SlsRow[] = byBuyer ? groupSlsByBuyer(sls) : sls;
  const shownSls = slsRows.filter((r) => !onlyFix || r.flags.some((f) => f.level !== 'info'));
  const shownSlp = slp.filter((r) => !onlyFix || r.flags.some((f) => f.level !== 'info'));

  const slsTable = (): ExportTable => ({
    title: `SLS ${month}`, subtitle: `${co.name} · TIN ${fmtTin(co.tin) || '—'} · Summary List of Sales for ${monthLabel(month)}`,
    headers: ['Invoice date (MM/DD/YYYY)', 'TIN', 'Buyer registered name', 'Address', 'Gross taxable', 'Taxable (net of VAT)', 'Zero-rated', 'Exempt', 'Total output tax', 'Invoice no.'],
    types: ['text', 'text', 'text', 'text', 'money', 'money', 'money', 'money', 'money', 'text'],
    rows: slsRows.filter(slsIncluded).map((r) => [byBuyer ? `${month.slice(5)}/${month.slice(0, 4)}` : reliefDate(r.date), fmtTin(r.tin), r.name, r.address, r.gross_taxable, r.taxable, r.zero, r.exempt, r.output_tax, r.invoice]),
    totals: ['TOTAL', '', '', '', st.gross_taxable, st.taxable, st.zero, st.exempt, st.output_tax, ''],
  });
  const slpTable = (): ExportTable => ({
    title: `SLP ${month}`, subtitle: `${co.name} · TIN ${fmtTin(co.tin) || '—'} · Summary List of Purchases for ${monthLabel(month)}`,
    headers: ['Invoice date (MM/DD/YYYY)', 'Supplier TIN', 'Supplier registered name', 'Supplier address', 'Invoice no.', 'Gross purchase', 'Exempt / non-VAT', 'Zero-rated', 'Taxable (net of VAT)', 'Services', 'Capital goods', 'Goods other than capital', 'Input VAT'],
    types: ['text', 'text', 'text', 'text', 'text', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'money'],
    rows: slp.filter((r) => !r.skipped).map((r) => [reliefDate(r.date), fmtTin(r.tin), r.supplier, r.address, r.invoice, r.gross, r.exempt, r.zero, r.taxable, r.services, r.capital, r.goods, r.input_vat]),
    totals: ['TOTAL', '', '', '', '', pt.gross, pt.exempt, pt.zero, pt.taxable, pt.services, pt.capital, pt.goods, pt.input_vat],
  });
  const guard = (t: ExportTable, n: number, fn: () => void) => { if (n > 0 && !confirm(`${n} record${n === 1 ? ' has' : 's have'} a missing TIN or address (marked ⛔). Export anyway? Fix them first if you can.`)) return; fn(); void t; };

  return (
    <div className="stack">
      <div className="alert info">
        <b>BIR compliance — Summary Lists for RELIEF.</b> This tab prepares the numbers and flags what is missing; it does not file anything and is not tax advice. Rules and field definitions change, so check the current BIR instructions or ask your accountant / RDO before you finalize.
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 180 }}><span className="small muted">Tax month</span><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
        <span className="muted small">{co.name} · TIN {fmtTin(co.tin) || <b style={{ color: 'var(--red)' }}>not set (Admin → Rates & settings → Company)</b>}</span>
      </div>
      <div className="grid g4 keep2">
        <Stat k="Output VAT (sales)" v={money(st.output_tax)} s={`${st.count} sales record${st.count === 1 ? '' : 's'}`} tone="navy" />
        <Stat k="Creditable input VAT" v={money(pt.input_vat)} s={`${pt.count} purchase record${pt.count === 1 ? '' : 's'}`} tone="navy" />
        <Stat k="VAT payable (before credits)" v={money(rec.payable)} s="Output − input" tone={rec.payable > 0 ? 'warn' : 'good'} />
        <Stat k="Records to fix" v={String(slsIssues(sls) + slpIssues(slp))} s="Missing TIN / address / VAT details" tone={slsIssues(sls) + slpIssues(slp) ? 'bad' : 'good'} />
      </div>
      <Tabs tabs={[{ id: 'sls', label: 'Sales (SLS)', count: sls.length }, { id: 'slp', label: 'Purchases (SLP)', count: slp.length }, { id: 'recon', label: 'VAT reconciliation' }, { id: 'guide', label: 'RELIEF checklist' }]} value={sub} onChange={setSub} />

      {sub === 'sls' && (
        <Card title={`Summary List of Sales — ${monthLabel(month)}`} actions={<div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="check small"><input type="checkbox" checked={byBuyer} onChange={(e) => setByBuyer(e.target.checked)} />One line per buyer</label>
          <label className="check small"><input type="checkbox" checked={onlyFix} onChange={(e) => setOnlyFix(e.target.checked)} />Only rows to fix</label>
          <button className="btn sm" onClick={() => guard(slsTable(), slsRows.filter((r) => slsIncluded(r) && r.flags.some((f) => f.level === 'error')).length, () => exportCsv(slsTable()))}>CSV</button>
          <button className="btn sm" onClick={() => guard(slsTable(), slsRows.filter((r) => slsIncluded(r) && r.flags.some((f) => f.level === 'error')).length, () => void exportXlsx(slsTable()))}>Excel</button></div>} flush>
          <div className="tbl-wrap"><table className="tbl bir"><thead><tr><th>#</th><th>Invoice date</th><th>TIN</th><th>Buyer name · address</th><th className="num">Gross taxable</th><th className="num">Taxable (net of VAT)</th><th className="num">Zero-rated</th><th className="num">Exempt</th><th className="num">Output tax</th><th>Check</th>{!byBuyer && edit && <th />}</tr></thead>
            <tbody>
              {shownSls.map((r, i) => (
                <tr key={r.id} style={r.skipped || r.cls === 'none' ? { opacity: 0.55 } : undefined}>
                  <td className="muted small" title="RELIEF assigns the sequence number if it is automatic">{i + 1}</td>
                  <td>{byBuyer ? monthLabel(month) : reliefDate(r.date)}<div className="small muted">{r.invoice}</div></td>
                  <td>{fmtTin(r.tin) || <span className="muted">—</span>}</td>
                  <td><Link to={`/clients/${r.client_id}`}><b>{r.name}</b></Link><div className="small muted">{r.address || 'no address'} · {r.buyer === 'consumer' ? 'individual' : 'business'}</div></td>
                  <td className="num">{money(r.gross_taxable)}</td><td className="num">{money(r.taxable)}</td><td className="num">{money(r.zero)}</td><td className="num">{money(r.exempt)}</td><td className="num">{money(r.output_tax)}</td>
                  <td style={{ minWidth: 240 }}>{r.skipped && <Badge tone="gray">Left out</Badge>}{!r.skipped && r.cls === 'none' && <Badge tone="gray">Not on the list</Badge>}<Flags flags={r.flags} /></td>
                  {!byBuyer && edit && <td style={{ minWidth: 150 }}>
                    <select value={db.settings.bir?.sls_class?.[r.id] ?? 'auto'} onChange={(e) => setClass(r.id, e.target.value)} aria-label="Classification" title="How this sale is classified">
                      <option value="auto">{CLS_LABEL[r.auto_cls]} (from invoice)</option><option value="vatable">VATable</option><option value="zero">Zero-rated</option><option value="exempt">VAT-exempt</option></select>
                    <div><button className="btn sm" onClick={() => toggle('sls_skip', r.id)}>{r.skipped ? 'Put back' : 'Leave out'}</button></div></td>}
                </tr>
              ))}
              {!shownSls.length && <tr><td colSpan={11} className="muted" style={{ padding: 16 }}>No sales records for this month{onlyFix ? ' that need fixing' : ''}.</td></tr>}
              {shownSls.length > 0 && <tr><td colSpan={4}><b>Total ({st.count})</b></td><td className="num"><b>{money(st.gross_taxable)}</b></td><td className="num"><b>{money(st.taxable)}</b></td><td className="num"><b>{money(st.zero)}</b></td><td className="num"><b>{money(st.exempt)}</b></td><td className="num"><b>{money(st.output_tax)}</b></td><td colSpan={2} /></tr>}
            </tbody></table></div>
          <div className="small muted" style={{ padding: 12 }}>
            Gross taxable = taxable sales plus the VAT on them. Taxable = VATable sales excluding VAT. Check the field definitions on the RELIEF screen before you key them in. Add buyer TINs and addresses on the client page — only from the buyer's own documents.
            Sales with no TIN to individuals (walk-in consumers) are shown, but how they are treated on the SLS must be confirmed with the current BIR instructions; they are never given an invented customer record.
          </div>
        </Card>
      )}

      {sub === 'slp' && (
        <Card title={`Summary List of Purchases — ${monthLabel(month)}`} actions={<div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="check small"><input type="checkbox" checked={onlyFix} onChange={(e) => setOnlyFix(e.target.checked)} />Only rows to fix</label>
          <button className="btn sm" onClick={() => guard(slpTable(), slp.filter((r) => !r.skipped && r.flags.some((f) => f.level === 'error')).length, () => exportCsv(slpTable()))}>CSV</button>
          <button className="btn sm" onClick={() => guard(slpTable(), slp.filter((r) => !r.skipped && r.flags.some((f) => f.level === 'error')).length, () => void exportXlsx(slpTable()))}>Excel</button></div>} flush>
          <div className="tbl-wrap"><table className="tbl bir"><thead><tr><th>#</th><th>Date · invoice</th><th>Supplier TIN</th><th>Supplier name · address</th><th className="num">Gross</th><th className="num">Exempt / non-VAT</th><th className="num">Zero-rated</th><th className="num">Taxable (net)</th><th className="num">Services</th><th className="num">Capital</th><th className="num">Goods</th><th className="num">Input VAT</th><th>Check</th>{edit && <th />}</tr></thead>
            <tbody>
              {shownSlp.map((r: SlpRow, i) => (
                <tr key={r.id} style={r.skipped ? { opacity: 0.55 } : undefined}>
                  <td className="muted small">{i + 1}</td>
                  <td>{reliefDate(r.date)}<div className="small muted">{r.invoice || 'no invoice no.'}</div></td>
                  <td>{fmtTin(r.tin) || <span className="muted">—</span>}</td>
                  <td><b>{r.supplier}</b> <Badge tone={r.vat_status === 'VAT' ? 'blue' : 'gray'}>{r.vat_status}</Badge><div className="small muted">{r.address || 'no address'}</div></td>
                  <td className="num">{money(r.gross)}</td><td className="num">{money(r.exempt)}</td><td className="num">{money(r.zero)}</td><td className="num">{money(r.taxable)}</td><td className="num">{money(r.services)}</td><td className="num">{money(r.capital)}</td><td className="num">{money(r.goods)}</td><td className="num">{money(r.input_vat)}</td>
                  <td style={{ minWidth: 240 }}>{r.skipped && <Badge tone="gray">Left out</Badge>}<Flags flags={r.flags} /></td>
                  {edit && <td><button className="btn sm" onClick={() => toggle('slp_skip', r.id)}>{r.skipped ? 'Put back' : 'Leave out'}</button><div><Link className="small" to={r.id.startsWith('rc:') ? '/receipts' : '/finance?tab=expenses'}>{r.id.startsWith('rc:') ? 'Open receipt' : 'Edit expense'}</Link></div></td>}
                </tr>
              ))}
              {!shownSlp.length && <tr><td colSpan={14} className="muted" style={{ padding: 16 }}>No purchase records for this month{onlyFix ? ' that need fixing' : ''}. Only approved expenses count.</td></tr>}
              {shownSlp.length > 0 && <tr><td colSpan={4}><b>Total ({pt.count})</b></td><td className="num"><b>{money(pt.gross)}</b></td><td className="num"><b>{money(pt.exempt)}</b></td><td className="num"><b>{money(pt.zero)}</b></td><td className="num"><b>{money(pt.taxable)}</b></td><td className="num"><b>{money(pt.services)}</b></td><td className="num"><b>{money(pt.capital)}</b></td><td className="num"><b>{money(pt.goods)}</b></td><td className="num"><b>{money(pt.input_vat)}</b></td><td colSpan={2} /></tr>}
            </tbody></table></div>
          <div className="small muted" style={{ padding: 12 }}>
            One record per supplier invoice: suppliers are never combined. Supplier details (registered name, TIN, address, VAT status, invoice number, purchase type) are filled in on each expense under <b>Finance → Expenses → BIR details</b>.
            Purchases from non-VAT suppliers are listed, but no input VAT is claimed on them. Payroll is not a purchase and is left out.
          </div>
        </Card>
      )}

      {sub === 'recon' && (
        <Card title={`VAT reconciliation — ${monthLabel(month)}`}>
          <table className="tbl"><tbody>
            <tr><td>Output VAT on the SLS</td><td className="num">{money(rec.output_tax)}</td></tr>
            <tr><td>VAT shown on the approved invoices of the month</td><td className="num">{money(rec.invoice_vat)}</td></tr>
            <tr><td className="muted">Difference (sales left out or classified zero-rated / exempt / no VAT)</td><td className="num" style={{ color: rec.output_gap ? 'var(--amber)' : undefined }}>{money(rec.output_gap)}</td></tr>
            <tr><td>Creditable input VAT on the SLP</td><td className="num">{money(rec.input_vat)}</td></tr>
            <tr><td>Input VAT recorded on the approved expenses of the month</td><td className="num">{money(rec.expense_vat)}</td></tr>
            <tr><td className="muted">Not credited (incomplete supplier TIN / invoice number, non-VAT supplier, or left out)</td><td className="num" style={{ color: rec.not_credited ? 'var(--amber)' : undefined }}>{money(rec.not_credited)}</td></tr>
            <tr><td><b>VAT payable before credits (output − input)</b></td><td className="num"><b>{money(rec.payable)}</b></td></tr>
          </tbody></table>
          <div className="small muted" style={{ marginTop: 8 }}>Compare these figures with your purchase journal and the VAT return (2550Q) before filing. Carry-over credits, withholding VAT and other adjustments are not included here.</div>
        </Card>
      )}

      {sub === 'guide' && (
        <div className="grid g2">
          <Card title="1 · Encode the Summary List of Sales (SLS)">
            <ol className="small" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              <li>In RELIEF go to <b>Sales → Add / Update</b>. Encode only the buyer records that belong on the SLS under the applicable rules.</li>
              <li><b>Sequence number</b> — let RELIEF assign it if it is automatic.</li>
              <li><b>Tax month / date</b> — the actual invoice date, in the format RELIEF requires (shown here as MM/DD/YYYY).</li>
              <li><b>TIN</b> — the buyer's verified TIN, when required. Never invent one.</li>
              <li><b>Buyer name</b> — the registered name for a business buyer.</li>
              <li><b>Address</b> — the buyer's actual registered address, when required.</li>
              <li><b>Gross taxable · Taxable (net of VAT) · Zero-rated · Exempt</b> — as the field definitions say (see the SLS table).</li>
              <li><b>Total output tax</b> — check it against the VAT shown in your records (VAT reconciliation tab).</li>
            </ol>
            <div className="alert warn small"><b>Walk-in consumers.</b> Sales under ₱100,000 to customers with no TIN or address: do not create false customer records. The old "casual buyer" rule applies to buyers engaged in business or a profession; it does not automatically make every walk-in consumer a casual buyer. Confirm how direct-to-consumer sales are treated under the current BIR instructions before you finalize the SLS.</div>
          </Card>
          <Card title="2 · Encode the Summary List of Purchases (SLP)">
            <ol className="small" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              <li>In RELIEF go to <b>Purchase → Add / Update</b> and use your supplier invoices and records.</li>
              <li>Encode each supplier's <b>registered name and TIN</b> accurately.</li>
              <li>Enter the <b>supplier address</b> as the format requires.</li>
              <li>Enter the purchase amounts under the <b>correct tax classification</b> (taxable, zero-rated, exempt / non-VAT; services, capital goods, other goods).</li>
              <li>Reconcile input VAT with your purchase journal and the VAT return.</li>
              <li>Include purchases from <b>non-VAT suppliers</b> in the purchase records, but do not claim input VAT where none is legally creditable.</li>
              <li><b>Do not combine suppliers</b> into one record unless the current BIR format expressly allows it.</li>
            </ol>
            <div className="small muted">Before exporting: clear every ⛔ in the Sales and Purchases tabs, and make sure each approved expense has its supplier details.</div>
          </Card>
        </div>
      )}
    </div>
  );
}
