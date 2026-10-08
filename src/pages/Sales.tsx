import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, Stat, Tabs, attempt, useObj, ask } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { docTotals } from '@/lib/business';
import { moveInquiry, setQuoteStatus } from '@/lib/actions';
import { fmtDate, money, sum } from '@/lib/util';
import type { Inquiry, InquiryStage, Quotation, ServiceCode } from '@/lib/types';

const STAGES: InquiryStage[] = ['Inquiry', 'Ocular Visit', 'Quotation', 'Client Approval', 'Booked', 'Lost'];

function InquiryForm({ onClose }: { onClose: () => void }) {
  const { db } = useAuth();
  const f = useObj({ client_id: db.clients[0]?.id ?? '', site_id: '', service_codes: [] as ServiceCode[], source: 'Phone call', details: '', ocular_date: '' });
  const sites = db.sites.filter((s) => s.client_id === f.v.client_id);
  const toggle = (c: ServiceCode) => f.set('service_codes', f.v.service_codes.includes(c) ? f.v.service_codes.filter((x) => x !== c) : [...f.v.service_codes, c]);
  return (
    <Modal title="New inquiry" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => {
      if (!f.v.service_codes.length) return attempt(() => { throw new Error('Choose at least one service.'); });
      attempt(() => store.insert('inquiries', { ...f.v, site_id: f.v.site_id || undefined, ocular_date: f.v.ocular_date || undefined, stage: f.v.ocular_date ? 'Ocular Visit' : 'Inquiry', assigned_to: db.employees.find((e) => e.id === store.user?.employee_id)?.id }), 'Inquiry logged'); onClose();
    }}>Save inquiry</button></>}>
      <div className="form-grid">
        <Field label="Client" required><select value={f.v.client_id} onChange={(e) => { f.set('client_id', e.target.value); f.set('site_id', ''); }}>{live(db.clients).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Service site"><select {...f.bind('site_id')}><option value="">—</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Source"><input {...f.bind('source')} /></Field>
        <Field label="Ocular visit date"><input type="date" {...f.bind('ocular_date')} /></Field>
        <div className="full"><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Services requested</div><div className="row">{live(db.services).map((s) => <label key={s.code} className="check"><input type="checkbox" checked={f.v.service_codes.includes(s.code)} onChange={() => toggle(s.code)} />{s.name}</label>)}</div></div>
        <Field label="Details" className="full"><textarea {...f.bind('details')} /></Field>
      </div>
    </Modal>
  );
}

