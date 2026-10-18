// Happening today: a live board of every job going on today: where, for whom, the final billing, who is on site and who is absent,
// the vehicle used, and when the crew arrived at and left the site.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, live } from '@/lib/store';
import { Avatar } from '@/components/EmployeeCard';
import { WeekBoard } from '@/components/WeekBoard';
import { finalContract, invoiceBalance } from '@/lib/business';
import { departAt, fmtDate, fmtTime, money, nowLocal, today } from '@/lib/util';
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

const TEAM_MESSAGES = [
  'Every spotless window starts with a team that shows up. Thank you for showing up today.',
  'Kaya natin ‘to! Clean work, safe work, proud work.',
  'Safety first, shine second. Everybody goes home safe today.',
  'Great teams make hard jobs look easy. That’s TopMop.',
  'Be the crew the client talks about. Be on time, be polite, be thorough.',
  'Salamat sa sipag at tiyaga! Every job done well builds our name.',
];
const OWNER_MESSAGES = [
  'Every crew on the road today exists because you took the leap and built TopMop. Be proud of that.',
  'You are not just cleaning windows. You are creating jobs and putting food on your crew’s tables.',
  'Great companies are built one reliable day at a time. Today is another brick.',
  'Your standards set the tone. When you care about quality, the whole team learns to.',
  'Growth feels slow while you are in it. Look back a year and see how far TopMop has come.',
  'Salamat sa tiyaga, boss. The late nights and hard decisions are building something real.',
  'Lead with trust, check with systems. That is how a business grows beyond one person.',
  'Every repeat client is proof that your work and your people are trusted.',
  'Rest is part of the work too. A clear head makes better decisions than a tired one.',
  'Kaya mo ‘to. Hard days build the owner you will be proud of next year.',
  'A clean finish today is tomorrow’s referral. Your reputation is growing while you work.',
  'You built a system so the work runs even when you are not on every site. That is real leadership.',
  'Celebrate the small wins, a job done safely, a happy client, a crew member who grew.',
  'Your team watches how you handle pressure. Calm and clear is contagious.',
  'One more job done well is one more step toward the company you are building.',
];
const mood = (owner: boolean, done: number, total: number, onSite: number, absent: number, money: string) =>
  !total ? (owner ? 'No jobs today. A good day to follow up quotations and rest a little.' : 'A quiet day is a great time to prepare equipment and follow up with clients.')
  : done === total ? (owner ? `All ${total} job${total === 1 ? ' is' : 's are'} done today, about ${money} in billing. Well done, boss! 🎉` : `All ${total} job${total === 1 ? '' : 's'} done today. Excellent work, team! 🎉`)
  : onSite ? (owner ? `${onSite} crew${onSite === 1 ? ' is' : 's are'} out earning for TopMop right now — ${total} job${total === 1 ? '' : 's'} today, about ${money} expected to bill.` : `${onSite} crew${onSite === 1 ? ' is' : 's are'} working on site right now. Keep up the great work!`)
  : absent ? (owner ? 'Part of the team is out today, and the rest are covering. Remember to thank them.' : 'Some of the team is out today. Thank you to everyone covering.') : '';
/** Counts up to a number when it changes (whole numbers and pesos), so the board feels alive. */
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0); const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); from.current = target; return; }
    const start = performance.now(); const a = from.current; let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - start) / ms); const e = 1 - Math.pow(1 - k, 3); setV(a + (target - a) * e); if (k < 1) raf = requestAnimationFrame(tick); else from.current = target; };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
