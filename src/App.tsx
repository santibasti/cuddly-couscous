import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { store, useAuth, useBoot } from '@/lib/store';
import { CLOUD } from '@/lib/cloud';
import { ROLE_LABEL, ROUTE_ACCESS } from '@/lib/rbac';
import { runAutomations } from '@/lib/actions';
import { Icon, Overlays, Badge, toast } from '@/components/ui';
import { SyncBadge } from '@/components/touch';
import { InstallPrompt, UpdateBanner } from '@/components/InstallPrompt';
import { confirmLeave } from '@/lib/sync';
import { Logo } from '@/components/Logo';
import { fmtStamp } from '@/lib/util';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Clients from '@/pages/Clients';
import ClientDetail from '@/pages/ClientDetail';
import Sales from '@/pages/Sales';
import QuoteEditor from '@/pages/QuoteEditor';
import Jobs from '@/pages/Jobs';
import JobDetail from '@/pages/JobDetail';
import Attendance from '@/pages/Attendance';
import Employees from '@/pages/Employees';
import EmployeeDetail from '@/pages/EmployeeDetail';
import Payroll from '@/pages/Payroll';
import PayrollDetail from '@/pages/PayrollDetail';
import Inventory from '@/pages/Inventory';
import Assets from '@/pages/Assets';
import Finance from '@/pages/Finance';
import Reports from '@/pages/Reports';
import Admin from '@/pages/Admin';
import Notifications from '@/pages/Notifications';
import Portal from '@/pages/Portal';

const NAV: { to: string; key: keyof typeof ROUTE_ACCESS; label: string; icon: string; group?: string }[] = [
  { to: '/dashboard', key: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'Overview' },
  { to: '/jobs', key: 'jobs', label: 'Jobs & Calendar', icon: 'calendar', group: 'Operations' },
  { to: '/attendance', key: 'attendance', label: 'Attendance', icon: 'attendance' },
  { to: '/assets', key: 'assets', label: 'Equipment Out/In', icon: 'assets' },
  { to: '/inventory', key: 'inventory', label: 'Inventory', icon: 'inventory' },
  { to: '/clients', key: 'clients', label: 'Clients', icon: 'clients', group: 'Sales' },
  { to: '/sales', key: 'sales', label: 'Quotations', icon: 'sales' },
  { to: '/finance', key: 'finance', label: 'Finance', icon: 'finance', group: 'Finance & People' },
  { to: '/payroll', key: 'payroll', label: 'Payroll', icon: 'payroll' },
  { to: '/employees', key: 'employees', label: 'Employees', icon: 'employees' },
  { to: '/reports', key: 'reports', label: 'Reports', icon: 'reports', group: 'Insights' },
  { to: '/admin', key: 'admin', label: 'Admin', icon: 'admin', group: 'System' },
];

function homeFor(any: (p: string[]) => boolean): string {
  if (!any(ROUTE_ACCESS.dashboard) && any(ROUTE_ACCESS.attendance)) return '/attendance'; // field crews land on the clock
  const first = NAV.find((n) => any(ROUTE_ACCESS[n.key]));
  return first?.to ?? '/login';
}

function Guard({ area, children }: { area: keyof typeof ROUTE_ACCESS; children: React.ReactNode }) {
  const { user, any } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!any(ROUTE_ACCESS[area])) return <div className="content"><div className="alert warn">Your role does not have access to this area. Contact the Owner / Admin if you need it.</div></div>;
  return <>{children}</>;
}

