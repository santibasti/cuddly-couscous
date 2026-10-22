import { Link } from 'react-router-dom';
import { Avatar, Bar, Card, Pill } from '../components/ui';
import { addDays, fmtDate, startOfWeek, todayIso } from '../lib/dates';
import { taskBlocker, utilisation } from '../lib/logic';
import { useStore } from '../lib/store';

const COLORS = ['#e5553d', '#e8a33d', '#2fb585', '#4c8df0', '#9a6ee0', '#d65aa0', '#3fb0c4'];

export default function Mechanics() {
  const { data, dispatch } = useStore();
  const today = todayIso();
  const wk = startOfWeek(today);

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    dispatch({
      type: 'addMechanic',
      mechanic: { name: String(f.get('name')), specialty: String(f.get('specialty')), hourlyRate: Number(f.get('rate')) || 0, dailyHours: Number(f.get('hours')) || 8, color: COLORS[data.mechanics.length % COLORS.length] },
    });
    e.currentTarget.reset();
  }

  return (
    <>
      <div className="head"><div><div className="eyebrow">{data.mechanics.filter((m) => m.active).length} technicians</div><h1>Mechanics</h1></div></div>
      <div className="grid g3">
        {data.mechanics.map((m) => {
          const util = utilisation(data.tasks, m, wk, addDays(wk, 4));
          const mine = data.tasks.filter((t) => t.mechanicId === m.id && t.status !== 'done' && t.date >= today).sort((a, b) => a.date.localeCompare(b.date));
          const stuck = mine.filter((t) => taskBlocker(t, data.parts)).length;
          const hrs = data.tasks.filter((t) => t.mechanicId === m.id).reduce((s, t) => s + t.actualHours, 0);
          return (
            <Card key={m.id} className={m.active ? '' : 'muted'}>
              <div className="row spread" style={{ flexWrap: 'nowrap' }}>
                <div className="row" style={{ flexWrap: 'nowrap' }}><Avatar m={m} size={36} /><div><strong>{m.name}</strong><div className="small muted">{m.specialty}</div></div></div>
                <button className="sm ghost" onClick={() => dispatch({ type: 'toggleMechanic', id: m.id })}>{m.active ? 'Deactivate' : 'Activate'}</button>
              </div>
              <div className="row spread small" style={{ margin: '14px 0 6px' }}><span className="muted">This week booked</span><b className={util > 100 ? 'over' : ''}>{util}%</b></div>
              <Bar value={util} tone={util > 100 ? 'red' : util > 85 ? 'amber' : undefined} />
              <div className="row small muted" style={{ margin: '10px 0' }}><span>${m.hourlyRate}/h</span><span>·</span><span>{m.dailyHours}h/day</span><span>·</span><span>{hrs}h logged</span>{stuck > 0 && <Pill tone="orange">{stuck} waiting on parts/approval</Pill>}</div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Up next</div>
              {mine.slice(0, 4).map((t) => {
                const p = data.projects.find((x) => x.id === t.projectId)!;
                const b = taskBlocker(t, data.parts);
                return <div key={t.id} className="small row spread" style={{ flexWrap: 'nowrap', padding: '3px 0' }}><span><Link to={`/projects/${p.id}`} style={{ color: 'var(--accent)' }}>{p.code}</Link> {t.title}{b && ' 🔒'}</span><span className="muted">{fmtDate(t.date)}</span></div>;
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
          <label>Hourly cost ($)<input name="rate" type="number" min="0" placeholder="60" /></label>
          <label>Hours per day<input name="hours" type="number" min="1" max="12" defaultValue={8} /></label>
          <button className="primary" type="submit">Add mechanic</button>
        </form>
      </Card>
    </>
  );
}
