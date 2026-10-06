// Maintenance: preventive maintenance of vehicles and operating equipment (plans, schedule, calendar, work records, parts).
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, Card, Empty, Field, Modal, PageHead, Stat, Tabs, ask, attempt, toast } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { PartsEditor, PRIORITIES, TASK_TYPES, TaskForm, blankTask } from '@/components/maint/TaskEditor';
import { MCATS, OPEN, dueState, freqWords, maintStats, maintTone, mcatOf, profileOf, readingFor, stockShort, type DueState } from '@/lib/maintenance-core';
import * as M from '@/lib/maintenance';
import { addDays, fmtDate, money, moneyShort, monthEnd, monthStart, today } from '@/lib/util';
import type { Asset, DB, MaintCategory, MaintPart, MaintPlan, MaintPriority, MaintRecord, MaintTaskDef, MaintTemplate } from '@/lib/types';

type Tab = 'overview' | 'schedule' | 'assets' | 'templates';
const live = <X extends { deleted_at?: string | null }>(a: X[]) => a.filter((x) => !x.deleted_at);
const empName = (db: DB, id?: string) => (id ? db.employees.find((e) => e.id === id)?.full_name ?? '—' : '—');
const assetName = (db: DB, id: string) => { const a = db.assets.find((x) => x.id === id); return a ? `${a.code} · ${a.name}` : '—'; };
/** Run an action that may throw a rule error and show the reason. */
const run = (fn: () => unknown, ok?: string) => attempt(() => { const r = fn(); return r === undefined ? true : r; }, ok);

export default function Maintenance() {
  const { db, can } = useAuth();
  const manage = can('maintenance.manage'); const request = can('maintenance.request');
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => setSp({ tab: t }, { replace: true });
  const [open, setOpen] = useState<string | null>(null);
  const [asset, setAsset] = useState<string | null>(null);
  const [adding, setAdding] = useState<'schedule' | 'request' | null>(null);
  const [tpl, setTpl] = useState<MaintTemplate | 'new' | null>(null);
  const T = today();
  const st = useMemo(() => maintStats(db, T), [db, T]);
  const pendingReq = live(db.maint_records).filter((r) => r.status === 'Requested');
  const tabs: { id: Tab; label: string; count?: number }[] = [{ id: 'overview', label: 'Overview' }, { id: 'schedule', label: 'Schedule', count: st.open.length }, { id: 'assets', label: 'Assets' }, ...(manage ? [{ id: 'templates' as Tab, label: 'Checklists' }] : [])];
  return (
    <>
      <PageHead title="Maintenance" sub="Preventive maintenance for vehicles and operating equipment — schedules, checklists, parts and history.">
        {request && <button className="btn" onClick={() => setAdding('request')}><span aria-hidden>⚠</span> Report an issue</button>}
        {manage && <button className="btn primary" onClick={() => setAdding('schedule')}>+ Schedule maintenance</button>}
      </PageHead>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview st={st} pending={pendingReq} manage={manage} openRec={setOpen} openAsset={setAsset} />}
      {tab === 'schedule' && <Schedule openRec={setOpen} />}
      {tab === 'assets' && <Assets openAsset={setAsset} manage={manage} />}
      {tab === 'templates' && manage && <Templates onEdit={setTpl} />}
      {open && <RecordModal id={open} onClose={() => setOpen(null)} />}
      {asset && <AssetModal assetId={asset} onClose={() => setAsset(null)} openRec={(id) => { setAsset(null); setOpen(id); }} />}
      {adding && <NewRecord mode={adding} onClose={() => setAdding(null)} />}
      {tpl && <TemplateModal initial={tpl === 'new' ? undefined : tpl} onClose={() => setTpl(null)} />}
    </>
  );
}

