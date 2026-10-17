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

type Stage = 'scheduled' | 'late' | 'road' | 'onsite' | 'working' | 'finished' | 'left' | 'back' | 'declined';
const STAGE: Record<Stage, { label: string; tone: string; icon: string }> = {
  scheduled: { label: 'Scheduled', tone: 'grey', icon: '🕒' }, late: { label: 'Not started yet', tone: 'amber', icon: '⏰' }, road: { label: 'On the way', tone: 'blue', icon: '🚚' },
  onsite: { label: 'Arrived on site', tone: 'teal', icon: '📍' }, working: { label: 'Working now', tone: 'green', icon: '🧽' }, finished: { label: 'Work finished', tone: 'navy', icon: '✅' },
  left: { label: 'Heading back to HQ', tone: 'blue', icon: '🏁' }, back: { label: 'Back at HQ', tone: 'navy', icon: '🏠' }, declined: { label: 'Client declined', tone: 'red', icon: '✖' },
};
const wall = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16));
const mins = (a?: string, b?: string) => (a && b ? Math.max(0, Math.round((wall(b) - wall(a)) / 60000)) : 0);
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

function stageOf(j: Job, w: JobWorkflow | undefined, now: string): Stage {
  if (w?.conf_mode === 'declined') return 'declined';
  if (w?.hqa_at) return 'back'; if (w?.leave_at) return 'left'; if (w?.finish_at) return 'finished'; if (w?.start_at) return 'working'; if (w?.arr_at) return 'onsite'; if (w?.disp_at) return 'road';
  return now > j.start_at && j.start_at.slice(0, 10) === now.slice(0, 10) && wall(now) - wall(j.start_at) > 15 * 60000 ? 'late' : 'scheduled';
}

const MESSAGES = [
  'Every spotless window starts with a team that shows up. Thank you for showing up today.',
  'Kaya natin ‘to! Clean work, safe work, proud work.',
  'Quality is what the client remembers long after the job is done.',
  'Safety first, shine second. Everybody goes home safe today.',
  'Great teams make hard jobs look easy. That’s TopMop.',
  'Small details, big impressions. Take pride in every panel.',
  'Be the crew the client talks about. Be on time, be polite, be thorough.',
  'Your work makes a building look new again. That’s something to be proud of.',
  'Teamwork makes the long days short. Look out for each other.',
  'Salamat sa sipag at tiyaga! Every job done well builds our name.',
  'Check twice, clean once. Excellence is a habit.',
  'A smile and a clean finish. That’s how we earn the next booking.',
  'Hydrate, stretch, stay alert. A safe crew is a strong crew.',
  'Do it right the first time. Your effort shows in the shine.',
  'Today’s jobs are tomorrow’s referrals. Let’s make them count.',
];
const mood = (done: number, total: number, onSite: number, absent: number) =>
  !total ? 'A quiet day is a great time to prepare equipment and follow up with clients.'
  : done === total ? `All ${total} job${total === 1 ? '' : 's'} done today. Excellent work, team! 🎉`
  : onSite ? `${onSite} crew${onSite === 1 ? ' is' : 's are'} working on site right now. Keep up the great work!`
  : absent ? 'Some of the team is out today. Thank you to everyone covering. We’ve got this together.' : '';
function Motivation({ done, total, onSite, absent, now }: { done: number; total: number; onSite: number; absent: number; now: string }) {
  const slot = Math.floor(wall(now) / (30 * 60000)); const text = MESSAGES[slot % MESSAGES.length]; const extra = mood(done, total, onSite, absent);
  return (
    <div className="tdy-motiv" key={slot}>
      <span className="tdy-spark">✨</span>
      <div><b>{text}</b>{extra && <small>{extra}</small>}</div>
    </div>
  );
}

const TRUCK = 'M3 16V8h11v8M14 11h4l3 3v2h-7M7 19a1.7 1.7 0 100-3.4A1.7 1.7 0 007 19zm10 0a1.7 1.7 0 100-3.4 1.7 1.7 0 000 3.4z';
/** The trip as a road: HQ → site → work → back to HQ. The truck drives between stops while the crew is travelling and parks at the last stop reached. */
function Route({ w }: { w: JobWorkflow | undefined }) {
  const steps: { k: string; t?: string }[] = [{ k: 'Left HQ', t: w?.disp_at }, { k: 'Arrived', t: w?.arr_at }, { k: 'Started', t: w?.start_at }, { k: 'Finished', t: w?.finish_at }, { k: 'Left site', t: w?.leave_at }, { k: 'Reached HQ', t: w?.hqa_at }];
  let last = -1; steps.forEach((x, i) => { if (x.t) last = i; });
  const travelling = last === 0 || last === 4;                       // between HQ and the site, or back
  const pos = last < 0 ? 0 : travelling ? last + 0.5 : last;
  const back = last >= 4;
  const pct = (pos / (steps.length - 1)) * 100;
  return (
    <div className={`tdy-route${travelling ? ' moving' : ''}${last === 5 ? ' home' : ''}`}>
      <div className="rt-line"><div className="rt-fill" style={{ width: `${pct}%` }} />
        <span className={`rt-truck${back ? ' back' : ''}`} style={{ left: `${pct}%` }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={TRUCK} /></svg></span>
      </div>
      <ol className="tdy-steps">{steps.map((s, i) => <li key={s.k} className={s.t ? 'done' : ''}>{i === 0 || i === 5 ? <i className="hq">🏢</i> : i === 1 ? <i className="hq">📍</i> : <i />}<span>{s.k}</span><em>{s.t ? fmtTime(s.t) : ''}</em></li>)}</ol>
    </div>
  );
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
      <Motivation done={cards.filter((c) => ['back', 'declined'].includes(c.stage)).length} total={cards.length} onSite={onSite} absent={absent} now={now} />
      <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
        <Stat k="Jobs today" v={String(cards.length)} s={`${cards.filter((c) => ['left', 'finished', 'back'].includes(c.stage)).length} finished`} tone="navy" />
        <Stat k="On site right now" v={String(onSite)} s="Arrived, not yet left" tone={onSite ? 'good' : 'navy'} />
        <Stat k="Staff present · absent" v={`${present} · ${absent}`} s="Across today's jobs" tone={absent ? 'warn' : 'good'} />
        {showMoney ? <Stat k="Final billing today" v={money(billing)} s="Including approved additional work" tone="navy" /> : <Stat k="Not yet started" v={String(cards.filter((c) => ['scheduled', 'late'].includes(c.stage)).length)} s="Waiting to dispatch" tone="navy" />}
      </div>

      {!cards.length && <div className="card"><div className="empty" style={{ padding: 40, textAlign: 'center' }}>Nothing is scheduled for today.<div className="small muted">Jobs booked for today appear here as soon as they are on the calendar.</div></div></div>}
      <div className="tdy-grid">
        {cards.map(({ j, w, client, site, car, fc, inv, stage, crew }) => {
          const st = STAGE[stage];
          const stay = w?.arr_at ? mins(w.arr_at, w.leave_at ?? now) : 0;
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
              <Route w={w} />

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
