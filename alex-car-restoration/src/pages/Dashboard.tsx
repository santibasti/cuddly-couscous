import { Link } from 'react-router-dom';
import ProjectCard from '../components/ProjectCard';
import { Avatar, CarArt, Card, Empty, Icon, RiskPill, StripStat, carName } from '../components/ui';
import { paintHex } from '../lib/paint';
import { addDays, diffDays, fmtDate, fmtDay, isWeekend, todayIso } from '../lib/dates';
import { allBlockers, dayLoad, money, partRisk, projectCosts, projectHealth, RISK_RANK, BAYS } from '../lib/logic';
import { useStore } from '../lib/store';

export default function Dashboard() {
  const { data } = useStore();
  const today = todayIso();
  const active = data.projects.filter((p) => p.status === 'active');
  const quotes = data.projects.filter((p) => p.status === 'quote');
  const health = new Map(data.projects.map((p) => [p.id, projectHealth(p, data, today).health]));
  const count = (...h: string[]) => active.filter((p) => h.includes(health.get(p.id)!)).length;
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
  const todays = data.tasks.filter((t) => t.date === today && t.status !== 'done');
  const nextDelivery = active.map((p) => p.targetDate).filter((d) => d >= today).sort()[0];
  const freeBays = BAYS.filter((b) => !active.some((p) => p.bay === b));
  const nextOut = active.filter((p) => p.targetDate >= today).sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0];
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const attention = count('blocked', 'late');

  return (
    <>
      <section className="hero rise">
        <div className="eyebrow" style={{ marginBottom: 14, position: 'relative', zIndex: 1 }}>{fmtDate(today)} · Shop overview</div>
        <h1>{greet}, <em>Alex.</em></h1>
        <p>
          <b>{active.length} builds</b> are in the shop{quotes.length ? ` and ${quotes.length} quote is waiting on a customer` : ''}.{' '}
          {blockers.length > 0 ? <><b>{blockers.length} tasks</b> are held up by parts, outside shops or approvals{attention ? <>, and <b>{attention} {attention === 1 ? 'job needs' : 'jobs need'} your attention</b> today</> : ''}.</> : 'Nothing is blocked — the floor is moving.'}
          {watch.length > 0 && <> {watch.filter((x) => partRisk(x, today) === 'late').length > 0 ? `${watch.filter((x) => partRisk(x, today) === 'late').length} deliveries are overdue.` : ''}</>}
        </p>
        <div className="row" style={{ marginTop: 26, position: 'relative', zIndex: 1 }}>
          <Link className="btn primary" to="/projects"><Icon name="plus" />New project</Link>
          <Link className="btn" to="/schedule"><Icon name="cal" />Open schedule</Link>
          <Link className="btn ghost" to="/parts">Parts pipeline <Icon name="arrow" size={14} /></Link>
        </div>
        {nextOut && (
          <Link to={`/projects/${nextOut.id}`} className="hart">
            <CarArt color={paintHex(nextOut)} />
            <div className="cap"><div className="eyebrow">Next out the door</div><div className="serif" style={{ fontSize: 22 }}>{carName(nextOut)}</div><div className="small muted">Target {fmtDate(nextOut.targetDate)}</div></div>
          </Link>
        )}
      </section>

      <Card className="mt rise">
        <div className="strip" style={{ marginTop: 0 }}>
          <StripStat label="Active builds" value={active.length} sub={<>{count('on_track')} on track · {count('at_risk')} at risk · {count('blocked', 'late')} blocked or late</>} />
          <StripStat label="Work blocked" tone={blockers.length ? 'orange' : ''} value={blockers.length} sub={`${blockedHours}h waiting · ${byReason('parts')} parts · ${byReason('vendor')} outside · ${byReason('customer')} customer`} />
          <StripStat label="Parts watch" tone={watch.length ? 'amber' : ''} value={watch.length} sub={`${inTransit} on the way · ${data.parts.filter((x) => x.status === 'needed').length} not yet ordered`} />
          <StripStat label="Labor booked" value={`${util}%`} spark={hoursTrend} sub="This week · hours logged, 14 days" />
          <StripStat label="Committed" value={budget ? `${Math.round((spent / budget) * 100)}%` : '—'} sub={`${money(spent)} of ${money(budget)}${nextDelivery ? ` · next delivery ${fmtDate(nextDelivery)}` : ''}`} />
        </div>
      </Card>

      <div className="section-t"><h2>In the shop</h2><span className="muted small">{freeBays.length ? `${freeBays.join(', ')} available` : 'All bays occupied'}</span></div>
      <div className="cards">
        {active.map((p) => <ProjectCard key={p.id} p={p} data={data} today={today} />)}
        {freeBays.map((bay) => (
          <Link key={bay} to="/projects" className="pcard free rise">
            <div className="eyebrow">{bay}</div>
            <div className="serif" style={{ fontSize: 24 }}>Available</div>
            <div className="small muted">Open and ready for the next car</div>
            <span className="btn sm"><Icon name="plus" size={13} />Start a job</span>
          </Link>
        ))}
      </div>

      {quotes.length > 0 && (
        <Card className="mt" title="Quotes awaiting approval" flush>
          {quotes.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="item">
              <span className="ico"><Icon name="user" /></span>
              <div className="grow"><div style={{ fontWeight: 500 }}>{carName(p)}</div><div className="small muted">{p.code} · {data.customers.find((c) => c.id === p.customerId)?.name} · {p.title}</div></div>
              <div className="small" style={{ textAlign: 'right' }}><div>{money(p.budget)} estimate</div><div className="muted">Starts {fmtDate(p.startDate)}</div></div>
            </Link>
          ))}
        </Card>
      )}

      <div className="grid g21 mt">
        <Card title="Waiting on" flush action={<span className="muted small">{blockers.length} blocked tasks</span>}>
          {blockers.length === 0 && <Empty>Nothing is blocked. The floor is moving.</Empty>}
          {blockers
            .map((b) => ({ b, t: data.tasks.find((t) => t.id === b.taskId)!, p: data.projects.find((p) => p.id === b.projectId)! }))
            .sort((x, y) => x.t.date.localeCompare(y.t.date))
            .slice(0, 6)
            .map(({ b, t, p }) => {
              const slip = b.eta ? diffDays(t.date, b.eta) : null;
              const overdue = !!b.eta && b.eta < today;
              return (
                <Link to={`/projects/${p.id}`} className="item" key={t.id}>
                  <span className={`ico ${b.reason}`}><Icon name={b.reason === 'parts' ? 'box' : b.reason === 'vendor' ? 'truck' : b.reason === 'customer' ? 'user' : 'lock'} /></span>
                  <div className="grow">
                    <div style={{ fontWeight: 500 }}>{b.label}</div>
                    <div className="small muted">{p.code} · {t.title} · needed {fmtDate(t.date)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }} className="small">
                    {b.eta ? <><div>ETA {fmtDate(b.eta)}</div><div className={overdue || slip! > 0 ? 'over' : 'ok'}>{overdue ? `${diffDays(b.eta, today)}d overdue` : slip! > 0 ? `${slip}d after needed` : 'in time'}</div></> : <div className="muted">{b.reason === 'customer' ? 'Needs customer' : 'No ETA'}</div>}
                  </div>
                </Link>
              );
            })}
          {blockers.length > 6 && <Link to="/schedule" className="item small muted" style={{ justifyContent: 'center' }}>+{blockers.length - 6} more blocked tasks · open schedule →</Link>}
        </Card>
        <Card title="Parts watchlist" flush action={<Link to="/parts" className="small muted">Open pipeline →</Link>}>
          {watch.length === 0 && <Empty>Every part is on time.</Empty>}
          {watch.slice(0, 6).map((x) => {
            const p = data.projects.find((y) => y.id === x.projectId)!;
            const gap = x.eta ? diffDays(x.neededBy, x.eta) : null;
            return (
              <div className="item" key={x.id} style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="row spread" style={{ flexWrap: 'nowrap' }}><span style={{ fontWeight: 500 }}>{x.name}</span><RiskPill r={partRisk(x, today)} /></div>
                  <div className="small muted">{p.code} · {x.supplier}{x.po ? ` · ${x.po}` : ''}</div>
                  <div className="small">Needed {fmtDate(x.neededBy)} · {x.eta ? <>ETA {fmtDate(x.eta)} {gap! > 0 && <span className="over">(+{gap}d)</span>}</> : <span className="over">{x.status === 'needed' ? 'not ordered' : 'no ETA'}</span>}</div>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      <div className="grid g21 mt">
        <Card title="Technician capacity" action={<span className="muted small">% of daily hours booked · next 10 working days</span>}>
          <div className="scroll"><div className="heat" style={{ gridTemplateColumns: `110px repeat(${days.length}, 1fr)` }}>
            <div className="c h" />{days.map((d) => <div key={d} className="c h">{fmtDay(d)}</div>)}
            {team.map((m) => (
              <div key={m.id} style={{ display: 'contents' }}>
                <div className="c h" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink2)', justifyContent: 'flex-start' }}><Avatar m={m} size={20} />{m.name.split(' ')[0]}</div>
                {days.map((d) => {
                  const pct = Math.round((dayLoad(data.tasks, m.id, d) / m.dailyHours) * 100);
                  const bg = pct === 0 ? undefined : pct > 100 ? 'var(--red)' : `color-mix(in srgb, var(--accent) ${Math.min(80, 14 + pct * 0.62)}%, transparent)`;
                  return <div key={d} className="c" style={{ background: bg, color: pct > 100 ? '#fff' : pct ? 'var(--ink)' : undefined }} title={`${m.name} · ${fmtDate(d)} · ${pct}%`}>{pct || ''}</div>;
                })}
              </div>
            ))}
          </div></div>
        </Card>
        <Card title="Today on the floor" flush>
          {todays.length === 0 && <Empty>Nothing scheduled today.</Empty>}
          {todays.slice(0, 6).map((t) => {
            const p = data.projects.find((x) => x.id === t.projectId)!;
            const blocked = blockers.some((b) => b.taskId === t.id);
            return (
              <div key={t.id} className="item" style={{ padding: '13px 22px' }}>
                <Avatar m={data.mechanics.find((m) => m.id === t.mechanicId)} size={30} />
                <div className="grow"><div style={{ fontWeight: 500 }}>{t.title}</div><div className="small muted">{p.code} · {t.estHours}h</div></div>
                {blocked ? <span className="pill orange"><i />Blocked</span> : t.status === 'in_progress' && <span className="pill blue"><i />Running</span>}
              </div>
            );
          })}
        </Card>
      </div>
    </>
  );
}
