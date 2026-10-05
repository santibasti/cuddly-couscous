import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { IncidentsPanel } from '@/components/workflow/Incidents';
import { Badge, Card, Field, Icon, Modal, PageHead, PhotoInput, Photos, Stat, Tabs, attempt, ask, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { QrImage } from '@/components/Qr';
import { qrLabelsPdf } from '@/lib/export';
import { isOverdue, rejectCheckout, releaseCheckout, requestCheckout, returnCheckout, scheduleMaintenance, updateTicket } from '@/lib/actions';
import { isOpen, nextDue } from '@/lib/business';
import { addDays, diffDays, fmtDate, fmtDateTime, money, nowLocal, sum, today } from '@/lib/util';
import type { Asset, AssetCategory, Checkout, Condition, MaintenanceTicket } from '@/lib/types';

const CATS: AssetCategory[] = ['RO/DI Pure-Water System', 'Water-Fed Pole', 'Pressure Washer', 'Surface Cleaner', 'Industrial Vacuum', 'Pump', 'Hose', 'Ladder', 'Extension Cord', 'Safety Equipment', 'Vehicle', 'Other'];
const CONDS: Condition[] = ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];

function AssetForm({ initial, onClose }: { initial?: Asset; onClose: () => void }) {
  const { db } = useAuth();
  const f = useObj<Omit<Asset, 'id' | 'created_at' | 'updated_at' | 'created_by'>>(() => initial ?? { code: '', name: '', category: 'Pressure Washer', brand: '', model: '', serial: '', purchase_date: today(), purchase_cost: 0, condition: 'Good', location: 'Main Warehouse', maintenance_interval_days: 90, status: 'Available', daily_allocation: 0 });
  const save = () => {
    if (!f.v.code.trim() || !f.v.name.trim()) return attempt(() => { throw new Error('Asset ID and name are required.'); });
    if (!initial && db.assets.some((a) => a.code === f.v.code && !a.deleted_at)) return attempt(() => { throw new Error('Asset ID already exists.'); });
    attempt(() => (initial ? store.update('assets', initial.id, f.v) : store.insert('assets', f.v)), 'Asset saved'); onClose();
  };
  return (
    <Modal title={initial ? `Edit ${initial.code}` : 'New asset'} size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save asset</button></>}>
      <div className="form-grid">
        <Field label="Asset ID" required><input {...f.bind('code')} placeholder="e.g. PWR-003" /></Field><Field label="Name" required><input {...f.bind('name')} /></Field>
        <Field label="Category"><select {...f.bind('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field><Field label="Status"><select {...f.bind('status')}>{['Available', 'Reserved', 'In Use', 'Under Maintenance', 'Damaged', 'Missing', 'Retired'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Brand"><input {...f.bind('brand')} /></Field><Field label="Model"><input {...f.bind('model')} /></Field><Field label="Serial number"><input {...f.bind('serial')} /></Field><Field label="Purchase date"><input type="date" {...f.bind('purchase_date')} /></Field>
        <Field label="Purchase cost (₱)"><input type="number" min="0" {...f.bind('purchase_cost')} /></Field><Field label="Daily cost allocation to jobs (₱)"><input type="number" min="0" {...f.bind('daily_allocation')} /></Field>
        <Field label="Condition"><select {...f.bind('condition')}>{CONDS.map((c) => <option key={c}>{c}</option>)}</select></Field><Field label="Current location"><input {...f.bind('location')} /></Field>
        <Field label="Maintenance interval (days)"><input type="number" min="0" {...f.bind('maintenance_interval_days')} /></Field>
        <Field label="Assigned custodian"><select value={f.v.custodian_id ?? ''} onChange={(e) => f.set('custodian_id', e.target.value || undefined)}><option value="">—</option>{live(db.employees).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
        <Field label="Meter unit (hrs / km)"><input value={f.v.meter_unit ?? ''} onChange={(e) => f.set('meter_unit', e.target.value || undefined)} /></Field><Field label="Current meter reading"><input type="number" value={f.v.meter_reading ?? ''} onChange={(e) => f.set('meter_reading', e.target.value === '' ? undefined : +e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function RequestModal({ assetId, jobId, onClose }: { assetId?: string; jobId?: string; onClose: () => void }) {
  const { db, user } = useAuth();
  const jobs = live(db.jobs).filter((j) => isOpen(j.status) && (!!user && (db.employees.find((e) => e.id === user.employee_id) ? true : true)));
  const j0 = jobs.find((j) => j.id === jobId) ?? jobs[0];
  const f = useObj({ asset_id: assetId ?? live(db.assets).find((a) => a.status === 'Available' || a.status === 'Reserved')?.id ?? '', job_id: j0?.id ?? '', responsible_id: user?.employee_id ?? j0?.leader_id ?? '', expected_return: (j0?.end_at ?? `${today()}T18:00`), note: '' });
  return (
    <Modal title="Request equipment for a job" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => requestCheckout(f.v), 'Request sent for approval')) onClose(); }}>Submit request</button></>}>
      <div className="form-grid">
        <Field label="Machine / equipment" className="full"><select {...f.bind('asset_id')}>{live(db.assets).filter((a) => a.status !== 'Retired').map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name} ({a.status})</option>)}</select></Field>
        <Field label="Job" className="full"><select value={f.v.job_id} onChange={(e) => { f.set('job_id', e.target.value); const j = jobs.find((x) => x.id === e.target.value); if (j) f.set('expected_return', j.end_at); }}>{jobs.map((j) => <option key={j.id} value={j.id}>{j.number} · {db.clients.find((c) => c.id === j.client_id)?.name} · {j.start_at.slice(0, 10)}</option>)}</select></Field>
        <Field label="Employee responsible"><select {...f.bind('responsible_id')}>{live(db.employees).filter((e) => e.status !== 'inactive').map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
        <Field label="Expected return"><input type="datetime-local" {...f.bind('expected_return')} /></Field>
        <Field label="Note" className="full"><input {...f.bind('note')} /></Field>
      </div>
    </Modal>
  );
}

