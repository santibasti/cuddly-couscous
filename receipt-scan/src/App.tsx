import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Ctx } from './ctx';
import Icon, { type IconName } from './components/Icon';
import { getApi, type Api } from './lib/api';
import type { Company, Receipt, Session } from './lib/types';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Scan from './pages/Scan';
import Receipts from './pages/Receipts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

const NAV: { to: string; icon: IconName; label: string; end?: boolean }[] = [
  { to: '/', icon: 'grid', label: 'Dashboard', end: true },
  { to: '/scan', icon: 'camera', label: 'Scan' },
  { to: '/receipts', icon: 'receipt', label: 'Receipts' },
  { to: '/reports', icon: 'sheet', label: 'Reports' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
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

  if (error) return <div className="auth-form"><div className="notice bad"><Icon name="error" />{error}</div></div>;
  if (!api || session === undefined) return <div className="auth-form muted"><Icon name="spinner" size={22} /></div>;
  if (!session) return <Auth api={api} onSession={setSession} />;
  if (!company) return <div className="auth-form muted"><Icon name="spinner" size={22} /></div>;

  const ctx = {
    api, session, company, receipts, scansUsed, canWrite: session.role !== 'viewer', reload, setCompany,
    signOut: async () => { await api.signOut(); setSession(null); },
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="side">
          <div className="brand"><span className="logo"><Icon name="receipt" size={19} /></span>ResiboScan</div>
          <div className="nav-label">Workspace</div>
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className="nav"><Icon name={n.icon} />{n.label}</NavLink>)}
          <div className="usercard">
            <div className="row" style={{ flexWrap: 'nowrap', gap: '.65rem' }}>
              <span className="avatar">{company.name.trim().charAt(0).toUpperCase() || '?'}</span>
              <div style={{ minWidth: 0 }}><div className="name">{company.name}</div><div className="mail">{session.email}</div></div>
            </div>
            {api.mode === 'demo' && <div style={{ marginTop: '.6rem' }}><span className="chip warn">Demo mode</span></div>}
            <button onClick={ctx.signOut}><Icon name="logout" size={16} />Sign out</button>
          </div>
        </aside>
        <main className="main">
          {api.mode === 'demo' && (
            <div className="notice warn banner"><Icon name="alert" size={18} />
              <span><b>Demo mode</b> — data stays in this browser and receipts aren’t read automatically. Connect Supabase to go live.</span></div>
          )}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <nav className="bottom" aria-label="Main">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} size={21} />{n.label}</NavLink>)}
        </nav>
      </div>
    </Ctx.Provider>
  );
}
