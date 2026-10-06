// Editors shared by maintenance templates, plans and records: one task definition, and a parts list.
import type { MaintFreqKind, MaintPart, MaintPartCategory, MaintPartStatus, MaintPriority, MaintTaskDef, MaintTaskType } from '@/lib/types';
import { Field } from '@/components/ui';
import { uid } from '@/lib/util';

export const TASK_TYPES: MaintTaskType[] = ['Inspect', 'Clean', 'Replace', 'Repair', 'Refill', 'Calibrate', 'Service'];
export const PRIORITIES: MaintPriority[] = ['Low', 'Normal', 'High', 'Urgent'];
export const FREQS: [MaintFreqKind, string][] = [['date', 'By date (every N days)'], ['mileage', 'By mileage (km)'], ['hours', 'By operating hours'], ['usage', 'By usage count (jobs)'], ['custom', 'Custom schedule']];
export const PART_CATS: MaintPartCategory[] = ['Replacement Part', 'Cleaning Material', 'Consumable', 'Repair Item'];
export const PART_STATUS: MaintPartStatus[] = ['Needed', 'Requested', 'Ordered', 'Received', 'Installed', 'Cancelled'];
export const blankTask = (): MaintTaskDef => ({ task_name: '', task_type: 'Inspect', description: '', freq_kind: 'date', interval_days: 30, est_minutes: 30, est_cost: 0, priority: 'Normal', parts: [] });

