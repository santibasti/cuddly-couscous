import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '@/ctx';
import ReceiptEditor from '@/components/ReceiptEditor';
import { groupSum, inPeriod, inputVatClaimable, monthPeriod, peso, planOf, quarterPeriod, round2, totalsOf } from '@/lib/bir';
import { SAMPLE_TAG, sampleReceipts } from '@/lib/sample';
import type { Receipt } from '@/lib/types';

const PALETTE = ['#0f766e', '#2563eb', '#b45309', '#7c3aed', '#be123c', '#4d7c0f'];
const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

export default function Dashboard() {
  const { api, company, receipts, scansUsed, canWrite, reload } = useApp();
  const [open, setOpen] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const q = quarterPeriod(now.getFullYear(), Math.ceil((now.getMonth() + 1) / 3));

  const d = useMemo(() => {
    const thisMonth = receipts.filter((r) => inPeriod(r, monthPeriod(ym)));
    const quarter = receipts.filter((r) => inPeriod(r, q));
    const claimable = quarter.filter((r) => inputVatClaimable(r, company));
    const months = Array.from({ length: 6 }, (_, i) => {
      const dt = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      return { month: dt.toLocaleString('en', { month: 'short' }), amount: round2(receipts.filter((r) => r.date.startsWith(key)).reduce((a, r) => a + r.total, 0)) };
    });
    return {
      month: totalsOf(thisMonth), quarter: totalsOf(quarter), claimVat: round2(claimable.reduce((a, r) => a + r.vatAmount, 0)),
      lostVat: round2(quarter.filter((r) => !inputVatClaimable(r, company)).reduce((a, r) => a + r.vatAmount, 0)),
      review: receipts.filter((r) => r.status === 'needs_review'), months, cats: groupSum(quarter, (r) => r.category).slice(0, 6),
    };
  }, [receipts, company]); // eslint-disable-line react-hooks/exhaustive-deps

  const limit = planOf(company.plan).scansPerMonth;
  async function loadSample() { setBusy(true); for (const r of sampleReceipts(company.id)) await api.saveReceipt(r); await reload(); setBusy(false); }
  async function clearSample() {
    if (!confirm('Remove all sample receipts?')) return;
    setBusy(true); for (const r of receipts.filter((x) => x.notes.includes(SAMPLE_TAG))) await api.deleteReceipt(r.id); await reload(); setBusy(false);
  }
  const hasSample = receipts.some((r) => r.notes.includes(SAMPLE_TAG));

  if (receipts.length === 0) {
    return (
      <div className="stack">
        <h1>Welcome, {company.name}</h1>
        <div className="card stack">
          <h2>Let’s get your first receipt in</h2>
          <ol className="muted"><li>Go to <b>Scan</b> and photograph a receipt or invoice.</li><li>Check the highlighted fields and press <b>Save & verify</b>.</li><li>Open <b>Reports</b> to download Excel/CSV for your accountant or BIR filing.</li></ol>
          <div className="row"><Link className="btn primary" to="/scan">📷 Scan a receipt</Link>{canWrite && <button onClick={loadSample} disabled={busy}>{busy ? 'Loading…' : 'Load sample data to look around'}</button>}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row between"><div><h1>Dashboard</h1><div className="muted">{company.name} · {q.label}</div></div><Link className="btn primary" to="/scan">📷 Scan receipt</Link></div>

      <div className="grid g4">
        <div className="card kpi"><div className="label">Spend this month</div><div className="value">{peso(d.month.gross)}</div><div className="sub">{d.month.count} receipts</div></div>
        <div className="card kpi"><div className="label">Spend this quarter</div><div className="value">{peso(d.quarter.gross)}</div><div className="sub">{d.quarter.count} receipts</div></div>
        <div className="card kpi"><div className="label">Input VAT you can claim ({q.label})</div><div className="value">{company.vatRegistered ? peso(d.claimVat) : '—'}</div>
          <div className="sub">{company.vatRegistered ? (d.lostVat > 0 ? `${peso(d.lostVat)} VAT on receipts that don’t qualify` : 'All VAT receipts qualify') : 'Turn on VAT-registered in Settings'}</div></div>
        <div className="card kpi"><div className="label">Needs review</div><div className="value">{d.review.length}</div><div className="sub">{scansUsed}/{limit} scans used this month</div></div>
      </div>

      <div className="grid g2">
        <div className="card"><h2>Spend, last 6 months</h2>
          <div style={{ height: 240 }} role="img" aria-label="Bar chart of monthly spend">
            <ResponsiveContainer><BarChart data={d.months}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="month" stroke="var(--muted)" /><YAxis tickFormatter={k} stroke="var(--muted)" width={44} /><Tooltip formatter={(v) => peso(Number(v))} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)' }} /><Bar dataKey="amount" fill="#0f766e" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
          </div></div>
        <div className="card"><h2>Top categories, this quarter</h2>
          {d.cats.length === 0 ? <div className="muted">No receipts in this quarter yet.</div> : (
            <div style={{ height: 240 }} role="img" aria-label="Bar chart of spend by category">
              <ResponsiveContainer><BarChart data={d.cats} layout="vertical" margin={{ left: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--line)" /><XAxis type="number" tickFormatter={k} stroke="var(--muted)" /><YAxis type="category" dataKey="name" width={130} stroke="var(--muted)" tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => peso(Number(v))} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)' }} /><Bar dataKey="amount" radius={[0, 6, 6, 0]}>{d.cats.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Bar></BarChart></ResponsiveContainer>
            </div>)}
        </div>
      </div>

      <div className="card">
        <div className="row between"><h2>Waiting for your review</h2><Link to="/receipts">All receipts →</Link></div>
        {d.review.length === 0 ? <div className="notice ok">Everything is verified. 🎉</div> : (
          <ul className="issues">{d.review.slice(0, 6).map((r) => (
            <li key={r.id} className="row between" style={{ background: 'var(--bg)' }}>
              <span>{r.date} · <b>{r.supplierName || '(no name)'}</b> · {peso(r.total)}</span><button onClick={() => setOpen(r)}>Review</button>
            </li>))}</ul>)}
      </div>

      {canWrite && hasSample && <div className="notice info row between">Sample data is loaded. <button onClick={clearSample} disabled={busy}>Remove sample data</button></div>}
      {open && <ReceiptEditor key={open.id} initial={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
