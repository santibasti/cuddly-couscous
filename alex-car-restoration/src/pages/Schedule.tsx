import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Card, Icon } from '../components/ui';
import { addDays, fmtDate, fmtDay, isWeekend, startOfWeek, todayIso } from '../lib/dates';
import { dayLoad, isOverbooked, partArrivesLate, taskBlocker } from '../lib/logic';
import { useStore } from '../lib/store';

export default function Schedule() {
  const { data, dispatch } = useStore();
  const today = todayIso();
  const [week, setWeek] = useState(startOfWeek(today));
  const [proj, setProj] = useState('');
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const open = data.projects.filter((p) => p.status === 'active');
  const inWeek = (t: { date: string }) => t.date >= week && t.date <= addDays(week, 6);
  const unassigned = data.tasks.filter((t) => !t.mechanicId && t.status !== 'done' && inWeek(t));
  const blockedThisWeek = data.tasks.filter((t) => inWeek(t) && taskBlocker(t, data.parts));

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
        <div><div className="eyebrow">Technician dispatch</div><h1>Schedule</h1></div>
        <div className="row">
          <select value={proj} onChange={(e) => setProj(e.target.value)}><option value="">All projects</option>{open.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.make} {p.model}</option>)}</select>
          <button onClick={() => setWeek(addDays(week, -7))}>←</button>
          <strong className="num" style={{ minWidth: 130, textAlign: 'center' }}>{fmtDate(week)} – {fmtDate(addDays(week, 6))}</strong>
          <button onClick={() => setWeek(addDays(week, 7))}>→</button>
          <button onClick={() => setWeek(startOfWeek(today))}>Today</button>
        </div>
      </div>
      <div className="sched">
        <div className="hd who">Mechanic</div>
        {days.map((d) => { const f = fmtDay(d); const dow = f.match(/[A-Za-z]+/)![0]; const dom = f.match(/\d+/)![0]; return <div key={d} className={`hd day ${d === today ? 'today' : ''}`}><span>{dow}</span><b>{dom}</b></div>; })}
        {data.mechanics.filter((m) => m.active).map((m) => (
          <div key={m.id} style={{ display: 'contents' }}>
            <div className="who"><div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}><Avatar m={m} size={30} /><div><div style={{ fontWeight: 500 }}>{m.name.split(' ')[0]}</div><div className="small muted">{m.specialty}</div></div></div></div>
            {days.map((d) => {
              const ts = data.tasks.filter((t) => t.mechanicId === m.id && t.date === d && (!proj || t.projectId === proj));
              const load = dayLoad(data.tasks, m.id, d);
              return (
                <div key={d} className={`cell ${d === today ? 'today' : ''} ${isWeekend(d) ? 'wk' : ''} ${d < today ? 'past' : ''}`}>
                  {ts.map((t) => {
                    const p = data.projects.find((x) => x.id === t.projectId);
                    const b = taskBlocker(t, data.parts);
                    const late = partArrivesLate(t, data.parts);
                    return (
                      <button key={t.id} className={`chip ${t.status === 'done' ? 'done' : ''} ${b ? 'blocked' : ''} ${t.status === 'in_progress' ? 'running' : ''}`} style={{ '--mc': m.color } as React.CSSProperties}
                        title={b ? `${b.label}${b.eta ? ` — ETA ${fmtDate(b.eta)}` : ''}` : `${t.title} (${t.estHours}h) – click to advance`}
                        onClick={() => !b && dispatch({ type: 'updateTask', id: t.id, patch: { status: t.status === 'todo' ? 'in_progress' : t.status === 'in_progress' ? 'done' : 'todo' } })}>
                        <span className="cc">{b && <Icon name="lock" size={11} />}{p?.code}</span>
                        <span className="ct">{t.title}</span>
                        <small>{b ? b.label : `${t.estHours}h`}{late && b?.eta ? ' · lands after this day' : ''}</small>
                      </button>
                    );
                  })}
                  {load > 0 && <div className={`small load ${isOverbooked(data.tasks, m, d) && d >= today ? 'over' : 'muted'}`}>{load}/{m.dailyHours}h</div>}
                  {!isWeekend(d) && <button className="addtask" onClick={() => quickAdd(m.id, d)} title="Add task" aria-label="Add task">+</button>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="grid g2 mt">
        <Card title="Blocked this week" flush>
          {blockedThisWeek.length === 0 && <div className="empty">No blocked work this week.</div>}
          {blockedThisWeek.map((t) => {
            const p = data.projects.find((x) => x.id === t.projectId)!;
            const b = taskBlocker(t, data.parts)!;
            return <div key={t.id} className="item"><span className={`ico ${b.reason}`}><Icon name="lock" /></span><div className="grow"><strong>{b.label}</strong><div className="small muted">{p.code} · {t.title} · {fmtDate(t.date)}</div></div><div className="small muted">{b.eta ? `ETA ${fmtDate(b.eta)}` : 'No ETA'}</div></div>;
          })}
        </Card>
        <Card title="Unassigned this week" flush>
          {unassigned.length === 0 && <div className="empty">Every task has a mechanic.</div>}
          {unassigned.map((t) => {
            const p = data.projects.find((x) => x.id === t.projectId)!;
            return (
              <div key={t.id} className="item" style={{ alignItems: 'center' }}>
                <div className="grow"><Link to={`/projects/${p.id}`} style={{ color: 'var(--accent)' }}>{p.code}</Link> · {t.title}<div className="small muted">{fmtDate(t.date)} · {t.estHours}h</div></div>
                <select value="" onChange={(e) => e.target.value && dispatch({ type: 'updateTask', id: t.id, patch: { mechanicId: e.target.value } })}>
                  <option value="">Assign to…</option>{data.mechanics.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            );
          })}
        </Card>
      </div>
      <p className="small muted">Hatched cards are blocked — they clear automatically when the part or sublet job is marked received. Click an unblocked card to advance it.</p>
    </>
  );
}
