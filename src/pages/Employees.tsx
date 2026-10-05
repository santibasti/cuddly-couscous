import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, Tabs, Bar, attempt, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { scorecard } from '@/lib/business';
import { fmtDate, money, today } from '@/lib/util';
import type { Employee } from '@/lib/types';

export const TIERS: Employee['tier'][] = ['Trainee', 'Technician', 'Senior Technician', 'Team Leader', 'Supervisor', 'Office Staff'];
export const DEPTS: Employee['department'][] = ['Field Operations', 'Operations', 'Finance & Admin', 'Management'];

export function EmployeeForm({ initial, onClose }: { initial?: Employee; onClose: () => void }) {
  const { db, can } = useAuth();
  const pay = can('employees.pay');
  const f = useObj<Omit<Employee, 'id' | 'created_at' | 'updated_at' | 'created_by'>>(() => initial ?? {
    code: '', full_name: '', position: '', tier: 'Technician', department: 'Field Operations', branch_id: db.branches[0].id, pay_basis: 'daily', daily_rate: 700, monthly_salary: 0, payroll_type: 'biweekly',
    hire_date: today(), bank_name: '', bank_account: '', payout_method: 'Bank transfer', mobile: '', emergency_name: '', emergency_mobile: '', sss: '', philhealth: '', pagibig: '', tin: '', status: 'probationary',
    documents: [{ name: 'NBI Clearance' }, { name: 'Medical Certificate' }, { name: 'Signed Employment Contract' }], trainings: [], shift_start: '08:00', shift_end: '17:00', rest_day: 0,
  });
  const save = () => {
    if (!f.v.full_name.trim() || !f.v.position.trim()) return attempt(() => { throw new Error('Name and position are required.'); });
    if (f.v.pay_basis === 'daily' ? !(f.v.daily_rate > 0) : !(f.v.monthly_salary > 0)) return attempt(() => { throw new Error('Enter the pay rate.'); });
    attempt(() => (initial ? store.update('employees', initial.id, f.v, 'update', `Updated employee ${f.v.full_name}`) : store.insert('employees', { ...f.v, code: store.nextNumber('EMP') })), 'Employee saved'); onClose();
  };
  return (
    <Modal title={initial ? `Edit ${initial.full_name}` : 'New employee'} size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save employee</button></>}>
      <div className="form-grid">
        <Field label="Full name" required><input {...f.bind('full_name')} /></Field><Field label="Position" required><input {...f.bind('position')} /></Field>
        <Field label="Tier"><select {...f.bind('tier')}>{TIERS.map((t) => <option key={t}>{t}</option>)}</select></Field><Field label="Department"><select {...f.bind('department')}>{DEPTS.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Employment status"><select {...f.bind('status')}>{['probationary', 'regular', 'contractual', 'inactive'].map((t) => <option key={t}>{t}</option>)}</select></Field><Field label="Hire date"><input type="date" {...f.bind('hire_date')} /></Field>
        <Field label="Mobile"><input {...f.bind('mobile')} /></Field><Field label="Branch"><select {...f.bind('branch_id')}>{db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Shift start"><input type="time" {...f.bind('shift_start')} /></Field><Field label="Shift end"><input type="time" {...f.bind('shift_end')} /></Field>
        <Field label="Weekly rest day"><select value={f.v.rest_day} onChange={(e) => f.set('rest_day', +e.target.value)}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field><span />
        <Field label="Emergency contact"><input {...f.bind('emergency_name')} /></Field><Field label="Emergency mobile"><input {...f.bind('emergency_mobile')} /></Field>
        {pay && <>
          <Field label="Pay basis"><select {...f.bind('pay_basis')}><option value="daily">Daily rate</option><option value="monthly">Monthly salary</option></select></Field>
          {f.v.pay_basis === 'daily' ? <Field label="Daily rate (₱)"><input type="number" min="0" {...f.bind('daily_rate')} /></Field> : <Field label="Monthly salary (₱)"><input type="number" min="0" {...f.bind('monthly_salary')} /></Field>}
          <Field label="Payroll type"><select {...f.bind('payroll_type')}>{['daily', 'weekly', 'biweekly', 'monthly'].map((t) => <option key={t}>{t}</option>)}</select></Field><Field label="Payout method"><select {...f.bind('payout_method')}><option>Bank transfer</option><option>GCash</option><option>Cash</option></select></Field>
          <Field label="Bank / e-wallet"><input {...f.bind('bank_name')} /></Field><Field label="Account number"><input {...f.bind('bank_account')} /></Field>
          <Field label="SSS no."><input {...f.bind('sss')} /></Field><Field label="PhilHealth no."><input {...f.bind('philhealth')} /></Field><Field label="Pag-IBIG no."><input {...f.bind('pagibig')} /></Field><Field label="TIN"><input {...f.bind('tin')} /></Field>
        </>}
      </div>
    </Modal>
  );
}

export default function Employees() {
  const { db, can } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<'directory' | 'scorecards'>('directory');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [show, setShow] = useState(false);
  const [dept, setDept] = useState(''); const [status, setStatus] = useState('');
  const emps = live(db.employees).filter((e) => (!dept || e.department === dept) && (!status || e.status === status));
  const pay = can('employees.pay');
  const T = today();
  const expiring = (e: Employee) => [...e.documents.map((d) => d.expires), ...e.trainings.map((t) => t.expires)].filter(Boolean).some((d) => d! <= addD(T, db.settings.reminder_days.doc_expiry));

  return (
    <>
      <PageHead title="Employees & performance" sub="Directory, compliance documents, training expiry and monthly scorecards.">
        {can('employees.edit') && <button className="btn primary" onClick={() => setShow(true)}><Icon name="plus" />New employee</button>}
      </PageHead>
      <Tabs tabs={[{ id: 'directory', label: 'Directory', count: emps.length }, ...(can('performance.view') ? [{ id: 'scorecards' as const, label: 'Scorecards' }] : [])]} value={tab} onChange={setTab} />
      {tab === 'directory' && (
        <Card flush>
          <DataTable<Employee> rows={emps} rowKey={(e) => e.id} onRow={(e) => nav(`/employees/${e.id}`)} exportTitle="Employee directory"
            filters={<><select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="">All departments</option>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{['probationary', 'regular', 'contractual', 'inactive'].map((d) => <option key={d}>{d}</option>)}</select></>}
            cols={[
              { key: 'code', header: 'ID', value: (e) => e.code }, { key: 'name', header: 'Name', value: (e) => e.full_name, render: (e) => <div><b>{e.full_name}</b><div className="small muted">{e.position}</div></div> },
              { key: 'tier', header: 'Tier', value: (e) => e.tier }, { key: 'dept', header: 'Department', value: (e) => e.department },
              { key: 'status', header: 'Status', value: (e) => e.status, render: (e) => <Badge>{e.status}</Badge> }, { key: 'hire', header: 'Hired', value: (e) => e.hire_date, render: (e) => fmtDate(e.hire_date) },
              ...(pay ? [{ key: 'rate', header: 'Rate', num: true, value: (e: Employee) => (e.pay_basis === 'daily' ? e.daily_rate : e.monthly_salary), render: (e: Employee) => `${money(e.pay_basis === 'daily' ? e.daily_rate : e.monthly_salary)}${e.pay_basis === 'daily' ? '/day' : '/mo'}` }, { key: 'pt', header: 'Payroll', value: (e: Employee) => e.payroll_type }] : []),
              { key: 'docs', header: 'Compliance', value: (e) => (expiring(e) ? 'Expiring' : 'OK'), render: (e) => (expiring(e) ? <Badge tone="amber">Docs expiring</Badge> : <Badge tone="green">OK</Badge>) },
            ]} />
        </Card>
      )}
      {tab === 'scorecards' && (
        <Card flush>
          <DataTable rows={emps.filter((e) => e.status !== 'inactive' && e.department === 'Field Operations')} rowKey={(e) => e.id} onRow={(e) => nav(`/employees/${e.id}`)} exportTitle={`Employee scorecards ${month}`} initialSort={{ key: 'score', dir: -1 }}
            filters={<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 'auto' }} aria-label="Month" />}
            cols={[
              { key: 'name', header: 'Employee', value: (e) => e.full_name }, { key: 'pos', header: 'Position', value: (e) => e.position },
              ...(['attendanceRate', 'punctuality', 'safety', 'equipmentCare', 'teamwork', 'supervisor'] as const).map((k) => ({ key: k, header: { attendanceRate: 'Attendance %', punctuality: 'Punctuality %', safety: 'Safety', equipmentCare: 'Equip. care', teamwork: 'Teamwork', supervisor: 'Supervisor' }[k], num: true, type: 'num' as const, value: (e: Employee) => scorecard(db, e, month)[k] })),
              { key: 'jobs', header: 'Jobs', num: true, value: (e) => scorecard(db, e, month).jobsCompleted },
              { key: 'rating', header: 'Client rating', num: true, value: (e) => scorecard(db, e, month).clientRating },
              { key: 'score', header: 'Score', num: true, type: 'num', value: (e) => scorecard(db, e, month).score, render: (e) => { const s = scorecard(db, e, month); return <div style={{ minWidth: 90 }}><b>{s.score}</b><Bar value={s.score} tone={s.score >= 85 ? 'good' : s.score >= 70 ? undefined : 'bad'} /></div>; } },
              { key: 'tier', header: 'Performance tier', value: (e) => scorecard(db, e, month).tier, render: (e) => <Badge>{scorecard(db, e, month).tier}</Badge> },
            ]} />
        </Card>
      )}
      {show && <EmployeeForm onClose={() => setShow(false)} />}
    </>
  );
}
const addD = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
