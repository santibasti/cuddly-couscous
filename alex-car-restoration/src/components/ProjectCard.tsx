import { Link } from 'react-router-dom';
import { fmtDate } from '../lib/dates';
import { currentPhase, daysOverdue, money, phaseShort, projectCosts, projectHealth, projectProgress, taskBlocker } from '../lib/logic';
import { paintHex } from '../lib/paint';
import type { Data, Project } from '../lib/types';
import { Avatar, Bar, CarArt, HealthPill, Icon, Ring, carName } from './ui';

export default function ProjectCard({ p, data, today }: { p: Project; data: Data; today: string }) {
  const { health, reasons } = projectHealth(p, data, today);
  const pct = projectProgress(p, data.tasks);
  const cost = projectCosts(p, data.tasks, data.parts, data.mechanics).total;
  const cur = currentPhase(p);
  const customer = data.customers.find((c) => c.id === p.customerId);
  const doing = data.tasks.find((t) => t.projectId === p.id && t.status === 'in_progress');
  const over = daysOverdue(p, today);
  const curBlocked = cur && data.tasks.some((t) => t.projectId === p.id && t.phaseKey === cur.key && taskBlocker(t, data.parts));
  const style = { '--paint': paintHex(p) } as React.CSSProperties;

  return (
    <Link to={`/projects/${p.id}`} className="pcard rise" style={style}>
      <div className="art">
        <div className="tl"><span className="eyebrow">{p.bay}</span></div>
        <div className="tr"><HealthPill h={health} /></div>
        <CarArt color={paintHex(p)} />
      </div>
      <div className="body">
        <div>
          <div className="eyebrow">{p.code} · {p.year}</div>
          <h3>{p.make} {p.model}</h3>
          <div className="small muted">{p.title} · {customer?.name}</div>
        </div>
        {p.status !== 'quote' && (
          <div className="dots" title={cur ? `Current phase: ${phaseShort(cur.key)}` : undefined}>
            {p.phases.map((ph) => <span key={ph.key} className={`dot ${ph.status === 'done' ? 'done' : ph.key === cur?.key ? (curBlocked ? 'blk' : 'cur') : ''}`} />)}
          </div>
        )}
        {reasons[0] && health !== 'on_track' ? (
          <div className="note-line"><Icon name="warn" size={14} /><span>{reasons[0]}{reasons.length > 1 && <span className="muted"> · +{reasons.length - 1} more</span>}</span></div>
        ) : (
          <div className="small muted">{cur && p.status === 'active' ? `${phaseShort(cur.key)} in progress — nothing holding it up` : 'Awaiting customer approval to begin'}</div>
        )}
        <div className="foot">
          <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
            <Ring value={pct} tone={over ? 'red' : undefined} />
            <div><div className={`small ${over ? 'over' : ''}`} style={{ fontWeight: 500 }}>{over ? `${over}d overdue` : fmtDate(p.targetDate)}</div><div className="small muted">{cur && p.status === 'active' ? phaseShort(cur.key) : 'Target date'}</div></div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 96 }}>
            <div className="small num">{money(cost)} <span className="muted">/ {money(p.budget)}</span></div>
            <Bar thin value={p.budget ? (cost / p.budget) * 100 : 0} tone={cost > p.budget ? 'red' : undefined} />
          </div>
          <Avatar m={data.mechanics.find((m) => m.id === doing?.mechanicId)} size={28} />
        </div>
      </div>
    </Link>
  );
}
