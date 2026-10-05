import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, attempt, ask, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { acknowledgeIncident, reportIncident, resolveIncident, startInvestigation, type IncidentOutcome } from '@/lib/workflow';
import { fmtStamp } from '@/lib/util';
import type { IncidentReport, IncidentType } from '@/lib/types';

const TYPES: IncidentType[] = ['Missing asset', 'Damaged asset', 'Vehicle damage', 'Material shortage', 'Missing PPE', 'Safety', 'Other'];

export function ReportIncidentModal({ onClose, jobId }: { onClose: () => void; jobId?: string }) {
  const { db } = useAuth();
  const f = useObj({ type: 'Other' as IncidentType, severity: 'Medium' as IncidentReport['severity'], job_id: jobId ?? '', asset_id: '', description: '' });
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

/** Equipment incident reports (missing / damaged items raised by the job workflow). */
export function IncidentsPanel() {
  const { db, can } = useAuth();
  const [show, setShow] = useState(false);
  const [res, setRes] = useState<IncidentReport | null>(null);
  const incidents = live(db.incidents).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>{(can('dispatch.run') || can('incidents.manage')) && <button className="btn" onClick={() => setShow(true)}><Icon name="alert" />Report incident</button>}</div>
      <Card flush><DataTable<IncidentReport> rows={incidents} rowKey={(i) => i.id} exportTitle="Incident reports" initialSort={{ key: 'at', dir: -1 }} pageSize={15} cols={[
        { key: 'n', header: 'No.', value: (i) => i.number }, { key: 'at', header: 'Raised', value: (i) => i.created_at, render: (i) => fmtStamp(i.created_at) },
        { key: 't', header: 'Type', value: (i) => i.type, render: (i) => <span className="row" style={{ gap: 4 }}><Badge tone="blue">{i.type}</Badge>{i.auto && <Badge tone="gray">auto</Badge>}</span> },
        { key: 'sev', header: 'Severity', value: (i) => i.severity, render: (i) => <Badge>{i.severity}</Badge> },
        { key: 'job', header: 'Job', value: (i) => db.jobs.find((j) => j.id === i.job_id)?.number ?? '', render: (i) => (i.job_id ? <Link to={`/jobs/${i.job_id}`} onClick={(e) => e.stopPropagation()}>{db.jobs.find((j) => j.id === i.job_id)?.number}</Link> : '—') },
        { key: 'asset', header: 'Asset', value: (i) => db.assets.find((a) => a.id === i.asset_id)?.code ?? '' }, { key: 'd', header: 'Description', value: (i) => i.description },
        { key: 'tk', header: 'Ticket', value: (i) => (i.ticket_id ? 'Linked' : ''), render: (i) => (i.ticket_id ? <Link to="/assets?tab=maint" onClick={(e) => e.stopPropagation()}>Repair ticket</Link> : '—') },
        { key: 'st', header: 'Status', value: (i) => i.status, render: (i) => <span>{i.status === 'Resolved' ? <Badge tone="green">Resolved</Badge> : <Badge tone={i.status === 'Open' ? 'red' : 'amber'}>{i.status}</Badge>}{i.resolution && <div className="small muted">{i.resolution}</div>}</span> },
        { key: 'actions', header: '', sortable: false, noExport: true, render: (i) => can('incidents.manage') && i.status !== 'Resolved' ? <span className="row">{i.status === 'Open' && <button className="btn sm" onClick={() => attempt(() => startInvestigation(i.id), 'Marked investigating')}>Investigate</button>}{i.status !== 'Acknowledged' && <button className="btn sm" onClick={async () => { const n = await ask('Acknowledge incident', 'Acknowledgement note'); if (n) attempt(() => acknowledgeIncident(i.id, n), 'Incident acknowledged'); }}>Acknowledge</button>}<button className="btn sm primary" onClick={() => setRes(i)}>Resolve</button></span> : null },
      ]} /></Card>
      {show && <ReportIncidentModal onClose={() => setShow(false)} />}
      {res && <ResolveModal inc={res} onClose={() => setRes(null)} />}
    </>
  );
}
