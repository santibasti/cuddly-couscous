import { Link } from 'react-router-dom';
import { fmtDate } from '../lib/dates';
import { currentPhase, daysOverdue, jobCrew, moneyC, phaseShort, projectCosts, projectHealth, projectProgress, taskBlocker } from '../lib/logic';
import { paintHex } from '../lib/paint';
import type { Data, Project } from '../lib/types';
import Journey from './Journey';
import { Avatar, Bar, CarArt, HealthPill, Icon, Ring, ServicePill } from './ui';

export default function ProjectCard({ p, data, today }: { p: Project; data: Data; today: string }) {
  const { health, reasons } = projectHealth(p, data, today);
  const pct = projectProgress(p, data.tasks);
  const cost = projectCosts(p, data.tasks, data.parts, data.mechanics).total;
  const cur = currentPhase(p);
  const customer = data.customers.find((c) => c.id === p.customerId);
  const doing = data.tasks.find((t) => t.projectId === p.id && t.status === 'in_progress');
  const over = daysOverdue(p, today);
  const crew = jobCrew(p.id, data);
  const curBlocked = cur && data.tasks.some((t) => t.projectId === p.id && t.phaseKey === cur.key && taskBlocker(t, data.parts));
  const style = { '--paint': paintHex(p) } as React.CSSProperties;

  return (
    <Link to={`/projects/${p.id}`} className="pcard rise" style={style}>
      <div className="art">
        <div className="tl"><span className="eyebrow">{p.bay}</span></div>
        <div className="tr"><HealthPill h={health} /></div>
        {p.photo ? <img className="photo" src={p.photo} alt={`${p.year} ${p.make} ${p.model}`} /> : <CarArt color={paintHex(p)} car={p} />}
      </div>
      <div className="body">
        <div>
          <div className="row" style={{ gap: 8 }}><span className="eyebrow">{p.code} · {p.year}</span><ServicePill s={p.service} /></div>
          <h3>{p.make} {p.model}</h3>
          <div className="small muted">{p.packageName ?? p.title} · {customer?.name}</div>
        </div>
        <Journey compact phases={p.phases} tone={health === 'late' ? 'bad' : health === 'blocked' || health === 'at_risk' ? 'warn' : health === 'quote' || health === 'hold' ? 'hold' : 'ok'} />
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
            <div className="small num">{moneyC(cost)} <span className="muted">/ {moneyC(p.budget)}</span></div>
            <Bar thin value={p.budget ? (cost / p.budget) * 100 : 0} tone={cost > p.budget ? 'red' : undefined} />
          </div>
        </div>
        {crew.length > 0 && (
          <div className="crew-list" aria-label="Crew">
            {crew.map((m) => <span key={m.id} className="crew-chip" title={`${m.name}${m.id === doing?.mechanicId ? ' · working on it now' : ''}`}><Avatar m={m} size={24} />{m.name.split(' ')[0]}</span>)}
          </div>
        )}
      </div>
    </Link>
  );
}
