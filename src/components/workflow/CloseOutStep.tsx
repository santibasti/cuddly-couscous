import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, Icon, attempt, toast } from '@/components/ui';
import { QrScanner } from '@/components/Qr';
import { Confirm, KIND_LABEL, Seg, TimeField, condTone } from './shared';
import { DraftBar, PresetChips, Stepper } from '@/components/touch';
import { FUEL_LEVELS, ITEM_CONDITIONS, closeOutReady, completeCloseOut, type ReturnSummary } from '@/lib/workflow';
import { useDraft } from '@/lib/useDraft';
import { PRESETS } from '@/lib/presets';
import { fmtDateTime, nowLocal, round2 } from '@/lib/util';
import type { CheckItem, FuelLevel, ItemCondition, Job, JobWorkflow } from '@/lib/types';

/** Close-Out: equipment return + materials used / returned + leave-site time + arrival-at-HQ time + Team Leader confirmation. */
export function CloseOutStep({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db } = useAuth();
  const done = !!wf.closed_at;
  const editable = run && !done;
  const ready = closeOutReady(db, job, wf);
  const [items, setItems] = useState<CheckItem[]>(() => wf.items.map((i) => ((i.loaded_qty ?? 0) > 0 && !done ? { ...i, returned_qty: i.returned_qty ?? (i.kind === 'material' ? 0 : i.loaded_qty), ret_condition: i.ret_condition ?? 'Good' } : i)));
  const [leave, setLeave] = useState(nowLocal()); const [hqa, setHqa] = useState(nowLocal());
  const [fuel, setFuel] = useState<FuelLevel | undefined>(wf.hqa_fuel);
  const [notes, setNotes] = useState(wf.closed_notes ?? ''); const [ok, setOk] = useState(false);
  const [scan, setScan] = useState(false); const [result, setResult] = useState<ReturnSummary | null>(null);
  const dr = useDraft(`d:${wf.id}:close`, { items, leave, hqa, fuel, notes }, (d) => { setItems(d.items); setLeave(d.leave); setHqa(d.hqa); setFuel(d.fuel); setNotes(d.notes); }, editable);
  const setItem = (key: string, patch: Partial<CheckItem>) => setItems((a) => a.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const issued = items.filter((i) => (i.loaded_qty ?? 0) > 0);
  const onScan = (code: string) => {
    const it = items.find((i) => i.code?.toUpperCase() === code.trim().toUpperCase());
    if (!it) { toast(`${code} is not on this job's list.`, 'err'); return; }
    setItem(it.key, { returned_qty: it.loaded_qty, ret_condition: it.ret_condition ?? 'Good', ret_by: 'scan' }); toast(`✓ ${it.label} checked in`, 'ok');
  };
  const incs = db.incidents.filter((x) => x.workflow_id === wf.id && !x.deleted_at);
  return (
    <div className="stack">
      {editable && <DraftBar d={dr} />}
      {!done && <ul className="list" style={{ border: '1px solid var(--line-2)', borderRadius: 6 }}>{ready.map((g) => <li key={g.key}><span>{g.ok ? '✅' : '⬜'} {g.label}</span><Badge tone={g.ok ? 'green' : 'amber'}>{g.ok ? 'Done' : 'Pending'}</Badge></li>)}</ul>}
      {editable && <div className="row"><button className="btn navy" onClick={() => setScan(true)}><Icon name="camera" />Scan to check in</button><button className="btn" onClick={() => setItems(items.map((i) => ((i.loaded_qty ?? 0) > 0 && i.kind !== 'material' ? { ...i, returned_qty: i.loaded_qty, ret_condition: i.ret_condition === 'Damaged' ? 'Damaged' : 'Good', ret_by: i.ret_by ?? 'manual' } : i)))}>All returned in good condition</button></div>}
      <div className="small muted">Issued at job prep vs returned. Material used = issued − returned (calculated). Good items go back to <b>Available</b>; damaged and missing items create an incident report automatically.</div>
      <div className="stack" style={{ gap: 8 }}>
        {issued.map((i) => {
          const iss = i.loaded_qty ?? 0; const back = i.returned_qty ?? 0; const diff = round2(iss - back); const mat = i.kind === 'material';
          const bad = (!mat && (diff > 0 || i.ret_condition === 'Damaged' || i.ret_condition === 'Missing')) || (mat && (i.ret_condition === 'Damaged' || i.ret_condition === 'Missing'));
          return (
            <div key={i.key} className={`itemcard ${bad ? 'bad' : i.returned_qty !== undefined ? 'ok' : ''}`}>
              <div className="row between"><div><b>{i.label}</b> <span className="muted small">{i.code ?? ''} · {KIND_LABEL[i.kind].split(' ')[0]}</span></div>
                {mat ? <Badge tone="blue">Used {round2(iss - back)} {i.unit}</Badge> : diff > 0 ? <Badge tone="red">Missing {diff}</Badge> : <Badge tone="green">Accounted for</Badge>}</div>
              <div className="itemgrid">
                <Field label="Qty issued"><input disabled value={`${iss}${i.unit ? ' ' + i.unit : ''}`} /></Field>
                <Field label={`Qty returned${mat ? ' (unused)' : ''}`}><Stepper label={`Quantity returned ${i.label}`} min={0} max={iss} step={mat ? 0.5 : 1} unit={i.unit} disabled={!editable} value={i.returned_qty} onChange={(v) => setItem(i.key, { returned_qty: v })} /></Field>
              </div>
              <Field label="Condition on return"><Seg value={i.ret_condition} options={ITEM_CONDITIONS} disabled={!editable} tone={condTone} onChange={(v: ItemCondition) => setItem(i.key, { ret_condition: v, ...(v === 'Damaged' && i.repair_required === undefined ? { repair_required: true } : {}) })} /></Field>
              {i.ret_condition === 'Damaged' && !mat && i.asset_id && <label className="check"><input type="checkbox" disabled={!editable} checked={i.repair_required !== false} onChange={(e) => setItem(i.key, { repair_required: e.target.checked })} />Send for repair (opens a maintenance ticket → Under Maintenance). Untick to flag as Damaged only.</label>}
              {(i.ret_condition === 'Damaged' || i.ret_condition === 'Missing' || diff > 0 || i.ret_note) && <Field label={`Missing / damaged note${i.ret_condition !== 'Good' || diff > 0 ? ' (required)' : ''}`}><input disabled={!editable} value={i.ret_note ?? ''} onChange={(e) => setItem(i.key, { ret_note: e.target.value })} />{editable && <PresetChips replace options={PRESETS.returnNote} value={i.ret_note ?? ''} onChange={(v) => setItem(i.key, { ret_note: v })} />}</Field>}
              {editable && i.code && <div><button className="btn sm navy" onClick={() => setScan(true)}><Icon name="qr" size={14} />Scan QR</button></div>}
            </div>
          );
        })}
        {!issued.length && <div className="muted">Nothing was issued for this job.</div>}
      </div>
      {done ? (
        <dl className="kv"><dt>Left site</dt><dd>{fmtDateTime(wf.leave_at)}</dd><dt>Arrived at HQ</dt><dd>{fmtDateTime(wf.hqa_at)}</dd>{wf.hqa_fuel && <><dt>Fuel</dt><dd>{wf.hq_fuel ?? '—'} → {wf.hqa_fuel}</dd></>}{wf.closed_notes && <><dt>Notes</dt><dd>{wf.closed_notes}</dd></>}<dt>Closed</dt><dd>{fmtDateTime(wf.closed_at)}</dd></dl>
      ) : (
        <>
          <div className="form-grid"><TimeField label="Leave-site time" value={leave} onChange={setLeave} disabled={!editable} /><TimeField label="Arrived-at-HQ time" value={hqa} onChange={setHqa} disabled={!editable} /></div>
          {job.vehicle_id && <Field label="Vehicle fuel level on return (optional)"><Seg value={fuel} options={FUEL_LEVELS} disabled={!editable} onChange={(v) => setFuel(fuel === v ? undefined : v)} /></Field>}
          <Field label="Notes (optional)"><input disabled={!editable} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {editable && <>
            <Confirm checked={ok} onChange={setOk}>I confirm, as Team Leader, that every item above was counted, its condition recorded, and the crew is back at headquarters.</Confirm>
            <button className="btn primary lg" disabled={!ok} onClick={() => { const r = attempt(() => completeCloseOut(wf.id, { items, leave_at: leave, hqa_at: hqa, fuel, notes, confirmed: ok }), 'Job closed') as ReturnSummary | undefined; if (r) { dr.markSaved(); setResult(r); } }}>Confirm close-out &amp; close job</button>
          </>}
        </>
      )}
      {(result || done) && (incs.length > 0 ? <div className="alert warn"><b>{incs.length} incident report(s)</b> — Operations / Admin were notified automatically.<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{incs.map((x) => <li key={x.id}><b>{x.number}</b> · {x.type} · {x.status}{x.ticket_id ? ' · maintenance ticket opened' : ''} — {x.description}</li>)}</ul></div> : <div className="alert info">Everything issued was accounted for.</div>)}
      {result && result.used.length > 0 && <div className="small">Material usage: {result.used.map((u) => `${u.label} ${u.qty}${u.unit ? ' ' + u.unit : ''}`).join(' · ')}</div>}
      {scan && <QrScanner title="Scan returning items" onScan={onScan} onClose={() => setScan(false)} />}
    </div>
  );
}
