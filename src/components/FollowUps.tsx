// Client Lifetime Value & Maintenance Follow-Up: profile summary, Admin status / interval dialogs, dashboard widget and the Admin task list.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Modal, Stat, attempt, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { runAutomations } from '@/lib/actions';
import { removeFollowUpRule, saveFollowUpRule, setFollowUpStatus } from '@/lib/followups';
import {
  ACTION_STATES, FOLLOW_TONE, FINAL_STATES, OPEN_STATES, clientFollow, clientValue, currentCycle, effectiveDue, focusOf, followUpDetails, followUpStats, intervalFor, intervalLabel, intervalWords, serviceNames,
  type ClientFollowStatus,
} from '@/lib/followup-core';
import { addDays, fmtDate, fmtStamp, money, today } from '@/lib/util';
import type { Client, DB, FollowUp, FollowUpState, ServiceCode } from '@/lib/types';

const STATE_TONE: Record<FollowUpState, string> = { Open: 'amber', Contacted: 'blue', 'Follow-Up Scheduled': 'blue', 'Quotation Sent': 'blue', Booked: 'green', 'Not Interested': 'gray', Snoozed: 'gray', Superseded: 'gray' };
const clientOf = (db: DB, id: string) => db.clients.find((c) => c.id === id);

export const FollowBadge = ({ status, detail }: { status: ClientFollowStatus; detail?: FollowUpState }) => (
  <Badge tone={FOLLOW_TONE[status]}>{status === 'Contacted' && detail && detail !== 'Contacted' ? detail : status}</Badge>
);

