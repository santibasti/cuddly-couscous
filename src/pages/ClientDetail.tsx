import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, Stat, Tabs, attempt, useObj, ask } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { ClientForm } from './Clients';
import { docTotals, invoiceBalance, invoiceState, invoiceTotals } from '@/lib/business';
import { fmtDate, fmtDateTime, fmtStamp, money, sum, today } from '@/lib/util';
import { serviceReportPdf, statementPdf } from '@/lib/export';
import type { Communication, Complaint, Site } from '@/lib/types';

type Tab = 'overview' | 'sites' | 'quotes' | 'jobs' | 'billing' | 'reports' | 'complaints' | 'comms';

function SiteForm({ clientId, initial, onClose }: { clientId: string; initial?: Site; onClose: () => void }) {
  const f = useObj(() => initial ?? { client_id: clientId, name: '', address: '', contact_person: '', contact_mobile: '', access_instructions: '' } as Omit<Site, 'id' | 'created_at' | 'updated_at' | 'created_by'>);
  const save = () => {
    if (!f.v.name.trim() || !f.v.address.trim()) return attempt(() => { throw new Error('Site name and address are required.'); });
    attempt(() => (initial ? store.update('sites', initial.id, f.v) : store.insert('sites', f.v)), 'Site saved'); onClose();
  };
  return (
    <Modal title={initial ? 'Edit service site' : 'Add service site'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save site</button></>}>
      <div className="form-grid">
        <Field label="Site name" required className="full"><input {...f.bind('name')} /></Field>
        <Field label="Address" required className="full"><input {...f.bind('address')} /></Field>
        <Field label="Site contact"><input {...f.bind('contact_person')} /></Field>
        <Field label="Contact mobile"><input {...f.bind('contact_mobile')} /></Field>
        <Field label="Access instructions" className="full"><textarea {...f.bind('access_instructions')} /></Field>
      </div>
    </Modal>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const { db, can } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [edit, setEdit] = useState(false);
  const [siteForm, setSiteForm] = useState<Site | 'new' | null>(null);
  const [comm, setComm] = useState(false);
  const [cmp, setCmp] = useState(false);
  const c = db.clients.find((x) => x.id === id);
  if (!c) return <div className="alert warn">Client not found. <Link to="/clients">Back to clients</Link></div>;

  const sites = live(db.sites).filter((s) => s.client_id === c.id);
  const quotes = live(db.quotations).filter((q) => q.client_id === c.id);
  const jobs = live(db.jobs).filter((j) => j.client_id === c.id).sort((a, b) => b.start_at.localeCompare(a.start_at));
  const invs = live(db.invoices).filter((i) => i.client_id === c.id);
  const pays = live(db.payments).filter((p) => p.client_id === c.id);
  const comms = live(db.communications).filter((x) => x.client_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const cmps = live(db.complaints).filter((x) => x.client_id === c.id);
  const canFin = can('invoices.view');
  const outstanding = sum(invs, (i) => invoiceBalance(db, i));
  const billed = sum(invs.filter((i) => i.status === 'Approved'), (i) => invoiceTotals(i).total);
  const done = jobs.filter((j) => j.status === 'Completed');

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'sites', label: 'Sites', count: sites.length }, { id: 'quotes', label: 'Quotations', count: quotes.length },
    { id: 'jobs', label: 'Jobs', count: jobs.length }, ...(canFin ? [{ id: 'billing' as Tab, label: 'Invoices & payments', count: invs.length }] : []),
    { id: 'reports', label: 'Service reports', count: done.length }, { id: 'complaints', label: 'Complaints', count: cmps.length }, { id: 'comms', label: 'Communication', count: comms.length },
  ];

  return (
    <>
      <PageHead title={c.name} sub={<><Badge tone="blue">{c.type}</Badge> <Badge>{c.status}</Badge> · {c.contact_person} · {c.mobile}</>}>
        <Link to="/clients" className="btn">← Clients</Link>
        {can('clients.edit') && <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" />Edit</button>}
        {can('sales.edit') && <button className="btn primary" onClick={() => nav(`/sales/quote/new?client=${c.id}`)}><Icon name="plus" />New quotation</button>}
      </PageHead>
      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        <Stat k="Completed jobs" v={done.length} s={`${jobs.filter((j) => ['Pending', 'Confirmed', 'In Progress'].includes(j.status)).length} upcoming / active`} />
        <Stat k="Service sites" v={sites.length} />
        {canFin && <Stat k="Total billed" v={money(billed)} tone="navy" />}
        {canFin && <Stat k="Outstanding" v={money(outstanding)} tone={outstanding ? 'warn' : 'good'} />}
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid g2">
          <Card title="Contact & addresses">
            <dl className="kv">
              <dt>Contact person</dt><dd>{c.contact_person}</dd><dt>Mobile</dt><dd>{c.mobile || '—'}</dd><dt>Email</dt><dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</dd>
              <dt>Address</dt><dd>{c.address || '—'}</dd><dt>Billing address</dt><dd>{c.billing_address || c.address || '—'}</dd>
              <dt>Branch</dt><dd>{db.branches.find((b) => b.id === c.branch_id)?.name}</dd>
              <dt>Created</dt><dd>{fmtStamp(c.created_at)} by {db.users.find((u) => u.id === c.created_by)?.name ?? 'System'}</dd><dt>Last updated</dt><dd>{fmtStamp(c.updated_at)}</dd>
            </dl>
          </Card>
          <div className="stack">
            <Card title="Access instructions & notes"><p style={{ margin: 0 }}><b>Access:</b> {c.access_instructions || '—'}</p><p style={{ marginBottom: 0 }}><b>Notes:</b> {c.notes || '—'}</p></Card>
            {can('clients.tax') && <Card title="Tax information"><dl className="kv"><dt>TIN</dt><dd>{c.tin || '—'}</dd><dt>VAT status</dt><dd>{c.vat_status}</dd><dt>Withholding tax</dt><dd>{c.withholding_rate ? `${c.withholding_rate}%` : 'None'} {c.withholding_notes && <span className="muted">— {c.withholding_notes}</span>}</dd></dl></Card>}
          </div>
        </div>
      )}

      {tab === 'sites' && (
        <Card title="Service locations" actions={can('clients.edit') && <button className="btn sm primary" onClick={() => setSiteForm('new')}><Icon name="plus" />Add site</button>} flush>
          <ul className="list">{sites.map((s) => (
            <li key={s.id}><div><b>{s.name}</b><div className="small muted">{s.address}</div><div className="small">{s.contact_person} {s.contact_mobile && `· ${s.contact_mobile}`}</div><div className="small muted">Access: {s.access_instructions || '—'}</div></div>
              <div className="row">{jobs.filter((j) => j.site_id === s.id).length} jobs{can('clients.edit') && <><button className="btn sm" onClick={() => setSiteForm(s)}>Edit</button><button className="btn sm danger" onClick={() => attempt(() => store.remove('sites', s.id), 'Site removed')}>Remove</button></>}</div></li>
          ))}</ul>
        </Card>
      )}

      {tab === 'quotes' && (
        <Card flush><DataTable rows={quotes} rowKey={(q) => q.id} onRow={(q) => nav(`/sales/quote/${q.id}`)} exportTitle={`Quotations – ${c.name}`} initialSort={{ key: 'issue', dir: -1 }} cols={[
          { key: 'number', header: 'Quotation #', value: (q) => q.number }, { key: 'issue', header: 'Date', value: (q) => q.issue_date, render: (q) => fmtDate(q.issue_date) },
          { key: 'site', header: 'Site', value: (q) => db.sites.find((s) => s.id === q.site_id)?.name ?? '' },
          { key: 'total', header: 'Total', num: true, type: 'money', value: (q) => docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total, render: (q) => money(docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total) },
          { key: 'status', header: 'Status', value: (q) => q.status, render: (q) => <Badge>{q.status}</Badge> },
        ]} /></Card>
      )}

      {tab === 'jobs' && (
        <Card flush><DataTable rows={jobs} rowKey={(j) => j.id} onRow={(j) => nav(`/jobs/${j.id}`)} exportTitle={`Jobs – ${c.name}`} cols={[
          { key: 'number', header: 'Job #', value: (j) => j.number }, { key: 'date', header: 'Date', value: (j) => j.start_at, render: (j) => fmtDateTime(j.start_at) },
          { key: 'site', header: 'Site', value: (j) => db.sites.find((s) => s.id === j.site_id)?.name ?? '' },
          { key: 'svc', header: 'Services', value: (j) => j.service_codes.map((s) => db.services.find((x) => x.code === s)?.name).join(', ') },
          { key: 'status', header: 'Status', value: (j) => j.status, render: (j) => <Badge>{j.status}</Badge> },
        ]} /></Card>
      )}

      {tab === 'billing' && canFin && (
        <div className="stack">
          <Card title="Invoices" actions={<button className="btn sm" onClick={() => attempt(() => statementPdf(db, c.id, today()))}><Icon name="download" />Statement of account (PDF)</button>} flush>
            <DataTable rows={invs} rowKey={(i) => i.id} exportTitle={`Invoices – ${c.name}`} initialSort={{ key: 'issue', dir: -1 }} cols={[
              { key: 'number', header: 'Invoice #', value: (i) => i.number }, { key: 'issue', header: 'Issued', value: (i) => i.issue_date, render: (i) => fmtDate(i.issue_date) }, { key: 'due', header: 'Due', value: (i) => i.due_date, render: (i) => fmtDate(i.due_date) },
              { key: 'total', header: 'Total', num: true, type: 'money', value: (i) => invoiceTotals(i).total, render: (i) => money(invoiceTotals(i).total) },
              { key: 'bal', header: 'Balance', num: true, type: 'money', value: (i) => invoiceBalance(db, i), render: (i) => money(invoiceBalance(db, i)) },
              { key: 'st', header: 'Status', value: (i) => invoiceState(db, i), render: (i) => <Badge>{invoiceState(db, i)}</Badge> },
            ]} />
          </Card>
          <Card title="Payments received" flush>
            <DataTable rows={pays} rowKey={(p) => p.id} exportTitle={`Payments – ${c.name}`} cols={[
              { key: 'r', header: 'Receipt #', value: (p) => p.receipt_no }, { key: 'd', header: 'Date', value: (p) => p.date, render: (p) => fmtDate(p.date) }, { key: 'm', header: 'Method', value: (p) => p.method },
              { key: 'a', header: 'Amount', num: true, type: 'money', value: (p) => p.amount, render: (p) => money(p.amount) }, { key: 'w', header: 'WHT credited', num: true, type: 'money', value: (p) => p.wht_amount, render: (p) => money(p.wht_amount) },
              { key: 'x', header: 'Status', value: (p) => (p.reversed ? 'Reversed' : 'Posted'), render: (p) => <Badge>{p.reversed ? 'Reversed' : 'Posted'}</Badge> },
            ]} />
          </Card>
        </div>
      )}

      {tab === 'reports' && (
        <Card flush><DataTable rows={done} rowKey={(j) => j.id} exportTitle={`Service reports – ${c.name}`} cols={[
          { key: 'n', header: 'Job #', value: (j) => j.number }, { key: 'd', header: 'Completed', value: (j) => j.completed_at ?? '', render: (j) => fmtDateTime(j.completed_at) },
          { key: 'f', header: 'Findings', value: (j) => j.findings }, { key: 'r', header: 'Rating', value: (j) => j.client_rating ?? 0, render: (j) => (j.client_rating ? `${j.client_rating}/5` : '—') },
          { key: 'actions', header: '', sortable: false, noExport: true, render: (j) => <button className="btn sm" onClick={(e) => { e.stopPropagation(); attempt(() => serviceReportPdf(db, j)); }}>PDF</button> },
        ]} /></Card>
      )}

      {tab === 'complaints' && (
        <Card title="Complaints" actions={can('clients.edit') && <button className="btn sm primary" onClick={() => setCmp(true)}><Icon name="plus" />Log complaint</button>} flush>
          <ul className="list">{cmps.map((x) => (
            <li key={x.id}><div><b>{x.summary}</b><div className="small muted">{fmtStamp(x.created_at)} · {x.job_id ? db.jobs.find((j) => j.id === x.job_id)?.number : 'No job ref'}{x.resolution && ` · Resolution: ${x.resolution}`}</div></div>
              <div className="row"><Badge>{x.severity}</Badge><Badge>{x.status}</Badge>{can('clients.edit') && x.status !== 'Resolved' && <button className="btn sm" onClick={async () => { const r = await ask('Resolve complaint', 'Resolution'); if (r) attempt(() => store.update('complaints', x.id, { status: 'Resolved', resolution: r } as Partial<Complaint>), 'Marked resolved'); }}>Resolve</button>}</div></li>
          ))}{!cmps.length && <li className="muted">No complaints on record.</li>}</ul>
        </Card>
      )}

      {tab === 'comms' && (
        <Card title="Communication notes" actions={can('clients.edit') && <button className="btn sm primary" onClick={() => setComm(true)}><Icon name="plus" />Add note</button>} flush>
          <ul className="list">{comms.map((x) => (
            <li key={x.id}><div><Badge tone="blue">{x.channel}</Badge> <b>{x.summary}</b><div className="small muted">{fmtStamp(x.created_at)} · {db.users.find((u) => u.id === x.created_by)?.name}{x.follow_up_date && ` · follow-up ${fmtDate(x.follow_up_date)}`}</div></div>
              {x.follow_up_date && !x.follow_up_done && can('clients.edit') && <button className="btn sm" onClick={() => attempt(() => store.update('communications', x.id, { follow_up_done: true } as Partial<Communication>))}>{x.follow_up_date < today() ? 'Overdue – mark done' : 'Mark done'}</button>}</li>
          ))}{!comms.length && <li className="muted">No notes yet.</li>}</ul>
        </Card>
      )}

      {edit && <ClientForm initial={c} onClose={() => setEdit(false)} />}
      {siteForm && <SiteForm clientId={c.id} initial={siteForm === 'new' ? undefined : siteForm} onClose={() => setSiteForm(null)} />}
      {comm && <CommForm clientId={c.id} onClose={() => setComm(false)} />}
      {cmp && <ComplaintForm clientId={c.id} onClose={() => setCmp(false)} />}
    </>
  );
}

