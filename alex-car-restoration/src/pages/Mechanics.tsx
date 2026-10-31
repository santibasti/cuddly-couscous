import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Bar, Card, Pill } from '../components/ui';
import { resizeSquare } from '../lib/photo';
import { addDays, fmtDate, startOfWeek, todayIso } from '../lib/dates';
import { taskBlocker, utilisation } from '../lib/logic';
import { useStore } from '../lib/store';

const COLORS = ['#e5553d', '#e8a33d', '#2fb585', '#4c8df0', '#9a6ee0', '#d65aa0', '#3fb0c4'];

export default function Mechanics() {
  const { data, dispatch } = useStore();
  const today = todayIso();
  const wk = startOfWeek(today);
  const [photoErr, setPhotoErr] = useState('');

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    dispatch({
      type: 'addMechanic',
      mechanic: { name: String(f.get('name')), specialty: String(f.get('specialty')), dailyHours: Number(f.get('hours')) || 8, color: COLORS[data.mechanics.length % COLORS.length] },
    });
    e.currentTarget.reset();
  }

  return (
    <>
      <div className="head"><div><div className="eyebrow">{data.mechanics.filter((m) => m.active).length} technicians</div><h1>Mechanics</h1></div></div>
      {photoErr && <div className="small over" role="alert" style={{ marginBottom: 10 }}>{photoErr}</div>}
      <div className="grid g3">
        {data.mechanics.map((m) => {
          const util = utilisation(data.tasks, m, wk, addDays(wk, 4));
          const mine = data.tasks.filter((t) => t.mechanicId === m.id && t.status !== 'done' && t.date >= today).sort((a, b) => a.date.localeCompare(b.date));
          const stuck = mine.filter((t) => taskBlocker(t, data.parts)).length;
          const hrs = data.tasks.filter((t) => t.mechanicId === m.id).reduce((s, t) => s + t.actualHours, 0);
          return (
            <Card key={m.id} className={m.active ? '' : 'muted'}>
              <div className="row spread" style={{ flexWrap: 'nowrap' }}>
                <div className="row" style={{ flexWrap: 'nowrap' }}><Avatar m={m} size={44} /><div><strong>{m.name}</strong><div className="small muted">{m.specialty}</div>
                  <div className="row" style={{ gap: 6, marginTop: 4 }}>
                    <label className="small" style={{ cursor: 'pointer', color: 'var(--accent2)' }}>{m.photo ? 'Change photo' : 'Add photo'}
                      <input type="file" accept="image/*" hidden onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        try { dispatch({ type: 'updateMechanic', id: m.id, patch: { photo: await resizeSquare(file) } }); setPhotoErr(''); } catch (err) { setPhotoErr(err instanceof Error ? err.message : 'Could not use that image.'); }
                      }} /></label>
                    {m.photo && <button className="sm ghost" style={{ padding: '0 6px' }} onClick={() => dispatch({ type: 'updateMechanic', id: m.id, patch: { photo: undefined } })}>Remove</button>}
                  </div></div></div>
                <button className="sm ghost" onClick={() => dispatch({ type: 'toggleMechanic', id: m.id })}>{m.active ? 'Deactivate' : 'Activate'}</button>
              </div>
              <div className="row spread small" style={{ margin: '14px 0 6px' }}><span className="muted">This week booked</span><b className={util > 100 ? 'over' : ''}>{util}%</b></div>
              <Bar value={util} tone={util > 100 ? 'red' : util > 85 ? 'amber' : undefined} />
              <div className="row small muted" style={{ margin: '10px 0' }}><span>{m.dailyHours}h/day</span><span>·</span><span>{hrs}h logged</span>{stuck > 0 && <Pill tone="orange">{stuck} waiting on parts/approval</Pill>}</div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Up next</div>
              {mine.slice(0, 4).map((t) => {
                const p = data.projects.find((x) => x.id === t.projectId)!;
                const b = taskBlocker(t, data.parts);
                return <div key={t.id} className="small row spread" style={{ flexWrap: 'nowrap', padding: '3px 0' }}><span><Link to={`/projects/${p.id}`} style={{ color: 'var(--accent2)' }}>{p.code}</Link> {t.title}{b && ' 🔒'}</span><span className="muted">{fmtDate(t.date)}</span></div>;
              })}
              {mine.length === 0 && <div className="small muted">No upcoming tasks.</div>}
            </Card>
          );
        })}
      </div>
      <Card className="mt" title="Add a mechanic">
        <form className="form f4" onSubmit={add}>
          <label>Name<input name="name" placeholder="Jane Smith" required /></label>
          <label>Specialty<input name="specialty" placeholder="Paint & finish" required /></label>
          <label>Hours per day<input name="hours" type="number" min="1" max="12" defaultValue={8} /></label>
          <button className="primary" type="submit">Add mechanic</button>
        </form>
      </Card>
    </>
  );
}