/* ================= overview ================= */
function Overview({ st, pending, manage, openRec, openAsset }: { st: ReturnType<typeof maintStats>; pending: MaintRecord[]; manage: boolean; openRec: (id: string) => void; openAsset: (id: string) => void }) {
  const { db } = useAuth(); const T = today();
  const tile = (k: string, v: React.ReactNode, s?: string, tone?: 'warn' | 'bad' | 'good' | 'navy') => <Stat k={k} v={v} s={s} tone={tone} />;
  const urgent = [...new Map([...st.overdue, ...st.urgent].map((r) => [r.id, r])).values()];
  return (
    <>
      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        {tile('Due this week', st.dueWeek.length, 'scheduled in the next days', st.dueWeek.length ? 'warn' : undefined)}
        {tile('Overdue', st.overdue.length, st.overdue.length ? 'needs attention now' : 'nothing overdue', st.overdue.length ? 'bad' : 'good')}
        {tile('Under maintenance', st.underMaintenance.length, st.underMaintenance.map((a) => a.code).join(', ') || 'none')}
        {tile('Out of service', st.outOfService.length, st.outOfService.map((a) => a.code).join(', ') || 'none', st.outOfService.length ? 'bad' : undefined)}
      </div>
      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        {tile('Estimated cost this month', moneyShort(st.estMonth), `${moneyShort(st.actualMonth)} actual so far`, 'navy')}
        {tile('Parts needed / awaiting purchase', st.partsAwaiting.length, st.partsAwaiting.slice(0, 2).map((x) => x.p.name).join(', ') || 'none', st.partsAwaiting.length ? 'warn' : undefined)}
        {tile('Requests to approve', pending.length, pending.length ? 'reported by Team Leaders' : 'none', pending.length ? 'warn' : undefined)}
        {tile('Renewals (60 days)', st.renewals.length, st.renewals[0] ? `${st.renewals[0].asset.code} ${st.renewals[0].what.toLowerCase()} ${st.renewals[0].days < 0 ? 'expired' : `in ${st.renewals[0].days}d`}` : 'none', st.renewals.some((r) => r.days < 0) ? 'bad' : undefined)}
      </div>
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <Card title="Overdue and urgent" flush>
          <ul className="list">{urgent.slice(0, 8).map((r) => <li key={r.id}><div><a href="#/maintenance" onClick={(e) => { e.preventDefault(); openRec(r.id); }}><b>{r.title}</b></a><div className="small muted">{r.due_date ? `due ${fmtDate(r.due_date)} · ` : ''}{r.priority}{r.status === 'In Progress' ? ' · in progress' : ''}</div></div><Badge tone={maintTone(dueState(db, r, T))}>{dueState(db, r, T)}</Badge></li>)}{!urgent.length && <li className="muted">Nothing overdue or urgent.</li>}</ul>
        </Card>
        <Card title={`Reported issues awaiting approval (${pending.length})`} flush>
          <ul className="list">{pending.map((r) => <li key={r.id}><div><a href="#/maintenance" onClick={(e) => { e.preventDefault(); openRec(r.id); }}><b>{assetName(db, r.asset_id)}</b></a><div className="small muted">{r.request_note} · {empName(db, r.requested_by)} · {r.priority}</div></div>{manage ? <button className="btn sm primary" onClick={() => openRec(r.id)}>Review</button> : <Badge tone="blue">Waiting</Badge>}</li>)}{!pending.length && <li className="muted">No requests waiting.</li>}</ul>
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Parts needed or awaiting purchase" flush>
          <ul className="list">{st.partsAwaiting.slice(0, 8).map(({ r, p }) => <li key={r.id + p.id}><div><b>{p.name}</b> × {p.qty}<div className="small muted">{assetName(db, r.asset_id)} · {r.number}{p.required_by ? ` · by ${fmtDate(p.required_by)}` : ''}{p.supplier ? ` · ${p.supplier}` : ''}</div></div><Badge tone={p.status === 'Needed' ? 'amber' : 'blue'}>{p.status}</Badge></li>)}{!st.partsAwaiting.length && <li className="muted">No parts waiting.</li>}</ul>
        </Card>
        <Card title="Vehicle registration and insurance" flush>
          <ul className="list">{st.renewals.map((x) => <li key={x.asset.id + x.what}><div><a href="#/maintenance" onClick={(e) => { e.preventDefault(); openAsset(x.asset.id); }}><b>{x.asset.code} · {x.asset.name}</b></a><div className="small muted">{x.what} due {fmtDate(x.due)}</div></div><Badge tone={x.days < 0 ? 'red' : x.days <= 14 ? 'amber' : 'gray'}>{x.days < 0 ? `expired ${-x.days}d ago` : `in ${x.days} days`}</Badge></li>)}{!st.renewals.length && <li className="muted">No renewals in the next 60 days.</li>}</ul>
        </Card>
      </div>
    </>
  );
}

