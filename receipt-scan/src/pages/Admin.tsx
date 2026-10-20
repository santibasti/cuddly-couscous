import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import PageHero from '@/components/PageHero';
import { useBase } from '@/ctx';
import { csvOf } from '@/lib/exports';
import { peso } from '@/lib/bir';
import type { CompanyStats, FirmRow } from '@/lib/types';

const ago = (iso: string | null) => {
  if (!iso) return 'Never';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
};
const pct = (r: CompanyStats) => (r.scanLimit ? r.scansUsed / r.scanLimit : 1);

/** Platform-owner console: every client company, its usage and its limits. */
export default function Admin() {
  const { api } = useBase();
  const [rows, setRows] = useState<CompanyStats[] | null>(null);
  const [firms, setFirms] = useState<FirmRow[]>([]);
  const [tab, setTab] = useState<'companies' | 'firms'>('companies');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'near'>('all');
  const [edit, setEdit] = useState<CompanyStats | null>(null);
  const [editFirm, setEditFirm] = useState<FirmRow | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { const [c, f] = await Promise.all([api.adminListCompanies(), api.adminListFirms()]); setRows(c); setFirms(f); } catch (e) { setErr((e as Error).message); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((r) =>
    (filter === 'all' || (filter === 'active' && r.status === 'active') || (filter === 'paused' && r.status === 'suspended') || (filter === 'near' && pct(r) >= 0.8)) &&
    (!q || `${r.name} ${r.tin} ${r.ownerEmail ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [rows, q, filter]);
  const kpi = useMemo(() => {
    const r = rows ?? [];
    return { n: r.length, active: r.filter((x) => x.status === 'active').length, receipts: r.reduce((a, x) => a + x.receiptsTotal, 0), scans: r.reduce((a, x) => a + x.scansUsed, 0), near: r.filter((x) => x.status === 'active' && pct(x) >= 0.8).length };
  }, [rows]);

  function download() {
    const csv = csvOf({ name: 'companies', headers: ['Company', 'Owner email', 'TIN', 'Status', 'Receipts', 'Scans used', 'Scan limit', 'Last activity', 'Joined'],
      rows: (rows ?? []).map((r) => [r.name, r.ownerEmail ?? '', r.tin, r.status, r.receiptsTotal, r.scansUsed, r.scanLimit, r.lastActivity ?? '', r.createdAt]) });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'all-companies.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div className="stack">
      <PageHero icon="shield" title="Owner console" sub="Every company on your platform — usage, limits and status">
        <button className="glass" onClick={download} disabled={!rows?.length}><Icon name="download" size={17} />Export CSV</button>
      </PageHero>
      {err && <div className="notice bad"><Icon name="error" />{err}</div>}

      <div className="grid g4">
        <div className="card kpi kpi-card teal"><div className="kpi-top"><span className="kpi-ic"><Icon name="users" /></span><div className="label">Companies</div></div><div className="value">{kpi.n}</div><div className="sub">{kpi.active} active · {firms.length} accounting firm{firms.length === 1 ? '' : 's'}</div></div>
        <div className="card kpi kpi-card blue"><div className="kpi-top"><span className="kpi-ic"><Icon name="receipt" /></span><div className="label">Receipts stored</div></div><div className="value">{kpi.receipts.toLocaleString('en-PH')}</div></div>
        <div className="card kpi kpi-card green"><div className="kpi-top"><span className="kpi-ic"><Icon name="camera" /></span><div className="label">Scans this month</div></div><div className="value">{kpi.scans.toLocaleString('en-PH')}</div><div className="sub">≈ your reader API calls</div></div>
        <div className="card kpi kpi-card amber"><div className="kpi-top"><span className="kpi-ic"><Icon name="alert" /></span><div className="label">Near their limit (80%+)</div></div><div className="value">{kpi.near}</div><div className="sub">Likely upgrade candidates</div></div>
      </div>

      <div className="row between">
        <div className="tabs"><button className={tab === 'companies' ? 'on' : ''} onClick={() => setTab('companies')}>Companies</button><button className={tab === 'firms' ? 'on' : ''} onClick={() => setTab('firms')}>Accounting firms</button></div>
        {tab === 'companies' && (
          <div className="row">
            <div className="searchbox"><Icon name="search" size={16} /><input style={{ width: 240 }} placeholder="Search name, TIN, email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search companies" /></div>
            <select style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter"><option value="all">All</option><option value="active">Active</option><option value="paused">Paused</option><option value="near">Near limit</option></select>
          </div>)}
      </div>

      {rows === null ? <div className="empty"><Icon name="spinner" size={22} /></div> : tab === 'companies' ? (
        <div className="card tablewrap" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Company</th><th>Owner</th><th className="num">Receipts</th><th>Scans this month</th><th>Last activity</th><th>Status</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b><div className="small muted">{r.tin || 'No TIN'} · joined {r.createdAt ? r.createdAt.slice(0, 10) : '—'}</div></td>
                  <td className="small">{r.ownerEmail ?? '—'}</td><td className="num">{r.receiptsTotal}<div className="small muted">{peso(r.spendMonth)} this month</div></td>
                  <td style={{ minWidth: 140 }}><div className="bar"><i style={{ width: `${Math.min(100, pct(r) * 100)}%` }} /></div><div className="small muted">{r.scansUsed} / {r.scanLimit}</div></td>
                  <td className="small muted nowrap">{ago(r.lastActivity)}</td>
                  <td>{r.status === 'active' ? <span className="chip ok">Active</span> : <span className="chip bad">Paused</span>}</td>
                  <td className="right"><button className="sm" onClick={() => setEdit(r)}>Manage</button></td>
                </tr>))}
              {shown.length === 0 && <tr><td colSpan={7} className="empty">{rows.length === 0 ? 'No companies have signed up yet.' : 'Nothing matches.'}</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card tablewrap" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Firm</th><th>Login email</th><th className="num">Clients</th><th className="num">Client limit</th><th>Joined</th><th /></tr></thead>
            <tbody>
              {firms.map((f) => (
                <tr key={f.userId}><td><b>{f.name}</b></td><td className="small">{f.email}</td><td className="num">{f.clients}</td><td className="num">{f.maxClients}</td><td className="small muted">{f.createdAt.slice(0, 10)}</td><td className="right"><button className="sm" onClick={() => setEditFirm(f)}>Manage</button></td></tr>))}
              {firms.length === 0 && <tr><td colSpan={6} className="empty">No accounting firms yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {edit && <EditCompany row={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await load(); }} />}
      {editFirm && <EditFirm row={editFirm} onClose={() => setEditFirm(null)} onSaved={async () => { setEditFirm(null); await load(); }} />}
    </div>
  );
}

function EditCompany({ row, onClose, onSaved }: { row: CompanyStats; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { api } = useBase();
  const [limit, setLimit] = useState(String(row.scanLimit));
  const [status, setStatus] = useState(row.status);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr('');
    try { await api.adminUpdateCompany(row.id, { scanLimit: Number(limit), status }); await onSaved(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Manage company" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal stack" style={{ width: 'min(480px, 100%)' }}>
        <div className="row between"><div><h2 style={{ margin: 0 }}>{row.name}</h2><div className="small muted">{row.ownerEmail} · {row.scansUsed} scans used this month</div></div><button className="ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <label className="f"><span className="lbl">Monthly scan limit</span><input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
        <div className="row">{[50, 100, 250, 500].map((n) => <button key={n} type="button" className="sm" onClick={() => setLimit(String(Number(limit || 0) + n))}>+{n}</button>)}<button type="button" className="sm ghost" onClick={() => setLimit('100')}>Reset to 100</button></div>
        <label className="f"><span className="lbl">Account status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="active">Active</option><option value="suspended">Paused (read-only, no scanning)</option></select></label>
        {status === 'suspended' && <div className="notice warn"><Icon name="alert" />The company can still see and export its data, but cannot scan or save changes until you reactivate it.</div>}
        {err && <div className="notice bad" role="alert"><Icon name="error" />{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button onClick={onClose}>Cancel</button><button className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </div>
    </div>
  );
}

function EditFirm({ row, onClose, onSaved }: { row: FirmRow; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { api } = useBase();
  const [max, setMax] = useState(String(row.maxClients));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr('');
    try { await api.adminUpdateFirm(row.userId, Number(max)); await onSaved(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Manage firm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal stack" style={{ width: 'min(440px, 100%)' }}>
        <div className="row between"><div><h2 style={{ margin: 0 }}>{row.name}</h2><div className="small muted">{row.email} · {row.clients} client{row.clients === 1 ? '' : 's'} now</div></div><button className="ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <label className="f"><span className="lbl">Maximum client workspaces</span><input type="number" min={0} value={max} onChange={(e) => setMax(e.target.value)} /></label>
        <div className="small muted">This is your accountant-plan lever: raise it when the firm pays for more clients.</div>
        {err && <div className="notice bad" role="alert"><Icon name="error" />{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button onClick={onClose}>Cancel</button><button className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </div>
    </div>
  );
}
