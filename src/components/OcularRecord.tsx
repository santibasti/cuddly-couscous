// What the estimator records on site during an ocular visit: counts / measurements per requested service, and the site checklist.
import { Stepper } from '@/components/touch';
import { OCULAR_CHECKLIST, CHECK_GROUP_LABEL, checkGroupsFor, checklistConcerns } from '@/lib/ocular';
import { uid } from '@/lib/util';
import type { Measurement, OcularCheck, ServiceCode } from '@/lib/types';

const LABEL_PRESETS: Record<string, string[]> = {
  ROOF: ['Main roof', 'Roof deck', 'Carport roof', 'Garage roof', 'Extension roof'],
  FLOOR: ['Driveway', 'Parking area', 'Patio / terrace', 'Walkway', 'Pool deck'],
  WALL: ['Boundary wall', 'Front wall', 'Side wall', 'Back wall', 'Facade'],
  SOLAR: ['Main roof array', 'Carport array', 'Ground-mounted array', 'Rooftop – east', 'Rooftop – west'],
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Counts or measures for one non-glass service: solar panels are counted, roof / floor / wall areas are measured (length × width, or typed straight in). */
export function MeasureSection({ code, name, unit, rows, onChange }: { code: ServiceCode; name: string; unit: string; rows: Measurement[]; onChange: (rows: Measurement[]) => void }) {
  const counted = unit === 'panel' || code === 'SOLAR';
  const set = (id: string, p: Partial<Measurement>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const total = r2(rows.reduce((s, r) => s + (r.qty || 0), 0));
  const listId = `lbl-${code}`;
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between"><b>{name}</b><span className="small muted">{counted ? 'Count the panels' : 'Measure the area (m × m)'}{rows.length ? ` · total ${total} ${counted ? 'panels' : 'sqm'}` : ''}</span></div>
      <datalist id={listId}>{(LABEL_PRESETS[code] ?? []).map((l) => <option key={l} value={l} />)}</datalist>
      {rows.map((m) => (
        <div key={m.id} className="ocrow">
          <input list={listId} aria-label="Area" placeholder={counted ? 'e.g. Main roof array' : 'e.g. Main roof'} value={m.label} onChange={(e) => set(m.id, { label: e.target.value })} />
          {counted
            ? <div style={{ minWidth: 150 }}><Stepper label={`${name} panels`} min={0} value={m.qty} onChange={(n) => set(m.id, { qty: n ?? 0, unit: 'panel' })} /></div>
            : <>
                <label className="small muted ocdim">Length (m)<input type="number" inputMode="decimal" min="0" step="0.1" value={m.length ?? ''} onChange={(e) => { const l = +e.target.value; set(m.id, { length: l, qty: m.width ? r2(l * m.width) : m.qty, unit: 'sqm' }); }} /></label>
                <label className="small muted ocdim">Width (m)<input type="number" inputMode="decimal" min="0" step="0.1" value={m.width ?? ''} onChange={(e) => { const w = +e.target.value; set(m.id, { width: w, qty: m.length ? r2(m.length * w) : m.qty, unit: 'sqm' }); }} /></label>
                <label className="small muted ocdim">Area (sqm)<input type="number" inputMode="decimal" min="0" step="0.01" value={m.qty || ''} onChange={(e) => set(m.id, { qty: +e.target.value, unit: 'sqm' })} /></label>
              </>}
          <button className="btn sm danger" onClick={() => onChange(rows.filter((x) => x.id !== m.id))} aria-label="Remove">✕</button>
        </div>
      ))}
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => onChange([...rows, { id: uid(), label: '', service_code: code, qty: 0, unit: counted ? 'panel' : 'sqm' }])}>+ {counted ? 'Add array / area' : 'Add area'}</button>
    </div>
  );
}

/** The site checklist: standard yes / no / n.a. questions for the requested services, with a note on any answer. */
export function OcularChecklistForm({ codes, value, onChange }: { codes: string[]; value: OcularCheck[]; onChange: (v: OcularCheck[]) => void }) {
  const get = (key: string) => value.find((c) => c.key === key);
  const set = (key: string, p: Partial<OcularCheck>) => onChange(value.some((c) => c.key === key) ? value.map((c) => (c.key === key ? { ...c, ...p } : c)) : [...value, { key, ...p }]);
  const concerns = checklistConcerns(value);
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between"><b>Site checklist</b><span className="small muted">{value.filter((c) => c.answer).length} answered{concerns.length ? ` · ${concerns.length} concern${concerns.length === 1 ? '' : 's'}` : ''}</span></div>
      {checkGroupsFor(codes).map((g) => (
        <div key={g} style={{ marginTop: 10 }}>
          <div className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{CHECK_GROUP_LABEL[g]}</div>
          {OCULAR_CHECKLIST.filter((d) => d.group === g).map((d) => {
            const c = get(d.key); const flagged = c?.answer === d.bad;
            return (
              <div key={d.key} className={`occheck ${flagged ? 'flag' : ''}`}>
                <div className="occ-q">{d.label}</div>
                <div className="occ-a" role="radiogroup" aria-label={d.label}>
                  {([['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={c?.answer === k} className={`${c?.answer === k ? 'on' : ''} ${c?.answer === k && k === d.bad ? 'bad' : ''}`} onClick={() => set(d.key, { answer: c?.answer === k ? undefined : k })}>{l}</button>)}
                </div>
                {flagged && <input className="occ-n" aria-label="Note" placeholder="Note (optional)" value={c?.note ?? ''} onChange={(e) => set(d.key, { note: e.target.value })} />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
