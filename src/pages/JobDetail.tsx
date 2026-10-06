import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, Stat, attempt, ask } from '@/components/ui';
import { JobForm } from '@/components/JobForm';
import { JobExpensesPanel } from '@/components/JobExpensesPanel';
import { CrewAvailability } from '@/components/AvailabilityPrompt';
import { invoiceFromJob, setJobStatus, updateJobField } from '@/lib/actions';
import { invoiceBalance, finalContract, isDone, jobCost, JOB_FLOW, stockSummary } from '@/lib/business';
import { Tabs } from '@/components/ui';
import { useMedia } from '@/components/touch';
import { BackJobSection, CreateBackJobModal } from '@/components/BackJobs';
import { canCreateBackJob } from '@/lib/backjobs';
import { RecordPaymentModal, canRecordPayment } from '@/components/RecordPayment';
import { FollowUpBanner } from '@/components/workflow/Satisfaction';
import { WorkflowPanel } from '@/components/workflow/WorkflowPanel';
import { JobOrderPanel } from '@/components/JobOrderPanel';
import { ReportIncidentModal } from '@/components/workflow/Incidents';
import { overrideJobStatus } from '@/lib/workflow';
import { serviceReportPdf } from '@/lib/export';
import { fmtDateTime, fmtStamp, money, nowLocal } from '@/lib/util';
import type { Job } from '@/lib/types';

