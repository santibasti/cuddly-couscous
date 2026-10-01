import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, attempt, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { invoiceBalance, isDone } from '@/lib/business';
import { money, sum } from '@/lib/util';
import type { Client, ClientStatus, ClientType } from '@/lib/types';

export const CLIENT_TYPES: ClientType[] = ['Residential', 'Commercial', 'Property Management', 'Government / LGU', 'Auto Dealership', 'Hospitality', 'Church', 'Industrial', 'School / Institution'];
const STATUSES: ClientStatus[] = ['Active', 'Prospect', 'Inactive'];

export function ClientForm({ initial, onClose }: { initial?: Client; onClose: () => void }) {
  const { db, can } = useAuth();
  const nav = useNavigate();
  const f = useObj<Omit<Client, 'id' | 'created_at' | 'updated_at' | 'created_by'>>(() => initial ?? {
    name: '', contact_person: '', mobile: '', email: '', address: '', billing_address: '', type: 'Commercial', status: 'Prospect', notes: '', access_instructions: '',
    tin: '', vat_status: 'VAT-registered', withholding_rate: 0, withholding_notes: '', branch_id: db.branches[0].id,
  });
  const tax = can('clients.tax') || !initial;
  const save = () => {
    if (!f.v.name.trim() || !f.v.contact_person.trim()) return attempt(() => { throw new Error('Client name and contact person are required.'); });
    if (f.v.email && !/^\S+@\S+\.\S+$/.test(f.v.email)) return attempt(() => { throw new Error('Enter a valid email address.'); });
    const r = attempt(() => (initial ? store.update('clients', initial.id, f.v, 'update', `Updated client ${f.v.name}`) : store.insert('clients', f.v)), 'Client saved');
    if (r) { onClose(); if (!initial) nav(`/clients/${(r as Client).id}`); }
  };
  return (
    <Modal title={initial ? 'Edit client' : 'New client'} size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save client</button></>}>
      <div className="form-grid">
        <Field label="Company / client name" required className="full"><input {...f.bind('name')} /></Field>
        <Field label="Contact person" required><input {...f.bind('contact_person')} /></Field>
        <Field label="Mobile number"><input {...f.bind('mobile')} placeholder="+63 9XX XXX XXXX" /></Field>
        <Field label="Email"><input type="email" {...f.bind('email')} /></Field>
        <Field label="Branch"><select {...f.bind('branch_id')}>{db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Client type"><select {...f.bind('type')}>{CLIENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Status"><select {...f.bind('status')}>{STATUSES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Address" className="full"><input {...f.bind('address')} /></Field>
        <Field label="Billing address" className="full"><input {...f.bind('billing_address')} placeholder="Same as address if blank" /></Field>
        <Field label="Access instructions"><textarea {...f.bind('access_instructions')} /></Field>
        <Field label="Notes"><textarea {...f.bind('notes')} /></Field>
        {tax && <>
          <Field label="TIN"><input {...f.bind('tin')} placeholder="000-000-000-000" /></Field>
          <Field label="VAT status"><select {...f.bind('vat_status')}><option>VAT-registered</option><option>Non-VAT</option><option>VAT-exempt</option></select></Field>
          <Field label="Withholding tax rate (%)" hint="Rate the client withholds on payment (e.g. 2% or 5%)."><input type="number" min={0} max={100} step="0.5" {...f.bind('withholding_rate')} /></Field>
          <Field label="Withholding tax details"><input {...f.bind('withholding_notes')} placeholder="e.g. Issues BIR 2307 quarterly" /></Field>
        </>}
      </div>
    </Modal>
  );
}

export default function Clients() {
  const { db, can } = useAuth();
  const nav = useNavigate();
  const [show, setShow] = useState(false);
  const [type, setType] = useState(''); const [status, setStatus] = useState('');
  const rows = live(db.clients).filter((c) => (!type || c.type === type) && (!status || c.status === status));
  const bal = (id: string) => sum(db.invoices.filter((i) => i.client_id === id && !i.deleted_at), (i) => invoiceBalance(db, i));
  const canFin = can('invoices.view');
  return (
    <>
      <PageHead title="Clients" sub="Client accounts, service sites and full service history.">
        {can('clients.edit') && <button className="btn primary" onClick={() => setShow(true)}><Icon name="plus" />New client</button>}
      </PageHead>
      <Card flush>
        <DataTable<Client>
          rows={rows} rowKey={(c) => c.id} onRow={(c) => nav(`/clients/${c.id}`)} exportTitle="Clients"
          filters={<><select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">All types</option>{CLIENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((t) => <option key={t}>{t}</option>)}</select></>}
          cols={[
            { key: 'name', header: 'Client', render: (c) => <div><b>{c.name}</b><div className="small muted">{c.contact_person}</div></div>, value: (c) => c.name + ' ' + c.contact_person },
            { key: 'type', header: 'Type', render: (c) => <Badge tone="blue">{c.type}</Badge>, value: (c) => c.type },
            { key: 'status', header: 'Status', render: (c) => <Badge>{c.status}</Badge>, value: (c) => c.status },
            { key: 'mobile', header: 'Mobile', value: (c) => c.mobile },
            { key: 'sites', header: 'Sites', num: true, value: (c) => db.sites.filter((s) => s.client_id === c.id && !s.deleted_at).length },
            { key: 'jobs', header: 'Jobs', num: true, value: (c) => db.jobs.filter((j) => j.client_id === c.id && isDone(j.status) && !j.deleted_at).length },
            ...(canFin ? [{ key: 'bal', header: 'Outstanding', num: true, type: 'money' as const, value: (c: Client) => bal(c.id), render: (c: Client) => (bal(c.id) > 0 ? money(bal(c.id)) : '—') }] : []),
          ]}
        />
      </Card>
      {show && <ClientForm onClose={() => setShow(false)} />}
    </>
  );
}
