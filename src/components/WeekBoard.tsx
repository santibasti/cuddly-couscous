// Happening Today → This week: each day's activity and how every team and person performed, for a Monday–Sunday week.
import { useMemo } from 'react';
import { useAuth } from '@/lib/store';
import { Avatar, StarRating } from '@/components/EmployeeCard';
import { weekStats, type TeamStat } from '@/lib/weekly';
import { addDays, fmtDate, money, moneyShort, today } from '@/lib/util';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const tone = (s: number | null) => (s === null ? 'grey' : s >= 85 ? 'green' : s >= 65 ? 'amber' : 'red');
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m ? `${m}m` : '—');
const MEDAL = ['🥇', '🥈', '🥉'];

function Meter({ label, value, text, good }: { label: string; value: number | null; text: string; good?: boolean }) {
  return <div className="wk-meter"><div><span>{label}</span><b>{text}</b></div><i><u className={good === false ? 'bad' : ''} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></i></div>;
}

function TeamCard({ t, rank, money_ }: { t: TeamStat; rank: number; money_: boolean }) {
  const { db } = useAuth(); const leader = db.employees.find((e) => e.id === t.leaderId);
  const onPct = t.arrived ? Math.round((t.onTime / t.arrived) * 100) : null; const attPct = t.marked ? Math.round((t.present / t.marked) * 100) : null; const donePct = t.jobs ? Math.round((t.done / t.jobs) * 100) : 0;
  return (
    <article className={`wk-team t-${tone(t.score)}`}>
      <header>
        <span className="rk">{MEDAL[rank] ?? `#${rank + 1}`}</span>
        {leader && <Avatar emp={leader} size={46} />}
        <div className="nm"><b>{t.leader}</b><small>Team Leader · {t.crew.length} crew</small></div>
        <div className="sc" title="Team score: completion 30, on-time arrival 30, attendance 20, client rating 20"><b>{t.score ?? '—'}</b><small>score</small></div>
      </header>
      <Meter label="Jobs completed" value={donePct} text={`${t.done} / ${t.jobs}`} />
      <Meter label="Arrived on time" value={onPct} text={onPct === null ? 'no check-ins' : `${onPct}% (${t.onTime}/${t.arrived})`} good={onPct === null || onPct >= 70} />
      <Meter label="Crew attendance" value={attPct} text={attPct === null ? '—' : `${attPct}% present`} good={attPct === null || attPct >= 85} />
      <div className="wk-row"><span>Client rating</span>{t.rating === null ? <b className="muted">no ratings yet</b> : <span><StarRating value={t.rating} size={15} /> <b>{t.rating.toFixed(1)}</b> <small>({t.ratings})</small></span>}</div>
      <div className="wk-row"><span>Avg time on site</span><b>{dur(t.avgSiteMin)}</b></div>
      {t.backJobs > 0 && <div className="wk-row"><span>Back jobs</span><b style={{ color: '#ef5b5b' }}>{t.backJobs}</b></div>}
      {money_ && <div className="wk-row"><span>Billing handled</span><b>{money(t.billing)}</b></div>}
      {t.crew.length > 0 && <div className="wk-crew">{t.crew.map((n) => <span key={n}>{n.split(' ')[0]}</span>)}</div>}
    </article>
  );
}

