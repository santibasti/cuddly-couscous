import { isUnavailable } from '@/lib/maintenance-core';
import { useMemo, useState } from 'react';
import { useAuth, live } from '@/lib/store';
import { Field, Icon, Modal, attempt, useObj } from '@/components/ui';
import { docTotals, findConflicts } from '@/lib/business';
import { saveJob } from '@/lib/actions';
import { addDays, today } from '@/lib/util';
import { SiteForm } from '@/pages/ClientDetail';
import type { Job, ServiceCode } from '@/lib/types';

export const PPE_OPTIONS = ['Hard hat', 'Safety boots', 'Gloves', 'Safety goggles', 'Full-body harness & lanyard', 'High-visibility vest', 'Respirator / mask', 'Rain gear', 'Sun protection'];

export function defaultChecklist(db: { services: { code: ServiceCode; name: string }[] }, codes: ServiceCode[]) {
  return ['Site safety briefing & PPE check', 'Pre-work inspection & before photos', 'Cordon off / signage installed', ...codes.map((c) => `Perform ${db.services.find((s) => s.code === c)?.name ?? c}`), 'Post-work inspection with client rep', 'After photos & clean-up', 'Client sign-off'].map((label) => ({ label, done: false }));
}

type Form = Omit<Job, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'number'>;

