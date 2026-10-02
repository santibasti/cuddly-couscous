import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, Icon, PhotoInput, Photos, attempt, toast } from '@/components/ui';
import { QrScanner } from '@/components/Qr';
import { Confirm, KIND_LABEL, PhotoField, Seg, condTone } from './shared';
import { DraftBar, PresetChips, Stepper } from '@/components/touch';
import { useDraft } from '@/lib/useDraft';
import { PRESETS } from '@/lib/presets';
import { ITEM_CONDITIONS, completeReturnCheck, type ReturnSummary } from '@/lib/workflow';
import { fmtDateTime, round2 } from '@/lib/util';
import type { CheckItem, ItemCondition, Job, JobWorkflow } from '@/lib/types';

export function ReturnStep({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db } = useAuth();
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const done = !!wf.rc_at;
  const editable = run && !done;
  const [items, setItems] = useState<CheckItem[]>(() => wf.items.map((i) => ((i.loaded_qty ?? 0) > 0 && i.kind !== 'vehicle' && !done ? { ...i, returned_qty: i.returned_qty ?? (i.kind === 'material' ? 0 : i.loaded_qty), ret_condition: i.ret_condition ?? 'Good' } : i)));
  const [photos, setPhotos] = useState<string[]>(wf.rc_photos); const [notes, setNotes] = useState(wf.rc_notes ?? ''); const [ok, setOk] = useState(false);
  const [scan, setScan] = useState(false); const [result, setResult] = useState<ReturnSummary | null>(null);
  const dr = useDraft(`d:${wf.id}:rc`, { items, photos, notes }, (d) => { setItems(d.items); setPhotos(d.photos); setNotes(d.notes); }, editable);
  const setItem = (key: string, patch: Partial<CheckItem>) => setItems((a) => a.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const issued = items.filter((i) => (i.loaded_qty ?? 0) > 0 && i.kind !== 'vehicle');
  const onScan = (code: string) => {
    const it = items.find((i) => i.code?.toUpperCase() === code.trim().toUpperCase());
    if (!it) { toast(`${code} is not on this job's list.`, 'err'); return; }
    setItem(it.key, { returned_qty: it.loaded_qty, ret_condition: it.ret_condition ?? 'Good', ret_by: 'scan' }); toast(`✓ ${it.label} checked in`, 'ok');
  };
  return (
 <div className="stack">
      {editable && <DraftBar d={dr} />}
      {editable && <div className="row"><button className="btn navy" onClick={() => setScan(true)}><Icon name="camera" />Scan to check in</button><button className="btn" onClick={() => setItems(items.map((i) => ((i.loaded_qty ?? 0) > 0 && i.kind !== 'material' && i.kind !== 'vehicle' ? { ...i, returned_qty: i.loaded_qty, ret_condition: i.ret_condition === 'Damaged' ? 'Damaged' : 'Good', ret_by: i.ret_by ?? 'manual' } : i)))}>All returned in good condition</button></div>}
      <div className="small muted">Issued at HQ vs returned at the client site, before leaving. Material usage = issued − returned (calculated). The vehicle is checked at step 10.</div>
      <div className="stack" style={{ gap: 8 }}>
        {issued.map((i) => {
          const iss = i.loaded_qty ?? 0; const back = i.returned_qty ?? 0; const diff = round2(iss - back); const mat = i.kind === 'material';
          const bad = (!mat && (diff > 0 || i.ret_condition === 'Damaged')) || (mat && (i.ret_condition === 'Damaged' || i.ret_condition === 'Missing'));
          return (
            <div key={i.key} className={`itemcard ${bad ? 'bad' : i.returned_qty !== undefined ? 'ok' : ''}`}>
              <div className="row between"><div><b>{i.label}</b> <span className="muted small">{i.code ?? ''} · {KIND_LABEL[i.kind].split(' ')[0]}</span></div>
                {mat ? <Badge tone="blue">Used {round2(iss - back)} {i.unit}</Badge> : diff > 0 ? <Badge tone="red">Missing {diff}</Badge> : <Badge tone="green">Accounted for</Badge>}</div>
              <div className="itemgrid">
                <Field label="Qty issued"><input disabled value={`${iss}${i.unit ? ' ' + i.unit : ''}`} /></Field>
                <Field label={`Qty returned${mat ? ' (unused)' : ''}`}><Stepper label={`Quantity returned ${i.label}`} min={0} max={iss} step={mat ? 0.5 : 1} unit={i.unit} disabled={!editable} value={i.returned_qty} onChange={(v) => setItem(i.key, { returned_qty: v })} /></Field>
              </div>
              <Field label="Condition on return"><Seg value={i.ret_condition} options={ITEM_CONDITIONS} disabled={!editable} tone={condTone} onChange={(v: ItemCondition) => setItem(i.key, { ret_condition: v, ...(v === 'Damaged' && i.repair_required === undefined ? { repair_required: true } : {}) })} /></Field>
              {i.ret_condition === 'Damaged' && !mat && i.asset_id && <label className="check"><input type="checkbox" disabled={!editable} checked={i.repair_required !== false} onChange={(e) => setItem(i.key, { repair_required: e.target.checked })} />Repair required (opens a maintenance ticket and marks the asset Damaged)</label>}
              {(i.ret_condition === 'Damaged' || i.ret_photo) && !mat && <PhotoField label="Damage photo" value={i.ret_photo} onChange={(d) => setItem(i.key, { ret_photo: d })} required={i.ret_condition === 'Damaged'} disabled={!editable} />}
              <Field label={`Notes${i.ret_condition === 'Damaged' || i.ret_condition === 'Missing' || diff > 0 ? ' (missing / damaged details — required)' : ''}`}><input disabled={!editable} value={i.ret_note ?? ''} onChange={(e) => setItem(i.key, { ret_note: e.target.value })} />{(i.ret_condition === 'Damaged' || i.ret_condition === 'Missing' || diff > 0) && <PresetChips replace options={PRESETS.returnNote} value={i.ret_note ?? ''} onChange={(v) => setItem(i.key, { ret_note: v })} disabled={!editable} />}</Field>
              {editable && i.code && <div><button className="btn sm navy" onClick={() => setScan(true)}><Icon name="qr" size={14} />Scan QR</button></div>}
            </div>
          );
        })}
        {!issued.length && <div className="muted">Nothing was issued for this job.</div>}
      </div>
      <div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Return photos (required)</div>
        <Photos items={photos.map((p, k) => ({ src: p, caption: `Return ${k + 1}` }))} onRemove={editable ? (k) => setPhotos(photos.filter((_, x) => x !== k)) : undefined} />
        {editable && <div style={{ marginTop: 8 }}><PhotoInput label="Add return photo" capture="environment" multiple onAdd={(d) => setPhotos((x) => [...x, d])} /></div>}</div>
      <Field label="Notes"><input disabled={!editable} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {editable && <>
        <Confirm checked={ok} onChange={setOk}>I confirm, as Team Leader, that every item above was counted and its condition recorded.</Confirm>
        <button className="btn primary lg" onClick={() => { const r = attempt(() => completeReturnCheck(wf.id, { items, photos, notes, confirmed: ok }), 'Return check completed') as ReturnSummary | undefined; if (r) setResult(r); }}>Confirm return equipment check</button>
      </>}
      {done && <div className="small muted">Recorded {fmtDateTime(wf.rc_at)}. {job.number}: serviceable equipment returns to Available when the crew arrives at HQ (step 10).</div>}
      {(result || done) && (() => {
        const incs = db.incidents.filter((x) => x.workflow_id === wf.id && !x.deleted_at && ['Missing asset', 'Damaged asset', 'Material shortage', 'Missing PPE', 'Other'].includes(x.type));
        return incs.length > 0 ? <div className="alert warn"><b>{incs.length} incident report(s)</b> — Operations / Admin were notified automatically.<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{incs.map((x) => <li key={x.id}><b>{x.number}</b> · {x.type} · {x.status}{x.ticket_id ? ' · maintenance ticket opened' : ''} — {x.description}</li>)}</ul></div> : <div className="alert info">Everything issued was accounted for.</div>;
      })()}
      {result && result.used.length > 0 && <div className="small">Material usage: {result.used.map((u) => `${u.label} ${u.qty}${u.unit ? ' ' + u.unit : ''}`).join(' · ')}</div>}
      {scan && <QrScanner title="Scan returning items" onScan={onScan} onClose={() => setScan(false)} />}
      <span className="hide">{emp(job.leader_id)}</span>
    </div>
  );
}
