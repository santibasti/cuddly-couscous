import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, Stat, Tabs, attempt, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { createPeriod, saveAdjustment } from '@/lib/actions';
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

export default function Payroll() {
  const { db, can } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<'periods' | 'adjust'>('periods');
  const [show, setShow] = useState(false);
  const [adj, setAdj] = useState<PayrollAdjustment | 'new' | null>(null);
  const periods = live(db.periods).sort((a, b) => b.start.localeCompare(a.start));
  const totals = (p: PayrollPeriod) => { const r = db.runs.find((x) => x.period_id === p.id); return { n: r?.lines.length ?? 0, gross: sum(r?.lines ?? [], (l) => l.gross), net: sum(r?.lines ?? [], (l) => l.net) }; };
  const waiting = periods.filter((p) => p.status === 'For Approval');
  return (
    <>
      <PageHead title="Payroll" sub="Attendance-driven payroll with approval workflow. Finalized periods are locked.">
        {can('payroll.edit') && <button className="btn primary" onClick={() => setShow(true)}><Icon name="plus" />New period</button>}
      </PageHead>
      {waiting.length > 0 && <div className="alert warn" style={{ marginBottom: 12 }}>{waiting.length} payroll period(s) awaiting approval: {waiting.map((p) => p.label).join('; ')}.</div>}
      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        <Stat k="Payable (approved, unpaid)" v={money(sum(periods.filter((p) => p.status === 'Approved'), (p) => totals(p).net))} tone="warn" />
        <Stat k="Awaiting approval" v={money(sum(waiting, (p) => totals(p).net))} />
        <Stat k="Finalized (last 90d)" v={money(sum(periods.filter((p) => p.status === 'Finalized' && p.end >= addDays(today(), -90)), (p) => totals(p).net))} tone="good" />
        <Stat k="Active employees" v={live(db.employees).filter((e) => e.status !== 'inactive').length} />
      </div>
      <Tabs tabs={[{ id: 'periods', label: 'Payroll periods', count: periods.length }, { id: 'adjust', label: 'Allowances, advances & loans' }]} value={tab} onChange={setTab} />
      {tab === 'periods' && (
        <Card flush><DataTable<PayrollPeriod> rows={periods} rowKey={(p) => p.id} onRow={(p) => nav(`/payroll/${p.id}`)} exportTitle="Payroll periods" initialSort={{ key: 'start', dir: -1 }} cols={[
          { key: 'label', header: 'Period', value: (p) => p.label, render: (p) => <b>{p.locked && <Icon name="lock" size={14} />} {p.label}</b> }, { key: 'type', header: 'Type', value: (p) => p.type },
          { key: 'start', header: 'Dates', value: (p) => p.start, render: (p) => `${fmtDate(p.start)} – ${fmtDate(p.end)}` }, { key: 'n', header: 'Employees', num: true, value: (p) => totals(p).n },
          { key: 'gross', header: 'Gross', num: true, type: 'money', value: (p) => totals(p).gross, render: (p) => money(totals(p).gross) }, { key: 'net', header: 'Net pay', num: true, type: 'money', value: (p) => totals(p).net, render: (p) => money(totals(p).net) },
          { key: 'st', header: 'Status', value: (p) => p.status, render: (p) => <Badge>{p.status}</Badge> },
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
      {show && <PeriodModal onClose={() => setShow(false)} />}
      {adj && <AdjModal initial={adj === 'new' ? undefined : adj} onClose={() => setAdj(null)} />}
    </>
  );
}
