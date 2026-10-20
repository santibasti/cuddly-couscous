import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Ctx, useBase, type AppCtx } from './ctx';
import Icon, { type IconName } from './components/Icon';
import { getApi, type Api } from './lib/api';
import type { Company, Receipt, Session } from './lib/types';
import Admin from './pages/Admin';
import Auth from './pages/Auth';
import Clients from './pages/Clients';
import Dashboard from './pages/Dashboard';
import Scan from './pages/Scan';
import Receipts from './pages/Receipts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

type NavItem = { to: string; icon: IconName; label: string; end?: boolean };
const WORKSPACE: NavItem[] = [
  { to: '/', icon: 'grid', label: 'Dashboard', end: true },
  { to: '/scan', icon: 'camera', label: 'Scan' },
  { to: '/receipts', icon: 'receipt', label: 'Receipts' },
  { to: '/reports', icon: 'sheet', label: 'Reports' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
];

export default function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loaded, setLoaded] = useState<Company | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [scansUsed, setScansUsed] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    getApi().then(async (a) => { setApi(a); setSession(await a.getSession()); }).catch((e) => setError(e.message));
  }, []);

  const companyId = session?.companyId ?? null;
  const reload = useCallback(async () => {
    if (!api || !companyId) return;
    const [c, r, u] = await Promise.all([api.getCompany(), api.listReceipts(), api.scansUsed()]);
    setLoaded(c); setReceipts(r); setScansUsed(u);
  }, [api, companyId]);

  useEffect(() => {
    if (companyId) reload().catch((e) => setError(e.message)); else { setLoaded(null); setReceipts([]); setScansUsed(0); }
  }, [companyId, reload]);

  if (error) return <div className="auth-form"><div className="notice bad"><Icon name="error" />{error}</div></div>;
  if (!api || session === undefined) return <div className="auth-form muted"><Icon name="spinner" size={22} /></div>;
  if (!session) return <Auth api={api} onSession={setSession} />;

  // never show the previous client's data while the next one is loading
  const company = loaded && loaded.id === companyId ? loaded : null;
  if (companyId && !company) return <div className="auth-form muted"><Icon name="spinner" size={22} /></div>;

  const isMulti = session.kind === 'firm' || session.companyCount > 1;
  const nav: NavItem[] = [
    ...(isMulti ? [{ to: '/clients', icon: 'users' as const, label: 'Clients' }] : []),
    ...(company ? WORKSPACE : []),
    ...(session.isAdmin ? [{ to: '/admin', icon: 'shield' as const, label: 'Owner console' }] : []),
  ];
  const home = session.isAdmin && !company ? '/admin' : '/clients';

  const ctx: AppCtx = {
    api, session, company, receipts, scansUsed, reload, setSession,
    canWrite: session.role !== null && session.role !== 'viewer' && company?.status === 'active',
    setCompany: setLoaded,
    signOut: async () => { await api.signOut(); setSession(null); },
  };
  const who = company?.name ?? (session.isAdmin ? 'Platform owner' : session.kind === 'firm' ? 'Accounting firm' : 'My account');
  const guarded = (el: ReactElement) => (company ? el : <Navigate to={home} replace />);

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="side">
          <div className="brand"><span className="logo"><Icon name="receipt" size={19} /></span>ResiboScan</div>
          <div className="nav-label">{company ? 'Workspace' : 'Menu'}</div>
          {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className="nav"><Icon name={n.icon} />{n.label}</NavLink>)}
          <div className="usercard">
            <div className="row" style={{ flexWrap: 'nowrap', gap: '.65rem' }}>
              <span className="avatar">{who.trim().charAt(0).toUpperCase() || '?'}</span>
              <div style={{ minWidth: 0 }}><div className="name">{who}</div><div className="mail">{session.email}</div></div>
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
          {company && isMulti && <ClientBar name={company.name} />}
          {company?.status === 'suspended' && (
            <div className="notice bad banner"><Icon name="alert" size={18} /><span><b>This account is paused.</b> You can still view and export your records, but scanning and editing are turned off. Contact support to reactivate it.</span></div>
          )}
          <Routes>
            <Route path="/" element={company ? <Dashboard /> : <Navigate to={home} replace />} />
            <Route path="/scan" element={guarded(<Scan />)} />
            <Route path="/receipts" element={guarded(<Receipts />)} />
            <Route path="/reports" element={guarded(<Reports />)} />
            <Route path="/settings" element={guarded(<Settings />)} />
            <Route path="/clients" element={isMulti ? <Clients /> : <Navigate to="/" replace />} />
            <Route path="/admin" element={session.isAdmin ? <Admin /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <nav className="bottom" aria-label="Main" style={{ gridTemplateColumns: `repeat(${Math.max(nav.length, 1)}, 1fr)` }}>
          {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} size={21} />{n.label}</NavLink>)}
        </nav>
      </div>
    </Ctx.Provider>
  );
}

/** Shown to firms while inside one client's workspace. */
function ClientBar({ name }: { name: string }) {
  const { api, setSession } = useBase();
  const go = useNavigate();
  return (
    <div className="ctxbar">
      <span className="row" style={{ gap: '.5rem' }}><Icon name="users" size={17} />Client workspace: <b>{name}</b></span>
      <button className="sm" onClick={async () => { setSession(await api.switchCompany(null)); go('/clients'); }}>← All clients</button>
    </div>
  );
}
