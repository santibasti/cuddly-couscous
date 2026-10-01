import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, Stat, Tabs, attempt, ask, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { acknowledgeIncident, decideDepartureException, reportIncident, resolveIncident, startInvestigation, type IncidentOutcome } from '@/lib/dispatch';
import { AWAY_JOB, LIVE_JOB } from '@/lib/business';
import { addDays, fmtDate, fmtDateTime, fmtStamp, fmtTime, today } from '@/lib/util';
import type { Dispatch as DispatchT, IncidentReport, IncidentType, Job } from '@/lib/types';

const TYPES: IncidentType[] = ['Missing asset', 'Damaged asset', 'Vehicle damage', 'Material shortage', 'Missing PPE', 'Safety', 'Other'];

function ReportModal({ onClose }: { onClose: () => void }) {
  const { db } = useAuth();
  const f = useObj({ type: 'Other' as IncidentType, severity: 'Medium' as IncidentReport['severity'], job_id: '', asset_id: '', description: '' });
  return (
    <Modal title="Report an incident" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => reportIncident({ type: f.v.type, severity: f.v.severity, job_id: f.v.job_id || undefined, asset_id: f.v.asset_id || undefined, description: f.v.description }), 'Incident reported')) onClose(); }}>Submit report</button></>}>
      <div className="form-grid">
        <Field label="Type"><select {...f.bind('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Severity"><select {...f.bind('severity')}><option>Low</option><option>Medium</option><option>High</option></select></Field>
        <Field label="Related job"><select {...f.bind('job_id')}><option value="">—</option>{live(db.jobs).sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 60).map((j) => <option key={j.id} value={j.id}>{j.number}</option>)}</select></Field>
        <Field label="Related asset"><select {...f.bind('asset_id')}><option value="">—</option>{live(db.assets).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
        <Field label="What happened?" required className="full"><textarea {...f.bind('description')} /></Field>
      </div>
    </Modal>
  );
}

