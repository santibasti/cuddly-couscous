import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Progress, carName, statusLabel, statusTone } from '../components/ui';
import { addDays, fmtDate, todayIso } from '../lib/dates';
import { daysOverdue, money, projectProgress } from '../lib/logic';
import { useStore } from '../lib/store';
import type { ProjectStatus } from '../lib/types';

const FILTERS: (ProjectStatus | 'all')[] = ['all', 'quote', 'active', 'on_hold', 'completed', 'delivered'];

export default function Projects() {
  const { data, dispatch } = useStore();
  const nav = useNavigate();
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const today = todayIso();

  const rows = data.projects.filter((p) => {
    const cust = data.customers.find((c) => c.id === p.customerId)?.name ?? '';
    return (filter === 'all' || p.status === filter) && `${p.code} ${carName(p)} ${cust}`.toLowerCase().includes(q.toLowerCase());
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    const start = s('start');
    const target = s('target');
    if (target <= start) return alert('Target date must be after the start date.');
    const customerId = s('customer');
    dispatch({
      type: 'addProject',
      project: {
        customerId, title: s('title') || 'Restoration', year: Number(s('year')) || 1970, make: s('make'), model: s('model'),
        color: s('color'), vin: s('vin'), scope: s('scope'), priority: 'normal', bay: s('bay') || 'Unassigned',
        startDate: start, targetDate: target, budget: Number(s('budget')) || 0,
      },
    });
    setAdding(false);
    nav('/projects');
  }

  return (
    <>
      <div className="head">
        <h1>Projects</h1>
        <button className="primary" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ New project'}</button>
      </div>
      {adding && (
        <form className="card form" onSubmit={submit} style={{ marginBottom: 14 }}>
          <label>Customer<select name="customer" required>{data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Job title<input name="title" placeholder="Full restoration" /></label>
          <label>Year<input name="year" type="number" required /></label>
          <label>Make<input name="make" required /></label>
          <label>Model<input name="model" required /></label>
          <label>Colour<input name="color" /></label>
          <label>VIN<input name="vin" /></label>
          <label>Bay<input name="bay" placeholder="Bay 1" /></label>
          <label>Start date<input name="start" type="date" defaultValue={today} required /></label>
          <label>Target delivery<input name="target" type="date" defaultValue={addDays(today, 90)} required /></label>
          <label>Budget ($)<input name="budget" type="number" min="0" /></label>
          <label className="full">Scope of work<textarea name="scope" /></label>
          <div className="full"><button className="primary" type="submit">Create project (phases are scheduled automatically)</button></div>
        </form>
      )}
      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="Search code, vehicle, customer…" value={q} onChange={(e) => setQ(e.target.value)} />
        {FILTERS.map((f) => <button key={f} className={`sm ${filter === f ? 'primary' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : statusLabel(f)}</button>)}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Project</th><th>Customer</th><th>Status</th><th style={{ width: '20%' }}>Progress</th><th>Target</th><th>Budget</th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const pct = projectProgress(p, data.tasks);
              return (
                <tr key={p.id}>
                  <td><Link to={`/projects/${p.id}`}><strong>{p.code}</strong> · {carName(p)}</Link><div className="small muted">{p.title}</div></td>
                  <td>{data.customers.find((c) => c.id === p.customerId)?.name}</td>
                  <td><Badge tone={statusTone[p.status]}>{statusLabel(p.status)}</Badge></td>
                  <td><Progress value={pct} tone={daysOverdue(p, today) ? 'bad' : undefined} /><span className="small muted">{pct}%</span></td>
                  <td>{fmtDate(p.targetDate)}</td>
                  <td>{money(p.budget)}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="muted">No projects match.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
