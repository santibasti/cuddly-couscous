import { useMemo, useState } from 'react';
import { useApp } from '@/ctx';
import Icon from '@/components/Icon';
import ReceiptEditor from '@/components/ReceiptEditor';
import { CATEGORIES, checkReceipt, hasErrors, peso } from '@/lib/bir';
import type { Receipt } from '@/lib/types';

export default function Receipts() {
  const { receipts, company } = useApp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [cat, setCat] = useState('');
  const [month, setMonth] = useState('');
  const [open, setOpen] = useState<Receipt | null>(null);

  const months = useMemo(() => [...new Set(receipts.map((r) => r.date.slice(0, 7)))].sort().reverse(), [receipts]);
  const rows = useMemo(() => receipts.filter((r) =>
    (!status || r.status === status) && (!cat || r.category === cat) && (!month || r.date.startsWith(month)) &&
    (!q || `${r.supplierName} ${r.invoiceNo} ${r.supplierTin} ${r.notes}`.toLowerCase().includes(q.toLowerCase()))), [receipts, q, status, cat, month]);
  const sum = rows.reduce((a, r) => a + r.total, 0);

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Receipts</h1><div className="sub">{receipts.length} saved · click a row to review or edit</div></div></div>
      <div className="row">
        <div className="searchbox"><Icon name="search" size={16} /><input style={{ width: 280 }} placeholder="Search supplier, invoice no., TIN…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></div>
        <select style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month"><option value="">All months</option>{months.map((m) => <option key={m}>{m}</option>)}</select>
        <select style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Any status</option><option value="needs_review">Needs review</option><option value="verified">Verified</option></select>
        <select style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <span className="grow" /><b style={{ fontSize: '1.05rem' }}>{peso(sum)}</b><span className="muted small">{rows.length} shown</span>
      </div>
      <div className="card tablewrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Date</th><th>Supplier</th><th>Invoice / OR</th><th>Category</th><th className="num">VAT</th><th className="num">Total</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const bad = hasErrors(checkReceipt(r, receipts, company));
              return (
                <tr key={r.id} className="click" onClick={() => setOpen(r)}>
                  <td className="nowrap">{r.date}</td>
                  <td>{r.supplierName || <span className="muted">(no name)</span>}<div className="small muted">{r.supplierTin}</div></td>
                  <td>{r.invoiceNo}</td><td>{r.category}</td>
                  <td className="num">{peso(r.vatAmount)}</td><td className="num">{peso(r.total)}</td>
                  <td>{r.status === 'verified' ? <span className="chip ok">Verified</span> : <span className="chip warn">Needs review</span>} {bad && r.status !== 'verified' && <span className="chip bad">Issues</span>}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="empty">No receipts match. Use Scan to add some.</td></tr>}
          </tbody>
        </table>
      </div>
      {open && <ReceiptEditor key={open.id} initial={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
