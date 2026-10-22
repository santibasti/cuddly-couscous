import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Mechanics from './pages/Mechanics';
import Parts from './pages/Parts';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import Schedule from './pages/Schedule';
import Timeline from './pages/Timeline';
import { useStore } from './lib/store';

const links = [
  ['/', 'Dashboard'],
  ['/projects', 'Projects'],
  ['/schedule', 'Schedule'],
  ['/timeline', 'Timeline'],
  ['/mechanics', 'Mechanics'],
  ['/parts', 'Parts & orders'],
] as const;

export default function App() {
  const { dispatch } = useStore();
  return (
    <div className="layout">
      <nav className="side">
        <div className="brand">Alex <span>Car Restoration</span></div>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
        ))}
        <div style={{ padding: 12, marginTop: 20 }}>
          <button className="sm" onClick={() => confirm('Reset all data to the demo set?') && dispatch({ type: 'reset' })}>
            Reset demo data
          </button>
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
