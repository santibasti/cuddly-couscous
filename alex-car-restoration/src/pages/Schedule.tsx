import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, fmtDate, fmtDay, isWeekend, startOfWeek, todayIso } from '../lib/dates';
import { dayLoad, isOverbooked } from '../lib/logic';
import { useStore } from '../lib/store';

export default function Schedule() {
  const { data, dispatch } = useStore();
  const today = todayIso();
  const [week, setWeek] = useState(startOfWeek(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const open = data.projects.filter((p) => p.status === 'active');
  const unassigned = data.tasks.filter((t) => !t.mechanicId && t.status !== 'done' && t.date >= week && t.date <= addDays(week, 6));

  function quickAdd(mechanicId: string, date: string) {
    const title = prompt('Task title?');
    if (!title) return;
    const code = prompt(`Project code (${open.map((p) => p.code).join(', ')})`, open[0]?.code);
    const project = open.find((p) => p.code === code);
    if (!project) return alert('Unknown or inactive project code.');
    const phase = project.phases.find((ph) => ph.status === 'in_progress') ?? project.phases[0];
    dispatch({ type: 'addTask', task: { projectId: project.id, phaseKey: phase.key, title, mechanicId, date, estHours: 4 } });
  }

  return (
    <>
      <div className="head">
        <h1>Schedule</h1>
        <div className="row">
          <button onClick={() => setWeek(addDays(week, -7))}>←</button>
          <strong>{fmtDate(week)} – {fmtDate(addDays(week, 6))}</strong>
          <button onClick={() => setWeek(addDays(week, 7))}>→</button>
          <button onClick={() => setWeek(startOfWeek(today))}>This week</button>
        </div>
      </div>
      <div className="sched">
        <div className="hd">Mechanic</div>
        {days.map((d) => <div key={d} className={`hd ${d === today ? 'today' : ''}`}>{fmtDay(d)}</div>)}
        {data.mechanics.filter((m) => m.active).map((m) => (
          <div key={m.id} style={{ display: 'contents' }}>
            <div><strong>{m.name}</strong><div className="small muted">{m.specialty}</div></div>
            {days.map((d) => {
              const ts = data.tasks.filter((t) => t.mechanicId === m.id && t.date === d);
              const load = dayLoad(data.tasks, m.id, d);
              return (
                <div key={d} className={`${d === today ? 'today' : ''} ${isWeekend(d) ? 'wk' : ''}`}>
                  {ts.map((t) => {
                    const p = data.projects.find((x) => x.id === t.projectId);
                    return (
                      <button key={t.id} className={`chip ${t.status === 'done' ? 'done' : ''}`} style={{ background: m.color }}
                        title={`${t.title} (${t.estHours}h) – click to cycle status`}
                        onClick={() => dispatch({ type: 'updateTask', id: t.id, patch: { status: t.status === 'todo' ? 'in_progress' : t.status === 'in_progress' ? 'done' : 'todo' } })}>
                        {p?.code} {t.title}
                      </button>
                    );
                  })}
                  <div className="small">
                    <span className={isOverbooked(data.tasks, m, d) ? 'over' : 'muted'}>{load ? `${load}/${m.dailyHours}h` : ''}</span>
                    {!isWeekend(d) && <button className="sm" style={{ float: 'right', padding: '0 6px' }} onClick={() => quickAdd(m.id, d)} title="Add task">+</button>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {unassigned.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Unassigned this week</h2>
          {unassigned.map((t) => {
            const p = data.projects.find((x) => x.id === t.projectId)!;
            return (
              <div key={t.id} className="row" style={{ padding: '4px 0' }}>
                <span style={{ flex: 1 }}><Link to={`/projects/${p.id}`}>{p.code}</Link> · {t.title} · {fmtDate(t.date)} · {t.estHours}h</span>
                <select value="" onChange={(e) => e.target.value && dispatch({ type: 'updateTask', id: t.id, patch: { mechanicId: e.target.value } })}>
                  <option value="">Assign to…</option>{data.mechanics.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}
      <p className="small muted">Click a task to move it todo → in progress → done. Hours in red mean the mechanic is overbooked that day.</p>
    </>
  );
}