/* ================= schedule: list + calendar ================= */
const STATE_FILTERS = ['Active', 'Overdue', 'Due Soon', 'Scheduled', 'In Progress', 'Requested', 'Deferred', 'Completed', 'Cancelled', 'All'] as const;
function Schedule({ openRec }: { openRec: (id: string) => void }) {
  const { db } = useAuth(); const T = today();
  const [view, setView] = useState<'list' | 'cal'>('list');
  const [state, setState] = useState<(typeof STATE_FILTERS)[number]>('Active');
  const [mcat, setMcat] = useState(''); const [assetId, setAssetId] = useState(''); const [who, setWho] = useState(''); const [kind, setKind] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [month, setMonth] = useState(monthStart(T));
  const rows = useMemo(() => live(db.maint_records).map((r) => ({ r, st: dueState(db, r, T), a: db.assets.find((x) => x.id === r.asset_id), cat: profileOf(db, r.asset_id)?.mcategory ?? (db.assets.find((x) => x.id === r.asset_id) ? mcatOf(db.assets.find((x) => x.id === r.asset_id)!) : 'Other') })).filter(({ r, st: s, cat }) => {
    if (state === 'Active' ? !OPEN.includes(r.status) : state !== 'All' && s !== state && r.status !== state) return false;
    if (mcat && cat !== mcat) return false; if (assetId && r.asset_id !== assetId) return false; if (who && r.responsible_id !== who) return false;
    if (kind === 'vehicle' && cat !== 'Vehicle') return false; if (kind === 'equipment' && cat === 'Vehicle') return false;
    const d = r.due_date ?? r.completed_at?.slice(0, 10) ?? ''; if (from && d < from) return false; if (to && d > to) return false; return true;
  }), [db, T, state, mcat, assetId, who, kind, from, to]);
  const tracked = live(db.maint_profiles).map((p) => db.assets.find((a) => a.id === p.asset_id)).filter((a): a is Asset => !!a);
  return (
    <>
      <div className="filterbar no-print">
        <Field label="Show"><select value={state} onChange={(e) => setState(e.target.value as typeof state)}>{STATE_FILTERS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Vehicles / equipment"><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All</option><option value="vehicle">Vehicles</option><option value="equipment">Equipment</option></select></Field>
        <Field label="Category"><select value={mcat} onChange={(e) => setMcat(e.target.value)}><option value="">All categories</option>{MCATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Asset"><select value={assetId} onChange={(e) => setAssetId(e.target.value)}><option value="">All assets</option>{tracked.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
        <Field label="Responsible"><select value={who} onChange={(e) => setWho(e.target.value)}><option value="">Anyone</option>{live(db.employees).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
        <Field label="Due from"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Due to"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="seg" role="group" aria-label="View"><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button><button className={view === 'cal' ? 'on' : ''} onClick={() => setView('cal')}>Calendar</button></div>
      </div>
      {view === 'list' ? (
        <Card flush><DataTable rows={rows} rowKey={(x) => x.r.id} exportTitle="Maintenance schedule" onRow={(x) => openRec(x.r.id)} initialSort={{ key: 'due', dir: 1 }} empty="No maintenance matches these filters." cols={[
          { key: 'due', header: 'Due', value: (x) => x.r.due_date ?? '9999', render: (x) => (x.r.due_date ? fmtDate(x.r.due_date) : '—') },
          { key: 'st', header: 'Status', value: (x) => x.st, render: (x) => <Badge tone={maintTone(x.st)}>{x.st}</Badge> },
          { key: 'asset', header: 'Asset', value: (x) => (x.a ? `${x.a.code} ${x.a.name}` : '') },
          { key: 'task', header: 'Task', value: (x) => x.r.title.replace(/^[^:]*: /, ''), render: (x) => <span><b>{x.r.title.replace(/^[^:]*: /, '')}</b><div className="small muted">{x.r.number} · {x.r.task_type}</div></span> },
          { key: 'pri', header: 'Priority', value: (x) => x.r.priority, render: (x) => <Badge tone={x.r.priority === 'Urgent' ? 'red' : x.r.priority === 'High' ? 'amber' : 'gray'}>{x.r.priority}</Badge> },
          { key: 'who', header: 'Responsible', value: (x) => empName(db, x.r.responsible_id) },
          { key: 'cost', header: 'Cost', num: true, type: 'money', value: (x) => x.r.actual_cost ?? x.r.est_cost, render: (x) => (x.r.status === 'Completed' ? money(x.r.actual_cost ?? 0) : x.r.est_cost ? `est. ${money(x.r.est_cost)}` : '—') },
        ]} /></Card>
      ) : <MCalendar rows={rows} month={month} setMonth={setMonth} openRec={openRec} />}
    </>
  );
}
function MCalendar({ rows, month, setMonth, openRec }: { rows: { r: MaintRecord; st: DueState }[]; month: string; setMonth: (m: string) => void; openRec: (id: string) => void }) {
  const T = today(); const first = month; const end = monthEnd(month);
  const startPad = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;      // Monday first
  const cells: string[] = []; for (let i = -startPad; i < 42 - startPad; i++) cells.push(addDays(first, i));
  const by = new Map<string, typeof rows>(); for (const x of rows) { const d = x.r.status === 'Completed' ? x.r.completed_at?.slice(0, 10) : x.r.due_date; if (d) by.set(d, [...(by.get(d) ?? []), x]); }
  return (
    <Card title={new Date(first + 'T00:00:00Z').toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })} actions={<div className="row"><button className="btn sm" onClick={() => setMonth(monthStart(addDays(first, -1)))}>‹</button><button className="btn sm" onClick={() => setMonth(monthStart(T))}>Today</button><button className="btn sm" onClick={() => setMonth(addDays(end, 1))}>›</button></div>}>
      <div className="mcal">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="dh">{d}</div>)}
        {cells.map((d) => <div key={d} className={`cell ${d < first || d > end ? 'dim' : ''} ${d === T ? 'today' : ''}`}><span className="n">{+d.slice(8)}</span>
          {(by.get(d) ?? []).slice(0, 3).map((x) => <button key={x.r.id} className={`mchip ${x.st.replace(' ', '')}`} onClick={() => openRec(x.r.id)} title={x.r.title}>{x.r.title}</button>)}
          {(by.get(d)?.length ?? 0) > 3 && <span className="small muted">+{by.get(d)!.length - 3} more</span>}</div>)}</div>
    </Card>
  );
}

