import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '@/ctx';
import Icon from '@/components/Icon';
import ReceiptEditor from '@/components/ReceiptEditor';
import PageHero, { Ring } from '@/components/PageHero';
import { groupSum, inPeriod, inputVatClaimable, monthPeriod, peso, quarterPeriod, round2, totalsOf } from '@/lib/bir';
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

  const limit = company.scanLimit;
  async function loadSample() { setBusy(true); for (const r of sampleReceipts(company.id)) await api.saveReceipt(r); await reload(); setBusy(false); }
  async function clearSample() {
    if (!confirm('Remove all sample receipts?')) return;
    setBusy(true); for (const r of receipts.filter((x) => x.notes.includes(SAMPLE_TAG))) await api.deleteReceipt(r.id); await reload(); setBusy(false);
  }
  const hasSample = receipts.some((r) => r.notes.includes(SAMPLE_TAG));
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const verifiedPct = receipts.length ? receipts.filter((r) => r.status === 'verified').length / receipts.length : 0;

  if (receipts.length === 0) {
    return (
      <div className="stack">
        <section className="hero">
          <div className="hero-big"><div>
            <h1>Welcome, {company.name}</h1>
            <p className="lead">Let’s get your first receipt in. It takes under a minute — snap a photo, check the details, done.</p>
            <div className="row"><Link className="btn light" to="/scan"><Icon name="camera" size={17} />Scan a receipt</Link>{canWrite && <button className="glass" onClick={loadSample} disabled={busy}>{busy ? 'Loading…' : 'Load sample data to look around'}</button>}</div>
          </div></div>
        </section>
        <div className="grid g4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {([
            ['camera', 'teal', '1. Scan', 'Photograph a receipt or invoice — or add several photos at once.'],
            ['shield', 'amber', '2. Check', 'Confirm the highlighted fields. We flag missing TINs and VAT that doesn’t add up.'],
            ['sheet', 'blue', '3. Export', 'Download Excel or CSV for your accountant or BIR filing.'],
          ] as const).map(([ic, tone, t, txt]) => (
            <div key={t} className={`card kpi kpi-card ${tone}`}>
              <div className="kpi-top"><span className="kpi-ic"><Icon name={ic} /></span><div style={{ fontWeight: 650, fontSize: '1.02rem' }}>{t}</div></div>
              <div className="muted">{txt}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-big">
          <div style={{ flex: '1 1 340px' }}>
            <div className="hero-sub" style={{ opacity: .85 }}>{company.name} · {q.label}</div>
            <h1>{greet}! <span style={{ opacity: .9 }}>Here’s your spending.</span></h1>
            <p className="lead">{d.review.length === 0 ? 'Everything is verified — your records are export-ready.' : `${d.review.length} receipt${d.review.length === 1 ? '' : 's'} waiting for your review before you export.`}</p>
            <div className="row">
              <Link className="btn light" to="/scan"><Icon name="camera" size={17} />Scan receipt</Link>
              <Link className="btn glass" to="/reports"><Icon name="download" size={17} />Export report</Link>
            </div>
          </div>
          <div className="row" style={{ gap: '1.25rem', flexWrap: 'nowrap' }}>
            <div className="hero-stats"><div className="hero-stat"><b>{peso(d.month.gross)}</b><span>this month</span></div><div className="hero-stat"><b>{d.month.count}</b><span>receipts this month</span></div></div>
            <Ring pct={verifiedPct} label="verified" />
          </div>
        </div>
      </section>

      <div className="grid g4">
        <div className="card kpi kpi-card teal"><div className="kpi-top"><span className="kpi-ic"><Icon name="wallet" /></span><div className="label">Spend this month</div></div><div className="value">{peso(d.month.gross)}</div><div className="sub">{d.month.count} receipts</div></div>
        <div className="card kpi kpi-card blue"><div className="kpi-top"><span className="kpi-ic"><Icon name="trend" /></span><div className="label">Spend this quarter</div></div><div className="value">{peso(d.quarter.gross)}</div><div className="sub">{d.quarter.count} receipts</div></div>
        <div className="card kpi kpi-card green"><div className="kpi-top"><span className="kpi-ic"><Icon name="percent" /></span><div className="label">Input VAT you can claim ({q.label})</div></div><div className="value">{company.vatRegistered ? peso(d.claimVat) : '—'}</div>
          <div className="sub">{company.vatRegistered ? (d.lostVat > 0 ? `${peso(d.lostVat)} VAT on receipts that don’t qualify` : 'All VAT receipts qualify') : 'Turn on VAT-registered in Settings'}</div></div>
        <div className="card kpi kpi-card amber"><div className="kpi-top"><span className="kpi-ic"><Icon name="clock" /></span><div className="label">Needs review</div></div><div className="value">{d.review.length}</div><div className="sub">{scansUsed}/{limit} scans used this month</div></div>
      </div>

      <div className="grid g2">
        <div className="card"><h2><span className="dot" />Spend, last 6 months</h2>
          <div style={{ height: 240 }} role="img" aria-label="Bar chart of monthly spend">
            <ResponsiveContainer><BarChart data={d.months}><defs><linearGradient id="barg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2dd4bf" /><stop offset="100%" stopColor="#0f766e" /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="month" stroke="var(--muted)" /><YAxis tickFormatter={k} stroke="var(--muted)" width={44} /><Tooltip formatter={(v) => peso(Number(v))} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)' }} /><Bar dataKey="amount" fill="url(#barg)" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer>
          </div></div>
        <div className="card"><h2><span className="dot" />Top categories, this quarter</h2>
          {d.cats.length === 0 ? <div className="muted">No receipts in this quarter yet.</div> : (
            <div style={{ height: 240 }} role="img" aria-label="Bar chart of spend by category">
              <ResponsiveContainer><BarChart data={d.cats} layout="vertical" margin={{ left: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--line)" /><XAxis type="number" tickFormatter={k} stroke="var(--muted)" /><YAxis type="category" dataKey="name" width={130} stroke="var(--muted)" tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => peso(Number(v))} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)' }} /><Bar dataKey="amount" radius={[0, 6, 6, 0]}>{d.cats.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Bar></BarChart></ResponsiveContainer>
            </div>)}
        </div>
      </div>

      <div className="card">
        <div className="row between"><h2><span className="dot" />Waiting for your review</h2><Link to="/receipts">All receipts →</Link></div>
        {d.review.length === 0 ? <div className="notice ok"><Icon name="check" />Everything is verified.</div> : (
          <ul className="issues list">{d.review.slice(0, 6).map((r) => (
            <li key={r.id} className="item">
              <span>{r.date} · <b>{r.supplierName || '(no name)'}</b> · {peso(r.total)}</span><button className="sm" onClick={() => setOpen(r)}>Review</button>
            </li>))}</ul>)}
      </div>

      {canWrite && hasSample && <div className="notice info row between"><span className="row" style={{ gap: '.5rem' }}><Icon name="alert" />Sample data is loaded.</span><button className="sm" onClick={clearSample} disabled={busy}>Remove sample data</button></div>}
      {open && <ReceiptEditor key={open.id} initial={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
