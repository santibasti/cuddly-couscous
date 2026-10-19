import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, live } from '@/lib/store';
import { Badge, Card, Icon, PageHead, Tabs, attempt } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { JobForm } from '@/components/JobForm';
import { BackJobsTable } from '@/components/BackJobs';
import { OcularDetailModal, OcularFormModal, svcNames } from '@/components/Ocular';
import { moveJob } from '@/lib/actions';
import { addDays, departAt, placeLine, dow, eachDay, fmtDate, fmtTime, monthEnd, monthStart, money, today, weekStart } from '@/lib/util';
import type { Job, OcularVisit } from '@/lib/types';

type View = 'month' | 'week' | 'day' | 'list' | 'backjobs';
const STATUSES = ['Pending', 'Confirmed', 'Dispatch Checklist Pending', 'Dispatched', 'On Site', 'In Progress', 'Work Completed', 'Closed', 'Completed', 'Cancelled', 'Rescheduled'];
const chipClass = (s: string) => (['Dispatched', 'On Site', 'In Progress'].includes(s) ? 's-field' : ['Work Completed', 'Closed', 'Completed'].includes(s) ? 's-done' : s === 'Dispatch Checklist Pending' ? 's-Confirmed' : `s-${s}`);

const GLYPH: Record<string, string> = {
  pending: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
  confirmed: 'M8 12.5l2.7 2.7L16.5 9M12 3a9 9 0 100 18 9 9 0 000-18z',
  field: 'M3 16V8h11v8M14 11h4l3 3v2h-7M7 19a1.7 1.7 0 100-3.4A1.7 1.7 0 007 19zm10 0a1.7 1.7 0 100-3.4 1.7 1.7 0 000 3.4z',
  done: 'M5 12.5l4.5 4.5L19 7.5',
  ocular: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z',
  off: 'M6 6l12 12M18 6L6 18',
};
const kindOf = (s: string) => (['Dispatched', 'On Site', 'In Progress'].includes(s) ? 'field' : ['Work Completed', 'Closed', 'Completed'].includes(s) ? 'done' : s === 'Pending' ? 'pending' : ['Cancelled', 'Rescheduled'].includes(s) ? 'off' : 'confirmed');
function Glyph({ k }: { k: string }) { return <span className={`jg jg-${k}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={GLYPH[k]} /></svg></span>; }
const MAX_CHIPS = 3;

export default function Jobs() {
  const { db, can, user } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<View>(() => (window.innerWidth < 720 ? 'list' : 'month'));
  const [anchor, setAnchor] = useState(today());
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [leader, setLeader] = useState(''); const [showOff, setShowOff] = useState(false);
  const [form, setForm] = useState<{ start?: string; fromQuote?: string } | null>(null);
  const [ovForm, setOvForm] = useState<{ start?: string } | null>(null);
  const [ovOpen, setOvOpen] = useState<OcularVisit | null>(null);
  const mineOnly = !can('jobs.all');
  const myEmp = user?.employee_id;
  const edit = can('jobs.edit');
  const fromQuote = sp.get('fromQuote');
  useEffect(() => { if (fromQuote && edit) { setForm({ fromQuote }); sp.delete('fromQuote'); setSp(sp, { replace: true }); } }, [fromQuote]); // eslint-disable-line react-hooks/exhaustive-deps

  const jobs = useMemo(() => live(db.jobs).filter((j) => (!mineOnly || (myEmp && (j.leader_id === myEmp || j.crew_ids.includes(myEmp)))) && (!status || j.status === status) && (!leader || j.leader_id === leader)), [db.jobs, mineOnly, myEmp, status, leader]);
  const cn = (id: string) => db.clients.find((c) => c.id === id)?.name ?? '—';
  const leaders = live(db.employees).filter((e) => e.tier === 'Team Leader');

  const range = view === 'month' ? [weekStart(monthStart(anchor)), addDays(weekStart(addDays(monthEnd(anchor), 0)), 6)] : view === 'week' ? [weekStart(anchor), addDays(weekStart(anchor), 6)] : [anchor, anchor];
  const days = eachDay(range[0], range[1]);
  const step = (n: number) => setAnchor(view === 'month' ? addDays(monthStart(anchor), n > 0 ? 32 : -1) : addDays(anchor, n * (view === 'week' ? 7 : 1)));
  const title = view === 'month' ? new Date(anchor + 'T00:00:00Z').toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : view === 'week' ? `Week of ${fmtDate(range[0])}` : fmtDate(anchor);
  const showOv = can('ocular.view');
  const ovByDay = (d: string) => (showOv ? live(db.ocular_visits).filter((v) => v.start_at.startsWith(d) && v.status !== 'Cancelled' && (!mineOnly || v.assignee_id === myEmp)).sort((a, b) => a.start_at.localeCompare(b.start_at)) : []);
  const ovChip = (v: OcularVisit) => (
    <button key={v.id} type="button" className={`jchip k-ocular${v.status === 'Completed' || v.status === 'Converted to Quotation' ? ' done' : ''}`} onClick={(e) => { e.stopPropagation(); setOvOpen(v); }} title={`${v.number} · ${v.status}`}>
      <Glyph k="ocular" /><span className="jt"><span className="jl1"><b>{fmtTime(v.start_at)}</b><em>Ocular visit</em></span><span className="jl2">{cn(v.client_id)}</span></span>
    </button>
  );
  const isOff = (j: Job) => ['Cancelled', 'Rescheduled'].includes(j.status);
  const byDay = (d: string) => jobs.filter((j) => j.start_at.startsWith(d) && (showOff || !isOff(j))).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const [over, setOver] = useState<string | null>(null);
  const drop = (d: string, id: string) => {
    setOver(null);
    const j = db.jobs.find((x) => x.id === id); if (!j || j.start_at.startsWith(d)) return;
    attempt(() => moveJob(id, `${d}${j.start_at.slice(10)}`), `Rescheduled to ${fmtDate(d)}`);
  };
  const svcShort = (j: Job) => { const n = db.services.find((x) => x.code === j.service_codes[0])?.name ?? ''; return n.replace(/ Cleaning.*$/i, '').replace(/^Exterior\/Interior /, '').slice(0, 16); };
  const first = (id: string) => (db.employees.find((e) => e.id === id)?.full_name ?? '').replace(/^(Mr|Ms|Mrs)\.?\s+/i, '').split(' ')[0];
  const crewLine = (j: Job) => { const ids = [...(j.leader_id ? [j.leader_id] : []), ...j.crew_ids]; const shown = ids.slice(0, 4).map(first).filter(Boolean).join(', '); return ids.length ? shown + (ids.length > 4 ? ` +${ids.length - 4}` : '') : 'No crew yet'; };
  const where = (j: Job) => { const st = db.sites.find((x) => x.id === j.site_id); const cl = db.clients.find((x) => x.id === j.client_id); return placeLine(st?.address || cl?.address, st?.city ?? cl?.city, st?.province ?? cl?.province); };
  const carName = (j: Job) => db.assets.find((a) => a.id === j.vehicle_id)?.name ?? '';
  const chip = (j: Job) => (
    <Link key={j.id} to={`/jobs/${j.id}`} className={`jchip k-${kindOf(j.status)}`} draggable={edit && ['Pending', 'Confirmed', 'Dispatch Checklist Pending'].includes(j.status)} onDragStart={(e) => e.dataTransfer.setData('text/job', j.id)} title={`${j.number} · ${cn(j.client_id)} · ${j.status}\nTeam: ${[...(j.leader_id ? [j.leader_id] : []), ...j.crew_ids].map((id) => db.employees.find((e) => e.id === id)?.full_name ?? id).join(', ') || 'none yet'}\nVehicle: ${carName(j) || 'none'}`}>
      <Glyph k={kindOf(j.status)} /><span className="jt"><span className="jl1"><b>{fmtTime(j.start_at)}</b><em>{j.back_job_id ? '↩ Back job' : svcShort(j)}</em></span><span className="jl2">{cn(j.client_id)}</span>{where(j) && <span className="jl3">📍 {where(j)}</span>}<span className="jl3">👤 {crewLine(j)}</span>{carName(j) && <span className="jl3">🚚 {carName(j)}</span>}{j.depart_hq && <span className="jl3">🏢 Leave HQ {fmtTime(departAt(j)!)}</span>}</span>
    </Link>
  );
  const offCount = jobs.filter(isOff).length;
  const cellChips = (d: string) => {
    const all = [...byDay(d).map(chip), ...ovByDay(d).map(ovChip)];
    if (view === 'week' || all.length <= MAX_CHIPS + 1) return all;
    return [...all.slice(0, MAX_CHIPS), <button key="more" type="button" className="jmore" onClick={(e) => { e.stopPropagation(); setAnchor(d); setView('day'); }}>+{all.length - MAX_CHIPS} more</button>];
  };

  return (
    <>
      <PageHead icon="📅" stats={[
        { icon: '🗓️', label: 'Today', value: jobs.filter((j) => j.start_at.startsWith(today()) && !isOff(j)).length, sub: 'jobs scheduled', tone: 'blue' },
        { icon: '🚚', label: 'In the field', value: jobs.filter((j) => ['Dispatched', 'On Site', 'In Progress'].includes(j.status)).length, sub: 'dispatched or working', tone: 'green' },
        { icon: '⏳', label: 'Next 7 days', value: jobs.filter((j) => j.start_at.slice(0, 10) > today() && j.start_at.slice(0, 10) <= addDays(today(), 7) && !isOff(j)).length, sub: 'upcoming bookings', tone: 'teal' },
        { icon: '📋', label: 'This month', value: jobs.filter((j) => j.start_at.startsWith(today().slice(0, 7)) && !isOff(j)).length, sub: 'jobs booked', tone: 'gold' },
      ]} title="Jobs & booking calendar" sub={mineOnly ? 'Your assigned jobs' : 'Schedule, assign crews and equipment. Drag a job to another day to reschedule — double-bookings are blocked.'}>
        {can('ocular.schedule') && <button className="btn" onClick={() => setOvForm({})}><Icon name="plus" />Schedule ocular visit</button>}
        {edit && <button className="btn primary" onClick={() => setForm({})}><Icon name="plus" />Book a job</button>}
      </PageHead>
      <div className="row between" style={{ marginBottom: 12 }}>
        <Tabs tabs={[{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }, { id: 'day', label: 'Day' }, { id: 'list', label: 'List', count: jobs.length }, ...(can('backjobs.create') || can('backjobs.approve') || can('reports.ops') ? [{ id: 'backjobs' as View, label: 'Back jobs', count: db.back_jobs.filter((b) => !b.deleted_at && b.status !== 'Closed' && b.status !== 'Rejected').length || undefined }] : [])]} value={view} onChange={setView} />
      </div>

      {view === 'backjobs' && <BackJobsTable />}
      {view !== 'list' && view !== 'backjobs' && (
        <div className="row between no-print" style={{ marginBottom: 10 }}>
          <div className="row"><button className="btn sm" onClick={() => step(-1)} aria-label="Previous"><Icon name="chevL" /></button><button className="btn sm" onClick={() => setAnchor(today())}>Today</button><button className="btn sm" onClick={() => step(1)} aria-label="Next"><Icon name="chevR" /></button><h2 style={{ marginLeft: 8 }}>{title}</h2></div>
          <div className="row">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            {!mineOnly && <select value={leader} onChange={(e) => setLeader(e.target.value)} aria-label="Team leader"><option value="">All teams</option>{leaders.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}</select>}
          </div>
        </div>
      )}

      {(view === 'month' || view === 'week') && (
        <>
          <div className={`cal ${view === 'month' ? 'month' : 'week'}`}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="dh">{d}</div>)}
            {days.map((d) => (
              <div key={d} className={`cell${d === today() ? ' today' : ''}${view === 'month' && d.slice(0, 7) !== anchor.slice(0, 7) ? ' dim' : ''}${over === d ? ' over' : ''}${dow(d) === 0 ? ' dim' : ''}`}
                onDragOver={(e) => { if (edit) { e.preventDefault(); setOver(d); } }} onDragLeave={() => setOver((o) => (o === d ? null : o))} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/job'); if (id) drop(d, id); }}
                onDoubleClick={() => edit && setForm({ start: d })}>
                <div className="dn"><span className="dnum">{+d.slice(8)}</span>{byDay(d).length + ovByDay(d).length > 0 && <span className="dcount">{byDay(d).length + ovByDay(d).length}</span>}</div>
                {cellChips(d)}
              </div>
            ))}
          </div>
          <div className="jlegend">
            {([['pending', 'Pending'], ['confirmed', 'Confirmed'], ['field', 'In progress'], ['done', 'Completed']] as const).map(([k, l]) => <span key={k}><Glyph k={k} />{l}</span>)}
            {showOv && <span><Glyph k="ocular" />Ocular visit</span>}
            {offCount > 0 && <label className="check small"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show {offCount} cancelled / rescheduled</label>}
            <span className="muted small">Double-click a day to book · Drag a job to reschedule</span>
          </div>
        </>
      )}

      {view === 'day' && (
        <div className="grid g2">
          <Card title={`Jobs on ${fmtDate(anchor)}`} flush>
            <ul className="list">{byDay(anchor).map((j) => (
              <li key={j.id}><div><Link to={`/jobs/${j.id}`}><b>{fmtTime(j.start_at)} – {fmtTime(j.end_at)} · {j.number}</b></Link><div>{cn(j.client_id)} · {db.sites.find((s) => s.id === j.site_id)?.name}</div>{where(j) && <div className="small">📍 {where(j)}</div>}{j.depart_hq && <div className="small">🏢 Leave HQ {fmtTime(departAt(j)!)}</div>}
                <div className="small muted">Leader {db.employees.find((e) => e.id === j.leader_id)?.full_name ?? '—'} · crew {j.crew_ids.length} · {db.assets.find((a) => a.id === j.vehicle_id)?.name ?? 'no vehicle'}</div></div><Badge>{j.status}</Badge></li>
            ))}{!byDay(anchor).length && <li className="muted">Nothing scheduled.</li>}</ul>
          </Card>
          {showOv && ovByDay(anchor).length > 0 && (
            <Card title={`Ocular visits on ${fmtDate(anchor)}`} flush><ul className="list">{ovByDay(anchor).map((v) => (
              <li key={v.id} style={{ cursor: 'pointer' }} onClick={() => setOvOpen(v)}><div><b>👁 {fmtTime(v.start_at)} · {v.number}</b><div>{cn(v.client_id)} · {v.location}</div><div className="small muted">{svcNames(db, v.service_codes)} · {db.employees.find((e) => e.id === v.assignee_id)?.full_name ?? '—'}</div></div><Badge>{v.status}</Badge></li>
            ))}</ul></Card>
          )}
          <Card title="Resources committed that day" flush>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Resource</th><th>Assigned to</th></tr></thead><tbody>
              {(() => {
                const rows: [string, string][] = [];
                for (const j of byDay(anchor).filter((x) => !['Cancelled', 'Rescheduled'].includes(x.status))) {
                  for (const id of [...(j.leader_id ? [j.leader_id] : []), ...j.crew_ids]) rows.push([db.employees.find((e) => e.id === id)?.full_name ?? '', j.number]);
                  if (j.vehicle_id) rows.push([db.assets.find((a) => a.id === j.vehicle_id)?.name ?? '', j.number]);
                  for (const id of j.equipment_ids) rows.push([db.assets.find((a) => a.id === id)?.name ?? '', j.number]);
                }
                return rows.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>);
              })()}
            </tbody></table></div>
          </Card>
        </div>
      )}

      {view === 'list' && (
        <Card flush>
          <DataTable<Job> rows={jobs} rowKey={(j) => j.id} onRow={(j) => nav(`/jobs/${j.id}`)} exportTitle="Job list" initialSort={{ key: 'start', dir: -1 }}
            filters={<><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>{!mineOnly && <select value={leader} onChange={(e) => setLeader(e.target.value)} aria-label="Team leader"><option value="">All teams</option>{leaders.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}</select>}</>}
            cols={[
              { key: 'number', header: 'Job #', value: (j) => j.number },
              { key: 'start', header: 'Scheduled', value: (j) => j.start_at, render: (j) => <>{fmtDate(j.start_at)} <span className="muted">{fmtTime(j.start_at)}</span></> },
              { key: 'client', header: 'Client', value: (j) => cn(j.client_id) }, { key: 'site', header: 'Site', value: (j) => db.sites.find((s) => s.id === j.site_id)?.name ?? '' },
              { key: 'svc', header: 'Services', value: (j) => j.service_codes.map((c) => db.services.find((s) => s.code === c)?.name.split(' ')[0]).join(', ') },
              { key: 'leader', header: 'Leader', value: (j) => db.employees.find((e) => e.id === j.leader_id)?.full_name ?? '—' },
              ...(can('profit.view') ? [{ key: 'amt', header: 'Contract', num: true, type: 'money' as const, value: (j: Job) => j.contract_amount, render: (j: Job) => money(j.contract_amount) }] : []),
              { key: 'status', header: 'Status', value: (j) => j.status, render: (j) => <Badge>{j.status}</Badge> },
            ]} />
        </Card>
      )}
      {form && <JobForm defaultStart={form.start} fromQuoteId={form.fromQuote} onClose={() => setForm(null)} onSaved={(j) => nav(`/jobs/${j.id}`)} />}
      {ovForm && <OcularFormModal start={ovForm.start} onClose={() => setOvForm(null)} />}
      {ovOpen && <OcularDetailModal visit={ovOpen} onClose={() => setOvOpen(null)} />}
    </>
  );
}
