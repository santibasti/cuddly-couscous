import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, attempt, toast } from '@/components/ui';
import { QrScanner } from '@/components/Qr';
import { AddToolModal, Confirm, ItemCard, KIND_LABEL, Seg, TimeField } from './shared';
import { ScopeStep } from './ScopeStep';
import { HandoverStep } from './HandoverStep';
import { CloseOutStep } from './CloseOutStep';
import { ReportIncidentModal } from './Incidents';
import { WORKFLOW_STEPS, hqGaps, workflowProgress, type StepState } from '@/lib/business';
import {
  FUEL_LEVELS, arriveAtSite, canRunWorkflow, completeHqChecklist, correctWorkflow, dispatchJob, finishWork, matchScan, openWorkflow, saveHqDraft, saveWorkNotes, startWork,
} from '@/lib/workflow';
import { fmtDateTime, nowLocal } from '@/lib/util';
import { clearDraft, confirmLeave, draftKeys } from '@/lib/sync';
import { useDraft } from '@/lib/useDraft';
import { DraftBar, PresetChips, Toggle } from '@/components/touch';
import { PRESETS } from '@/lib/presets';
import type { CheckItem, FuelLevel, Job, JobWorkflow } from '@/lib/types';

export const userName = (db: ReturnType<typeof useAuth>['db'], id?: string) => db.users.find((u) => u.id === id)?.name ?? (id ? id : '—');

/* ---------- a step card: number, title, date/time + user, body ---------- */
const DRAFT_KEYS = ['hq', 'disp', 'arr', 'conf', 'work', 'rep', 'close'];
export function Step({ n, state, at, by, children, wfId, done }: { n: number; state: StepState; at?: string; by?: string; children: ReactNode; wfId: string; done: boolean }) {
  const { db } = useAuth();
  const [nonce, setNonce] = useState(0);
  const key = `d:${wfId}:${DRAFT_KEYS[n - 1]}`;
  // once the step is submitted its draft is no longer needed
  useEffect(() => { if (done) draftKeys().filter((k) => k.startsWith(key)).forEach(clearDraft); }, [done, key]);
  // "Discard draft" remounts the step with fresh, empty entries
  useEffect(() => {
    const f = (e: Event) => { if (String((e as CustomEvent).detail).startsWith(key)) setNonce((x) => x + 1); };
    window.addEventListener('draft-discard', f); return () => window.removeEventListener('draft-discard', f);
  }, [key]);
  return (
    <section id={`step-${n}`} className={`wfstep ${state}`} aria-labelledby={`step-${n}-t`}>
      <div className="wfhead">
        <span className="avatar" style={{ background: done ? 'var(--green)' : state === 'locked' ? '#9db0c5' : 'var(--navy)', width: 38, height: 38, fontSize: 15 }}>{done ? '✓' : n}</span>
        <span className="grow"><b id={`step-${n}-t`} style={{ fontSize: 17 }}>{n}. {WORKFLOW_STEPS[n - 1]}</b>{done && at && <div className="small muted">{fmtDateTime(at)} · {userName(db, by)}</div>}</span>
        <Badge tone={done ? 'green' : state === 'current' ? 'blue' : 'gray'}>{done ? 'Done' : state === 'current' ? 'Next' : 'Locked'}</Badge>
      </div>
      <div className="wfbody" key={nonce}>{done && n !== 4 ? <details className="wfdone"><summary>Show what was recorded</summary>{children}</details> : children}</div>
    </section>
  );
}
const Locked = ({ why }: { why: string }) => <div className="muted">{why}</div>;
const last = 6;

