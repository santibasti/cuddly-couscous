import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SmsAction } from '../components/Sms';
import { Avatar, Card, Empty, Icon, Pill, StripStat } from '../components/ui';
import { fmtDate, todayIso } from '../lib/dates';
import { ATT_LABEL, attFor, fmtTime, money, moneyC, phaseLabel, taskBlocker, workedHours } from '../lib/logic';
import { dailySnapshot, snapshotText } from '../lib/snapshot';
import { ROLES, useRole } from '../lib/role';
import { useStore } from '../lib/store';
import type { Task } from '../lib/types';

const TONE = { present: 'green', late: 'amber', half: 'blue', absent: 'red', leave: 'violet', off: 'gray' } as const;

export default function Today() {
  const { data } = useStore();
  const { role } = useRole();
  const canText = ROLES[role].edit;
  const today = todayIso();
  const s = dailySnapshot(data, today);
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
  const proj = (id: string) => data.projects.find((p) => p.id === id)!;
  const text = snapshotText(s, data);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      setCopied('fail'); // clipboard blocked: the summary below is selectable instead
    }
    setTimeout(() => setCopied(''), 2500);
  }

  const taskState = (t: Task) => {
    const b = taskBlocker(t, data.parts);
    if (t.status === 'done') return { label: 'Done', tone: 'green' };
    if (b) return { label: 'Blocked', tone: 'orange' };
    if (t.status === 'in_progress') return { label: 'Running', tone: 'blue' };
    return { label: 'To start', tone: 'gray' };
  };
  const attention = s.parts.overdue.length + s.parts.orderNow.length + s.jobs.late.length + s.floor.blocked;
  const longDate = new Date(today + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Daily snapshot</div>
          <h1>{longDate}</h1>
          <div className="crew-today" aria-label="Who is in">
            {data.mechanics.filter((m) => m.active).map((m) => {
              const r = attFor(data.attendance, m.id, today);
              const st = !r ? 'none' : r.status === 'late' ? 'late' : r.timeIn || r.status === 'present' ? 'in' : 'out';
              return (
                <span key={m.id} className={`ct ${st}`} title={`${m.name}: ${r ? ATT_LABEL[r.status] : 'not in yet'}`}>
                  <Avatar m={m} size={38} /><i />
                  <em>{m.name.split(' ')[0]}</em>
                </span>
              );
            })}
          </div>
        </div>
        <button className="primary" onClick={copy}><Icon name="check" size={14} />{copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Select the text below' : 'Copy summary'}</button>
      </div>

      <Card>
        <div className="strip" style={{ marginTop: 0 }}>
          <StripStat label="In the shop" value={`${s.team.clockedIn.length}/${s.team.total}`} sub={s.team.notIn.length ? `${s.team.notIn.length} not in yet` : 'Everyone is in'} />
          <StripStat label="Tasks today" value={`${s.floor.done}/${s.floor.tasks.length}`} sub={`${s.floor.running} running`} />
          <StripStat label="Blocked" value={s.floor.blocked} tone={s.floor.blocked ? 'orange' : ''} sub="Waiting" />
          <StripStat label="Deliveries due" value={s.parts.arriving.length + s.parts.arrived.length} sub={s.parts.overdue.length ? `${s.parts.overdue.length} more overdue` : 'None overdue'} tone={s.parts.overdue.length ? 'amber' : ''} />
          <StripStat label="Received today" value={moneyC(s.money.total)} sub={s.money.payments.length ? `${s.money.payments.length} payment${s.money.payments.length > 1 ? 's' : ''}` : 'No payments'} />
        </div>
      </Card>

      <div className="grid g21 mt">
        <Card title="On the floor" flush action={<span className="muted small">{s.team.hoursSoFar}h clocked so far</span>}>
          {s.floor.byMechanic.length === 0 && <Empty>Nobody is scheduled today.</Empty>}
          {s.floor.byMechanic.map(({ mechanic: m, tasks }) => {
            const r = attFor(data.attendance, m.id, today);
            return (
              <div key={m.id} className="item" style={{ alignItems: 'flex-start' }}>
                <Avatar m={m} size={34} />
                <div className="grow">
                  <div className="row spread" style={{ flexWrap: 'nowrap' }}>
                    <span style={{ fontWeight: 500 }}>{m.name}</span>
                    {r ? <Pill tone={TONE[r.status]}>{ATT_LABEL[r.status]}{r.timeIn ? ` · ${fmtTime(r.timeIn)}` : ''}{r.timeOut ? ` – ${fmtTime(r.timeOut)}` : ''}</Pill> : <Pill>Not in yet</Pill>}
                  </div>
                  {tasks.length === 0 && <div className="small muted">Nothing booked today.</div>}
                  {tasks.map((t) => {
                    const st = taskState(t);
                    const b = taskBlocker(t, data.parts);
                    return (
                      <div key={t.id} className="small" style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0' }}>
                        <span className={`pill ${st.tone}`} style={{ flex: 'none' }}><i />{st.label}</span>
                        <span><Link to={`/projects/${t.projectId}`} style={{ color: 'var(--accent2)' }}>{proj(t.projectId).code}</Link> {t.title} <span className="muted">· {t.estHours}h{b ? ` · ${b.label}` : ''}</span></span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {s.floor.unassigned.length > 0 && <div className="item small warn">{s.floor.unassigned.length} task{s.floor.unassigned.length > 1 ? 's' : ''} today ha{s.floor.unassigned.length > 1 ? 've' : 's'} no mechanic.</div>}
        </Card>

        <div className="stack">
          <Card title="Parts & deliveries" flush>
            {[...s.parts.arriving, ...s.parts.arrived].length === 0 && s.parts.overdue.length === 0 && s.parts.orderNow.length === 0 && <Empty>Nothing due or overdue.</Empty>}
            {[...s.parts.arriving, ...s.parts.arrived].map((x) => (
              <div key={x.id} className="item"><span className="ico"><Icon name={x.kind === 'sublet' ? 'truck' : 'box'} /></span><div className="grow"><div style={{ fontWeight: 500 }}>{x.name}</div><div className="small muted">{x.supplier} · {proj(x.projectId).code}{x.note ? ` · ${x.note}` : ''}</div></div><Pill tone={x.status === 'received' ? 'green' : 'blue'}>{x.status === 'received' ? 'Arrived' : 'Due today'}</Pill></div>
            ))}
            {s.parts.overdue.map((x) => (
              <div key={x.id} className="item"><span className="ico red"><Icon name="warn" /></span><div className="grow"><div style={{ fontWeight: 500 }}>{x.name}</div><div className="small muted">{x.supplier} · {proj(x.projectId).code} · was due {x.eta ? fmtDate(x.eta) : '—'}</div></div><Pill tone="red">Overdue</Pill></div>
            ))}
            {s.parts.orderNow.map((x) => (
              <div key={x.id} className="item"><span className="ico orange"><Icon name="warn" /></span><div className="grow"><div style={{ fontWeight: 500 }}>{x.name}</div><div className="small muted">Needed {fmtDate(x.neededBy)} · {proj(x.projectId).code}</div></div><Pill tone="orange">Order now</Pill></div>
            ))}
          </Card>

          <Card title="Jobs" flush>
            {s.jobs.dueToday.length + s.jobs.late.length + s.jobs.phasesStarting.length + s.jobs.phasesEnding.length === 0 && <Empty>No deliveries or phase changes today.</Empty>}
            {s.jobs.dueToday.map((p) => <Link key={p.id} to={`/projects/${p.id}`} className="item"><span className="ico"><Icon name="car" /></span><div className="grow">{p.code} {p.make} {p.model}</div><Pill tone="blue">Delivery today</Pill></Link>)}
            {s.jobs.late.map(({ project: p, days }) => <Link key={p.id} to={`/projects/${p.id}`} className="item"><span className="ico red"><Icon name="car" /></span><div className="grow">{p.code} {p.make} {p.model}</div><Pill tone="red">{days}d late</Pill></Link>)}
            {s.jobs.phasesStarting.map(({ project: p, phase }) => <Link key={p.id + phase + 's'} to={`/projects/${p.id}`} className="item"><span className="ico"><Icon name="gantt" /></span><div className="grow">{p.code}: {phaseLabel(phase as never)} starts today</div></Link>)}
            {s.jobs.phasesEnding.map(({ project: p, phase }) => <Link key={p.id + phase + 'e'} to={`/projects/${p.id}`} className="item"><span className="ico amber"><Icon name="gantt" /></span><div className="grow">{p.code}: {phaseLabel(phase as never)} is due to finish today</div></Link>)}
          </Card>
        </div>
      </div>

      {(s.coating.noWash.length > 0 || s.coating.maintenance.length > 0) && (
        <Card className="mt" title="Coating follow-ups" flush action={<span className="muted small">Ceramic coating jobs</span>}>
          {s.coating.noWash.map((f) => (
            <Link key={f.project.id + 'w'} to={`/projects/${f.project.id}`} className="item">
              <span className="ico"><Icon name="warn" /></span>
              <div className="grow"><div style={{ fontWeight: 500 }}>{f.project.year} {f.project.make} {f.project.model}: keep it dry</div><div className="small muted">{f.project.code} · cured, do not wash until {fmtDate(f.date)}</div></div>
              <Pill tone="blue">{f.daysAway === 0 ? 'Last day' : `${f.daysAway} more day${f.daysAway > 1 ? 's' : ''}`}</Pill>
            </Link>
          ))}
          {s.coating.maintenance.map((f) => (
            <Link key={f.project.id + 'm'} to={`/projects/${f.project.id}`} className="item">
              <span className={`ico ${f.daysAway < 0 ? 'red' : 'amber'}`}><Icon name="clock" /></span>
              <div className="grow"><div style={{ fontWeight: 500 }}>{f.project.year} {f.project.make} {f.project.model}: free coating check</div><div className="small muted">{f.project.code} · {data.customers.find((c) => c.id === f.project.customerId)?.name} · due {fmtDate(f.date)}</div></div>
              <Pill tone={f.daysAway < 0 ? 'red' : 'amber'}>{f.daysAway < 0 ? `${-f.daysAway}d overdue` : f.daysAway === 0 ? 'Due today' : `In ${f.daysAway} days`}</Pill>
            </Link>
          ))}
        </Card>
      )}

      {(s.clients.pickups.length + s.clients.checkups.length + s.clients.birthdays.length > 0) && (
        <Card className="mt" title="Clients to contact" flush action={<span className="muted small">Demo texts only</span>}>
          {s.clients.pickups.map((p) => {
            const c = data.customers.find((x) => x.id === p.customerId);
            return (
              <div key={p.id + 'k'} className="item" style={{ flexWrap: 'wrap' }}>
                <span className="ico"><Icon name="car" /></span>
                <div className="grow"><Link to={`/projects/${p.id}`} style={{ fontWeight: 500 }}>{p.code} {p.make} {p.model}: ready for pickup</Link><div className="small muted">{c?.name} · all stages done, not out yet</div></div>
                {c && canText && <SmsAction customer={c} project={p} kind="ready" label="Notify client" />}
              </div>
            );
          })}
          {s.clients.checkups.map(({ project: p, daysAway }) => {
            const c = data.customers.find((x) => x.id === p.customerId);
            return (
              <div key={p.id + 'u'} className="item" style={{ flexWrap: 'wrap' }}>
                <span className={`ico ${daysAway < 0 ? 'red' : 'amber'}`}><Icon name="clock" /></span>
                <div className="grow"><Link to={`/projects/${p.id}`} style={{ fontWeight: 500 }}>{p.code} {p.make} {p.model}: check-up with the client</Link><div className="small muted">{c?.name} · {daysAway < 0 ? `${-daysAway} days overdue` : 'due today'}</div></div>
                {c && canText && <SmsAction customer={c} project={p} kind="checkup" label="Remind client" />}
              </div>
            );
          })}
          {s.clients.birthdays.map(({ customer: c, daysAway }) => (
            <div key={c.id + 'b'} className="item" style={{ flexWrap: 'wrap' }}>
              <span className="ico"><Icon name="user" /></span>
              <div className="grow"><Link to={role === 'leader' ? '/' : `/customers/${c.id}`} style={{ fontWeight: 500 }}>{c.name}: birthday {daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`}</Link></div>
              {canText && <SmsAction customer={c} kind="birthday" label="Send greeting" />}
            </div>
          ))}
        </Card>
      )}

      <div className="grid g2 mt">
        <Card title="Money received" flush>
          {s.money.payments.length === 0 && <Empty>No payments recorded today.</Empty>}
          {s.money.payments.map(({ project: p, payment: x }) => (
            <Link key={x.id} to={`/projects/${p.id}`} className="item"><span className="ico"><Icon name="check" /></span><div className="grow"><div style={{ fontWeight: 500 }}>{money(x.amount)}</div><div className="small muted">{p.code} {p.make} {p.model} · {x.note ?? 'Payment'}</div></div></Link>
          ))}
        </Card>
        <Card title="Updates posted today" flush>
          {s.updates.length === 0 && <Empty>No updates posted yet.</Empty>}
          {s.updates.map(({ project: p, update: u }) => (
            <Link key={u.id} to={`/projects/${p.id}`} className="item" style={{ alignItems: 'flex-start' }}><div className="grow"><div className="small muted">{p.code} · {u.author}{u.phaseKey ? ` · ${phaseLabel(u.phaseKey)}` : ''}</div><div>{u.text}</div></div></Link>
          ))}
        </Card>
      </div>

      <Card className="mt" title={`Heads-up for ${fmtDate(s.nextWorkday)}`}>
        <div className="row" style={{ gap: 28 }}>
          <div><div className="eyebrow">Tasks booked</div><div className="sv"><span>{s.tomorrow.tasks.length}</span></div></div>
          <div><div className="eyebrow">Blocked</div><div className={`sv ${s.tomorrow.blocked ? 'orange' : ''}`}><span>{s.tomorrow.blocked}</span></div></div>
          <div><div className="eyebrow">Deliveries expected</div><div className="sv"><span>{s.tomorrow.partsDue.length}</span></div></div>
          <div><div className="eyebrow">Need cover</div><div className={`sv ${s.tomorrow.gaps.length ? 'amber' : ''}`}><span>{s.tomorrow.gaps.length}</span></div></div>
        </div>
        {s.tomorrow.gaps.map((g) => <div key={g.task.id} className="small warn" style={{ marginTop: 8 }}>{g.task.title}: {g.mechanic.name} is {ATT_LABEL[g.record.status].toLowerCase()}. <Link to="/attendance" style={{ color: 'var(--accent2)' }}>Reassign →</Link></div>)}
      </Card>

      <details className="mt fold">
        <summary>Message-ready summary <span className="muted small">{attention ? `${attention} need attention` : 'all clear'}</span></summary>
        <pre className="snap-text">{text}</pre>
      </details>
    </>
  );
}
