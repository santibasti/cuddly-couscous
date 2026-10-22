import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, CarArt, Card, HealthPill, Icon, PartStatusPill, Pill, RiskPill, Seg, statusLabel } from '../components/ui';
import { paintHex } from '../lib/paint';
import { diffDays, fmtDate, todayIso } from '../lib/dates';
import { BAYS, PART_FLOW, PHASES, currentPhase, daysOverdue, isPartIn, money, moneyC, partRisk, partStatusLabel, phaseLabel, phasePercent, projectCosts, projectHealth, projectProgress, taskBlocker } from '../lib/logic';
import { useStore } from '../lib/store';
import type { BlockReason, PartKind, PartStatus, PhaseKey, ProjectStatus, TaskStatus } from '../lib/types';

type Tab = 'work' | 'parts' | 'log';

export default function ProjectDetail() {
  const { id } = useParams();
  const { data, dispatch } = useStore();
  const [tab, setTab] = useState<Tab>('work');
  const [note, setNote] = useState('');
  const [notePhase, setNotePhase] = useState<PhaseKey | ''>('');
  const [selKey, setSelKey] = useState<PhaseKey | null>(null);
  const today = todayIso();
  const p = data.projects.find((x) => x.id === id);
  if (!p) return <p>Project not found. <Link to="/projects">Back to projects</Link></p>;

  const customer = data.customers.find((c) => c.id === p.customerId);
  const tasks = data.tasks.filter((t) => t.projectId === p.id).sort((a, b) => a.date.localeCompare(b.date));
  const parts = data.parts.filter((x) => x.projectId === p.id).sort((a, b) => a.neededBy.localeCompare(b.neededBy));
  const updates = data.updates.filter((u) => u.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const pct = projectProgress(p, data.tasks);
  const costs = projectCosts(p, data.tasks, data.parts, data.mechanics);
  const over = daysOverdue(p, today);
  const { health, reasons } = projectHealth(p, data, today);
  const team = data.mechanics.filter((m) => m.active);
  const sel = p.phases.find((x) => x.key === selKey) ?? currentPhase(p) ?? p.phases[0];
  const blocked = tasks.map((t) => ({ t, b: taskBlocker(t, data.parts) })).filter((x) => x.b);
  const patch = (id: string, pt: Record<string, unknown>) => dispatch({ type: 'updateTask', id, patch: pt });

  function addTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    dispatch({ type: 'addTask', task: { projectId: p!.id, title: String(f.get('title')), phaseKey: f.get('phase') as PhaseKey, mechanicId: String(f.get('mechanic')) || undefined, date: String(f.get('date')), estHours: Number(f.get('hours')) || 1, partId: String(f.get('part')) || undefined } });
    e.currentTarget.reset();
  }
  function addPart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    dispatch({ type: 'addPart', part: { projectId: p!.id, name: String(f.get('name')), kind: f.get('kind') as PartKind, supplier: String(f.get('supplier')), cost: Number(f.get('cost')) || 0, status: 'needed', neededBy: String(f.get('needed')), po: String(f.get('po')) || undefined } });
    e.currentTarget.reset();
  }

  return (
    <>
      <Link to="/projects" className="crumb">← Projects</Link>
      <section className="phero rise" style={{ '--paint': paintHex(p) } as React.CSSProperties}>
        <div className="art"><CarArt color={paintHex(p)} /></div>
        <div className="txt">
          <div className="row" style={{ marginBottom: 14 }}><span className="eyebrow">{p.code} · {p.year} · {p.bay}</span><HealthPill h={health} /></div>
          <h1>{p.make} <em>{p.model}</em></h1>
          <p className="muted" style={{ margin: '12px 0 0' }}>{p.title} · {p.color} · {customer?.name} ({customer?.phone})</p>
          <div className="row" style={{ marginTop: 20 }}>
            <select value={p.status} onChange={(e) => dispatch({ type: 'setProjectStatus', id: p.id, status: e.target.value as ProjectStatus })}>
              {(['quote', 'active', 'on_hold', 'completed', 'delivered'] as ProjectStatus[]).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <select value={p.bay} onChange={(e) => dispatch({ type: 'updateProject', id: p.id, patch: { bay: e.target.value } })}><option>Unassigned</option>{BAYS.map((b) => <option key={b}>{b}</option>)}</select>
          </div>
        </div>
        <div className="stats">
          <div><div className="eyebrow">Progress</div><div className="sv"><span>{pct}%</span></div><div className={`small ${over ? 'over' : 'muted'}`}>{over ? `${over}d past target` : `Target ${fmtDate(p.targetDate)}`}</div></div>
          <div><div className="eyebrow">Spent</div><div className={`sv ${costs.total > p.budget ? 'red' : ''}`}><span>{moneyC(costs.total)}</span></div><div className="small muted">of {moneyC(p.budget)} budget</div></div>
          <div><div className="eyebrow">Hours</div><div className="sv"><span>{tasks.reduce((s, t) => s + t.actualHours, 0)}h</span></div><div className="small muted">of {tasks.reduce((s, t) => s + t.estHours, 0)}h planned</div></div>
          <div><div className="eyebrow">Parts in shop</div><div className="sv"><span>{parts.filter(isPartIn).length}/{parts.length}</span></div><div className="small muted">{blocked.length} task{blocked.length === 1 ? '' : 's'} blocked</div></div>
        </div>
      </section>

      {reasons.length > 0 && health !== 'quote' && health !== 'hold' && (
        <div className="callout">
          <span className="ico orange"><Icon name="warn" /></span>
          <div><strong>{health === 'late' ? 'Running late' : health === 'blocked' ? 'Work is blocked' : 'Watch list'}</strong>
            <ul className="small">{reasons.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}</ul></div>
        </div>
      )}

      <Card title="Phases" action={<span className="muted small">Select a phase to update it</span>}>
        <div className="stepper">
          {p.phases.map((ph, i) => {
            const late = ph.status !== 'done' && p.status === 'active' && ph.end < today;
            return (
              <button key={ph.key} className={`stp ${ph.status} ${late ? 'late' : ''} ${sel.key === ph.key ? 'sel' : ''}`} onClick={() => setSelKey(ph.key)}>
                <span className="n">{ph.status === 'done' ? <Icon name="check" size={14} /> : i + 1}</span>
                <span className="l">{PHASES.find((x) => x.key === ph.key)!.short}</span>
                <span className="d">{fmtDate(ph.start)}</span>
              </button>
            );
          })}
        </div>
        <div className="row spread" style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <div>
            <div className="serif" style={{ fontSize: 24 }}>{phaseLabel(sel.key)}</div>
            <div className="small muted">{fmtDate(sel.start)} – {fmtDate(sel.end)} · {phasePercent(p, sel.key, data.tasks)}% of tasks done · {tasks.filter((t) => t.phaseKey === sel.key).length} tasks</div>
          </div>
          <div className="row">
            <Seg value={sel.status} onChange={(v) => dispatch({ type: 'setPhaseStatus', projectId: p.id, key: sel.key, status: v })}
              options={[{ value: 'todo', label: 'Not started' }, { value: 'in_progress', label: 'In progress' }, { value: 'done', label: 'Signed off' }]} />
          </div>
        </div>
        <p className="small muted" style={{ margin: '12px 0 0' }}>{p.scope}</p>
      </Card>

      <div className="tabs">
        {([['work', `Work (${tasks.length})`], ['parts', `Parts & sublets (${parts.length})`], ['log', `Progress log (${updates.length})`]] as [Tab, string][]).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'work' && (
        <Card flush>
          <table>
            <thead><tr><th>Task</th><th>Mechanic</th><th>Date</th><th>Hrs</th><th>Waiting on</th><th>Status</th><th /></tr></thead>
            <tbody>
              {tasks.map((t) => {
                const b = taskBlocker(t, data.parts);
                return (
                  <tr key={t.id}>
                    <td><div style={{ opacity: t.status === 'done' ? 0.55 : 1 }}>{t.title}</div><div className="small muted">{phaseLabel(t.phaseKey)}</div></td>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}><Avatar m={data.mechanics.find((m) => m.id === t.mechanicId)} size={22} />
                      <select className="inline" value={t.mechanicId ?? ''} onChange={(e) => patch(t.id, { mechanicId: e.target.value || undefined })}><option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div></td>
                    <td><input type="date" className="inline" value={t.date} onChange={(e) => e.target.value && patch(t.id, { date: e.target.value })} /></td>
                    <td><input type="number" className="inline" min="0" step="0.5" style={{ width: 58 }} value={t.status === 'done' ? t.actualHours : t.estHours} onChange={(e) => patch(t.id, t.status === 'done' ? { actualHours: Number(e.target.value) } : { estHours: Number(e.target.value) })} /></td>
                    <td style={{ maxWidth: 210 }}>
                      <select className="inline" value={t.partId ?? ''} onChange={(e) => patch(t.id, { partId: e.target.value || undefined })}><option value="">Nothing</option>{parts.filter((x) => !isPartIn(x) || x.id === t.partId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                      {b && <div className="small" style={{ marginTop: 3 }}><Pill tone="orange">{b.eta ? `ETA ${fmtDate(b.eta)}` : 'Blocked'}</Pill></div>}
                    </td>
                    <td>
                      <select className="inline" value={t.status} onChange={(e) => patch(t.id, { status: e.target.value as TaskStatus })}>
                        <option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option>
                      </select>
                      {t.status === 'blocked' && !t.partId && (
                        <div className="row" style={{ marginTop: 4, flexWrap: 'nowrap' }}>
                          <select className="inline" value={t.blockReason ?? 'other'} onChange={(e) => patch(t.id, { blockReason: e.target.value as BlockReason })}><option value="customer">Customer</option><option value="vendor">Vendor</option><option value="other">Other</option></select>
                          <input className="inline" style={{ fontSize: 12, padding: '3px 6px', width: 130 }} placeholder="Why?" value={t.blockNote ?? ''} onChange={(e) => patch(t.id, { blockNote: e.target.value })} />
                        </div>
                      )}
                    </td>
                    <td><button className="sm ghost" title="Delete task" onClick={() => dispatch({ type: 'deleteTask', id: t.id })}>✕</button></td>
                  </tr>
                );
              })}
              {!tasks.length && <tr><td colSpan={7} className="empty">No tasks yet.</td></tr>}
            </tbody>
          </table>
          <form className="row addbar" onSubmit={addTask}>
            <input name="title" placeholder="New task" required style={{ flex: 1, minWidth: 160 }} />
            <select name="phase">{PHASES.map((ph) => <option key={ph.key} value={ph.key}>{ph.short}</option>)}</select>
            <select name="mechanic"><option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <select name="part"><option value="">No part needed</option>{parts.filter((x) => !isPartIn(x)).map((x) => <option key={x.id} value={x.id}>Waits on: {x.name}</option>)}</select>
            <input name="date" type="date" defaultValue={today} required />
            <input name="hours" type="number" min="0.5" step="0.5" defaultValue={4} style={{ width: 64 }} />
            <button className="primary" type="submit">Add task</button>
          </form>
        </Card>
      )}

      {tab === 'parts' && (
        <Card flush>
          <table>
            <thead><tr><th>Item</th><th>Supplier / PO</th><th>Needed by</th><th>ETA</th><th>Cost</th><th>Risk</th><th>Status</th></tr></thead>
            <tbody>
              {parts.map((x) => {
                const gap = x.eta ? diffDays(x.neededBy, x.eta) : null;
                return (
                  <tr key={x.id}>
                    <td><strong>{x.name}</strong><div className="small muted">{x.kind === 'sublet' ? 'Sublet job' : 'Part'}{x.note ? ` · ${x.note}` : ''}</div></td>
                    <td>{x.supplier}<div className="small muted">{x.po ?? '—'}</div></td>
                    <td className="num">{fmtDate(x.neededBy)}</td>
                    <td><input type="date" className="inline" value={x.eta ?? ''} onChange={(e) => dispatch({ type: 'updatePart', id: x.id, patch: { eta: e.target.value || undefined } })} />{gap !== null && gap > 0 && !isPartIn(x) && <div className="small over">+{gap}d late</div>}</td>
                    <td className="num">{money(x.cost)}</td>
                    <td><RiskPill r={partRisk(x, today)} /></td>
                    <td><PartStatusPill part={x} /><div><select className="inline" value={x.status} onChange={(e) => dispatch({ type: 'setPartStatus', id: x.id, status: e.target.value as PartStatus })} style={{ marginTop: 4 }}>{PART_FLOW.map((s) => <option key={s} value={s}>{partStatusLabel(x.kind, s)}</option>)}</select></div></td>
                  </tr>
                );
              })}
              {!parts.length && <tr><td colSpan={7} className="empty">No parts or sublet jobs yet.</td></tr>}
            </tbody>
          </table>
          <form className="row addbar" onSubmit={addPart}>
            <input name="name" placeholder="Part or sublet job" required style={{ flex: 1, minWidth: 160 }} />
            <select name="kind"><option value="part">Part</option><option value="sublet">Sublet job</option></select>
            <input name="supplier" placeholder="Supplier / vendor" /><input name="po" placeholder="PO #" style={{ width: 90 }} />
            <label className="row small muted">Needed by<input name="needed" type="date" defaultValue={today} required /></label>
            <input name="cost" type="number" min="0" placeholder="Cost" style={{ width: 90 }} />
            <button className="primary" type="submit">Add</button>
          </form>
        </Card>
      )}

      {tab === 'log' && (
        <Card>
          <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) { dispatch({ type: 'addUpdate', projectId: p.id, text: note.trim(), phaseKey: notePhase || undefined, author: 'Alex' }); setNote(''); } }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Post an update for this build — what was done, what's holding it up, what the customer was told…" />
            <div className="row" style={{ marginTop: 8 }}>
              <select value={notePhase} onChange={(e) => setNotePhase(e.target.value as PhaseKey | '')}><option value="">General</option>{PHASES.map((ph) => <option key={ph.key} value={ph.key}>{ph.label}</option>)}</select>
              <button className="primary" type="submit">Post update</button>
            </div>
          </form>
          <div style={{ marginTop: 18 }}>
            {updates.map((u) => <div key={u.id} className="timeline-e"><div className="small muted">{fmtDate(u.date)} · {u.author}{u.phaseKey && ` · ${phaseLabel(u.phaseKey)}`}</div><div>{u.text}</div></div>)}
            {!updates.length && <div className="empty">No updates yet.</div>}
          </div>
        </Card>
      )}
    </>
  );
}
