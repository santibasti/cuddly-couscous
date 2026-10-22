import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ProjectCard from '../components/ProjectCard';
import { Bar, Card, Empty, HealthPill, Icon, Seg, carName } from '../components/ui';
import { addDays, fmtDate, todayIso } from '../lib/dates';
import { BAYS, currentPhase, daysOverdue, moneyC, phaseShort, projectCosts, projectHealth, projectProgress, type Health } from '../lib/logic';
import { useStore } from '../lib/store';

type Filter = 'all' | Health;

export default function Projects() {
  const { data, dispatch } = useStore();
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');
  const [view, setView] = useState<'gallery' | 'table'>('gallery');
  const today = todayIso();

  const all = data.projects.map((p) => ({ p, ...projectHealth(p, data, today) }));
  const rows = all.filter(({ p, health }) => {
    const cust = data.customers.find((c) => c.id === p.customerId)?.name ?? '';
    return (filter === 'all' || health === filter) && `${p.code} ${carName(p)} ${cust}`.toLowerCase().includes(q.toLowerCase());
  });
  const n = (h: Health) => all.filter((x) => x.health === h).length;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    if (s('target') <= s('start')) return setErr('Target delivery must be after the start date.');
    setErr('');
    dispatch({
      type: 'addProject',
      project: {
        customerId: s('customer'), title: s('title') || 'Restoration', year: Number(s('year')) || 1970, make: s('make'), model: s('model'),
        color: s('color'), vin: s('vin'), scope: s('scope'), priority: 'normal', bay: s('bay') || 'Unassigned',
        startDate: s('start'), targetDate: s('target'), budget: Number(s('budget')) || 0,
      },
    });
    setAdding(false);
    nav('/projects');
  }

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">{data.projects.length} jobs</div><h1>Projects</h1></div>
        <button className="primary" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : <><Icon name="plus" />New project</>}</button>
      </div>
      {adding && (
        <form className="card form" onSubmit={submit} style={{ marginBottom: 24 }}>
          <h2 className="full serif" style={{ fontSize: 26, fontFamily: 'var(--serif)', fontWeight: 600 }}>New project</h2>
          <label>Customer<select name="customer" required>{data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Job title<input name="title" placeholder="Full restoration" /></label>
          <label>Bay<select name="bay"><option>Unassigned</option>{BAYS.map((b) => <option key={b}>{b}</option>)}</select></label>
          <label>Year<input name="year" type="number" placeholder="1967" required /></label>
          <label>Make<input name="make" placeholder="Ford" required /></label>
          <label>Model<input name="model" placeholder="Mustang Fastback" required /></label>
          <label>Colour<input name="color" placeholder="Highland Green" /></label>
          <label>VIN<input name="vin" placeholder="Optional" /></label>
          <label>Budget (₱)<input name="budget" type="number" min="0" placeholder="2000000" /></label>
          <label>Start date<input name="start" type="date" defaultValue={today} required /></label>
          <label>Target delivery<input name="target" type="date" defaultValue={addDays(today, 90)} required /></label>
          <label className="full">Scope of work<textarea name="scope" /></label>
          {err && <div className="full over small" role="alert">{err}</div>}
          <div className="full"><button className="primary" type="submit">Create project — phases are scheduled automatically</button></div>
        </form>
      )}
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
          <thead><tr><th>Project</th><th>Health</th><th>Phase</th><th style={{ width: 160 }}>Progress</th><th>Blocking / risk</th><th>Target</th><th style={{ width: 130 }}>Budget</th></tr></thead>
          <tbody>
            {rows.map(({ p, health, reasons }) => {
              const pct = projectProgress(p, data.tasks);
              const spent = projectCosts(p, data.tasks, data.parts, data.mechanics).total;
              const cp = currentPhase(p);
              const over = daysOverdue(p, today);
              return (
                <tr key={p.id}>
                  <td><Link to={`/projects/${p.id}`} className="plink"><strong>{p.code} · {data.customers.find((c) => c.id === p.customerId)?.name}</strong><span>{carName(p)} — {p.title}</span></Link></td>
                  <td><HealthPill h={health} /></td>
                  <td>{p.status === 'active' && cp ? phaseShort(cp.key) : <span className="muted">—</span>}</td>
                  <td><div className="row" style={{ flexWrap: 'nowrap' }}><div className="grow"><Bar value={pct} tone={over ? 'red' : undefined} /></div><span className="small num">{pct}%</span></div></td>
                  <td className="small" style={{ maxWidth: 260 }}>{reasons[0] ?? <span className="muted">—</span>}{reasons.length > 1 && <span className="muted"> +{reasons.length - 1}</span>}</td>
                  <td className={`num ${over ? 'over' : ''}`}>{fmtDate(p.targetDate)}</td>
                  <td><div className="small num">{moneyC(spent)} <span className="muted">/ {moneyC(p.budget)}</span></div><Bar thin value={p.budget ? (spent / p.budget) * 100 : 0} tone={spent > p.budget ? 'red' : spent > p.budget * 0.9 ? 'amber' : 'green'} /></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7}><Empty>No projects match.</Empty></td></tr>}
          </tbody>
        </table>
      </Card>
      )}
    </>
  );
}
