import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, carName, Seg } from '../components/ui';
import { addDays, diffDays, fmtDate, fmtMonth, todayIso } from '../lib/dates';
import { isPartIn, partRisk, phaseLabel } from '../lib/logic';
import { useStore } from '../lib/store';

const RISK_COLOR: Record<string, string> = { late: 'var(--red)', order_now: 'var(--orange)', at_risk: 'var(--amber)', ok: 'var(--blue)' };

export default function Timeline() {
  const { data } = useStore();
  const today = todayIso();
  const [show, setShow] = useState<'open' | 'all'>('open');
  const projects = data.projects.filter((p) => show === 'all' || (p.status !== 'completed' && p.status !== 'delivered'));
  if (!projects.length) return <div className="head"><h1>Timeline</h1></div>;

  const min = projects.reduce((m, p) => (p.startDate < m ? p.startDate : m), today);
  const max = projects.reduce((m, p) => (p.targetDate > m ? p.targetDate : m), today);
  const from = addDays(min, -3);
  const span = diffDays(from, addDays(max, 3));
  const pos = (d: string) => `${(diffDays(from, d) / span) * 100}%`;
  const width = (a: string, b: string) => `${((diffDays(a, b) + 1) / span) * 100}%`;
  const ticks: string[] = [];
  for (let d = from; d <= addDays(max, 3); d = addDays(d, 1)) if (d.endsWith('-01')) ticks.push(d);

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Phases & part deliveries</div><h1>Timeline</h1></div>
        <Seg value={show} onChange={setShow} options={[{ value: 'open', label: 'Open jobs' }, { value: 'all', label: 'Include finished' }]} />
      </div>
      <Card>
        <div className="gantt">
          <div style={{ minWidth: 1000 }}>
            <div className="g-row" style={{ minHeight: 30 }}><div /><div className="g-track" style={{ height: 30 }}>
              {ticks.map((d) => <div key={d}><div className="g-grid" style={{ left: pos(d) }} /><span className="small muted" style={{ position: 'absolute', left: pos(d), top: 6, paddingLeft: 6 }}>{fmtMonth(d)}</span></div>)}
            </div></div>
            {projects.map((p) => (
              <div className="g-row" key={p.id}>
                <div><Link to={`/projects/${p.id}`} className="plink"><strong>{p.code}</strong><span>{carName(p)}</span></Link></div>
                <div className="g-track">
                  {ticks.map((d) => <div key={d} className="g-grid" style={{ left: pos(d) }} />)}
                  {p.phases.map((ph) => <div key={ph.key} className={`g-seg ${ph.status}`} style={{ left: pos(ph.start), width: width(ph.start, ph.end) }} title={`${phaseLabel(ph.key)}: ${fmtDate(ph.start)} – ${fmtDate(ph.end)}`} />)}
                  {data.parts.filter((x) => x.projectId === p.id && !isPartIn(x) && x.eta).map((x) => (
                    <div key={x.id} className="g-diamond" style={{ left: pos(x.eta!), background: RISK_COLOR[partRisk(x, today)] }} title={`${x.name}: ETA ${fmtDate(x.eta!)} (needed ${fmtDate(x.neededBy)})`} />
                  ))}
                  <div className="g-today" style={{ left: pos(today) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="small muted" style={{ marginTop: 12 }}>
          <span style={{ color: 'var(--green)' }}>■</span> done · <span style={{ color: 'var(--accent)' }}>■</span> in progress · <span style={{ color: 'var(--line2)' }}>■</span> upcoming · ◆ incoming part/sublet (red = overdue, amber = lands after needed, blue = on time) · red line = today
        </div>
      </Card>
    </>
  );
}
