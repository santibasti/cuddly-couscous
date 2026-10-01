import { useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PhotoInput, Photos, attempt, toast } from '@/components/ui';
import { QrScanner } from '@/components/Qr';
import { Confirm, GpsField, ItemCard, AddToolModal, KIND_LABEL, PhotoField, Seg, condTone, type Geo } from './shared';
import { ConformeStep } from './ConformeStep';
import { VariationStep } from './VariationStep';
import { ReportStep } from './ReportStep';
import { ReturnStep } from './ReturnStep';
import { WORKFLOW_STEPS, hqGaps, workflowProgress, type StepState } from '@/lib/business';
import {
  FUEL_LEVELS, arriveAtHq, arriveAtSite, canRunWorkflow, closeJob, closureGates, completeHqChecklist, correctWorkflow, dispatchJob, leaveSite, matchScan, openWorkflow, saveHqDraft, startWork, workflowFor,
} from '@/lib/workflow';
import { fmtDateTime, fmtStamp, nowLocal, round2 } from '@/lib/util';
import type { CheckItem, FuelLevel, Job, JobWorkflow, VehicleCondition } from '@/lib/types';

export const userName = (db: ReturnType<typeof useAuth>['db'], id?: string) => db.users.find((u) => u.id === id)?.name ?? (id ? id : '—');
const gpsLink = (lat?: number, lng?: number, note?: string) => (lat !== undefined ? <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${lat},${lng}`}>{lat}, {lng}</a> : <span className="muted">not captured{note ? ` (${note})` : ''}</span>);

/* ---------- a step card: number, title, date/time + user, body ---------- */
export function Step({ n, state, at, by, children, open, onToggle, actions }: { n: number; state: StepState; at?: string; by?: string; children: ReactNode; open: boolean; onToggle: () => void; actions?: ReactNode }) {
  const { db } = useAuth();
  const done = state === 'done';
  return (
    <section id={`step-${n}`} className={`wfstep ${state}`}>
      <button type="button" className="wfhead" onClick={onToggle} aria-expanded={open}>
        <span className="avatar" style={{ background: done ? 'var(--green)' : state === 'locked' ? '#9db0c5' : 'var(--navy)' }}>{done ? '✓' : n}</span>
        <span className="grow"><b>{n}. {WORKFLOW_STEPS[n - 1]}</b>{done && at && <span className="small muted"> · {fmtDateTime(at)} · {userName(db, by)}</span>}</span>
        <Badge tone={done ? 'green' : state === 'current' ? 'blue' : state === 'open' ? 'teal' : 'gray'}>{done ? 'Done' : state === 'current' ? 'Next' : state === 'open' ? 'Available' : 'Locked'}</Badge>
        <span className="small muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="wfbody">{actions && <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>{actions}</div>}{children}</div>}
    </section>
  );
}
const Locked = ({ why }: { why: string }) => <div className="muted">{why}</div>;

/* ================= the panel ================= */
export function WorkflowPanel({ job }: { job: Job }) {
  const { db, can } = useAuth();
  const wf = db.workflows.find((w) => w.job_id === job.id && !w.deleted_at);
  const vars = db.variations.filter((v) => v.job_id === job.id && !v.deleted_at);
  const prog = workflowProgress(wf, vars);
  const run = canRunWorkflow(job);
  const first = prog.findIndex((p) => p.state === 'current');
  const [openSet, setOpenSet] = useState<Record<number, boolean | undefined>>({});
  const [fix, setFix] = useState(false);
  const isOpen = (i: number) => openSet[i] ?? i === first;
  const toggle = (i: number) => setOpenSet((s) => ({ ...s, [i]: !isOpen(i) }));
  const canceled = ['Cancelled', 'Rescheduled'].includes(job.status);
  const st = (i: number) => prog[i];

  if (canceled) return null;
  if (!wf) {
    return (
      <Card title="Job workflow">
        <p style={{ marginTop: 0 }}>The 11-step workflow (equipment checklist → dispatch → site arrival → conforme → work → service report → return check → close) starts from the HQ equipment checklist. It loads the crew, vehicle, equipment and materials from this booking.</p>
        {job.status === 'Pending' && <div className="alert warn" style={{ marginBottom: 10 }}>Confirm the booking first.</div>}
        {['Confirmed', 'Dispatch Checklist Pending'].includes(job.status) ? (run ? <button className="btn primary lg" onClick={() => attempt(() => openWorkflow(job.id), 'Equipment checklist ready')}>Start equipment checklist (HQ)</button> : <div className="alert warn">Only the assigned Team Leader or a manager can start this checklist.</div>) : job.status !== 'Pending' && <div className="muted">This job has no workflow record (it was completed before the workflow was introduced).</div>}
      </Card>
    );
  }
  const jump = (i: number) => { setOpenSet((s) => ({ ...s, [i]: true })); setTimeout(() => document.getElementById(`step-${i + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <Card title="Job progress" actions={can('incidents.manage') ? <button className="btn sm" onClick={() => setFix(true)}><Icon name="edit" />Correct record</button> : undefined}>
        <ol className="tracker" aria-label="Job workflow progress">
          {WORKFLOW_STEPS.map((t, i) => { const p = st(i); return (
            <li key={t} className={p.state}><button type="button" onClick={() => jump(i)} title={t}><i>{p.state === 'done' ? '✓' : i + 1}</i><span>{t}</span>{p.at && <small>{fmtDateTime(p.at)}</small>}</button></li>
          ); })}
        </ol>
        {!run && <div className="alert info" style={{ marginTop: 10 }}>You can view this workflow. Only the assigned Team Leader or a manager can complete the steps.</div>}
      </Card>

      <Step n={1} state={st(0).state} at={wf.hq_at} by={wf.hq_by} open={isOpen(0)} onToggle={() => toggle(0)}>
        {wf.hq_at ? <HqSummary wf={wf} /> : <HqForm wf={wf} job={job} run={run} />}
      </Step>
      <Step n={2} state={st(1).state} at={wf.disp_at} by={wf.disp_by} open={isOpen(1)} onToggle={() => toggle(1)}>
        {wf.disp_at ? <dl className="kv"><dt>Departed HQ</dt><dd>{fmtDateTime(wf.disp_at)}</dd><dt>GPS</dt><dd>{gpsLink(wf.disp_lat, wf.disp_lng, wf.disp_gps_note)}</dd><dt>Notes</dt><dd>{wf.disp_notes || '—'}</dd>{wf.disp_photo && <><dt>Loading photo</dt><dd><Photos items={[{ src: wf.disp_photo, caption: 'Loading / departure' }]} /></dd></>}</dl>
          : !wf.hq_at ? <Locked why="Available after the HQ equipment checklist is confirmed." /> : <DispatchForm wf={wf} run={run} />}
      </Step>
      <Step n={3} state={st(2).state} at={wf.arr_at} by={wf.arr_by} open={isOpen(2)} onToggle={() => toggle(2)}>
        {wf.arr_at ? <ArrivalSummary wf={wf} job={job} /> : !wf.disp_at ? <Locked why="Available after the crew is dispatched." /> : <ArrivalForm wf={wf} job={job} run={run} />}
      </Step>
      <Step n={4} state={st(3).state} at={wf.conf_at} by={wf.conf_by} open={isOpen(3)} onToggle={() => toggle(3)}>
        {!wf.arr_at ? <Locked why="Available after arrival on site is recorded." /> : <ConformeStep wf={wf} job={job} run={run} />}
      </Step>
      <Step n={5} state={st(4).state} at={wf.start_at} by={wf.start_by} open={isOpen(4)} onToggle={() => toggle(4)}>
        {wf.start_at ? <dl className="kv"><dt>Started</dt><dd>{fmtDateTime(wf.start_at)}</dd><dt>Crew present</dt><dd>{(wf.start_crew_present ?? []).map((e) => db.employees.find((x) => x.id === e)?.full_name).join(', ')}</dd><dt>Safety briefing / PPE</dt><dd>Confirmed / Confirmed</dd><dt>Notes</dt><dd>{wf.start_notes || '—'}</dd><dt>Photos</dt><dd><Photos items={wf.start_photos.map((p, i) => ({ src: p, caption: `Work start ${i + 1}` }))} /></dd></dl>
          : !wf.conf_at ? <Locked why="Enabled once the client conforme is signed (step 4)." /> : <StartForm wf={wf} job={job} run={run} />}
      </Step>
      <Step n={6} state={st(5).state} at={st(5).at} by={st(5).by} open={isOpen(5)} onToggle={() => toggle(5)}>
        {!wf.start_at ? <Locked why="Available once work has started. Use this step for additional work, changed quantities, added panels or scope changes — the original quotation is never overwritten." /> : <VariationStep wf={wf} job={job} run={run} />}
      </Step>
      <Step n={7} state={st(6).state} at={wf.rep_at} by={wf.rep_by} open={isOpen(6)} onToggle={() => toggle(6)}>
        {!wf.start_at ? <Locked why="Available once work has started." /> : <ReportStep wf={wf} job={job} run={run} />}
      </Step>
      <Step n={8} state={st(7).state} at={wf.rc_at} by={wf.rc_by} open={isOpen(7)} onToggle={() => toggle(7)}>
        {!wf.rep_at ? <Locked why="Available after the service report is signed." /> : <ReturnStep wf={wf} job={job} run={run} />}
      </Step>
      <Step n={9} state={st(8).state} at={wf.leave_at} by={wf.leave_by} open={isOpen(8)} onToggle={() => toggle(8)}>
        {wf.leave_at ? <dl className="kv"><dt>Left site</dt><dd>{fmtDateTime(wf.leave_at)}</dd><dt>GPS</dt><dd>{gpsLink(wf.leave_lat, wf.leave_lng, wf.leave_gps_note)}</dd><dt>Notes</dt><dd>{wf.leave_notes || '—'}</dd>{wf.leave_photo && <><dt>Photo</dt><dd><Photos items={[{ src: wf.leave_photo, caption: 'Leaving site' }]} /></dd></>}</dl>
          : !wf.rc_at ? <Locked why="Enabled after the return equipment check (step 8)." /> : <LeaveForm wf={wf} run={run} />}
      </Step>
      <Step n={10} state={st(9).state} at={wf.hqa_at} by={wf.hqa_by} open={isOpen(9)} onToggle={() => toggle(9)}>
        {wf.hqa_at ? <HqaSummary wf={wf} /> : !wf.leave_at ? <Locked why="Available after leaving the client site." /> : <HqaForm wf={wf} run={run} />}
      </Step>
      <Step n={11} state={st(10).state} at={wf.closed_at} by={wf.closed_by} open={isOpen(10)} onToggle={() => toggle(10)}>
        <CloseStep wf={wf} job={job} run={run} />
      </Step>
      {fix && <CorrectModal wf={wf} onClose={() => setFix(false)} />}
    </div>
  );
}

