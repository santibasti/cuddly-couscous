import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, Stat, Tabs, attempt, ask, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { onHand, stockSummary } from '@/lib/business';
import { decideAdjustment, decideRequest, physicalCount, receivePurchase, requestAdjustment, requestMaterials, returnFromJob, reverseStockTx, issueToJob, transferStock, wasteMaterial } from '@/lib/actions';
import { addDays, diffDays, fmtDate, money, sum, today } from '@/lib/util';
import type { InventoryItem, ItemCategory, MaterialRequest, StockTx } from '@/lib/types';

const CATS: ItemCategory[] = ['Chemical', 'Consumable', 'Spare Part', 'PPE', 'Office Supply', 'Cleaning Material'];
type Kind = 'receive' | 'issue' | 'return' | 'waste' | 'adjust' | 'transfer' | 'count';
const KIND_LABEL: Record<Kind, string> = { receive: 'Receive purchase', issue: 'Issue to job', return: 'Return from job', waste: 'Damaged / wasted', adjust: 'Stock adjustment', transfer: 'Transfer', count: 'Physical count' };

function ItemForm({ initial, onClose }: { initial?: InventoryItem; onClose: () => void }) {
  const { db } = useAuth();
  const [opening, setOpening] = useState(0);
  const f = useObj<Omit<InventoryItem, 'id' | 'created_at' | 'updated_at' | 'created_by'>>(() => initial ?? { code: '', name: '', category: 'Consumable', uom: 'pc', reorder_level: 0, cost: 0, supplier: '', location_id: db.locations[0].id, track_expiry: false });
  const save = () => {
    if (!f.v.code.trim() || !f.v.name.trim()) return attempt(() => { throw new Error('Item code and name are required.'); });
    if (!initial && db.items.some((i) => i.code.toLowerCase() === f.v.code.trim().toLowerCase() && !i.deleted_at)) return attempt(() => { throw new Error('That item code already exists.'); });
    const it = attempt(() => (initial ? store.update('items', initial.id, f.v) : store.insert('items', f.v)), 'Item saved') as InventoryItem | undefined;
    if (it && !initial && opening > 0) store.insert('stock', { item_id: (it as InventoryItem).id, type: 'Opening', qty: opening, unit_cost: f.v.cost, location_id: f.v.location_id, date: today(), approval: 'Approved', reason: 'Beginning balance' });
    if (it) onClose();
  };
  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'New inventory item'} size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save item</button></>}>
      <div className="form-grid">
        <Field label="Item code" required><input {...f.bind('code')} /></Field><Field label="Item name" required><input {...f.bind('name')} /></Field>
        <Field label="Category"><select {...f.bind('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field><Field label="Unit of measure"><input {...f.bind('uom')} /></Field>
        <Field label="Reorder level"><input type="number" min="0" {...f.bind('reorder_level')} /></Field><Field label="Cost per unit (₱)"><input type="number" min="0" step="0.01" {...f.bind('cost')} /></Field>
        <Field label="Supplier"><input {...f.bind('supplier')} /></Field><Field label="Storage location"><select {...f.bind('location_id')}>{db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <label className="check"><input type="checkbox" checked={f.v.track_expiry} onChange={(e) => f.set('track_expiry', e.target.checked)} />Track expiry / batch</label><span />
        {f.v.track_expiry && <><Field label="Expiry date"><input type="date" {...f.bind('expiry_date')} /></Field><Field label="Batch no."><input {...f.bind('batch_no')} /></Field></>}
        {!initial && <Field label="Beginning quantity"><input type="number" min="0" value={opening} onChange={(e) => setOpening(+e.target.value)} /></Field>}
      </div>
    </Modal>
  );
}

function TxModal({ kind, itemId, jobId, onClose }: { kind: Kind; itemId?: string; jobId?: string; onClose: () => void }) {
  const { db } = useAuth();
  const items = live(db.items);
  const f = useObj({ item_id: itemId ?? items[0]?.id ?? '', qty: 1, location_id: db.locations[0].id, to: db.locations[1]?.id ?? '', job_id: jobId ?? '', unit_cost: 0, supplier: '', reference: '', batch_no: '', expiry_date: '', reason: '', counted: 0, sign: 1 });
  const it = items.find((i) => i.id === f.v.item_id);
  const openJobs = live(db.jobs).filter((j) => !['Cancelled', 'Rescheduled'].includes(j.status)).sort((a, b) => b.start_at.localeCompare(a.start_at));
  useEffect(() => { if (it) { f.set('unit_cost', it.cost); f.set('supplier', it.supplier); f.set('location_id', it.location_id); } }, [f.v.item_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const here = onHand(db, f.v.item_id, f.v.location_id);
  const go = () => {
    const v = f.v;
    const r = attempt(() => {
      if (kind === 'receive') return receivePurchase({ item_id: v.item_id, qty: v.qty, unit_cost: v.unit_cost, supplier: v.supplier, reference: v.reference, location_id: v.location_id, batch_no: v.batch_no || undefined, expiry_date: v.expiry_date || undefined });
      if (kind === 'issue') { if (!v.job_id) throw new Error('Choose the job.'); return issueToJob({ item_id: v.item_id, qty: v.qty, job_id: v.job_id, location_id: v.location_id }); }
      if (kind === 'return') { if (!v.job_id) throw new Error('Choose the job.'); return returnFromJob({ item_id: v.item_id, qty: v.qty, job_id: v.job_id, location_id: v.location_id }); }
      if (kind === 'waste') return wasteMaterial({ item_id: v.item_id, qty: v.qty, location_id: v.location_id, reason: v.reason, job_id: v.job_id || undefined });
      if (kind === 'adjust') return requestAdjustment({ item_id: v.item_id, qty: v.qty * v.sign, location_id: v.location_id, reason: v.reason });
      if (kind === 'transfer') return transferStock({ item_id: v.item_id, qty: v.qty, from: v.location_id, to: v.to });
      const r = physicalCount({ item_id: v.item_id, location_id: v.location_id, counted: v.counted }); if (!r.variance) throw new Error('Count matches the system quantity — no variance to post.'); return r;
    }, kind === 'adjust' ? 'Adjustment submitted for approval' : kind === 'count' ? 'Count variance submitted for approval' : 'Transaction posted');
    if (r !== undefined) onClose();
  };
  return (
    <Modal title={KIND_LABEL[kind]} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={go}>{kind === 'adjust' || kind === 'count' ? 'Submit for approval' : 'Post'}</button></>}>
      <div className="form-grid">
        <Field label="Item" required className="full"><select {...f.bind('item_id')}>{items.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.name}</option>)}</select></Field>
        <Field label={kind === 'transfer' ? 'From location' : 'Location'}><select {...f.bind('location_id')}>{db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        {kind === 'transfer' ? <Field label="To location"><select {...f.bind('to')}>{db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field> : <div className="muted small" style={{ alignSelf: 'end' }}>On hand here: <b>{here} {it?.uom}</b></div>}
        {kind === 'count' ? <Field label="Counted quantity"><input type="number" min="0" step="0.01" value={f.v.counted} onChange={(e) => f.set('counted', +e.target.value)} /></Field> : <Field label={`Quantity (${it?.uom ?? ''})`}><input type="number" min="0" step="0.01" {...f.bind('qty')} /></Field>}
        {kind === 'adjust' && <Field label="Direction"><select value={f.v.sign} onChange={(e) => f.set('sign', +e.target.value)}><option value={1}>Increase (+)</option><option value={-1}>Decrease (−)</option></select></Field>}
        {kind === 'receive' && <><Field label="Unit cost (₱)"><input type="number" min="0" step="0.01" {...f.bind('unit_cost')} /></Field><Field label="Supplier"><input {...f.bind('supplier')} /></Field><Field label="PO / DR / invoice ref."><input {...f.bind('reference')} /></Field>{it?.track_expiry && <><Field label="Batch no."><input {...f.bind('batch_no')} /></Field><Field label="Expiry date"><input type="date" {...f.bind('expiry_date')} /></Field></>}</>}
        {(kind === 'issue' || kind === 'return' || kind === 'waste') && <Field label={kind === 'waste' ? 'Job (optional)' : 'Job'} className="full"><select {...f.bind('job_id')}><option value="">{kind === 'waste' ? '— none —' : '— choose job —'}</option>{openJobs.slice(0, 80).map((j) => <option key={j.id} value={j.id}>{j.number} · {db.clients.find((c) => c.id === j.client_id)?.name} · {j.start_at.slice(0, 10)}</option>)}</select></Field>}
        {(kind === 'waste' || kind === 'adjust') && <Field label="Reason" required className="full"><textarea {...f.bind('reason')} /></Field>}
      </div>
      {kind === 'count' && <p className="small muted">Any variance is posted as a pending “Count Variance” entry that a manager must approve.</p>}
    </Modal>
  );
}

function RequestModal({ jobId, onClose }: { jobId?: string; onClose: () => void }) {
  const { db } = useAuth();
  const mine = live(db.jobs).filter((j) => ['Pending', 'Confirmed', 'In Progress'].includes(j.status));
  const [job, setJob] = useState(jobId ?? mine[0]?.id ?? '');
  const [lines, setLines] = useState<{ item_id: string; qty: number }[]>([{ item_id: db.items[0].id, qty: 1 }]);
  const [note, setNote] = useState('');
  return (
    <Modal title="Request materials for a job" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => requestMaterials(job, lines, note), 'Request sent for approval')) onClose(); }}>Submit request</button></>}>
      <div className="stack">
        <Field label="Job"><select value={job} onChange={(e) => setJob(e.target.value)}>{mine.map((j) => <option key={j.id} value={j.id}>{j.number} · {db.clients.find((c) => c.id === j.client_id)?.name}</option>)}</select></Field>
        {lines.map((l, i) => <div key={i} className="row"><select value={l.item_id} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, item_id: e.target.value } : x)))} style={{ flex: 1 }}>{live(db.items).map((it) => <option key={it.id} value={it.id}>{it.name} ({stockSummary(db, it.id).available} {it.uom} avail.)</option>)}</select><input type="number" min="0" style={{ width: 90 }} value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: +e.target.value } : x)))} aria-label="Qty" /><button className="icon-btn" onClick={() => setLines(lines.filter((_, k) => k !== i))} aria-label="Remove"><Icon name="trash" /></button></div>)}
        <div><button className="btn sm" onClick={() => setLines([...lines, { item_id: db.items[0].id, qty: 1 }])}><Icon name="plus" />Add line</button></div>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function Inventory() {
  const { db, can } = useAuth();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<'stock' | 'tx' | 'requests'>((sp.get('tab') as never) || 'stock');
  const [modal, setModal] = useState<{ kind: Kind; itemId?: string } | 'item' | InventoryItem | 'request' | null>(sp.get('tab') === 'requests' && sp.get('job') ? 'request' : null);
  const [cat, setCat] = useState(''); const [alertF, setAlertF] = useState('');
  const edit = can('inventory.edit'), appr = can('inventory.approve');
  const T = today();
  const items = live(db.items);
  const lim = addDays(T, db.settings.reminder_days.chemical_expiry);
  const rows = items.filter((i) => (!cat || i.category === cat)).map((i) => ({ i, s: stockSummary(db, i.id) })).filter(({ i, s }) => !alertF || (alertF === 'low' ? s.available <= i.reorder_level : i.track_expiry && !!i.expiry_date && i.expiry_date <= lim));
  const value = sum(items, (i) => onHand(db, i.id) * i.cost);
  const low = items.filter((i) => stockSummary(db, i.id).available <= i.reorder_level);
  const expiring = items.filter((i) => i.track_expiry && i.expiry_date && i.expiry_date <= lim);
  const pending = db.stock.filter((t) => t.approval === 'Pending');
  const reversed = new Set(db.stock.filter((t) => t.reversal_of).map((t) => t.reversal_of));
  const iname = (id: string) => db.items.find((i) => i.id === id)?.name ?? '';
  const loc = (id: string) => db.locations.find((l) => l.id === id)?.name ?? '';
  const reqs = live(db.requests).sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <PageHead title="Inventory & materials" sub="Stock ledger with reservations, valuation, expiry tracking and approvals. Transactions are immutable — correct with reversals.">
        {edit && <button className="btn" onClick={() => setModal('item')}><Icon name="plus" />New item</button>}
        {can('inventory.request') && <button className="btn" onClick={() => setModal('request')}>Request materials</button>}
        {edit && <select value="" onChange={(e) => e.target.value && setModal({ kind: e.target.value as Kind })} style={{ width: 'auto' }} aria-label="Post transaction"><option value="">Post transaction…</option>{(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>}
      </PageHead>
      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        <Stat k="Inventory valuation" v={money(value)} s={`${items.length} items`} tone="navy" /><Stat k="Low stock" v={low.length} tone={low.length ? 'warn' : 'good'} s="at or below reorder level" />
        <Stat k="Expiring ≤ 30 days" v={expiring.length} tone={expiring.length ? 'warn' : 'good'} /><Stat k="Awaiting approval" v={pending.length + reqs.filter((r) => r.status === 'Pending').length} s="adjustments & requests" />
      </div>
      <Tabs tabs={[{ id: 'stock', label: 'Stock on hand', count: rows.length }, { id: 'tx', label: 'Transactions' }, { id: 'requests', label: 'Material requests', count: reqs.filter((r) => r.status === 'Pending').length }]} value={tab} onChange={setTab} />

      {tab === 'stock' && (
        <Card flush><DataTable rows={rows} rowKey={(r) => r.i.id} exportTitle="Inventory stock & valuation" pageSize={15}
          filters={<><select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select><select value={alertF} onChange={(e) => setAlertF(e.target.value)} aria-label="Alerts"><option value="">All items</option><option value="low">Low stock</option><option value="exp">Expiring</option></select></>}
          totals={['Total', '', '', '', '', '', '', '', '', '', '', money(value), '', '', '', '', ''] as never}
          cols={[
            { key: 'code', header: 'Code', value: (r) => r.i.code }, { key: 'name', header: 'Item', value: (r) => r.i.name, render: (r) => <b>{r.i.name}</b> }, { key: 'cat', header: 'Category', value: (r) => r.i.category }, { key: 'uom', header: 'UoM', value: (r) => r.i.uom },
            { key: 'beg', header: 'Beginning', num: true, value: (r) => r.s.beginning }, { key: 'in', header: 'Stock in', num: true, value: (r) => r.s.stockIn }, { key: 'out', header: 'Stock out', num: true, value: (r) => r.s.stockOut },
            { key: 'res', header: 'Reserved', num: true, value: (r) => r.s.reserved }, { key: 'oh', header: 'On hand', num: true, value: (r) => r.s.onHand },
            { key: 'av', header: 'Available', num: true, value: (r) => r.s.available, render: (r) => <b style={{ color: r.s.available <= r.i.reorder_level ? 'var(--red)' : undefined }}>{r.s.available}</b> },
            { key: 'ro', header: 'Reorder at', num: true, value: (r) => r.i.reorder_level }, { key: 'cost', header: 'Unit cost', num: true, type: 'money', value: (r) => r.i.cost, render: (r) => money(r.i.cost) },
            { key: 'val', header: 'Valuation', num: true, type: 'money', value: (r) => r.s.onHand * r.i.cost, render: (r) => money(r.s.onHand * r.i.cost) },
            { key: 'sup', header: 'Supplier', value: (r) => r.i.supplier }, { key: 'loc', header: 'Location', value: (r) => loc(r.i.location_id) },
            { key: 'exp', header: 'Expiry / batch', value: (r) => (r.i.expiry_date ? `${r.i.expiry_date} ${r.i.batch_no ?? ''}` : ''), render: (r) => r.i.track_expiry && r.i.expiry_date ? <span>{fmtDate(r.i.expiry_date)}{r.i.batch_no && <span className="muted small"> · {r.i.batch_no}</span>} {diffDays(r.i.expiry_date, T) <= 30 && <Badge tone={diffDays(r.i.expiry_date, T) < 0 ? 'red' : 'amber'}>{diffDays(r.i.expiry_date, T) < 0 ? 'expired' : `${diffDays(r.i.expiry_date, T)}d`}</Badge>}</span> : '—' },
            { key: 'st', header: 'Status', value: (r) => (r.s.available <= r.i.reorder_level ? 'Low' : 'OK'), render: (r) => (r.s.available <= r.i.reorder_level ? <Badge tone="red">Low stock</Badge> : <Badge tone="green">OK</Badge>) },
            { key: 'actions', header: '', noExport: true, sortable: false, render: (r) => edit ? <span className="row"><button className="btn sm" onClick={() => setModal({ kind: 'receive', itemId: r.i.id })}>Receive</button><button className="btn sm" onClick={() => setModal(r.i)}>Edit</button></span> : null },
          ]} /></Card>
      )}

      {tab === 'tx' && (
        <Card flush><DataTable<StockTx> rows={live(db.stock)} rowKey={(t) => t.id} exportTitle="Stock movement" initialSort={{ key: 'date', dir: -1 }} pageSize={15} cols={[
          { key: 'date', header: 'Date', value: (t) => t.date, render: (t) => fmtDate(t.date) }, { key: 'type', header: 'Type', value: (t) => t.type, render: (t) => <Badge tone={t.qty >= 0 ? 'green' : 'blue'}>{t.type}</Badge> }, { key: 'item', header: 'Item', value: (t) => iname(t.item_id) },
          { key: 'qty', header: 'Qty', num: true, value: (t) => t.qty, render: (t) => `${t.qty > 0 ? '+' : ''}${t.qty}` }, { key: 'cost', header: 'Value', num: true, type: 'money', value: (t) => t.qty * t.unit_cost, render: (t) => money(t.qty * t.unit_cost) },
          { key: 'loc', header: 'Location', value: (t) => loc(t.location_id) }, { key: 'job', header: 'Job', value: (t) => db.jobs.find((j) => j.id === t.job_id)?.number ?? '' }, { key: 'ref', header: 'Reference / reason', value: (t) => t.reference ?? t.reason ?? '' },
          { key: 'by', header: 'By', value: (t) => db.users.find((u) => u.id === t.created_by)?.name ?? 'System' },
          { key: 'ap', header: 'Approval', value: (t) => (reversed.has(t.id) ? 'Reversed' : t.approval), render: (t) => <Badge>{reversed.has(t.id) ? 'Reversed' : t.approval}</Badge> },
          { key: 'actions', header: '', noExport: true, sortable: false, render: (t) => appr ? <span className="row">{t.approval === 'Pending' && <><button className="btn sm primary" onClick={() => attempt(() => decideAdjustment(t.id, true), 'Approved')}>Approve</button><button className="btn sm" onClick={() => attempt(() => decideAdjustment(t.id, false), 'Rejected')}>Reject</button></>}{t.approval === 'Approved' && !reversed.has(t.id) && !t.reversal_of && t.type !== 'Opening' && <button className="btn sm" onClick={async () => { const r = await ask('Reverse transaction', 'Reason for reversal'); if (r) attempt(() => reverseStockTx(t.id, r), 'Reversal posted'); }}>Reverse</button>}</span> : null },
        ]} /></Card>
      )}

      {tab === 'requests' && (
        <Card flush><DataTable<MaterialRequest> rows={reqs} rowKey={(r) => r.id} exportTitle="Material requests" cols={[
          { key: 'd', header: 'Requested', value: (r) => r.created_at, render: (r) => fmtDate(r.created_at.slice(0, 10)) }, { key: 'job', header: 'Job', value: (r) => db.jobs.find((j) => j.id === r.job_id)?.number ?? '' },
          { key: 'by', header: 'By', value: (r) => db.employees.find((e) => e.id === r.requested_by)?.full_name ?? db.users.find((u) => u.id === r.requested_by)?.name ?? '' },
          { key: 'lines', header: 'Items', value: (r) => r.lines.map((l) => `${l.qty} × ${iname(l.item_id)}`).join('; ') }, { key: 'st', header: 'Status', value: (r) => r.status, render: (r) => <Badge>{r.status}</Badge> },
          { key: 'actions', header: '', noExport: true, sortable: false, render: (r) => appr && r.status === 'Pending' ? <span className="row"><button className="btn sm primary" onClick={() => attempt(() => decideRequest(r.id, true), 'Issued to job')}>Approve & issue</button><button className="btn sm" onClick={() => attempt(() => decideRequest(r.id, false), 'Rejected')}>Reject</button></span> : null },
        ]} /></Card>
      )}

      {modal === 'item' && <ItemForm onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'code' in modal && <ItemForm initial={modal as InventoryItem} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'kind' in modal && <TxModal kind={modal.kind} itemId={modal.itemId} onClose={() => setModal(null)} />}
      {modal === 'request' && <RequestModal jobId={sp.get('job') ?? undefined} onClose={() => setModal(null)} />}
    </>
  );
}