/* ================= assets ================= */
function Assets({ openAsset, manage }: { openAsset: (id: string) => void; manage: boolean }) {
  const { db } = useAuth(); const T = today();
  const [showAll, setShowAll] = useState(false);
  const assets = live(db.assets).filter((a) => showAll || profileOf(db, a.id));
  return (
    <Card flush actions={manage ? <label className="check small"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Also show assets not yet tracked</label> : undefined}>
      <DataTable rows={assets} rowKey={(a) => a.id} exportTitle="Maintenance assets" onRow={(a) => openAsset(a.id)} cols={[
        { key: 'a', header: 'Asset', value: (a) => `${a.code} ${a.name}`, render: (a) => <span><b>{a.name}</b><div className="small muted">{a.code}{a.brand ? ` · ${a.brand} ${a.model}` : ''}</div></span> },
        { key: 'c', header: 'Category', value: (a) => profileOf(db, a.id)?.mcategory ?? 'Not tracked' },
        { key: 's', header: 'Status', value: (a) => a.status, render: (a) => <Badge tone={a.status === 'Available' ? 'green' : ['Under Maintenance', 'In Use'].includes(a.status) ? 'teal' : a.status === 'Due for Maintenance' ? 'amber' : 'red'}>{a.status}</Badge> },
        { key: 'who', header: 'Responsible', value: (a) => empName(db, profileOf(db, a.id)?.responsible_id) },
        { key: 'last', header: 'Last maintained', value: (a) => a.last_maintenance ?? '', render: (a) => (a.last_maintenance ? fmtDate(a.last_maintenance) : '—') },
        { key: 'next', header: 'Next due', value: (a) => nextDue(db, a.id)?.date ?? '9999', render: (a) => { const n = nextDue(db, a.id); return n ? <span>{n.date ? fmtDate(n.date) : `at ${n.reading}`}{n.date && n.date < T && <Badge tone="red"> overdue</Badge>}</span> : '—'; } },
        { key: 'rd', header: 'Reading', value: (a) => profileOf(db, a.id)?.last_reading ?? 0, render: (a) => { const p = profileOf(db, a.id); return p?.last_reading !== undefined ? `${p.last_reading.toLocaleString()} ${p.reading_unit ?? ''}` : '—'; } },
      ]} />
    </Card>
  );
}
function nextDue(db: DB, assetId: string): { date?: string; reading?: number } | undefined {
  const plans = live(db.maint_plans).filter((p) => p.asset_id === assetId && p.active);
  const d = plans.map((p) => p.next_due).filter((x): x is string => !!x).sort()[0];
  if (d) return { date: d };
  const r = plans.map((p) => p.next_due_reading).filter((x): x is number => x !== undefined).sort((a, b) => a - b)[0];
  return r !== undefined ? { reading: r } : undefined;
}

