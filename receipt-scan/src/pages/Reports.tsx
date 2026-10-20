import { useMemo, useState } from 'react';
import { useApp } from '@/ctx';
import Icon from '@/components/Icon';
import PageHero from '@/components/PageHero';
import { monthPeriod, peso, quarterPeriod, totalsOf, yearPeriod, type Period } from '@/lib/bir';
import { downloadCsv, downloadXlsx, reportPack } from '@/lib/exports';

type Kind = 'month' | 'quarter' | 'year' | 'custom';

export default function Reports() {
  const { company, receipts } = useApp();
  const now = new Date();
  const [kind, setKind] = useState<Kind>('quarter');
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));
  const [month, setMonth] = useState(now.toISOString().slice(0, 7));
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`);
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [onlyVerified, setOnlyVerified] = useState(true);
  const [busy, setBusy] = useState(false);

  const period: Period = kind === 'month' ? monthPeriod(month) : kind === 'quarter' ? quarterPeriod(year, quarter) : kind === 'year' ? yearPeriod(year) : { label: `${from}_to_${to}`, from, to };
  const pack = useMemo(() => reportPack(receipts, company, period, onlyVerified), [receipts, company, period.from, period.to, onlyVerified]); // eslint-disable-line react-hooks/exhaustive-deps
  const unverifiedInPeriod = receipts.filter((r) => r.date >= period.from && r.date <= period.to && r.status !== 'verified').length;
  const t = totalsOf(pack.list);
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="stack">
      <PageHero icon="sheet" title="Reports & export" sub="Download your records as Excel or CSV for your accountant or BIR filing." />
      <div className="card stack">
        <div className="row">
          <div className="tabs">{(['month', 'quarter', 'year', 'custom'] as Kind[]).map((x) => <button key={x} className={kind === x ? 'on' : ''} onClick={() => setKind(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}</div>
          {kind === 'month' && <input type="month" style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />}
          {(kind === 'quarter' || kind === 'year') && <select style={{ width: 'auto' }} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">{years.map((y) => <option key={y}>{y}</option>)}</select>}
          {kind === 'quarter' && <select style={{ width: 'auto' }} value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} aria-label="Quarter">{[1, 2, 3, 4].map((x) => <option key={x} value={x}>Q{x}</option>)}</select>}
          {kind === 'custom' && <><input type="date" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /><span>to</span><input type="date" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" /></>}
        </div>
        <label className="check"><input type="checkbox" checked={onlyVerified} onChange={(e) => setOnlyVerified(e.target.checked)} /> Include verified receipts only (recommended)</label>
        {onlyVerified && unverifiedInPeriod > 0 && <div className="notice warn"><Icon name="alert" />{unverifiedInPeriod} receipt(s) in this period are still “needs review” and are left out.</div>}
        <div className="grid g4">
          <div className="kpi"><div className="label">Receipts</div><div className="value">{t.count}</div></div>
          <div className="kpi"><div className="label">Total purchases</div><div className="value">{peso(t.gross)}</div></div>
          <div className="kpi"><div className="label">VATable</div><div className="value">{peso(t.vatable)}</div></div>
          <div className="kpi"><div className="label">Input VAT</div><div className="value">{peso(t.vat)}</div></div>
        </div>
        <div className="row">
          <button className="primary" disabled={busy || t.count === 0} onClick={async () => { setBusy(true); await downloadXlsx(pack.tables, company, period); setBusy(false); }}><Icon name="download" size={17} />Excel workbook (all sheets)</button>
          {t.count === 0 && <span className="muted small">Nothing to export for this period.</span>}
        </div>
      </div>

      <div className="card tablewrap">
        <h2><span className="dot" />Individual files (CSV)</h2>
        <table><thead><tr><th>Report</th><th className="num">Rows</th><th /></tr></thead>
          <tbody>{pack.tables.map((tb) => (
            <tr key={tb.name}><td>{tb.name}{tb.name.startsWith('SLP') && !company.vatRegistered && <span className="muted small"> — your company is not marked VAT-registered</span>}</td><td className="num">{tb.rows.length}</td>
              <td className="right"><button className="sm" disabled={tb.rows.length === 0} onClick={() => downloadCsv(tb, company, period)}><Icon name="download" size={15} />CSV</button></td></tr>))}</tbody></table>
        <p className="small muted">Layouts follow common BIR schedules (Summary List of Purchases, withholding schedule) but are working papers, not official filings. Have your accountant confirm them before submitting.</p>
      </div>
    </div>
  );
}