/* ---------- Admin: record what happened ---------- */
export function FollowUpActionModal({ followUp, onClose }: { followUp: FollowUp; onClose: () => void }) {
  const { db } = useAuth();
  const c = clientOf(db, followUp.client_id);
  const first = followUp.status === 'Open' || followUp.status === 'Snoozed' ? 'Contacted' : followUp.status;
  const f = useObj<{ status: (typeof ACTION_STATES)[number]; note: string; snoozed_until: string; booked_job_id: string }>(() => ({
    status: (ACTION_STATES as readonly string[]).includes(first) ? (first as (typeof ACTION_STATES)[number]) : 'Contacted', note: followUp.note ?? '', snoozed_until: addDays(today(), 14), booked_job_id: followUp.booked_job_id ?? '',
  }));
  const jobs = live(db.jobs).filter((j) => j.client_id === followUp.client_id && !['Cancelled', 'Rescheduled'].includes(j.status) && !j.origin_job_id && j.id !== followUp.reference_job_id && j.start_at.slice(0, 10) >= followUp.reference_date);
  const save = () => {
    const r = attempt(() => setFollowUpStatus(followUp.id, { status: f.v.status, note: f.v.note, snoozed_until: f.v.status === 'Snoozed' ? f.v.snoozed_until : undefined, booked_job_id: f.v.status === 'Booked' ? f.v.booked_job_id || undefined : undefined }), 'Follow-up updated');
    if (r) { runAutomations(); onClose(); }
  };
  return (
    <Modal title={`Follow-up · ${c?.name ?? ''}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="alert" style={{ marginBottom: 10 }}>{intervalLabel(followUp.months)} · due <b>{fmtDate(effectiveDue(followUp))}</b> · last service {fmtDate(followUp.reference_date)} ({serviceNames(db, followUp.service_codes)})</div>
      <div className="form-grid">
        <Field label="Status" className="full">
          <select {...f.bind('status')}>{ACTION_STATES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        {f.v.status === 'Snoozed' && <Field label="Remind me again on" required><input type="date" min={addDays(today(), 1)} {...f.bind('snoozed_until')} /></Field>}
        {f.v.status === 'Booked' && (
          <Field label="Booking (optional)" hint="Link the job so its revenue is counted in the dashboard." className="full">
            <select {...f.bind('booked_job_id')}><option value="">— not linked —</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.number} · {fmtDate(j.start_at.slice(0, 10))} · {j.status}</option>)}</select>
          </Field>
        )}
        <Field label={f.v.status === 'Not Interested' ? 'Reason' : 'Note'} required={f.v.status === 'Not Interested'} className="full"><textarea {...f.bind('note')} placeholder="What did the client say?" /></Field>
      </div>
      {followUp.history.length > 0 && (
        <div style={{ marginTop: 10 }}><div className="small muted" style={{ fontWeight: 700 }}>HISTORY</div>
          <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{[...followUp.history].reverse().map((h, i) => <li key={i}>{fmtStamp(h.at)} · {h.by} · <b>{h.status}</b>{h.note ? ` — ${h.note}` : ''}</li>)}</ul>
        </div>
      )}
    </Modal>
  );
}

/* ---------- Admin: custom recommended intervals ---------- */
export function IntervalModal({ clientId, onClose }: { clientId?: string; onClose: () => void }) {
  const { db } = useAuth();
  const rules = live(db.followup_rules);
  const mine = clientId ? rules.find((r) => r.client_id === clientId) : undefined;
  const f = useObj<{ scope: 'client' | 'service'; client_id: string; service_code: string; short_months: number; long_months: number; note: string }>(() => ({
    scope: clientId ? 'client' : 'service', client_id: clientId ?? '', service_code: db.services[0]?.code ?? '', short_months: mine?.short_months ?? 6, long_months: mine?.long_months ?? 12, note: mine?.note ?? '',
  }));
  const save = () => {
    const r = attempt(() => saveFollowUpRule({ client_id: f.v.scope === 'client' ? f.v.client_id || undefined : undefined, service_code: f.v.scope === 'service' ? (f.v.service_code as ServiceCode) : undefined, short_months: f.v.short_months, long_months: f.v.long_months, note: f.v.note }), 'Interval saved');
    if (r) { runAutomations(); if (clientId) onClose(); }
  };
  const label = (r: (typeof rules)[number]) => (r.client_id ? `Client · ${clientOf(db, r.client_id)?.name}` : `Service type · ${db.services.find((s) => s.code === r.service_code)?.name ?? r.service_code}`);
  return (
    <Modal title={clientId ? `Custom follow-up interval · ${clientOf(db, clientId)?.name}` : 'Follow-up intervals'} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <p className="small muted" style={{ marginTop: 0 }}>Default: 6 months and 1 year after the last completed service. A client rule overrides a service-type rule. Open follow-ups are recalculated; ones you have already acted on keep their dates.</p>
      <div className="form-grid">
        {!clientId && <>
          <Field label="Applies to"><select {...f.bind('scope')}><option value="service">A service type</option><option value="client">One client</option></select></Field>
          {f.v.scope === 'service'
            ? <Field label="Service type"><select {...f.bind('service_code')}>{db.services.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></Field>
            : <Field label="Client"><select {...f.bind('client_id')}><option value="">Choose…</option>{live(db.clients).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
        </>}
        <Field label="First follow-up (months after last service)"><input type="number" min={1} max={36} {...f.bind('short_months')} /></Field>
        <Field label="Second follow-up (months after last service)"><input type="number" min={2} max={60} {...f.bind('long_months')} /></Field>
        <Field label="Note" className="full"><input {...f.bind('note')} placeholder="e.g. Contract calls for quarterly cleaning" /></Field>
      </div>
      <div className="row" style={{ marginTop: 10 }}><button className="btn primary" onClick={save}>{mine ? 'Update interval' : 'Save interval'}</button>{mine && <button className="btn" onClick={() => attempt(() => { removeFollowUpRule(mine.id); runAutomations(); }, 'Back to the default interval')}>Use default</button>}</div>
      {!clientId && (
        <div style={{ marginTop: 14 }}><div className="small muted" style={{ fontWeight: 700 }}>CUSTOM INTERVALS IN USE</div>
          <ul className="list">{rules.map((r) => <li key={r.id}><div><b>{label(r)}</b><div className="small muted">{intervalWords(r.short_months)} / {intervalWords(r.long_months)}{r.note ? ` · ${r.note}` : ''}</div></div><button className="btn sm" onClick={() => attempt(() => { removeFollowUpRule(r.id); runAutomations(); }, 'Removed')}>Remove</button></li>)}{!rules.length && <li className="muted small">None — every client uses 6 months and 1 year.</li>}</ul>
        </div>
      )}
    </Modal>
  );
}

/* ---------- Client Profile ---------- */
export function ClientLifetimeCard({ client }: { client: Client }) {
  const { db, can } = useAuth();
  const [act, setAct] = useState<FollowUp | null>(null);
  const [iv, setIv] = useState(false);
  const t = today();
  const v = useMemo(() => clientValue(db, client), [db, client]);
  const fl = clientFollow(db, client.id, t);
  const cycle = currentCycle(db, client.id);
  const rule = intervalFor(db, client.id, v.lastTypeCodes);
  const fin = can('invoices.view'); const admin = can('followups.manage');
  const slotLabel = fl.focus ? ` · ${intervalWords(fl.focus.months)}` : '';
  return (
    <Card title="Client lifetime value & maintenance follow-up" actions={admin ? <button className="btn sm" onClick={() => setIv(true)}>Custom interval</button> : undefined}>
      <div className="grid g4 keep2">
        {fin && <Stat k="Lifetime billed amount" v={money(v.billed)} tone="navy" s="Finalized invoices" />}
        {fin && <Stat k="Lifetime collected amount" v={money(v.collected)} tone="good" s={v.whtCredited > 0 ? `+ ${money(v.whtCredited)} withholding credited` : 'Verified payments'} />}
        {fin && <Stat k="Outstanding receivables" v={money(v.outstanding)} tone={v.outstanding > 0.005 ? 'warn' : 'good'} />}
        <Stat k="Total completed services" v={v.completed} s="Completed / closed jobs" />
        <Stat k="Last completed service" v={v.lastDate ? fmtDate(v.lastDate) : '—'} />
        <Stat k="Last service type" v={<span style={{ fontSize: 15 }}>{v.lastType}</span>} />
        <Stat k={`Next recommended follow-up${slotLabel}`} v={fl.due ? fmtDate(fl.due) : '—'} s={fl.days === undefined || fl.status === 'Booked' || fl.status === 'Not Interested' ? undefined : fl.days < 0 ? `${-fl.days} day(s) overdue` : fl.days === 0 ? 'Today' : `in ${fl.days} day(s)`} />
        <Stat k="Follow-up status" v={<FollowBadge status={fl.status} detail={fl.detail} />} s={fl.focus?.status === 'Snoozed' ? `Snoozed until ${fmtDate(fl.focus.snoozed_until)}` : undefined} />
      </div>
      <div className="small muted" style={{ margin: '10px 0 6px' }}>Follow-up schedule: {intervalWords(rule.short)} and {intervalWords(rule.long)} after the last completed service ({rule.source.toLowerCase()}).</div>
      {cycle.length === 0
        ? <div className="muted small">{v.completed ? 'Follow-up dates appear once the schedule is calculated.' : 'No completed service yet — follow-up dates start from the first completed job.'}</div>
        : (
          <table className="tbl"><thead><tr><th>Follow-up</th><th>Due</th><th>Status</th><th>Note</th>{admin && <th></th>}</tr></thead>
            <tbody>{cycle.map((f) => (
              <tr key={f.id}>
                <td>{intervalLabel(f.months)}</td><td>{fmtDate(effectiveDue(f))}{f.status === 'Snoozed' && <div className="small muted">snoozed from {fmtDate(f.due_date)}</div>}</td>
                <td><Badge tone={STATE_TONE[f.status]}>{f.status}</Badge>{f.booked_job_id && <div className="small"><Link to={`/jobs/${f.booked_job_id}`}>{db.jobs.find((j) => j.id === f.booked_job_id)?.number}</Link></div>}</td>
                <td className="small">{f.note ?? '—'}{f.actioned_at && <div className="muted">{fmtStamp(f.actioned_at)}</div>}</td>
                {admin && <td><button className="btn sm" onClick={() => setAct(f)}>Update</button></td>}
              </tr>))}</tbody>
          </table>
        )}
      {act && <FollowUpActionModal followUp={act} onClose={() => setAct(null)} />}
      {iv && <IntervalModal clientId={client.id} onClose={() => setIv(false)} />}
    </Card>
  );
}

/* ---------- Dashboard ---------- */
export function FollowUpWidget() {
  const { db, can } = useAuth();
  const nav = useNavigate();
  if (!can('followups.manage')) return null;
  const st = followUpStats(db, today());
  const next = [...st.overdue, ...st.week].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  return (
    <div className="card" style={{ padding: 12, marginBottom: 14 }}>
      <div className="row between"><b>Maintenance follow-ups</b><Link to="/notifications?tab=followups" className="small">Open follow-up tasks →</Link></div>
      <div className="grid g4 keep2" style={{ margin: '8px 0', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Stat k="Due This Week" v={st.week.length} tone={st.week.length ? 'navy' : undefined} />
        <Stat k="Due This Month" v={st.month.length} />
        <Stat k="Overdue" v={st.overdue.length} tone={st.overdue.length ? 'bad' : 'good'} />
        <Stat k="Converted to Bookings" v={st.converted.length} tone="good" s="All time" />
        <Stat k="Revenue from Follow-Up Bookings" v={money(st.revenue)} tone="good" s="Net of VAT, billed or expected" />
      </div>
      <ul className="list">
        {next.map(({ f, due }) => { const c = clientOf(db, f.client_id); return (
          <li key={f.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/clients/${f.client_id}`)}>
            <div><b>{c?.name}</b><div className="small muted">{intervalWords(f.months)} follow-up · due {fmtDate(due)} · last service {fmtDate(f.reference_date)}</div></div>
            <Badge tone={due < today() ? 'red' : due === today() ? 'teal' : 'amber'}>{due < today() ? 'Overdue' : due === today() ? 'Due today' : 'This week'}</Badge>
          </li>); })}
        {!next.length && <li className="muted small">Nothing due this week.</li>}
      </ul>
    </div>
  );
}

