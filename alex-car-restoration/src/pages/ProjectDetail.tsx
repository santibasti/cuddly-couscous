import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdviceCard } from '../components/Advice';
import Journey from '../components/Journey';
import { Outbox, SmsAction } from '../components/Sms';
import { adviseJob } from '../lib/advice';
import { Avatar, Crew, CarArt, Card, carName, HealthPill, ServicePill, Icon, PartStatusPill, Pill, RiskPill, Seg, statusLabel } from '../components/ui';
import { paintHex } from '../lib/paint';
import { resizeImage } from '../lib/photo';
import { addDays, diffDays, fmtDate, todayIso } from '../lib/dates';
import { BAYS, PACKAGES, PART_FLOW, coatingDates, currentPhase, daysOverdue, isPartIn, money, moneyC, partRisk, partStatusLabel, phaseLabel, phasePercent, phaseShort, projectCosts, projectHealth, projectProgress, taskBlocker, jobCrew } from '../lib/logic';
import { CHECKUP_DAYS, isPaidInFull, missingItems } from '../lib/crm';
import { useRole } from '../lib/role';
import { useStore } from '../lib/store';
import type { BlockReason, CoatingRecord, PartKind, PartStatus, PhaseKey, ProjectStatus, TaskStatus } from '../lib/types';

type Tab = 'work' | 'parts' | 'billing' | 'log';
const ROLE_NAME = { executive: 'Executive', advisor: 'Service Advisor', leader: 'Team Leader' } as const;