function ResolveModal({ inc, onClose }: { inc: IncidentReport; onClose: () => void }) {
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<IncidentOutcome>('other');
  return (
    <Modal title={`Resolve ${inc.number}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!text.trim()} onClick={() => { if (attempt(() => resolveIncident(inc.id, text, outcome), 'Incident resolved')) onClose(); }}>Resolve</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>{inc.description}</p>
      {inc.type === 'Missing asset' && <Field label="Outcome"><select value={outcome} onChange={(e) => setOutcome(e.target.value as IncidentOutcome)}><option value="found">Found — return the asset to stock</option><option value="written_off">Not found — write off (retire the asset)</option><option value="other">Other</option></select></Field>}
      <Field label="Resolution note" required><textarea value={text} onChange={(e) => setText(e.target.value)} /></Field>
    </Modal>
  );
}

export default function DispatchPage() {
  const { db, can, user } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState<'board' | 'history' | 'incidents'>((sp.get('tab') as never) || 'board');
  const [show, setShow] = useState(false);
  const [res, setRes] = useState<IncidentReport | null>(null);
  const T = today();
  const mineOnly = !can('jobs.all');
  const emp = user?.employee_id;
  const mine = (j: Job) => !mineOnly || (!!emp && (j.leader_id === emp || j.crew_ids.includes(emp)));
  const dpOf = (id: string) => db.dispatches.find((d) => d.job_id === id && !d.deleted_at);

  const board = live(db.jobs).filter((j) => mine(j) && (AWAY_JOB.includes(j.status) || j.status === 'Returned to HQ' || (LIVE_JOB.includes(j.status) && j.start_at.slice(0, 10) <= addDays(T, 3) && j.start_at.slice(0, 10) >= addDays(T, -2)))).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const exceptions = live(db.dispatches).filter((d) => d.dep_exception_status === 'Pending');
  const history = live(db.dispatches).filter((d) => d.stage === 'Returned' && (!mineOnly || mine(db.jobs.find((j) => j.id === d.job_id)!))).sort((a, b) => (b.ret_at ?? '').localeCompare(a.ret_at ?? ''));
  const incidents = live(db.incidents).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const openInc = incidents.filter((i) => ['Open', 'Investigating'].includes(i.status));
  const cn = (id: string) => db.clients.find((c) => c.id === id)?.name ?? '—';
  const issues = (d: DispatchT) => d.items.filter((i) => i.ret_condition === 'Damaged' || i.ret_condition === 'Missing' || (i.kind !== 'material' && (i.loaded_qty ?? 0) > (i.returned_qty ?? 0))).length;

  return (
    <>
      <PageHead title="Dispatch & Return Checklist" sub="Departure → arrival → return checklists for every job: QR-verified equipment, vehicle fuel & odometer, GPS, photos, and automatic incident reports.">
        {(can('dispatch.run') || can('incidents.manage')) && <button className="btn" onClick={() => setShow(true)}><Icon name="alert" />Report incident</button>}
        {can('assets.view') && <Link to="/assets?labels=1" className="btn">Print QR labels</Link>}
      </PageHead>
      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        <Stat k="Checklist pending" v={board.filter((j) => ['Confirmed', 'Dispatch Checklist Pending'].includes(j.status) && j.start_at.startsWith(T)).length} s="jobs today" tone="warn" />
        <Stat k="Dispatched / on site" v={board.filter((j) => ['Departed from HQ', 'Arrived at Site', 'In Progress'].includes(j.status)).length} s={`${board.filter((j) => ['Work Completed', 'Return Checklist Pending'].includes(j.status)).length} awaiting return`} tone="navy" />
        <Stat k="Returned (7 days)" v={history.filter((d) => (d.ret_at ?? '') >= addDays(T, -7)).length} tone="good" />
        <Stat k="Open incidents" v={openInc.length} tone={openInc.length ? 'bad' : 'good'} />
      </div>
      {can('dispatch.approve') && exceptions.length > 0 && (
        <div className="alert warn" style={{ marginBottom: 12 }}><b>{exceptions.length} departure exception(s) awaiting approval</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{exceptions.map((d) => { const j = db.jobs.find((x) => x.id === d.job_id); return <li key={d.id}><Link to={`/dispatch/${d.job_id}`}>{j?.number}</Link> — “{d.dep_exception_reason}” <span className="row" style={{ display: 'inline-flex', marginLeft: 8 }}><button className="btn sm primary" onClick={() => attempt(() => decideDepartureException(d.id, true, ''), 'Exception approved')}>Approve</button><button className="btn sm danger" onClick={async () => { const n = await ask('Reject exception', 'Reason'); if (n) attempt(() => decideDepartureException(d.id, false, n), 'Exception rejected'); }}>Reject</button></span></li>; })}</ul></div>
      )}
      <Tabs tabs={[{ id: 'board', label: 'Dispatch board', count: board.length }, { id: 'history', label: 'Completed returns', count: history.length }, { id: 'incidents', label: 'Incidents', count: openInc.length }]} value={tab} onChange={(t) => { setTab(t); setSp({ tab: t }, { replace: true }); }} />

      {tab === 'board' && (
        <Card flush><DataTable<Job> rows={board} rowKey={(j) => j.id} onRow={(j) => nav(`/dispatch/${j.id}`)} exportTitle="Dispatch board" cols={[
          { key: 'n', header: 'Job', value: (j) => j.number, render: (j) => <b>{j.number}</b> }, { key: 's', header: 'Scheduled', value: (j) => j.start_at, render: (j) => `${fmtDate(j.start_at)} ${fmtTime(j.start_at)}` },
          { key: 'c', header: 'Client / site', value: (j) => cn(j.client_id), render: (j) => <div>{cn(j.client_id)}<div className="small muted">{db.sites.find((s) => s.id === j.site_id)?.name}</div></div> },
          { key: 'l', header: 'Leader', value: (j) => db.employees.find((e) => e.id === j.leader_id)?.full_name ?? '—' },
          { key: 'v', header: 'Vehicle', value: (j) => db.assets.find((a) => a.id === j.vehicle_id)?.name ?? '—' },
          { key: 'it', header: 'Checklist', value: (j) => { const d = dpOf(j.id); return d ? `${d.items.filter((i) => i.out_ok).length}/${d.items.length}` : 'Not started'; }, render: (j) => { const d = dpOf(j.id); return d ? <span>{d.items.filter((i) => i.out_ok).length}/{d.items.length}{d.dep_exception_status === 'Pending' && <> <Badge tone="amber">exception</Badge></>}</span> : <span className="muted">Not started</span>; } },
          { key: 'st', header: 'Job status', value: (j) => j.status, render: (j) => <Badge>{j.status}</Badge> },
          { key: 'actions', header: '', sortable: false, noExport: true, render: (j) => <Link className="btn sm primary" to={`/dispatch/${j.id}`} onClick={(e) => e.stopPropagation()}>{['Confirmed', 'Dispatch Checklist Pending'].includes(j.status) ? 'Dispatch' : ['Work Completed', 'Return Checklist Pending'].includes(j.status) ? 'Return' : 'Open'}</Link> },
        ]} /></Card>
      )}

      {tab === 'history' && (
        <Card flush><DataTable<DispatchT> rows={history} rowKey={(d) => d.id} onRow={(d) => nav(`/dispatch/${d.job_id}`)} exportTitle="Dispatch & return history" pageSize={15} cols={[
          { key: 'j', header: 'Job', value: (d) => db.jobs.find((j) => j.id === d.job_id)?.number ?? '' }, { key: 'c', header: 'Client', value: (d) => cn(db.jobs.find((j) => j.id === d.job_id)?.client_id ?? '') },
          { key: 'dep', header: 'Departed', value: (d) => d.dep_at ?? '', render: (d) => fmtDateTime(d.dep_at) }, { key: 'arr', header: 'Arrived', value: (d) => d.arr_at ?? '', render: (d) => fmtTime(d.arr_at) }, { key: 'ret', header: 'Returned', value: (d) => d.ret_at ?? '', render: (d) => fmtTime(d.ret_at) },
          { key: 'fuel', header: 'Fuel', value: (d) => `${d.dep_fuel ?? ''} → ${d.ret_fuel ?? ''}` }, { key: 'km', header: 'Distance (km)', num: true, value: (d) => d.distance_km ?? 0 },
          { key: 'iss', header: 'Issues', num: true, value: issues, render: (d) => (issues(d) ? <Badge tone="red">{issues(d)}</Badge> : <Badge tone="green">None</Badge>) },
        ]} /></Card>
      )}

      {tab === 'incidents' && (
        <Card flush><DataTable<IncidentReport> rows={incidents} rowKey={(i) => i.id} exportTitle="Incident reports" initialSort={{ key: 'at', dir: -1 }} pageSize={15} cols={[
          { key: 'n', header: 'No.', value: (i) => i.number }, { key: 'at', header: 'Raised', value: (i) => i.created_at, render: (i) => fmtStamp(i.created_at) },
          { key: 't', header: 'Type', value: (i) => i.type, render: (i) => <span className="row" style={{ gap: 4 }}><Badge tone="blue">{i.type}</Badge>{i.auto && <Badge tone="gray">auto</Badge>}</span> },
          { key: 'sev', header: 'Severity', value: (i) => i.severity, render: (i) => <Badge>{i.severity}</Badge> },
          { key: 'job', header: 'Job', value: (i) => db.jobs.find((j) => j.id === i.job_id)?.number ?? '', render: (i) => (i.job_id ? <Link to={`/dispatch/${i.job_id}`} onClick={(e) => e.stopPropagation()}>{db.jobs.find((j) => j.id === i.job_id)?.number}</Link> : '—') },
          { key: 'asset', header: 'Asset', value: (i) => db.assets.find((a) => a.id === i.asset_id)?.code ?? '' }, { key: 'd', header: 'Description', value: (i) => i.description },
          { key: 'tk', header: 'Ticket', value: (i) => (i.ticket_id ? 'Linked' : ''), render: (i) => (i.ticket_id ? <Link to="/assets?tab=maint" onClick={(e) => e.stopPropagation()}>Repair ticket</Link> : '—') },
          { key: 'st', header: 'Status', value: (i) => i.status, render: (i) => <span>{i.status === 'Resolved' ? <Badge tone="green">Resolved</Badge> : <Badge tone={i.status === 'Open' ? 'red' : 'amber'}>{i.status}</Badge>}{i.resolution && <div className="small muted">{i.resolution}</div>}</span> },
          { key: 'actions', header: '', sortable: false, noExport: true, render: (i) => can('incidents.manage') && i.status !== 'Resolved' ? <span className="row">{i.status === 'Open' && <button className="btn sm" onClick={() => attempt(() => startInvestigation(i.id), 'Marked investigating')}>Investigate</button>}{i.status !== 'Acknowledged' && <button className="btn sm" onClick={async () => { const n = await ask('Acknowledge incident', 'Acknowledgement note'); if (n) attempt(() => acknowledgeIncident(i.id, n), 'Incident acknowledged'); }}>Acknowledge</button>}<button className="btn sm primary" onClick={() => setRes(i)}>Resolve</button></span> : null },
        ]} /></Card>
      )}
      {show && <ReportModal onClose={() => setShow(false)} />}
      {res && <ResolveModal inc={res} onClose={() => setRes(null)} />}
      
    </>
  );
}