export default function Sales() {
  const { db, can } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<'pipeline' | 'quotes' | 'winloss'>('pipeline');
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState('');
  const quotes = live(db.quotations);
  const total = (q: Quotation) => docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total;
  const cn = (id: string) => db.clients.find((c) => c.id === id)?.name ?? '—';
  const sent = quotes.filter((q) => q.status !== 'Draft');
  const won = quotes.filter((q) => q.status === 'Approved'), lost = quotes.filter((q) => q.status === 'Rejected' || q.status === 'Expired');
  const inq = live(db.inquiries);
  const canEdit = can('sales.edit');

  return (
    <>
      <PageHead title="Sales pipeline & quotations" sub="Inquiry → Ocular Visit → Quotation → Client Approval → Booking">
        {canEdit && <button className="btn" onClick={() => setShow(true)}><Icon name="plus" />New inquiry</button>}
        {canEdit && <button className="btn primary" onClick={() => nav('/sales/quote/new')}><Icon name="plus" />New quotation</button>}
      </PageHead>
      <Tabs tabs={[{ id: 'pipeline', label: 'Pipeline', count: inq.filter((i) => !['Booked', 'Lost'].includes(i.stage)).length }, { id: 'quotes', label: 'Quotations', count: quotes.length }, { id: 'winloss', label: 'Sent / won / lost' }]} value={tab} onChange={setTab} />

      {tab === 'pipeline' && (
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(230px, 1fr)', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {STAGES.map((st) => (
            <div key={st} className="card" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData('text/inq'); if (id && canEdit) attempt(() => moveInquiry(id, st)); }}>
              <div className="card-h"><b>{st}</b><span className="badge">{inq.filter((i) => i.stage === st).length}</span></div>
              <div className="card-b stack" style={{ padding: 10, minHeight: 80 }}>
                {inq.filter((i) => i.stage === st).map((i: Inquiry) => (
                  <div key={i.id} className="card" draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData('text/inq', i.id)} style={{ padding: 10, cursor: canEdit ? 'grab' : 'default' }}>
                    <b>{cn(i.client_id)}</b>
                    <div className="small muted">{i.service_codes.map((c) => db.services.find((s) => s.code === c)?.name.split(' ')[0]).join(', ')} · {i.source}</div>
                    <div className="small" style={{ margin: '4px 0' }}>{i.details}</div>
                    {i.ocular_date && <div className="small"><Icon name="calendar" size={12} /> Ocular {fmtDate(i.ocular_date)}</div>}
                    {canEdit && <div className="row" style={{ marginTop: 6 }}>
                      <select value={i.stage} onChange={(e) => attempt(() => moveInquiry(i.id, e.target.value as InquiryStage))} style={{ minHeight: 28, padding: '2px 6px', fontSize: 12 }} aria-label="Stage">{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
                      {!['Booked', 'Lost'].includes(i.stage) && <button className="btn sm" onClick={() => nav(`/sales/quote/new?client=${i.client_id}&inquiry=${i.id}`)}>Quote</button>}
                    </div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'quotes' && (
        <Card flush>
          <DataTable<Quotation> rows={quotes.filter((q) => !status || q.status === status)} rowKey={(q) => q.id} onRow={(q) => nav(`/sales/quote/${q.id}`)} exportTitle="Quotations" initialSort={{ key: 'issue', dir: -1 }}
            filters={<select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{['Draft', 'Sent', 'Approved', 'Rejected', 'Expired'].map((s) => <option key={s}>{s}</option>)}</select>}
            cols={[
              { key: 'number', header: 'Quotation #', value: (q) => q.number }, { key: 'client', header: 'Client', value: (q) => cn(q.client_id) },
              { key: 'issue', header: 'Issued', value: (q) => q.issue_date, render: (q) => fmtDate(q.issue_date) }, { key: 'valid', header: 'Valid until', value: (q) => q.valid_until, render: (q) => fmtDate(q.valid_until) },
              { key: 'total', header: 'Total', num: true, type: 'money', value: total, render: (q) => money(total(q)) }, { key: 'status', header: 'Status', value: (q) => q.status, render: (q) => <Badge>{q.status}</Badge> },
              { key: 'actions', header: '', sortable: false, noExport: true, render: (q) => q.status === 'Sent' && can('sales.approve') ? <span className="row" onClick={(e) => e.stopPropagation()}><button className="btn sm primary" onClick={() => attempt(() => setQuoteStatus(q.id, 'Approved'), 'Marked approved')}>Approve</button><button className="btn sm" onClick={async () => { const r = await ask('Reject quotation', 'Reason'); if (r) attempt(() => setQuoteStatus(q.id, 'Rejected', r), 'Marked rejected'); }}>Reject</button></span> : null },
            ]} />
        </Card>
      )}

      {tab === 'winloss' && (
        <div className="stack">
          <div className="grid g4 keep2">
            <Stat k="Quotations sent" v={sent.length} s={money(sum(sent, total))} tone="navy" />
            <Stat k="Won (approved)" v={won.length} s={money(sum(won, total))} tone="good" />
            <Stat k="Lost / expired" v={lost.length} s={money(sum(lost, total))} tone="bad" />
            <Stat k="Win rate" v={`${sent.length ? Math.round((won.length / Math.max(1, won.length + lost.length)) * 100) : 0}%`} s="of decided quotations" />
          </div>
          <Card title="Lost & expired quotations" flush>
            <ul className="list">{lost.map((q) => <li key={q.id}><div><b>{q.number}</b> · {cn(q.client_id)}<div className="small muted">{q.reject_reason ?? (q.status === 'Expired' ? 'No response before validity date' : '')}</div></div><span><Badge>{q.status}</Badge> <b className="mono">{money(total(q))}</b></span></li>)}{!lost.length && <li className="muted">None.</li>}</ul>
          </Card>
        </div>
      )}
      {show && <InquiryForm onClose={() => setShow(false)} />}
    </>
  );
}
