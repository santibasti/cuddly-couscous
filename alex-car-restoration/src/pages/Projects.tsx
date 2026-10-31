import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ProjectCard from '../components/ProjectCard';
import { Bar, Card, Empty, HealthPill, Icon, Seg, ServicePill, carName } from '../components/ui';
import { addDays, fmtDate, todayIso } from '../lib/dates';
import { BAYS, PACKAGES, SERVICES, SERVICE_KEYS, currentPhase, daysOverdue, moneyC, phaseShort, projectCosts, projectHealth, projectProgress, type Health } from '../lib/logic';
import { useStore } from '../lib/store';
import type { ServiceType } from '../lib/types';

type Filter = 'all' | Health;

export default function Projects() {
  const { data, dispatch } = useStore();
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [params] = useSearchParams();
  const [adding, setAdding] = useState(params.get('new') === '1');
  const [custId, setCustId] = useState(params.get('customer') ?? data.customers[0]?.id ?? '');
  const [err, setErr] = useState('');
  const [view, setView] = useState<'gallery' | 'table'>('gallery');
  const [scope_, setScope_] = useState<'open' | 'delivered' | 'all'>('open');
  const [svcFilter, setSvcFilter] = useState<'all' | ServiceType>('all');
  // New-project form: picking a service sets a sensible timeline, and a package fills in the price
  const [svc, setSvc] = useState<ServiceType>('restoration');
  const [pkgIdx, setPkgIdx] = useState(0);
  const [start, setStart] = useState(todayIso());
  const [target, setTarget] = useState(addDays(todayIso(), SERVICES.restoration.typicalDays));
  const [budget, setBudget] = useState('');
  const [scope, setScope] = useState('');
  const isPackage = SERVICES[svc].pricing === 'package';
  const packages = svc === 'detailing' || svc === 'ceramic' ? PACKAGES[svc] : [];
  function applyPackage(service: ServiceType, i: number) {
    const list = service === 'detailing' || service === 'ceramic' ? PACKAGES[service] : [];
    const pkg = list[i];
    setPkgIdx(i);
    if (pkg) { setBudget(String(pkg.price)); setScope(pkg.scope); }
  }
  function chooseService(next: ServiceType) {
    setSvc(next);
    setTarget(addDays(start, SERVICES[next].typicalDays));
    if (SERVICES[next].pricing === 'package') applyPackage(next, 0);
    else { setBudget(''); setScope(''); }
  }
  const today = todayIso();

  const all = data.projects.map((p) => ({ p, ...projectHealth(p, data, today) }));
  const rows = all.filter(({ p, health }) => {
    const cust = data.customers.find((c) => c.id === p.customerId)?.name ?? '';
    return (scope_ === 'all' || (scope_ === 'delivered') === (p.status === 'delivered')) && (filter === 'all' || health === filter) && (svcFilter === 'all' || p.service === svcFilter) && `${p.code} ${carName(p)} ${cust}`.toLowerCase().includes(q.toLowerCase());
  });
  const n = (h: Health) => all.filter((x) => x.health === h).length;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const t = (k: string) => String(f.get(k) ?? '').trim();
    if (target < start) return setErr('Target delivery cannot be before the start date.');
    if (!Number(budget)) return setErr('Enter the price for this job.');
    setErr('');
    const pkg = isPackage ? packages[pkgIdx] : undefined;
    dispatch({
      type: 'addProject',
      project: {
        service: svc, packageName: pkg?.name, customerId: t('customer'), title: pkg?.name ?? (t('title') || SERVICES[svc].label),
        year: Number(t('year')) || 2020, make: t('make'), model: t('model'), color: t('color'), vin: t('vin'), scope,
        priority: 'normal', bay: t('bay') || 'Unassigned', startDate: start, targetDate: target, budget: Number(budget),
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
          <h2 className="full serif" style={{ fontSize: 26, fontFamily: 'var(--serif)', fontWeight: 600 }}>New job</h2>
          <label className="full">Service
            <div className="seg" role="group" aria-label="Service" style={{ alignSelf: 'flex-start' }}>
              {SERVICE_KEYS.map((k) => <button type="button" key={k} className={svc === k ? 'on' : ''} onClick={() => chooseService(k)}>{SERVICES[k].label}</button>)}
            </div>
            <span className="small muted" style={{ fontWeight: 400 }}>{SERVICES[svc].hint}. {isPackage ? 'Sold from a price list.' : 'Quoted for each car.'}</span>
          </label>
          <label>Customer<select name="customer" required value={custId} onChange={(e) => setCustId(e.target.value)}>{data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          {isPackage ? (
            <label>Package<select value={pkgIdx} onChange={(e) => applyPackage(svc, Number(e.target.value))}>{packages.map((p, i) => <option key={p.name} value={i}>{p.name} · ₱{p.price.toLocaleString('en-PH')}</option>)}</select></label>
          ) : (
            <label>Job title<input name="title" placeholder={svc === 'paint' ? 'Full respray' : 'Full restoration'} /></label>
          )}
          <label>Bay<select name="bay"><option>Unassigned</option>{BAYS.map((b) => <option key={b}>{b}</option>)}</select></label>
          <label>Year<input name="year" type="number" placeholder="2019" required /></label>
          <label>Make<input name="make" placeholder="Toyota" required /></label>
          <label>Model<input name="model" placeholder="Fortuner" required /></label>
          <label>Colour<input name="color" placeholder="Pearl White" /></label>
          <label>VIN or plate<input name="vin" placeholder="Optional" /></label>
          <label>Price (₱)<input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="150000" /></label>
          <label>Start date<input type="date" value={start} onChange={(e) => { setStart(e.target.value); setTarget(addDays(e.target.value, SERVICES[svc].typicalDays)); }} required /></label>
          <label>Target delivery<input type="date" value={target} onChange={(e) => setTarget(e.target.value)} required /></label>
          <label className="full">Scope of work<textarea value={scope} onChange={(e) => setScope(e.target.value)} /></label>
          {err && <div className="full over small" role="alert">{err}</div>}
          <div className="full"><button className="primary" type="submit">Create job — the {SERVICES[svc].label.toLowerCase()} steps are scheduled automatically</button></div>
        </form>
      )}
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
              const spent = projectCosts(p, data.tasks, data.parts, data.mechanics).total;
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
