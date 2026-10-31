import { useState } from 'react';
import { Link } from 'react-router-dom';
import ProjectCard from '../components/ProjectCard';
import { Bar, Card, Empty, HealthPill, Icon, Seg, ServicePill, carName } from '../components/ui';
import { fmtDate, todayIso } from '../lib/dates';
import { SERVICES, SERVICE_KEYS, currentPhase, daysOverdue, moneyC, phaseShort, projectCosts, projectHealth, projectProgress, type Health } from '../lib/logic';
import { useStore } from '../lib/store';
import type { ServiceType } from '../lib/types';

type Filter = 'all' | Health;

export default function Projects() {
  const { data } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'gallery' | 'table'>('gallery');
  const [scope_, setScope_] = useState<'open' | 'delivered' | 'all'>('open');
  const [svcFilter, setSvcFilter] = useState<'all' | ServiceType>('all');
  const today = todayIso();

  const all = data.projects.map((p) => ({ p, ...projectHealth(p, data, today) }));
  const rows = all.filter(({ p, health }) => {
    const cust = data.customers.find((c) => c.id === p.customerId)?.name ?? '';
    return (scope_ === 'all' || (scope_ === 'delivered') === (p.status === 'delivered')) && (filter === 'all' || health === filter) && (svcFilter === 'all' || p.service === svcFilter) && `${p.code} ${carName(p)} ${cust}`.toLowerCase().includes(q.toLowerCase());
  });
  const n = (h: Health) => all.filter((x) => x.health === h).length;

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">{data.projects.length} jobs</div><h1>Projects</h1></div>
        <Link className="btn primary" to="/intake"><Icon name="plus" />New job</Link>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Seg value={scope_} onChange={setScope_} options={[{ value: 'open', label: 'In the shop', count: data.projects.filter((p) => p.status !== 'delivered').length }, { value: 'delivered', label: 'Released', count: data.projects.filter((p) => p.status === 'delivered').length }, { value: 'all', label: 'All' }]} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <Seg<'all' | ServiceType> value={svcFilter} onChange={setSvcFilter} options={[{ value: 'all', label: 'All services', count: data.projects.length }, ...SERVICE_KEYS.map((k) => ({ value: k as 'all' | ServiceType, label: SERVICES[k].label, count: data.projects.filter((p) => p.service === k).length }))]} />
      </div>
      <div className="row spread" style={{ marginBottom: 14 }}>
        <Seg<Filter> value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: all.length }, { value: 'on_track', label: 'On track', count: n('on_track') },
          { value: 'at_risk', label: 'At risk', count: n('at_risk') }, { value: 'blocked', label: 'Blocked', count: n('blocked') },
          { value: 'late', label: 'Late', count: n('late') }, { value: 'quote', label: 'Quotes', count: n('quote') },
        ]} />
        <div className="row">
          <input placeholder="Search code, vehicle, customer…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
          <Seg value={view} onChange={setView} options={[{ value: 'gallery', label: 'Gallery' }, { value: 'table', label: 'Table' }]} />
        </div>
      </div>
      {view === 'gallery' ? (
        rows.length ? <div className="cards">{rows.map(({ p }) => <ProjectCard key={p.id} p={p} data={data} today={today} />)}</div> : <Empty>No projects match.</Empty>
      ) : (
      <Card flush>
        <table>
          <thead><tr><th>Project</th><th>Service</th><th>Health</th><th>Phase</th><th style={{ width: 160 }}>Progress</th><th>Blocking / risk</th><th>Target</th><th style={{ width: 130 }}>Budget</th></tr></thead>
          <tbody>
            {rows.map(({ p, health, reasons }) => {
              const pct = projectProgress(p, data.tasks);
              const spent = projectCosts(p, data.tasks).total;
              const cp = currentPhase(p);
              const over = daysOverdue(p, today);
              return (
                <tr key={p.id}>
                  <td><Link to={`/projects/${p.id}`} className="plink"><strong>{p.code} · {data.customers.find((c) => c.id === p.customerId)?.name}</strong><span>{carName(p)} — {p.packageName ?? p.title}</span></Link></td>
                  <td><ServicePill s={p.service} /></td>
                  <td><HealthPill h={health} /></td>
                  <td>{p.status === 'active' && cp ? phaseShort(cp.key) : <span className="muted">—</span>}</td>
                  <td><div className="row" style={{ flexWrap: 'nowrap' }}><div className="grow"><Bar value={pct} tone={over ? 'red' : undefined} /></div><span className="small num">{pct}%</span></div></td>
                  <td className="small" style={{ maxWidth: 260 }}>{reasons[0] ?? <span className="muted">—</span>}{reasons.length > 1 && <span className="muted"> +{reasons.length - 1}</span>}</td>
                  <td className={`num ${over ? 'over' : ''}`}>{fmtDate(p.targetDate)}</td>
                  <td><div className="small num">{moneyC(spent)} <span className="muted">/ {moneyC(p.budget)}</span></div><Bar thin value={p.budget ? (spent / p.budget) * 100 : 0} tone={spent > p.budget ? 'red' : spent > p.budget * 0.9 ? 'amber' : 'green'} /></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8}><Empty>No projects match.</Empty></td></tr>}
          </tbody>
        </table>
      </Card>
      )}
    </>
  );
}