function AssetModal({ assetId, onClose, openRec }: { assetId: string; onClose: () => void; openRec: (id: string) => void }) {
  const { db, can } = useAuth(); const manage = can('maintenance.manage'); const T = today();
  const a = db.assets.find((x) => x.id === assetId)!; const prof = profileOf(db, assetId);
  const [f, setF] = useState({ mcategory: (prof?.mcategory ?? mcatOf(a)) as MaintCategory, assigned_to: prof?.assigned_to ?? a.location ?? '', responsible_id: prof?.responsible_id ?? '', provider: prof?.provider ?? '', notes: prof?.notes ?? '', reading_unit: (prof?.reading_unit ?? (a.meter_unit === 'km' ? 'km' : 'hours')) as 'km' | 'hours', last_reading: prof?.last_reading ?? a.meter_reading ?? undefined, registration_due: prof?.registration_due ?? '', insurance_due: prof?.insurance_due ?? '' });
  const [task, setTask] = useState<(MaintTaskDef & { id?: string; responsible_id?: string }) | null>(null);
  const plans = live(db.maint_plans).filter((p) => p.asset_id === assetId); const recs = live(db.maint_records).filter((r) => r.asset_id === assetId).sort((x, y) => (y.completed_at ?? y.due_date ?? '').localeCompare(x.completed_at ?? x.due_date ?? ''));
  const templates = live(db.maint_templates).filter((t) => t.mcategory === f.mcategory || t.mcategory === mcatOf(a));
  const save = () => run(() => M.saveProfile(assetId, { mcategory: f.mcategory, assigned_to: f.assigned_to.trim() || undefined, responsible_id: f.responsible_id || undefined, provider: f.provider.trim() || undefined, notes: f.notes.trim() || undefined, reading_unit: f.reading_unit, last_reading: f.last_reading, registration_due: f.registration_due || undefined, insurance_due: f.insurance_due || undefined }), 'Maintenance profile saved');
  const dis = !manage;
  return (
    <Modal title={`${a.name} · ${a.code}`} size="xl" onClose={onClose} footer={manage ? <><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={save}>Save profile</button></> : <button className="btn" onClick={onClose}>Close</button>}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}><Badge tone={a.status === 'Available' ? 'green' : 'amber'}>{a.status}</Badge><span className="small muted">{[a.brand, a.model, a.serial && `S/N ${a.serial}`, a.purchase_date && `acquired ${fmtDate(a.purchase_date)}`].filter(Boolean).join(' · ')}</span>
        {manage && <span className="row" style={{ gap: 6, marginLeft: 'auto' }}>
          {a.status !== 'Out of Service' && a.status !== 'Retired' && <button className="btn sm danger" onClick={async () => { const r = await ask(`Mark ${a.name} Out of Service? It cannot be assigned to jobs until it is put back.`, 'Reason', { okLabel: 'Out of Service' }); if (r) run(() => M.setAssetState(assetId, 'Out of Service', r), 'Marked Out of Service'); }}>Out of Service</button>}
          {['Out of Service', 'Retired'].includes(a.status) && <button className="btn sm" onClick={async () => { const r = await ask(`Put ${a.name} back in service?`, 'Reason / note', { okLabel: 'Back in service' }); if (r) run(() => M.setAssetState(assetId, 'Available', r), 'Available again'); }}>Back in service</button>}
          {a.status !== 'Retired' && <button className="btn sm" onClick={async () => { const r = await ask(`Retire ${a.name}? Its history is kept.`, 'Reason', { okLabel: 'Retire' }); if (r) run(() => M.setAssetState(assetId, 'Retired', r), 'Retired'); }}>Retire</button>}
        </span>}</div>
      <div className="form-grid">
        <Field label="Category"><select disabled={dis} value={f.mcategory} onChange={(e) => setF({ ...f, mcategory: e.target.value as MaintCategory })}>{MCATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Assigned vehicle / team / storage"><input disabled={dis} value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })} /></Field>
        <Field label="Person responsible"><select disabled={dis} value={f.responsible_id} onChange={(e) => setF({ ...f, responsible_id: e.target.value })}><option value="">— none —</option>{live(db.employees).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
        <Field label="Service provider / supplier"><input disabled={dis} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} /></Field>
        <Field label={`Current reading (${f.reading_unit === 'km' ? 'km' : 'operating hours'})`} hint={prof?.reading_at ? `updated ${fmtDate(prof.reading_at)}` : undefined}><div className="row" style={{ gap: 6 }}><input disabled={dis} type="number" min={0} step="any" value={f.last_reading ?? ''} onChange={(e) => setF({ ...f, last_reading: e.target.value === '' ? undefined : Number(e.target.value) })} /><select disabled={dis} style={{ width: 110 }} value={f.reading_unit} onChange={(e) => setF({ ...f, reading_unit: e.target.value as 'km' | 'hours' })}><option value="km">km</option><option value="hours">hours</option></select></div></Field>
        <Field label="Maintenance notes"><input disabled={dis} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {f.mcategory === 'Vehicle' && <><Field label="Registration due"><input disabled={dis} type="date" value={f.registration_due} onChange={(e) => setF({ ...f, registration_due: e.target.value })} /></Field><Field label="Insurance due"><input disabled={dis} type="date" value={f.insurance_due} onChange={(e) => setF({ ...f, insurance_due: e.target.value })} /></Field></>}
      </div>
      <h3 style={{ margin: '16px 0 6px' }}>Recurring maintenance tasks</h3>
      {manage && <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}><button className="btn sm" onClick={() => setTask(blankTask())}>+ Add task</button>
        {templates.map((t) => <button key={t.id} className="btn sm" onClick={() => { if (!prof) run(() => M.saveProfile(assetId, { mcategory: f.mcategory })); run(() => `${M.applyTemplate(assetId, t.id)} task(s) added`) && toast(`Checklist “${t.name}” applied`, 'ok'); }}>Add from “{t.name}”</button>)}</div>}
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Task</th><th>Frequency</th><th>Last done</th><th>Next due</th><th>Cost</th><th /></tr></thead><tbody>
        {plans.map((p) => <tr key={p.id}><td><b>{p.task_name}</b><div className="small muted">{p.task_type} · {p.priority}</div></td><td>{freqWords(p)}</td><td>{p.last_done ? fmtDate(p.last_done) : '—'}</td><td>{p.next_due ? <span style={{ color: p.next_due < T ? 'var(--red)' : undefined }}>{fmtDate(p.next_due)}</span> : p.next_due_reading !== undefined ? `at ${p.next_due_reading}` : '—'}{!p.active && <Badge> paused</Badge>}</td><td>{p.est_cost ? money(p.est_cost) : '—'}</td>
          <td>{manage && <span className="row"><button className="btn sm" onClick={() => setTask({ ...p })}>Edit</button><button className="btn sm danger" onClick={async () => { if (await ask(`Remove “${p.task_name}” from this asset? Past records are kept.`, 'Reason', { okLabel: 'Remove' })) run(() => M.removePlan(p.id), 'Task removed'); }}>Remove</button></span>}</td></tr>)}
        {!plans.length && <tr><td colSpan={6} className="muted">No recurring tasks yet.{manage ? ' Add one, or apply a checklist.' : ''}</td></tr>}</tbody></table></div>
      <h3 style={{ margin: '16px 0 6px' }}>History</h3>
      <ul className="list">{recs.slice(0, 12).map((r) => <li key={r.id}><div><a href="#/maintenance" onClick={(e) => { e.preventDefault(); openRec(r.id); }}><b>{r.title.replace(/^[^:]*: /, '')}</b></a><div className="small muted">{r.number} · {r.status === 'Completed' ? `done ${fmtDate(r.completed_at!)} · ${money(r.actual_cost ?? 0)}` : r.due_date ? `due ${fmtDate(r.due_date)}` : ''}</div></div><Badge tone={maintTone(dueState(db, r, T))}>{dueState(db, r, T)}</Badge></li>)}{!recs.length && <li className="muted">No maintenance recorded yet.</li>}</ul>
      {task && <Modal title={task.id ? 'Edit task' : 'New task'} size="wide" onClose={() => setTask(null)} footer={<><button className="btn" onClick={() => setTask(null)}>Cancel</button><button className="btn primary" onClick={() => { if (run(() => M.savePlan({ ...task, asset_id: assetId }), 'Task saved')) setTask(null); }}>Save task</button></>}>
        <TaskForm v={task} onChange={(t) => setTask({ ...task, ...t })} vehicle={f.mcategory === 'Vehicle'} />
        <Field label="Person responsible"><select value={task.responsible_id ?? ''} onChange={(e) => setTask({ ...task, responsible_id: e.target.value || undefined })}><option value="">Asset default</option>{live(db.employees).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
      </Modal>}
    </Modal>
  );
}