const greet = (now: string) => { const h = +now.slice(11, 13); return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
function Ring({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0; const r = 46, c = 2 * Math.PI * r; const n = useCountUp(done);
  return (
    <div className="tdy-ring" title={`${done} of ${total} jobs done`}>
      <svg viewBox="0 0 110 110"><circle cx="55" cy="55" r={r} className="bg" /><circle cx="55" cy="55" r={r} className="fg" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - pct) }} /></svg>
      <div><b>{Math.round(n)}<small>/{total}</small></b><span>jobs done</span></div>
    </div>
  );
}
function Hero({ name, owner, done, total, onSite, absent, money, now, day }: { name: string; owner: boolean; done: number; total: number; onSite: number; absent: number; money: string; now: string; day: string }) {
  const slot = Math.floor(wall(now) / (30 * 60000)); const list = owner ? OWNER_MESSAGES : TEAM_MESSAGES; const text = list[slot % list.length]; const extra = mood(owner, done, total, onSite, absent, money);
  return (
    <section className="tdy-hero">
      <div className="tdy-hero-l">
        <span className="tdy-live"><i />LIVE</span>
        <h1>{greet(now)}{name ? `, ${name}` : ''} <span className="wave">👋</span></h1>
        <p>{fmtDate(day)} · {fmtTime(now)} Manila time</p>
      </div>
      <blockquote className="tdy-quote" key={slot}>
        <span className="qm">“</span>
        <b>{text}</b>
        {extra && <small>{extra}</small>}
      </blockquote>
      <Ring done={done} total={total} />
    </section>
  );
}
function Kpi({ icon, label, value, sub, tone, fmt, bar }: { icon: string; label: string; value: number; sub: string; tone: string; fmt?: (n: number) => string; bar?: number }) {
  const n = useCountUp(value);
  return (
    <div className={`tdy-kpi k-${tone}`}>
      <span className="ic">{icon}</span>
      <div className="kv"><small>{label}</small><b>{fmt ? fmt(n) : Math.round(n)}</b><em>{sub}</em></div>
      {bar !== undefined && <i className="bar"><u style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%` }} /></i>}
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
  const { db, can, user } = useAuth();
  const [now, setNow] = useState(nowLocal());
  const [view, setView] = useState<'day' | 'week'>('day'); const [sel, setSel] = useState<string | null>(null); const [anchor, setAnchor] = useState(today());
  useEffect(() => { const t = setInterval(() => setNow(nowLocal()), 30_000); return () => clearInterval(t); }, []);
  const real = now.slice(0, 10) || today(); const day = sel ?? real;
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
  const doneCount = cards.filter((c) => ['back', 'declined'].includes(c.stage)).length;

  return (
    <>
      <Hero name={(user?.name ?? '').replace(/^(mr|ms|mrs)\.?\s+/i, '').split(' ')[0]} owner={user?.role === 'owner'} money={showMoney ? money(billing) : 'today’s work'} done={doneCount} total={cards.length} onSite={onSite} absent={absent} now={now} day={day} />
      <div className="wk-tabs" role="tablist">
        <button role="tab" aria-selected={view === 'day'} className={view === 'day' ? 'on' : ''} onClick={() => { setView('day'); }}>{day === real ? '⚡ Today' : `📅 ${fmtDate(day)}`}</button>
        <button role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'on' : ''} onClick={() => { setView('week'); setAnchor(day); }}>📊 This week &amp; team performance</button>
        {day !== real && view === 'day' && <button className="back" onClick={() => setSel(null)}>↩ Back to today</button>}
      </div>
      {view === 'week' && <WeekBoard anchor={anchor} setAnchor={setAnchor} day={day} onPickDay={(d) => { setSel(d === real ? null : d); setView('day'); }} showMoney={showMoney} />}
      {view === 'day' && <>
      <div className="tdy-kpis">
        <Kpi icon="🗓️" label={day === real ? "Jobs today" : "Jobs that day"} value={cards.length} sub={`${doneCount} finished`} tone="blue" bar={cards.length ? doneCount / cards.length : 0} />
        <Kpi icon="📍" label="On site right now" value={onSite} sub={onSite ? 'Crews working or arrived' : 'Nobody on site'} tone="green" bar={cards.length ? onSite / cards.length : 0} />
        <Kpi icon="👷" label="Staff present · absent" value={present} fmt={(n) => `${Math.round(n)} · ${absent}`} sub="Across today's jobs" tone={absent ? 'amber' : 'teal'} bar={present + absent ? present / (present + absent) : 0} />
        {showMoney ? <Kpi icon="💰" label="Expected billing today" value={billing} fmt={(n) => money(n)} sub="Quoted rate, may change once the work is counted" tone="gold" /> : <Kpi icon="⏳" label="Not yet started" value={cards.filter((c) => ['scheduled', 'late'].includes(c.stage)).length} sub="Waiting to dispatch" tone="gold" />}
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
                <div className="tdy-svc">{j.service_codes.map((c) => db.services.find((s) => s.code === c)?.name ?? c).join(' · ')} <span>{j.depart_hq && <>· leave HQ {fmtTime(departAt(j)!)} </>}· scheduled {fmtTime(j.start_at)}–{fmtTime(j.end_at)}</span></div>
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
                {showMoney && <div className="tdy-bill"><small>{w?.conf_at ? 'Final billing' : 'Expected billing'}</small><b>{money(fc.payableTotal)}</b><em>{w?.conf_at ? (fc.variationsTotal > 0 ? `incl. ${money(fc.variationsTotal)} additional work` : 'signed by the client · incl. VAT') : 'quoted rate · may change after the on-site count'}{inv ? (invoiceBalance(db, inv) <= 0.005 ? ' · paid' : ` · invoiced ${inv.number}`) : ''}</em></div>}
              </footer>
            </article>
          );
        })}
      </div>
      </>}
    </>
  );
}