/* ---------- Notifications: Admin follow-up tasks ---------- */
export function FollowUpTasks() {
  const { db, can } = useAuth();
  const nav = useNavigate();
  const [act, setAct] = useState<FollowUp | null>(null);
  const [show, setShow] = useState<'open' | 'all'>('open');
  const t = today();
  const rows = useMemo(() => {
    const out: FollowUp[] = [];
    for (const c of live(db.clients)) {
      const cycle = currentCycle(db, c.id);
      if (show === 'all') out.push(...cycle);
      else { const f = focusOf(cycle); if (f && OPEN_STATES.includes(f.status)) out.push(f); }          // open tasks: the next follow-up per client
    }
    return out;
  }, [db, show]);
  const admin = can('followups.manage');
  return (
    <Card flush>
      <DataTable<FollowUp>
        rows={rows} rowKey={(f) => f.id} exportTitle="Follow-up tasks" pageSize={12} initialSort={{ key: 'due', dir: 1 }} onRow={(f) => nav(`/clients/${f.client_id}`)}
        filters={<select value={show} onChange={(e) => setShow(e.target.value as 'open' | 'all')} aria-label="Show"><option value="open">Open tasks</option><option value="all">All follow-ups (incl. later and finished)</option></select>}
        cols={[
          { key: 'due', header: 'Follow-up date', value: (f) => effectiveDue(f), render: (f) => { const d = effectiveDue(f); return <div><b>{fmtDate(d)}</b><div className="small muted">{intervalWords(f.months)}{OPEN_STATES.includes(f.status) && (d < t ? ' · overdue' : d === t ? ' · today' : '')}</div></div>; } },
          { key: 'client', header: 'Client', value: (f) => clientOf(db, f.client_id)?.name ?? '', render: (f) => <b>{clientOf(db, f.client_id)?.name}</b> },
          { key: 'contact', header: 'Contact person', value: (f) => { const c = clientOf(db, f.client_id); return `${c?.contact_person} ${c?.mobile}`; }, render: (f) => { const c = clientOf(db, f.client_id); return <div>{c?.contact_person}<div className="small muted">{c?.mobile || '—'}</div></div>; } },
          { key: 'loc', header: 'Location', value: (f) => followUpDetails(db, f).value.location },
          { key: 'last', header: 'Last service date', value: (f) => f.reference_date, render: (f) => fmtDate(f.reference_date) },
          { key: 'type', header: 'Last service type', value: (f) => serviceNames(db, f.service_codes) },
          { key: 'billed', header: 'Lifetime billed', num: true, type: 'money', value: (f) => followUpDetails(db, f).value.billed, render: (f) => money(followUpDetails(db, f).value.billed) },
          { key: 'n', header: 'Completed services', num: true, value: (f) => followUpDetails(db, f).value.completed },
          { key: 'out', header: 'Outstanding', num: true, type: 'money', value: (f) => followUpDetails(db, f).value.outstanding, render: (f) => { const o = followUpDetails(db, f).value.outstanding; return o > 0.005 ? <b style={{ color: 'var(--bad, #b42318)' }}>{money(o)}</b> : '—'; } },
          { key: 'action', header: 'Suggested follow-up action', value: (f) => followUpDetails(db, f).action, render: (f) => <span className="small">{followUpDetails(db, f).action}</span> },
          { key: 'status', header: 'Status', value: (f) => f.status, render: (f) => <div><Badge tone={STATE_TONE[f.status]}>{f.status}</Badge>{f.status === 'Snoozed' && <div className="small muted">until {fmtDate(f.snoozed_until)}</div>}</div> },
          ...(admin ? [{ key: 'actions', header: '', noExport: true, sortable: false, render: (f: FollowUp) => <button className="btn sm" onClick={(e) => { e.stopPropagation(); setAct(f); }}>{FINAL_STATES.includes(f.status) ? 'Change' : 'Update'}</button> }] : []),
        ]}
      />
      {act && <FollowUpActionModal followUp={act} onClose={() => setAct(null)} />}
    </Card>
  );
}
