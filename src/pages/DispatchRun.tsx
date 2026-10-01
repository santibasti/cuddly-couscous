import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth, live, store } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, PhotoInput, Photos, attempt, toast } from '@/components/ui';
import { ArrivalModal } from '@/components/ArrivalModal';
import { QrScanner } from '@/components/Qr';
import { getGeo } from '@/lib/geo';
import { dispatchGaps, JOB_FLOW } from '@/lib/business';
import {
  CONTAINER_CONDITIONS, FUEL_LEVELS, ITEM_CONDITIONS, canRunDispatch, closeJob, completeDeparture, completeReturn, correctDispatch, decideDepartureException, kindOfAsset, matchScan,
  openDispatch, requestDepartureException, saveDispatchDraft, startReturnChecklist, startWork, type DepartureDraft, type ReturnSummary,
} from '@/lib/dispatch';
import { dispatchReportPdf } from '@/lib/export';
import { fmtDateTime, fmtStamp, fmtTime, nowLocal, round2 } from '@/lib/util';
import type { ContainerCondition, Dispatch, DispatchItem, FuelLevel, ItemCondition, Job, VehicleCondition } from '@/lib/types';

const KIND_LABEL: Record<DispatchItem['kind'], string> = { vehicle: 'Vehicle', equipment: 'Machines & equipment', tool: 'Tools, hoses, cords & ladders', ppe: 'PPE & safety gear', material: 'Chemicals & materials' };
type Geo = { lat?: number; lng?: number; note: string };

/* ---------------- small shared controls ---------------- */
function Seg<T extends string>({ value, options, onChange, disabled, tone }: { value?: T; options: readonly T[]; onChange: (v: T) => void; disabled?: boolean; tone?: (v: T) => 'good' | 'bad' | 'warn' }) {
  return <div className="seg" role="group">{options.map((o) => <button key={o} type="button" disabled={disabled} className={`${value === o ? 'on' : ''} ${tone?.(o) ?? ''}`} onClick={() => onChange(o)}>{o}</button>)}</div>;
}
const condTone = (v: string) => (v === 'Good' ? 'good' : v === 'Missing' || v === 'Leaking' ? 'bad' : v === 'With Issue' ? 'warn' : 'bad') as 'good' | 'bad' | 'warn';

function GpsField({ value, onChange, label, disabled }: { value: Geo; onChange: (g: Geo) => void; label: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const has = value.lat !== undefined && value.lng !== undefined;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <button type="button" className="btn" disabled={busy || disabled} onClick={async () => { setBusy(true); const g = await getGeo(); setBusy(false); if (g.lat === undefined) toast('GPS unavailable — allow location access, or explain below.', 'err'); onChange({ ...value, lat: g.lat, lng: g.lng }); }}><Icon name="pin" />{busy ? 'Locating…' : has ? 'Re-capture GPS' : label}</button>
        {has && <><Badge tone="green">GPS captured</Badge><a className="small" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${value.lat},${value.lng}`}>{value.lat}, {value.lng}</a></>}
      </div>
      {!has && !disabled && <input value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} placeholder="If GPS is unavailable, say why (e.g. no signal in basement)" aria-label="GPS unavailable reason" />}
    </div>
  );
}

function PhotoField({ label, value, onChange, required, disabled }: { label: string; value?: string; onChange: (v: string) => void; required?: boolean; disabled?: boolean }) {
  return <div className="row"><PhotoInput label={value ? `Retake ${label.toLowerCase()}` : label} capture="environment" onAdd={onChange} disabled={disabled} />{value ? <img src={value} alt={label} style={{ height: 48, borderRadius: 6 }} /> : required && <span className="small muted">required</span>}</div>;
}

function FlowBar({ status }: { status: string }) {
  const idx = status === 'Completed' ? JOB_FLOW.length - 1 : JOB_FLOW.indexOf(status as never);
  return <div className="flow" aria-label="Job status flow">{JOB_FLOW.map((s, i) => <div key={s} className={i < idx ? 'past' : i === idx ? 'cur' : ''}><i />{s}</div>)}</div>;
}

/* ================= page ================= */
export default function DispatchRun() {
  const { jobId } = useParams();
  const { db } = useAuth();
  const job = db.jobs.find((j) => j.id === jobId && !j.deleted_at);
  const dp = db.dispatches.find((d) => d.job_id === jobId && !d.deleted_at);
  if (!job) return <div className="alert warn">Job not found. <Link to="/dispatch">Back</Link></div>;
  const client = db.clients.find((c) => c.id === job.client_id)!; const site = db.sites.find((s) => s.id === job.site_id)!;
  if (!dp) {
    const run = canRunDispatch(job);
    return (
      <>
        <PageHead title={`Dispatch checklist – ${job.number}`} sub={`${client.name} · ${site.name} · ${fmtDateTime(job.start_at)}`}><Link to="/dispatch" className="btn">← Dispatch</Link></PageHead>
        <FlowBar status={job.status} />
        <Card>
          <p style={{ marginTop: 0 }}>No checklist has been started for this job. Starting it loads the crew, vehicle, equipment and materials from the booking and moves the job to <b>Dispatch Checklist Pending</b>.</p>
          {job.status === 'Pending' && <div className="alert warn" style={{ marginBottom: 10 }}>This booking is not confirmed yet. Confirm it from the job card first.</div>}
          {run ? <button className="btn primary lg" disabled={!['Confirmed', 'Dispatch Checklist Pending'].includes(job.status)} onClick={() => attempt(() => openDispatch(job.id), 'Checklist ready')}>Start dispatch checklist</button> : <div className="alert warn">Only the assigned Team Leader or a manager can start this checklist.</div>}
        </Card>
      </>
    );
  }
  return <Runner key={dp.id + dp.stage + job.status} dp={dp} job={job} />;
}

function Runner({ dp, job }: { dp: Dispatch; job: Job }) {
  const { db, can } = useAuth();
  const [arrive, setArrive] = useState(false);
  const [fix, setFix] = useState(false);
  const run = canRunDispatch(job);
  const client = db.clients.find((c) => c.id === job.client_id)!; const site = db.sites.find((s) => s.id === job.site_id)!;
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const afterWork = ['Work Completed', 'Return Checklist Pending', 'Returned to HQ', 'Closed', 'Completed'].includes(job.status);
  const [note, setNote] = useState('');
  const awaiting = dp.dep_exception_status === 'Pending';

  return (
    <>
      <PageHead title={<>Dispatch – {job.number} <Badge>{job.status}</Badge></>} sub={`${client.name} · ${site.name} · ${fmtDateTime(job.start_at)} · Leader ${emp(job.leader_id)}`}>
        <Link to="/dispatch" className="btn">← Dispatch</Link>
        <Link to={`/jobs/${job.id}`} className="btn">Job card</Link>
        {can('incidents.manage') && <button className="btn" onClick={() => setFix(true)}><Icon name="edit" />Correct record</button>}
        {dp.stage !== 'Pending' && <button className="btn" onClick={() => attempt(() => dispatchReportPdf(db, dp))}><Icon name="download" />Report (PDF)</button>}
      </PageHead>
      <FlowBar status={job.status} />
      {!run && <div className="alert info" style={{ marginBottom: 12 }}>You can view this checklist. Only the assigned Team Leader or a manager can complete it.</div>}

      {awaiting && can('dispatch.approve') && (
        <div className="alert warn" style={{ marginBottom: 12 }}>
          <b>Exception awaiting your approval.</b> {emp(db.users.find((u) => u.id === dp.dep_exception_by)?.employee_id ?? '')} asks to depart with missing / damaged items: “{dp.dep_exception_reason}”
          <div className="row" style={{ marginTop: 8 }}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Decision note (required to reject)" style={{ flex: 1, minWidth: 180 }} aria-label="Decision note" />
            <button className="btn primary" onClick={() => attempt(() => decideDepartureException(dp.id, true, note), 'Exception approved')}>Approve exception</button>
            <button className="btn danger" onClick={() => attempt(() => decideDepartureException(dp.id, false, note), 'Exception rejected')}>Reject</button></div>
        </div>
      )}

      <div className="stack gap-lg">
        {dp.stage === 'Pending' ? <DepartureWizard dp={dp} job={job} run={run} /> : <DepartureSummary dp={dp} />}

        <Card title={<span className="row" style={{ gap: 8 }}><span className="avatar" style={{ background: dp.arr_at ? 'var(--green)' : 'var(--navy)' }}>{dp.arr_at ? '✓' : '→'}</span>Arrival at client site</span>} actions={dp.arr_at ? <Badge tone="green">{fmtDateTime(dp.arr_at)}</Badge> : undefined}>
          {dp.stage === 'Pending' && <div className="muted">Available after departure from headquarters.</div>}
          {dp.stage === 'Departed' && (run ? <div className="stack"><div className="alert info">Crew departed {fmtDateTime(dp.dep_at)}. Record the arrival on site (GPS, contact, before photos, safety briefing).</div><button className="btn primary lg" onClick={() => setArrive(true)}>Arrived at site</button></div> : <div className="muted">Waiting for the Team Leader to record arrival.</div>)}
          {dp.arr_at && (
            <div className="stack">
              <dl className="kv"><dt>Arrived</dt><dd>{fmtDateTime(dp.arr_at)}</dd><dt>GPS</dt><dd>{dp.arr_lat !== undefined ? <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${dp.arr_lat},${dp.arr_lng}`}>{dp.arr_lat}, {dp.arr_lng}</a> : `not captured (${dp.arr_gps_note})`}</dd><dt>Site contact</dt><dd>{dp.arr_contact_name} {dp.arr_contact_mobile}</dd><dt>Safety briefing</dt><dd>{dp.arr_safety_briefing ? 'Confirmed' : 'Not confirmed'} {dp.arr_briefing_notes && <span className="muted">— {dp.arr_briefing_notes}</span>}</dd><dt>Site condition / access</dt><dd>{dp.arr_site_notes || '—'}</dd>{dp.arr_requests && <><dt>Additional requests</dt><dd>{dp.arr_requests}</dd></>}</dl>
              <Photos items={dp.arr_photos.map((p, i) => ({ src: p, caption: `Before ${i + 1}` }))} />
              {job.status === 'Arrived at Site' && run && <button className="btn primary lg" onClick={() => attempt(() => startWork(job.id), 'Work started — status: In Progress')}>Start work (→ In Progress)</button>}
            </div>
          )}
        </Card>

        <ReturnSection dp={dp} job={job} run={run} enabled={afterWork} />
        <History dp={dp} job={job} />
      </div>
      {arrive && <ArrivalModal job={job} onClose={() => setArrive(false)} />}
      {fix && <CorrectModal dp={dp} onClose={() => setFix(false)} />}
      <span className="hide">{site.id}</span>
    </>
  );
}

