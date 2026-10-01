import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, PhotoInput, Stat, Tabs, attempt, ask, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { bulkApproveAttendance, clockIn, clockOut, decideAttendance, decideCorrection, manualAttendance, requestCorrection } from '@/lib/actions';
import { getGeo } from '@/lib/geo';
import { LIVE_JOB } from '@/lib/business';
import { addDays, dow, fmtDate, fmtStamp, fmtTime, nowLocal, today } from '@/lib/util';
import type { Attendance as Att, Employee } from '@/lib/types';

function Clock() {
  const [t, setT] = useState(nowLocal());
  useEffect(() => { const i = setInterval(() => setT(nowLocal()), 15000); return () => clearInterval(i); }, []);
  return <div className="time">{fmtTime(t)}</div>;
}

function MyClock({ emp }: { emp: Employee }) {
  const { db } = useAuth();
  const T = today();
  const rec = db.attendance.find((a) => a.employee_id === emp.id && a.date === T && !a.deleted_at);
  const [photo, setPhoto] = useState<string | undefined>();
  const [job, setJob] = useState('');
  const [busy, setBusy] = useState(false);
  const [corr, setCorr] = useState(false);
  const myJobs = live(db.jobs).filter((j) => j.start_at.startsWith(T) && LIVE_JOB.includes(j.status) && (j.leader_id === emp.id || j.crew_ids.includes(emp.id)));
  useEffect(() => { if (!job && myJobs[0]) setJob(myJobs[0].id); }, [myJobs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = live(db.attendance).filter((a) => a.employee_id === emp.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const state = rec?.clock_out ? 'out' : rec?.clock_in ? 'in' : 'none';
  const go = async (kind: 'in' | 'out') => {
    setBusy(true);
    const geo = await getGeo();
    if (geo.lat === undefined) attempt(() => { throw new Error('Location unavailable — clocking without GPS. Allow location access for verified attendance.'); });
    attempt(() => (kind === 'in' ? clockIn(emp.id, geo, photo, job || undefined) : clockOut(emp.id, geo, photo)), kind === 'in' ? 'Clocked in' : 'Clocked out');
    setPhoto(undefined); setBusy(false);
  };
  return (
    <div className="grid g2">
      <Card className="clock-card">
        <div className="muted">{fmtDate(T)} · Asia/Manila</div>
        <Clock />
        <div style={{ margin: '4px 0 14px' }}>
          {state === 'none' && <Badge tone="amber">Not clocked in</Badge>}
          {state === 'in' && <Badge tone="green">Clocked in at {fmtTime(rec!.clock_in)}{rec!.late_min > db.settings.grace_minutes ? ` • ${rec!.late_min} min late` : ''}</Badge>}
          {state === 'out' && <Badge tone="navy">Shift complete • {rec!.worked_hours} h</Badge>}
        </div>
        {state !== 'out' && (
          <div className="stack" style={{ maxWidth: 360, margin: '0 auto' }}>
            {state === 'none' && myJobs.length > 0 && <Field label="Job / site today"><select value={job} onChange={(e) => setJob(e.target.value)}>{myJobs.map((j) => <option key={j.id} value={j.id}>{j.number} – {db.sites.find((s) => s.id === j.site_id)?.name}</option>)}<option value="">Yard / office / standby</option></select></Field>}
            <div className="row" style={{ justifyContent: 'center' }}><PhotoInput label={photo ? 'Retake selfie' : 'Selfie (optional)'} capture="user" onAdd={(d) => setPhoto(d)} />{photo && <img src={photo} alt="selfie" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />}</div>
            {state === 'none' ? <button className="btn primary lg block" disabled={busy} onClick={() => go('in')}><Icon name="pin" />{busy ? 'Getting location…' : 'Clock in'}</button> : <button className="btn navy lg block" disabled={busy} onClick={() => go('out')}><Icon name="pin" />{busy ? 'Getting location…' : 'Clock out'}</button>}
            <div className="small muted">GPS location and timestamp are captured automatically.</div>
          </div>
        )}
        {state === 'out' && <div className="small muted">Attendance is pending approval by your team leader / manager.</div>}
      </Card>
      <Card title="My recent attendance" actions={<button className="btn sm" onClick={() => setCorr(true)}>Request correction</button>} flush>
        <ul className="list">{recent.map((a) => (
          <li key={a.id}><div><b>{fmtDate(a.date)}</b> <Flags a={a} emp={emp} /><div className="small muted">{a.kind === 'Present' ? `${fmtTime(a.clock_in)} – ${fmtTime(a.clock_out)} · ${a.worked_hours} h` : a.kind}</div></div><Badge>{a.approval}</Badge></li>
        ))}</ul>
      </Card>
      {corr && <CorrectionModal emp={emp} onClose={() => setCorr(false)} />}
    </div>
  );
}

function CorrectionModal({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const f = useObj({ date: addDays(today(), -1), cin: '08:00', cout: '17:00', reason: '' });
  return (
    <Modal title="Request attendance correction" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => requestCorrection({ employee_id: emp.id, date: f.v.date, clock_in: `${f.v.date}T${f.v.cin}`, clock_out: `${f.v.date}T${f.v.cout}`, reason: f.v.reason }), 'Correction submitted for approval')) onClose(); }}>Submit</button></>}>
      <div className="form-grid"><Field label="Date"><input type="date" max={today()} {...f.bind('date')} /></Field><span />
        <Field label="Correct clock-in"><input type="time" {...f.bind('cin')} /></Field><Field label="Correct clock-out"><input type="time" {...f.bind('cout')} /></Field>
        <Field label="Reason" required className="full"><textarea {...f.bind('reason')} /></Field></div>
    </Modal>
  );
}