export default function JobDetail() {
  const { id } = useParams();
  const { db, can, user } = useAuth();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [ovr, setOvr] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [bjOpen, setBjOpen] = useState(false);
  const [inc, setInc] = useState(false);
  const [tab, setTab] = useState<'workflow' | 'details'>('workflow');
  const wide = useMedia('(min-width: 1200px) and (orientation: landscape)');
  const j = db.jobs.find((x) => x.id === id);
  if (!j || j.deleted_at) return <div className="alert warn">Job not found. <Link to="/jobs">Back to jobs</Link></div>;
  const myEmp = user?.employee_id;
  if (!can('jobs.all') && !(myEmp && (j.leader_id === myEmp || j.crew_ids.includes(myEmp)))) return <div className="alert warn">This job is not assigned to you.</div>;

  const client = db.clients.find((c) => c.id === j.client_id)!;
  const site = db.sites.find((s) => s.id === j.site_id);
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const locked = isDone(j.status);
  const fc = finalContract(db, j);
  const hasVars = db.variations.some((v) => v.job_id === j.id && v.status === 'Approved' && !v.deleted_at);
  const canWork = can('jobs.complete') && !locked && j.status !== 'Cancelled';
  const cost = can('profit.view') ? jobCost(db, j) : null;
  const inv = db.invoices.find((i) => i.job_id === j.id && i.status !== 'Reversed' && !i.deleted_at);
  const assetsOn = [...(j.vehicle_id ? [j.vehicle_id] : []), ...j.equipment_ids].map((aid) => ({ a: db.assets.find((a) => a.id === aid)!, co: db.checkouts.filter((c) => c.asset_id === aid && c.job_id === j.id).sort((x, y) => y.created_at.localeCompare(x.created_at))[0] }));
  const logs = db.audit.filter((a) => a.record_id === j.id).slice(0, 12);

  const upd = (patch: Partial<Job>, ok?: string) => attempt(() => updateJobField(j.id, patch), ok);

  return (
    <>
      <PageHead title={<>{j.number} <Badge>{j.status}</Badge></>} sub={<>{client.name} · {site?.name} · {fmtDateTime(j.start_at)} → {fmtDateTime(j.end_at)}</>}>
        <Link to="/jobs" className="btn">← Jobs</Link>
        {can('jobs.edit') && !locked && <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" />Edit / reassign</button>}
        {can('jobs.edit') && j.status === 'Pending' && <button className="btn" onClick={() => attempt(() => setJobStatus(j.id, 'Confirmed'), 'Job confirmed')}>Confirm</button>}
        {can('jobs.edit') && ['Pending', 'Confirmed', 'Dispatch Checklist Pending'].includes(j.status) && <button className="btn danger" onClick={async () => { const r = await ask('Cancel job', 'Reason for cancellation'); if (r) attempt(() => setJobStatus(j.id, 'Cancelled', r), 'Job cancelled'); }}>Cancel</button>}
        {(can('dispatch.run') || can('incidents.manage')) && <button className="btn" onClick={() => setInc(true)}><Icon name="alert" />Report incident</button>}
        {can('dispatch.approve') && !['Cancelled', 'Rescheduled'].includes(j.status) && <button className="btn" onClick={() => setOvr(true)}>Override status…</button>}
        {locked && <button className="btn" onClick={() => attempt(() => serviceReportPdf(db, j))}><Icon name="download" />Service report (PDF)</button>}
        {canCreateBackJob(j) && <button className="btn" onClick={() => setBjOpen(true)}>↩ Create Back Job / Callback</button>}
        {locked && canRecordPayment(can) && (!inv || inv.status !== 'Approved' || invoiceBalance(db, inv) > 0.005) && <button className="btn primary" onClick={() => setPayOpen(true)}>Record Payment</button>}
        {locked && can('invoices.edit') && !inv && <button className="btn primary" onClick={() => { const i = attempt(() => invoiceFromJob(j.id), 'Draft invoice created'); if (i) nav('/finance?tab=invoices'); }}>Create invoice</button>}
      </PageHead>

      {payOpen && <RecordPaymentModal jobId={j.id} onClose={() => setPayOpen(false)} />}
      {bjOpen && <CreateBackJobModal origin={j} onClose={() => setBjOpen(false)} />}
      <BackJobSection job={j} />
      <FollowUpBanner jobId={j.id} />
      {(hasVars || fc.discount > 0) && <div className="alert info" style={{ marginBottom: 12 }}>Contract value: original {money(fc.originalNet)}{hasVars ? ` + approved variations ${money(fc.variationsNet)}` : ''}{fc.discount > 0 ? ` − discount granted ${money(fc.discountNet)}` : ''} = <b>{money(fc.payableNet)}</b> (ex-VAT). The original quotation is unchanged.{fc.discount > 0 && ' Discount approved by TopMop management and reflected in the final agreed amount.'}</div>}
      <div style={{ marginBottom: 14 }}><JobOrderPanel job={j} /></div>
      {!wide && <Tabs tabs={[{ id: 'workflow' as const, label: 'Workflow' }, { id: 'details' as const, label: 'Job details' }]} value={tab} onChange={setTab} />}
      {(wide || tab === 'workflow') && <div style={{ marginBottom: 14 }}><WorkflowPanel job={j} onDetails={() => { setTab('details'); window.scrollTo({ top: 0 }); }} /></div>}
      {(wide || tab === 'workflow') && <div style={{ marginBottom: 14 }}><JobExpensesPanel job={j} /></div>}
      {(wide || tab === 'details') && <div className="grid g2">
        <div className="stack">
          <Card title="Scope of work"><p style={{ marginTop: 0 }}>{j.scope || '—'}</p><div className="row">{j.service_codes.map((c) => <Badge key={c} tone="teal">{db.services.find((s) => s.code === c)?.name}</Badge>)}</div></Card>
          <Card title="Site & contact">
            <dl className="kv"><dt>Site</dt><dd>{site?.name}</dd><dt>Address</dt><dd>{site?.address} {site && <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`}>Map ↗</a>}</dd>
              <dt>Contact</dt><dd>{site?.contact_person} {site?.contact_mobile && <a href={`tel:${site.contact_mobile}`}>{site.contact_mobile}</a>}</dd><dt>Access</dt><dd>{site?.access_instructions || client.access_instructions || '—'}</dd></dl>
          </Card>
          <Card title="Assigned crew">
            <div className="row"><Badge tone="navy">Leader</Badge><b>{emp(j.leader_id)}</b></div>
            <div className="row" style={{ marginTop: 8 }}>{j.crew_ids.map((id) => <Badge key={id} tone="blue">{emp(id)}</Badge>)}{!j.crew_ids.length && <span className="muted">No crew assigned</span>}</div>
          </Card>
          <CrewAvailability job={j} />
          <Card title="Safety requirements / PPE"><div className="row">{j.ppe.map((p) => <Badge key={p} tone="amber">{p}</Badge>)}{!j.ppe.length && <span className="muted">None specified</span>}</div></Card>
          <Card title="Machines, equipment & vehicle" flush>
            <ul className="list">{assetsOn.map(({ a, co }) => (
              <li key={a.id}><div><b>{a.name}</b> <span className="muted small">{a.code}</span></div><div className="row">{co ? <Badge>{co.status}</Badge> : <Badge tone="gray">Not requested</Badge>}{!co && can('assets.request') && !locked && <Link className="btn sm" to={`/assets?request=${a.id}&job=${j.id}`}>Request</Link>}</div></li>
            ))}{!assetsOn.length && <li className="muted">None assigned.</li>}</ul>
          </Card>
        </div>

        <div className="stack">
          <Card title="Job checklist" actions={<span className="small muted">{j.checklist.filter((c) => c.done).length}/{j.checklist.length}</span>}>
            <div className="stack" style={{ gap: 8 }}>
              {j.checklist.map((c, i) => (
                <label key={i} className="check"><input type="checkbox" checked={c.done} disabled={!canWork} onChange={() => upd({ checklist: j.checklist.map((x, k) => (k === i ? { ...x, done: !x.done } : x)) })} />{c.label}</label>
              ))}
              {!j.checklist.length && <span className="muted">Checklist is generated when the job is saved.</span>}
            </div>
          </Card>
          <Card title="Findings & damage report">
            <div className="stack">
              <Field label="Findings"><textarea disabled={!canWork} defaultValue={j.findings} onBlur={(e) => e.target.value !== j.findings && upd({ findings: e.target.value })} /></Field>
              <Field label="Damage report"><textarea disabled={!canWork} defaultValue={j.damage_report} onBlur={(e) => e.target.value !== j.damage_report && upd({ damage_report: e.target.value })} /></Field>
              <Field label="Equipment condition notes"><textarea disabled={!canWork} defaultValue={j.equipment_condition_notes} onBlur={(e) => e.target.value !== j.equipment_condition_notes && upd({ equipment_condition_notes: e.target.value })} /></Field>
            </div>
          </Card>
          <Card title="Materials" flush>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Item</th><th className="num">Planned</th><th className="num">Issued (net)</th><th className="num">Used</th><th className="num">Available</th></tr></thead><tbody>
              {j.materials.map((m) => {
                const it = db.items.find((i) => i.id === m.item_id)!;
                const issued = -db.stock.filter((t) => t.approval === 'Approved' && t.job_id === j.id && t.item_id === m.item_id && ['Issue to Job', 'Return from Job'].includes(t.type)).reduce((s, t) => s + t.qty, 0);
                return <tr key={m.item_id}><td>{it.name}</td><td className="num">{m.planned_qty} {it.uom}</td><td className="num">{issued}</td><td className="num">{m.used_qty ?? '—'}</td><td className="num">{stockSummary(db, it.id).available}</td></tr>;
              })}
              {!j.materials.length && <tr><td colSpan={5} className="muted">No materials planned.</td></tr>}
            </tbody></table></div>
            {can('inventory.request') && !locked && <div style={{ padding: 12 }}><Link to={`/inventory?tab=requests&job=${j.id}`} className="btn sm">Request materials</Link></div>}
          </Card>
          {locked && (
            <Card title="Completion & client sign-off">
              <dl className="kv"><dt>Completed</dt><dd>{fmtDateTime(j.completed_at)}</dd><dt>Signed off by</dt><dd>{j.signoff_name} · {fmtDateTime(j.signoff_at)}</dd><dt>Client rating</dt><dd>{j.client_rating ? `${j.client_rating} / 5` : '—'}</dd></dl>
              {j.signoff_data && <img src={j.signoff_data} alt="signature" style={{ maxHeight: 90, marginTop: 8, border: '1px solid var(--line)', borderRadius: 6 }} />}
            </Card>
          )}
          {cost && (
            <>
            {cost.chargedTo && <div className="alert info" style={{ marginBottom: 8 }}>No-charge back job: this cost is charged to the original job {cost.chargedTo}, not shown as a loss here.</div>}
            <Card title="Job costing" actions={<Badge tone={cost.estimated ? 'amber' : 'green'}>{cost.estimated ? 'Contains estimates' : 'Actual cost'}</Badge>}>
              <div className="grid g2" style={{ marginBottom: 10 }}>
                <Stat k={cost.revenueBasis === 'billed' ? 'Revenue (billed, ex-VAT)' : 'Revenue (expected)'} v={money(cost.revenue)} tone="navy" />
                <Stat k="Gross profit" v={money(cost.grossProfit)} s={`${cost.margin}% margin`} tone={cost.grossProfit >= 0 ? 'good' : 'bad'} />
                {cost.discount > 0 && <Stat k="Discount granted (ex-VAT)" v={money(cost.discount)} s={`GP before discount ${money(cost.grossProfitBefore)} (${cost.marginBefore}%)`} tone="warn" />}
              </div>
              <table className="tbl"><tbody>
                <tr><td>Direct labor {cost.laborEstimated && <Badge tone="amber">estimated</Badge>}</td><td className="num">{money(cost.labor)}</td></tr>
                <tr><td>Materials used {cost.materialsEstimated && <Badge tone="amber">estimated</Badge>}</td><td className="num">{money(cost.materials)}</td></tr>
                <tr><td>Transportation & fuel</td><td className="num">{money(cost.transport)}</td></tr>
                <tr><td>Equipment cost allocation</td><td className="num">{money(cost.equipment)}</td></tr>
                <tr><td>Subcontractors</td><td className="num">{money(cost.subcontractor)}</td></tr>
                {cost.backJobCost > 0 && <tr><td><b>Back Job Cost</b> <span className="small muted">(no-charge callbacks)</span></td><td className="num" style={{ color: 'var(--red)' }}>{money(cost.backJobCost)}</td></tr>}
                <tr><td>Other job expenses</td><td className="num">{money(cost.other)}</td></tr>
                <tr><td><b>Total direct cost</b></td><td className="num"><b>{money(cost.total)}</b></td></tr>
                <tr><td className="muted">Budgeted (estimate at booking)</td><td className="num muted">{money(j.estimated_cost)}</td></tr>
              </tbody></table>
            </Card>
            </>
          )}
          <Card title="Record trail" flush>
            <ul className="list"><li><span className="muted small">Created {fmtStamp(j.created_at)} by {db.users.find((u) => u.id === j.created_by)?.name ?? 'System'} · updated {fmtStamp(j.updated_at)}</span></li>
              {logs.map((l) => <li key={l.id}><span className="small">{l.summary}</span><span className="small muted">{fmtStamp(l.at)} · {l.user_name}</span></li>)}</ul>
          </Card>
        </div>
      </div>}
      {edit && <JobForm initial={j} onClose={() => setEdit(false)} />}
      {inc && <ReportIncidentModal jobId={j.id} onClose={() => setInc(false)} />}
      {ovr && <OverrideModal job={j} onClose={() => setOvr(false)} />}
    </>
  );
}

function OverrideModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const [status, setStatus] = useState<Job['status']>(job.status);
  const [reason, setReason] = useState('');
  return (
    <Modal title={`Override status – ${job.number}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!reason.trim() || status === job.status} onClick={() => { if (attempt(() => overrideJobStatus(job.id, status, reason), 'Status overridden and logged')) onClose(); }}>Apply override</button></>}>
      <div className="alert warn" style={{ marginBottom: 12 }}>Skips the normal job workflow. The change is logged with your name, the old and new status, and your reason.</div>
      <div className="form-grid"><Field label="New status"><select value={status} onChange={(e) => setStatus(e.target.value as Job['status'])}>{[...JOB_FLOW, 'Pending'].map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Reason" required className="full"><textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
    </Modal>
  );
}