function ReleaseModal({ co, onClose }: { co: Checkout; onClose: () => void }) {
  const { db } = useAuth();
  const a = db.assets.find((x) => x.id === co.asset_id)!;
  const [cond, setCond] = useState<Condition>(a.condition);
  const [meter, setMeter] = useState<number | undefined>(a.meter_reading);
  return (
    <Modal title={`Release ${a.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => releaseCheckout(co.id, { condition: cond, meter: a.category === 'Vehicle' ? undefined : meter }), 'Released — asset is now checked out')) onClose(); }}>Release equipment</button></>}>
      <div className="form-grid">
        <div className="full alert info">Releasing to <b>{db.employees.find((e) => e.id === co.responsible_id)?.full_name}</b> for <b>{db.jobs.find((j) => j.id === co.job_id)?.number}</b>. Out time is stamped now ({fmtDateTime(nowLocal())}).</div>
        <Field label="Condition at release"><select value={cond} onChange={(e) => setCond(e.target.value as Condition)}>{CONDS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        {a.meter_unit && a.category !== 'Vehicle' && <Field label={`Meter reading (${a.meter_unit})`}><input type="number" value={meter ?? ''} onChange={(e) => setMeter(e.target.value === '' ? undefined : +e.target.value)} /></Field>}
      </div>
    </Modal>
  );
}

function ReturnModal({ co, onClose }: { co: Checkout; onClose: () => void }) {
  const { db } = useAuth();
  const a = db.assets.find((x) => x.id === co.asset_id)!;
  const f = useObj({ cond: 'Good' as Condition, meter: undefined as number | undefined, damage: '', missing: '' });
  return (
    <Modal title={`Return ${a.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => returnCheckout(co.id, { condition: f.v.cond, meter: a.category === 'Vehicle' ? undefined : f.v.meter, damage_notes: f.v.damage, missing: f.v.missing }), 'Returned')) onClose(); }}>Confirm return</button></>}>
      <div className="form-grid">
        <Field label="Condition on return"><select value={f.v.cond} onChange={(e) => f.set('cond', e.target.value as Condition)}>{CONDS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        {a.meter_unit && a.category !== 'Vehicle' && <Field label={`Meter reading (${a.meter_unit})`} hint={co.out_meter !== undefined ? `Out: ${co.out_meter}` : undefined}><input type="number" value={f.v.meter ?? ''} onChange={(e) => f.set('meter', e.target.value === '' ? undefined : +e.target.value)} /></Field>}
        <Field label="Damage notes" className="full" hint="Damage automatically opens a repair ticket and takes the asset out of service."><textarea value={f.v.damage} onChange={(e) => f.set('damage', e.target.value)} /></Field>
        <Field label="Missing accessories" className="full"><input value={f.v.missing} onChange={(e) => f.set('missing', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function QrModal({ a, onClose }: { a: Asset; onClose: () => void }) {
  return (
    <Modal title={`QR label – ${a.code}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => attempt(() => qrLabelsPdf([a]), 'Label downloaded')}><Icon name="download" />Download label (PDF)</button></>}>
      <div style={{ textAlign: 'center' }}><QrImage code={a.code} size={220} /><h2 style={{ marginTop: 8 }}>{a.code}</h2><div className="muted">{a.name}</div><p className="small muted">Stick this on the machine. Team leaders scan it at departure and return.</p></div>
    </Modal>
  );
}
function LabelsModal({ assets, onClose }: { assets: Asset[]; onClose: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set(assets.map((a) => a.id)));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Modal title="Print QR labels" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!sel.size} onClick={() => attempt(() => qrLabelsPdf(assets.filter((a) => sel.has(a.id))), 'Labels downloaded')}><Icon name="download" />Download {sel.size} label(s) (PDF)</button></>}>
      <div className="row" style={{ marginBottom: 8 }}><button className="btn sm" onClick={() => setSel(new Set(assets.map((a) => a.id)))}>Select all</button><button className="btn sm" onClick={() => setSel(new Set())}>None</button></div>
      <div className="grid g-auto" style={{ maxHeight: 360, overflow: 'auto' }}>{assets.map((a) => <label key={a.id} className="check"><input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} />{a.code} · {a.name}</label>)}</div>
      <p className="small muted">A4 sheet, 3 × 8 labels. Print on adhesive sticker paper and laminate for outdoor use.</p>
    </Modal>
  );
}

function CloseTicket({ t, onClose }: { t: MaintenanceTicket; onClose: () => void }) {
  const f = useObj({ cost: t.cost, vendor: t.vendor ?? '' });
  return <Modal title="Close maintenance ticket" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => updateTicket(t.id, { status: 'Closed', cost: f.v.cost, vendor: f.v.vendor }), 'Ticket closed; asset back in service')) onClose(); }}>Close & return to service</button></>}><div className="form-grid"><Field label="Repair cost (₱)" hint="Creates a pending Equipment Repair expense."><input type="number" min="0" {...f.bind('cost')} /></Field><Field label="Vendor"><input {...f.bind('vendor')} /></Field></div></Modal>;
}

export default function Assets() {
  const { db, can } = useAuth();
  const [sp] = useSearchParams();
  const view = can('assets.view');
  const [tab, setTab] = useState<'register' | 'outin' | 'maint' | 'util' | 'incidents'>(sp.get('tab') === 'incidents' && (can('dispatch.view') || view) ? 'incidents' : sp.get('tab') === 'maint' && view ? 'maint' : view ? 'register' : 'outin');
  const [modal, setModal] = useState<'asset' | Asset | 'request' | null>(sp.get('request') ? 'request' : null);
  const [qr, setQr] = useState<Asset | null>(null); const [labels, setLabels] = useState(sp.get('labels') === '1');
  const [rel, setRel] = useState<Checkout | null>(null); const [ret, setRet] = useState<Checkout | null>(null); const [tk, setTk] = useState<MaintenanceTicket | null>(null);
  const [cat, setCat] = useState(''); const [st, setSt] = useState('');
  const [days, setDays] = useState(90);
  const T = today();
  const assets = live(db.assets);
  const an = (id: string) => db.assets.find((a) => a.id === id);
  const checkouts = live(db.checkouts).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const overdue = checkouts.filter(isOverdue);
  const custodian = (a: Asset) => db.employees.find((e) => e.id === a.custodian_id)?.full_name ?? '—';

  const util = assets.filter((a) => a.status !== 'Retired').map((a) => {
    const from = addDays(T, -days);
    const outDays = sum(checkouts.filter((c) => c.asset_id === a.id && c.out_at && c.status !== 'Requested' && c.status !== 'Rejected'), (c) => {
      const s = c.out_at!.slice(0, 10) < from ? from : c.out_at!.slice(0, 10); const e = (c.in_at ?? nowLocal()).slice(0, 10);
      return e < from ? 0 : Math.max(1, diffDays(e, s) + 1);
    });
    const down = sum(live(db.tickets).filter((t) => t.asset_id === a.id), (t) => { const s = t.opened_on < from ? from : t.opened_on; const e = t.closed_on ?? T; return e < from ? 0 : diffDays(e, s) + 1; });
    const cost = sum(live(db.tickets).filter((t) => t.asset_id === a.id && (t.closed_on ?? T) >= from), (t) => t.cost);
    const trips = checkouts.filter((c) => c.asset_id === a.id && c.out_at && c.out_at.slice(0, 10) >= from).length;
    return { a, outDays: Math.min(days, outDays), down: Math.min(days, down), cost, trips, util: Math.round((Math.min(days, outDays) / days) * 100) };
  });

  return (
    <>
      <PageHead title="Machines, equipment & vehicles" sub="Asset register with controlled out/in. An asset can never be checked out to two jobs at once.">
        {can('assets.request') && <button className="btn primary" onClick={() => setModal('request')}><Icon name="plus" />Request equipment</button>}
        {view && <button className="btn" onClick={() => setLabels(true)}><Icon name="qr" />QR labels</button>}
        {can('assets.edit') && <button className="btn" onClick={() => setModal('asset')}><Icon name="plus" />New asset</button>}
      </PageHead>
      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        <Stat k="Checked out" v={checkouts.filter((c) => c.status === 'Released').length} tone="navy" /><Stat k="Overdue returns" v={overdue.length} tone={overdue.length ? 'bad' : 'good'} />
        <Stat k="Awaiting release approval" v={checkouts.filter((c) => c.status === 'Requested').length} tone="warn" /><Stat k="Under repair / damaged" v={assets.filter((a) => ['Under Maintenance', 'Damaged'].includes(a.status)).length} tone="warn" />
      </div>
      <Tabs tabs={[...(view ? [{ id: 'register' as const, label: 'Asset register', count: assets.length }] : []), { id: 'outin', label: 'Out / In', count: checkouts.filter((c) => c.status === 'Requested').length }, ...(view ? [{ id: 'maint' as const, label: 'Maintenance', count: live(db.tickets).filter((t) => t.status !== 'Closed').length }, { id: 'util' as const, label: 'Utilization & downtime' }] : []), ...(can('dispatch.view') ? [{ id: 'incidents' as const, label: 'Incidents', count: live(db.incidents).filter((i) => ['Open', 'Investigating'].includes(i.status)).length }] : [])]} value={tab} onChange={setTab} />

      {tab === 'register' && view && (
        <Card flush><DataTable<Asset> rows={assets.filter((a) => (!cat || a.category === cat) && (!st || a.status === st))} rowKey={(a) => a.id} exportTitle="Asset register" pageSize={15}
          filters={<><select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select><select value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status"><option value="">All statuses</option>{['Available', 'Reserved', 'In Use', 'Under Maintenance', 'Damaged', 'Missing', 'Retired'].map((c) => <option key={c}>{c}</option>)}</select></>}
          cols={[
            { key: 'code', header: 'Asset ID', value: (a) => a.code }, { key: 'name', header: 'Name', value: (a) => a.name, render: (a) => <div><b>{a.name}</b><div className="small muted">{a.brand} {a.model} · S/N {a.serial}</div></div> }, { key: 'cat', header: 'Category', value: (a) => a.category },
            { key: 'pd', header: 'Purchased', value: (a) => a.purchase_date, render: (a) => fmtDate(a.purchase_date) }, ...(can('profit.view') ? [{ key: 'pc', header: 'Cost', num: true, type: 'money' as const, value: (a: Asset) => a.purchase_cost, render: (a: Asset) => money(a.purchase_cost) }] : []),
            { key: 'cond', header: 'Condition', value: (a) => a.condition, render: (a) => <Badge>{a.condition}</Badge> }, { key: 'loc', header: 'Location', value: (a) => a.location }, { key: 'cust', header: 'Custodian', value: custodian },
            { key: 'due', header: 'Next maintenance', value: (a) => nextDue(a) ?? '', render: (a) => { const d = nextDue(a); return d ? <span>{fmtDate(d)} {d < T && <Badge tone="red">overdue</Badge>}</span> : '—'; } },
            { key: 'st', header: 'Status', value: (a) => a.status, render: (a) => <Badge>{a.status}</Badge> },
            { key: 'actions', header: '', noExport: true, sortable: false, render: (a) => <span className="row"><button className="btn sm" onClick={() => setQr(a)} aria-label={`QR code for ${a.code}`}><Icon name="qr" size={14} /></button>{can('assets.edit') && <button className="btn sm" onClick={() => setModal(a)}>Edit</button>}{can('assets.edit') && <button className="btn sm" onClick={async () => { const d = await ask('Schedule maintenance', 'Work to be done'); if (d) attempt(() => scheduleMaintenance(a.id, d), 'Ticket created'); }}>Maintain</button>}</span> },
          ]} /></Card>
      )}

      {tab === 'outin' && (
        <Card flush><DataTable<Checkout> rows={checkouts} rowKey={(c) => c.id} exportTitle="Machine out-in report" pageSize={15} cols={[
          { key: 'asset', header: 'Equipment', value: (c) => an(c.asset_id)?.name ?? '', render: (c) => <div><b>{an(c.asset_id)?.name}</b><div className="small muted">{an(c.asset_id)?.code}</div></div> },
          { key: 'job', header: 'Job', value: (c) => db.jobs.find((j) => j.id === c.job_id)?.number ?? '' }, { key: 'who', header: 'Responsible', value: (c) => db.employees.find((e) => e.id === c.responsible_id)?.full_name ?? '' },
          { key: 'out', header: 'Out', value: (c) => c.out_at ?? '', render: (c) => (c.out_at ? <div>{fmtDateTime(c.out_at)}<div className="small muted">{c.out_condition}{c.out_meter !== undefined && ` · ${c.out_meter}`}</div></div> : '—') },
          { key: 'due', header: 'Due back', value: (c) => c.expected_return, render: (c) => fmtDateTime(c.expected_return) },
          { key: 'in', header: 'In', value: (c) => c.in_at ?? '', render: (c) => (c.in_at ? <div>{fmtDateTime(c.in_at)}<div className="small muted">{c.in_condition}{c.in_meter !== undefined && ` · ${c.in_meter}`}</div>{c.damage_notes && <div className="small" style={{ color: 'var(--red)' }}>{c.damage_notes}</div>}</div> : '—') },
          { key: 'st', header: 'Status', value: (c) => (isOverdue(c) ? 'Overdue' : c.status), render: (c) => <span className="row" style={{ gap: 4 }}><Badge>{c.status}</Badge>{isOverdue(c) && <Badge tone="red">Overdue</Badge>}</span> },
          { key: 'actions', header: '', noExport: true, sortable: false, render: (c) => <span className="row">
            {c.status === 'Requested' && can('assets.approve') && <><button className="btn sm primary" onClick={() => setRel(c)}>Release</button><button className="btn sm" onClick={async () => { const n = await ask('Reject request', 'Reason'); if (n) attempt(() => rejectCheckout(c.id, n), 'Request rejected'); }}>Reject</button></>}
            {c.status === 'Released' && can('assets.request') && <button className="btn sm navy" onClick={() => setRet(c)}>Return</button>}</span> },
        ]} /></Card>
      )}

      {tab === 'maint' && view && (
        <div className="stack">
          <Card title="Due for scheduled maintenance" flush><ul className="list">{assets.filter((a) => a.status !== 'Retired' && nextDue(a) && nextDue(a)! <= addDays(T, db.settings.reminder_days.maintenance)).map((a) => <li key={a.id}><div><b>{a.name}</b><div className="small muted">Last serviced {fmtDate(a.last_maintenance ?? a.purchase_date)} · every {a.maintenance_interval_days} days</div></div><span className="row"><Badge tone={nextDue(a)! < T ? 'red' : 'amber'}>{nextDue(a)! < T ? `${diffDays(T, nextDue(a)!)}d overdue` : `due ${fmtDate(nextDue(a))}`}</Badge>{can('assets.edit') && <button className="btn sm" onClick={() => attempt(() => scheduleMaintenance(a.id, `Scheduled service (${a.maintenance_interval_days}-day interval)`), 'Ticket created')}>Create ticket</button>}</span></li>)}{!assets.some((a) => a.status !== 'Retired' && nextDue(a) && nextDue(a)! <= addDays(T, 7)) && <li className="muted">Nothing due.</li>}</ul></Card>
          <Card title="Repair & maintenance tickets" flush><DataTable<MaintenanceTicket> rows={live(db.tickets)} rowKey={(t) => t.id} exportTitle="Equipment maintenance report" initialSort={{ key: 'opened', dir: -1 }} cols={[
            { key: 'a', header: 'Asset', value: (t) => an(t.asset_id)?.name ?? '' }, { key: 'src', header: 'Source', value: (t) => t.source }, { key: 'd', header: 'Issue', value: (t) => t.description },
            { key: 'opened', header: 'Opened', value: (t) => t.opened_on, render: (t) => fmtDate(t.opened_on) }, { key: 'closed', header: 'Closed', value: (t) => t.closed_on ?? '', render: (t) => fmtDate(t.closed_on) },
            { key: 'cost', header: 'Cost', num: true, type: 'money', value: (t) => t.cost, render: (t) => money(t.cost) }, { key: 'st', header: 'Status', value: (t) => t.status, render: (t) => <Badge>{t.status}</Badge> },
            { key: 'actions', header: '', noExport: true, sortable: false, render: (t) => can('assets.edit') && t.status !== 'Closed' ? <span className="row">{t.status === 'Open' && <button className="btn sm" onClick={() => attempt(() => updateTicket(t.id, { status: 'In Repair' }), 'Asset moved to Under Maintenance')}>Start repair</button>}<button className="btn sm primary" onClick={() => setTk(t)}>Close</button></span> : null },
          ]} /></Card>
        </div>
      )}

      {tab === 'incidents' && can('dispatch.view') && <IncidentsPanel />}
      {tab === 'util' && view && (
        <Card title="Equipment utilization & downtime" actions={<select value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Window"><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={180}>Last 180 days</option></select>} flush>
          <DataTable rows={util} rowKey={(u) => u.a.id} exportTitle={`Equipment utilization (${days}d)`} initialSort={{ key: 'util', dir: -1 }} cols={[
            { key: 'a', header: 'Asset', value: (u) => u.a.name }, { key: 'cat', header: 'Category', value: (u) => u.a.category }, { key: 'trips', header: 'Job checkouts', num: true, value: (u) => u.trips },
            { key: 'out', header: 'Days out', num: true, value: (u) => u.outDays }, { key: 'util', header: 'Utilization', num: true, type: 'pct', value: (u) => u.util, render: (u) => `${u.util}%` },
            { key: 'down', header: 'Downtime days', num: true, value: (u) => u.down }, { key: 'cost', header: 'Repair cost', num: true, type: 'money', value: (u) => u.cost, render: (u) => money(u.cost) },
          ]} />
        </Card>
      )}
      {modal === 'asset' && <AssetForm onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <AssetForm initial={modal} onClose={() => setModal(null)} />}
      {modal === 'request' && <RequestModal assetId={sp.get('request') ?? undefined} jobId={sp.get('job') ?? undefined} onClose={() => setModal(null)} />}
      {rel && <ReleaseModal co={rel} onClose={() => setRel(null)} />}
      {ret && <ReturnModal co={ret} onClose={() => setRet(null)} />}
      {tk && <CloseTicket t={tk} onClose={() => setTk(null)} />}
      {qr && <QrModal a={qr} onClose={() => setQr(null)} />}
      {labels && <LabelsModal assets={assets.filter((a) => a.status !== 'Retired')} onClose={() => setLabels(false)} />}
    </>
  );
}
