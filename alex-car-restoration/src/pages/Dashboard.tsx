import { Link } from 'react-router-dom';
import ProjectCard from '../components/ProjectCard';
import { useState } from 'react';
import { Avatar, CarArt, Card, Empty, HealthBar, Icon, PulseTile, RiskPill, Ring, Seg, StripStat, carName } from '../components/ui';
import { shopPulse } from '../lib/pulse';
import { paintHex } from '../lib/paint';
import { addDays, diffDays, fmtDate, fmtDay, isWeekend, todayIso } from '../lib/dates';
import { SERVICES, SERVICE_KEYS, allBlockers, attFor, dayLoad, isOut, money, moneyC, partRisk, projectCosts, projectHealth, RISK_RANK, BAYS } from '../lib/logic';
import { useStore } from '../lib/store';
import type { ServiceType } from '../lib/types';

export default function Dashboard() {
  const { data } = useStore();
  const [svcFilter, setSvcFilter] = useState<'all' | ServiceType>('all');
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
  const pulse = shopPulse(data, today);

  return (
    <>
      <section className="hero rise">
        <div className="eyebrow" style={{ marginBottom: 14, position: 'relative', zIndex: 1 }}>{fmtDate(today)}</div>
        <h1>{greet}, <em>Alex.</em></h1>
        <div className="pulse">
          <div className="score" title="How the active jobs are doing, from on track to late">
            <Ring value={pulse.score} size={72} stroke={6} tone={pulse.tone === 'green' ? 'green' : pulse.tone === 'amber' ? 'amber' : 'red'} />
            <div><div className="eyebrow">Shop score</div><div className={`small ${pulse.tone === 'green' ? 'ok' : pulse.tone === 'amber' ? 'warn' : 'over'}`} style={{ fontWeight: 600 }}>{pulse.label}</div></div>
          </div>
          <PulseTile to="/projects" icon="car" value={pulse.active} label="In the shop" />
          <PulseTile to="/schedule" icon="lock" value={pulse.blockedTasks} label="Tasks blocked" tone={pulse.blockedTasks ? 'amber' : 'green'} />
          <PulseTile to="/parts" icon="box" value={pulse.overdueParts} label="Parts overdue" tone={pulse.overdueParts ? 'red' : 'green'} />
          <PulseTile to="/projects" icon="warn" value={pulse.needYou} label="Need you" tone={pulse.needYou ? 'red' : 'green'} />
        </div>
        <div className="row" style={{ marginTop: 26, position: 'relative', zIndex: 1 }}>
          <Link className="btn primary" to="/projects"><Icon name="plus" />New project</Link>
          <Link className="btn" to="/today"><Icon name="sun" />Today's snapshot</Link>
          <Link className="btn" to="/schedule"><Icon name="cal" />Open schedule</Link>
          <Link className="btn ghost" to="/parts">Parts pipeline <Icon name="arrow" size={14} /></Link>
        </div>
        {nextOut && (
          <Link to={`/projects/${nextOut.id}`} className="hart">
            {nextOut.photo ? <img className="photo" src={nextOut.photo} alt={carName(nextOut)} /> : <CarArt color={paintHex(nextOut)} car={nextOut} />}
            <div className="cap"><div className="eyebrow">Next out the door</div><div className="serif" style={{ fontSize: 22 }}>{carName(nextOut)}</div><div className="small muted">Target {fmtDate(nextOut.targetDate)}</div></div>
          </Link>
        )}
      </section>

      <Card className="mt rise">
        <div className="strip" style={{ marginTop: 0 }}>
          <StripStat label="Active builds" value={active.length} sub={<HealthBar {...pulse.health} />} />
          <StripStat label="Work blocked" tone={blockers.length ? 'orange' : ''} value={blockers.length} sub={`${blockedHours}h waiting`} />
          <StripStat label="Parts watch" tone={watch.length ? 'amber' : ''} value={watch.length} sub={`${inTransit} on the way`} />
          <StripStat label="Labor booked" value={`${util}%`} spark={hoursTrend} sub="This week" />
          <StripStat label="Committed" value={budget ? `${Math.round((spent / budget) * 100)}%` : '—'} sub={`${moneyC(spent)} of ${moneyC(budget)}`} />
        </div>
      </Card>

      <div className="section-t"><h2>In the shop</h2><span className="muted small">{freeBays.length ? `${freeBays.join(', ')} available` : 'All bays occupied'}</span></div>
      <div style={{ marginBottom: 14 }}>
        <Seg<'all' | ServiceType> value={svcFilter} onChange={setSvcFilter} options={[{ value: 'all', label: 'All services', count: active.length }, ...SERVICE_KEYS.map((k) => ({ value: k as 'all' | ServiceType, label: SERVICES[k].label, count: active.filter((p) => p.service === k).length }))]} />
      </div>
      <div className="cards">
        {active.filter((p) => svcFilter === 'all' || p.service === svcFilter).map((p) => <ProjectCard key={p.id} p={p} data={data} today={today} />)}
        {svcFilter === 'all' && freeBays.slice(0, 1).map((bay) => (
          <Link key={bay} to="/projects" className="pcard free rise">
            <div className="eyebrow">{bay}</div>
            <div className="serif" style={{ fontSize: 24 }}>Available</div>
            <div className="small muted">Ready for a car</div>
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
        <Card title="Waiting on" flush action={<span className="muted small">{blockers.length} blocked</span>}>
          {blockers.length === 0 && <Empty>Nothing blocked.</Empty>}
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
                    <div className="small muted">{p.code} · {t.title}</div>
                  </div>
                  <div style={{ textAlign: 'right' }} className="small">
                    {b.eta ? <><div>ETA {fmtDate(b.eta)}</div><div className={overdue || slip! > 0 ? 'over' : 'ok'}>{overdue ? `${diffDays(b.eta, today)}d late` : slip! > 0 ? `${slip}d late` : 'on time'}</div></> : <div className="muted">{b.reason === 'customer' ? 'Needs customer' : 'No ETA'}</div>}
                  </div>
                </Link>
              );
            })}
          {blockers.length > 6 && <Link to="/schedule" className="item small muted" style={{ justifyContent: 'center' }}>+{blockers.length - 6} more →</Link>}
        </Card>
        <Card title="Parts watchlist" flush action={<Link to="/parts" className="small muted">Open pipeline →</Link>}>
          {watch.length === 0 && <Empty>All parts on time.</Empty>}
          {watch.slice(0, 6).map((x) => {
            const p = data.projects.find((y) => y.id === x.projectId)!;
            const gap = x.eta ? diffDays(x.neededBy, x.eta) : null;
            return (
              <div className="item" key={x.id} style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="row spread" style={{ flexWrap: 'nowrap' }}><span style={{ fontWeight: 500 }}>{x.name}</span><RiskPill r={partRisk(x, today)} /></div>
                  <div className="small muted">{p.code} · {x.supplier}</div>
                  <div className="small">{x.eta ? <>ETA {fmtDate(x.eta)} {gap! > 0 && <span className="over">(+{gap}d)</span>}</> : <span className="over">{x.status === 'needed' ? 'not ordered' : 'no ETA'}</span>}</div>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      <div className="grid g21 mt">
        <Card title="Technician capacity" action={<span className="muted small">% booked, next 10 days</span>}>
          <div className="scroll"><div className="heat" style={{ gridTemplateColumns: `110px repeat(${days.length}, 1fr)` }}>
            <div className="c h" />{days.map((d) => <div key={d} className="c h">{fmtDay(d)}</div>)}
            {team.map((m) => (
              <div key={m.id} style={{ display: 'contents' }}>
                <div className="c h" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink2)', justifyContent: 'flex-start' }}><Avatar m={m} size={20} />{m.name.split(' ')[0]}</div>
                {days.map((d) => {
                  const rec = attFor(data.attendance, m.id, d);
                  if (isOut(rec)) return <div key={d} className="c out" title={`${m.name} · ${fmtDate(d)} · ${rec!.status === 'leave' ? 'on leave' : rec!.status === 'off' ? 'day off' : 'absent'}`}>OUT</div>;
                  const pct = Math.round((dayLoad(data.tasks, m.id, d) / m.dailyHours) * 100);
                  const bg = pct === 0 ? undefined : pct > 100 ? 'var(--red)' : `color-mix(in srgb, var(--arc) ${Math.min(46, 8 + pct * 0.38)}%, transparent)`;
                  return <div key={d} className="c" style={{ background: bg, color: pct > 100 ? '#fff' : pct ? 'var(--ink)' : undefined }} title={`${m.name} · ${fmtDate(d)} · ${pct}%`}>{pct || ''}</div>;
                })}
              </div>
            ))}
          </div></div>
        </Card>
        <Card title="Today on the floor" flush action={<Link to="/attendance" className="small muted">{team.filter((m) => attFor(data.attendance, m.id, today)?.timeIn).length} of {team.length} in →</Link>}>
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
