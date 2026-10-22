import { Link } from 'react-router-dom';
import { Avatar, Badge, ProjectLink, Progress, Stat } from '../components/ui';
import { addDays, fmtDate, startOfWeek, todayIso } from '../lib/dates';
import { buildAlerts, currentPhase, daysOverdue, dayLoad, phaseLabel, projectCosts, projectProgress, utilisation } from '../lib/logic';
import { useStore } from '../lib/store';

export default function Dashboard() {
  const { data } = useStore();
  const today = todayIso();
  const active = data.projects.filter((p) => p.status === 'active');
  const alerts = buildAlerts(data, today);
  const overdue = data.projects.filter((p) => daysOverdue(p, today) > 0).length;
  const todays = data.tasks.filter((t) => t.date === today && t.status !== 'done');
  const partsPending = data.parts.filter((p) => p.status === 'needed' || p.status === 'ordered').length;
  const wk = startOfWeek(today);
  const team = data.mechanics.filter((m) => m.active);
  const util = team.length ? Math.round(team.reduce((s, m) => s + utilisation(data.tasks, m, wk, addDays(wk, 4)), 0) / team.length) : 0;

  return (
    <>
      <div className="head"><h1>Shop overview</h1><span className="muted">{fmtDate(today)}</span></div>
      <div className="grid g4">
        <Stat label="Active projects" value={active.length} sub={`${data.projects.filter((p) => p.status === 'quote').length} in quote`} />
        <Stat label="Behind schedule" value={overdue} tone={overdue ? 'bad' : ''} sub="past target date" />
        <Stat label="Today's tasks" value={todays.length} sub="not yet done" />
        <Stat label="Team utilisation" value={`${util}%`} sub="this week" />
      </div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="stack">
          <div className="card">
            <h2>Projects in progress</h2>
            <table>
              <thead><tr><th>Vehicle</th><th>Phase</th><th style={{ width: '25%' }}>Progress</th><th>Due</th><th>Budget</th></tr></thead>
              <tbody>
                {active.map((p) => {
                  const pct = projectProgress(p, data.tasks);
                  const cph = currentPhase(p);
                  const c = projectCosts(p, data.tasks, data.parts, data.mechanics).total;
                  const late = daysOverdue(p, today) > 0;
                  return (
                    <tr key={p.id}>
                      <td><ProjectLink p={p} /></td>
                      <td>{cph ? phaseLabel(cph.key) : '—'}</td>
                      <td><Progress value={pct} tone={late ? 'bad' : undefined} /><span className="small muted">{pct}%</span></td>
                      <td>{late ? <Badge tone="red">late</Badge> : fmtDate(p.targetDate)}</td>
                      <td><span className={c > p.budget ? 'over' : ''}>{Math.round((c / p.budget) * 100)}%</span></td>
                    </tr>
                  );
                })}
                {!active.length && <tr><td colSpan={5} className="muted">No active projects.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>Today's schedule</h2>
            {todays.length === 0 && <p className="muted">Nothing scheduled for today.</p>}
            {todays.map((t) => {
              const p = data.projects.find((x) => x.id === t.projectId)!;
              const m = data.mechanics.find((x) => x.id === t.mechanicId);
              return (
                <div key={t.id} className="row" style={{ padding: '6px 0' }}>
                  <Avatar m={m} />
                  <div style={{ flex: 1 }}><strong>{t.title}</strong><div className="small muted">{p.code} · {m?.name ?? 'Unassigned'} · {t.estHours}h</div></div>
                  <Badge tone={t.status === 'in_progress' ? 'blue' : 'gray'}>{t.status.replace('_', ' ')}</Badge>
                </div>
              );
            })}
            <div className="small muted" style={{ marginTop: 8 }}>
              Mechanic load today: {team.map((m) => `${m.name.split(' ')[0]} ${dayLoad(data.tasks, m.id, today)}/${m.dailyHours}h`).join(' · ')}
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h2>Needs attention {alerts.length > 0 && <Badge tone="red">{alerts.length}</Badge>}</h2>
            {alerts.length === 0 && <p className="muted">All clear.</p>}
            {alerts.slice(0, 8).map((a, i) => (
              <div key={i} className={`alert ${a.level}`}><Link to={`/projects/${a.projectId}`}>{a.text}</Link></div>
            ))}
            <div className="small muted">{partsPending} part{partsPending === 1 ? '' : 's'} still to arrive</div>
          </div>
          <div className="card">
            <h2>Latest updates</h2>
            {[...data.updates].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((u) => {
              const p = data.projects.find((x) => x.id === u.projectId);
              return p && (
                <div key={u.id} style={{ marginBottom: 8 }}>
                  <div className="small muted">{fmtDate(u.date)} · {p.code} · {u.author}</div>
                  <div>{u.text}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
