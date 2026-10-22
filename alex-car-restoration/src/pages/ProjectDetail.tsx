import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, Badge, Progress, carName, statusLabel, statusTone } from '../components/ui';
import { fmtDate, todayIso } from '../lib/dates';
import { PHASES, daysOverdue, money, phaseLabel, phasePercent, projectCosts, projectProgress } from '../lib/logic';
import { useStore } from '../lib/store';
import type { PartStatus, PhaseKey, ProjectStatus, TaskStatus } from '../lib/types';

const PART_FLOW: PartStatus[] = ['needed', 'ordered', 'received', 'installed'];
const TASK_FLOW: TaskStatus[] = ['todo', 'in_progress', 'done'];

export default function ProjectDetail() {
  const { id } = useParams();
  const { data, dispatch } = useStore();
  const [note, setNote] = useState('');
  const [notePhase, setNotePhase] = useState<PhaseKey | ''>('');
  const today = todayIso();
  const p = data.projects.find((x) => x.id === id);
  if (!p) return <p>Project not found. <Link to="/projects">Back to projects</Link></p>;

  const customer = data.customers.find((c) => c.id === p.customerId);
  const tasks = data.tasks.filter((t) => t.projectId === p.id).sort((a, b) => a.date.localeCompare(b.date));
  const parts = data.parts.filter((x) => x.projectId === p.id);
  const updates = data.updates.filter((u) => u.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const pct = projectProgress(p, data.tasks);
  const costs = projectCosts(p, data.tasks, data.parts, data.mechanics);
  const over = daysOverdue(p, today);
  const team = data.mechanics.filter((m) => m.active);

  function addTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    dispatch({
      type: 'addTask',
      task: {
        projectId: p!.id, title: String(f.get('title')), phaseKey: f.get('phase') as PhaseKey,
        mechanicId: String(f.get('mechanic')) || undefined, date: String(f.get('date')), estHours: Number(f.get('hours')) || 1,
      },
    });
    e.currentTarget.reset();
  }

  function addPart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    dispatch({ type: 'addPart', part: { projectId: p!.id, name: String(f.get('name')), supplier: String(f.get('supplier')), cost: Number(f.get('cost')) || 0, status: 'needed' } });
    e.currentTarget.reset();
  }

  return (
    <>
      <div className="head">
        <div>
          <Link to="/projects" className="small">← Projects</Link>
          <h1>{p.code} · {carName(p)}</h1>
          <div className="muted">{p.title} · {customer?.name} · {customer?.phone} · {p.bay}</div>
        </div>
        <div className="row">
          <Badge tone={statusTone[p.priority]}>{p.priority} priority</Badge>
          <select value={p.status} onChange={(e) => dispatch({ type: 'setProjectStatus', id: p.id, status: e.target.value as ProjectStatus })}>
            {(['quote', 'active', 'on_hold', 'completed', 'delivered'] as ProjectStatus[]).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <strong>{pct}% complete</strong>
          <span className={over ? 'over' : 'muted'}>{over ? `${over} days past target` : `Target ${fmtDate(p.targetDate)}`} · started {fmtDate(p.startDate)}</span>
        </div>
        <Progress value={pct} tone={over ? 'bad' : undefined} />
        <div className="phases">
          {p.phases.map((ph) => (
            <div key={ph.key} className={`phase ${ph.status} ${ph.status !== 'done' && p.status === 'active' && ph.end < today ? 'late' : ''}`}>
              <strong>{phaseLabel(ph.key)}</strong>
              <div>{fmtDate(ph.start)}–{fmtDate(ph.end)}</div>
              <div>{phasePercent(p, ph.key, data.tasks)}%</div>
              <select value={ph.status} style={{ width: '100%', fontSize: 11 }} onChange={(e) => dispatch({ type: 'setPhaseStatus', projectId: p.id, key: ph.key, status: e.target.value as 'todo' | 'in_progress' | 'done' })}>
                {TASK_FLOW.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="small muted">{p.scope}</div>
      </div>

      <div className="grid g4" style={{ margin: '14px 0' }}>
        <div className="card"><div className="stat-label">Budget</div><div className="stat-value">{money(p.budget)}</div></div>
        <div className="card"><div className="stat-label">Spent</div><div className={`stat-value ${costs.total > p.budget ? 'over' : ''}`}>{money(costs.total)}</div><div className="small muted">Labor {money(costs.labor)} · Parts {money(costs.parts)}</div></div>
        <div className="card"><div className="stat-label">Hours</div><div className="stat-value">{tasks.reduce((s, t) => s + t.actualHours, 0)}h</div><div className="small muted">of {tasks.reduce((s, t) => s + t.estHours, 0)}h estimated</div></div>
        <div className="card"><div className="stat-label">Tasks done</div><div className="stat-value">{tasks.filter((t) => t.status === 'done').length}/{tasks.length}</div></div>
      </div>

      <div className="grid g2">
        <div className="stack">
          <div className="card">
            <h2>Tasks & mechanic assignment</h2>
            <table>
              <thead><tr><th>Task</th><th>Mechanic</th><th>Date</th><th>Hrs</th><th>Status</th><th /></tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}<div className="small muted">{phaseLabel(t.phaseKey)}</div></td>
                    <td className="row"><Avatar m={data.mechanics.find((m) => m.id === t.mechanicId)} />
                      <select value={t.mechanicId ?? ''} onChange={(e) => dispatch({ type: 'updateTask', id: t.id, patch: { mechanicId: e.target.value || undefined } })}>
                        <option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select></td>
                    <td><input type="date" value={t.date} onChange={(e) => e.target.value && dispatch({ type: 'updateTask', id: t.id, patch: { date: e.target.value } })} /></td>
                    <td><input type="number" min="0" step="0.5" style={{ width: 60 }} value={t.status === 'done' ? t.actualHours : t.estHours}
                      onChange={(e) => dispatch({ type: 'updateTask', id: t.id, patch: t.status === 'done' ? { actualHours: Number(e.target.value) } : { estHours: Number(e.target.value) } })} /></td>
                    <td><select value={t.status} onChange={(e) => dispatch({ type: 'updateTask', id: t.id, patch: { status: e.target.value as TaskStatus } })}>
                      {TASK_FLOW.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></td>
                    <td><button className="sm" title="Delete task" onClick={() => dispatch({ type: 'deleteTask', id: t.id })}>✕</button></td>
                  </tr>
                ))}
                {!tasks.length && <tr><td colSpan={6} className="muted">No tasks yet.</td></tr>}
              </tbody>
            </table>
            <form className="row" onSubmit={addTask} style={{ marginTop: 10 }}>
              <input name="title" placeholder="New task" required />
              <select name="phase">{PHASES.map((ph) => <option key={ph.key} value={ph.key}>{ph.label}</option>)}</select>
              <select name="mechanic"><option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              <input name="date" type="date" defaultValue={today} required />
              <input name="hours" type="number" min="0.5" step="0.5" defaultValue={4} style={{ width: 60 }} />
              <button className="primary" type="submit">Add</button>
            </form>
          </div>

          <div className="card">
            <h2>Parts & materials</h2>
            <table>
              <thead><tr><th>Item</th><th>Supplier</th><th>Cost</th><th>Status</th></tr></thead>
              <tbody>
                {parts.map((x) => (
                  <tr key={x.id}><td>{x.name}</td><td>{x.supplier}</td><td>{money(x.cost)}</td>
                    <td><select value={x.status} onChange={(e) => dispatch({ type: 'setPartStatus', id: x.id, status: e.target.value as PartStatus })}>
                      {PART_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}</select></td></tr>
                ))}
              </tbody>
            </table>
            <form className="row" onSubmit={addPart} style={{ marginTop: 10 }}>
              <input name="name" placeholder="Part / material" required /><input name="supplier" placeholder="Supplier" />
              <input name="cost" type="number" min="0" placeholder="Cost" style={{ width: 90 }} /><button className="primary" type="submit">Add</button>
            </form>
          </div>
        </div>

        <div className="card">
          <h2>Progress log</h2>
          <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) { dispatch({ type: 'addUpdate', projectId: p.id, text: note.trim(), phaseKey: notePhase || undefined, author: 'Alex' }); setNote(''); } }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Post an update for this build…" />
            <div className="row" style={{ marginTop: 6 }}>
              <select value={notePhase} onChange={(e) => setNotePhase(e.target.value as PhaseKey | '')}>
                <option value="">General</option>{PHASES.map((ph) => <option key={ph.key} value={ph.key}>{ph.label}</option>)}
              </select>
              <button className="primary" type="submit">Post</button>
            </div>
          </form>
          <div style={{ marginTop: 14 }}>
            {updates.map((u) => (
              <div key={u.id} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
                <div className="small muted">{fmtDate(u.date)} · {u.author}{u.phaseKey && ` · ${phaseLabel(u.phaseKey)}`}</div>
                <div>{u.text}</div>
              </div>
            ))}
            {!updates.length && <p className="muted">No updates yet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
