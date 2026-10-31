import { Link } from 'react-router-dom';
import { Avatar, Card, Empty, Icon, Pill, PulseTile, ServicePill, carName } from '../components/ui';
import { SmsAction } from '../components/Sms';
import { checkupsDue, missingItems, paidTotal, upcomingBirthdays } from '../lib/crm';
import { fmtDate, todayIso } from '../lib/dates';
import { ATT_LABEL, attFor, fmtTime, moneyC, phaseShort, projectProgress, taskBlocker } from '../lib/logic';
import { useRole } from '../lib/role';
import { dailySnapshot } from '../lib/snapshot';
import { useStore } from '../lib/store';
import type { Project } from '../lib/types';
import Dashboard from './Dashboard';

const TONE = { present: 'green', late: 'amber', half: 'blue', absent: 'red', leave: 'violet', off: 'gray' } as const;

/** The first page differs by role: the owner gets the shop overview, the advisor a list of things to do, the team leader today's crew. */
export default function Home() {
  const { role } = useRole();
  return role === 'advisor' ? <AdvisorHome /> : role === 'leader' ? <LeaderHome /> : <Dashboard />;
}

function Row({ to, icon, tone, title, sub, right }: { to: string; icon: string; tone?: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <Link to={to} className="item">
      <span className={`ico ${tone ?? ''}`}><Icon name={icon} /></span>
      <div className="grow"><div style={{ fontWeight: 500 }}>{title}</div>{sub && <div className="small muted">{sub}</div>}</div>
      {right}
    </Link>
  );
}

function AdvisorHome() {
  const { data } = useStore();
  const today = todayIso();
  const name = (p: Project) => data.customers.find((c) => c.id === p.customerId)?.name ?? '';
  const quotes = data.projects.filter((p) => p.status === 'quote');
  const open = data.projects.filter((p) => p.status === 'active' || p.status === 'completed');
  const ready = open.filter((p) => p.phases.every((ph) => ph.status === 'done') && !p.gatepass?.outOn);
  const notNotified = ready.filter((p) => !data.messages.some((m) => m.projectId === p.id && m.kind === 'ready'));
  const owing = open.filter((p) => p.phases.some((ph) => ph.status === 'done') && p.budget > paidTotal(p)).map((p) => ({ p, due: Math.round((p.budget * projectProgress(p, data.tasks)) / 100) - paidTotal(p) })).filter((x) => x.due > 0).sort((a, b) => b.due - a.due);
  const approvals = open.flatMap((p) => p.phases.filter((ph) => ph.status === 'done' && !ph.approvedBy).map((ph) => ({ p, ph })));
  const missing = open.filter((p) => p.status === 'active' && missingItems(p).length > 0);
  const checkups = checkupsDue(data, today, 3);
  const birthdays = upcomingBirthdays(data, today, 7);
  const total = quotes.length + notNotified.length + owing.length + approvals.length + missing.length + checkups.length + birthdays.length;
  const hr = new Date().getHours();

  return (
    <>
      <section className="hero rise">
        <div className="eyebrow" style={{ marginBottom: 14, position: 'relative', zIndex: 1 }}>{fmtDate(today)}</div>
        <h1>{hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}, <em>advisor.</em></h1>
        <div className="pulse">
          <PulseTile to="/projects" icon="user" value={quotes.length} label="Quotes waiting" tone={quotes.length ? 'amber' : 'green'} />
          <PulseTile to="/projects" icon="car" value={notNotified.length} label="Clients to notify" tone={notNotified.length ? 'amber' : 'green'} />
          <PulseTile to="/projects" icon="chart" value={owing.length} label="Balances due" tone={owing.length ? 'red' : 'green'} />
          <PulseTile to="/projects" icon="check" value={approvals.length} label="To approve" tone={approvals.length ? 'amber' : 'green'} />
        </div>
        <div className="row" style={{ marginTop: 22, position: 'relative', zIndex: 1 }}>
          <Link className="btn primary" to="/intake"><Icon name="plus" />New job</Link>
          <Link className="btn" to="/estimate"><Icon name="calc" />Estimate calculator</Link>
          <Link className="btn ghost" to="/customers">Customers <Icon name="arrow" size={14} /></Link>
        </div>
      </section>

      {total === 0 && <Card className="mt"><Empty>All clear. Nothing needs you right now.</Empty></Card>}

      <div className="grid g2 mt">
        <Card title="Quotes waiting" flush action={<span className="muted small">{quotes.length}</span>}>
          {quotes.length === 0 && <Empty>No open quotes.</Empty>}
          {quotes.map((p) => <Row key={p.id} to={`/projects/${p.id}`} icon="user" title={`${p.code} · ${carName(p)}`} sub={`${name(p)} · ${p.title}`} right={<span className="small num">{moneyC(p.budget)}</span>} />)}
        </Card>
        <Card title="Clients to notify" flush action={<span className="muted small">{notNotified.length}</span>}>
          {notNotified.length === 0 && <Empty>Nobody waiting for a text.</Empty>}
          {notNotified.map((p) => {
            const c = data.customers.find((x) => x.id === p.customerId);
            return <div key={p.id} className="item" style={{ flexWrap: 'wrap' }}><span className="ico"><Icon name="car" /></span><div className="grow"><Link to={`/projects/${p.id}`} style={{ fontWeight: 500 }}>{p.code} {p.make} {p.model} is ready</Link><div className="small muted">{c?.name}</div></div>{c && <SmsAction customer={c} project={p} kind="ready" label="Notify client" />}</div>;
          })}
        </Card>
        <Card title="Balances to collect" flush action={<span className="muted small">{owing.length}</span>}>
          {owing.length === 0 && <Empty>Everything is paid up to date.</Empty>}
          {owing.slice(0, 6).map(({ p, due }) => <Row key={p.id} to={`/projects/${p.id}`} icon="chart" tone="red" title={`${p.code} · ${carName(p)}`} sub={name(p)} right={<Pill tone="red">{moneyC(due)}</Pill>} />)}
        </Card>
        <Card title="Stages to approve" flush action={<span className="muted small">{approvals.length}</span>}>
          {approvals.length === 0 && <Empty>No stages waiting.</Empty>}
          {approvals.slice(0, 6).map(({ p, ph }) => <Row key={p.id + ph.key} to={`/projects/${p.id}`} icon="check" tone="amber" title={`${p.code} · ${phaseShort(ph.key)}`} sub={carName(p)} right={<ServicePill s={p.service} />} />)}
        </Card>
        <Card title="Missing from the car" flush action={<span className="muted small">{missing.length}</span>}>
          {missing.length === 0 && <Empty>Every car has its papers.</Empty>}
          {missing.map((p) => <Row key={p.id} to={`/projects/${p.id}`} icon="warn" tone="orange" title={`${p.code} · ${carName(p)}`} sub={missingItems(p).join(', ')} />)}
        </Card>
        <Card title="Client follow-up" flush action={<span className="muted small">{checkups.length + birthdays.length}</span>}>
          {checkups.length + birthdays.length === 0 && <Empty>No check-ups or birthdays soon.</Empty>}
          {checkups.map(({ project: p, daysAway }) => <Row key={p.id} to={`/projects/${p.id}`} icon="clock" tone={daysAway < 0 ? 'red' : 'amber'} title={`${p.code} · check-up`} sub={name(p)} right={<Pill tone={daysAway < 0 ? 'red' : 'amber'}>{daysAway < 0 ? `${-daysAway}d overdue` : daysAway === 0 ? 'Today' : `In ${daysAway}d`}</Pill>} />)}
          {birthdays.map(({ customer: c, daysAway }) => <Row key={c.id} to={`/customers/${c.id}`} icon="user" title={`${c.name}: birthday`} right={<Pill tone="blue">{daysAway === 0 ? 'Today' : `In ${daysAway}d`}</Pill>} />)}
        </Card>
      </div>
    </>
  );
}