/* ================= Step 1: HQ equipment checklist ================= */
function HqForm({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db } = useAuth();
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const crew = [...new Set([...(job.leader_id ? [job.leader_id] : []), ...job.crew_ids])];
  const vehAsset = db.assets.find((a) => a.id === job.vehicle_id);
  const [items, setItems] = useState<CheckItem[]>(wf.items);
  const [veh, setVeh] = useState({ cond: (wf.hq_veh_condition ?? 'Good') as VehicleCondition, photo: wf.hq_veh_photo, notes: wf.hq_veh_notes ?? '', fuel: wf.hq_fuel as FuelLevel | undefined, odo: wf.hq_odo ?? vehAsset?.meter_reading });
  const [reason, setReason] = useState(wf.hq_shortage_reason ?? '');
  const [notes, setNotes] = useState(wf.hq_notes ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [scan, setScan] = useState<{ key?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const draft = () => ({ items, hq_odo: veh.odo, hq_fuel: veh.fuel, hq_veh_condition: veh.cond, hq_veh_photo: veh.photo, hq_veh_notes: veh.notes, hq_notes: notes, hq_shortage_reason: reason });
  const gaps = useMemo(() => hqGaps(draft() as never), [items, veh, reason, notes]); // eslint-disable-line react-hooks/exhaustive-deps
  const setItem = (key: string, patch: Partial<CheckItem>) => setItems((a) => a.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const confirmItem = (i: CheckItem, by: 'scan' | 'id' | 'manual') => setItem(i.key, { out_ok: true, out_by: by, loaded_qty: i.loaded_qty ?? i.qty, ...(i.kind === 'material' ? { out_container: i.out_container ?? 'Good' } : { out_condition: i.out_condition ?? 'Good' }) });
  const disabled = !run;
  const onScan = (code: string) => {
    const it = matchScan(items, code);
    if (!it) { const a = db.assets.find((x) => x.code.toUpperCase() === code); toast(a ? `${code} (${a.name}) is not on this job's list — use “Add tool”.` : `${code} is not a known asset.`, 'err'); return; }
    if (scan?.key && it.key !== scan.key) { toast(`That is ${it.label}, not the item you selected.`, 'err'); return; }
    confirmItem(it, 'scan'); toast(`✓ ${it.label} confirmed`, 'ok');
  };
  const mats = items.filter((i) => i.kind === 'material');
  return (
    <div className="stack">
      <dl className="kv"><dt>Job ref</dt><dd><b>{job.number}</b></dd><dt>Team leader</dt><dd>{emp(job.leader_id)}</dd><dt>Crew</dt><dd>{job.crew_ids.map(emp).join(', ') || '—'}</dd></dl>
      {run && <div className="row"><button className="btn navy" onClick={() => setScan({})}><Icon name="camera" />Scan any item</button><button className="btn" onClick={() => setAdding(true)}><Icon name="plus" />Add tool</button><button className="btn" onClick={() => attempt(() => saveHqDraft(wf.id, draft()), 'Progress saved')}>Save progress</button></div>}

      {vehAsset ? (
        <div className="itemcard">
          <b>Vehicle: {vehAsset.name}</b> <span className="muted small">{vehAsset.code}</span>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <Field label="Starting odometer (km)" required><input type="number" inputMode="numeric" disabled={disabled} value={veh.odo ?? ''} onChange={(e) => setVeh({ ...veh, odo: e.target.value === '' ? undefined : +e.target.value })} /></Field>
            <Field label="Starting fuel level" required><Seg value={veh.fuel} options={FUEL_LEVELS} disabled={disabled} onChange={(v) => setVeh({ ...veh, fuel: v })} /></Field>
            <Field label="Vehicle condition"><Seg value={veh.cond} options={['Good', 'With Issue'] as const} disabled={disabled} tone={condTone} onChange={(v) => setVeh({ ...veh, cond: v })} /></Field>
            <Field label="Vehicle photo"><PhotoField label="Take vehicle photo" value={veh.photo} onChange={(d) => setVeh({ ...veh, photo: d })} disabled={disabled} /></Field>
            <Field label={`Notes${veh.cond === 'With Issue' ? ' (describe the issue — required)' : ''}`} className="full"><input disabled={disabled} value={veh.notes} onChange={(e) => setVeh({ ...veh, notes: e.target.value })} /></Field>
          </div>
          {items.filter((i) => i.kind === 'vehicle').map((i) => <div key={i.key} className="row" style={{ marginTop: 6 }}>{run && <button className="btn sm navy" onClick={() => setScan({ key: i.key })}><Icon name="qr" size={14} />Scan QR</button>}<label className="check"><input type="checkbox" disabled={disabled} checked={!!i.out_ok} onChange={(e) => (e.target.checked ? confirmItem(i, 'manual') : setItem(i.key, { out_ok: false }))} />Vehicle confirmed</label></div>)}
        </div>
      ) : <div className="alert warn">No vehicle is assigned to this booking.</div>}

      {(['equipment', 'tool', 'ppe'] as const).map((k) => { const rows = items.filter((i) => i.kind === k); if (!rows.length) return null; return (
        <div key={k}><div className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 6px' }}>{KIND_LABEL[k]}</div>
          <div className="stack" style={{ gap: 8 }}>{rows.map((i) => <ItemCard key={i.key} it={i} setItem={setItem} confirmItem={confirmItem} onScan={() => setScan({ key: i.key })} crew={crew} disabled={disabled} emp={emp} onRemove={i.extra ? () => setItems(items.filter((x) => x.key !== i.key)) : undefined} />)}</div></div>
      ); })}

      <div><div className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 6px' }}>{KIND_LABEL.material} issued</div>
        {!mats.length && <div className="muted">No chemicals or materials allocated.</div>}
        <div className="stack" style={{ gap: 8 }}>{mats.map((i) => {
          const inv = db.items.find((x) => x.id === i.item_id)!; const oh = db.stock.filter((t) => t.approval === 'Approved' && t.item_id === inv.id && t.location_id === inv.location_id).reduce((s, t) => s + t.qty, 0);
          return (
            <div key={i.key} className={`itemcard ${i.out_ok ? 'ok' : ''}`}>
              <div className="row between"><div><b>{i.label}</b> <span className="muted small">{i.code}</span></div>{i.out_ok ? <Badge tone="green">✓ Confirmed</Badge> : <Badge tone="amber">Not confirmed</Badge>}</div>
              <div className="itemgrid">
                <Field label="Required"><input disabled value={`${i.qty} ${i.unit ?? ''}`} /></Field>
                <Field label={`Qty issued (${i.unit ?? ''})`}><input type="number" min="0" step="0.5" disabled={disabled} value={i.loaded_qty ?? ''} onChange={(e) => setItem(i.key, { loaded_qty: e.target.value === '' ? undefined : +e.target.value })} /></Field>
                <Field label="Container condition"><Seg value={i.out_container ?? 'Good'} options={['Good', 'Damaged', 'Leaking'] as const} disabled={disabled} tone={condTone} onChange={(v) => setItem(i.key, { out_container: v })} /></Field>
              </div>
              <div className="small muted">On hand in {db.locations.find((l) => l.id === inv.location_id)?.name}: <b>{round2(oh)} {inv.uom}</b> — issuing deducts from inventory when the checklist is confirmed.</div>
              {run && <label className="check"><input type="checkbox" checked={!!i.out_ok} onChange={(e) => (e.target.checked ? confirmItem(i, 'manual') : setItem(i.key, { out_ok: false }))} />Confirm issued quantity and container condition</label>}
            </div>
          );
        })}</div>
      </div>

      <div className={`alert ${gaps.incomplete.length ? 'err' : gaps.shortages.length ? 'warn' : 'info'}`}>
        {gaps.incomplete.length > 0 && <div><b>Still to complete:</b> {gaps.incomplete.join(' · ')}</div>}
        {gaps.shortages.length > 0 && <div><b>Short / damaged / missing:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{gaps.shortages.map((d) => <li key={d}>{d}</li>)}</ul>An incident report is raised automatically and Operations is notified.</div>}
        {!gaps.incomplete.length && !gaps.shortages.length && <div>Checklist complete — all items present and in good condition.</div>}
      </div>
      {gaps.shortages.length > 0 && <Field label="Reason for proceeding with these items" required><textarea disabled={disabled} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Spare hose at supplier; client accepted a reduced scope" /></Field>}
      <Field label="Notes"><input disabled={disabled} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Confirm checked={confirmed} onChange={setConfirmed} disabled={disabled}>I confirm, as Team Leader, that the vehicle, equipment, PPE and materials listed are loaded and the information above is correct.</Confirm>
      {run && <button className="btn primary lg" onClick={() => attempt(() => completeHqChecklist(wf.id, { ...draft(), items, confirmed }), 'HQ checklist confirmed — equipment is now In Use')}>Confirm HQ equipment checklist</button>}
      {scan && <QrScanner title={scan.key ? 'Scan this item’s QR code' : 'Scan items being loaded'} onScan={onScan} onClose={() => setScan(null)} hint="Point the camera at the QR label, or type the Asset ID (e.g. WFP-001) and press Apply." />}
      {adding && <AddToolModal items={items} job={job} onAdd={(it) => { setItems([...items, it]); setAdding(false); }} onClose={() => setAdding(false)} />}
    </div>
  );
}

export function HqSummary({ wf }: { wf: JobWorkflow }) {
  const { db } = useAuth();
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  return (
    <div className="stack">
      <dl className="kv"><dt>Vehicle</dt><dd>{wf.hq_veh_condition ?? '—'} · fuel {wf.hq_fuel ?? '—'} · odometer {wf.hq_odo?.toLocaleString() ?? '—'} km{wf.hq_veh_notes && <span className="muted"> — {wf.hq_veh_notes}</span>}</dd>
        <dt>Confirmed by</dt><dd>{userName(db, wf.hq_by)} · {fmtDateTime(wf.hq_at)}</dd>{wf.hq_shortage_reason && <><dt>Shortage reason</dt><dd>{wf.hq_shortage_reason}</dd></>}{wf.hq_notes && <><dt>Notes</dt><dd>{wf.hq_notes}</dd></>}</dl>
      <div className="tbl-wrap"><table className="tbl stack-m"><thead><tr><th>Item</th><th>Asset ID</th><th>Required</th><th>Loaded</th><th>Condition</th><th>Confirmed</th><th>Responsible</th></tr></thead><tbody>
        {wf.items.map((i) => <tr key={i.key}><td className="first"><b>{i.label}</b>{i.extra && <> <Badge tone="blue">added</Badge></>}{i.out_note && <div className="small muted">{i.out_note}</div>}</td><td data-label="Asset ID">{i.code ?? '—'}</td><td data-label="Required">{i.qty}{i.unit ? ` ${i.unit}` : ''}</td><td data-label="Loaded">{i.loaded_qty ?? '—'}</td><td data-label="Condition"><Badge>{(i.kind === 'material' ? i.out_container : i.out_condition) ?? '—'}</Badge></td><td data-label="By">{i.out_by === 'scan' ? 'QR scan' : i.out_by === 'id' ? 'Asset ID' : i.out_ok ? 'Manual' : '—'}</td><td data-label="Responsible">{emp(i.responsible_id)}</td></tr>)}
      </tbody></table></div>
      <Photos items={[...(wf.hq_veh_photo ? [{ src: wf.hq_veh_photo, caption: 'Vehicle' }] : []), ...wf.items.filter((i) => i.out_photo).map((i) => ({ src: i.out_photo!, caption: `${i.label} (damaged)` }))]} />
    </div>
  );
}

/* ================= Step 2: Dispatch ================= */
function DispatchForm({ wf, run }: { wf: JobWorkflow; run: boolean }) {
  const [gps, setGps] = useState<Geo>({ note: '' });
  const [photo, setPhoto] = useState<string>();
  const [notes, setNotes] = useState('');
  const [ok, setOk] = useState(false);
  return (
    <div className="stack">
      <div className="small muted">Departure date & time are captured when you confirm: <b>{fmtDateTime(nowLocal())}</b></div>
      <GpsField label="Capture departure GPS" value={gps} onChange={setGps} disabled={!run} />
      <Field label="Loading photo (optional)"><PhotoField label="Take loading photo" value={photo} onChange={setPhoto} disabled={!run} /></Field>
      <Field label="Notes"><input disabled={!run} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Confirm checked={ok} onChange={setOk} disabled={!run}>I confirm the crew is loaded and leaving headquarters now.</Confirm>
      {run && <button className="btn primary lg" onClick={() => attempt(() => dispatchJob(wf.id, { lat: gps.lat, lng: gps.lng, gps_note: gps.note, photo, notes, confirmed: ok }), 'Crew dispatched')}>Dispatch crew</button>}
    </div>
  );
}

/* ================= Step 3: Site arrival + attendance ================= */
function ArrivalForm({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db } = useAuth();
  const T = nowLocal().slice(0, 10);
  const crew = [...new Set([...(job.leader_id ? [job.leader_id] : []), ...job.crew_ids])];
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const site = db.sites.find((s) => s.id === job.site_id);
  const [present, setPresent] = useState<string[]>(crew);
  const [absent, setAbsent] = useState<Record<string, string>>({});
  const [gps, setGps] = useState<Geo>({ note: '' });
  const [photos, setPhotos] = useState<string[]>([]);
  const [contact, setContact] = useState({ name: site?.contact_person ?? '', mobile: site?.contact_mobile ?? '' });
  const [notes, setNotes] = useState('');
  const [reqs, setReqs] = useState('');
  const [xAssets, setXAssets] = useState<string[]>([]);
  const [xMat, setXMat] = useState<{ item_id: string; qty: number }>({ item_id: '', qty: 0 });
  const free = db.assets.filter((a) => !a.deleted_at && a.status === 'Available' && !job.equipment_ids.includes(a.id) && a.category !== 'Vehicle');
  return (
    <div className="stack">
      <div className="small muted">Arrival time is captured when you confirm: <b>{fmtDateTime(nowLocal())}</b></div>
      <div>
        <div className="row between" style={{ marginBottom: 6 }}><b>Confirm attendance (synced to Attendance &amp; Payroll)</b>{run && <button className="btn sm" onClick={() => setPresent(crew)}>All present</button>}</div>
        <ul className="list" style={{ border: '1px solid var(--line-2)', borderRadius: 6 }}>
          {crew.map((e) => { const a = db.attendance.find((x) => x.employee_id === e && x.date === T && x.clock_in && !x.deleted_at); const on = present.includes(e);
            return <li key={e}><div className="grow"><label className="check"><input type="checkbox" disabled={!run} checked={on} onChange={() => setPresent(on ? present.filter((x) => x !== e) : [...present, e])} /><span><b>{emp(e)}</b>{e === job.leader_id && <span className="muted small"> · Team Leader</span>}</span></label>
              {!on && <input style={{ marginTop: 6 }} disabled={!run} placeholder="Reason absent (required)" value={absent[e] ?? ''} onChange={(ev) => setAbsent({ ...absent, [e]: ev.target.value })} aria-label={`Reason ${emp(e)} is absent`} />}</div>
              {a ? <Badge tone="green">Clocked in {a.clock_in?.slice(11, 16)}</Badge> : on ? <Badge tone="blue">Will be recorded</Badge> : <Badge tone="red">Absent</Badge>}</li>; })}
        </ul>
        <div className="small muted" style={{ marginTop: 6 }}>Crew who already clocked in keep their single attendance record (it is linked to this job). Others get one created — never a duplicate.</div>
      </div>
      <GpsField label="Capture arrival GPS" value={gps} onChange={setGps} disabled={!run} />
      <div className="form-grid"><Field label="Site contact person" required><input disabled={!run} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field><Field label="Contact mobile"><input disabled={!run} value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} /></Field></div>
      <div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Before-work photos (required)</div>
        <Photos items={photos.map((p, k) => ({ src: p, caption: `Before ${k + 1}` }))} onRemove={run ? (k) => setPhotos(photos.filter((_, x) => x !== k)) : undefined} />
        {run && <div style={{ marginTop: 8 }}><PhotoInput label="Add before photo" capture="environment" multiple onAdd={(d) => setPhotos((x) => [...x, d])} /></div>}</div>
      <Field label="Site access & safety notes"><textarea disabled={!run} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Access route, hazards, water source, restrictions…" /></Field>
      <details><summary className="small" style={{ cursor: 'pointer' }}>Request additional equipment / materials from site (optional)</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <Field label="Extra equipment"><select multiple disabled={!run} value={xAssets} onChange={(e) => setXAssets(Array.from(e.target.selectedOptions).map((o) => o.value))} style={{ minHeight: 80 }}>{free.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
          <div className="form-grid"><Field label="Material"><select disabled={!run} value={xMat.item_id} onChange={(e) => setXMat({ ...xMat, item_id: e.target.value })}><option value="">—</option>{db.items.filter((i) => !i.deleted_at).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field><Field label="Quantity"><input type="number" min="0" disabled={!run} value={xMat.qty || ''} onChange={(e) => setXMat({ ...xMat, qty: +e.target.value })} /></Field></div>
          <Field label="Why"><input disabled={!run} value={reqs} onChange={(e) => setReqs(e.target.value)} /></Field>
        </div></details>
      {run && <button className="btn primary lg" onClick={() => attempt(() => arriveAtSite(wf.id, {
        lat: gps.lat, lng: gps.lng, gps_note: gps.note, photos, contact_name: contact.name, contact_mobile: contact.mobile, notes, present, absent: crew.filter((e) => !present.includes(e)).map((e) => ({ id: e, reason: absent[e] ?? '' })),
        extra_equipment: xAssets, extra_materials: xMat.item_id && xMat.qty > 0 ? [xMat] : [], requests: reqs,
      }), 'Arrived at site — attendance confirmed')}>Confirm arrival &amp; attendance</button>}
    </div>
  );
}
function ArrivalSummary({ wf, job }: { wf: JobWorkflow; job: Job }) {
  const { db } = useAuth();
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  void job;
  return (
    <div className="stack">
      <dl className="kv"><dt>Arrived</dt><dd>{fmtDateTime(wf.arr_at)}</dd><dt>GPS</dt><dd>{gpsLink(wf.arr_lat, wf.arr_lng, wf.arr_gps_note)}</dd><dt>Site contact</dt><dd>{wf.arr_contact_name} {wf.arr_contact_mobile}</dd>
        <dt>Attendance</dt><dd>Present: {(wf.arr_crew_present ?? []).map(emp).join(', ') || '—'}{(wf.arr_crew_absent ?? []).length > 0 && <div className="small">Absent: {(wf.arr_crew_absent ?? []).map((a) => `${emp(a.id)} (${a.reason})`).join(', ')}</div>}</dd>
        <dt>Access / safety notes</dt><dd>{wf.arr_notes || '—'}</dd></dl>
      <Photos items={wf.arr_photos.map((p, i) => ({ src: p, caption: `Before ${i + 1}` }))} />
    </div>
  );
}

/* ================= Step 5: Start work ================= */
function StartForm({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db } = useAuth();
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const here = wf.arr_crew_present ?? [];
  const [present, setPresent] = useState<string[]>(here);
  const [safety, setSafety] = useState(false); const [ppe, setPpe] = useState(false); const [ok, setOk] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]); const [notes, setNotes] = useState('');
  void job;
  return (
    <div className="stack">
      <div className="small muted">Start time is captured when you confirm: <b>{fmtDateTime(nowLocal())}</b></div>
      <div><b>Crew present at start</b><div className="row" style={{ marginTop: 6 }}>{here.map((e) => <label key={e} className="check"><input type="checkbox" disabled={!run} checked={present.includes(e)} onChange={() => setPresent(present.includes(e) ? present.filter((x) => x !== e) : [...present, e])} />{emp(e)}</label>)}</div></div>
      <Confirm checked={safety} onChange={setSafety} disabled={!run}>Safety briefing completed with the crew.</Confirm>
      <Confirm checked={ppe} onChange={setPpe} disabled={!run}>All crew are wearing the required PPE.</Confirm>
      <div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Work-start photos (required)</div>
        <Photos items={photos.map((p, k) => ({ src: p, caption: `Start ${k + 1}` }))} onRemove={run ? (k) => setPhotos(photos.filter((_, x) => x !== k)) : undefined} />
        {run && <div style={{ marginTop: 8 }}><PhotoInput label="Add photo" capture="environment" multiple onAdd={(d) => setPhotos((x) => [...x, d])} /></div>}</div>
      <Field label="Notes"><input disabled={!run} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Confirm checked={ok} onChange={setOk} disabled={!run}>I confirm, as Team Leader, that work is starting now.</Confirm>
      {run && <button className="btn primary lg" onClick={() => attempt(() => startWork(wf.id, { present, safety, ppe, photos, notes, confirmed: ok }), 'Work started — In Progress')}>Start work</button>}
    </div>
  );
}

/* ================= Step 9: Leave site ================= */
function LeaveForm({ wf, run }: { wf: JobWorkflow; run: boolean }) {
  const [gps, setGps] = useState<Geo>({ note: '' }); const [photo, setPhoto] = useState<string>(); const [notes, setNotes] = useState(''); const [ok, setOk] = useState(false);
  return (
    <div className="stack">
      <div className="small muted">Departure time from site is captured when you confirm: <b>{fmtDateTime(nowLocal())}</b></div>
      <GpsField label="Capture GPS" value={gps} onChange={setGps} disabled={!run} />
      <Field label="Final photo (optional)"><PhotoField label="Take photo" value={photo} onChange={setPhoto} disabled={!run} /></Field>
      <Field label="Notes"><input disabled={!run} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Confirm checked={ok} onChange={setOk} disabled={!run}>I confirm the crew, equipment and site are clear and we are leaving.</Confirm>
      {run && <button className="btn primary lg" onClick={() => attempt(() => leaveSite(wf.id, { lat: gps.lat, lng: gps.lng, gps_note: gps.note, photo, notes, confirmed: ok }), 'Left site')}>Leave site</button>}
    </div>
  );
}

/* ================= Step 10: Arrived at HQ ================= */
function HqaForm({ wf, run }: { wf: JobWorkflow; run: boolean }) {
  const hasVeh = wf.items.some((i) => i.kind === 'vehicle');
  const [gps, setGps] = useState<Geo>({ note: '' });
  const [f, setF] = useState({ odo: undefined as number | undefined, fuel: undefined as FuelLevel | undefined, cond: 'Good' as VehicleCondition, notes: '', eq: false, ok: false, n: '' });
  return (
    <div className="stack">
      <div className="small muted">Arrival time at HQ is captured when you confirm: <b>{fmtDateTime(nowLocal())}</b></div>
      <GpsField label="Capture GPS at headquarters" value={gps} onChange={setGps} disabled={!run} />
      {hasVeh && (
        <div className="form-grid">
          <Field label="Ending odometer (km)" required hint={wf.hq_odo !== undefined ? `Starting: ${wf.hq_odo.toLocaleString()} km` : undefined}><input type="number" inputMode="numeric" disabled={!run} value={f.odo ?? ''} onChange={(e) => setF({ ...f, odo: e.target.value === '' ? undefined : +e.target.value })} /></Field>
          <Field label="Ending fuel level" required hint={wf.hq_fuel ? `Starting: ${wf.hq_fuel}` : undefined}><Seg value={f.fuel} options={FUEL_LEVELS} disabled={!run} onChange={(v) => setF({ ...f, fuel: v })} /></Field>
          <Field label="Vehicle condition" required><Seg value={f.cond} options={['Good', 'With Issue'] as const} disabled={!run} tone={condTone} onChange={(v) => setF({ ...f, cond: v })} /></Field>
          {f.odo !== undefined && wf.hq_odo !== undefined && <div className="alert info" style={{ alignSelf: 'end' }}>Distance travelled: <b>{round2(f.odo - wf.hq_odo)} km</b></div>}
          {f.cond === 'With Issue' && <Field label="Vehicle issue (required — opens a maintenance ticket)" className="full"><input disabled={!run} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>}
        </div>
      )}
      <Confirm checked={f.eq} onChange={(v) => setF({ ...f, eq: v })} disabled={!run}>Final equipment check done: all equipment is back at headquarters. Serviceable items return to <b>Available</b>.</Confirm>
      <Field label="Notes"><input disabled={!run} value={f.n} onChange={(e) => setF({ ...f, n: e.target.value })} /></Field>
      <Confirm checked={f.ok} onChange={(v) => setF({ ...f, ok: v })} disabled={!run}>I confirm, as Team Leader, that the crew and vehicle are back at headquarters.</Confirm>
      {run && <button className="btn primary lg" onClick={() => attempt(() => arriveAtHq(wf.id, { lat: gps.lat, lng: gps.lng, gps_note: gps.note, odo: f.odo, fuel: f.fuel, veh_condition: hasVeh ? f.cond : undefined, veh_notes: f.notes, equipment_ok: f.eq, notes: f.n, confirmed: f.ok }), 'Arrived at HQ — equipment returned to Available')}>Confirm arrival at HQ</button>}
    </div>
  );
}
function HqaSummary({ wf }: { wf: JobWorkflow }) {
  return <dl className="kv"><dt>Arrived HQ</dt><dd>{fmtDateTime(wf.hqa_at)} · GPS {gpsLink(wf.hqa_lat, wf.hqa_lng, wf.hqa_gps_note)}</dd><dt>Vehicle</dt><dd>fuel {wf.hq_fuel ?? '—'} → {wf.hqa_fuel ?? '—'} · odometer {wf.hq_odo?.toLocaleString() ?? '—'} → {wf.hqa_odo?.toLocaleString() ?? '—'} km {wf.distance_km !== undefined && `(${wf.distance_km} km)`} · {wf.hqa_veh_condition ?? '—'}{wf.hqa_veh_notes && ` — ${wf.hqa_veh_notes}`}</dd><dt>Final equipment check</dt><dd>{wf.hqa_equipment_ok ? 'Confirmed' : '—'}</dd>{wf.hqa_notes && <><dt>Notes</dt><dd>{wf.hqa_notes}</dd></>}</dl>;
}

/* ================= Step 11: Job closed ================= */
function CloseStep({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db, can } = useAuth();
  const gates = closureGates(db, job, wf);
  const [notes, setNotes] = useState('');
  if (wf.closed_at) return <dl className="kv"><dt>Closed</dt><dd>{fmtDateTime(wf.closed_at)} by {userName(db, wf.closed_by)}</dd>{wf.closed_notes && <><dt>Notes</dt><dd>{wf.closed_notes}</dd></>}</dl>;
  const all = gates.every((g) => g.ok);
  return (
    <div className="stack">
      <ul className="list" style={{ border: '1px solid var(--line-2)', borderRadius: 6 }}>{gates.map((g) => <li key={g.key}><span>{g.ok ? '✅' : '⬜'} {g.label}{g.hint && <span className="small muted"> — {g.hint}</span>}</span><Badge tone={g.ok ? 'green' : 'amber'}>{g.ok ? 'Done' : 'Pending'}</Badge></li>)}</ul>
      {!all && <div className="muted">The job closes once every requirement above is complete.</div>}
      {(run || can('incidents.manage')) && <><Field label="Closing notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field><button className="btn navy lg" disabled={!all} onClick={() => attempt(() => closeJob(job.id, notes), 'Job closed')}>Close job</button></>}
    </div>
  );
}

/* ================= correction with reason (Ops / Admin) ================= */
function CorrectModal({ wf, onClose }: { wf: JobWorkflow; onClose: () => void }) {
  const [v, setV] = useState({ hq_odo: wf.hq_odo, hqa_odo: wf.hqa_odo, hq_fuel: wf.hq_fuel, hqa_fuel: wf.hqa_fuel, arr_contact_name: wf.arr_contact_name ?? '', arr_notes: wf.arr_notes ?? '', hq_notes: wf.hq_notes ?? '', rc_notes: wf.rc_notes ?? '', leave_notes: wf.leave_notes ?? '' });
  const [reason, setReason] = useState('');
  const num = (k: 'hq_odo' | 'hqa_odo') => <input type="number" value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value === '' ? undefined : +e.target.value })} />;
  const fuel = (k: 'hq_fuel' | 'hqa_fuel') => <select value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: (e.target.value || undefined) as FuelLevel })}><option value="">—</option>{FUEL_LEVELS.map((x) => <option key={x}>{x}</option>)}</select>;
  return (
    <Modal title="Correct workflow record" size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!reason.trim()} onClick={() => { if (attempt(() => correctWorkflow(wf.id, { ...v, ...(v.hq_odo !== undefined && v.hqa_odo !== undefined ? { distance_km: round2(v.hqa_odo - v.hq_odo) } : {}) }, reason), 'Record corrected and logged')) onClose(); }}>Save correction</button></>}>
      <div className="alert info" style={{ marginBottom: 12 }}>Every correction is logged with your name, the time, the old and new values and the reason. Stock and asset adjustments are posted separately.</div>
      <div className="form-grid">
        <Field label="Starting odometer">{num('hq_odo')}</Field><Field label="Ending odometer">{num('hqa_odo')}</Field>
        <Field label="Starting fuel">{fuel('hq_fuel')}</Field><Field label="Ending fuel">{fuel('hqa_fuel')}</Field>
        <Field label="Site contact"><input value={v.arr_contact_name} onChange={(e) => setV({ ...v, arr_contact_name: e.target.value })} /></Field>
        <Field label="Arrival / site notes"><input value={v.arr_notes} onChange={(e) => setV({ ...v, arr_notes: e.target.value })} /></Field>
        <Field label="HQ checklist notes"><input value={v.hq_notes} onChange={(e) => setV({ ...v, hq_notes: e.target.value })} /></Field>
        <Field label="Return check notes"><input value={v.rc_notes} onChange={(e) => setV({ ...v, rc_notes: e.target.value })} /></Field>
      </div>
      <Field label="Reason for correction" required><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Odometer mistyped; confirmed from the dashboard photo" /></Field>
    </Modal>
  );
}
void workflowFor; void fmtStamp;
