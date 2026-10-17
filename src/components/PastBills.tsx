// Bills from before the system started, kept on the client (e.g. last year's service for a repeat client). Optional line items let a new quotation start from them.
import { useState } from 'react';
import { store, useAuth } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, attempt, useObj } from '@/components/ui';
import { fmtDate, money, sum, today, uid } from '@/lib/util';
import type { Client, PastBill, QuoteItem } from '@/lib/types';

const blank = (): PastBill => ({ id: uid(), date: today(), ref: '', total: 0, items: [], notes: '' });
const lineAmt = (i: QuoteItem) => Math.max(0, i.qty * i.rate - (i.discount ?? 0));

export function PastBillsCard({ client, canEdit }: { client: Client; canEdit: boolean }) {
  const [edit, setEdit] = useState<PastBill | null>(null);
  const list = [...(client.past_bills ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const save = (b: PastBill) => { const rest = (client.past_bills ?? []).filter((x) => x.id !== b.id); if (attempt(() => store.update('clients', client.id, { past_bills: [...rest, b] }), 'Previous bill saved')) setEdit(null); };
  const remove = (id: string) => { if (confirm('Remove this previous bill?')) attempt(() => store.update('clients', client.id, { past_bills: (client.past_bills ?? []).filter((x) => x.id !== id) }), 'Removed'); };
  return (
    <Card title="Previous bills (before this system)" actions={canEdit && <button className="btn sm primary" onClick={() => setEdit(blank())}><Icon name="plus" />Add a previous bill</button>}>
      {list.length ? (
        <ul className="list">{list.map((b) => (
          <li key={b.id}>
            <div><b>{fmtDate(b.date)}</b>{b.ref ? ` · ${b.ref}` : ''} · <b>{money(b.total)}</b>{b.items.length > 0 && <Badge tone="teal">{b.items.length} line{b.items.length === 1 ? '' : 's'}</Badge>}{b.notes && <div className="small muted">{b.notes}</div>}</div>
            {canEdit && <span className="row"><button className="btn sm" onClick={() => setEdit({ ...b, items: b.items.map((i) => ({ ...i })) })}>Edit</button><button className="btn sm danger" onClick={() => remove(b.id)}>Remove</button></span>}
          </li>
        ))}</ul>
      ) : <div className="muted small">No earlier bills entered. For a repeat client whose last service was before the system started, add that bill here — it then shows on new quotations for this client, and its line items can be repeated in one tap.</div>}
      {edit && <PastBillModal initial={edit} onClose={() => setEdit(null)} onSave={save} />}
    </Card>
  );
}

function PastBillModal({ initial, onClose, onSave }: { initial: PastBill; onClose: () => void; onSave: (b: PastBill) => void }) {
  const { db } = useAuth(); const f = useObj<PastBill>(() => initial); const v = f.v; const services = db.services.filter((s) => !s.deleted_at);
  const setItem = (i: number, p: Partial<QuoteItem>) => f.set('items', v.items.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const itemsTotal = sum(v.items, lineAmt);
  const add = () => { const s = services[0]; f.set('items', [...v.items, { service_code: s?.code ?? 'OTHER', description: s?.name ?? '', qty: 1, unit: s?.unit ?? 'lot', rate: s?.rate ?? 0, discount: 0 }]); };
  const ok = !!v.date && v.total > 0;
  return (
    <Modal title="Previous bill" size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!ok} onClick={() => onSave({ ...v, total: Math.round(v.total * 100) / 100 })}>Save</button></>}>
      <div className="form-grid">
        <Field label="Date of that bill" required><input type="date" max={today()} value={v.date} onChange={(e) => f.set('date', e.target.value)} /></Field>
        <Field label="Old invoice / receipt number"><input value={v.ref} maxLength={40} onChange={(e) => f.set('ref', e.target.value)} placeholder="optional" /></Field>
        <Field label="Total billed (₱)" required hint={v.items.length ? `The lines below add up to ${money(itemsTotal)}.` : undefined}>
          <div className="row" style={{ gap: 6 }}><input type="number" min="0" value={v.total || ''} onChange={(e) => f.set('total', Number(e.target.value))} />{v.items.length > 0 && <button type="button" className="btn sm" onClick={() => f.set('total', Math.round(itemsTotal * 100) / 100)}>Use the lines' total</button>}</div>
        </Field>
        <Field label="Notes" className="full"><input value={v.notes} maxLength={200} onChange={(e) => f.set('notes', e.target.value)} placeholder="e.g. 2 floors, exterior glass only, paid in cash" /></Field>
      </div>
      <div className="small muted" style={{ fontWeight: 600, margin: '12px 0 6px' }}>Line items (optional — add them if you want to repeat this bill on a new quotation)</div>
      <div className="stack">
        {v.items.map((it, i) => (
          <div key={i} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <select value={it.service_code} onChange={(e) => { const s = services.find((x) => x.code === e.target.value); setItem(i, { service_code: e.target.value, description: s?.name ?? it.description, unit: s?.unit ?? it.unit }); }}>{services.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
            <input style={{ flex: 1, minWidth: 160 }} placeholder="Description" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
            <input style={{ width: 80 }} type="number" min="0" aria-label="Quantity" value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} />
            <input style={{ width: 80 }} aria-label="Unit" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} />
            <input style={{ width: 110 }} type="number" min="0" aria-label="Rate" value={it.rate} onChange={(e) => setItem(i, { rate: Number(e.target.value) })} />
            <span className="small" style={{ minWidth: 90, textAlign: 'right' }}>{money(lineAmt(it))}</span>
            <button type="button" className="btn sm danger" aria-label="Remove line" onClick={() => f.set('items', v.items.filter((_, k) => k !== i))}>×</button>
          </div>
        ))}
        <div><button type="button" className="btn sm" onClick={add}><Icon name="plus" />Add a line</button></div>
      </div>
    </Modal>
  );
}
