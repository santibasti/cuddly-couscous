import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/Icon';
import PageHero from '@/components/PageHero';
import { useBase } from '@/ctx';
import { formatTin, peso } from '@/lib/bir';
import { csvOf } from '@/lib/exports';
import type { CompanyStats } from '@/lib/types';

const ago = (iso: string | null) => {
  if (!iso) return 'No activity yet';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
};

/** Accounting-firm home: every client workspace on one screen. */
export default function Clients() {
  const { api, session, setSession } = useBase();
  const nav = useNavigate();
  const [rows, setRows] = useState<CompanyStats[] | null>(null);
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(false);
  const [err, setErr] = useState('');
  const isFirm = session.kind === 'firm';

  const load = useCallback(async () => { try { setRows(await api.listClients()); } catch (e) { setErr((e as Error).message); } }, [api]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((r) => !q || `${r.name} ${r.tin}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const tot = useMemo(() => (rows ?? []).reduce((a, r) => ({ review: a.review + r.needsReview, spend: a.spend + r.spendMonth, rc: a.rc + r.receiptsMonth }), { review: 0, spend: 0, rc: 0 }), [rows]);

  async function open(id: string) { setSession(await api.switchCompany(id)); nav('/'); }

  function download() {
    const csv = csvOf({ name: 'clients', headers: ['Client', 'TIN', 'VAT', 'Receipts this month', 'Spend this month', 'Needs review', 'Scans used', 'Scan limit', 'Last activity'],
      rows: (rows ?? []).map((r) => [r.name, r.tin, r.vatRegistered ? 'Yes' : 'No', r.receiptsMonth, r.spendMonth, r.needsReview, r.scansUsed, r.scanLimit, r.lastActivity ?? '']) });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'client-summary.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div className="stack">
      <PageHero icon="users" title={isFirm ? 'Your clients' : 'Your companies'} sub={`${rows?.length ?? 0} client workspace${rows?.length === 1 ? '' : 's'} · each one is private and separate`}>
        {rows && rows.length > 0 && <button className="glass" onClick={download}><Icon name="download" size={17} />Summary CSV</button>}
        {isFirm && <button className="light" onClick={() => setAdd(true)}><Icon name="plus" size={17} />Add client</button>}
      </PageHero>
      {err && <div className="notice bad"><Icon name="error" />{err}</div>}

      {rows && rows.length > 0 && (
        <div className="grid g4">
          <div className="card kpi kpi-card teal"><div className="kpi-top"><span className="kpi-ic"><Icon name="users" /></span><div className="label">Clients</div></div><div className="value">{rows.length}</div></div>
          <div className="card kpi kpi-card blue"><div className="kpi-top"><span className="kpi-ic"><Icon name="receipt" /></span><div className="label">Receipts this month</div></div><div className="value">{tot.rc}</div></div>
          <div className="card kpi kpi-card green"><div className="kpi-top"><span className="kpi-ic"><Icon name="wallet" /></span><div className="label">Spend this month (all)</div></div><div className="value">{peso(tot.spend)}</div></div>
          <div className="card kpi kpi-card amber"><div className="kpi-top"><span className="kpi-ic"><Icon name="clock" /></span><div className="label">Waiting for review</div></div><div className="value">{tot.review}</div></div>
        </div>
      )}

      {rows === null ? <div className="empty"><Icon name="spinner" size={22} /></div> : rows.length === 0 ? (
        <div className="card empty">
          <div className="drop-ic" style={{ margin: '0 auto 1rem', width: 60, height: 60, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#22d3ee,#6366f1)', color: '#fff' }}><Icon name="users" size={28} /></div>
          <h2 style={{ justifyContent: 'center' }}>No clients yet</h2>
          <p className="muted">Add your first client to give them their own private receipt workspace.</p>
          {isFirm && <button className="primary" onClick={() => setAdd(true)}><Icon name="plus" size={17} />Add your first client</button>}
        </div>
      ) : (
        <>
          <div className="searchbox" style={{ maxWidth: 320 }}><Icon name="search" size={16} /><input placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" /></div>
          <div className="card tablewrap" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Client</th><th className="num">Receipts (month)</th><th className="num">Spend (month)</th><th>Review</th><th>Scans</th><th>Last activity</th><th /></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="click" onClick={() => open(r.id)}>
                    <td><b>{r.name}</b> {r.status === 'suspended' && <span className="chip bad">Paused</span>}<div className="small muted">{r.tin || 'No TIN yet'} · {r.vatRegistered ? 'VAT' : 'Non-VAT'}</div></td>
                    <td className="num">{r.receiptsMonth}</td><td className="num">{peso(r.spendMonth)}</td>
                    <td>{r.needsReview ? <span className="chip warn">{r.needsReview} to review</span> : <span className="chip ok">Up to date</span>}</td>
                    <td style={{ minWidth: 120 }}><div className="bar"><i style={{ width: `${Math.min(100, r.scanLimit ? (r.scansUsed / r.scanLimit) * 100 : 100)}%` }} /></div><div className="small muted">{r.scansUsed} / {r.scanLimit}</div></td>
                    <td className="small muted nowrap">{ago(r.lastActivity)}</td>
                    <td className="right"><button className="sm primary" onClick={(e) => { e.stopPropagation(); void open(r.id); }}>Open</button></td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={7} className="empty">No client matches “{q}”.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {add && <AddClient onClose={() => setAdd(false)} onAdded={async (id) => { setAdd(false); await load(); void id; }} />}
    </div>
  );
}

function AddClient({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void | Promise<void> }) {
  const { api } = useBase();
  const [f, setF] = useState({ name: '', tin: '', vat: false });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await onAdded(await api.addClient({ name: f.name, tin: f.tin, vatRegistered: f.vat })); } catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Add client" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal stack" style={{ width: 'min(480px, 100%)' }} onSubmit={submit}>
        <div className="row between"><h2 style={{ margin: 0 }}>Add a client</h2><button type="button" className="ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <label className="f"><span className="lbl">Client business name</span><input required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="f"><span className="lbl">Client TIN (optional now)</span><input inputMode="numeric" placeholder="000-000-000-00000" value={f.tin} onChange={(e) => setF({ ...f, tin: formatTin(e.target.value) })} /></label>
        <label className="check"><input type="checkbox" checked={f.vat} onChange={(e) => setF({ ...f, vat: e.target.checked })} /> <span>VAT-registered (claims input VAT)</span></label>
        {err && <div className="notice bad" role="alert"><Icon name="error" />{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Adding…' : 'Add client'}</button></div>
      </form>
    </div>
  );
}
