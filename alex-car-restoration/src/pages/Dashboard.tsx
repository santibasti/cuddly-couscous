import { Link } from 'react-router-dom';
import { Avatar, Card, Empty, HealthPill, Icon, Kpi, Bar, RiskPill, carName, healthTone } from '../components/ui';
import { addDays, diffDays, fmtDate, fmtDay, isWeekend, todayIso } from '../lib/dates';
import {
  BAYS, PHASES, allBlockers, buildAlerts, currentPhase, dayLoad, money, partRisk, phaseShort, projectCosts, projectHealth,
  projectProgress, RISK_RANK,
} from '../lib/logic';
import { useStore } from '../lib/store';

export default function Dashboard() {
  const { data } = useStore();
  const today = todayIso();
  const active = data.projects.filter((p) => p.status === 'active');
  const health = new Map(data.projects.map((p) => [p.id, projectHealth(p, data, today)]));
  const count = (h: string) => active.filter((p) => health.get(p.id)!.health === h).length;
  const blockers = allBlockers(data);
  const blockedHours = blockers.reduce((s, b) => s + (data.tasks.find((t) => t.id === b.taskId)?.estHours ?? 0), 0);
  const byReason = (r: string) => blockers.filter((b) => b.reason === r).length;
  const watch = data.parts
    .filter((x) => data.projects.find((p) => p.id === x.projectId)?.status === 'active' && ['late', 'order_now', 'at_risk'].includes(partRisk(x, today)))
    .sort((a, b) => RISK_RANK[partRisk(a, today)] - RISK_RANK[partRisk(b, today)]);
  const inTransit = data.parts.filter((x) => x.status === 'shipped' || x.status === 'ordered').length;
  const team = data.mechanics.filter((m) => m.active);
  const days: string[] = [];
  for (let d = today; days.length < 10; d = addDays(d, 1)) if (!isWeekend(d)) days.push(d);
  const booked = (d: string) => team.reduce((s, m) => s + dayLoad(data.tasks, m.id, d), 0);
  const cap = team.reduce((s, m) => s + m.dailyHours, 0);
  const util = cap ? Math.round((days.slice(0, 5).reduce((s, d) => s + booked(d), 0) / (cap * 5)) * 100) : 0;
  const hoursTrend = Array.from({ length: 14 }, (_, i) => data.tasks.filter((t) => t.status === 'done' && t.date === addDays(today, i - 13)).reduce((s, t) => s + t.actualHours, 0));
  const spent = active.reduce((s, p) => s + projectCosts(p, data.tasks, data.parts, data.mechanics).total, 0);
  const budget = active.reduce((s, p) => s + p.budget, 0);
  const alerts = buildAlerts(data, today);
  const todays = data.tasks.filter((t) => t.date === today && t.status !== 'done');
  const nextDelivery = active.map((p) => p.targetDate).filter((d) => d >= today).sort()[0];

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">{fmtDate(today)} · Shop floor</div><h1>Operations</h1></div>
        <div className="row"><Link className="btn" to="/schedule"><Icon name="cal" />Schedule</Link><Link className="btn primary" to="/projects"><Icon name="plus" />New project</Link></div>
      </div>

      <div className="grid g5">
        <Kpi label="Active builds" icon="car" value={active.length}
          sub={<>{count('on_track')} on track · <span className="warn">{count('at_risk')} at risk</span> · <span className="over">{count('blocked') + count('late')} blocked/late</span></>} />
        <Kpi label="Work blocked" icon="lock" tone={blockers.length ? 'orange' : ''} value={blockers.length}
          sub={`${blockedHours}h waiting · ${byReason('parts')} parts · ${byReason('vendor')} sublet · ${byReason('customer')} customer`} />
        <Kpi label="Parts watch" icon="truck" tone={watch.length ? 'amber' : ''} value={watch.length} sub={`${inTransit} orders on the way · ${data.parts.filter((x) => x.status === 'needed').length} not yet ordered`} />
        <Kpi label="Labor utilisation" icon="wrench" value={`${util}%`} spark={hoursTrend} sub="Booked this week · hours logged, 14 days" />
        <Kpi label="Budget committed" icon="check" value={budget ? `${Math.round((spent / budget) * 100)}%` : '—'} sub={`${money(spent)} of ${money(budget)}${nextDelivery ? ` · next delivery ${fmtDate(nextDelivery)}` : ''}`} />
      </div>

      <Card className="mt" title="Builds by phase" action={<span className="muted small">Border colour = health</span>}>
        <div className="pipe">
          {PHASES.map((ph) => {
            const here = active.filter((p) => currentPhase(p)?.key === ph.key);
            return (
              <div key={ph.key} className="pcol">
                <h3>{ph.short}<span>{here.length || ''}</span></h3>
                {here.map((p) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className={`pchip ${healthTone(health.get(p.id)!.health)}`}>
                    <b>{p.code}</b><span>{p.make} {p.model}</span>
                    <span>{projectProgress(p, data.tasks)}% · {fmtDate(p.targetDate)}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid g21 mt">
        <Card title="Waiting on — what is holding up work" flush action={<span className="muted small">{blockers.length} blocked tasks</span>}>
          {blockers.length === 0 && <Empty>Nothing is blocked. The floor is moving.</Empty>}
          {blockers
            .map((b) => ({ b, t: data.tasks.find((t) => t.id === b.taskId)!, p: data.projects.find((p) => p.id === b.projectId)! }))
            .sort((x, y) => x.t.date.localeCompare(y.t.date))
            .map(({ b, t, p }) => {
              const slip = b.eta ? diffDays(t.date, b.eta) : null;
              const overdue = !!b.eta && b.eta < today;
              return (
                <div className="item" key={t.id}>
                  <span className={`ico ${b.reason}`}><Icon name={b.reason === 'parts' ? 'box' : b.reason === 'vendor' ? 'truck' : b.reason === 'customer' ? 'user' : 'lock'} /></span>
                  <div className="grow">
                    <div><strong>{b.label}</strong></div>
                    <div className="small muted">{p.code} · {t.title} · scheduled {fmtDate(t.date)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }} className="small">
                    {b.eta ? <><div>ETA {fmtDate(b.eta)}</div><div className={overdue || slip! > 0 ? 'over' : 'ok'}>{overdue ? `${diffDays(b.eta!, today)}d overdue` : slip! > 0 ? `${slip}d after needed` : 'in time'}</div></> : <div className="muted">{b.reason === 'customer' ? 'Needs customer' : 'No ETA'}</div>}
                  </div>
                </div>
              );
            })}
        </Card>
        <Card title="Needs attention" flush action={alerts.length ? <span className="pill red"><i />{alerts.length}</span> : undefined}>
          {alerts.length === 0 && <Empty>All clear.</Empty>}
          {alerts.slice(0, 7).map((a, i) => (
            <Link key={i} to={`/projects/${a.projectId}`} className="item" style={{ padding: '9px 16px' }}>
              <span className={`ico ${a.level === 'high' ? 'red' : 'amber'}`}><Icon name="warn" /></span><div className="grow small" style={{ color: 'var(--ink2)' }}>{a.text}</div>
            </Link>
          ))}
        </Card>
      </div>

      <div className="grid g12 mt">
        <Card title="Bay board">
          <div className="bays">
            {BAYS.map((bay) => {
              const p = active.find((x) => x.bay === bay);
              if (!p) return <div key={bay} className="bay free"><div style={{ textAlign: 'center' }}><div className="nm">{bay}</div>Available</div></div>;
              const h = health.get(p.id)!;
              const doing = data.tasks.find((t) => t.projectId === p.id && t.status === 'in_progress');
              return (
                <Link to={`/projects/${p.id}`} key={bay} className={`bay ${healthTone(h.health)}`}>
                  <div className="nm">{bay}</div>
                  <div className="car">{carName(p)}</div>
                  <div className="small muted">{p.code} · {currentPhase(p) ? phaseShort(currentPhase(p)!.key) : ''}</div>
                  <div style={{ margin: '8px 0' }}><Bar value={projectProgress(p, data.tasks)} thin /></div>
                  <div className="row spread"><HealthPill h={h.health} /><Avatar m={data.mechanics.find((m) => m.id === doing?.mechanicId)} size={22} /></div>
                </Link>
              );
            })}
          </div>
        </Card>
        <Card title="Parts & sublet watchlist" flush action={<Link to="/parts" className="small muted">Open pipeline →</Link>}>
          {watch.length === 0 && <Empty>Every part is on time.</Empty>}
          {watch.slice(0, 6).map((x) => {
            const p = data.projects.find((y) => y.id === x.projectId)!;
            const gap = x.eta ? diffDays(x.neededBy, x.eta) : null;
            return (
              <div className="item" key={x.id}>
                <div className="grow">
                  <div className="row spread"><strong>{x.name}</strong><RiskPill r={partRisk(x, today)} /></div>
                  <div className="small muted">{p.code} · {x.supplier}{x.po ? ` · ${x.po}` : ''}</div>
                  <div className="small">Needed {fmtDate(x.neededBy)} · {x.eta ? <>ETA {fmtDate(x.eta)} {gap! > 0 && <span className="over">(+{gap}d)</span>}</> : <span className="over">{x.status === 'needed' ? 'not ordered' : 'no ETA'}</span>}</div>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      <div className="grid g21 mt">
        <Card title="Technician capacity — next 10 working days" action={<span className="muted small">% of daily hours booked</span>}>
          <div className="heat" style={{ gridTemplateColumns: `120px repeat(${days.length}, 1fr)` }}>
            <div className="c h" />{days.map((d) => <div key={d} className="c h">{fmtDay(d)}</div>)}
            {team.map((m) => (
              <div key={m.id} style={{ display: 'contents' }}>
                <div className="c h" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink2)' }}><Avatar m={m} size={20} />{m.name.split(' ')[0]}</div>
                {days.map((d) => {
                  const pct = Math.round((dayLoad(data.tasks, m.id, d) / m.dailyHours) * 100);
                  const bg = pct === 0 ? undefined : pct > 100 ? 'var(--red)' : `color-mix(in srgb, var(--accent) ${Math.min(90, 15 + pct * 0.75)}%, var(--panel2))`;
                  return <div key={d} className="c" style={{ background: bg, color: pct > 100 ? '#fff' : undefined }} title={`${m.name} · ${fmtDate(d)} · ${pct}%`}>{pct ? pct : ''}</div>;
                })}
              </div>
            ))}
          </div>
        </Card>
        <Card title="Today on the floor" flush>
          {todays.length === 0 && <Empty>Nothing scheduled today.</Empty>}
          {todays.slice(0, 6).map((t) => {
            const p = data.projects.find((x) => x.id === t.projectId)!;
            const blocked = allBlockers(data).some((b) => b.taskId === t.id);
            return (
              <div key={t.id} className="item" style={{ padding: '9px 16px', alignItems: 'center' }}>
                <Avatar m={data.mechanics.find((m) => m.id === t.mechanicId)} />
                <div className="grow"><div>{t.title}</div><div className="small muted">{p.code} · {t.estHours}h</div></div>
                {blocked ? <span className="pill orange"><i />Blocked</span> : t.status === 'in_progress' && <span className="pill blue"><i />Running</span>}
              </div>
            );
          })}
        </Card>
      </div>
    </>
  );
}