/* ================= checklist templates ================= */
function Templates({ onEdit }: { onEdit: (t: MaintTemplate | 'new') => void }) {
  const { db } = useAuth();
  const list = live(db.maint_templates);
  return (
    <Card title="Reusable checklists by asset type" actions={<button className="btn sm primary" onClick={() => onEdit('new')}>+ New checklist</button>} flush>
      <ul className="list">{list.map((t) => <li key={t.id}><div><b>{t.name}</b> <Badge tone="blue">{t.mcategory}</Badge><div className="small muted">{t.tasks.map((x) => x.task_name).join(' · ')}</div></div><span className="row"><button className="btn sm" onClick={() => onEdit(t)}>Edit</button><button className="btn sm danger" onClick={async () => { if (await ask(`Delete the checklist “${t.name}”? Tasks already on assets stay.`, 'Reason', { okLabel: 'Delete' })) run(() => M.removeTemplate(t.id), 'Checklist deleted'); }}>Delete</button></span></li>)}{!list.length && <li className="muted">No checklists yet.</li>}</ul>
    </Card>
  );
}
function TemplateModal({ initial, onClose }: { initial?: MaintTemplate; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? ''); const [cat, setCat] = useState<MaintCategory>(initial?.mcategory ?? 'Vehicle');
  const [tasks, setTasks] = useState<MaintTaskDef[]>(initial?.tasks ?? [blankTask()]);
  return (
    <Modal title={initial ? `Edit checklist — ${initial.name}` : 'New checklist'} size="xl" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (run(() => M.saveTemplate({ id: initial?.id, name, mcategory: cat, tasks }), 'Checklist saved')) onClose(); }}>Save checklist</button></>}>
      <div className="form-grid"><Field label="Checklist name" required><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. RO/DI water system" /></Field>
        <Field label="Asset type"><select value={cat} onChange={(e) => setCat(e.target.value as MaintCategory)}>{MCATS.map((c) => <option key={c}>{c}</option>)}</select></Field></div>
      {tasks.map((t, i) => <div key={i} className="card" style={{ marginTop: 12 }}><div className="card-h"><b>Task {i + 1}</b><button className="btn sm danger" onClick={() => setTasks(tasks.filter((_, k) => k !== i))}>Remove</button></div><div className="card-b"><TaskForm v={t} onChange={(x) => setTasks(tasks.map((y, k) => (k === i ? x : y)))} vehicle={cat === 'Vehicle'} /></div></div>)}
      <div style={{ marginTop: 10 }}><button className="btn" onClick={() => setTasks([...tasks, blankTask()])}>+ Add task</button></div>
    </Modal>
  );
}

/* ================= new record / report an issue ================= */
function NewRecord({ mode, onClose }: { mode: 'schedule' | 'request'; onClose: () => void }) {
  const { db } = useAuth();
  const assets = live(db.assets).filter((a) => a.status !== 'Retired');
  const [f, setF] = useState({ asset_id: '', title: '', issue: '', task_type: 'Service' as MaintTaskDef['task_type'], priority: 'Normal' as MaintPriority, due_date: addDays(today(), 7), responsible_id: '', est_cost: 0, description: '' });
  const submit = () => {
    if (!f.asset_id) return toast('Choose the asset.', 'err');
    const ok = mode === 'request' ? run(() => M.requestMaintenance({ asset_id: f.asset_id, issue: f.issue, priority: f.priority }), 'Reported — Operations will review it')
      : run(() => M.scheduleMaintenance({ asset_id: f.asset_id, title: f.title, task_type: f.task_type, description: f.description, priority: f.priority, due_date: f.due_date, responsible_id: f.responsible_id || undefined, est_cost: f.est_cost }), 'Maintenance scheduled');
    if (ok) onClose();
  };
  return (
    <Modal title={mode === 'request' ? 'Report an issue / request maintenance' : 'Schedule maintenance'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>{mode === 'request' ? 'Send request' : 'Schedule'}</button></>}>
      <div className="form-grid">
        <Field label="Asset" required className="full"><select value={f.asset_id} onChange={(e) => setF({ ...f, asset_id: e.target.value })}><option value="">Choose…</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
        {mode === 'request' ? <Field label="What is wrong?" required className="full"><textarea rows={3} value={f.issue} onChange={(e) => setF({ ...f, issue: e.target.value })} placeholder="e.g. Hose leaks at the coupling under pressure" /></Field> : <>
          <Field label="Task" required className="full"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Replace pump seals" /></Field>
          <Field label="Type"><select value={f.task_type} onChange={(e) => setF({ ...f, task_type: e.target.value as MaintTaskDef['task_type'] })}>{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Due date" required><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          <Field label="Person responsible"><select value={f.responsible_id} onChange={(e) => setF({ ...f, responsible_id: e.target.value })}><option value="">Asset default</option>{live(db.employees).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
          <Field label="Estimated cost (₱)"><input type="number" min={0} value={f.est_cost} onChange={(e) => setF({ ...f, est_cost: Number(e.target.value) || 0 })} /></Field>
          <Field label="Instructions (one step per line)" className="full"><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></>}
        <Field label="Priority"><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as MaintPriority })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
      </div>
      {mode === 'request' && <p className="small muted">A Team Leader can report a problem. Admin / Operations approve and schedule it; the task is closed only by them.</p>}
    </Modal>
  );
}