function Flags({ a, emp }: { a: Att; emp: Employee }) {
  const { db } = useAuth();
  const hol = db.holidays.find((h) => h.date === a.date);
  return (
    <span className="row" style={{ gap: 4, display: 'inline-flex' }}>
      {a.kind !== 'Present' && <Badge>{a.kind}</Badge>}
      {a.late_min > db.settings.grace_minutes && <Badge tone="amber">Late {a.late_min}m</Badge>}
      {a.undertime_min > 0 && <Badge tone="amber">UT {a.undertime_min}m</Badge>}
      {a.ot_min > 0 && <Badge tone="teal">OT {a.ot_min / 60}h</Badge>}
      {hol && <Badge tone="blue">{hol.kind} holiday</Badge>}
      {dow(a.date) === emp.rest_day && a.clock_in && <Badge tone="blue">Rest day</Badge>}
      {a.field_work && <Badge tone="teal">Field work</Badge>}
    </span>
  );
}

export default function Attendance() {
  const { db, can, employee } = useAuth();
  const [sp, setSp] = useSearchParams();
  const canView = can('attendance.view');
  const [tab, setTab] = useState<'me' | 'daily' | 'corrections'>((sp.get('tab') as never) || (employee && can('attendance.own') && !canView ? 'me' : canView ? 'daily' : 'me'));
  const [date, setDate] = useState(today());
  const [manual, setManual] = useState(false);
  const approve = can('attendance.approve');
  const emps = live(db.employees).filter((e) => e.status !== 'inactive');
  const T = today();

  const rows = useMemo(() => {
    const atts = live(db.attendance).filter((a) => a.date === date);
    const hol = db.holidays.find((h) => h.date === date);
    return emps.map((e) => {
      const a = atts.find((x) => x.employee_id === e.id);
      const job = a?.job_id ? db.jobs.find((j) => j.id === a.job_id) : undefined;
      const site = job ? db.sites.find((s) => s.id === job.site_id)?.name ?? '' : a ? (a.clock_in ? 'Yard / office' : '—') : '—';
      return { e, a, site, isRest: dow(date) === e.rest_day, hol };
    });
  }, [db, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingCorr = live(db.corrections).filter((c) => c.status === 'Pending');
  const pendingAtt = rows.filter((r) => r.a?.approval === 'Pending' && r.a.clock_out);
  const present = rows.filter((r) => r.a?.clock_in).length;
  const late = rows.filter((r) => r.a && r.a.late_min > db.settings.grace_minutes).length;
  const missing = rows.filter((r) => !r.a && !r.isRest && !r.hol).length;

  return (
    <>
      <PageHead title="Attendance" sub="GPS-stamped clock in/out, approvals and corrections — approved records flow straight into payroll.">
        {approve && <button className="btn" onClick={() => setManual(true)}><Icon name="plus" />Manual entry</button>}
      </PageHead>
      <Tabs tabs={[...(employee && can('attendance.own') ? [{ id: 'me' as const, label: 'My clock' }] : []), ...(canView ? [{ id: 'daily' as const, label: 'Daily crew attendance' }, { id: 'corrections' as const, label: 'Corrections', count: pendingCorr.length }] : [])]} value={tab} onChange={(t) => { setTab(t); setSp({ tab: t }); }} />

      {tab === 'me' && employee && <MyClock emp={employee} />}
      {tab === 'me' && !employee && <div className="alert warn">Your user account is not linked to an employee record.</div>}

      {tab === 'daily' && canView && (
        <>
          <div className="grid g4 keep2" style={{ marginBottom: 12 }}>
            <Stat k="Present / clocked in" v={present} s={`of ${rows.filter((r) => !r.isRest).length} scheduled`} tone="good" /><Stat k="Late" v={late} tone={late ? 'warn' : undefined} />
            <Stat k="No record" v={date <= T ? missing : 0} tone={missing && date <= T ? 'bad' : undefined} /><Stat k="Awaiting approval" v={rows.filter((r) => r.a?.approval === 'Pending').length} tone="warn" />
          </div>
          <Card flush>
            <DataTable
              rows={rows} rowKey={(r) => r.e.id} exportTitle={`Daily attendance ${date}`} pageSize={25}
              filters={<><input type="date" value={date} max={T} onChange={(e) => setDate(e.target.value)} aria-label="Date" style={{ width: 'auto' }} /><button className="btn sm" onClick={() => setDate(addDays(date, -1))}>◀</button><button className="btn sm" onClick={() => setDate(addDays(date, 1))} disabled={date >= T}>▶</button></>}
              actions={approve && pendingAtt.length > 0 ? <button className="btn sm primary" onClick={() => { bulkApproveAttendance(pendingAtt.map((r) => r.a!.id)); }}><Icon name="check" />Approve {pendingAtt.length} completed</button> : undefined}
              cols={[
                { key: 'name', header: 'Employee', value: (r) => r.e.full_name, render: (r) => <div><b>{r.e.full_name}</b><div className="small muted">{r.e.position}</div></div> },
                { key: 'site', header: 'Job site', value: (r) => r.site },
                { key: 'in', header: 'In', value: (r) => r.a?.clock_in ? fmtTime(r.a.clock_in) : '—' }, { key: 'out', header: 'Out', value: (r) => r.a?.clock_out ? fmtTime(r.a.clock_out) : '—' },
                { key: 'hrs', header: 'Hours', num: true, value: (r) => r.a?.worked_hours ?? 0 },
                { key: 'flags', header: 'Indicators', value: (r) => (r.a ? [r.a.kind, r.a.late_min > db.settings.grace_minutes ? 'late' : '', r.a.ot_min ? 'overtime' : '', r.a.field_work ? 'field work' : ''].join(' ') : r.isRest ? 'Rest day' : r.hol ? 'Holiday' : 'No record'), render: (r) => r.a ? <Flags a={r.a} emp={r.e} /> : r.isRest ? <Badge tone="blue">Rest day</Badge> : r.hol ? <Badge tone="blue">{r.hol.kind} holiday</Badge> : date < T ? <Badge tone="red">Absent / no record</Badge> : <Badge tone="amber">Not in</Badge> },
                { key: 'gps', header: 'GPS', value: (r) => (r.a?.in_lat ? `${r.a.in_lat},${r.a.in_lng}` : ''), render: (r) => r.a?.in_lat ? <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${r.a.in_lat},${r.a.in_lng}`} onClick={(e) => e.stopPropagation()}>Map ↗</a> : r.a?.clock_in ? <span className="muted small">no GPS</span> : '—' },
                { key: 'selfie', header: 'Photo', noExport: true, sortable: false, render: (r) => r.a?.in_photo ? <img src={r.a.in_photo} alt="" width={28} height={28} style={{ borderRadius: 4, objectFit: 'cover' }} /> : '—' },
                { key: 'appr', header: 'Approval', value: (r) => r.a?.approval ?? '', render: (r) => r.a ? <Badge>{r.a.approval}</Badge> : '' },
                { key: 'actions', header: '', noExport: true, sortable: false, render: (r) => approve && r.a?.approval === 'Pending' ? <span className="row"><button className="btn sm primary" onClick={() => attempt(() => decideAttendance(r.a!.id, true))}>Approve</button><button className="btn sm" onClick={async () => { const n = await ask('Reject attendance', 'Reason'); if (n) attempt(() => decideAttendance(r.a!.id, false, n)); }}>Reject</button></span> : null },
              ]}
            />
          </Card>
        </>
      )}

      {tab === 'corrections' && canView && (
        <Card flush>
          <DataTable rows={live(db.corrections)} rowKey={(c) => c.id} exportTitle="Attendance corrections" initialSort={{ key: 'at', dir: -1 }} cols={[
            { key: 'emp', header: 'Employee', value: (c) => db.employees.find((e) => e.id === c.employee_id)?.full_name ?? '' }, { key: 'date', header: 'Date', value: (c) => c.date, render: (c) => fmtDate(c.date) },
            { key: 'time', header: 'Requested', value: (c) => `${fmtTime(c.clock_in)} – ${fmtTime(c.clock_out)}` }, { key: 'reason', header: 'Reason', value: (c) => c.reason },
            { key: 'at', header: 'Filed', value: (c) => c.created_at, render: (c) => fmtStamp(c.created_at) },
            { key: 'st', header: 'Status', value: (c) => c.status, render: (c) => <Badge>{c.status}</Badge> },
            { key: 'by', header: 'Decided by', value: (c) => db.users.find((u) => u.id === c.decided_by)?.name ?? '—' },
            { key: 'actions', header: '', noExport: true, sortable: false, render: (c) => approve && c.status === 'Pending' ? <span className="row"><button className="btn sm primary" onClick={() => attempt(() => decideCorrection(c.id, true), 'Correction approved & applied')}>Approve</button><button className="btn sm" onClick={async () => { const n = await ask('Reject correction', 'Reason'); if (n) attempt(() => decideCorrection(c.id, false, n)); }}>Reject</button></span> : null },
          ]} />
        </Card>
      )}
      {manual && <ManualModal onClose={() => setManual(false)} date={date} />}
    </>
  );
}

function ManualModal({ onClose, date }: { onClose: () => void; date: string }) {
  const { db } = useAuth();
  const f = useObj({ employee_id: db.employees.find((e) => e.status !== 'inactive')?.id ?? '', date, kind: 'Present' as Att['kind'], cin: '08:00', cout: '17:00', paid_leave: true, notes: '' });
  return (
    <Modal title="Manual attendance entry" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => manualAttendance({ employee_id: f.v.employee_id, date: f.v.date, kind: f.v.kind, clock_in: f.v.kind === 'Present' ? `${f.v.date}T${f.v.cin}` : undefined, clock_out: f.v.kind === 'Present' ? `${f.v.date}T${f.v.cout}` : undefined, paid_leave: f.v.kind === 'Leave' ? f.v.paid_leave : undefined, notes: f.v.notes }), 'Attendance recorded')) onClose(); }}>Save (auto-approved)</button></>}>
      <div className="form-grid">
        <Field label="Employee"><select {...f.bind('employee_id')}>{live(db.employees).filter((e) => e.status !== 'inactive').map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
        <Field label="Date"><input type="date" max={today()} {...f.bind('date')} /></Field>
        <Field label="Type"><select {...f.bind('kind')}>{['Present', 'Absent', 'Leave', 'Holiday', 'Rest Day'].map((k) => <option key={k}>{k}</option>)}</select></Field>
        {f.v.kind === 'Leave' && <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.v.paid_leave} onChange={(e) => f.set('paid_leave', e.target.checked)} />Paid leave</label>}
        {f.v.kind === 'Present' && <><Field label="Clock-in"><input type="time" {...f.bind('cin')} /></Field><Field label="Clock-out"><input type="time" {...f.bind('cout')} /></Field></>}
        <Field label="Notes" className="full"><input {...f.bind('notes')} /></Field>
      </div>
    </Modal>
  );
}