export function TaskForm({ v, onChange, vehicle }: { v: MaintTaskDef; onChange: (t: MaintTaskDef) => void; vehicle?: boolean }) {
  const set = <K extends keyof MaintTaskDef>(k: K, x: MaintTaskDef[K]) => onChange({ ...v, [k]: x });
  const num = (s: string) => (s === '' ? undefined : Number(s));
  const days = v.freq_kind === 'date' || v.freq_kind === 'custom';
  return (
    <div className="form-grid">
      <Field label="Task name" required className="full"><input value={v.task_name} onChange={(e) => set('task_name', e.target.value)} placeholder="e.g. Change engine oil" /></Field>
      <Field label="Type"><select value={v.task_type} onChange={(e) => set('task_type', e.target.value as MaintTaskType)}>{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
      <Field label="Priority"><select value={v.priority} onChange={(e) => set('priority', e.target.value as MaintPriority)}>{PRIORITIES.map((t) => <option key={t}>{t}</option>)}</select></Field>
      <Field label="Frequency"><select value={v.freq_kind} onChange={(e) => { const k = e.target.value as MaintFreqKind; onChange({ ...v, freq_kind: k, interval_days: k === 'date' || k === 'custom' ? v.interval_days ?? 30 : undefined, interval_reading: k === 'date' || k === 'custom' ? undefined : v.interval_reading ?? (k === 'mileage' ? 5000 : k === 'hours' ? 100 : 10) }); }}>{FREQS.filter(([k]) => vehicle || k !== 'mileage' || true).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      {days ? <Field label={v.freq_kind === 'custom' ? 'Every … days (optional)' : 'Every … days'} hint="30 = monthly, 90 = every 3 months, 365 = yearly"><input type="number" min={1} value={v.interval_days ?? ''} onChange={(e) => set('interval_days', num(e.target.value))} /></Field>
        : <Field label={v.freq_kind === 'mileage' ? 'Every … km' : v.freq_kind === 'hours' ? 'Every … operating hours' : 'Every … uses (jobs)'}><input type="number" min={1} value={v.interval_reading ?? ''} onChange={(e) => set('interval_reading', num(e.target.value))} /></Field>}
      {v.freq_kind === 'custom' && <Field label="Custom schedule" className="full"><input value={v.custom_note ?? ''} onChange={(e) => set('custom_note', e.target.value)} placeholder="e.g. before every rainy season" /></Field>}
      <Field label="Estimated minutes"><input type="number" min={0} value={v.est_minutes ?? ''} onChange={(e) => set('est_minutes', num(e.target.value))} /></Field>
      <Field label="Estimated cost (₱)"><input type="number" min={0} step="any" value={v.est_cost} onChange={(e) => set('est_cost', Number(e.target.value) || 0)} /></Field>
      <Field label="Instructions / checklist" className="full" hint="One step per line becomes the tick-list on the work record."><textarea rows={3} value={v.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <div className="full"><div className="small muted" style={{ fontWeight: 600, marginBottom: 4 }}>Parts, consumables or materials normally needed</div>
        <PartsEditor parts={v.parts.map((p) => ({ ...p, id: (p as MaintPart).id ?? uid(), status: (p as MaintPart).status ?? 'Needed' }))} onChange={(ps) => set('parts', ps.map(({ id: _i, status: _s, deducted: _d, ...rest }) => rest))} template />
      </div>
    </div>
  );
}

export function PartsEditor({ parts, onChange, template, items, readOnly, short }: {
  parts: MaintPart[]; onChange: (p: MaintPart[]) => void; template?: boolean; readOnly?: boolean;
  items?: { id: string; code: string; name: string; uom: string }[]; short?: (p: MaintPart) => number;
}) {
  const upd = (i: number, patch: Partial<MaintPart>) => onChange(parts.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <div className="stack" style={{ gap: 8 }}>
      {parts.map((p, i) => (
        <div key={p.id} className="partrow">
          <input value={p.name} disabled={readOnly} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Item / part name" aria-label="Part name" />
          <select value={p.category} disabled={readOnly} onChange={(e) => upd(i, { category: e.target.value as MaintPartCategory })} aria-label="Category">{PART_CATS.map((c) => <option key={c}>{c}</option>)}</select>
          <input type="number" min={0} step="any" value={p.qty} disabled={readOnly} onChange={(e) => upd(i, { qty: Number(e.target.value) || 0 })} aria-label="Quantity" title="Quantity" />
          <input type="number" min={0} step="any" value={p.est_cost} disabled={readOnly} onChange={(e) => upd(i, { est_cost: Number(e.target.value) || 0 })} aria-label="Estimated cost" title="Estimated cost (₱)" />
          <input value={p.supplier ?? ''} disabled={readOnly} onChange={(e) => upd(i, { supplier: e.target.value })} placeholder="Supplier" aria-label="Supplier" />
          {!template && <input type="date" value={p.required_by ?? ''} disabled={readOnly} onChange={(e) => upd(i, { required_by: e.target.value || undefined })} aria-label="Required by" title="Required by" />}
          {!template && <select value={p.status} disabled={readOnly || p.status === 'Installed'} onChange={(e) => upd(i, { status: e.target.value as MaintPartStatus })} aria-label="Status">{PART_STATUS.map((c) => <option key={c}>{c}</option>)}</select>}
          {!template && items && <select value={p.item_id ?? ''} disabled={readOnly} onChange={(e) => { const it = items.find((x) => x.id === e.target.value); upd(i, { item_id: it?.id, name: p.name || it?.name || '' }); }} aria-label="Inventory item"><option value="">Not in inventory</option>{items.map((it) => <option key={it.id} value={it.id}>{it.code} · {it.name}</option>)}</select>}
          {!readOnly && <button type="button" className="btn sm danger" onClick={() => onChange(parts.filter((_, k) => k !== i))} aria-label="Remove part">✕</button>}
          {short && short(p) > 0 && p.status !== 'Cancelled' && p.status !== 'Installed' && <div className="small" style={{ color: 'var(--amber)', gridColumn: '1 / -1' }}>Only part of this is in stock — {short(p)} short. Use “Request purchase”.</div>}
        </div>
      ))}
      {!readOnly && <div><button type="button" className="btn sm" onClick={() => onChange([...parts, { id: uid(), name: '', category: 'Replacement Part', qty: 1, est_cost: 0, status: 'Needed' }])}>+ Add item</button></div>}
    </div>
  );
}