/* ================= a work record ================= */
function RecordModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, can, user } = useAuth(); const manage = can('maintenance.manage'); const T = today();
  const r = db.maint_records.find((x) => x.id === id);
  const [completing, setCompleting] = useState(false);
  if (!r) return null;
  const a = db.assets.find((x) => x.id === r.asset_id)!; const st = dueState(db, r, T); const plan = db.maint_plans.find((p) => p.id === r.plan_id);
  const editable = manage && !['Completed', 'Cancelled'].includes(r.status);
  const items = live(db.items).map((i) => ({ id: i.id, code: i.code, name: i.name, uom: i.uom }));
  const setParts = (parts: MaintPart[]) => run(() => M.saveRecord(r.id, { parts }));
  const cur = plan ? readingFor(db, plan.freq_kind, r.asset_id) : undefined;
  return (
    <Modal title={<span>{r.number} · {a.name}</span>} size="xl" onClose={onClose} footer={<RecordActions r={r} manage={manage} onClose={onClose} onComplete={() => setCompleting(true)} />}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}><Badge tone={maintTone(st)}>{st}</Badge><Badge tone={r.priority === 'Urgent' ? 'red' : r.priority === 'High' ? 'amber' : 'gray'}>{r.priority}</Badge><Badge tone="blue">{r.task_type}</Badge><Badge tone={a.status === 'Available' ? 'green' : 'amber'}>Asset: {a.status}</Badge>{r.approval === 'Pending' && <Badge tone="amber">Awaiting approval</Badge>}</div>
      <h3 style={{ margin: '2px 0 4px' }}>{r.title}</h3>
      {r.request_note && <div className="alert info" style={{ marginBottom: 8 }}><b>Reported by {empName(db, r.requested_by)}:</b> {r.request_note}</div>}
      <dl className="kv">
        <dt>Due</dt><dd>{r.due_date ? fmtDate(r.due_date) : '—'}{r.due_reading !== undefined ? ` · at reading ${r.due_reading}${cur !== undefined ? ` (now ${cur})` : ''}` : ''}</dd>
        <dt>Responsible</dt><dd>{empName(db, r.responsible_id)}</dd>
        <dt>Estimated cost</dt><dd>{money(r.est_cost)}{plan?.est_minutes ? ` · ~${plan.est_minutes} min` : ''}</dd>
        {r.status === 'Deferred' && <><dt>Deferred until</dt><dd>{r.deferred_until ? fmtDate(r.deferred_until) : '—'} — {r.defer_reason}</dd></>}
        {r.status === 'Cancelled' && <><dt>Cancelled</dt><dd>{r.cancel_reason}</dd></>}
        {r.status === 'Completed' && <><dt>Completed</dt><dd>{fmtDate(r.completed_at!)} by {empName(db, r.completed_by)} · actual {money(r.actual_cost ?? 0)}{r.provider ? ` · ${r.provider}` : ''}</dd>
          <dt>Before</dt><dd>{r.before_notes || '—'}</dd><dt>After</dt><dd>{r.after_notes || '—'}</dd>
          <dt>Next due</dt><dd>{r.next_due ? fmtDate(r.next_due) : r.next_due_reading !== undefined ? `at reading ${r.next_due_reading}` : '—'}</dd>
          {r.link && <><dt>Receipt / report</dt><dd><a href={r.link} target="_blank" rel="noreferrer">{r.link}</a></dd></>}</>}
      </dl>
      {r.description && <p className="small" style={{ whiteSpace: 'pre-line' }}>{r.description}</p>}
      <h4 style={{ margin: '12px 0 4px' }}>Checklist</h4>
      <ul className="list">{r.checklist.map((c, i) => <li key={i}><label className="check"><input type="checkbox" checked={c.done} disabled={!editable} onChange={() => run(() => M.saveRecord(r.id, { checklist: r.checklist.map((x, k) => (k === i ? { ...x, done: !x.done } : x)) }))} /> {c.label}</label></li>)}</ul>
      <h4 style={{ margin: '12px 0 4px' }}>Parts, replacements and cleaning plan</h4>
      <PartsEditor parts={r.parts} onChange={setParts} readOnly={!editable} items={items} short={(p) => stockShort(db, p)} />
      <p className="small muted">Linked inventory is deducted only when the task is marked completed, and only if enough is in stock.</p>
      <h4 style={{ margin: '12px 0 4px' }}>History</h4>
      <ul className="list small">{[...r.history].reverse().map((h, i) => <li key={i}><span>{h.action}{h.note ? ` — ${h.note}` : ''}</span><span className="muted">{h.by} · {fmtDate(h.at)}</span></li>)}</ul>
      {completing && <CompleteForm r={r} onClose={() => setCompleting(false)} onDone={onClose} defaultBy={user?.employee_id} />}
    </Modal>
  );
}
function RecordActions({ r, manage, onClose, onComplete }: { r: MaintRecord; manage: boolean; onClose: () => void; onComplete: () => void }) {
  const { db } = useAuth(); const can2 = (fn: () => unknown, ok: string, after?: () => void) => () => { if (run(fn, ok)) after?.(); };
  const ex = db.expenses; void ex;
  if (!manage) return <button className="btn" onClick={onClose}>Close</button>;
  const askDate = async (t: string) => { const v = await ask(t, 'Date (YYYY-MM-DD)', { okLabel: 'Next' }); return v?.trim() ?? null; };
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', width: '100%' }}>
      <button className="btn" onClick={onClose}>Close</button>
      {r.status === 'Requested' && <>
        <button className="btn danger" onClick={async () => { const why = await ask('Decline this request?', 'Reason', { okLabel: 'Decline' }); if (why) run(() => M.rejectRequest(r.id, why), 'Declined'); }}>Decline</button>
        <button className="btn primary" onClick={async () => { const d = await askDate('Approve the request and schedule it for which date?'); if (d) run(() => M.approveRequest(r.id, { due_date: d }), 'Approved and scheduled'); }}>Approve &amp; schedule</button></>}
      {['Scheduled', 'Deferred', 'Requested'].includes(r.status) && r.status !== 'Requested' && <button className="btn" onClick={async () => { const d = await askDate('Defer until which date?'); if (!d) return; const why = await ask('Why is it being deferred?', 'Reason', { okLabel: 'Defer' }); if (why) run(() => M.deferRecord(r.id, d, why), 'Deferred'); }}>Defer</button>}
      {r.parts.some((p) => p.status === 'Needed') && !['Completed', 'Cancelled'].includes(r.status) && <button className="btn" onClick={() => { const n = run(() => M.requestPurchase(r.id)); if (n) toast('Purchase requested for the parts that are short', 'ok'); }}>Request purchase</button>}
      {['Scheduled', 'Deferred'].includes(r.status) && <button className="btn" onClick={can2(() => M.startRecord(r.id), 'Work started — the asset is Under Maintenance')}>Start work</button>}
      {['Scheduled', 'In Progress', 'Deferred'].includes(r.status) && <button className="btn primary" onClick={onComplete}>Mark completed…</button>}
      {!['Completed', 'Cancelled', 'Requested'].includes(r.status) && <button className="btn danger" onClick={async () => { const why = await ask('Cancel this maintenance task?', 'Reason', { okLabel: 'Cancel task' }); if (why) run(() => M.cancelRecord(r.id, why), 'Cancelled'); }}>Cancel task</button>}
      {r.status === 'Completed' && !!r.actual_cost && !r.expense_id && <ExpenseButton id={r.id} />}
    </div>
  );
}
function ExpenseButton({ id }: { id: string }) {
  const { can } = useAuth(); if (!can('expenses.edit')) return null;
  return <button className="btn" onClick={() => run(() => M.createMaintExpense(id), 'Expense drafted in Finance for approval')}>Create expense</button>;
}
function CompleteForm({ r, onClose, onDone, defaultBy }: { r: MaintRecord; onClose: () => void; onDone: () => void; defaultBy?: string | null }) {
  const { db } = useAuth(); const plan = db.maint_plans.find((p) => p.id === r.plan_id); const prof = profileOf(db, r.asset_id);
  const [f, setF] = useState({ confirmed: false, completed_on: today(), completed_by: defaultBy ?? r.responsible_id ?? '', actual_cost: r.est_cost, provider: prof?.provider ?? '', before_notes: '', after_notes: '', reading: undefined as number | undefined, next_due: '', next_due_reading: undefined as number | undefined, link: '', installed: r.parts.filter((p) => p.status !== 'Cancelled').map((p) => p.id) });
  const showReading = !!plan && (plan.freq_kind === 'mileage' || plan.freq_kind === 'hours') || prof?.reading_unit !== undefined && r.task_type === 'Service';
  const submit = () => {
    const res = attempt(() => M.completeRecord(r.id, { ...f, next_due: f.next_due || undefined, provider: f.provider || undefined, link: f.link || undefined }), 'Maintenance completed');
    if (!res) return;
    if (typeof res === 'object' && 'short' in res && res.short.length) toast(`Not enough stock to deduct: ${res.short.join('; ')}. Recorded without deducting.`, 'info');
    onClose(); onDone();
  };
  return (
    <Modal title={`Complete ${r.number}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Back</button><button className="btn primary" onClick={submit}>Save completion</button></>}>
      <div className="form-grid">
        <Field label="Completion date" required><input type="date" max={today()} value={f.completed_on} onChange={(e) => setF({ ...f, completed_on: e.target.value })} /></Field>
        <Field label="Completed / verified by" required><select value={f.completed_by} onChange={(e) => setF({ ...f, completed_by: e.target.value })}><option value="">Choose…</option>{live(db.employees).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
        <Field label="Actual cost (₱)" required><input type="number" min={0} step="any" value={f.actual_cost} onChange={(e) => setF({ ...f, actual_cost: Number(e.target.value) || 0 })} /></Field>
        <Field label="Supplier / service provider"><input value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} /></Field>
        {showReading && <Field label={`Reading now (${prof?.reading_unit ?? 'km / hours'})`}><input type="number" min={0} step="any" value={f.reading ?? ''} onChange={(e) => setF({ ...f, reading: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>}
        <Field label="Next due date" hint={plan ? 'Leave blank to use the schedule' : undefined}><input type="date" value={f.next_due} onChange={(e) => setF({ ...f, next_due: e.target.value })} /></Field>
        <Field label="Condition before" className="full"><input value={f.before_notes} onChange={(e) => setF({ ...f, before_notes: e.target.value })} /></Field>
        <Field label="Condition after / maintenance notes" required className="full"><input value={f.after_notes} onChange={(e) => setF({ ...f, after_notes: e.target.value })} /></Field>
        <Field label="Receipt or service report link (optional)" className="full"><input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…" /></Field>
        {r.parts.length > 0 && <div className="full"><div className="small muted" style={{ fontWeight: 600 }}>Parts / materials used</div>{r.parts.filter((p) => p.status !== 'Cancelled').map((p) => <label key={p.id} className="check"><input type="checkbox" checked={f.installed.includes(p.id)} onChange={() => setF({ ...f, installed: f.installed.includes(p.id) ? f.installed.filter((x) => x !== p.id) : [...f.installed, p.id] })} /> {p.name} × {p.qty}{p.item_id ? ' (deducted from inventory)' : ''}</label>)}</div>}
        <label className="check full"><input type="checkbox" checked={f.confirmed} onChange={(e) => setF({ ...f, confirmed: e.target.checked })} /> <b>I confirm the work was done and checked.</b></label>
      </div>
    </Modal>
  );
}
void Link;