function Shell() {
  const { user, any, db } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    runAutomations();
    const t = setInterval(runAutomations, 60000);
    return () => clearInterval(t);
  }, [user?.id]);
  useEffect(() => {
    const h = (e: MouseEvent) => bellRef.current && !bellRef.current.contains(e.target as Node) && setBell(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!user) return <Navigate to="/login" replace />;
  const items = NAV.filter((n) => any(ROUTE_ACCESS[n.key]));
  const mine = db.notifications.filter((n) => !n.deleted_at && n.for_roles.includes(user.role));
  const unread = mine.filter((n) => !n.read_by.includes(user.id));
  const bottom = items.slice(0, 5);
  let lastGroup = '';

  return (
    <div className="app">
      <aside className={open ? 'sidebar open' : 'sidebar'} aria-label="Main navigation">
        <div className="brand"><div className="logo"><Logo size={26} /></div><div className="lbl"><b>TOPMOP</b><span>Operations System</span></div></div>
        <nav className="nav">
          {items.map((n) => {
            const g = n.group && n.group !== lastGroup ? n.group : null; if (g) lastGroup = g;
            return (
              <div key={n.to} style={{ display: 'contents' }}>
                {g && <div className="sep">{g}</div>}
                <NavLink to={n.to} title={n.label} aria-label={n.label} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={n.icon} /><span className="lbl">{n.label}</span></NavLink>
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="lbl"><div style={{ color: '#fff', fontWeight: 600 }}>{user.name}</div>
          <div>{ROLE_LABEL[user.role]}</div></div>
          <button className="btn sm block" title="Sign out" aria-label="Sign out" style={{ marginTop: 10 }} onClick={() => { if (!confirmLeave()) return; store.logout(); nav('/login'); }}><Icon name="logout" /><span className="lbl">Sign out</span></button>
        </div>
      </aside>
      <div className={open ? 'scrim open' : 'scrim'} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn burger" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <div className="title grow">{items.find((n) => loc.pathname.startsWith(n.to))?.label ?? 'TopMop'}</div>
          <SyncBadge />
          <span className="muted small hide-sm">Asia/Manila</span>
          <div className="rel" ref={bellRef}>
            <button className="icon-btn" onClick={() => setBell((b) => !b)} aria-label={`Notifications (${unread.length} unread)`}><Icon name="bell" />{unread.length > 0 && <span className="dot">{unread.length > 99 ? '99+' : unread.length}</span>}</button>
            {bell && (
              <div className="dd">
                <div className="card-h"><b>Notifications</b><button className="btn sm" onClick={() => store.markRead(unread.map((n) => n.id))}>Mark all read</button></div>
                <ul className="list">
                  {mine.slice(0, 8).map((n) => (
                    <li key={n.id} className={`sev-${n.severity}`} style={{ cursor: 'pointer', opacity: n.read_by.includes(user.id) ? 0.6 : 1 }} onClick={() => { store.markRead([n.id]); setBell(false); if (n.link) nav(n.link.replace(/\?.*/, '')); }}>
                      <div><b style={{ fontSize: 13 }}>{n.title}</b><div className="small muted">{n.body}</div></div>
                    </li>
                  ))}
                  {!mine.length && <li className="muted">You're all caught up.</li>}
                </ul>
                <div style={{ padding: 10 }}><button className="btn sm block" onClick={() => { setBell(false); nav('/notifications'); }}>View all</button></div>
              </div>
            )}
          </div>
          <div className="avatar" title={user.name}>{user.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}</div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/dashboard" element={<Guard area="dashboard"><Dashboard /></Guard>} />
            <Route path="/clients" element={<Guard area="clients"><Clients /></Guard>} />
            <Route path="/clients/:id" element={<Guard area="clients"><ClientDetail /></Guard>} />
            <Route path="/sales" element={<Guard area="sales"><Sales /></Guard>} />
            <Route path="/sales/quote/:id" element={<Guard area="sales"><QuoteEditor /></Guard>} />
            <Route path="/jobs" element={<Guard area="jobs"><Jobs /></Guard>} />
            <Route path="/jobs/:id" element={<Guard area="jobs"><JobDetail /></Guard>} />
            <Route path="/dispatch/*" element={<Navigate to="/jobs" replace />} />
            <Route path="/attendance" element={<Guard area="attendance"><Attendance /></Guard>} />
            <Route path="/employees" element={<Guard area="employees"><Employees /></Guard>} />
            <Route path="/employees/:id" element={<Guard area="employees"><EmployeeDetail /></Guard>} />
            <Route path="/payroll" element={<Guard area="payroll"><Payroll /></Guard>} />
            <Route path="/payroll/:id" element={<Guard area="payroll"><PayrollDetail /></Guard>} />
            <Route path="/inventory" element={<Guard area="inventory"><Inventory /></Guard>} />
            <Route path="/assets" element={<Guard area="assets"><Assets /></Guard>} />
            <Route path="/finance" element={<Guard area="finance"><Finance /></Guard>} />
            <Route path="/reports" element={<Guard area="reports"><Reports /></Guard>} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/admin" element={<Guard area="admin"><Admin /></Guard>} />
            <Route path="*" element={<Navigate to={homeFor(any)} replace />} />
          </Routes>
          <div className="small muted" style={{ marginTop: 24, textAlign: 'center' }}>TopMop Operations • {CLOUD ? 'Connected to Supabase' : 'Demo data stored in this browser'} • Last sync {fmtStamp(new Date().toISOString())} <Badge tone="teal">{CLOUD ? 'live' : 'demo mode'}</Badge></div>
        </main>
      </div>
      <nav className="bottomnav" aria-label="Quick navigation">
        {bottom.map((n) => <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={n.icon} />{n.label.split(' ')[0]}</NavLink>)}
        <a href="#menu" onClick={(e) => { e.preventDefault(); setOpen(true); }}><Icon name="menu" />More</a>
      </nav>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  const boot = useBoot();
  useEffect(() => {
    const h = (e: Event) => toast((e as CustomEvent<string>).detail, 'err');
    window.addEventListener('topmop:cloud-error', h);
    return () => window.removeEventListener('topmop:cloud-error', h);
  }, []);
  if (boot === 'booting') return <div style={{ display: 'grid', placeItems: 'center', height: '100vh', font: '15px system-ui', color: '#0B2545' }}>Loading TopMop…</div>;
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/portal/*" element={<Portal />} />
        <Route path="/*" element={user ? <Shell /> : <Navigate to="/login" replace />} />
      </Routes>
      {user && <InstallPrompt />}
      <UpdateBanner />
      <Overlays />
    </>
  );
}
