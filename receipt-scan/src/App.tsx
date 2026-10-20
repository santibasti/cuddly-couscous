import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Ctx } from './ctx';
import { getApi, type Api } from './lib/api';
import type { Company, Receipt, Session } from './lib/types';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Scan from './pages/Scan';
import Receipts from './pages/Receipts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

const NAV = [
  { to: '/', icon: '▦', label: 'Dashboard', end: true },
  { to: '/scan', icon: '📷', label: 'Scan' },
  { to: '/receipts', icon: '🧾', label: 'Receipts' },
  { to: '/reports', icon: '⬇', label: 'Reports' },
  { to: '/settings', icon: '⚙', label: 'Settings' },
];

export default function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [company, setCompany] = useState<Company | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [scansUsed, setScansUsed] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    getApi().then(async (a) => { setApi(a); setSession(await a.getSession()); }).catch((e) => setError(e.message));
  }, []);

  const reload = useCallback(async () => {
    if (!api) return;
    const [c, r, u] = await Promise.all([api.getCompany(), api.listReceipts(), api.scansUsed()]);
    setCompany(c); setReceipts(r); setScansUsed(u);
  }, [api]);

  useEffect(() => {
    if (session) reload().catch((e) => setError(e.message)); else { setCompany(null); setReceipts([]); }
  }, [session, reload]);

  if (error) return <div className="auth"><div className="card notice bad">{error}</div></div>;
  if (!api || session === undefined) return <div className="auth muted">Loading…</div>;
  if (!session) return <Auth api={api} onSession={setSession} />;
  if (!company) return <div className="auth muted">Loading your company…</div>;

  const ctx = {
    api, session, company, receipts, scansUsed, canWrite: session.role !== 'viewer', reload, setCompany,
    signOut: async () => { await api.signOut(); setSession(null); },
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="side">
          <div className="brand"><i>🧾</i> ResiboScan</div>
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className="nav"><span>{n.icon}</span>{n.label}</NavLink>)}
          <div className="who">
            <b>{company.name}</b><br />{session.email}<br />
            {api.mode === 'demo' && <span className="chip warn">Demo mode</span>}
            <div><button className="ghost" onClick={ctx.signOut}>Sign out</button></div>
          </div>
        </aside>
        <main className="main">
          {api.mode === 'demo' && <div className="notice warn" style={{ marginBottom: '1rem' }}>Demo mode: data is stored only in this browser and receipts are not read automatically. Connect Supabase (see README) for real accounts and automatic reading.</div>}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <nav className="bottom">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><span>{n.icon}</span>{n.label}</NavLink>)}
        </nav>
      </div>
    </Ctx.Provider>
  );
}
