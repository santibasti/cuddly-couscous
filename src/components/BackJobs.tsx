import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar as RBar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Modal, attempt } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useDraft } from '@/lib/useDraft';
import { PresetChips } from '@/components/touch';
import { confirmLeave } from '@/lib/sync';
import { BACKJOB_FLOW, BACKJOB_REASONS, RESPONSIBLE_PRESETS, RATING_EMOJI, RATING_LABEL, backJobStats, backJobsOf, invoiceBalance, invoiceState, isOpenBackJob } from '@/lib/business';
import { approveBackJob, createBackJob, rejectBackJob, reviewBackJob } from '@/lib/backjobs';
import { serviceReportPdf } from '@/lib/export';
import { addDays, fmtDate, fmtDateTime, money, today } from '@/lib/util';
import type { BackJob, BackJobCharge, BackJobReason, Job } from '@/lib/types';

const TONE: Record<BackJob['status'], string> = { Reported: 'amber', 'Under Review': 'amber', Approved: 'teal', Scheduled: 'blue', 'In Progress': 'blue', Resolved: 'green', Closed: 'green', Rejected: 'red' };
const emp = (db: ReturnType<typeof useAuth>['db'], id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';

/** Create Back Job / Callback: links the new follow-up job to the original job without changing it. */
export function CreateBackJobModal({ origin, onClose }: { origin: Job; onClose: () => void }) {
  const { db, user } = useAuth();
  const client = db.clients.find((c) => c.id === origin.client_id); const site = db.sites.find((s) => s.id === origin.site_id);
  const wf = db.workflows.find((w) => w.job_id === origin.id && !w.deleted_at);
  const q = db.quotations.find((x) => x.id === origin.quotation_id); const inv = db.invoices.find((i) => i.job_id === origin.id && i.status !== 'Reversed' && !i.deleted_at);
  const [reason, setReason] = useState<BackJobReason | ''>('');
  const [description, setDescription] = useState('');
  const [reportedOn, setReportedOn] = useState(today());
  const [reportedBy, setReportedBy] = useState(user?.name ?? '');
  const [responsible, setResponsible] = useState('');
  const [charge, setCharge] = useState<BackJobCharge | ''>('');
  const dr = useDraft(`d:${origin.id}:backjob`, { reason, description, reportedOn, reportedBy, responsible, charge }, (d) => { setReason(d.reason); setDescription(d.description); setReportedOn(d.reportedOn); setReportedBy(d.reportedBy); setResponsible(d.responsible); setCharge(d.charge); });
  const close = () => { if (dr.dirty && !confirmLeave()) return; onClose(); };
  const save = () => {
    const r = attempt(() => { if (!reason) throw new Error('Choose the back job reason.'); if (!charge) throw new Error('Choose No Charge or Chargeable Additional Work.'); return createBackJob(origin.id, { reason, description, reported_on: reportedOn, reported_by: reportedBy, responsible, charge_type: charge }); }, 'Back job created — waiting for Admin / Operations approval');
    if (r) { dr.markSaved(); onClose(); location.hash = `#/jobs/${r.job.id}`; }
  };
  return (
    <Modal title={`Create Back Job / Callback — ${origin.number}`} size="wide" onClose={close} footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary lg" onClick={save}>Create back job</button></>}>
      <div className="stack">
        <div className="alert info">The original job, service report, quotation, invoice and payments stay exactly as they are. A <b>new linked job</b> is created with its own job number, schedule, attendance, equipment checklist, service report and closure.</div>
        <div className="card" style={{ padding: 12 }}><div className="small muted" style={{ marginBottom: 4 }}>Linked automatically</div>
          <dl className="kv"><dt>Original job</dt><dd>{origin.number} · {origin.status}</dd><dt>Client</dt><dd>{client?.name}</dd><dt>Site</dt><dd>{site?.name} — {site?.address}</dd>
            <dt>Service report</dt><dd>{wf?.rep_at ? <button className="btn sm" onClick={() => attempt(() => serviceReportPdf(db, origin))}>Original report (PDF)</button> : 'Not signed'}</dd>
            <dt>Quotation / invoice</dt><dd>{q?.number ?? '—'} / {inv?.number ?? 'not invoiced'}</dd><dt>Original team</dt><dd>{emp(db, origin.leader_id)}{origin.crew_ids.length ? ` + ${origin.crew_ids.map((c) => emp(db, c)).join(', ')}` : ''}</dd></dl></div>
        <Field label="Back job reason" required><div className="chips" role="group" aria-label="Reason">{BACKJOB_REASONS.map((r) => <button key={r} type="button" className={reason === r ? 'on' : ''} onClick={() => setReason(r)}>{r}</button>)}</div></Field>
        <Field label="Description" required><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What needs to be redone or fixed, and where?" /></Field>
        <div className="form-grid">
          <Field label="Date reported" required><input type="date" max={today()} value={reportedOn} onChange={(e) => setReportedOn(e.target.value)} /></Field>
          <Field label="Reported by" required><input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} /></Field>
        </div>
        <Field label="Responsible department / person" required><input value={responsible} onChange={(e) => setResponsible(e.target.value)} /><PresetChips replace options={RESPONSIBLE_PRESETS} value={responsible} onChange={setResponsible} /></Field>
        <Field label="Charge type" required>
          <div className="chips" role="group" aria-label="Charge type">{(['No Charge', 'Chargeable Additional Work'] as BackJobCharge[]).map((c) => <button key={c} type="button" className={charge === c ? 'on' : ''} onClick={() => setCharge(c)}>{c}</button>)}</div>
          <div className="small muted" style={{ marginTop: 4 }}>{charge === 'No Charge' ? 'No new bill. Labor, materials and equipment cost are tracked against the original job as Back Job Cost.' : charge ? 'A new quotation is created on approval; the client must approve it before work starts. The new invoice and payment link to this back job.' : 'Approval by Admin or Operations Manager is required either way.'}</div>
        </Field>
      </div>
    </Modal>
  );
}

