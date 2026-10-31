import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import logo from './assets/alex-logo.png';
import { useInstall } from './lib/pwa';
import { Icon } from './components/ui';
import { todayIso } from './lib/dates';
import { allBlockers, coverageGaps, partRisk } from './lib/logic';
import { ROLES, canOpen, useRole } from './lib/role';
import Login from './pages/Login';
import { checkupsDue, upcomingBirthdays } from './lib/crm';
import { useStore } from './lib/store';
import Attendance from './pages/Attendance';
import CustomerDetail from './pages/CustomerDetail';
import Customers from './pages/Customers';
import Insights from './pages/Insights';
import Dashboard from './pages/Dashboard';
import Today from './pages/Today';
import Executive from './pages/Executive';
import Mechanics from './pages/Mechanics';
import Parts from './pages/Parts';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import Schedule from './pages/Schedule';
import Timeline from './pages/Timeline';

export default function App() {
  const { data, dispatch } = useStore();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('acr-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch { /* ignore */ }
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('acr-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  const [confirmReset, setConfirmReset] = useState(false);
  const pwa = useInstall();
  const [update, setUpdate] = useState<(() => void) | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setUpdate(() => (e as CustomEvent<() => void>).detail);
    window.addEventListener('acr-update', on);
    return () => window.removeEventListener('acr-update', on);
  }, []);
  const { role, account, logout } = useRole();
  const { pathname } = useLocation();
  const today = todayIso();
  const blocked = allBlockers(data).length;
  const partsAlert = data.parts.filter((p) => ['late', 'order_now'].includes(partRisk(p, today))).length;
  const links: [string, string, string, number?][] = [
    ['/', 'Operations', 'dash', blocked || undefined],
    ['/today', 'Today', 'sun'],
    ['/executive', 'Executive', 'chart'],
    ['/insights', 'Insights', 'insight'],
    ['/projects', 'Projects', 'car'],
    ['/customers', 'Customers', 'users', upcomingBirthdays(data, today, 7).length + checkupsDue(data, today, 0).length || undefined],
    ['/schedule', 'Schedule', 'cal'],
    ['/timeline', 'Timeline', 'gantt'],
    ['/mechanics', 'Mechanics', 'wrench'],
    ['/attendance', 'Attendance', 'clock', coverageGaps(data, today).length || undefined],
    ['/parts', 'Parts & sublets', 'box', partsAlert || undefined],
  ];
  if (!account) return <Login />;
  const allowed = links.filter(([to]) => canOpen(role, to));
  const open = canOpen(role, pathname);
  return (
    <div className="layout">
      <nav className="side">
        <div className="brand"><img src={logo} alt="Alex Restoration" width={142} height={58} /></div>
        {allowed.map(([to, label, icon, n]) => (
          <NavLink key={to} to={to} end={to === '/'} className="nav"><Icon name={icon} />{label}{n ? <em>{n}</em> : null}</NavLink>
        ))}
        <div className="foot">
          <div className="small" style={{ marginBottom: 8 }}>
            <div className="muted">Signed in as</div>
            <b>{account?.name}</b> <span className="muted">· {ROLES[role].label}</span>
            <div><button className="sm" style={{ marginTop: 6 }} onClick={logout}>Sign out</button></div>
          </div>
          {(pwa.canPrompt || pwa.iosHint) && (
            <button className="sm primary install" onClick={() => (pwa.canPrompt ? pwa.install() : setShowIosHint(!showIosHint))}><Icon name="plus" size={13} />Install app</button>
          )}
          {showIosHint && <div className="small" style={{ margin: '8px 0' }}>On iPhone or iPad: tap the Share button in Safari, then <b>Add to Home Screen</b>.</div>}
          <div className="row" style={{ gap: 6 }}>
            <button className="sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
            <button className="sm ghost" onClick={() => { if (confirmReset) { dispatch({ type: 'reset' }); setConfirmReset(false); } else setConfirmReset(true); }} onBlur={() => setConfirmReset(false)}>{confirmReset ? 'Click to confirm' : 'Reset demo'}</button>
          </div>
          <div className="foot-note" style={{ marginTop: 8 }}>Demo data · saved in this browser</div>
        </div>
      </nav>
      <main className="main">
        {update && (
          <div className="update-bar" role="status">
            <span>A new version is ready.</span>
            <button className="sm primary" onClick={() => update()}>Reload</button>
          </div>
        )}
        {!ROLES[role].edit && <div className="update-bar" role="status"><span>Monitoring view: you can look at everything here, but changes are turned off.</span></div>}
        {!open ? <p>This page is not part of the {ROLES[role].label} view. <Link to="/">Back to operations</Link></p> : (
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/today" element={<Today />} />
          <Route path="/executive" element={<Executive />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/mechanics" element={<Mechanics />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/parts" element={<Parts />} />
          <Route path="*" element={<p>Not found.</p>} />
        </Routes>
        )}
      </main>
    </div>
  );
}
