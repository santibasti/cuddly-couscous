import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth, store } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, PhotoInput, Photos, SignaturePad, Stat, attempt, ask, useObj } from '@/components/ui';
import { JobForm } from '@/components/JobForm';
import { completeJob, invoiceFromJob, setJobStatus, updateJobField } from '@/lib/actions';
import { jobCost, stockSummary } from '@/lib/business';
import { serviceReportPdf } from '@/lib/export';
import { fmtDateTime, fmtStamp, money, nowLocal } from '@/lib/util';
import type { Job, JobPhoto } from '@/lib/types';

export default function JobDetail() {
  const { id } = useParams();
  const { db, can, user } = useAuth();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [done, setDone] = useState(false);
  const j = db.jobs.find((x) => x.id === id);
  if (!j || j.deleted_at) return <div className="alert warn">Job not found. <Link to="/jobs">Back to jobs</Link></div>;
  const myEmp = user?.employee_id;
  if (!can('jobs.all') && !(myEmp && (j.leader_id === myEmp || j.crew_ids.includes(myEmp)))) return <div className="alert warn">This job is not assigned to you.</div>;

  const client = db.clients.find((c) => c.id === j.client_id)!;
  const site = db.sites.find((s) => s.id === j.site_id);
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const locked = j.status === 'Completed';
  const canWork = can('jobs.complete') && !locked && j.status !== 'Cancelled';
  const cost = can('profit.view') ? jobCost(db, j) : null;
  const inv = db.invoices.find((i) => i.job_id === j.id && i.status !== 'Reversed' && !i.deleted_at);
  const assetsOn = [...(j.vehicle_id ? [j.vehicle_id] : []), ...j.equipment_ids].map((aid) => ({ a: db.assets.find((a) => a.id === aid)!, co: db.checkouts.filter((c) => c.asset_id === aid && c.job_id === j.id).sort((x, y) => y.created_at.localeCompare(x.created_at))[0] }));
  const logs = db.audit.filter((a) => a.record_id === j.id).slice(0, 12);

  const upd = (patch: Partial<Job>, ok?: string) => attempt(() => updateJobField(j.id, patch), ok);
  const addPhoto = (kind: JobPhoto['kind'], data: string) => upd({ photos: [...j.photos, { kind, caption: kind === 'before' ? 'Before' : kind === 'after' ? 'After' : 'Damage', data, taken_at: nowLocal() }] }, 'Photo added');

  return (
    <>
      <PageHead title={<>{j.number} <Badge>{j.status}</Badge></>} sub={<>{client.name} · {site?.name} · {fmtDateTime(j.start_at)} → {fmtDateTime(j.end_at)}</>}>
        <Link to="/jobs" className="btn">← Jobs</Link>
        {can('jobs.edit') && !locked && <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" />Edit / reassign</button>}
        {can('jobs.edit') && j.status === 'Pending' && <button className="btn" onClick={() => attempt(() => setJobStatus(j.id, 'Confirmed'), 'Job confirmed')}>Confirm</button>}
        {can('jobs.complete') && ['Pending', 'Confirmed'].includes(j.status) && <button className="btn navy" onClick={() => attempt(() => setJobStatus(j.id, 'In Progress'), 'Job started')}>Start job</button>}
        {can('jobs.edit') && !locked && j.status !== 'Cancelled' && <button className="btn danger" onClick={async () => { const r = await ask('Cancel job', 'Reason for cancellation'); if (r) attempt(() => setJobStatus(j.id, 'Cancelled', r), 'Job cancelled'); }}>Cancel</button>}
        {canWork && j.status === 'In Progress' && <button className="btn primary" onClick={() => setDone(true)}><Icon name="check" />Submit completion</button>}
        {locked && <button className="btn" onClick={() => attempt(() => serviceReportPdf(db, j))}><Icon name="download" />Service report (PDF)</button>}
        {locked && can('invoices.edit') && !inv && <button className="btn primary" onClick={() => { const i = attempt(() => invoiceFromJob(j.id), 'Draft invoice created'); if (i) nav('/finance?tab=invoices'); }}>Create invoice</button>}
      </PageHead>

      <div className="grid g2">
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
          <Card title="Before & after photos" actions={canWork && <span className="row"><PhotoInput label="Before" capture="environment" onAdd={(d) => addPhoto('before', d)} /><PhotoInput label="After" capture="environment" onAdd={(d) => addPhoto('after', d)} /></span>}>
            <Photos items={j.photos.map((p) => ({ src: p.data, caption: `${p.kind.toUpperCase()} · ${fmtDateTime(p.taken_at)}` }))} onRemove={canWork ? (i) => upd({ photos: j.photos.filter((_, k) => k !== i) }) : undefined} />
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
            <Card title="Job costing" actions={<Badge tone={cost.estimated ? 'amber' : 'green'}>{cost.estimated ? 'Contains estimates' : 'Actual cost'}</Badge>}>
              <div className="grid g2" style={{ marginBottom: 10 }}>
                <Stat k={cost.revenueBasis === 'billed' ? 'Revenue (billed, ex-VAT)' : 'Revenue (expected)'} v={money(cost.revenue)} tone="navy" />
                <Stat k="Gross profit" v={money(cost.grossProfit)} s={`${cost.margin}% margin`} tone={cost.grossProfit >= 0 ? 'good' : 'bad'} />
              </div>
              <table className="tbl"><tbody>
                <tr><td>Direct labor {cost.laborEstimated && <Badge tone="amber">estimated</Badge>}</td><td className="num">{money(cost.labor)}</td></tr>
                <tr><td>Materials used {cost.materialsEstimated && <Badge tone="amber">estimated</Badge>}</td><td className="num">{money(cost.materials)}</td></tr>
                <tr><td>Transportation & fuel</td><td className="num">{money(cost.transport)}</td></tr>
                <tr><td>Equipment cost allocation</td><td className="num">{money(cost.equipment)}</td></tr>
                <tr><td>Subcontractors</td><td className="num">{money(cost.subcontractor)}</td></tr>
                <tr><td>Other job expenses</td><td className="num">{money(cost.other)}</td></tr>
                <tr><td><b>Total direct cost</b></td><td className="num"><b>{money(cost.total)}</b></td></tr>
                <tr><td className="muted">Budgeted (estimate at booking)</td><td className="num muted">{money(j.estimated_cost)}</td></tr>
              </tbody></table>
            </Card>
          )}
          <Card title="Record trail" flush>
            <ul className="list"><li><span className="muted small">Created {fmtStamp(j.created_at)} by {db.users.find((u) => u.id === j.created_by)?.name ?? 'System'} · updated {fmtStamp(j.updated_at)}</span></li>
              {logs.map((l) => <li key={l.id}><span className="small">{l.summary}</span><span className="small muted">{fmtStamp(l.at)} · {l.user_name}</span></li>)}</ul>
          </Card>
        </div>
      </div>
      {edit && <JobForm initial={j} onClose={() => setEdit(false)} />}
      {done && <CompleteModal job={j} onClose={() => setDone(false)} />}
    </>
  );
}

function CompleteModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const { db } = useAuth();
  const f = useObj({ findings: job.findings, damage_report: job.damage_report, equipment_condition_notes: job.equipment_condition_notes, signoff_name: db.sites.find((s) => s.id === job.site_id)?.contact_person ?? '', rating: 5 });
  const [sig, setSig] = useState<string | undefined>();
  const [used, setUsed] = useState<Record<string, number>>(() => Object.fromEntries(job.materials.map((m) => [m.item_id, m.used_qty ?? m.planned_qty])));
  const submit = () => {
    const r = attempt(() => completeJob(job.id, { ...f.v, signoff_data: sig, used }), 'Job completed'); if (r) { store.audit('approve', 'jobs', job.id, `Job ${job.number} completion submitted`); onClose(); }
  };
  return (
    <Modal title={`Submit completion – ${job.number}`} size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>Complete job</button></>}>
      <div className="form-grid">
        <Field label="Findings" className="full"><textarea {...f.bind('findings')} /></Field>
        <Field label="Damage report"><textarea {...f.bind('damage_report')} placeholder="Any pre-existing or new damage observed" /></Field>
        <Field label="Equipment condition"><textarea {...f.bind('equipment_condition_notes')} /></Field>
        <div className="full"><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Materials actually used (job cost is calculated from these)</div>
          <div className="stack">{job.materials.map((m) => { const it = db.items.find((i) => i.id === m.item_id)!; return <div key={m.item_id} className="row"><span className="grow">{it.name} <span className="muted small">planned {m.planned_qty} {it.uom}</span></span><input type="number" min="0" step="0.5" value={used[m.item_id] ?? 0} onChange={(e) => setUsed({ ...used, [m.item_id]: +e.target.value })} style={{ width: 100 }} aria-label={`Used ${it.name}`} /></div>; })}{!job.materials.length && <span className="muted">No materials planned.</span>}</div></div>
        <Field label="Client sign-off — printed name" required><input {...f.bind('signoff_name')} /></Field>
        <Field label="Client rating"><select value={f.v.rating} onChange={(e) => f.set('rating', +e.target.value)}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></Field>
        <div className="full"><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Client signature</div><SignaturePad onChange={setSig} /></div>
      </div>
      <p className="small muted">Requires all checklist items done and at least one before and after photo.</p>
    </Modal>
  );
}