function LeaderHome() {
  const { data } = useStore();
  const today = todayIso();
  const s = dailySnapshot(data, today);
  const proj = (id: string) => data.projects.find((p) => p.id === id)!;
  const hr = new Date().getHours();
  return (
    <>
      <section className="hero rise">
        <div className="eyebrow" style={{ marginBottom: 14, position: 'relative', zIndex: 1 }}>{fmtDate(today)}</div>
        <h1>{hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}, <em>team.</em></h1>
        <div className="pulse">
          <PulseTile to="/attendance" icon="user" value={`${s.team.clockedIn.length}/${s.team.total}`} label="Crew in" tone={s.team.clockedIn.length === s.team.total ? 'green' : 'amber'} />
          <PulseTile to="/schedule" icon="check" value={`${s.floor.done}/${s.floor.tasks.length}`} label="Tasks done" />
          <PulseTile to="/schedule" icon="lock" value={s.floor.blocked} label="Blocked" tone={s.floor.blocked ? 'amber' : 'green'} />
          <PulseTile to="/schedule" icon="clock" value={s.floor.running} label="Running now" />
        </div>
      </section>

      <div className="section-t"><h2>Crew today</h2><span className="muted small">Monitoring only</span></div>
      <div className="grid g3">
        {data.mechanics.filter((m) => m.active).map((m) => {
          const r = attFor(data.attendance, m.id, today);
          const tasks = s.floor.tasks.filter((t) => t.mechanicId === m.id);
          const hours = tasks.reduce((x, t) => x + t.estHours, 0);
          return (
            <Card key={m.id}>
              <div className="row spread" style={{ flexWrap: 'nowrap' }}>
                <div className="row" style={{ flexWrap: 'nowrap' }}><Avatar m={m} size={40} /><div><strong>{m.name}</strong><div className="small muted">{m.specialty}</div></div></div>
                {r ? <Pill tone={TONE[r.status]}>{ATT_LABEL[r.status]}{r.timeIn ? ` · ${fmtTime(r.timeIn)}` : ''}</Pill> : <Pill>Not in yet</Pill>}
              </div>
              <div className="small muted" style={{ margin: '12px 0 6px' }}>{tasks.length ? `${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${hours}h` : 'Nothing booked today'}</div>
              {tasks.map((t) => {
                const b = taskBlocker(t);
                const st = t.status === 'done' ? ['Done', 'green'] : b ? ['Blocked', 'orange'] : t.status === 'in_progress' ? ['Running', 'blue'] : ['To start', 'gray'];
                return <div key={t.id} className="small" style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0' }}><span className={`pill ${st[1]}`} style={{ flex: 'none' }}><i />{st[0]}</span><span><Link to={`/projects/${t.projectId}`} style={{ color: 'var(--accent2)' }}>{proj(t.projectId).code}</Link> {t.title}</span></div>;
              })}
            </Card>
          );
        })}
      </div>
    </>
  );
}
