import { NavLink, Route, Routes } from 'react-router-dom';
import { Icon } from './components/ui';
import { todayIso } from './lib/dates';
import { allBlockers, partRisk } from './lib/logic';
import { useStore } from './lib/store';
import Dashboard from './pages/Dashboard';
import Mechanics from './pages/Mechanics';
import Parts from './pages/Parts';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import Schedule from './pages/Schedule';
import Timeline from './pages/Timeline';

export default function App() {
  const { data, dispatch } = useStore();
  const today = todayIso();
  const blocked = allBlockers(data).length;
  const partsAlert = data.parts.filter((p) => ['late', 'order_now'].includes(partRisk(p, today))).length;
  const links: [string, string, string, number?][] = [
    ['/', 'Operations', 'dash', blocked || undefined],
    ['/projects', 'Projects', 'car'],
    ['/schedule', 'Schedule', 'cal'],
    ['/timeline', 'Timeline', 'gantt'],
    ['/mechanics', 'Mechanics', 'wrench'],
    ['/parts', 'Parts & sublets', 'box', partsAlert || undefined],
  ];
  return (
    <div className="layout">
      <nav className="side">
        <div className="brand"><div className="logo">A</div><div><b>Alex Car Restoration</b><small>Shop control</small></div></div>
        {links.map(([to, label, icon, n]) => (
          <NavLink key={to} to={to} end={to === '/'} className="nav"><Icon name={icon} />{label}{n ? <em>{n}</em> : null}</NavLink>
        ))}
        <div className="foot">
          Demo data · saved in this browser<br />
          <button className="sm ghost" style={{ marginTop: 8 }} onClick={() => confirm('Reset all data to the demo set?') && dispatch({ type: 'reset' })}>Reset demo data</button>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/mechanics" element={<Mechanics />} />
          <Route path="/parts" element={<Parts />} />
          <Route path="*" element={<p>Not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
