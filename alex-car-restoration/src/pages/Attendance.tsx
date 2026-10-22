import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Card, Empty, Icon, Pill, StripStat } from '../components/ui';
import { addDays, fmtDate, fmtDay, isWeekend, startOfWeek, todayIso } from '../lib/dates';
import { ATT_LABEL, attFor, attendanceSummary, coverageGaps, fmtTime, hoursBetween, isOut, nowHHMM, overtimeHours, toMin, workedHours } from '../lib/logic';
import { useStore } from '../lib/store';
import type { Attendance, AttendanceStatus, Mechanic } from '../lib/types';

const TONE: Record<AttendanceStatus, string> = { present: 'green', late: 'amber', half: 'blue', absent: 'red', leave: 'violet', off: 'gray' };
const STATUSES: AttendanceStatus[] = ['present', 'late', 'half', 'absent', 'leave', 'off'];

/** Hours worked so far for someone still clocked in. */
function liveHours(r: Attendance | undefined, now: string) {
  if (!r?.timeIn || r.timeOut) return workedHours(r);
  return hoursBetween(r.timeIn, toMin(now) > toMin(r.timeIn) ? now : r.timeIn);
}

export default function AttendancePage() {
  const { data, dispatch } = useStore();
  const today = todayIso();
  const now = nowHHMM();
  const [week, setWeek] = useState(startOfWeek(today));
  const [edit, setEdit] = useState<{ mechanicId: string; date: string } | null>(null);
  const team = data.mechanics.filter((m) => m.active);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const gaps = coverageGaps(data, today);
  const todayRec = (m: Mechanic) => attFor(data.attendance, m.id, today);
  const inNow = team.filter((m) => { const r = todayRec(m); return r?.timeIn && !r.timeOut; }).length;
  const weekEnd = addDays(week, 6) > today ? today : addDays(week, 6);
  const sums = team.map((m) => attendanceSummary(data.attendance, m, week, weekEnd));
  const lates = sums.reduce((s, x) => s + x.late, 0);
  const absences = sums.reduce((s, x) => s + x.absent, 0);
  const ot = Math.round(sums.reduce((s, x) => s + x.overtime, 0) * 10) / 10;
  const hours = Math.round(sums.reduce((s, x) => s + x.hours, 0) * 10) / 10;
  const attended = sums.reduce((s, x) => s + x.present + x.late + x.half, 0);
  const rate = attended + absences ? Math.round((attended / (attended + absences)) * 100) : null;

  const editing = edit ? { m: data.mechanics.find((x) => x.id === edit.mechanicId)!, rec: attFor(data.attendance, edit.mechanicId, edit.date) } : null;

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edit) return;
    const f = new FormData(e.currentTarget);
    dispatch({ type: 'setAttendance', mechanicId: edit.mechanicId, date: edit.date, status: f.get('status') as AttendanceStatus, timeIn: String(f.get('in') ?? ''), timeOut: String(f.get('out') ?? ''), note: String(f.get('note') ?? '').trim() });
    setEdit(null);
  }

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{fmtDate(today)} · {inNow} of {team.length} clocked in</div>
          <h1>Attendance</h1>
          <p>Clock mechanics in and out, record leave and absences, and see when someone being out leaves work uncovered.</p>
        </div>
      </div>

      <Card>
        <div className="strip" style={{ marginTop: 0 }}>
          <StripStat label="In the shop now" value={`${inNow}/${team.length}`} sub={`${team.filter((m) => !todayRec(m)).length} not in yet`} />
          <StripStat label="Attendance rate" value={rate === null ? '—' : `${rate}%`} sub="This week so far" tone={rate !== null && rate < 90 ? 'amber' : ''} />
          <StripStat label="Late arrivals" value={lates} sub="After 8:10 AM" tone={lates ? 'amber' : ''} />
          <StripStat label="Absences" value={absences} sub="Unplanned, this week" tone={absences ? 'red' : ''} />
          <StripStat label="Hours · overtime" value={`${hours}h`} sub={`${ot}h overtime`} />
        </div>
      </Card>

      <div className="section-t"><h2>Today</h2><span className="muted small">Shift starts 8:00 AM · 10 minute grace</span></div>
      <div className="cards att-today">
        {team.map((m) => {
          const r = todayRec(m);
          const clockedIn = !!r?.timeIn && !r.timeOut;
          return (
            <div key={m.id} className="card att-card rise">
              <div className="row spread" style={{ flexWrap: 'nowrap' }}>
                <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}><Avatar m={m} size={36} /><div><div style={{ fontWeight: 500 }}>{m.name}</div><div className="small muted">{m.specialty}</div></div></div>
                {r ? <Pill tone={TONE[r.status]}>{ATT_LABEL[r.status]}</Pill> : <Pill>Not in yet</Pill>}
              </div>
              <div className="att-times">
                <div><span>In</span><b>{r?.timeIn ? fmtTime(r.timeIn) : '—'}</b></div>
                <div><span>Out</span><b>{r?.timeOut ? fmtTime(r.timeOut) : '—'}</b></div>
                <div><span>Hours</span><b>{r?.timeIn ? `${liveHours(r, now)}h` : '—'}</b></div>
              </div>
              {r?.note && <div className="small muted">{r.note}</div>}
              <div className="row" style={{ gap: 8 }}>
                {!r?.timeIn && !isOut(r) && <button className="primary sm" onClick={() => dispatch({ type: 'clockIn', mechanicId: m.id, date: today, time: nowHHMM() })}><Icon name="clock" size={13} />Clock in</button>}
                {clockedIn && <button className="primary sm" onClick={() => dispatch({ type: 'clockOut', mechanicId: m.id, date: today, time: nowHHMM() })}><Icon name="clock" size={13} />Clock out</button>}
                <button className="sm" onClick={() => setEdit({ mechanicId: m.id, date: today })}>{r ? 'Edit' : 'Mark absent / leave'}</button>
              </div>
            </div>
          );
        })}
      </div>

      {gaps.length > 0 && (
        <Card className="mt" title="Coverage gaps" flush action={<Pill tone="orange">{gaps.length} to reassign</Pill>}>
          {gaps.map(({ task, mechanic, record }) => {
            const p = data.projects.find((x) => x.id === task.projectId)!;
            const free = team.filter((m) => m.id !== mechanic.id && !isOut(attFor(data.attendance, m.id, task.date)));
            return (
              <div className="item" key={task.id}>
                <span className="ico violet"><Icon name="user" /></span>
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>{task.title}</div>
                  <div className="small muted"><Link to={`/projects/${p.id}`}>{p.code}</Link> · {fmtDate(task.date)} · {task.estHours}h · {mechanic.name} is {ATT_LABEL[record.status].toLowerCase()}</div>
                </div>
                <select aria-label="Reassign" value="" onChange={(e) => e.target.value && dispatch({ type: 'updateTask', id: task.id, patch: { mechanicId: e.target.value } })}>
                  <option value="">Reassign to…</option>
                  {free.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button className="sm ghost" onClick={() => dispatch({ type: 'updateTask', id: task.id, patch: { date: addDays(task.date, isWeekend(addDays(task.date, 1)) ? 3 : 1) } })}>Push a day</button>
              </div>
            );
          })}
        </Card>
      )}

      <div className="section-t">
        <h2>Timesheet</h2>
        <div className="row">
          <button onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">←</button>
          <strong className="num" style={{ minWidth: 130, textAlign: 'center' }}>{fmtDate(week)} – {fmtDate(addDays(week, 6))}</strong>
          <button onClick={() => setWeek(addDays(week, 7))} aria-label="Next week">→</button>
          <button onClick={() => setWeek(startOfWeek(today))}>This week</button>
        </div>
      </div>
      <div className="scroll">
        <div className="att-grid">
          <div className="hd who">Mechanic</div>
          {days.map((d) => { const f = fmtDay(d); return <div key={d} className={`hd day ${d === today ? 'today' : ''}`}><span>{f.match(/[A-Za-z]+/)![0]}</span><b>{f.match(/\d+/)![0]}</b></div>; })}
          <div className="hd">Week</div>
          {team.map((m, i) => (
            <div key={m.id} style={{ display: 'contents' }}>
              <div className="who"><Avatar m={m} size={28} /><div><div style={{ fontWeight: 500 }}>{m.name.split(' ')[0]}</div><div className="small muted">{m.dailyHours}h shift</div></div></div>
              {days.map((d) => {
                const r = attFor(data.attendance, m.id, d);
                const future = d > today;
                return (
                  <button key={d} className={`acell ${r ? `s-${r.status}` : ''} ${d === today ? 'today' : ''} ${isWeekend(d) && !r ? 'wk' : ''}`} onClick={() => setEdit({ mechanicId: m.id, date: d })} title={r ? `${ATT_LABEL[r.status]}${r.note ? ` · ${r.note}` : ''}` : future ? 'Plan leave' : 'Add record'}>
                    {r ? (
                      <>
                        <span className="st">{ATT_LABEL[r.status]}</span>
                        {r.timeIn && <span className="tm">{fmtTime(r.timeIn).replace(' ', '')}{r.timeOut ? `–${fmtTime(r.timeOut).replace(' ', '')}` : ''}</span>}
                        {r.timeOut && <span className="hr">{workedHours(r)}h{overtimeHours(r, m) > 0 ? ` · +${overtimeHours(r, m)} OT` : ''}</span>}
                      </>
                    ) : <span className="plus">{isWeekend(d) ? '' : '+'}</span>}
                  </button>
                );
              })}
              <div className="wk-sum">
                <b>{sums[i].hours}h</b>
                <span className="small muted">{sums[i].present + sums[i].late + sums[i].half} days{sums[i].late ? ` · ${sums[i].late} late` : ''}{sums[i].absent ? ` · ${sums[i].absent} absent` : ''}{sums[i].leave ? ` · ${sums[i].leave} leave` : ''}</span>
                {sums[i].overtime > 0 && <span className="small warn">{sums[i].overtime}h overtime</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {team.length === 0 && <Empty>No active mechanics.</Empty>}

      {editing && edit && (
        <form className="card form f4 mt" key={`${edit.mechanicId}${edit.date}`} onSubmit={save}>
          <h2 className="full serif" style={{ fontSize: 22, fontFamily: 'var(--serif)' }}>{editing.m.name} · {fmtDate(edit.date)}</h2>
          <label>Status<select name="status" defaultValue={editing.rec?.status ?? (edit.date > today ? 'leave' : 'present')}>{STATUSES.map((s) => <option key={s} value={s}>{ATT_LABEL[s]}</option>)}</select></label>
          <label>Time in<input name="in" type="time" defaultValue={editing.rec?.timeIn ?? ''} /></label>
          <label>Time out<input name="out" type="time" defaultValue={editing.rec?.timeOut ?? ''} /></label>
          <label>Note<input name="note" placeholder="Sick, vacation, traffic…" defaultValue={editing.rec?.note ?? ''} /></label>
          <div className="row">
            <button className="primary" type="submit">Save</button>
            {editing.rec && <button type="button" onClick={() => { dispatch({ type: 'clearAttendance', mechanicId: edit.mechanicId, date: edit.date }); setEdit(null); }}>Clear record</button>}
            <button type="button" className="ghost" onClick={() => setEdit(null)}>Cancel</button>
          </div>
          <div className="full small muted">Times are only kept for Present, Late and Half day. Marking someone absent, on leave or off clears them.</div>
        </form>
      )}
    </>
  );
}