export function JobForm({ initial, fromQuoteId, defaultStart, onClose, onSaved }: { initial?: Job; fromQuoteId?: string; defaultStart?: string; onClose: () => void; onSaved?: (j: Job) => void }) {
  const { db, can } = useAuth();
  const [newSite, setNewSite] = useState(false);
  const q = fromQuoteId ? db.quotations.find((x) => x.id === fromQuoteId) : undefined;
  const day = defaultStart ?? addDays(today(), 1);
  const f = useObj<Form>(() => initial ? { ...initial } : {
    client_id: q?.client_id ?? live(db.clients).find((c) => c.status === 'Active')?.id ?? '', site_id: q?.site_id ?? '', quotation_id: q?.id, branch_id: db.branches[0].id,
    service_codes: q ? [...new Set(q.items.map((i) => i.service_code))] : ['GLASS_EXT'], scope: q?.scope ?? '', start_at: `${day}T08:00`, end_at: `${day}T17:00`, status: 'Pending',
    leader_id: undefined, crew_ids: [], vehicle_id: undefined, equipment_ids: [], materials: [], ppe: ['Hard hat', 'Safety boots', 'Gloves', 'Safety goggles'], checklist: [], findings: '', damage_report: '', equipment_condition_notes: '',
    contract_amount: q ? docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).net : 0, estimated_cost: 0,
  });
  const v = f.v;
  const sites = live(db.sites).filter((s) => s.client_id === v.client_id);
  const field = live(db.employees).filter((e) => e.status !== 'inactive' && e.department === 'Field Operations');
  const leaders = field.filter((e) => e.tier === 'Team Leader' || e.tier === 'Senior Technician');
  const vehicles = live(db.assets).filter((a) => a.category === 'Vehicle' && a.status !== 'Retired');
  const equipment = live(db.assets).filter((a) => a.category !== 'Vehicle' && a.status !== 'Retired');

  const conflicts = useMemo(() => findConflicts(db, { ...v, id: initial?.id }), [db, v, initial?.id]);
  const busy = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of conflicts) m.set(`${c.kind}:${c.refId}`, c.job.number);
    return m;
  }, [conflicts]);
  const tag = (kind: string, id: string) => (busy.has(`${kind}:${id}`) ? ` — BUSY (${busy.get(`${kind}:${id}`)})` : '');
  const toggle = <K extends 'crew_ids' | 'equipment_ids' | 'ppe' | 'service_codes'>(k: K, val: Form[K][number]) => {
    const cur = v[k] as unknown[];
    f.set(k, (cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]) as Form[K]);
  };

  const save = () => {
    if (!v.client_id || !v.site_id) return attempt(() => { throw new Error('Choose a client and a service site.'); });
    if (!v.service_codes.length) return attempt(() => { throw new Error('Choose at least one service.'); });
    const data = { ...v, checklist: v.checklist.length ? v.checklist : defaultChecklist(db, v.service_codes), branch_id: db.clients.find((c) => c.id === v.client_id)?.branch_id ?? v.branch_id };
    const r = attempt(() => saveJob({ ...data, id: initial?.id, number: initial?.number }), initial ? 'Job updated' : 'Job booked') as Job | undefined;
    if (r) { onClose(); onSaved?.(r); }
  };

  return (
    <>
    <Modal size="xl" title={initial ? `Edit ${initial.number}` : 'Book a job'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>{initial ? 'Save changes' : 'Book job'}</button></>}>
      {conflicts.length > 0 && <div className="alert err" style={{ marginBottom: 12 }}><b>Double-booking detected.</b> Highlighted resources are already assigned in this time window; saving is blocked until resolved.</div>}
      <div className="form-grid">
        <Field label="Client" required><select value={v.client_id} onChange={(e) => { f.set('client_id', e.target.value); f.set('site_id', ''); }}>{live(db.clients).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Job site" required hint={v.client_id && !sites.length ? 'This client has no service site yet.' : undefined}><div className="row" style={{ gap: 6 }}><select style={{ flex: 1 }} {...f.bind('site_id')}><option value="">— select —</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>{v.client_id && can('clients.edit') && <button type="button" className="btn sm" onClick={() => setNewSite(true)}>+ Site</button>}</div></Field>
        <Field label="Start"><input type="datetime-local" step={900} {...f.bind('start_at')} /></Field>
        <Field label="End"><input type="datetime-local" step={900} {...f.bind('end_at')} /></Field>
        <div className="full"><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Services</div><div className="row">{db.services.map((s) => <label key={s.code} className="check"><input type="checkbox" checked={v.service_codes.includes(s.code)} onChange={() => toggle('service_codes', s.code)} />{s.name}</label>)}</div></div>
        <Field label="Scope of work" className="full"><textarea {...f.bind('scope')} /></Field>
        <Field label="Contract amount (ex-VAT, ₱)"><input type="number" min="0" {...f.bind('contract_amount')} /></Field>
        <Field label="Estimated direct cost (₱)"><input type="number" min="0" {...f.bind('estimated_cost')} /></Field>
        <Field label="Expense budget — gas, toll, meals (₱)" hint="Compared with the actual expenses entered after the service."><input type="number" min="0" value={v.expense_budget ?? ''} onChange={(e) => f.set('expense_budget', e.target.value === '' ? undefined : Number(e.target.value))} /></Field>
        <Field label="Status"><select {...f.bind('status')} disabled={!!initial && !['Pending', 'Confirmed', 'Cancelled'].includes(initial.status)}>{(initial && !['Pending', 'Confirmed', 'Cancelled'].includes(initial.status) ? [initial.status] : ['Pending', 'Confirmed', 'Cancelled']).map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Team leader"><select value={v.leader_id ?? ''} onChange={(e) => f.set('leader_id', e.target.value || undefined)}><option value="">— none —</option>{leaders.map((e) => <option key={e.id} value={e.id}>{e.full_name}{tag('crew', e.id)}</option>)}</select></Field>
        <Field label="Vehicle"><select value={v.vehicle_id ?? ''} onChange={(e) => f.set('vehicle_id', e.target.value || undefined)}><option value="">— none —</option>{vehicles.map((a) => <option key={a.id} value={a.id} disabled={isUnavailable(a.status)}>{a.name}{a.status !== 'Available' && a.status !== 'Reserved' && a.status !== 'In Use' ? ` (${a.status})` : ''}{tag('vehicle', a.id)}</option>)}</select></Field>
        <div className="full">
          <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Crew</div>
          <div className="grid g-auto">{field.map((e) => <label key={e.id} className="check" style={{ color: busy.has(`crew:${e.id}`) ? 'var(--red)' : undefined }}><input type="checkbox" checked={v.crew_ids.includes(e.id)} disabled={e.id === v.leader_id} onChange={() => toggle('crew_ids', e.id)} />{e.full_name}<span className="small muted">{tag('crew', e.id)}</span></label>)}</div>
        </div>
        <div className="full">
          <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Machines & equipment</div>
          <div className="grid g-auto">{equipment.map((a) => {
            const off = isUnavailable(a.status);
            return <label key={a.id} className="check" style={{ color: busy.has(`equipment:${a.id}`) ? 'var(--red)' : off ? 'var(--muted)' : undefined }}><input type="checkbox" checked={v.equipment_ids.includes(a.id)} disabled={off} onChange={() => toggle('equipment_ids', a.id)} />{a.name}<span className="small muted">{off ? ` (${a.status})` : tag('equipment', a.id)}</span></label>;
          })}</div>
        </div>
        <div className="full">
          <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Safety requirements / PPE</div>
          <div className="row">{PPE_OPTIONS.map((p) => <label key={p} className="check"><input type="checkbox" checked={v.ppe.includes(p)} onChange={() => toggle('ppe', p)} />{p}</label>)}</div>
        </div>
        <div className="full">
          <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Planned materials (reserved from inventory)</div>
          <div className="stack">
            {v.materials.map((m, i) => (
              <div key={i} className="row">
                <select value={m.item_id} onChange={(e) => f.set('materials', v.materials.map((x, k) => (k === i ? { ...x, item_id: e.target.value } : x)))} style={{ maxWidth: 320 }}>{live(db.items).map((it) => <option key={it.id} value={it.id}>{it.code} · {it.name} ({it.uom})</option>)}</select>
                <input type="number" min="0" step="0.5" value={m.planned_qty} onChange={(e) => f.set('materials', v.materials.map((x, k) => (k === i ? { ...x, planned_qty: +e.target.value } : x)))} style={{ width: 90 }} aria-label="Quantity" />
                <button className="icon-btn" onClick={() => f.set('materials', v.materials.filter((_, k) => k !== i))} aria-label="Remove"><Icon name="trash" /></button>
              </div>
            ))}
            <div><button className="btn sm" onClick={() => f.set('materials', [...v.materials, { item_id: db.items[0].id, planned_qty: 1 }])}><Icon name="plus" />Add material</button></div>
          </div>
        </div>
      </div>
    </Modal>
      {newSite && <SiteForm clientId={v.client_id} onClose={() => setNewSite(false)} onSaved={(st) => f.set('site_id', st.id)} />}
    </>
  );
}