/* ================= the panel ================= */
export function WorkflowPanel({ job, above }: { job: Job; onDetails?: () => void; above?: (step: number) => ReactNode }) {
  const { db, can } = useAuth();
  const wf = db.workflows.find((w) => w.job_id === job.id && !w.deleted_at);
  const vars = db.variations.filter((v) => v.job_id === job.id && !v.deleted_at);
  const prog = workflowProgress(wf, vars);
  const run = canRunWorkflow(job);
  const first = prog.findIndex((p) => p.state === 'current');
  const selKey = `wfsel7:${job.id}`;
  const [sel, setSel] = useState<number>(() => { try { const s = sessionStorage.getItem(selKey); return s === null ? -1 : +s; } catch { return -1; } });
  const [fix, setFix] = useState(false);
  const cur = sel >= 0 && sel <= last ? sel : first >= 0 ? first : last;
  const choose = (i: number) => { setSel(i); try { sessionStorage.setItem(selKey, String(i)); } catch { /* private mode */ } };
  // a finished step moves the crew on to the next one
  const lastFirst = useRef(first);
  useEffect(() => { if (first !== lastFirst.current) { lastFirst.current = first; if (first >= 0) { choose(first); window.scrollTo({ top: 0 }); } } }, [first]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (i: number) => { if (i < 0 || i > last || i === cur) return; if (!confirmLeave()) return; choose(i); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const canceled = ['Cancelled', 'Rescheduled'].includes(job.status);
  const st = (i: number) => prog[i];

  if (canceled) return null;
  if (!wf) {
    return (<>
      {above?.(-1)}
      <Card title="Job workflow">
        <p style={{ marginTop: 0 }}>The 7-step workflow (job prep → dispatch → site check-in → scope approval → work → client handover → close-out) starts at HQ. It loads the crew, vehicle, equipment, PPE and materials from this booking.</p>
        {job.status === 'Pending' && <div className="alert warn" style={{ marginBottom: 10 }}>Confirm the booking first.</div>}
        {['Confirmed', 'Dispatch Checklist Pending'].includes(job.status) ? (run ? <button className="btn primary lg" onClick={() => attempt(() => openWorkflow(job.id), 'Job prep ready')}>Start job prep (HQ)</button> : <div className="alert warn">Only the assigned Team Leader or a manager can start this checklist.</div>) : job.status !== 'Pending' && <div className="muted">This job has no workflow record (it was completed before the workflow was introduced).</div>}
      </Card>
    </>);
  }

  const body: ReactNode[] = [
    wf.hq_at ? <PrepSummary wf={wf} /> : <PrepForm wf={wf} job={job} run={run} />,
    wf.disp_at ? <dl className="kv"><dt>Departed HQ</dt><dd>{fmtDateTime(wf.disp_at)}</dd><dt>Confirmed by</dt><dd>{userName(db, wf.disp_by)}</dd></dl>
      : !wf.hq_at ? <Locked why="Available after job prep is confirmed." /> : <DispatchForm wf={wf} run={run} />,
    wf.arr_at ? <CheckInSummary wf={wf} /> : !wf.disp_at ? <Locked why="Available after the crew is dispatched." /> : <CheckInForm wf={wf} job={job} run={run} />,
    !wf.arr_at ? <Locked why="Available after site check-in." /> : <ScopeStep wf={wf} job={job} run={run} />,
    !wf.conf_at ? <Locked why="Available once the client has signed the quotation (step 4)." /> : wf.conf_mode === 'declined' ? <Skipped /> : <WorkStep wf={wf} job={job} run={run} onVariation={() => go(3)} />,
    wf.conf_mode === 'declined' ? <Skipped /> : !wf.finish_at ? <Locked why="Available once the work is finished (step 5)." /> : <HandoverStep wf={wf} job={job} run={run} />,
    !wf.rep_at && wf.conf_mode !== 'declined' ? <Locked why="Available after the client handover is signed." /> : <CloseOutStep wf={wf} job={job} run={run} />,
  ];
  const stamps = [{ at: wf.hq_at, by: wf.hq_by }, { at: wf.disp_at, by: wf.disp_by }, { at: wf.arr_at, by: wf.arr_by }, { at: wf.conf_at, by: wf.conf_by }, { at: wf.finish_at, by: wf.finish_by }, { at: wf.rep_at, by: wf.rep_by }, { at: wf.closed_at, by: wf.closed_by }];
  const fixBtn = can('incidents.manage') ? <button className="btn sm" onClick={() => setFix(true)}><Icon name="edit" />Correct record</button> : null;

  return (<>
    {above?.(cur)}
    <div className="wfwrap">
      {/* landscape tablets / desktop: full tracker rail beside the step */}
      <aside className="wfrail card" aria-label="Job workflow progress">
        <div className="card-h"><b>Job progress</b>{fixBtn}</div>
        <ol>{WORKFLOW_STEPS.map((t, i) => { const p = st(i); return (
          <li key={t} className={`${p.state} ${i === cur ? 'sel' : ''}`}><button type="button" onClick={() => go(i)} aria-current={i === cur ? 'step' : undefined}><i>{p.state === 'done' ? '✓' : i + 1}</i><span>{t}{p.at && <small>{fmtDateTime(p.at)}</small>}</span></button></li>
        ); })}</ol>
      </aside>
      <div>
        {/* tablets in portrait / phones: sticky step strip */}
        <nav className="wfstrip" aria-label="Job workflow progress">
          <ol>{WORKFLOW_STEPS.map((t, i) => { const p = st(i); return (
            <li key={t} className={`${p.state} ${i === cur ? 'sel' : ''}`}><button type="button" onClick={() => go(i)} title={t} aria-label={`Step ${i + 1}: ${t}`} aria-current={i === cur ? 'step' : undefined}>{p.state === 'done' ? '✓' : i + 1}</button></li>
          ); })}</ol>
          <div className="now"><span><span className="small muted">Step {cur + 1} of 7</span><br /><b>{WORKFLOW_STEPS[cur]}</b></span>{fixBtn}</div>
        </nav>
        {!run && <div className="alert info" style={{ marginBottom: 10 }}>You can view this workflow. Only the assigned Team Leader or a manager can complete the steps.</div>}
        <Step key={cur} n={cur + 1} state={st(cur).state} at={stamps[cur].at} by={stamps[cur].by} wfId={wf.id} done={st(cur).state === 'done'}>{body[cur]}</Step>
        <div className="wffoot">
          <button className="btn" disabled={cur === 0} onClick={() => go(cur - 1)}>← Back</button>
          <span className="mid">{cur + 1} / 7 · {WORKFLOW_STEPS[cur]}</span>
          <button className="btn navy" disabled={cur === last} onClick={() => go(cur + 1)}>Next →</button>
        </div>
      </div>
      {fix && <CorrectModal wf={wf} onClose={() => setFix(false)} />}
    </div>
  </>);
}

/* ================= Step 1: Job Prep at HQ ================= */
function PrepForm({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db } = useAuth();
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? (id ? 'Unknown employee (reassign on the job)' : '—');
  const [items, setItems] = useState<CheckItem[]>(wf.items);
  const [fuel, setFuel] = useState<FuelLevel | undefined>(wf.hq_fuel);
  const [reason, setReason] = useState(wf.hq_shortage_reason ?? '');
  const [notes, setNotes] = useState(wf.hq_notes ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [scan, setScan] = useState<{ key?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const dr = useDraft(`d:${wf.id}:hq`, { items, fuel, reason, notes }, (d) => { setItems(mergePrep(wf.items, d.items)); setFuel(d.fuel); setReason(d.reason); setNotes(d.notes); }, run && !wf.hq_at);
  // the booking can change while prep is open: follow the saved list (items added / removed), keep what was confirmed here
  useEffect(() => { if (!wf.hq_at) setItems((cur) => mergePrep(wf.items, cur)); }, [wf.items, wf.hq_at]);
  const draft = () => ({ items, hq_fuel: fuel, hq_notes: notes, hq_shortage_reason: reason });
  const gaps = useMemo(() => hqGaps(draft() as never), [items, reason]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const crew = [job.leader_id, ...job.crew_ids].filter(Boolean) as string[];
  return (
    <div className="stack">
      {run && <DraftBar d={dr} />}
      <dl className="kv"><dt>Job</dt><dd><b>{job.number}</b> · {job.scope}</dd><dt>Team leader</dt><dd>{emp(job.leader_id)}</dd><dt>Crew</dt><dd>{crew.filter((e) => e !== job.leader_id).map(emp).join(', ') || '—'}</dd></dl>
      {!job.leader_id && <div className="alert warn">No Team Leader is assigned. Assign one from “Edit / reassign” first.</div>}
      {run && <div className="row">
        <button className="btn primary" onClick={() => setItems(items.map((i) => (i.out_ok ? i : { ...i, out_ok: true, out_by: 'manual', loaded_qty: i.loaded_qty ?? i.qty, ...(i.kind === 'material' ? { out_container: i.out_container ?? 'Good' } : { out_condition: i.out_condition ?? 'Good' }) })))}>All present &amp; in good condition</button>
        <button className="btn navy" onClick={() => setScan({})}><Icon name="camera" />Scan any item</button><button className="btn" onClick={() => setAdding(true)}><Icon name="plus" />Add tool</button>
        <button className="btn" onClick={() => attempt(() => saveHqDraft(wf.id, draft()), 'Progress saved')}>Save progress</button></div>}

      {(['vehicle', 'equipment', 'tool', 'ppe'] as const).map((k) => { const rows = items.filter((i) => i.kind === k); if (!rows.length) return null; return (
        <div key={k}><div className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 6px' }}>{KIND_LABEL[k]}{k === 'ppe' ? ' — PPE confirmation' : ''}</div>
          <div className="stack" style={{ gap: 8 }}>{rows.map((i) => <ItemCard key={i.key} it={i} setItem={setItem} confirmItem={confirmItem} onScan={() => setScan({ key: i.key })} disabled={disabled} onRemove={i.extra ? () => setItems(items.filter((x) => x.key !== i.key)) : undefined} />)}</div></div>
      ); })}

      {mats.length > 0 && <div><div className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 6px' }}>{KIND_LABEL.material} issued from Inventory</div>
        <div className="stack" style={{ gap: 8 }}>{mats.map((i) => <MaterialCard key={i.key} it={i} setItem={setItem} confirmItem={confirmItem} disabled={disabled} />)}</div></div>}

      {job.vehicle_id && <Field label="Vehicle fuel level (optional)"><Seg value={fuel} options={FUEL_LEVELS} disabled={disabled} onChange={(v) => setFuel(fuel === v ? undefined : v)} /></Field>}
      <div className={`alert ${gaps.incomplete.length ? 'err' : gaps.shortages.length ? 'warn' : 'info'}`}>
        {gaps.incomplete.length > 0 && <div><b>Still to confirm:</b> {gaps.incomplete.join(' · ')}</div>}
        {gaps.shortages.length > 0 && <div><b>Short / damaged / missing:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{gaps.shortages.map((d) => <li key={d}>{d}</li>)}</ul>An incident report is raised automatically and Operations is notified.</div>}
        {!gaps.incomplete.length && !gaps.shortages.length && <div>Checklist complete — everything present and in good condition.</div>}
      </div>
      {gaps.shortages.length > 0 && <Field label="Reason for proceeding with these items" required><textarea disabled={disabled} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tap a reason below or type" /><PresetChips replace options={PRESETS.shortage} value={reason} onChange={setReason} disabled={disabled} /></Field>}
      <details><summary className="small" style={{ cursor: 'pointer' }}>Add a note (optional)</summary><div style={{ marginTop: 8 }}><input disabled={disabled} value={notes} onChange={(e) => setNotes(e.target.value)} /><PresetChips options={PRESETS.hqNotes} value={notes} onChange={setNotes} disabled={disabled} /></div></details>
      <Confirm checked={confirmed} onChange={setConfirmed} disabled={disabled}>I confirm, as Team Leader, that the crew, equipment, PPE and materials listed are ready and the information above is correct.</Confirm>
      {run && <button className="btn primary lg" disabled={!confirmed} onClick={() => attempt(() => completeHqChecklist(wf.id, { ...draft(), items, confirmed }), 'Job prep confirmed — equipment is now In Use')}>Confirm job prep</button>}
      {scan && <QrScanner title={scan.key ? 'Scan this item’s QR code' : 'Scan items being loaded'} onScan={onScan} onClose={() => setScan(null)} hint="Point the camera at the QR label, or type the Asset ID (e.g. WFP-001) and press Apply." />}
      {adding && <AddToolModal items={items} job={job} onAdd={(it) => { setItems([...items, it]); setAdding(false); }} onClose={() => setAdding(false)} />}
    </div>
  );
}

function MaterialCard({ it, setItem, confirmItem, disabled }: { it: CheckItem; setItem: (k: string, p: Partial<CheckItem>) => void; confirmItem: (i: CheckItem, by: 'manual') => void; disabled: boolean }) {
  const { db } = useAuth();
  const inv = db.items.find((x) => x.id === it.item_id); const oh = !inv ? 0 : db.stock.filter((t) => t.approval === 'Approved' && t.item_id === inv.id && t.location_id === inv.location_id).reduce((s, t) => s + t.qty, 0);
  return (
    <div className={`itemcard ${it.out_ok ? 'ok' : ''}`}>
      <div className="row between"><div><b>{it.label}</b> <span className="muted small">{it.code}</span></div>{it.out_ok ? <Badge tone="green">✓ Confirmed</Badge> : <Badge tone="amber">Not confirmed</Badge>}</div>
      <div className="itemgrid">
        <Field label={`Quantity issued (${it.unit ?? ''}) — need ${it.qty}`}><MatStepper it={it} setItem={setItem} disabled={disabled} /></Field>
        <Field label="Container"><Seg value={it.out_container ?? 'Good'} options={['Good', 'Damaged', 'Leaking'] as const} disabled={disabled} tone={(v) => (v === 'Good' ? 'good' : 'bad')} onChange={(v) => setItem(it.key, { out_container: v })} /></Field>
      </div>
      <div className="small muted">On hand: <b>{Math.round(oh * 100) / 100} {inv?.uom ?? ""}</b> — issuing deducts from Inventory when job prep is confirmed.</div>
      {!disabled && <label className="check"><input type="checkbox" checked={!!it.out_ok} onChange={(e) => (e.target.checked ? confirmItem(it, 'manual') : setItem(it.key, { out_ok: false }))} />Confirm</label>}
    </div>
  );
}
import { Stepper } from '@/components/touch';
const MatStepper = ({ it, setItem, disabled }: { it: CheckItem; setItem: (k: string, p: Partial<CheckItem>) => void; disabled: boolean }) => <Stepper label={`Quantity issued ${it.label}`} step={0.5} unit={it.unit} disabled={disabled} value={it.loaded_qty} onChange={(v) => setItem(it.key, { loaded_qty: v })} />;

function PrepSummary({ wf }: { wf: JobWorkflow }) {
  const { db } = useAuth();
  return (
    <div className="stack">
      <dl className="kv"><dt>Confirmed by</dt><dd>{userName(db, wf.hq_by)} · {fmtDateTime(wf.hq_at)}</dd>{wf.hq_fuel && <><dt>Fuel</dt><dd>{wf.hq_fuel}</dd></>}{wf.hq_shortage_reason && <><dt>Shortage reason</dt><dd>{wf.hq_shortage_reason}</dd></>}{wf.hq_notes && <><dt>Notes</dt><dd>{wf.hq_notes}</dd></>}</dl>
      <div className="tbl-wrap"><table className="tbl stack-m"><thead><tr><th>Item</th><th>Asset ID</th><th>Required</th><th>Loaded</th><th>Condition</th><th>Confirmed</th></tr></thead><tbody>
        {wf.items.map((i) => <tr key={i.key}><td className="first"><b>{i.label}</b>{i.extra && <> <Badge tone="blue">added</Badge></>}{i.out_note && <div className="small muted">{i.out_note}</div>}</td><td data-label="Asset ID">{i.code ?? '—'}</td><td data-label="Required">{i.kind === 'vehicle' ? '—' : `${i.qty}${i.unit ? ` ${i.unit}` : ''}`}</td><td data-label="Loaded">{i.kind === 'vehicle' ? '—' : i.loaded_qty ?? '—'}</td><td data-label="Condition"><Badge>{(i.kind === 'material' ? i.out_container : i.out_condition) ?? '—'}</Badge></td><td data-label="By">{i.out_by === 'scan' ? 'QR scan' : i.out_by === 'id' ? 'Asset ID' : i.out_ok ? 'Manual' : '—'}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

/* ================= Step 2: Dispatch ================= */
function DispatchForm({ wf, run }: { wf: JobWorkflow; run: boolean }) {
  const [at, setAt] = useState(nowLocal()); const [ok, setOk] = useState(false);
  const dr = useDraft(`d:${wf.id}:disp`, { at }, (d) => setAt(d.at), run && !wf.disp_at);
  return (
    <div className="stack">
      {run && <DraftBar d={dr} />}
      <TimeField label="Actual departure time" value={at} onChange={setAt} disabled={!run} hint="Defaults to now — change it if the crew already left." />
      <Confirm checked={ok} onChange={setOk} disabled={!run}>I confirm the crew and equipment are loaded and have left headquarters.</Confirm>
      {run && <button className="btn primary lg" disabled={!ok} onClick={() => attempt(() => dispatchJob(wf.id, { at, confirmed: ok }), 'Crew dispatched')}>Dispatch crew</button>}
    </div>
  );
}

/** Items from the saved prep list, carrying over any progress made on this screen; drafts never bring back an item removed from the booking. */
function mergePrep(saved: CheckItem[], local: CheckItem[]): CheckItem[] {
  const mine = new Map(local.map((i) => [i.key, i]));
  const merged = [...saved.map((s) => (mine.has(s.key) ? { ...s, ...mine.get(s.key)!, label: s.label, code: s.code, qty: s.qty } : s)), ...local.filter((i) => i.extra && !saved.some((s) => s.key === i.key))];
  return JSON.stringify(merged) === JSON.stringify(local) ? local : merged;
}

/* ================= Step 3: Site Check-In (arrival + attendance) ================= */
function CheckInForm({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db } = useAuth();
  const crew = [...new Set([...(job.leader_id ? [job.leader_id] : []), ...job.crew_ids])];
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? (id ? 'Unknown employee (reassign on the job)' : '—');
  const site = db.sites.find((s) => s.id === job.site_id);
  const [at, setAt] = useState(nowLocal());
  const [present, setPresent] = useState<string[]>(crew);
  const [absent, setAbsent] = useState<Record<string, string>>({});
  const client = db.clients.find((c) => c.id === job.client_id);
  // the contact comes from the booking: the site's contact, else the client's contact person (nothing to retype)
  const [contact, setContact] = useState({ name: site?.contact_person || client?.contact_person || '', mobile: site?.contact_mobile || client?.mobile || '' });
  const [notes, setNotes] = useState('');
  const missClock = present.filter((e) => !db.attendance.some((x) => x.employee_id === e && x.date === at.slice(0, 10) && x.clock_in && !x.deleted_at));   // present but not clocked in → cannot check in
  const dr = useDraft(`d:${wf.id}:arr`, { at, present, absent, contact, notes }, (d) => { setAt(d.at); setPresent(d.present); setAbsent(d.absent); setContact(d.contact); setNotes(d.notes); }, run && !wf.arr_at);
  return (
    <div className="stack">
      {run && <DraftBar d={dr} />}
      <TimeField label="Actual arrival time" value={at} onChange={setAt} disabled={!run} hint="Defaults to now." />
      <div className="form-grid"><Field label="Site contact person" required hint="From the booking — change it only if someone else is meeting the crew."><input disabled={!run} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field><Field label="Contact mobile (optional)"><input disabled={!run} value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} /></Field></div>
      <div>
        <div className="row between" style={{ marginBottom: 6 }}><b>Crew attendance (synced to Attendance &amp; Payroll)</b>{run && <button className="btn sm" onClick={() => setPresent(crew)}>All present</button>}</div>
        <ul className="list" style={{ border: '1px solid var(--line-2)', borderRadius: 6 }}>
          {crew.map((e) => { const a = db.attendance.find((x) => x.employee_id === e && x.date === at.slice(0, 10) && x.clock_in && !x.deleted_at); const on = present.includes(e);
            return <li key={e}><div className="grow"><Toggle checked={on} disabled={!run} onChange={() => setPresent(on ? present.filter((x) => x !== e) : [...present, e])}><b>{emp(e)}</b>{e === job.leader_id && <span className="muted small"> · Team Leader</span>}</Toggle>
              {!on && <div style={{ marginTop: 6 }}><input disabled={!run} placeholder="Reason absent (required)" value={absent[e] ?? ''} onChange={(ev) => setAbsent({ ...absent, [e]: ev.target.value })} aria-label={`Reason ${emp(e)} is absent`} /><PresetChips replace options={PRESETS.absent} value={absent[e] ?? ''} onChange={(v) => setAbsent({ ...absent, [e]: v })} disabled={!run} /></div>}</div>
              {a ? <Badge tone="green">Clocked in {a.clock_in?.slice(11, 16)}</Badge> : on ? <Badge tone="red">Not clocked in</Badge> : <Badge tone="red">Absent</Badge>}</li>; })}
        </ul>
        {(() => { const miss = missClock; return miss.length ? <div className="alert warn" style={{ marginTop: 8 }}><b>Cannot check in yet.</b> {miss.map(emp).join(', ')} {miss.length > 1 ? 'have' : 'has'} not clocked in. Each crew member must clock in on their own Attendance page first — or switch them off above and give the reason they are absent.</div> : <div className="small muted" style={{ marginTop: 6 }}>Everyone marked present has clocked in. Their attendance record is linked to this job.</div>; })()}
      </div>
      <details><summary className="small" style={{ cursor: 'pointer' }}>Add a site note (optional)</summary><div style={{ marginTop: 8 }}><textarea disabled={!run} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Access, hazards, restrictions…" /><PresetChips options={PRESETS.site} value={notes} onChange={setNotes} disabled={!run} /></div></details>
      {run && <button className="btn primary lg" disabled={missClock.length > 0} onClick={() => attempt(() => arriveAtSite(wf.id, { at, contact_name: contact.name, contact_mobile: contact.mobile, notes, present, absent: crew.filter((e) => !present.includes(e)).map((e) => ({ id: e, reason: absent[e] ?? '' })) }), 'Checked in — attendance confirmed')}>Confirm check-in &amp; attendance</button>}
    </div>
  );
}
function CheckInSummary({ wf }: { wf: JobWorkflow }) {
  const { db } = useAuth();
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? (id ? 'Unknown employee (reassign on the job)' : '—');
  return <dl className="kv"><dt>Arrived</dt><dd>{fmtDateTime(wf.arr_at)}</dd><dt>Site contact</dt><dd>{wf.arr_contact_name} {wf.arr_contact_mobile}</dd>
    <dt>Attendance</dt><dd>Present: {(wf.arr_crew_present ?? []).map(emp).join(', ') || '—'}{(wf.arr_crew_absent ?? []).length > 0 && <div className="small">Absent: {(wf.arr_crew_absent ?? []).map((a) => `${emp(a.id)} (${a.reason})`).join(', ')}</div>}</dd>{wf.arr_notes && <><dt>Site note</dt><dd>{wf.arr_notes}</dd></>}</dl>;
}

/* ================= Step 5: Work in Progress ================= */
const Skipped = () => <div className="alert info">Skipped — the client declined the job on site. Nothing is billed; continue to Close-Out to return the equipment.</div>;

function WorkStep({ wf, job, run, onVariation }: { wf: JobWorkflow; job: Job; run: boolean; onVariation: () => void }) {
  const { db, can } = useAuth();
  const [start, setStart] = useState(nowLocal()); const [fin, setFin] = useState(nowLocal()); const [notes, setNotes] = useState(wf.work_notes ?? '');
  const [inc, setInc] = useState(false);
  const done = !!wf.finish_at;
  const dr = useDraft(`d:${wf.id}:work`, { start, fin, notes }, (d) => { setStart(d.start); setFin(d.fin); setNotes(d.notes); }, run && !done);
  const incs = db.incidents.filter((i) => i.job_id === job.id && !i.deleted_at && i.type === 'Safety');
  return (
    <div className="stack">
      {run && !done && <DraftBar d={dr} />}
      {!wf.start_at ? (
        <>
          <TimeField label="Work start time" value={start} onChange={setStart} disabled={!run} hint="Defaults to now." />
          {run && <button className="btn primary lg" onClick={() => attempt(() => startWork(wf.id, { at: start, notes: notes || undefined }), 'Work started — In Progress')}>Start work</button>}
        </>
      ) : (
        <dl className="kv"><dt>Work started</dt><dd>{fmtDateTime(wf.start_at)}</dd>{done && <><dt>Work finished</dt><dd>{fmtDateTime(wf.finish_at)}</dd></>}</dl>
      )}
      {wf.start_at && !done && (
        <>
          <TimeField label="Work finish time" value={fin} onChange={setFin} disabled={!run} hint="Defaults to now — tap Finish when the work is complete." />
          {run && <button className="btn primary lg" onClick={() => attempt(() => finishWork(wf.id, { at: fin, notes }), 'Work finished — ready for client handover')}>Finish work</button>}
        </>
      )}
      <Field label="Work notes (optional)"><textarea disabled={!run || !!wf.closed_at} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (done && notes !== (wf.work_notes ?? '')) attempt(() => saveWorkNotes(wf.id, notes)); }} /><PresetChips options={PRESETS.start} value={notes} onChange={setNotes} disabled={!run || !!wf.closed_at} /></Field>
      <div className="row">
        {(run || can('incidents.manage')) && <button className="btn" onClick={() => setInc(true)}><Icon name="alert" />Report safety issue / incident</button>}
        {run && <button className="btn" onClick={onVariation}>Additional work → variation approval</button>}
      </div>
      {incs.length > 0 && <div className="alert warn"><b>Safety incident(s) reported:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{incs.map((i) => <li key={i.id}><b>{i.number}</b> · {i.status} — {i.description}</li>)}</ul></div>}
      {inc && <ReportIncidentModal jobId={job.id} onClose={() => setInc(false)} />}
    </div>
  );
}

/* ================= correction with reason (Ops / Admin) ================= */
function CorrectModal({ wf, onClose }: { wf: JobWorkflow; onClose: () => void }) {
  const [v, setV] = useState({ arr_contact_name: wf.arr_contact_name ?? '', arr_notes: wf.arr_notes ?? '', hq_notes: wf.hq_notes ?? '', work_notes: wf.work_notes ?? '', closed_notes: wf.closed_notes ?? '' });
  const [reason, setReason] = useState('');
  return (
    <Modal title="Correct workflow record" size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!reason.trim()} onClick={() => { if (attempt(() => correctWorkflow(wf.id, { ...v }, reason), 'Record corrected and logged')) onClose(); }}>Save correction</button></>}>
      <div className="alert info" style={{ marginBottom: 12 }}>Every correction is logged with your name, the time, the old and new values and the reason. Stock and asset adjustments are posted separately.</div>
      <div className="form-grid">
        <Field label="Site contact"><input value={v.arr_contact_name} onChange={(e) => setV({ ...v, arr_contact_name: e.target.value })} /></Field>
        <Field label="Check-in note"><input value={v.arr_notes} onChange={(e) => setV({ ...v, arr_notes: e.target.value })} /></Field>
        <Field label="Job prep note"><input value={v.hq_notes} onChange={(e) => setV({ ...v, hq_notes: e.target.value })} /></Field>
        <Field label="Work notes"><input value={v.work_notes} onChange={(e) => setV({ ...v, work_notes: e.target.value })} /></Field>
        <Field label="Close-out notes"><input value={v.closed_notes} onChange={(e) => setV({ ...v, closed_notes: e.target.value })} /></Field>
      </div>
      <Field label="Reason for correction" required><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Contact name mistyped" /></Field>
    </Modal>
  );
}
