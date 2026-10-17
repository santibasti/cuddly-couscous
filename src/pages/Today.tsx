// Happening today: a live board of every job going on today: where, for whom, the final billing, who is on site and who is absent,
// the vehicle used, and when the crew arrived at and left the site.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, live } from '@/lib/store';
import { Avatar } from '@/components/EmployeeCard';
import { PageHead, Stat } from '@/components/ui';
import { finalContract, invoiceBalance } from '@/lib/business';
import { fmtDate, fmtTime, money, nowLocal, today } from '@/lib/util';
import type { DB, Employee, Job, JobWorkflow } from '@/lib/types';

type Stage = 'scheduled' | 'late' | 'road' | 'onsite' | 'working' | 'finished' | 'left' | 'declined';
const STAGE: Record<Stage, { label: string; tone: string; icon: string }> = {
  scheduled: { label: 'Scheduled', tone: 'grey', icon: '🕒' }, late: { label: 'Not started yet', tone: 'amber', icon: '⏰' }, road: { label: 'On the way', tone: 'blue', icon: '🚚' },
  onsite: { label: 'Arrived on site', tone: 'teal', icon: '📍' }, working: { label: 'Working now', tone: 'green', icon: '🧽' }, finished: { label: 'Work finished', tone: 'navy', icon: '✅' },
  left: { label: 'Left the site', tone: 'navy', icon: '🏁' }, declined: { label: 'Client declined', tone: 'red', icon: '✖' },
};
const wall = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16));
const mins = (a?: string, b?: string) => (a && b ? Math.max(0, Math.round((wall(b) - wall(a)) / 60000)) : 0);
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

function stageOf(j: Job, w: JobWorkflow | undefined, now: string): Stage {
  if (w?.conf_mode === 'declined') return 'declined';
  if (w?.leave_at) return 'left'; if (w?.finish_at) return 'finished'; if (w?.start_at) return 'working'; if (w?.arr_at) return 'onsite'; if (w?.disp_at) return 'road';
  return now > j.start_at && j.start_at.slice(0, 10) === now.slice(0, 10) && wall(now) - wall(j.start_at) > 15 * 60000 ? 'late' : 'scheduled';
}

interface Member { emp: Employee; state: 'present' | 'absent' | 'expected'; reason?: string; clockIn?: string; leader: boolean }
function crewOf(db: DB, j: Job, w: JobWorkflow | undefined, day: string): Member[] {
  const ids = [...(j.leader_id ? [j.leader_id] : []), ...j.crew_ids.filter((x) => x !== j.leader_id)];
  const absent = new Map((w?.arr_crew_absent ?? []).map((a) => [a.id, a.reason]));
  return ids.map((id) => db.employees.find((e) => e.id === id)).filter((e): e is Employee => !!e).map((emp) => {
    const att = live(db.attendance).find((a) => a.employee_id === emp.id && a.date === day);
    const inField = !!att?.clock_in && (!att.job_id || att.job_id === j.id);
    const state: Member['state'] = absent.has(emp.id) || (att && ['Absent', 'Leave'].includes(att.kind)) ? 'absent' : w?.arr_crew_present?.includes(emp.id) || inField ? 'present' : 'expected';
    return { emp, state, reason: absent.get(emp.id) ?? (att && ['Absent', 'Leave'].includes(att.kind) ? att.kind : undefined), clockIn: att?.clock_in, leader: emp.id === j.leader_id };
  });
}