/* ================= departure wizard (5 steps) ================= */
const STEP_TITLES = ['Job & crew', 'Vehicle check', 'Tools, machines & PPE', 'Chemicals & materials', 'Departure confirmation'];

function DepartureWizard({ dp, job, run }: { dp: Dispatch; job: Job; run: boolean }) {
  const { db } = useAuth();
  const T = nowLocal().slice(0, 10);
  const client = db.clients.find((c) => c.id === job.client_id)!; const site = db.sites.find((s) => s.id === job.site_id)!;
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const crew = [...new Set([...(job.leader_id ? [job.leader_id] : []), ...job.crew_ids])];
  const vehAsset = db.assets.find((a) => a.id === job.vehicle_id);
  const [step, setStep] = useState(1);
  const [items, setItems] = useState<DispatchItem[]>(dp.items);
  const [present, setPresent] = useState<string[]>(dp.crew_present ?? []);
  const [crewNotes, setCrewNotes] = useState(dp.crew_notes ?? '');
  const [veh, setVeh] = useState({ cond: (dp.dep_veh_condition ?? 'Good') as VehicleCondition, photo: dp.dep_veh_photo, notes: dp.dep_veh_notes ?? '', fuel: dp.dep_fuel as FuelLevel | undefined, odo: dp.dep_odo ?? vehAsset?.meter_reading });
  const [photo, setPhoto] = useState(dp.dep_photo);
  const [gps, setGps] = useState<Geo>({ lat: dp.dep_lat, lng: dp.dep_lng, note: dp.dep_gps_note ?? '' });
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState(dp.dep_exception_reason ?? '');
  const [scan, setScan] = useState<{ key?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const names = (id: string) => db.employees.find((e) => e.id === id)?.full_name ?? id;
  const draft = (): DepartureDraft => ({ items, crew_present: present, crew_notes: crewNotes, dep_veh_condition: veh.cond, dep_veh_photo: veh.photo, dep_veh_notes: veh.notes, dep_fuel: veh.fuel, dep_odo: veh.odo, dep_photo: photo, dep_lat: gps.lat, dep_lng: gps.lng, dep_gps_note: gps.note });
  const gaps = useMemo(() => dispatchGaps(job, draft() as never, names), [items, present, veh, photo, gps]); // eslint-disable-line react-hooks/exhaustive-deps
  const approved = dp.dep_exception_status === 'Approved' && dp.dep_exception_sig === gaps.signature;
  const setItem = (key: string, patch: Partial<DispatchItem>) => setItems((a) => a.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const confirmItem = (i: DispatchItem, by: 'scan' | 'id' | 'manual') => setItem(i.key, { out_ok: true, out_by: by, loaded_qty: i.loaded_qty ?? i.qty, ...(i.kind === 'material' ? { out_container: i.out_container ?? 'Good' } : { out_condition: i.out_condition ?? 'Good' }) });
  const goto = async (n: number) => { if (run) { try { saveDispatchDraft(dp.id, draft()); } catch { /* keep going */ } } setStep(n); window.scrollTo({ top: 0 }); };
  const save = () => attempt(() => saveDispatchDraft(dp.id, draft()), 'Progress saved');

  const onScan = (code: string) => {
    const it = matchScan(items, code);
    if (!it) { const a = db.assets.find((x) => x.code.toUpperCase() === code); toast(a ? `${code} (${a.name}) is not on this job's list — use “Add tool”.` : `${code} is not a known asset.`, 'err'); return; }
    if (scan?.key && it.key !== scan.key) { toast(`That is ${it.label}, not the item you selected.`, 'err'); return; }
    confirmItem(it, 'scan'); toast(`✓ ${it.label} confirmed`, 'ok');
  };

  const nonMat = items.filter((i) => i.kind !== 'material');
  const mats = items.filter((i) => i.kind === 'material');
  const stepState = [
    crew.every((e) => present.includes(e)) ? 'ok' : 'warn',
    veh.fuel && veh.odo && veh.photo && (veh.cond === 'Good' || veh.notes.trim()) ? 'ok' : 'warn',
    nonMat.every((i) => i.out_ok) ? 'ok' : 'warn',
    mats.every((i) => i.out_ok) ? 'ok' : 'warn',
    gaps.incomplete.length === 0 && confirmed ? 'ok' : 'warn',
  ];
  const disabled = !run;
  const submit = () => { setBusy(true); try { attempt(() => completeDeparture(dp.id, { ...draft(), items, confirmed } as never), 'Departed from HQ — crew dispatched'); } finally { setBusy(false); } };

  return (
    <div>
      <div className="steps" role="tablist">{STEP_TITLES.map((t, i) => <button key={t} role="tab" aria-selected={step === i + 1} className={`${step === i + 1 ? 'on' : ''} ${stepState[i] === 'ok' && step !== i + 1 ? 'ok' : stepState[i] === 'warn' && i + 1 < step ? 'warn' : ''}`} onClick={() => goto(i + 1)}><i />{i + 1}. {t}</button>)}</div>
      <Card title={`Step ${step} of 5 — ${STEP_TITLES[step - 1]}`} actions={run ? <button className="btn sm" onClick={save}>Save progress</button> : undefined}>
        {/* ---------- 1. Job and crew ---------- */}
        {step === 1 && (
          <div className="stack">
            <dl className="kv"><dt>Job number</dt><dd><b>{job.number}</b></dd><dt>Client</dt><dd>{client.name}</dd><dt>Site location</dt><dd>{site.name} — {site.address}</dd>
              <dt>Scheduled service</dt><dd>{job.service_codes.map((c) => db.services.find((s) => s.code === c)?.name).join(', ')}<div className="small muted">{job.scope}</div></dd>
              <dt>Scheduled</dt><dd>{fmtDateTime(job.start_at)} → {fmtTime(job.end_at)}</dd><dt>Team Leader</dt><dd>{emp(job.leader_id)}</dd><dt>Vehicle</dt><dd>{vehAsset?.name ?? '—'}</dd></dl>
            <div>
              <div className="row between" style={{ marginBottom: 6 }}><b>Confirm crew present</b>{run && <button className="btn sm" onClick={() => setPresent(crew)}>All present</button>}</div>
              <ul className="list" style={{ border: '1px solid var(--line-2)', borderRadius: 6 }}>
                {crew.map((e) => { const a = db.attendance.find((x) => x.employee_id === e && x.date === T && x.clock_in && !x.deleted_at); const on = present.includes(e);
                  return <li key={e}><label className="check grow"><input type="checkbox" disabled={disabled} checked={on} onChange={() => setPresent(on ? present.filter((x) => x !== e) : [...present, e])} /><span><b>{emp(e)}</b>{e === job.leader_id && <span className="muted small"> · Team Leader</span>}</span></label>
                    {a ? <Badge tone="green">Clocked in {fmtTime(a.clock_in)}</Badge> : on ? <Badge tone="blue">Attendance will be synced</Badge> : <Badge tone="red">Not confirmed</Badge>}</li>; })}
              </ul>
              <div className="small muted" style={{ marginTop: 6 }}>Confirming a crew member who has not clocked in records their attendance (field work, linked to this job) when you confirm departure.</div>
            </div>
            <Field label="Crew notes"><input disabled={disabled} value={crewNotes} onChange={(e) => setCrewNotes(e.target.value)} placeholder="Replacements, late arrivals…" /></Field>
          </div>
        )}

        {/* ---------- 2. Vehicle ---------- */}
        {step === 2 && (
          <div className="stack">
            {!vehAsset ? <div className="alert warn">No vehicle is assigned to this booking.</div> : (
              <>
                <dl className="kv"><dt>Vehicle</dt><dd><b>{vehAsset.name}</b> <span className="muted small">{vehAsset.code}</span></dd></dl>
                <div className="form-grid">
                  <Field label="Starting odometer (km)" required><input type="number" inputMode="numeric" disabled={disabled} value={veh.odo ?? ''} onChange={(e) => setVeh({ ...veh, odo: e.target.value === '' ? undefined : +e.target.value })} /></Field>
                  <Field label="Fuel level" required><Seg value={veh.fuel} options={FUEL_LEVELS} disabled={disabled} onChange={(v) => setVeh({ ...veh, fuel: v })} /></Field>
                  <Field label="Vehicle condition" required><Seg value={veh.cond} options={['Good', 'With Issue'] as const} disabled={disabled} tone={condTone} onChange={(v) => setVeh({ ...veh, cond: v })} /></Field>
                  <Field label="Vehicle photo" required><PhotoField label="Take vehicle photo" value={veh.photo} onChange={(d) => setVeh({ ...veh, photo: d })} required disabled={disabled} /></Field>
                  <Field label={`Notes${veh.cond === 'With Issue' ? ' (describe the issue — required)' : ''}`} className="full"><input disabled={disabled} value={veh.notes} onChange={(e) => setVeh({ ...veh, notes: e.target.value })} placeholder="Dents, warning lights, tyre pressure…" /></Field>
                </div>
              </>
            )}
          </div>
        )}

        {/* ---------- 3. Tools, machines, PPE ---------- */}
        {step === 3 && (
          <div className="stack">
            {run && <div className="row"><button className="btn navy" onClick={() => setScan({})}><Icon name="camera" />Scan any item</button><button className="btn" onClick={() => setAdding(true)}><Icon name="plus" />Add tool</button></div>}
            {(['vehicle', 'equipment', 'tool', 'ppe'] as const).map((k) => { const rows = items.filter((i) => i.kind === k); if (!rows.length) return null; return (
              <div key={k}><div className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 6px' }}>{KIND_LABEL[k]}</div>
                <div className="stack" style={{ gap: 8 }}>{rows.map((i) => <ItemCard key={i.key} it={i} setItem={setItem} confirmItem={confirmItem} onScan={() => setScan({ key: i.key })} crew={crew} disabled={disabled} emp={emp} onRemove={i.extra ? () => setItems(items.filter((x) => x.key !== i.key)) : undefined} />)}</div></div>
            ); })}
          </div>
        )}

        {/* ---------- 4. Chemicals & materials ---------- */}
        {step === 4 && (
          <div className="stack">
            {!mats.length && <div className="muted">No chemicals or materials were allocated to this job.</div>}
            {mats.map((i) => {
              const inv = db.items.find((x) => x.id === i.item_id)!; const oh = db.stock.filter((t) => t.approval === 'Approved' && t.item_id === inv.id && t.location_id === inv.location_id).reduce((s, t) => s + t.qty, 0);
              return (
                <div key={i.key} className={`itemcard ${i.out_ok ? 'ok' : ''}`}>
                  <div className="row between"><div><b>{i.label}</b> <span className="muted small">{i.code}</span></div>{i.out_ok ? <Badge tone="green">✓ Confirmed</Badge> : <Badge tone="amber">Not confirmed</Badge>}</div>
                  <div className="itemgrid">
                    <Field label="Required"><input disabled value={`${i.qty} ${i.unit ?? ''}`} /></Field>
                    <Field label={`Quantity issued (${i.unit ?? ''})`}><input type="number" min="0" step="0.5" disabled={disabled} value={i.loaded_qty ?? ''} onChange={(e) => setItem(i.key, { loaded_qty: e.target.value === '' ? undefined : +e.target.value })} /></Field>
                    <Field label="Container condition"><Seg value={i.out_container ?? 'Good'} options={CONTAINER_CONDITIONS} disabled={disabled} tone={condTone} onChange={(v: ContainerCondition) => setItem(i.key, { out_container: v })} /></Field>
                  </div>
                  <div className="small muted">On hand in {db.locations.find((l) => l.id === inv.location_id)?.name}: <b>{round2(oh)} {inv.uom}</b> — issuing deducts from stock when departure is confirmed.</div>
                  <Field label="Notes"><input disabled={disabled} value={i.out_note ?? ''} onChange={(e) => setItem(i.key, { out_note: e.target.value })} /></Field>
                  {run && <label className="check"><input type="checkbox" checked={!!i.out_ok} onChange={(e) => (e.target.checked ? confirmItem(i, 'manual') : setItem(i.key, { out_ok: false }))} />Confirm issued quantity and container condition</label>}
                </div>
              );
            })}
          </div>
        )}

        {/* ---------- 5. Departure confirmation ---------- */}
        {step === 5 && (
          <div className="stack">
            <div className={`alert ${gaps.incomplete.length ? 'err' : gaps.discrepancies.length ? 'warn' : 'info'}`}>
              {gaps.incomplete.length > 0 && <div><b>Still to complete:</b> {gaps.incomplete.join(' · ')}</div>}
              {gaps.discrepancies.length > 0 && <div><b>Missing / damaged / short:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{gaps.discrepancies.map((d) => <li key={d.key}>{d.text}</li>)}</ul></div>}
              {!gaps.incomplete.length && !gaps.discrepancies.length && <div>Checklist complete — all items present and in good condition.</div>}
            </div>
            {gaps.discrepancies.length > 0 && (
              <div className="card" style={{ padding: 12 }}>
                <b>Exception approval</b>
                <p className="small muted" style={{ margin: '4px 0 8px' }}>The job cannot depart with required items missing, damaged or short unless the Team Leader gives a reason and an Operations Manager approves.</p>
                {approved ? <div className="alert info">✓ Exception approved{dp.dep_exception_note ? `: ${dp.dep_exception_note}` : ''}. You can confirm departure.</div> : (
                  <div className="stack" style={{ gap: 8 }}>
                    {dp.dep_exception_status === 'Pending' && dp.dep_exception_sig === gaps.signature && <div className="alert warn">Waiting for the Operations Manager to approve (“{dp.dep_exception_reason}”).</div>}
                    {dp.dep_exception_status === 'Rejected' && dp.dep_exception_sig === gaps.signature && <div className="alert err">Exception rejected{dp.dep_exception_note ? `: ${dp.dep_exception_note}` : ''}. Fix the items or submit a new reason.</div>}
                    {dp.dep_exception_status === 'Approved' && dp.dep_exception_sig !== gaps.signature && <div className="alert warn">The missing / damaged items changed since approval — request a new exception.</div>}
                    <Field label="Reason for departing with these items" required><textarea disabled={disabled} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Spare hose at supplier; client accepted a reduced scope" /></Field>
                    {run && <button className="btn navy" disabled={gaps.incomplete.length > 0 || !reason.trim()} onClick={() => attempt(() => requestDepartureException(dp.id, reason, draft()), 'Exception request sent to Operations')}>Request exception approval</button>}
                  </div>
                )}
              </div>
            )}
            <div className="stack" style={{ gap: 10 }}>
              <div className="small muted">Departure date & time are captured automatically when you confirm: <b>{fmtDateTime(nowLocal())}</b></div>
              <GpsField label="Capture departure GPS" value={gps} onChange={setGps} disabled={disabled} />
              <Field label="Group / equipment loading photo" required><PhotoField label="Take loading photo" value={photo} onChange={setPhoto} required disabled={disabled} /></Field>
              <label className="check"><input type="checkbox" disabled={disabled} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>I confirm, as Team Leader, that the crew, vehicle, equipment and materials listed are loaded and the information above is correct.</span></label>
            </div>
          </div>
        )}
      </Card>
      <div className="stepfoot">
        <button className="btn" disabled={step === 1} onClick={() => goto(step - 1)}>← Back</button>
        <span className="grow" />
        {step < 5 ? <button className="btn navy" onClick={() => goto(step + 1)}>Next →</button> : run && <button className="btn primary lg" disabled={busy} onClick={submit}>Confirm departure</button>}
      </div>
      {scan && <QrScanner title={scan.key ? 'Scan this item’s QR code' : 'Scan items being loaded'} onScan={onScan} onClose={() => setScan(null)} hint="Point the camera at the QR label, or type the Asset ID (e.g. WFP-001) and press Apply." />}
      {adding && <AddToolModal items={items} job={job} onAdd={(it) => { setItems([...items, it]); setAdding(false); }} onClose={() => setAdding(false)} />}
    </div>
  );
}

function ItemCard({ it, setItem, confirmItem, onScan, crew, disabled, emp, onRemove }: { it: DispatchItem; setItem: (k: string, p: Partial<DispatchItem>) => void; confirmItem: (i: DispatchItem, by: 'scan' | 'id' | 'manual') => void; onScan: () => void; crew: string[]; disabled: boolean; emp: (id?: string) => string; onRemove?: () => void }) {
  const [typed, setTyped] = useState('');
  const cond = it.out_condition ?? 'Good';
  const verify = () => { if (typed.trim().toUpperCase() === it.code?.toUpperCase()) { confirmItem(it, 'id'); toast(`✓ ${it.label} confirmed by Asset ID`, 'ok'); setTyped(''); } else toast(`“${typed}” does not match ${it.code}.`, 'err'); };
  return (
    <div className={`itemcard ${it.out_ok ? (cond === 'Good' && (it.loaded_qty ?? 0) >= it.qty ? 'ok' : 'bad') : ''}`}>
      <div className="row between"><div><b>{it.label}</b> {it.extra && <Badge tone="blue">added</Badge>} <span className="muted small">{it.code ?? 'no Asset ID'}</span></div>{it.out_ok ? <Badge tone="green">{it.out_by === 'scan' ? '✓ Scanned' : it.out_by === 'id' ? '✓ ID entered' : '✓ Confirmed'}</Badge> : <Badge tone="amber">Not confirmed</Badge>}</div>
      <div className="itemgrid">
        <Field label="Required qty"><input disabled value={it.qty} /></Field>
        <Field label="Actual qty loaded"><input type="number" min="0" disabled={disabled || it.kind === 'vehicle'} value={it.loaded_qty ?? ''} onChange={(e) => setItem(it.key, { loaded_qty: e.target.value === '' ? undefined : +e.target.value })} /></Field>
        <Field label="Responsible"><select disabled={disabled} value={it.responsible_id ?? ''} onChange={(e) => setItem(it.key, { responsible_id: e.target.value || undefined })}>{crew.map((e) => <option key={e} value={e}>{emp(e)}</option>)}</select></Field>
      </div>
      {it.kind !== 'vehicle' && <Field label="Condition before departure"><Seg value={cond} options={ITEM_CONDITIONS} disabled={disabled} tone={condTone} onChange={(v: ItemCondition) => setItem(it.key, { out_condition: v, ...(v === 'Missing' ? { loaded_qty: 0 } : {}) })} /></Field>}
      {cond === 'Damaged' && <PhotoField label="Damage photo" value={it.out_photo} onChange={(d) => setItem(it.key, { out_photo: d })} required disabled={disabled} />}
      <Field label="Notes"><input disabled={disabled} value={it.out_note ?? ''} onChange={(e) => setItem(it.key, { out_note: e.target.value })} /></Field>
      {!disabled && (
        <div className="row">
          {it.code && <button className="btn sm navy" onClick={onScan}><Icon name="qr" size={14} />Scan QR</button>}
          {it.code && <span className="row" style={{ gap: 4 }}><input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verify()} placeholder="Type Asset ID" aria-label={`Asset ID for ${it.label}`} style={{ width: 130, minHeight: 30, padding: '2px 8px' }} /><button className="btn sm" onClick={verify}>Verify</button></span>}
          <label className="check"><input type="checkbox" checked={!!it.out_ok} onChange={(e) => (e.target.checked ? confirmItem(it, 'manual') : setItem(it.key, { out_ok: false }))} />Confirm</label>
          {onRemove && <button className="btn sm danger" onClick={onRemove}>Remove</button>}
        </div>
      )}
    </div>
  );
}

function AddToolModal({ items, job, onAdd, onClose }: { items: DispatchItem[]; job: Job; onAdd: (i: DispatchItem) => void; onClose: () => void }) {
  const { db } = useAuth();
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [qty, setQty] = useState(1);
  const avail = live(db.assets).filter((a) => !['Retired', 'Damaged', 'Missing', 'Under Maintenance'].includes(a.status) && !items.some((i) => i.asset_id === a.id));
  const byCode = db.assets.find((a) => a.code.toUpperCase() === code.trim().toUpperCase());
  const add = () => {
    if (code.trim()) {
      if (!byCode) return toast(`No asset with ID ${code}.`, 'err');
      if (!avail.includes(byCode)) return toast(`${byCode.name} is ${items.some((i) => i.asset_id === byCode.id) ? 'already on the list' : byCode.status.toLowerCase()}.`, 'err');
      return onAdd({ key: `a:${byCode.id}`, kind: kindOfAsset(byCode), asset_id: byCode.id, label: byCode.name, code: byCode.code, qty: 1, extra: true, responsible_id: job.leader_id });
    }
    if (!name.trim()) return toast('Choose an asset or type a tool name.', 'err');
    onAdd({ key: `x:${crypto.randomUUID()}`, kind: 'tool', label: name.trim(), qty, extra: true, responsible_id: job.leader_id });
  };
  return (
    <Modal title="Add tool or equipment" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={add}>Add to checklist</button></>}>
      <div className="stack">
        <Field label="Asset ID / QR code" hint="Type or pick from the register; the tool is also assigned to the job."><input list="avail-assets" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. HSE-001" /></Field>
        <datalist id="avail-assets">{avail.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</datalist>
        {byCode && <div className="alert info">{byCode.name} · {byCode.status}</div>}
        <div className="muted small" style={{ textAlign: 'center' }}>— or a small tool with no Asset ID —</div>
        <div className="form-grid"><Field label="Tool name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Quantity"><input type="number" min="1" value={qty} onChange={(e) => setQty(+e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

function DepartureSummary({ dp }: { dp: Dispatch }) {
  const { db } = useAuth();
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  return (
    <Card title={<span className="row" style={{ gap: 8 }}><span className="avatar" style={{ background: 'var(--green)' }}>✓</span>Departure from headquarters</span>} actions={<Badge tone="green">{fmtDateTime(dp.dep_at)}</Badge>}>
      <div className="stack">
        {dp.dep_exception_status && <div className={`alert ${dp.dep_exception_status === 'Approved' ? 'warn' : 'info'}`}>Departure exception <b>{dp.dep_exception_status}</b>: “{dp.dep_exception_reason}”{dp.dep_exception_note && ` — ${dp.dep_exception_note}`}</div>}
        <dl className="kv"><dt>Crew present</dt><dd>{(dp.crew_present ?? []).map(emp).join(', ') || '—'}</dd><dt>Vehicle</dt><dd>{dp.dep_veh_condition ?? '—'} · fuel {dp.dep_fuel ?? '—'} · odometer {dp.dep_odo?.toLocaleString() ?? '—'} km{dp.dep_veh_notes && <span className="muted"> — {dp.dep_veh_notes}</span>}</dd>
          <dt>GPS</dt><dd>{dp.dep_lat !== undefined ? <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${dp.dep_lat},${dp.dep_lng}`}>{dp.dep_lat}, {dp.dep_lng}</a> : `not captured (${dp.dep_gps_note})`}</dd><dt>Confirmed by</dt><dd>{db.users.find((u) => u.id === dp.dep_confirmed_by)?.name ?? '—'} · {fmtStamp(dp.dep_confirmed_at)}</dd></dl>
        <div className="tbl-wrap"><table className="tbl stack-m"><thead><tr><th>Item</th><th>Asset ID</th><th>Required</th><th>Loaded</th><th>Condition</th><th>Confirmed</th><th>Responsible</th></tr></thead><tbody>
          {dp.items.map((i) => <tr key={i.key}><td className="first"><b>{i.label}</b>{i.extra && <> <Badge tone="blue">added</Badge></>}{i.out_note && <div className="small muted">{i.out_note}</div>}</td><td data-label="Asset ID">{i.code ?? '—'}</td><td data-label="Required">{i.qty}{i.unit ? ` ${i.unit}` : ''}</td><td data-label="Loaded">{i.loaded_qty ?? '—'}</td><td data-label="Condition"><Badge>{(i.kind === 'material' ? i.out_container : i.out_condition) ?? '—'}</Badge></td><td data-label="By">{i.out_by === 'scan' ? 'QR scan' : i.out_by === 'id' ? 'Asset ID' : i.out_ok ? 'Manual' : '—'}</td><td data-label="Responsible">{emp(i.responsible_id)}</td></tr>)}
        </tbody></table></div>
        <Photos items={[...(dp.dep_veh_photo ? [{ src: dp.dep_veh_photo, caption: 'Vehicle' }] : []), ...(dp.dep_photo ? [{ src: dp.dep_photo, caption: 'Loading photo' }] : []), ...dp.items.filter((i) => i.out_photo).map((i) => ({ src: i.out_photo!, caption: `${i.label} (damaged)` }))]} />
      </div>
    </Card>
  );
}

/* ================= return checklist ================= */
function ReturnSection({ dp, job, run, enabled }: { dp: Dispatch; job: Job; run: boolean; enabled: boolean }) {
  const { db, can } = useAuth();
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const editable = run && dp.stage !== 'Returned' && job.status === 'Return Checklist Pending';
  const issuedItems = (list: DispatchItem[]) => list.filter((i) => (i.loaded_qty ?? 0) > 0);
  const [items, setItems] = useState<DispatchItem[]>(() => dp.items.map((i) => ((i.loaded_qty ?? 0) > 0 && dp.stage !== 'Returned' ? { ...i, returned_qty: i.returned_qty ?? (i.kind === 'material' ? 0 : i.loaded_qty), ret_condition: i.ret_condition ?? 'Good' } : i)));
  const [f, setF] = useState({ fuel: dp.ret_fuel as FuelLevel | undefined, odo: dp.ret_odo, cond: (dp.ret_veh_condition ?? 'Good') as VehicleCondition, vnotes: dp.ret_veh_notes ?? '', notes: dp.ret_notes ?? '', photos: dp.ret_photos, confirmed: false });
  const [gps, setGps] = useState<Geo>({ lat: dp.ret_lat, lng: dp.ret_lng, note: dp.ret_gps_note ?? '' });
  const [scan, setScan] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const crew = [...new Set([...(job.leader_id ? [job.leader_id] : []), ...job.crew_ids])];
  const setItem = (key: string, patch: Partial<DispatchItem>) => setItems((a) => a.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const veh = items.find((i) => i.kind === 'vehicle');
  const openInc = live(db.incidents).filter((i) => i.job_id === job.id && ['Open', 'Investigating'].includes(i.status));
  const incs = live(db.incidents).filter((i) => i.dispatch_id === dp.id);
  const shown = dp.stage === 'Returned' ? dp.items : items;

  if (!enabled && dp.stage !== 'Returned') return <Card title={<span className="row" style={{ gap: 8 }}><span className="avatar" style={{ background: '#9db0c5' }}>3</span>Return checklist</span>}><div className="muted">Available once the work is completed (job card → Submit completion). The return checklist must be completed before the job can be closed.</div></Card>;

  const onScan = (code: string) => {
    const it = items.find((i) => i.code?.toUpperCase() === code.trim().toUpperCase());
    if (!it) { toast(`${code} is not on this job's list.`, 'err'); return; }
    setItem(it.key, { returned_qty: it.loaded_qty, ret_condition: it.ret_condition ?? 'Good', ret_by: 'scan' }); toast(`✓ ${it.label} checked in`, 'ok');
  };
  const submit = async () => {
    setBusy(true);
    try { const r = attempt(() => completeReturn(dp.id, { items, ret_photos: f.photos, ret_fuel: f.fuel, ret_odo: f.odo, ret_veh_condition: veh ? f.cond : undefined, ret_veh_notes: f.vnotes, ret_notes: f.notes, ret_lat: gps.lat, ret_lng: gps.lng, ret_gps_note: gps.note, confirmed: f.confirmed }), 'Returned to HQ') as ReturnSummary | undefined; if (r && typeof r === 'object') setResult(r); } finally { setBusy(false); }
  };

  return (
    <Card title={<span className="row" style={{ gap: 8 }}><span className="avatar" style={{ background: dp.stage === 'Returned' ? 'var(--green)' : 'var(--navy)' }}>{dp.stage === 'Returned' ? '✓' : 3}</span>Return to headquarters</span>} actions={dp.ret_at ? <Badge tone="green">{fmtDateTime(dp.ret_at)}</Badge> : undefined}>
      <div className="stack">
        {job.status === 'Work Completed' && (run ? <div className="stack"><div className="alert info">Work is complete. Start the return checklist when the crew is back at headquarters.</div><button className="btn primary lg" onClick={() => attempt(() => startReturnChecklist(job.id), 'Return checklist started')}>Start return checklist</button></div> : <div className="muted">Waiting for the Team Leader to start the return checklist.</div>)}
        {(job.status !== 'Work Completed' || dp.stage === 'Returned') && (
          <>
            {editable && <div className="row"><button className="btn navy" onClick={() => setScan('in')}><Icon name="camera" />Scan to check in</button><button className="btn" onClick={() => setItems(items.map((i) => ((i.loaded_qty ?? 0) > 0 && i.kind !== 'material' ? { ...i, returned_qty: i.loaded_qty, ret_condition: i.ret_condition === 'Damaged' ? 'Damaged' : 'Good', ret_by: i.ret_by ?? 'manual' } : i)))}>All returned in good condition</button></div>}
            <div className="small muted">Issued at dispatch vs returned. Material usage = issued − returned (calculated).</div>
            <div className="stack" style={{ gap: 8 }}>
              {issuedItems(shown).map((i) => {
                const issued = i.loaded_qty ?? 0; const back = i.returned_qty ?? 0; const diff = round2(issued - back); const mat = i.kind === 'material';
                const bad = !mat && (diff > 0 || i.ret_condition === 'Damaged') || (mat && (i.ret_condition === 'Damaged' || i.ret_condition === 'Missing'));
                return (
                  <div key={i.key} className={`itemcard ${bad ? 'bad' : i.returned_qty !== undefined ? 'ok' : ''}`}>
                    <div className="row between"><div><b>{i.label}</b> <span className="muted small">{i.code ?? ''} · {KIND_LABEL[i.kind].split(' ')[0]}</span></div>
                      {mat ? <Badge tone="blue">Used {round2(issued - back)} {i.unit}</Badge> : diff > 0 ? <Badge tone="red">Missing {diff}</Badge> : <Badge tone="green">Accounted for</Badge>}</div>
                    <div className="itemgrid">
                      <Field label="Qty issued"><input disabled value={`${issued}${i.unit ? ' ' + i.unit : ''}`} /></Field>
                      <Field label={`Qty returned${mat ? ' (unused)' : ''}`}><input type="number" min="0" step={mat ? 0.5 : 1} disabled={!editable} value={i.returned_qty ?? ''} onChange={(e) => setItem(i.key, { returned_qty: e.target.value === '' ? undefined : +e.target.value })} /></Field>
                      <Field label="Person responsible"><select disabled={!editable} value={i.ret_responsible_id ?? i.responsible_id ?? ''} onChange={(e) => setItem(i.key, { ret_responsible_id: e.target.value || undefined })}>{crew.map((e) => <option key={e} value={e}>{emp(e)}</option>)}</select></Field>
                    </div>
                    <Field label="Condition on return"><Seg value={i.ret_condition} options={ITEM_CONDITIONS} disabled={!editable} tone={condTone} onChange={(v: ItemCondition) => setItem(i.key, { ret_condition: v, ...(v === 'Damaged' && i.repair_required === undefined ? { repair_required: true } : {}) })} /></Field>
                    {i.ret_condition === 'Damaged' && !mat && i.asset_id && <label className="check"><input type="checkbox" disabled={!editable} checked={i.repair_required !== false} onChange={(e) => setItem(i.key, { repair_required: e.target.checked })} />Repair required (opens a maintenance ticket and marks the asset Damaged)</label>}
                    {(i.kind === 'equipment' || i.ret_photo || i.ret_condition === 'Damaged') && <PhotoField label={i.kind === 'equipment' ? 'Return photo' : 'Photo'} value={i.ret_photo} onChange={(d) => setItem(i.key, { ret_photo: d })} required={i.kind === 'equipment'} disabled={!editable} />}
                    <Field label={`Notes${i.ret_condition === 'Damaged' || i.ret_condition === 'Missing' || diff > 0 ? ' (damage / missing details — required)' : ''}`}><input disabled={!editable} value={i.ret_note ?? ''} onChange={(e) => setItem(i.key, { ret_note: e.target.value })} /></Field>
                    {editable && i.code && <div><button className="btn sm navy" onClick={() => setScan(i.key)}><Icon name="qr" size={14} />Scan QR</button></div>}
                  </div>
                );
              })}
            </div>
            {veh && (
              <div className="form-grid">
                <Field label="Ending odometer (km)" required hint={dp.dep_odo !== undefined ? `Starting: ${dp.dep_odo.toLocaleString()} km` : undefined}><input type="number" inputMode="numeric" disabled={!editable} value={f.odo ?? ''} onChange={(e) => setF({ ...f, odo: e.target.value === '' ? undefined : +e.target.value })} /></Field>
                <Field label="Ending fuel level" required hint={dp.dep_fuel ? `Starting: ${dp.dep_fuel}` : undefined}><Seg value={f.fuel} options={FUEL_LEVELS} disabled={!editable} onChange={(v) => setF({ ...f, fuel: v })} /></Field>
                <Field label="Vehicle condition on return" required><Seg value={f.cond} options={['Good', 'With Issue'] as const} disabled={!editable} tone={condTone} onChange={(v) => setF({ ...f, cond: v })} /></Field>
                {f.odo !== undefined && dp.dep_odo !== undefined && <div className="alert info" style={{ alignSelf: 'end' }}>Distance travelled: <b>{round2(f.odo - dp.dep_odo)} km</b></div>}
                {f.cond === 'With Issue' && <Field label="Vehicle issue (required)" className="full"><input disabled={!editable} value={f.vnotes} onChange={(e) => setF({ ...f, vnotes: e.target.value })} /></Field>}
              </div>
            )}
            <Field label="Return notes"><input disabled={!editable} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Return / loading photo at headquarters (required)</div>
              <Photos items={f.photos.map((p, k) => ({ src: p, caption: `Return ${k + 1}` }))} onRemove={editable ? (k) => setF({ ...f, photos: f.photos.filter((_, x) => x !== k) }) : undefined} />
              {editable && <div style={{ marginTop: 8 }}><PhotoInput label="Add return photo" capture="environment" multiple onAdd={(d) => setF((x) => ({ ...x, photos: [...x.photos, d] }))} /></div>}</div>
            {editable ? (
              <>
                <div className="small muted">Arrival time at HQ is captured when you confirm: <b>{fmtDateTime(nowLocal())}</b></div>
                <GpsField label="Capture GPS at headquarters" value={gps} onChange={setGps} />
                <label className="check"><input type="checkbox" checked={f.confirmed} onChange={(e) => setF({ ...f, confirmed: e.target.checked })} /><span>I confirm, as Team Leader, that the items above were checked in and the information is correct.</span></label>
                <button className="btn primary lg" disabled={busy} onClick={submit}>Confirm return to headquarters</button>
              </>
            ) : dp.stage === 'Returned' && (
              <dl className="kv"><dt>Returned to HQ</dt><dd>{fmtDateTime(dp.ret_at)} · GPS {dp.ret_lat !== undefined ? `${dp.ret_lat}, ${dp.ret_lng}` : `not captured (${dp.ret_gps_note})`}</dd><dt>Vehicle</dt><dd>fuel {dp.dep_fuel} → {dp.ret_fuel} · odometer {dp.dep_odo?.toLocaleString()} → {dp.ret_odo?.toLocaleString()} km {dp.distance_km !== undefined && `(${dp.distance_km} km)`} · {dp.ret_veh_condition}{dp.ret_veh_notes && ` — ${dp.ret_veh_notes}`}</dd><dt>Confirmed by</dt><dd>{db.users.find((u) => u.id === dp.ret_confirmed_by)?.name ?? '—'} · {fmtStamp(dp.ret_confirmed_at)}</dd></dl>
            )}
            {result && <div className={`alert ${result.incidents ? 'warn' : 'info'}`}><b>Return recorded.</b> {result.incidents ? `${result.incidents} incident report(s) raised automatically (${result.missing} missing, ${result.damaged} damaged); ${result.tickets} maintenance ticket(s) opened. Admin and Operations Manager were notified.` : 'Everything issued was accounted for.'}{result.distance !== undefined && ` Distance: ${result.distance} km.`}{result.used.length > 0 && <div style={{ marginTop: 4 }}>Material usage: {result.used.map((u) => `${u.label} ${u.qty}${u.unit ? ' ' + u.unit : ''}`).join(' · ')}</div>}</div>}
            {dp.stage === 'Returned' && incs.length > 0 && <ul className="list" style={{ border: '1px solid var(--line-2)', borderRadius: 6 }}>{incs.map((i) => <li key={i.id}><div><b>{i.number}</b> · {i.type}<div className="small muted">{i.description}</div></div><Badge>{i.status}</Badge></li>)}</ul>}
            {job.status === 'Returned to HQ' && (
              <div className="stack" style={{ gap: 8 }}>
                {openInc.length > 0 && <div className="alert warn">The job stays open for review: {openInc.length} incident report(s) must be <b>resolved or acknowledged</b> by an Operations Manager / Admin before it can be closed. <Link to="/dispatch?tab=incidents">Review incidents</Link></div>}
                {(run || can('incidents.manage')) && <button className="btn navy lg" disabled={openInc.length > 0} onClick={() => attempt(() => closeJob(job.id), 'Job closed')}>Close job</button>}
              </div>
            )}
          </>
        )}
      </div>
      {scan && <QrScanner title="Scan returning items" onScan={onScan} onClose={() => setScan(null)} />}
    </Card>
  );
}

/* ================= edit history & corrections ================= */
function History({ dp, job }: { dp: Dispatch; job: Job }) {
  const { db, can } = useAuth();
  if (!can('admin.audit') && !can('incidents.manage')) return null;
  const rows = db.audit.filter((a) => (a.record_id === dp.id || (a.record_id === job.id && a.table === 'jobs')) && !a.summary.startsWith('Dispatch draft saved')).slice(0, 25);
  const short = (v: unknown) => { const t = v === undefined || v === null ? '—' : typeof v === 'string' ? (v.startsWith('data:') ? '[file]' : v) : JSON.stringify(v) ?? '—'; return t.length > 70 ? t.slice(0, 67) + '…' : t; };
  return (
    <Card title="Change history (who, when, old → new, reason)" flush>
      <ul className="list">{rows.map((a) => {
        const keys = a.after && typeof a.after === 'object' ? Object.keys(a.after as object).filter((k) => k !== 'items').slice(0, 4) : [];
        return <li key={a.id}><div><span className="small">{a.summary}</span>{a.reason && <div className="small"><b>Reason:</b> {a.reason}</div>}{keys.length > 0 && a.action === 'update' && <div className="small muted">{keys.map((k) => `${k}: ${short((a.before as Record<string, unknown>)?.[k] ?? '—')} → ${short((a.after as Record<string, unknown>)[k])}`).join(' · ')}</div>}</div><span className="small muted nowrap">{fmtStamp(a.at)} · {a.user_name}</span></li>;
      })}{!rows.length && <li className="muted">No changes recorded.</li>}</ul>
    </Card>
  );
}

function CorrectModal({ dp, onClose }: { dp: Dispatch; onClose: () => void }) {
  const [odo, setOdo] = useState({ dep: dp.dep_odo, ret: dp.ret_odo });
  const [fuel, setFuel] = useState({ dep: dp.dep_fuel, ret: dp.ret_fuel });
  const [notes, setNotes] = useState({ dep: dp.dep_veh_notes ?? '', ret: dp.ret_notes ?? '' });
  const [items, setItems] = useState(dp.items);
  const [reason, setReason] = useState('');
  const set = (key: string, patch: Partial<DispatchItem>) => setItems((a) => a.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  return (
    <Modal title="Correct dispatch record" size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!reason.trim()} onClick={() => { if (attempt(() => correctDispatch(dp.id, { dep_odo: odo.dep, ret_odo: odo.ret, dep_fuel: fuel.dep, ret_fuel: fuel.ret, dep_veh_notes: notes.dep, ret_notes: notes.ret, items, ...(odo.ret !== undefined && odo.dep !== undefined ? { distance_km: round2(odo.ret - odo.dep) } : {}) }, reason), 'Record corrected and logged')) onClose(); }}>Save correction</button></>}>
      <div className="alert info" style={{ marginBottom: 12 }}>Every correction is logged with your name, the time, the old and new values and the reason. Corrections change the record only — post stock or asset adjustments separately.</div>
      <div className="form-grid">
        <Field label="Starting odometer"><input type="number" value={odo.dep ?? ''} onChange={(e) => setOdo({ ...odo, dep: e.target.value === '' ? undefined : +e.target.value })} /></Field>
        <Field label="Ending odometer"><input type="number" value={odo.ret ?? ''} onChange={(e) => setOdo({ ...odo, ret: e.target.value === '' ? undefined : +e.target.value })} /></Field>
        <Field label="Starting fuel"><select value={fuel.dep ?? ''} onChange={(e) => setFuel({ ...fuel, dep: (e.target.value || undefined) as FuelLevel })}><option value="">—</option>{FUEL_LEVELS.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Ending fuel"><select value={fuel.ret ?? ''} onChange={(e) => setFuel({ ...fuel, ret: (e.target.value || undefined) as FuelLevel })}><option value="">—</option>{FUEL_LEVELS.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Vehicle notes (departure)"><input value={notes.dep} onChange={(e) => setNotes({ ...notes, dep: e.target.value })} /></Field>
        <Field label="Return notes"><input value={notes.ret} onChange={(e) => setNotes({ ...notes, ret: e.target.value })} /></Field>
      </div>
      <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="tbl"><thead><tr><th>Item</th><th>Loaded</th><th>Returned</th><th>Condition</th><th>Note</th></tr></thead><tbody>
        {items.filter((i) => (i.loaded_qty ?? 0) > 0).map((i) => <tr key={i.key}><td>{i.label}</td><td>{i.loaded_qty}</td><td><input type="number" style={{ width: 80 }} value={i.returned_qty ?? ''} onChange={(e) => set(i.key, { returned_qty: e.target.value === '' ? undefined : +e.target.value, ...(i.kind === 'material' && e.target.value !== '' ? { used_qty: round2((i.loaded_qty ?? 0) - +e.target.value) } : {}) })} aria-label={`Returned ${i.label}`} /></td><td><select value={i.ret_condition ?? ''} onChange={(e) => set(i.key, { ret_condition: (e.target.value || undefined) as ItemCondition })}><option value="">—</option>{ITEM_CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></td><td><input value={i.ret_note ?? ''} onChange={(e) => set(i.key, { ret_note: e.target.value })} /></td></tr>)}
      </tbody></table></div>
      <Field label="Reason for correction" required><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Odometer mistyped; confirmed from the dashboard photo" /></Field>
    </Modal>
  );
}
void store; void (null as unknown as ReactNode);