export function WeekBoard({ anchor, setAnchor, day, onPickDay, showMoney }: { anchor: string; setAnchor: (d: string) => void; day: string; onPickDay: (d: string) => void; showMoney: boolean }) {
  const { db } = useAuth();
  const w = useMemo(() => weekStats(db, anchor), [db, anchor]);
  const T = today(); const thisWeek = w.from <= T && T <= w.to;
  const best = w.teams.find((t) => t.score !== null);
  const worstLate = [...w.people].sort((a, b) => b.lateMin - a.lateMin)[0];
  const maxJobs = Math.max(1, ...w.days.map((d) => d.jobs));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="wk-bar">
        <button className="btn sm" onClick={() => setAnchor(addDays(w.from, -7))} aria-label="Previous week">‹</button>
        <b>{fmtDate(w.from)} – {fmtDate(w.to)}</b>
        <button className="btn sm" onClick={() => setAnchor(addDays(w.from, 7))} aria-label="Next week">›</button>
        {!thisWeek && <button className="btn sm" onClick={() => setAnchor(T)}>This week</button>}
      </div>

      <div className="tdy-kpis">
        <div className="tdy-kpi k-blue"><span className="ic">🗓️</span><div className="kv"><small>Jobs this week</small><b>{w.totals.done} / {w.totals.jobs}</b><em>completed</em></div><i className="bar"><u style={{ width: `${w.totals.jobs ? (w.totals.done / w.totals.jobs) * 100 : 0}%` }} /></i></div>
        <div className="tdy-kpi k-green"><span className="ic">⏱️</span><div className="kv"><small>Arrived on time</small><b>{w.totals.onTimePct === null ? '—' : `${w.totals.onTimePct}%`}</b><em>within 15 min of the schedule</em></div></div>
        <div className="tdy-kpi k-teal"><span className="ic">👷</span><div className="kv"><small>Crew attendance</small><b>{w.totals.attendancePct === null ? '—' : `${w.totals.attendancePct}%`}</b><em>present at site check-in</em></div></div>
        {showMoney ? <div className="tdy-kpi k-gold"><span className="ic">💰</span><div className="kv"><small>Billing this week</small><b>{moneyShort(w.totals.billing)}</b><em>expected / final</em></div></div>
          : <div className="tdy-kpi k-gold"><span className="ic">⭐</span><div className="kv"><small>Client rating</small><b>{w.totals.rating === null ? '—' : w.totals.rating.toFixed(1)}</b><em>average</em></div></div>}
      </div>

      <section>
        <h3 className="wk-h">Day by day <small>tap a day to see its jobs</small></h3>
        <div className="wk-days">
          {w.days.map((d, i) => (
            <button key={d.date} type="button" className={`wk-day${d.date === day ? ' sel' : ''}${d.date === T ? ' today' : ''}${d.jobs === 0 ? ' empty' : ''}`} onClick={() => onPickDay(d.date)}>
              <span className="dw">{DOW[i]}</span><span className="dn">{+d.date.slice(8)}</span>
              <span className="bars"><u style={{ height: `${(d.jobs / maxJobs) * 100}%` }}><i style={{ height: d.jobs ? `${(d.done / d.jobs) * 100}%` : 0 }} /></u></span>
              <b>{d.jobs} job{d.jobs === 1 ? '' : 's'}</b>
              <small>{d.done} done</small>
              {showMoney && d.billing > 0 && <small className="mny">{moneyShort(d.billing)}</small>}
              <span className="chips">{d.present > 0 && <em className="g">👷 {d.present}</em>}{d.absent > 0 && <em className="r">✖ {d.absent}</em>}{d.late > 0 && <em className="a">⏰ {d.late}</em>}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="wk-h">Team performance {best && <small>🏆 Best this week: <b>{best.leader}</b> ({best.score})</small>}</h3>
        {w.teams.length ? <div className="wk-teams">{w.teams.map((t, i) => <TeamCard key={t.leaderId} t={t} rank={i} money_={showMoney} />)}</div> : <div className="card"><div className="empty" style={{ padding: 24, textAlign: 'center' }}>No jobs with a team leader this week.</div></div>}
        <div className="small muted" style={{ marginTop: 8 }}>Score = jobs completed (30) + arrived within 15 min (30) + crew attendance (20) + client rating (20). A part with no data yet is left out.</div>
      </section>

      <section>
        <h3 className="wk-h">Each person {worstLate && worstLate.lateMin > 0 && <small>Most late minutes: {worstLate.name} ({worstLate.lateMin} min)</small>}</h3>
        <div className="card"><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th className="num">Jobs</th><th className="num">Days present</th><th className="num">Absent</th><th className="num">Late days</th><th className="num">Late min</th><th>Client rating</th></tr></thead><tbody>
          {w.people.map((p) => <tr key={p.id}><td><b>{p.name}</b><div className="small muted">{p.position}</div></td><td className="num">{p.jobs}</td><td className="num">{p.daysPresent}</td><td className="num" style={p.absences ? { color: '#ef5b5b', fontWeight: 700 } : undefined}>{p.absences || '—'}</td><td className="num">{p.lateDays || '—'}</td><td className="num">{p.lateMin || '—'}</td><td>{p.rating === null ? <span className="muted">—</span> : <><StarRating value={p.rating} size={14} /> {p.rating.toFixed(1)}</>}</td></tr>)}
          {!w.people.length && <tr><td colSpan={7} className="muted" style={{ padding: 16 }}>No activity this week.</td></tr>}
        </tbody></table></div></div>
      </section>
    </div>
  );
}
