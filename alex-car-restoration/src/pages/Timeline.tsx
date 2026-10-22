import { useState } from 'react';
import { Link } from 'react-router-dom';
import { carName } from '../components/ui';
import { addDays, diffDays, fmtDate, fmtMonth, todayIso } from '../lib/dates';
import { phaseLabel } from '../lib/logic';
import { useStore } from '../lib/store';

export default function Timeline() {
  const { data } = useStore();
  const today = todayIso();
  const [showDone, setShowDone] = useState(false);
  const projects = data.projects.filter((p) => showDone || (p.status !== 'completed' && p.status !== 'delivered'));
  if (!projects.length) return <><div className="head"><h1>Timeline</h1></div><p className="muted">No projects to show.</p></>;

  const min = projects.reduce((m, p) => (p.startDate < m ? p.startDate : m), today);
  const max = projects.reduce((m, p) => (p.targetDate > m ? p.targetDate : m), today);
  const from = addDays(min, -3);
  const span = diffDays(from, addDays(max, 3));
  const pos = (d: string) => `${(diffDays(from, d) / span) * 100}%`;
  const width = (a: string, b: string) => `${((diffDays(a, b) + 1) / span) * 100}%`;
  const months: string[] = [];
  for (let d = from; d <= addDays(max, 3); d = addDays(d, 28)) if (!months.includes(fmtMonth(d))) months.push(fmtMonth(d));

  return (
    <>
      <div className="head">
        <h1>Timeline</h1>
        <label className="row small"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show finished</label>
      </div>
      <div className="card gantt">
        <div style={{ minWidth: 900 }}>
          <div className="g-row"><div className="muted small">{months.join(' → ')}</div><div className="small muted">{fmtDate(from)} – {fmtDate(max)}</div></div>
          {projects.map((p) => (
            <div key={p.id}>
              <div className="g-row">
                <div><Link to={`/projects/${p.id}`}><strong>{p.code}</strong></Link><div className="small muted">{carName(p)}</div></div>
                <div className="g-track">
                  {p.phases.map((ph) => (
                    <div key={ph.key} className={`g-seg ${ph.status}`} style={{ left: pos(ph.start), width: width(ph.start, ph.end) }}
                      title={`${phaseLabel(ph.key)}: ${fmtDate(ph.start)} – ${fmtDate(ph.end)} (${ph.status.replace('_', ' ')})`} />
                  ))}
                  <div className="g-today" style={{ left: pos(today) }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>Green = done · Blue = in progress · Grey = upcoming · Red line = today. Hover a bar for dates.</div>
      </div>
    </>
  );
}
