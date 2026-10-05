import { useState } from 'react';
import { useAuth, live } from '@/lib/store';
import { Badge, Field, Icon, Modal, attempt, toast } from '@/components/ui';
import { Stepper, Toggle } from '@/components/touch';
import { uid } from '@/lib/util';
import { ITEM_CONDITIONS, kindOfAsset } from '@/lib/workflow';
import type { CheckItem, ItemCondition, Job } from '@/lib/types';

export const KIND_LABEL: Record<CheckItem['kind'], string> = { vehicle: 'Vehicle', equipment: 'Machines & equipment', tool: 'Tools, hoses, cords & ladders', ppe: 'PPE & safety gear', material: 'Chemicals & materials' };

export function Seg<T extends string>({ value, options, onChange, disabled, tone }: { value?: T; options: readonly T[]; onChange: (v: T) => void; disabled?: boolean; tone?: (v: T) => 'good' | 'bad' | 'warn' }) {
  return <div className="seg" role="group">{options.map((o) => <button key={o} type="button" disabled={disabled} className={`${value === o ? 'on' : ''} ${tone?.(o) ?? ''}`} onClick={() => onChange(o)}>{o}</button>)}</div>;
}
export const condTone = (v: string) => (v === 'Good' ? 'good' : v === 'With Issue' ? 'warn' : 'bad') as 'good' | 'bad' | 'warn';

/** Actual time entered by the Team Leader (defaults to now). */
export function TimeField({ label, value, onChange, disabled, hint }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; hint?: string }) {
  return <label className="f"><span>{label}</span><input type="datetime-local" step={60} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />{hint && <span className="small muted" style={{ fontWeight: 400 }}>{hint}</span>}</label>;
}

/** One line of the job-prep checklist (vehicle, machine, tool, PPE): quantity, condition, optional note, optional QR scan. */
export function ItemCard({ it, setItem, confirmItem, onScan, disabled, onRemove }: { it: CheckItem; setItem: (k: string, p: Partial<CheckItem>) => void; confirmItem: (i: CheckItem, by: 'scan' | 'id' | 'manual') => void; onScan: () => void; disabled: boolean; onRemove?: () => void }) {
  const [typed, setTyped] = useState('');
  const cond = it.out_condition ?? 'Good';
  const verify = () => { if (typed.trim().toUpperCase() === it.code?.toUpperCase()) { confirmItem(it, 'id'); toast(`✓ ${it.label} confirmed by Asset ID`, 'ok'); setTyped(''); } else toast(`“${typed}” does not match ${it.code}.`, 'err'); };
  return (
    <div className={`itemcard ${it.out_ok ? (cond === 'Good' && (it.loaded_qty ?? 0) >= it.qty ? 'ok' : 'bad') : ''}`}>
      <div className="row between"><div><b>{it.label}</b> {it.extra && <Badge tone="blue">added</Badge>} <span className="muted small">{it.code ?? ''}</span></div>{it.out_ok ? <Badge tone="green">{it.out_by === 'scan' ? '✓ Scanned' : it.out_by === 'id' ? '✓ ID entered' : '✓ Confirmed'}</Badge> : <Badge tone="amber">Not confirmed</Badge>}</div>
      <div className="itemgrid">
        {it.kind !== 'vehicle' && <Field label={`Qty loaded (need ${it.qty})`}><Stepper label={`Quantity loaded ${it.label}`} min={0} disabled={disabled} value={it.loaded_qty} onChange={(v) => setItem(it.key, { loaded_qty: v })} /></Field>}
        <Field label="Condition"><Seg value={cond} options={ITEM_CONDITIONS} disabled={disabled} tone={condTone} onChange={(v: ItemCondition) => setItem(it.key, { out_condition: v, ...(v === 'Missing' && it.kind !== 'vehicle' ? { loaded_qty: 0 } : {}) })} /></Field>
      </div>
      {(cond !== 'Good' || it.out_note) && <Field label="Note"><input disabled={disabled} value={it.out_note ?? ''} onChange={(e) => setItem(it.key, { out_note: e.target.value })} /></Field>}
      {!disabled && (
        <div className="row">
          <label className="check"><input type="checkbox" checked={!!it.out_ok} onChange={(e) => (e.target.checked ? confirmItem(it, 'manual') : setItem(it.key, { out_ok: false }))} />Confirm</label>
          {it.code && <button className="btn sm navy" onClick={onScan}><Icon name="qr" size={14} />Scan QR</button>}
          {it.code && <span className="row" style={{ gap: 4 }}><input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verify()} placeholder="Type Asset ID" aria-label={`Asset ID for ${it.label}`} style={{ width: 160 }} /><button className="btn sm" onClick={verify}>Verify</button></span>}
          {onRemove && <button className="btn sm danger" onClick={onRemove}>Remove</button>}
        </div>
      )}
    </div>
  );
}

export function AddToolModal({ items, job, onAdd, onClose }: { items: CheckItem[]; job: Job; onAdd: (i: CheckItem) => void; onClose: () => void }) {
  const { db } = useAuth();
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [qty, setQty] = useState(1);
  const avail = live(db.assets).filter((a) => !['Retired', 'Damaged', 'Missing', 'Under Maintenance', 'In Use'].includes(a.status) && !items.some((i) => i.asset_id === a.id));
  const byCode = db.assets.find((a) => a.code.toUpperCase() === code.trim().toUpperCase());
  const add = () => {
    if (code.trim()) {
      if (!byCode) return toast(`No asset with ID ${code}.`, 'err');
      if (!avail.includes(byCode)) return toast(`${byCode.name} is ${items.some((i) => i.asset_id === byCode.id) ? 'already on the list' : byCode.status.toLowerCase()}.`, 'err');
      return onAdd({ key: `a:${byCode.id}`, kind: kindOfAsset(byCode), asset_id: byCode.id, label: byCode.name, code: byCode.code, qty: 1, extra: true, responsible_id: job.leader_id });
    }
    if (!name.trim()) return toast('Choose an asset or type a tool name.', 'err');
    onAdd({ key: `x:${uid()}`, kind: 'tool', label: name.trim(), qty, extra: true, responsible_id: job.leader_id });
  };
  return (
    <Modal title="Add tool or equipment" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={add}>Add to checklist</button></>}>
      <div className="stack">
        <Field label="Asset ID / QR code" hint="Type or pick from the register; the tool is also assigned to the job."><input list="avail-assets" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. HSE-001" /></Field>
        <datalist id="avail-assets">{avail.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</datalist>
        {byCode && <div className="alert info">{byCode.name} · {byCode.status}</div>}
        <div className="muted small" style={{ textAlign: 'center' }}>— or a small tool with no Asset ID —</div>
        <div className="form-grid"><Field label="Tool name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Quantity"><Stepper label="Quantity" min={1} value={qty} onChange={(v) => setQty(v ?? 1)} /></Field></div>
      </div>
    </Modal>
  );
}

export const Confirm = ({ checked, onChange, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode }) => (
  <Toggle checked={checked} onChange={onChange} disabled={disabled}>{children}</Toggle>
);

/** Run an action and report the result in a toast (re-exported for brevity in step forms). */
export const run = attempt;