function CommForm({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const f = useObj({ channel: 'Call' as Communication['channel'], summary: '', follow_up_date: '' });
  return (
    <Modal title="Add communication note" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (!f.v.summary.trim()) return; attempt(() => store.insert('communications', { client_id: clientId, channel: f.v.channel, summary: f.v.summary, follow_up_date: f.v.follow_up_date || undefined, follow_up_done: false }), 'Note added'); onClose(); }}>Save</button></>}>
      <div className="form-grid">
        <Field label="Channel"><select {...f.bind('channel')}>{['Call', 'Email', 'Viber / WhatsApp', 'Visit', 'SMS', 'Note'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Follow-up date"><input type="date" {...f.bind('follow_up_date')} /></Field>
        <Field label="Summary" required className="full"><textarea {...f.bind('summary')} /></Field>
      </div>
    </Modal>
  );
}
function ComplaintForm({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { db } = useAuth();
  const f = useObj({ summary: '', severity: 'Medium' as Complaint['severity'], job_id: '' });
  const jobs = db.jobs.filter((j) => j.client_id === clientId);
  return (
    <Modal title="Log complaint" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (!f.v.summary.trim()) return; attempt(() => store.insert('complaints', { client_id: clientId, summary: f.v.summary, severity: f.v.severity, job_id: f.v.job_id || undefined, status: 'Open' }), 'Complaint logged'); onClose(); }}>Save</button></>}>
      <div className="form-grid">
        <Field label="Severity"><select {...f.bind('severity')}><option>Low</option><option>Medium</option><option>High</option></select></Field>
        <Field label="Related job"><select {...f.bind('job_id')}><option value="">None</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.number}</option>)}</select></Field>
        <Field label="What happened?" required className="full"><textarea {...f.bind('summary')} /></Field>
      </div>
    </Modal>
  );
}
