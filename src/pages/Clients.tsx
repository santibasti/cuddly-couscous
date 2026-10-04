import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, attempt, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { FollowBadge, IntervalModal } from '@/components/FollowUps';
import { exportXlsx } from '@/lib/export';
import { FINAL_STATES, clientFollow, clientValue, intervalFor, intervalWords, type ClientFollow, type ClientValue } from '@/lib/followup-core';
import { fmtDate, money, today } from '@/lib/util';
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

type Row = { c: Client; v: ClientValue; f: ClientFollow; loc: string };
const FU_FILTERS = [['', 'All follow-up states'], ['due6', 'Due for Follow-Up: 6 Months'], ['due1y', 'Due for Follow-Up: 1 Year'], ['soon', 'Follow-Up Due Soon: next 30 days'], ['overdue', 'Follow-Up Overdue']] as const;
const EMPTY = { fu: '', type: '', status: '', service: '', from: '', to: '', loc: '', billedMin: '', billedMax: '', collMin: '', collMax: '', svcMin: '', svcMax: '', outMin: '', outMax: '' };
const inRangeN = (n: number, lo: string, hi: string) => (lo === '' || n >= Number(lo)) && (hi === '' || n <= Number(hi));

export default function Clients() {
  const { db, can } = useAuth();
  const nav = useNavigate();
  const [show, setShow] = useState(false);
  const [more, setMore] = useState(false);
  const [iv, setIv] = useState(false);
  const [q, setQ] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY, v: string) => setQ((o) => ({ ...o, [k]: v }));
  const t = today();
  const canFin = can('invoices.view'); const admin = can('followups.manage');
  const all: Row[] = useMemo(() => live(db.clients).map((c) => {
    const v = clientValue(db, c);
    return { c, v, f: clientFollow(db, c.id, t), loc: [c.address, v.location, ...db.sites.filter((s) => s.client_id === c.id && !s.deleted_at).map((s) => s.address)].join(' ') };
  }), [db, t]);
  const open = (r: Row) => !!r.f.focus && !FINAL_STATES.includes(r.f.focus.status);
  const rows = all.filter((r) => {
    const { f, v } = r;
    if (q.type && r.c.type !== q.type) return false;
    if (q.status && r.c.status !== q.status) return false;
    if (q.fu === 'due6' && !(open(r) && f.slot === 'short' && (f.days ?? 1) <= 0)) return false;
    if (q.fu === 'due1y' && !(open(r) && f.slot === 'long' && (f.days ?? 1) <= 0)) return false;
    if (q.fu === 'soon' && !(open(r) && (f.days ?? -1) >= 0 && (f.days ?? 99) <= 30)) return false;
    if (q.fu === 'overdue' && !(open(r) && (f.days ?? 0) < 0)) return false;
    if (q.service && !v.lastTypeCodes.includes(q.service as never)) return false;
    if ((q.from || q.to) && (!v.lastDate || (q.from && v.lastDate < q.from) || (q.to && v.lastDate > q.to))) return false;
    if (q.loc && !r.loc.toLowerCase().includes(q.loc.trim().toLowerCase())) return false;
    if (!inRangeN(v.completed, q.svcMin, q.svcMax)) return false;
    if (canFin && !(inRangeN(v.billed, q.billedMin, q.billedMax) && inRangeN(v.collected, q.collMin, q.collMax) && inRangeN(v.outstanding, q.outMin, q.outMax))) return false;
    return true;
  });
  const active = (Object.keys(EMPTY) as (keyof typeof EMPTY)[]).filter((k) => q[k] !== '');
  const exportList = () => attempt(() => exportXlsx({
    title: 'Clients - lifetime value and follow-up',
    subtitle: active.length ? `Filters: ${active.map((k) => `${k}=${q[k]}`).join(', ')}` : 'All clients',
    headers: ['Client', 'Type', 'Status', 'Contact person', 'Mobile', 'Location', 'Completed services', 'Last completed service', 'Last service type', 'Lifetime billed', 'Lifetime collected', 'Outstanding receivables', 'Follow-up interval', 'Next follow-up date', 'Follow-up status'],
    types: ['text', 'text', 'text', 'text', 'text', 'text', 'num', 'text', 'text', 'money', 'money', 'money', 'text', 'text', 'text'],
    rows: rows.map(({ c, v, f }) => { const iv2 = intervalFor(db, c.id, v.lastTypeCodes); return [c.name, c.type, c.status, c.contact_person, c.mobile, v.location, v.completed, v.lastDate ?? '', v.lastType, v.billed, v.collected, v.outstanding, `${intervalWords(iv2.short)} / ${intervalWords(iv2.long)}`, f.due ?? '', f.detail && f.status === 'Contacted' ? f.detail : f.status]; }),
  }));
  const sel = (k: keyof typeof EMPTY, label: string, opts: readonly (readonly [string, string])[]) => <select value={q[k]} onChange={(e) => set(k, e.target.value)} aria-label={label}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  const num = (k: keyof typeof EMPTY, label: string) => <label className="f"><span>{label}</span><input type="number" min={0} value={q[k]} onChange={(e) => set(k, e.target.value)} /></label>;
  return (
    <>
      <PageHead title="Clients" sub="Client accounts, service sites, lifetime value and maintenance follow-ups.">
        {admin && <button className="btn" onClick={() => setIv(true)}>Follow-up intervals</button>}
        {can('clients.edit') && <button className="btn primary" onClick={() => setShow(true)}><Icon name="plus" />New client</button>}
      </PageHead>
      <Card flush>
        <DataTable<Row>
          rows={rows} rowKey={(r) => r.c.id} onRow={(r) => nav(`/clients/${r.c.id}`)} exportTitle={admin ? undefined : 'Clients'}
          searchText={(r) => `${r.c.name} ${r.c.contact_person} ${r.c.mobile} ${r.loc}`}
          filters={<>
            {sel('type', 'Type', [['', 'All types'], ...CLIENT_TYPES.map((x) => [x, x] as const)])}
            {sel('status', 'Status', [['', 'All statuses'], ...STATUSES.map((x) => [x, x] as const)])}
            {sel('fu', 'Follow-up', FU_FILTERS)}
            <button className="btn sm" onClick={() => setMore((m) => !m)}>{more ? 'Fewer filters' : 'More filters'}{active.length ? ` (${active.length})` : ''}</button>
            {active.length > 0 && <button className="btn sm" onClick={() => setQ(EMPTY)}>Clear</button>}
          </>}
          actions={admin ? <button className="btn sm primary" onClick={exportList} title="Download the filtered list as Excel">Export filtered list (Excel)</button> : undefined}
          cols={[
            { key: 'name', header: 'Client', render: ({ c }) => <div><b>{c.name}</b><div className="small muted">{c.contact_person}</div></div>, value: ({ c }) => c.name + ' ' + c.contact_person },
            { key: 'type', header: 'Type', render: ({ c }) => <Badge tone="blue">{c.type}</Badge>, value: ({ c }) => c.type },
            { key: 'status', header: 'Status', render: ({ c }) => <Badge>{c.status}</Badge>, value: ({ c }) => c.status },
            { key: 'mobile', header: 'Mobile', value: ({ c }) => c.mobile },
            { key: 'sites', header: 'Sites', num: true, value: ({ c }) => db.sites.filter((s) => s.client_id === c.id && !s.deleted_at).length },
            { key: 'jobs', header: 'Completed services', num: true, value: ({ v }) => v.completed },
            { key: 'last', header: 'Last service', value: ({ v }) => v.lastDate ?? '', render: ({ v }) => (v.lastDate ? fmtDate(v.lastDate) : '—') },
            { key: 'ltype', header: 'Last service type', value: ({ v }) => v.lastType },
            ...(canFin ? [
              { key: 'billed', header: 'Lifetime billed', num: true, type: 'money' as const, value: ({ v }: Row) => v.billed, render: ({ v }: Row) => money(v.billed) },
              { key: 'coll', header: 'Lifetime collected', num: true, type: 'money' as const, value: ({ v }: Row) => v.collected, render: ({ v }: Row) => money(v.collected) },
              { key: 'bal', header: 'Outstanding', num: true, type: 'money' as const, value: ({ v }: Row) => v.outstanding, render: ({ v }: Row) => (v.outstanding > 0 ? money(v.outstanding) : '—') },
            ] : []),
            { key: 'next', header: 'Next follow-up', value: ({ f }) => f.due ?? '', render: ({ f }) => (f.due ? fmtDate(f.due) : '—') },
            { key: 'fstat', header: 'Follow-up status', value: ({ f }) => f.status, render: ({ f }) => <FollowBadge status={f.status} detail={f.detail} /> },
          ]}
        />
        {more && (
          <div className="filterbar" style={{ margin: 12 }}>
            <label className="f"><span>Last service type</span><select value={q.service} onChange={(e) => set('service', e.target.value)}><option value="">Any</option>{db.services.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
            <label className="f"><span>Last service from</span><input type="date" value={q.from} onChange={(e) => set('from', e.target.value)} /></label>
            <label className="f"><span>Last service to</span><input type="date" value={q.to} onChange={(e) => set('to', e.target.value)} /></label>
            <label className="f"><span>Location contains</span><input value={q.loc} placeholder="e.g. Makati" onChange={(e) => set('loc', e.target.value)} /></label>
            {num('svcMin', 'Completed services ≥')}{num('svcMax', 'Completed services ≤')}
            {canFin && <>{num('billedMin', 'Lifetime billed ≥')}{num('billedMax', 'Lifetime billed ≤')}{num('collMin', 'Lifetime collected ≥')}{num('collMax', 'Lifetime collected ≤')}{num('outMin', 'Outstanding ≥')}{num('outMax', 'Outstanding ≤')}</>}
          </div>
        )}
      </Card>
      {show && <ClientForm onClose={() => setShow(false)} />}
      {iv && <IntervalModal onClose={() => setIv(false)} />}
    </>
  );
}
