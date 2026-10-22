import { Link } from 'react-router-dom';
import { Avatar, Badge, Progress } from '../components/ui';
import { addDays, fmtDate, startOfWeek, todayIso } from '../lib/dates';
import { utilisation } from '../lib/logic';
import { useStore } from '../lib/store';

const COLORS = ['#d9534f', '#e0933a', '#3a9d7a', '#4a7fd1', '#8e63c9', '#c2478b', '#4a9aa8'];

export default function Mechanics() {
  const { data, dispatch } = useStore();
  const today = todayIso();
  const wk = startOfWeek(today);

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    dispatch({
      type: 'addMechanic',
      mechanic: {
        name: String(f.get('name')), specialty: String(f.get('specialty')), hourlyRate: Number(f.get('rate')) || 0,
        dailyHours: Number(f.get('hours')) || 8, color: COLORS[data.mechanics.length % COLORS.length],
      },
    });
    e.currentTarget.reset();
  }

  return (
    <>
      <div className="head"><h1>Mechanics</h1></div>
      <div className="grid g3">
        {data.mechanics.map((m) => {
          const util = utilisation(data.tasks, m, wk, addDays(wk, 4));
          const mine = data.tasks.filter((t) => t.mechanicId === m.id && t.status !== 'done' && t.date >= today).sort((a, b) => a.date.localeCompare(b.date));
          const doneHrs = data.tasks.filter((t) => t.mechanicId === m.id).reduce((s, t) => s + t.actualHours, 0);
          return (
            <div key={m.id} className="card" style={{ opacity: m.active ? 1 : 0.55 }}>
              <div className="row spread">
                <div className="row"><Avatar m={m} /><div><strong>{m.name}</strong><div className="small muted">{m.specialty}</div></div></div>
                <button className="sm" onClick={() => dispatch({ type: 'toggleMechanic', id: m.id })}>{m.active ? 'Deactivate' : 'Activate'}</button>
              </div>
              <div className="small muted" style={{ margin: '8px 0 2px' }}>This week: {util}% booked · ${m.hourlyRate}/h · {doneHrs}h logged</div>
              <Progress value={Math.min(100, util)} tone={util > 100 ? 'bad' : util > 85 ? 'warn' : undefined} />
              <div style={{ marginTop: 10 }}>
                <div className="small muted">Upcoming tasks ({mine.length})</div>
                {mine.slice(0, 4).map((t) => {
                  const p = data.projects.find((x) => x.id === t.projectId)!;
                  return <div key={t.id} className="small"><Link to={`/projects/${p.id}`}>{p.code}</Link> · {t.title} <Badge>{fmtDate(t.date)}</Badge></div>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <form className="card form" onSubmit={add} style={{ marginTop: 14 }}>
        <h2 className="full">Add a mechanic</h2>
        <label>Name<input name="name" required /></label>
        <label>Specialty<input name="specialty" required /></label>
        <label>Hourly cost ($)<input name="rate" type="number" min="0" /></label>
        <label>Hours per day<input name="hours" type="number" min="1" max="12" defaultValue={8} /></label>
        <div className="full"><button className="primary" type="submit">Add mechanic</button></div>
      </form>
    </>
  );
}
