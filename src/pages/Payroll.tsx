import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { isCommercialClient, jobBonus, jobPaySettings, outsideMetroHint, panelBonusPerCrew } from '@/lib/jobpay';
import { setJobPayOptions } from '@/lib/joborders';
import { Badge, Card, Field, Icon, Modal, PageHead, Stat, Tabs, attempt, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { PayrollWho } from '@/components/PayrollWho';
import { createPeriod, deletePeriod, saveAdjustment } from '@/lib/actions';
import { addDays, dow, fmtDate, monthEnd, monthStart, money, sum, today } from '@/lib/util';
import type { PayrollAdjustment, PayrollPeriod, PayrollType } from '@/lib/types';

function suggest(type: PayrollType): { start: string; end: string } {
  const t = today();
  if (type === 'monthly') return { start: monthStart(t), end: monthEnd(t) };
  if (type === 'biweekly') return +t.slice(8) <= 15 ? { start: monthStart(t), end: `${t.slice(0, 8)}15` } : { start: `${t.slice(0, 8)}16`, end: monthEnd(t) };
  const s = addDays(t, -((dow(t) + 6) % 7)); return { start: s, end: addDays(s, type === 'weekly' ? 6 : 0) };
}

function PeriodModal({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [type, setType] = useState<PayrollType>('biweekly');
  const f = useObj({ label: '', ...suggest('biweekly') });
  return (
    <Modal title="New payroll period" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => {
      const label = f.v.label.trim() || `${fmtDate(f.v.start)} – ${fmtDate(f.v.end)} (${type})`;
      const p = attempt(() => createPeriod({ label, start: f.v.start, end: f.v.end, type }), 'Period created') as PayrollPeriod | undefined; if (p) { onClose(); nav(`/payroll/${p.id}`); }
    }}>Create period</button></>}>
      <div className="form-grid">
        <Field label="Payroll type"><select value={type} onChange={(e) => { const t = e.target.value as PayrollType; setType(t); const s = suggest(t); f.set('start', s.start); f.set('end', s.end); }}>{['daily', 'weekly', 'biweekly', 'monthly'].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Label"><input {...f.bind('label')} placeholder="Auto" /></Field>
        <Field label="Period start"><input type="date" {...f.bind('start')} /></Field><Field label="Period end"><input type="date" {...f.bind('end')} /></Field>
      </div>
      <div style={{ marginTop: 10 }}><PayrollWho type={type} start={f.v.start} end={f.v.end} /></div>
      <p className="small muted">Only employees whose payroll type is “{type}” are included. Approved attendance in the range is pulled automatically.</p>
    </Modal>
  );
}

function AdjModal({ initial, onClose }: { initial?: PayrollAdjustment; onClose: () => void }) {
  const { db } = useAuth();
  const [recurring, setRecurring] = useState(!initial?.period_id);
  const f = useObj<Omit<PayrollAdjustment, 'id' | 'created_at' | 'updated_at' | 'created_by'>>(() => initial ?? { employee_id: live(db.employees).find((e) => e.status !== 'inactive')?.id ?? '', kind: 'Allowance', amount: 0, note: '', period_id: null, active: true });
  const deduct = ['Cash Advance', 'Loan', 'Other Deduction'].includes(f.v.kind);
  const drafts = db.periods.filter((p) => p.status === 'Draft');
  return (
    <Modal title={initial ? 'Edit adjustment' : 'New payroll adjustment'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => saveAdjustment({ ...f.v, id: initial?.id, period_id: recurring ? null : f.v.period_id, balance: deduct && recurring ? (f.v.balance ?? f.v.amount) : undefined } as never), 'Adjustment saved')) onClose(); }}>Save</button></>}>
      <div className="form-grid">
        <Field label="Employee"><select {...f.bind('employee_id')}>{live(db.employees).filter((e) => e.status !== 'inactive').map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
        <Field label="Type"><select {...f.bind('kind')}>{['Allowance', 'Incentive', 'Reimbursement', 'Cash Advance', 'Loan', 'Other Deduction'].map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label={deduct ? 'Deduction per period (₱)' : 'Amount (₱)'}><input type="number" min="0" {...f.bind('amount')} /></Field>
        {deduct && recurring && <Field label="Total outstanding balance (₱)"><input type="number" min="0" value={f.v.balance ?? f.v.amount} onChange={(e) => f.set('balance', +e.target.value)} /></Field>}
        <label className="check full"><input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />Recurring every period{deduct ? ' until balance is paid' : ''} (untick for a one-off in a chosen draft period)</label>
        {!recurring && <Field label="Applies to period"><select value={f.v.period_id ?? ''} onChange={(e) => f.set('period_id', e.target.value)}><option value="">— choose draft period —</option>{drafts.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>}
        <Field label="Note" className="full"><input {...f.bind('note')} /></Field>
      </div>
    </Modal>
  );
}

/** The crew bonus of each job: panel bonus, and the Owner's Outside Metro Manila / Commercial Project options. Absent crew reduce the crew size automatically. */
function JobBonuses() {
  const { db, can } = useAuth();
  const [from, setFrom] = useState(addDays(today(), -45)); const [to, setTo] = useState(today());
  const owner = can('payroll.approve'); const cfg = jobPaySettings(db.settings);
  const jobs = live(db.jobs).filter((j) => !['Cancelled', 'Rescheduled', 'Pending'].includes(j.status) && j.start_at.slice(0, 10) >= from && j.start_at.slice(0, 10) <= to && (j.leader_id || j.crew_ids.length)).sort((a, b) => b.start_at.localeCompare(a.start_at));
  const name = (id: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const rows = jobs.map((j) => ({ j, b: jobBonus(db, j) }));
  return (
    <Card title="Crew bonus per job order" actions={<div className="row" style={{ gap: 6 }}><input type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /><input type="date" aria-label="To" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></div>} flush>
      <div className="small muted" style={{ padding: '10px 14px' }}>Panel bonus = ₱{cfg.panel_bonus} for every complete {cfg.panel_step} additional billable panels per crew member. Crew who are absent are taken out of the crew size automatically. The bonus is final once the work is finished and is added to each present crew member's payroll as an incentive. {owner ? 'Tick the two options for jobs that qualify.' : 'Only the Owner can change the two options.'}</div>
      <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Job order</th><th className="num">Additional panels</th><th className="num">Crew</th><th className="num">Panel each</th><th>Outside Metro Manila ({money(cfg.outside_mm_bonus)})</th><th>Commercial ({money(cfg.commercial_bonus)})</th><th className="num">Each</th><th className="num">Total crew bonus</th></tr></thead>
        <tbody>{rows.map(({ j, b }) => (
          <tr key={j.id}>
            <td><a href={`#/jobs/${j.id}`}><b>{j.number}</b></a><div className="small muted">{fmtDate(j.start_at.slice(0, 10))} · {db.clients.find((c) => c.id === j.client_id)?.name}{!b.final && ' · not final'}</div></td>
            <td className="num">{b.additional_panels}</td>
            <td className="num">{b.crew}{b.absent.length > 0 && <div className="small muted" title={b.absent.map(name).join(', ')}>{b.absent.length} absent</div>}</td>
            <td className="num">{money(b.panel_each)}</td>
            <td><label className="check" title={outsideMetroHint(db, j)}><input type="checkbox" disabled={!owner} checked={!!j.pay_outside_mm} onChange={(e) => attempt(() => setJobPayOptions(j.id, { outside: e.target.checked }), e.target.checked ? 'Outside Metro Manila bonus added' : 'Outside Metro Manila bonus removed')} />{outsideMetroHint(db, j)?.replace('Site is in ', '') ?? 'site unknown'}</label></td>
            <td><label className="check"><input type="checkbox" disabled={!owner} checked={!!j.pay_commercial} onChange={(e) => attempt(() => setJobPayOptions(j.id, { commercial: e.target.checked }), e.target.checked ? 'Commercial Project bonus added' : 'Commercial Project bonus removed')} />{isCommercialClient(db, j) ? 'commercial client' : 'yes'}</label></td>
            <td className="num">{money(b.each)}</td><td className="num"><b>{money(b.total)}</b></td>
          </tr>))}
          {!rows.length && <tr><td colSpan={8} className="muted">No job orders in this range.</td></tr>}</tbody>
        {rows.length > 0 && <tfoot><tr><th colSpan={7}>Total · {rows.length} job order{rows.length === 1 ? '' : 's'}</th><th className="num">{money(sum(rows, (r) => r.b.total))}</th></tr></tfoot>}
      </table></div>
    </Card>
  );
}

/** Pay per job order: the bonus amounts. (Each employee's rate per job order is set on the employee.) */
function JobPaySettings() {
  const { db, can } = useAuth();
  const cur = jobPaySettings(db.settings);
  const [v, setV] = useState(cur); const dirty = JSON.stringify(v) !== JSON.stringify(cur); const edit = can('payroll.approve');
  const num = (k: keyof typeof v, label: string, hint?: string) => <Field label={label} hint={hint}><input type="number" min="0" disabled={!edit} value={v[k]} onChange={(e) => setV({ ...v, [k]: Math.max(0, +e.target.value || 0) })} /></Field>;
  const save = () => attempt(() => { store.require('payroll.approve'); if (!(v.panel_step > 0)) throw new Error('Panels per bonus step must be more than 0.'); store.patchSettings({ job_pay: v }, 'Job pay settings updated'); }, 'Saved');
  return (
    <Card title="Pay per job order & crew bonuses">
      <div className="stack">
        <div className="small muted">Employees set to <b>Per job order</b> pay (on their employee record) earn their rate for every job order they attended, late or not; payroll fills it in from approved attendance. Every crew member present on the job also earns the bonuses below, separate from their regular pay (absent crew reduce the crew size automatically).</div>
        <div className="form-grid">
          {num('panel_bonus', 'Panel bonus (₱)', 'Paid per crew member for every complete step of additional panels.')}
          {num('panel_step', 'Additional panels per crew member for one bonus', 'Default 10: bonus = floor(additional panels ÷ (crew × 10)) × the bonus.')}
          {num('outside_mm_bonus', 'Outside Metro Manila bonus (₱ per crew member)', 'Added to a job when the Owner switches it on for that job.')}
          {num('commercial_bonus', 'Commercial Project bonus (₱ per crew member)', 'Added to a job when the Owner switches it on for that job.')}
        </div>
        <div className="small muted">Example with 3 crew: {[30, 59, 60, 90].map((n) => `${n} additional panels → ${money(panelBonusPerCrew(n, 3, v.panel_step, v.panel_bonus))} each`).join(' · ')}.</div>
        <div className="row" style={{ gap: 8 }}><button className="btn primary" disabled={!edit || !dirty} onClick={save}>Save</button>{!edit && <span className="small muted">Only the Owner can change these.</span>}</div>
      </div>
    </Card>
  );
}

export default function Payroll() {
  const { db, can } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<'periods' | 'adjust' | 'jobpay'>('periods');
  const [show, setShow] = useState(false);
  const [adj, setAdj] = useState<PayrollAdjustment | 'new' | null>(null);
  const periods = live(db.periods).sort((a, b) => b.start.localeCompare(a.start));
  const totals = (p: PayrollPeriod) => { const r = db.runs.find((x) => x.period_id === p.id); return { n: r?.lines.length ?? 0, gross: sum(r?.lines ?? [], (l) => l.gross), net: sum(r?.lines ?? [], (l) => l.net) }; };
  const waiting = periods.filter((p) => p.status === 'For Approval');
  return (
    <>
      <PageHead icon="💵" title="Payroll" sub="Attendance-driven payroll with approval workflow. Finalized periods are locked.">
        {can('payroll.edit') && <button className="btn primary" onClick={() => setShow(true)}><Icon name="plus" />New period</button>}
      </PageHead>
      {waiting.length > 0 && <div className="alert warn" style={{ marginBottom: 12 }}>{waiting.length} payroll period(s) awaiting approval: {waiting.map((p) => p.label).join('; ')}.</div>}
      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        <Stat k="Payable (approved, unpaid)" v={money(sum(periods.filter((p) => p.status === 'Approved'), (p) => totals(p).net))} tone="warn" />
        <Stat k="Awaiting approval" v={money(sum(waiting, (p) => totals(p).net))} />
        <Stat k="Finalized (last 90d)" v={money(sum(periods.filter((p) => p.status === 'Finalized' && p.end >= addDays(today(), -90)), (p) => totals(p).net))} tone="good" />
        <Stat k="Active employees" v={live(db.employees).filter((e) => e.status !== 'inactive').length} />
      </div>
      <div className="small muted" style={{ marginBottom: 8 }}>The weekly payroll (Sunday to Saturday) is created by itself when the week starts and fills in from attendance: open it to see each person's rate and bonus every day. Payslips are printed weekly.</div>
      <Tabs tabs={[{ id: 'periods', label: 'Payroll periods', count: periods.length }, { id: 'adjust', label: 'Allowances, advances & loans' }, { id: 'jobpay', label: 'Job bonuses & settings' }]} value={tab} onChange={setTab} />
      {tab === 'periods' && (
        <Card flush><DataTable<PayrollPeriod> rows={periods} rowKey={(p) => p.id} onRow={(p) => nav(`/payroll/${p.id}`)} exportTitle="Payroll periods" initialSort={{ key: 'start', dir: -1 }} cols={[
          { key: 'label', header: 'Period', value: (p) => p.label, render: (p) => <b>{p.locked && <Icon name="lock" size={14} />} {p.label}</b> }, { key: 'type', header: 'Type', value: (p) => p.type },
          { key: 'start', header: 'Dates', value: (p) => p.start, render: (p) => `${fmtDate(p.start)} – ${fmtDate(p.end)}` }, { key: 'n', header: 'Employees', num: true, value: (p) => totals(p).n },
          { key: 'gross', header: 'Gross', num: true, type: 'money', value: (p) => totals(p).gross, render: (p) => money(totals(p).gross) }, { key: 'net', header: 'Net pay', num: true, type: 'money', value: (p) => totals(p).net, render: (p) => money(totals(p).net) },
          { key: 'st', header: 'Status', value: (p) => p.status, render: (p) => <Badge>{p.status}</Badge> },
          { key: 'del', header: '', noExport: true, sortable: false, render: (p) => (p.status === 'Draft' && can('payroll.edit')) || (p.status === 'For Approval' && can('payroll.approve')) ? <button className="btn sm danger" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete the payroll period "${p.label}"?${totals(p).n ? ` Its calculated payroll for ${totals(p).n} employee(s) is removed too.` : ''}`)) attempt(() => deletePeriod(p.id), 'Payroll period deleted'); }}><Icon name="trash" size={14} />Delete</button> : null },
        ]} /></Card>
      )}
      {tab === 'adjust' && (
        <Card flush><DataTable<PayrollAdjustment> rows={live(db.adjustments)} rowKey={(a) => a.id} exportTitle="Payroll adjustments" actions={can('payroll.edit') && <button className="btn sm primary" onClick={() => setAdj('new')}><Icon name="plus" />Add</button>} cols={[
          { key: 'emp', header: 'Employee', value: (a) => db.employees.find((e) => e.id === a.employee_id)?.full_name ?? '' }, { key: 'kind', header: 'Type', value: (a) => a.kind },
          { key: 'amt', header: 'Amount / period', num: true, type: 'money', value: (a) => a.amount, render: (a) => money(a.amount) }, { key: 'bal', header: 'Balance', num: true, type: 'money', value: (a) => a.balance ?? 0, render: (a) => (a.balance !== undefined ? money(a.balance) : '—') },
          { key: 'scope', header: 'Applies', value: (a) => (a.period_id ? db.periods.find((p) => p.id === a.period_id)?.label ?? 'One-off' : 'Recurring') }, { key: 'note', header: 'Note', value: (a) => a.note },
          { key: 'st', header: 'Status', value: (a) => (a.active ? 'Active' : 'Closed'), render: (a) => <Badge>{a.active ? 'Active' : 'Closed'}</Badge> },
          { key: 'actions', header: '', noExport: true, sortable: false, render: (a) => can('payroll.edit') ? <button className="btn sm" onClick={() => setAdj(a)}>Edit</button> : null },
        ]} /></Card>
      )}
      {tab === 'jobpay' && <><JobBonuses /><div style={{ height: 14 }} /><JobPaySettings /></>}
      {show && <PeriodModal onClose={() => setShow(false)} />}
      {adj && <AdjModal initial={adj === 'new' ? undefined : adj} onClose={() => setAdj(null)} />}
    </>
  );
}
