import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import logo from './assets/alex-logo.png';
import { Icon } from './components/ui';
import { todayIso } from './lib/dates';
import { allBlockers, coverageGaps, partRisk } from './lib/logic';
import { useStore } from './lib/store';
import Attendance from './pages/Attendance';
import Dashboard from './pages/Dashboard';
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
  const today = todayIso();
  const blocked = allBlockers(data).length;
  const partsAlert = data.parts.filter((p) => ['late', 'order_now'].includes(partRisk(p, today))).length;
  const links: [string, string, string, number?][] = [
    ['/', 'Operations', 'dash', blocked || undefined],
    ['/executive', 'Executive', 'chart'],
    ['/projects', 'Projects', 'car'],
    ['/schedule', 'Schedule', 'cal'],
    ['/timeline', 'Timeline', 'gantt'],
    ['/mechanics', 'Mechanics', 'wrench'],
    ['/attendance', 'Attendance', 'clock', coverageGaps(data, today).length || undefined],
    ['/parts', 'Parts & sublets', 'box', partsAlert || undefined],
  ];
  return (
    <div className="layout">
      <nav className="side">
        <div className="brand"><img src={logo} alt="Alex Restoration" width={142} height={58} /></div>
        {links.map(([to, label, icon, n]) => (
          <NavLink key={to} to={to} end={to === '/'} className="nav"><Icon name={icon} />{label}{n ? <em>{n}</em> : null}</NavLink>
        ))}
        <div className="foot">
          <div className="row" style={{ gap: 6 }}>
            <button className="sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
            <button className="sm ghost" onClick={() => { if (confirmReset) { dispatch({ type: 'reset' }); setConfirmReset(false); } else setConfirmReset(true); }} onBlur={() => setConfirmReset(false)}>{confirmReset ? 'Click to confirm' : 'Reset demo'}</button>
          </div>
          <div style={{ marginTop: 8 }}>Demo data · saved in this browser</div>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/executive" element={<Executive />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/mechanics" element={<Mechanics />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/parts" element={<Parts />} />
          <Route path="*" element={<p>Not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