export default function Today() {
  const { db, can } = useAuth();
  const [now, setNow] = useState(nowLocal());
  useEffect(() => { const t = setInterval(() => setNow(nowLocal()), 30_000); return () => clearInterval(t); }, []);
  const day = now.slice(0, 10) || today();
  const showMoney = can('invoices.view');

  const cards = useMemo(() => live(db.jobs)
    .filter((j) => !['Cancelled', 'Rescheduled'].includes(j.status) && j.start_at.slice(0, 10) <= day && j.end_at.slice(0, 10) >= day)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .map((j) => {
      const w = live(db.workflows).find((x) => x.job_id === j.id);
      const client = db.clients.find((c) => c.id === j.client_id); const site = db.sites.find((s) => s.id === j.site_id);
      const car = db.assets.find((a) => a.id === j.vehicle_id);
      const fc = finalContract(db, j); const inv = live(db.invoices).find((i) => i.job_id === j.id && i.status === 'Approved');
      return { j, w, client, site, car, fc, inv, stage: stageOf(j, w, now), crew: crewOf(db, j, w, day) };
    }), [db, day, now]);

  const onSite = cards.filter((c) => ['onsite', 'working'].includes(c.stage)).length;
  const present = cards.reduce((a, c) => a + c.crew.filter((m) => m.state === 'present').length, 0);
  const absent = cards.reduce((a, c) => a + c.crew.filter((m) => m.state === 'absent').length, 0);
  const billing = cards.reduce((a, c) => a + c.fc.payableTotal, 0);

  return (
    <>
      <PageHead title={<>Happening today <span className="tdy-live"><i />LIVE</span></>} sub={`${fmtDate(day)} · updated ${fmtTime(now)} (Manila)`} />
      <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
        <Stat k="Jobs today" v={String(cards.length)} s={`${cards.filter((c) => ['left', 'finished'].includes(c.stage)).length} finished`} tone="navy" />
        <Stat k="On site right now" v={String(onSite)} s="Arrived, not yet left" tone={onSite ? 'good' : 'navy'} />
        <Stat k="Staff present · absent" v={`${present} · ${absent}`} s="Across today's jobs" tone={absent ? 'warn' : 'good'} />
        {showMoney ? <Stat k="Final billing today" v={money(billing)} s="Including approved additional work" tone="navy" /> : <Stat k="Not yet started" v={String(cards.filter((c) => ['scheduled', 'late'].includes(c.stage)).length)} s="Waiting to dispatch" tone="navy" />}
      </div>

      {!cards.length && <div className="card"><div className="empty" style={{ padding: 40, textAlign: 'center' }}>Nothing is scheduled for today.<div className="small muted">Jobs booked for today appear here as soon as they are on the calendar.</div></div></div>}
      <div className="tdy-grid">
        {cards.map(({ j, w, client, site, car, fc, inv, stage, crew }) => {
          const st = STAGE[stage];
          const stay = w?.arr_at ? mins(w.arr_at, w.leave_at ?? now) : 0;
          const steps: { k: string; t?: string }[] = [{ k: 'Left HQ', t: w?.disp_at }, { k: 'Arrived', t: w?.arr_at }, { k: 'Started', t: w?.start_at }, { k: 'Finished', t: w?.finish_at }, { k: 'Left site', t: w?.leave_at }];
          const addr = site?.address || client?.address || '';
          return (
            <article key={j.id} className={`tdy-card t-${st.tone}`}>
              <header>
                <div className="tdy-top">
                  <span className={`tdy-pill p-${st.tone}`}><b>{st.icon}</b> {st.label}</span>
                  <Link to={`/jobs/${j.id}`} className="tdy-num">{j.number}</Link>
                </div>
                <h3>{client?.name ?? '—'}{client?.vip && <span className="tdy-vip">⭐ VIP</span>}</h3>
                <div className="tdy-loc">📍 {site?.name ? <b>{site.name}</b> : null}{site?.name && addr ? ' · ' : ''}{addr || 'No address'} {addr && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer">Map ↗</a>}</div>
                <div className="tdy-svc">{j.service_codes.map((c) => db.services.find((s) => s.code === c)?.name ?? c).join(' · ')} <span>· scheduled {fmtTime(j.start_at)}–{fmtTime(j.end_at)}</span></div>
              </header>

              <div className="tdy-times">
                <div className="tdy-big"><small>Arrived</small><b>{w?.arr_at ? fmtTime(w.arr_at) : '—'}</b></div>
                <div className="tdy-big"><small>Left site</small><b>{w?.leave_at ? fmtTime(w.leave_at) : w?.arr_at ? 'still there' : '—'}</b></div>
                <div className="tdy-big"><small>Time on site</small><b>{stay ? dur(stay) : '—'}</b></div>
              </div>
              <ol className="tdy-steps">{steps.map((s) => <li key={s.k} className={s.t ? 'done' : ''}><i /><span>{s.k}</span><em>{s.t ? fmtTime(s.t) : ''}</em></li>)}</ol>

              <div className="tdy-sec">
                <div className="tdy-h"><span>Staff</span><span><b className="ok">{crew.filter((m) => m.state === 'present').length} present</b>{crew.some((m) => m.state === 'absent') && <b className="no"> · {crew.filter((m) => m.state === 'absent').length} absent</b>}{crew.some((m) => m.state === 'expected') && <b className="wait"> · {crew.filter((m) => m.state === 'expected').length} expected</b>}</span></div>
                <div className="tdy-crew">{crew.map((m) => (
                  <div key={m.emp.id} className={`tdy-m s-${m.state}`} title={`${m.emp.full_name}${m.reason ? ` — ${m.reason}` : ''}`}>
                    <Avatar emp={m.emp} size={38} /><div><b>{m.emp.full_name.split(' ')[0]}{m.leader ? ' ★' : ''}</b><small>{m.state === 'present' ? (m.clockIn ? `in ${fmtTime(m.clockIn)}` : 'present') : m.state === 'absent' ? `absent${m.reason && m.reason !== 'Absent' ? ` · ${m.reason}` : ''}` : 'expected'}</small></div>
                  </div>
                ))}{!crew.length && <span className="muted small">No crew assigned yet.</span>}</div>
              </div>

              <footer>
                <div className="tdy-car">🚚 <b>{car?.name ?? 'No vehicle'}</b>{car?.code ? <small> {car.code}</small> : null}</div>
                {showMoney && <div className="tdy-bill"><small>Final billing</small><b>{money(fc.payableTotal)}</b><em>{fc.variationsTotal > 0 ? `incl. ${money(fc.variationsTotal)} additional work` : 'incl. VAT'}{inv ? (invoiceBalance(db, inv) <= 0.005 ? ' · paid' : ` · invoiced ${inv.number}`) : ''}</em></div>}
              </footer>
            </article>
          );
        })}
      </div>
    </>
  );
}