function DecideModal({ b, mode, onClose }: { b: BackJob; mode: 'approve' | 'reject'; onClose: () => void }) {
  const [note, setNote] = useState(''); const [amount, setAmount] = useState<number | undefined>();
  const chargeable = b.charge_type === 'Chargeable Additional Work';
  const go = () => { if (attempt(() => (mode === 'approve' ? approveBackJob(b.id, { note, amount }) : rejectBackJob(b.id, note)), mode === 'approve' ? 'Back job approved — it can now be scheduled' : 'Back job rejected')) onClose(); };
  return (
    <Modal title={`${mode === 'approve' ? 'Approve' : 'Reject'} ${b.number}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className={`btn ${mode === 'approve' ? 'primary' : 'danger'}`} onClick={go}>{mode === 'approve' ? 'Approve' : 'Reject'}</button></>}>
      <div className="stack">
        <div className="small"><b>{b.reason}</b> · {b.charge_type}<br />{b.description}</div>
        {mode === 'approve' && chargeable && <Field label="Quoted amount for the client (₱, ex-VAT)" required hint="A new quotation is created. The client approves it before work starts."><input type="number" inputMode="decimal" min="0" value={amount ?? ''} onChange={(e) => setAmount(e.target.value === '' ? undefined : +e.target.value)} /></Field>}
        <Field label={mode === 'approve' ? 'Approval note' : 'Reason for rejecting'} required><textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** Status track + details + actions for one back job. */
export function BackJobCard({ b, compact }: { b: BackJob; compact?: boolean }) {
  const { db, can } = useAuth();
  const [dec, setDec] = useState<'approve' | 'reject' | null>(null);
  const origin = db.jobs.find((j) => j.id === b.origin_job_id); const link = db.jobs.find((j) => j.id === b.job_id);
  const q = db.quotations.find((x) => x.id === b.quotation_id); const inv = link ? db.invoices.find((i) => i.job_id === link.id && i.status !== 'Reversed' && !i.deleted_at) : undefined;
  const approver = can('backjobs.approve');
  const idx = BACKJOB_FLOW.indexOf(b.status);
  return (
    <div className={`itemcard ${b.status === 'Closed' || b.status === 'Resolved' ? 'ok' : b.status === 'Rejected' ? 'bad' : ''}`}>
      <div className="row between"><div><b>{b.number}</b> <Badge tone={TONE[b.status]}>{b.status}</Badge> <Badge tone={b.charge_type === 'No Charge' ? 'gray' : 'blue'}>{b.charge_type}</Badge></div><span className="small muted">reported {fmtDate(b.reported_on)}</span></div>
      <div className="backtrack" aria-label="Back job status">{BACKJOB_FLOW.map((s, i) => <span key={s} className={`bt ${b.status === 'Rejected' ? '' : i < idx ? 'done' : i === idx ? 'cur' : ''}`}>{s}</span>)}</div>
      <div className="small"><b>{b.reason}</b> — {b.description}</div>
      {!compact && <dl className="kv" style={{ marginTop: 6 }}>
        <dt>Original job</dt><dd>{origin ? <Link to={`/jobs/${origin.id}`}>{origin.number}</Link> : '—'} · {origin?.status}</dd>
        <dt>Back-job (follow-up)</dt><dd>{link ? <Link to={`/jobs/${link.id}`}>{link.number}</Link> : '—'} · {link?.status}{link ? ` · ${fmtDateTime(link.start_at)}` : ''}</dd>
        <dt>Reported by</dt><dd>{b.reported_by}</dd><dt>Responsible</dt><dd>{b.responsible}</dd>
        <dt>Original team</dt><dd>{emp(db, b.origin_leader_id)}{b.origin_crew_ids.length ? ` + ${b.origin_crew_ids.map((c) => emp(db, c)).join(', ')}` : ''}</dd>
        {b.approved_at && <><dt>{b.status === 'Rejected' ? 'Rejected by' : 'Approved by'}</dt><dd>{db.users.find((u) => u.id === b.approved_by)?.name} · {fmtDateTime(b.approved_at)} — “{b.approval_note}”</dd></>}
        {q && <><dt>Quotation</dt><dd>{q.number} · {q.status}{q.status !== 'Approved' ? ' — the client must approve before work starts' : ''}</dd></>}
        {inv && <><dt>Invoice</dt><dd>{inv.number} · {invoiceState(db, inv)} · balance {money(invoiceBalance(db, inv))}</dd></>}
      </dl>}
      <div className="row" style={{ marginTop: 6 }}>
        {approver && b.status === 'Reported' && <button className="btn sm" onClick={() => attempt(() => reviewBackJob(b.id), 'Under review')}>Start review</button>}
        {approver && ['Reported', 'Under Review'].includes(b.status) && <><button className="btn sm primary" onClick={() => setDec('approve')}>Approve</button><button className="btn sm danger" onClick={() => setDec('reject')}>Reject</button></>}
        {link && !compact && <Link className="btn sm" to={`/jobs/${link.id}`}>Open follow-up job</Link>}
      </div>
      {dec && <DecideModal b={b} mode={dec} onClose={() => setDec(null)} />}
    </div>
  );
}

/** Job Card: back jobs raised against this job, or the origin of this back job. */
export function BackJobSection({ job }: { job: Job }) {
  const { db } = useAuth();
  const own = job.back_job_id ? db.back_jobs.find((b) => b.id === job.back_job_id) : undefined;
  const raised = backJobsOf(db, job.id);
  if (!own && !raised.length) return null;
  return (
    <div className="card" style={{ padding: 12, marginBottom: 12 }}>
      <b>{own ? 'This is a Back Job / Callback' : `Back jobs / callbacks (${raised.length})`}</b>
      {own && <div className="small muted">A linked follow-up of {db.jobs.find((j) => j.id === own.origin_job_id)?.number}. The original job is unchanged.{own.charge_type === 'No Charge' ? ' Its cost is tracked against the original job.' : ''}</div>}
      <div className="stack" style={{ marginTop: 8 }}>{(own ? [own] : raised).map((b) => <BackJobCard key={b.id} b={b} />)}</div>
    </div>
  );
}

/** Jobs → Back jobs: every callback with status and links. */
export function BackJobsTable() {
  const { db } = useAuth();
  const rows = db.back_jobs.filter((b) => !b.deleted_at).sort((a, b) => b.reported_on.localeCompare(a.reported_on));
  return (
    <Card flush><DataTable<BackJob> rows={rows} rowKey={(b) => b.id} exportTitle="Back jobs" pageSize={15} cols={[
      { key: 'n', header: 'Back job', value: (b) => b.number }, { key: 'o', header: 'Original job', value: (b) => db.jobs.find((j) => j.id === b.origin_job_id)?.number ?? '', render: (b) => <Link to={`/jobs/${b.origin_job_id}`}>{db.jobs.find((j) => j.id === b.origin_job_id)?.number}</Link> },
      { key: 'l', header: 'Follow-up job', value: (b) => db.jobs.find((j) => j.id === b.job_id)?.number ?? '', render: (b) => <Link to={`/jobs/${b.job_id}`}>{db.jobs.find((j) => j.id === b.job_id)?.number}</Link> },
      { key: 'c', header: 'Client', value: (b) => db.clients.find((c) => c.id === b.client_id)?.name ?? '' }, { key: 'r', header: 'Reason', value: (b) => b.reason },
      { key: 'ch', header: 'Charge', value: (b) => b.charge_type }, { key: 'd', header: 'Reported', value: (b) => b.reported_on, render: (b) => fmtDate(b.reported_on) },
      { key: 's', header: 'Status', value: (b) => b.status, render: (b) => <Badge tone={TONE[b.status]}>{b.status}</Badge> },
    ]} /></Card>
  );
}

/** Dashboard / report section: open back jobs, reasons, cost by client / crew / service, repeats, resolution time, satisfaction after resolution. */
export function BackJobDashboard({ from, to }: { from: string; to: string }) {
  const { db, can } = useAuth();
  const st = backJobStats(db, from, to);
  const [dim, setDim] = useState<'client' | 'crew' | 'service'>('client');
  const costRows = dim === 'client' ? st.byClient : dim === 'crew' ? st.byCrew : st.byService;
  const stars = (r?: 1 | 2 | 3) => (r ? `${RATING_EMOJI[r]} ${RATING_LABEL[r]}` : '—');
  return (
    <Card title="Back jobs / callbacks" actions={<span className="small muted">{fmtDate(from)} – {fmtDate(to)} · by date reported</span>}>
      <div className="grid g4 keep2" style={{ marginBottom: 12 }}>
        <div className={`stat ${st.open.length ? 'warn' : ''}`}><div className="k">Open back jobs</div><div className="v">{st.open.length}</div><div className="s">{st.total} reported in period</div></div>
        <div className="stat"><div className="k">Back-job cost</div><div className="v">{money(st.totalCost)}</div><div className="s">{money(st.noChargeCost)} no-charge (absorbed)</div></div>
        <div className="stat"><div className="k">Avg resolution time</div><div className="v">{st.resolved ? `${st.avgResolutionDays} d` : '—'}</div><div className="s">{st.resolved} resolved</div></div>
        <div className="stat navy"><div className="k">Satisfaction after fix</div><div className="v">{st.ratedCount ? `${st.avgRating.toFixed(2)} / 3` : '—'}</div><div className="s">{st.ratedCount ? `original jobs ${st.avgOriginRating ? st.avgOriginRating.toFixed(2) : '—'}` : 'no responses yet'}</div></div>
      </div>
      {st.repeated.length > 0 && <div className="alert warn" style={{ marginBottom: 12 }}><b>Jobs with repeated callbacks:</b> {st.repeated.map((r) => <Link key={r.originId} to={`/jobs/${r.originId}`} style={{ marginRight: 10 }}>{r.origin?.number} ×{r.n} ({r.reasons.join(', ')})</Link>)}</div>}
      <div className="grid g2">
        <div><b>Open back jobs</b>
          <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Back job</th><th>Client</th><th>Reason</th><th>Status</th><th className="num">Age</th></tr></thead><tbody>
            {st.open.slice(0, 8).map((r) => <tr key={r.b.id}><td><Link to={`/jobs/${r.b.job_id}`}>{r.b.number}</Link></td><td>{db.clients.find((c) => c.id === r.b.client_id)?.name}</td><td>{r.b.reason}<div className="small muted">{r.b.charge_type}</div></td><td><Badge tone={TONE[r.b.status]}>{r.b.status}</Badge></td><td className="num">{r.ageDays} d</td></tr>)}
            {!st.open.length && <tr><td colSpan={5} className="muted">None open.</td></tr>}
          </tbody></table></div></div>
        <div><b>By reason</b>
          <div style={{ width: '100%', height: 200 }}><ResponsiveContainer><BarChart data={st.byReason} layout="vertical" margin={{ left: 20, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e3e9f0" /><XAxis type="number" allowDecimals={false} fontSize={12} /><YAxis type="category" dataKey="label" width={110} fontSize={12} /><Tooltip /><RBar dataKey="n" name="Back jobs" fill="#12a1a7" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="row between" style={{ marginBottom: 6 }}><b>Back-job cost by {dim}</b>
          <div className="chips" style={{ margin: 0 }} role="group">{(['client', 'crew', 'service'] as const).map((k) => <button key={k} type="button" className={dim === k ? 'on' : ''} onClick={() => setDim(k)}>{k === 'service' ? 'Service type' : k[0].toUpperCase() + k.slice(1)}</button>)}</div></div>
        <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>{dim === 'service' ? 'Service type' : dim === 'crew' ? 'Crew / team leader' : 'Client'}</th><th className="num">Back jobs</th>{can('profit.view') && <th className="num">Cost</th>}</tr></thead><tbody>
          {costRows.map((a) => <tr key={a.key}><td>{a.label}</td><td className="num">{a.n}</td>{can('profit.view') && <td className="num">{money(a.cost)}</td>}</tr>)}
          {!costRows.length && <tr><td colSpan={3} className="muted">No back jobs in this period.</td></tr>}
        </tbody></table></div>
      </div>
      {st.rows.some((r) => r.rating) && <div style={{ marginTop: 12 }}><b>Client satisfaction after back-job resolution</b>
        <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Back job</th><th>Client</th><th>Original job rating</th><th>After the fix</th></tr></thead><tbody>
          {st.rows.filter((r) => r.rating).map((r) => <tr key={r.b.id}><td>{r.b.number}</td><td>{db.clients.find((c) => c.id === r.b.client_id)?.name}</td><td>{stars(r.originRating)}</td><td>{stars(r.rating)}</td></tr>)}
        </tbody></table></div></div>}
      <p className="small muted" style={{ marginBottom: 0 }}>Cost = labor, materials, transport and equipment of the follow-up job. No-charge cost is added to the original job’s profitability as <i>Back Job Cost</i>; chargeable back jobs are billed on their own.</p>
    </Card>
  );
}
void addDays; void isOpenBackJob;