export default function ProjectDetail() {
  const { id } = useParams();
  const { data, dispatch } = useStore();
  const { role } = useRole();
  const [tab, setTab] = useState<Tab>('work');
  const [note, setNote] = useState('');
  const [photoErr, setPhotoErr] = useState('');
  const [notePhase, setNotePhase] = useState<PhaseKey | ''>('');
  const [selKey, setSelKey] = useState<PhaseKey | null>(null);
  const today = todayIso();
  const p = data.projects.find((x) => x.id === id);
  if (!p) return <p>Project not found. <Link to="/projects">Back to projects</Link></p>;

  const customer = data.customers.find((c) => c.id === p.customerId);
  const tasks = data.tasks.filter((t) => t.projectId === p.id).sort((a, b) => a.date.localeCompare(b.date));
  const parts = data.parts.filter((x) => x.projectId === p.id).sort((a, b) => a.neededBy.localeCompare(b.neededBy));
  const updates = data.updates.filter((u) => u.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const pct = projectProgress(p, data.tasks);
  const costs = projectCosts(p, data.tasks, data.parts, data.mechanics);
  const over = daysOverdue(p, today);
  const collected = p.payments.reduce((x, y) => x + y.amount, 0);
  const earned = Math.round((p.budget * pct) / 100);
  const { health, reasons } = projectHealth(p, data, today);
  const team = data.mechanics.filter((m) => m.active);
  const sel = p.phases.find((x) => x.key === selKey) ?? currentPhase(p) ?? p.phases[0];
  const blocked = tasks.map((t) => ({ t, b: taskBlocker(t, data.parts) })).filter((x) => x.b);
  const patch = (id: string, pt: Record<string, unknown>) => dispatch({ type: 'updateTask', id, patch: pt });

  function addTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    dispatch({ type: 'addTask', task: { projectId: p!.id, title: String(f.get('title')), phaseKey: f.get('phase') as PhaseKey, mechanicId: String(f.get('mechanic')) || undefined, date: String(f.get('date')), estHours: Number(f.get('hours')) || 1, partId: String(f.get('part')) || undefined } });
    e.currentTarget.reset();
  }
  function addPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = Number(f.get('amount'));
    if (!amount) return;
    dispatch({ type: 'addPayment', projectId: p!.id, date: String(f.get('date')), amount, note: String(f.get('note')).trim() || undefined });
    e.currentTarget.reset();
  }
  function addPart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    dispatch({ type: 'addPart', part: { projectId: p!.id, name: String(f.get('name')), kind: f.get('kind') as PartKind, supplier: String(f.get('supplier')), cost: Number(f.get('cost')) || 0, status: 'needed', neededBy: String(f.get('needed')), po: String(f.get('po')) || undefined } });
    e.currentTarget.reset();
  }

  return (
    <>
      <Link to="/projects" className="crumb">← Projects</Link>
      <section className="phero rise" style={{ '--paint': paintHex(p) } as React.CSSProperties}>
        {p.photo ? <img className="phero-photo" src={p.photo} alt={carName(p)} /> : <div className="art"><CarArt color={paintHex(p)} car={p} /></div>}
        <div className="txt">
          <div className="row" style={{ marginBottom: 14 }}><span className="eyebrow">{p.code} · {p.year} · {p.bay}</span><ServicePill s={p.service} /><HealthPill h={health} /></div>
          <h1>{p.make} <em>{p.model}</em></h1>
          <p className="muted" style={{ margin: '12px 0 0' }}>{p.packageName ?? p.title} · {p.color} · {customer?.name} ({customer?.phone})</p>
          {jobCrew(p.id, data).length > 0 && <div className="row" style={{ marginTop: 12, gap: 10 }}><Crew crew={jobCrew(p.id, data)} size={32} max={6} /><span className="small muted">{jobCrew(p.id, data).map((m) => m.name.split(' ')[0]).join(', ')}</span></div>}
          <div className="row" style={{ marginTop: 20 }}>
            <select value={p.status} onChange={(e) => dispatch({ type: 'setProjectStatus', id: p.id, status: e.target.value as ProjectStatus })}>
              {(['quote', 'active', 'on_hold', 'completed', 'delivered'] as ProjectStatus[]).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <select value={p.bay} onChange={(e) => dispatch({ type: 'updateProject', id: p.id, patch: { bay: e.target.value } })}><option>Unassigned</option>{BAYS.map((b) => <option key={b}>{b}</option>)}</select>
            <label className="btn sm" style={{ cursor: 'pointer' }}>
              <Icon name="plus" size={13} />{p.photo ? 'Change photo' : 'Add real photo'}
              <input type="file" accept="image/*" hidden onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try { dispatch({ type: 'updateProject', id: p.id, patch: { photo: await resizeImage(file) } }); setPhotoErr(''); } catch (err) { setPhotoErr(err instanceof Error ? err.message : 'Could not use that image.'); }
              }} />
            </label>
            {p.photo && <button className="sm ghost" onClick={() => dispatch({ type: 'updateProject', id: p.id, patch: { photo: undefined } })}>Remove photo</button>}
          </div>
          {photoErr && <div className="small over" role="alert" style={{ marginTop: 8 }}>{photoErr}</div>}
        </div>
        <div className="stats">
          <div><div className="eyebrow">Progress</div><div className="sv"><span>{pct}%</span></div><div className={`small ${over ? 'over' : 'muted'}`}>{over ? `${over}d past target` : `Target ${fmtDate(p.targetDate)}`}</div></div>
          {role !== 'leader' && <div><div className="eyebrow">Spent</div><div className={`sv ${costs.total > p.budget ? 'red' : ''}`}><span>{moneyC(costs.total)}</span></div><div className="small muted">of {moneyC(p.budget)} budget</div></div>}
          <div><div className="eyebrow">Hours</div><div className="sv"><span>{tasks.reduce((s, t) => s + t.actualHours, 0)}h</span></div><div className="small muted">of {tasks.reduce((s, t) => s + t.estHours, 0)}h planned</div></div>
          <div><div className="eyebrow">Parts in shop</div><div className="sv"><span>{parts.filter(isPartIn).length}/{parts.length}</span></div><div className="small muted">{blocked.length} task{blocked.length === 1 ? '' : 's'} blocked</div></div>
        </div>
      </section>

      {reasons.length > 0 && health !== 'quote' && health !== 'hold' && (
        <div className="callout">
          <span className="ico orange"><Icon name="warn" /></span>
          <div><strong>{health === 'late' ? 'Running late' : health === 'blocked' ? 'Work is blocked' : 'Watch list'}</strong>
            <ul className="small">{reasons.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}</ul></div>
        </div>
      )}

      {p.status === 'quote' && (
        <div style={{ marginBottom: 16 }}>
          <AdviceCard advice={adviseJob(data, { customerId: p.customerId, service: p.service, budget: p.budget, start: p.startDate, target: p.targetDate, excludeId: p.id })}>
            <button className="primary sm" onClick={() => dispatch({ type: 'setProjectStatus', id: p.id, status: 'active' })}>Customer agreed: start the job</button>
            {customer && <SmsAction customer={customer} project={p} kind="approval" label="Ask the client to confirm" />}
          </AdviceCard>
        </div>
      )}

      <Card title="Phases" action={<span className="muted small">Select a phase to update it</span>}>
        <Journey phases={p.phases} selected={sel.key} onSelect={setSelKey} tone={health === 'late' ? 'bad' : health === 'blocked' || health === 'at_risk' ? 'warn' : health === 'hold' || health === 'quote' ? 'hold' : 'ok'} />
        <div className="row spread" style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <div>
            <div className="serif" style={{ fontSize: 24 }}>{phaseLabel(sel.key)}</div>
            <div className="small muted">{fmtDate(sel.start)} – {fmtDate(sel.end)} · {phasePercent(p, sel.key, data.tasks)}% of tasks done · {tasks.filter((t) => t.phaseKey === sel.key).length === 1 ? '1 task' : `${tasks.filter((t) => t.phaseKey === sel.key).length} tasks`}</div>
          </div>
          <div className="row">
            <Seg value={sel.status} onChange={(v) => dispatch({ type: 'setPhaseStatus', projectId: p.id, key: sel.key, status: v })}
              options={[{ value: 'todo', label: 'Not started' }, { value: 'in_progress', label: 'In progress' }, { value: 'done', label: 'Done' }]} />
          </div>
        </div>
        {sel.status !== 'todo' && (
          <div className="row" style={{ marginTop: 14 }}>
            {sel.approvedBy
              ? <Pill tone="green">Approved by {sel.approvedBy} on {fmtDate(sel.approvedOn!)}</Pill>
              : sel.status === 'done'
                ? <><Pill tone="amber">Waiting for approval</Pill><button className="sm primary" onClick={() => dispatch({ type: 'approvePhase', projectId: p.id, key: sel.key, by: ROLE_NAME[role] })}>Approve this stage</button>{customer && <SmsAction customer={customer} project={p} kind="approval" label="Ask the client (SMS)" />}</>
                : <span className="small muted">Approval is given once the stage is done.</span>}
          </div>
        )}
        <p className="small muted" style={{ margin: '12px 0 0' }}>{p.scope}</p>
      </Card>

      {p.status !== 'quote' && (() => {
        const it = p.intake;
        const missing = missingItems(p);
        const set = (patch: Partial<NonNullable<typeof it>>) => dispatch({ type: 'updateIntake', projectId: p.id, patch });
        return (
          <Card className="mt" title="Car intake" action={it ? (missing.length ? <Pill tone="orange">{missing.length} missing</Pill> : <Pill tone="green">Everything came in</Pill>) : <span className="muted small">Checked at drop-off</span>}>
            {!it ? (
              <div className="row spread"><span className="small muted">No drop-off checklist yet. Photos of the car go in with “Add real photo” above.</span><button className="sm primary" onClick={() => set({})}>Start checklist</button></div>
            ) : (
              <>
                <div className="checklist">
                  <label className="chk"><input type="checkbox" checked={it.orcr} onChange={(e) => set({ orcr: e.target.checked })} />OR/CR copy received</label>
                  {it.items.map((x, i) => (
                    <label key={x.label} className="chk"><input type="checkbox" checked={x.present} onChange={(e) => set({ items: it.items.map((y, j) => (j === i ? { ...y, present: e.target.checked } : y)) })} />{x.label}</label>
                  ))}
                </div>
                {missing.length > 0 && <div className="small over" style={{ marginTop: 10 }}>Missing: {missing.join(', ')}</div>}
                <form className="row" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const label = String(f.get('item')).trim(); if (label) set({ items: [...it.items, { label, present: true }] }); e.currentTarget.reset(); }}>
                  <input name="item" placeholder="Add an item to check (e.g. dashcam)" style={{ width: 280 }} /><button className="sm" type="submit">Add</button>
                </form>
                <label className="small muted" style={{ display: 'block', marginTop: 12 }}>Notes<input style={{ width: '100%', marginTop: 4 }} value={it.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} placeholder="Anything the owner said at drop-off" /></label>
              </>
            )}
          </Card>
        );
      })()}

      {p.status !== 'quote' && (() => {
        const qcDone = p.phases.find((x) => x.key === 'qc')?.status === 'done';
        const paid = isPaidInFull(p);
        const notified = data.messages.some((m) => m.projectId === p.id && m.kind === 'ready');
        const gp = p.gatepass ?? {};
        const checkDue = gp.outOn ? addDays(gp.outOn, CHECKUP_DAYS) : undefined;
        const steps: [string, boolean, string][] = [['Final quality check done', qcDone, 'Mark the quality-check stage done'], ['Paid in full', paid, `${moneyC(Math.max(0, p.budget - collected))} still to collect`], ['Client told it is ready', notified, 'Send the pickup text'], ['Gatepass issued', !!gp.issuedOn, 'Issue the gatepass'], ['Car out', !!gp.outOn, 'Mark the car out']];
        const origins = data.projects.filter((x) => x.customerId === p.customerId && x.id !== p.id && x.status !== 'quote');
        return (
          <Card className="mt" title="Release and follow-up" action={gp.outOn ? <Pill tone="green">Out on {fmtDate(gp.outOn)}</Pill> : <span className="muted small">Quality check, billing, pickup, gatepass</span>}>
            <div className="steps">
              {steps.map(([label, ok, hint]) => <div key={label} className={`rs ${ok ? 'ok' : ''}`}><span className="n">{ok ? <Icon name="check" size={13} /> : '·'}</span><span>{label}{!ok && <span className="small muted"> — {hint}</span>}</span></div>)}
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              {customer && !gp.outOn && <SmsAction customer={customer} project={p} kind="ready" label="Notify client: ready" primary={qcDone && paid && !notified} />}
              {customer && !paid && p.status !== 'delivered' && <SmsAction customer={customer} project={p} kind="payment" />}
              {!gp.issuedOn && <button className="sm" onClick={() => dispatch({ type: 'updateGatepass', projectId: p.id, patch: { issuedOn: today } })}>Issue gatepass</button>}
              {gp.issuedOn && !gp.outOn && <button className="sm primary" onClick={() => dispatch({ type: 'markOut', projectId: p.id, date: today })}>Mark car out</button>}
              {gp.issuedOn && !gp.outOn && <span className="small muted">Gatepass issued {fmtDate(gp.issuedOn)}</span>}
            </div>
            {gp.outOn && (
              <div className="row spread" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <div className="small">Check-up with the client {gp.checkupDone ? <b className="ok">done {fmtDate(gp.checkupDone)}</b> : <>due <b className={checkDue! < today ? 'over' : ''}>{fmtDate(checkDue!)}</b></>}</div>
                {!gp.checkupDone && <div className="row">{customer && <SmsAction customer={customer} project={p} kind="checkup" label="Remind client" />}<button className="sm" onClick={() => dispatch({ type: 'updateGatepass', projectId: p.id, patch: { checkupDone: today } })}>Mark check-up done</button></div>}
              </div>
            )}
            <div className="row" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <label className="small muted row" style={{ gap: 8 }}>Back job of
                <select value={p.backjobOf ?? ''} onChange={(e) => dispatch({ type: 'updateProject', id: p.id, patch: { backjobOf: e.target.value || undefined } })}>
                  <option value="">Not a back job</option>{origins.map((x) => <option key={x.id} value={x.id}>{x.code} · {carName(x)}</option>)}
                </select>
              </label>
            </div>
            {data.messages.some((m) => m.projectId === p.id) && <div style={{ marginTop: 14 }}><div className="eyebrow" style={{ marginBottom: 6 }}>Texts for this job (demo)</div><Outbox projectId={p.id} limit={4} /></div>}
          </Card>
        );
      })()}

      {p.service === 'ceramic' && (() => {
        const c = p.coating ?? {};
        const dates = coatingDates(p);
        const years = c.warrantyYears ?? PACKAGES.ceramic.find((x) => x.name === p.packageName)?.warrantyYears;
        const set = (patch: Partial<CoatingRecord>) => dispatch({ type: 'updateCoating', projectId: p.id, patch });
        const num = (v: string) => (v === '' ? undefined : Number(v));
        const dueIn = dates.maintenanceDue ? diffDays(today, dates.maintenanceDue) : null;
        return (
          <Card className="mt" title="Coating record" action={years ? <Pill tone="violet">{years}-year warranty</Pill> : <span className="muted small">Kept for the warranty</span>}>
            <div className="form f4c">
              <label>Product used<input value={c.product ?? ''} onChange={(e) => set({ product: e.target.value || undefined })} placeholder="9H ceramic coating" /></label>
              <label>Batch number<input value={c.batch ?? ''} onChange={(e) => set({ batch: e.target.value || undefined })} placeholder="From the bottle" /></label>
              <label>Gloss before (GU)<input type="number" min="0" step="0.1" value={c.glossBefore ?? ''} onChange={(e) => set({ glossBefore: num(e.target.value) })} /></label>
              <label>Gloss after (GU)<input type="number" min="0" step="0.1" value={c.glossAfter ?? ''} onChange={(e) => set({ glossAfter: num(e.target.value) })} /></label>
              <label>Paint thickness (µm)<input type="number" min="0" value={c.thicknessMicrons ?? ''} onChange={(e) => set({ thicknessMicrons: num(e.target.value) })} /></label>
              <label>Cure started<input type="date" value={c.cureStarted ?? ''} onChange={(e) => set({ cureStarted: e.target.value || undefined })} /></label>
              <label>Do not wash until<input type="date" value={dates.washAfter ?? ''} onChange={(e) => set({ washAfter: e.target.value || undefined })} /></label>
              <label>Handover date<input type="date" value={c.handoverDate ?? ''} onChange={(e) => set({ handoverDate: e.target.value || undefined, warrantyYears: c.warrantyYears ?? years })} /></label>
            </div>
            <div className="row spread" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <div className="small">
                {c.glossBefore !== undefined && c.glossAfter !== undefined && <span style={{ marginRight: 18 }}>Gloss <b className="ok">+{Math.round((c.glossAfter - c.glossBefore) * 10) / 10} GU</b></span>}
                {dates.warrantyEnds ? <span style={{ marginRight: 18 }}>Warranty ends <b>{fmtDate(dates.warrantyEnds)} {dates.warrantyEnds.slice(0, 4)}</b></span> : <span className="muted" style={{ marginRight: 18 }}>Warranty starts at handover</span>}
                {dates.maintenanceDue && <span>Free check due <b className={dueIn !== null && dueIn < 0 && !c.maintenanceDone ? 'over' : ''}>{fmtDate(dates.maintenanceDue)}</b>{c.maintenanceDone ? <span className="ok"> · done</span> : dueIn !== null && <span className="muted"> · {dueIn < 0 ? `${-dueIn} days overdue` : dueIn === 0 ? 'today' : `in ${dueIn} days`}</span>}</span>}
              </div>
              <div className="row" style={{ gap: 8 }}>
                {!c.cureStarted && <button className="sm" onClick={() => set({ cureStarted: today })}>Start cure today</button>}
                {!c.handoverDate && <button className="sm" onClick={() => set({ handoverDate: today, warrantyYears: c.warrantyYears ?? years })}>Record handover today</button>}
                {c.handoverDate && !c.maintenanceDone && <button className="sm" onClick={() => set({ maintenanceDone: true })}>Mark check done</button>}
              </div>
            </div>
          </Card>
        );
      })()}

      <div className="tabs">
        {([['work', `Work (${tasks.length})`], ['parts', `Parts & sublets (${parts.length})`], ['billing', `Billing (${p.payments.length})`], ['log', `Progress log (${updates.length})`]] as [Tab, string][]).filter(([k]) => k !== 'billing' || role !== 'leader').map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'work' && (
        <Card flush>
          <table>
            <thead><tr><th>Task</th><th>Mechanic</th><th>Date</th><th>Hrs</th><th>Waiting on</th><th>Status</th><th /></tr></thead>
            <tbody>
              {tasks.map((t) => {
                const b = taskBlocker(t, data.parts);
                return (
                  <tr key={t.id}>
                    <td><div style={{ opacity: t.status === 'done' ? 0.55 : 1 }}>{t.title}</div><div className="small muted">{phaseLabel(t.phaseKey)}</div></td>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}><Avatar m={data.mechanics.find((m) => m.id === t.mechanicId)} size={22} />
                      <select className="inline" value={t.mechanicId ?? ''} onChange={(e) => patch(t.id, { mechanicId: e.target.value || undefined })}><option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div></td>
                    <td><input type="date" className="inline" value={t.date} onChange={(e) => e.target.value && patch(t.id, { date: e.target.value })} /></td>
                    <td><input type="number" className="inline" min="0" step="0.5" style={{ width: 84 }} value={t.status === 'done' ? t.actualHours : t.estHours} onChange={(e) => patch(t.id, t.status === 'done' ? { actualHours: Number(e.target.value) } : { estHours: Number(e.target.value) })} /></td>
                    <td style={{ maxWidth: 210 }}>
                      <select className="inline" value={t.partId ?? ''} onChange={(e) => patch(t.id, { partId: e.target.value || undefined })}><option value="">Nothing</option>{parts.filter((x) => !isPartIn(x) || x.id === t.partId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                      {b && <div className="small" style={{ marginTop: 3 }}><Pill tone="orange">{b.eta ? `ETA ${fmtDate(b.eta)}` : 'Blocked'}</Pill></div>}
                    </td>
                    <td>
                      <select className="inline" value={t.status} onChange={(e) => patch(t.id, { status: e.target.value as TaskStatus })}>
                        <option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option>
                      </select>
                      {t.status === 'blocked' && !t.partId && (
                        <div className="row" style={{ marginTop: 4, flexWrap: 'nowrap' }}>
                          <select className="inline" value={t.blockReason ?? 'other'} onChange={(e) => patch(t.id, { blockReason: e.target.value as BlockReason })}><option value="customer">Customer</option><option value="vendor">Vendor</option><option value="other">Other</option></select>
                          <input className="inline" style={{ fontSize: 12, padding: '3px 6px', width: 130 }} placeholder="Why?" value={t.blockNote ?? ''} onChange={(e) => patch(t.id, { blockNote: e.target.value })} />
                        </div>
                      )}
                    </td>
                    <td><button className="sm ghost" title="Delete task" onClick={() => dispatch({ type: 'deleteTask', id: t.id })}>✕</button></td>
                  </tr>
                );
              })}
              {!tasks.length && <tr><td colSpan={7} className="empty">No tasks yet.</td></tr>}
            </tbody>
          </table>
          <form className="row addbar" onSubmit={addTask}>
            <input name="title" placeholder="New task" required style={{ flex: 1, minWidth: 160 }} />
            <select name="phase">{p.phases.map((ph) => <option key={ph.key} value={ph.key}>{phaseShort(ph.key)}</option>)}</select>
            <select name="mechanic"><option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <select name="part"><option value="">No part needed</option>{parts.filter((x) => !isPartIn(x)).map((x) => <option key={x.id} value={x.id}>Waits on: {x.name}</option>)}</select>
            <input name="date" type="date" defaultValue={today} required />
            <input name="hours" type="number" min="0.5" step="0.5" defaultValue={4} style={{ width: 64 }} />
            <button className="primary" type="submit">Add task</button>
          </form>
        </Card>
      )}

      {tab === 'parts' && (
        <Card flush>
          <table>
            <thead><tr><th>Item</th><th>Supplier / PO</th><th>Needed by</th><th>ETA</th><th>Cost</th><th>Risk</th><th>Status</th></tr></thead>
            <tbody>
              {parts.map((x) => {
                const gap = x.eta ? diffDays(x.neededBy, x.eta) : null;
                return (
                  <tr key={x.id}>
                    <td><strong>{x.name}</strong><div className="small muted">{x.kind === 'sublet' ? 'Sublet job' : 'Part'}{x.note ? ` · ${x.note}` : ''}</div></td>
                    <td>{x.supplier}<div className="small muted">{x.po ?? '—'}</div></td>
                    <td className="num">{fmtDate(x.neededBy)}</td>
                    <td><input type="date" className="inline" value={x.eta ?? ''} onChange={(e) => dispatch({ type: 'updatePart', id: x.id, patch: { eta: e.target.value || undefined } })} />{gap !== null && gap > 0 && !isPartIn(x) && <div className="small over">+{gap}d late</div>}</td>
                    <td className="num">{money(x.cost)}</td>
                    <td><RiskPill r={partRisk(x, today)} /></td>
                    <td><PartStatusPill part={x} /><div><select className="inline" value={x.status} onChange={(e) => dispatch({ type: 'setPartStatus', id: x.id, status: e.target.value as PartStatus })} style={{ marginTop: 4 }}>{PART_FLOW.map((s) => <option key={s} value={s}>{partStatusLabel(x.kind, s)}</option>)}</select></div></td>
                  </tr>
                );
              })}
              {!parts.length && <tr><td colSpan={7} className="empty">No parts or sublet jobs yet.</td></tr>}
            </tbody>
          </table>
          <form className="row addbar" onSubmit={addPart}>
            <input name="name" placeholder="Part or sublet job" required style={{ flex: 1, minWidth: 160 }} />
            <select name="kind"><option value="part">Part</option><option value="sublet">Sublet job</option></select>
            <input name="supplier" placeholder="Supplier / vendor" /><input name="po" placeholder="PO #" style={{ width: 90 }} />
            <label className="row small muted">Needed by<input name="needed" type="date" defaultValue={today} required /></label>
            <input name="cost" type="number" min="0" placeholder="Cost" style={{ width: 90 }} />
            <button className="primary" type="submit">Add</button>
          </form>
        </Card>
      )}

      {tab === 'billing' && role !== 'leader' && (
        <Card flush>
          <div className="grid g4" style={{ padding: 18 }}>
            <div><div className="eyebrow">Contract</div><div className="sv"><span>{money(p.budget)}</span></div></div>
            <div><div className="eyebrow">Collected</div><div className="sv"><span>{money(collected)}</span></div><div className="small muted">{p.budget ? Math.round((collected / p.budget) * 100) : 0}% of contract</div></div>
            <div><div className="eyebrow">Balance due</div><div className="sv"><span>{money(Math.max(0, p.budget - collected))}</span></div></div>
            <div><div className="eyebrow">Earned by progress</div><div className="sv"><span>{money(earned)}</span></div><div className={`small ${earned > collected ? 'warn' : 'muted'}`}>{earned > collected ? `${money(earned - collected)} ready to bill` : 'Paid ahead of the work'}</div></div>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Note</th><th style={{ textAlign: 'right' }}>Amount</th><th /></tr></thead>
            <tbody>
              {[...p.payments].sort((a, b) => b.date.localeCompare(a.date)).map((x) => (
                <tr key={x.id}><td className="num">{fmtDate(x.date)}</td><td>{x.note ?? '—'}</td><td className="num" style={{ textAlign: 'right' }}>{money(x.amount)}</td><td><button className="sm ghost" title="Remove payment" onClick={() => dispatch({ type: 'removePayment', projectId: p.id, id: x.id })}>✕</button></td></tr>
              ))}
              {!p.payments.length && <tr><td colSpan={4} className="empty">No payments recorded yet.</td></tr>}
            </tbody>
          </table>
          <form className="row addbar" onSubmit={addPayment}>
            <input name="amount" type="number" min="1" step="1" placeholder="Amount (₱)" required style={{ width: 150 }} />
            <input name="date" type="date" defaultValue={today} required />
            <input name="note" placeholder="Deposit, progress payment…" style={{ flex: 1, minWidth: 180 }} />
            <button className="primary" type="submit">Record payment</button>
          </form>
        </Card>
      )}

      {tab === 'log' && (
        <Card>
          <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) { dispatch({ type: 'addUpdate', projectId: p.id, text: note.trim(), phaseKey: notePhase || undefined, author: 'Alex' }); setNote(''); } }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Post an update for this build — what was done, what's holding it up, what the customer was told…" />
            <div className="row" style={{ marginTop: 8 }}>
              <select value={notePhase} onChange={(e) => setNotePhase(e.target.value as PhaseKey | '')}><option value="">General</option>{p.phases.map((ph) => <option key={ph.key} value={ph.key}>{phaseLabel(ph.key)}</option>)}</select>
              <button className="primary" type="submit">Post update</button>
            </div>
          </form>
          <div style={{ marginTop: 18 }}>
            {updates.map((u) => <div key={u.id} className="timeline-e"><div className="small muted">{fmtDate(u.date)} · {u.author}{u.phaseKey && ` · ${phaseLabel(u.phaseKey)}`}</div><div>{u.text}</div></div>)}
            {!updates.length && <div className="empty">No updates yet.</div>}
          </div>
        </Card>
      )}
    </>
  );
}
