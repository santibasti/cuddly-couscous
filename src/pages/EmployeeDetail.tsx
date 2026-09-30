import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, PhotoInput, Stat, Tabs, Bar, attempt, useObj } from '@/components/ui';
import { EmployeeForm } from './Employees';
import { scorecard } from '@/lib/business';
import { addDays, diffDays, fmtDate, fmtStamp, fmtTime, money, today } from '@/lib/util';
import type { EmployeeDoc, PerfReview, Training } from '@/lib/types';

type Tab = 'profile' | 'docs' | 'score' | 'attendance';

const expiryBadge = (d?: string) => {
  if (!d) return <Badge tone="gray">No expiry</Badge>;
  const n = diffDays(d, today());
  return n < 0 ? <Badge tone="red">Expired {fmtDate(d)}</Badge> : n <= 30 ? <Badge tone="amber">Expires in {n}d</Badge> : <Badge tone="green">Valid to {fmtDate(d)}</Badge>;
};

export default function EmployeeDetail() {
  const { id } = useParams();
  const { db, can } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');
  const [edit, setEdit] = useState(false);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [review, setReview] = useState(false);
  const [docForm, setDocForm] = useState<'doc' | 'training' | null>(null);
  const e = db.employees.find((x) => x.id === id);
  if (!e) return <div className="alert warn">Employee not found. <Link to="/employees">Back</Link></div>;
  const pay = can('employees.pay');
  const sc = scorecard(db, e, month);
  const atts = live(db.attendance).filter((a) => a.employee_id === e.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const advances = live(db.adjustments).filter((a) => a.employee_id === e.id && ['Cash Advance', 'Loan'].includes(a.kind));
  const setDocs = (documents: EmployeeDoc[]) => attempt(() => store.update('employees', e.id, { documents }), 'Documents updated');

  const Metric = ({ k, v, unit = '%' }: { k: string; v: number; unit?: string }) => <div><div className="row between"><span className="muted small">{k}</span><b>{v}{unit}</b></div><Bar value={v} tone={v >= 85 ? 'good' : v >= 70 ? undefined : 'bad'} /></div>;

  return (
    <>
      <PageHead title={e.full_name} sub={<>{e.code} · {e.position} · <Badge>{e.status}</Badge></>}>
        <Link to="/employees" className="btn">← Employees</Link>
        {can('employees.edit') && <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" />Edit</button>}
      </PageHead>
      <Tabs tabs={[{ id: 'profile', label: 'Profile' }, { id: 'docs', label: 'Documents & training' }, ...(can('performance.view') ? [{ id: 'score' as const, label: 'Scorecard' }] : []), { id: 'attendance', label: 'Attendance' }]} value={tab} onChange={setTab} />

      {tab === 'profile' && (
        <div className="grid g2">
          <Card title="Employment">
            <dl className="kv"><dt>Employee ID</dt><dd>{e.code}</dd><dt>Tier / position</dt><dd>{e.tier} · {e.position}</dd><dt>Department</dt><dd>{e.department}</dd><dt>Branch</dt><dd>{db.branches.find((b) => b.id === e.branch_id)?.name}</dd><dt>Hire date</dt><dd>{fmtDate(e.hire_date)}</dd>
              <dt>Shift</dt><dd>{e.shift_start}–{e.shift_end} · rest day {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][e.rest_day]}</dd><dt>Mobile</dt><dd>{e.mobile}</dd>
              <dt>Emergency contact</dt><dd>{e.emergency_name} · {e.emergency_mobile}</dd><dt>Created</dt><dd>{fmtStamp(e.created_at)}</dd><dt>Updated</dt><dd>{fmtStamp(e.updated_at)}</dd></dl>
          </Card>
          {pay ? (
            <Card title="Compensation & government IDs">
              <dl className="kv"><dt>Pay</dt><dd>{e.pay_basis === 'daily' ? `${money(e.daily_rate)} / day` : `${money(e.monthly_salary)} / month`}</dd><dt>Payroll type</dt><dd>{e.payroll_type}</dd><dt>Payout</dt><dd>{e.payout_method} · {e.bank_name} {e.bank_account}</dd>
                <dt>SSS</dt><dd>{e.sss}</dd><dt>PhilHealth</dt><dd>{e.philhealth}</dd><dt>Pag-IBIG</dt><dd>{e.pagibig}</dd><dt>TIN</dt><dd>{e.tin}</dd></dl>
              {advances.length > 0 && <><h3 style={{ margin: '14px 0 6px' }}>Cash advances & loans</h3><ul className="list">{advances.map((a) => <li key={a.id}><span>{a.kind}: {a.note}</span><span className="mono">{money(a.balance ?? 0)} left {a.active ? '' : '(paid)'}</span></li>)}</ul></>}
            </Card>
          ) : <Card title="Compensation"><div className="muted">Pay, bank and government ID fields are restricted to Finance and the Owner.</div></Card>}
        </div>
      )}

      {tab === 'docs' && (
        <div className="grid g2">
          <Card title="Required documents" actions={can('employees.edit') && <button className="btn sm" onClick={() => setDocForm('doc')}><Icon name="plus" />Add</button>} flush>
            <ul className="list">{e.documents.map((d, i) => (
              <li key={i}><div><b>{d.name}</b>{d.number && <span className="muted small"> · {d.number}</span>}<div>{expiryBadge(d.expires)} {!d.file && !d.expires && <Badge tone="amber">No file on record</Badge>}{d.file && <a href={d.file} download={`${d.name}.jpg`} className="small">view file</a>}</div></div>
                {can('employees.edit') && <span className="row"><PhotoInput label="Upload" accept="image/*,application/pdf" onAdd={(data) => setDocs(e.documents.map((x, k) => (k === i ? { ...x, file: data } : x)))} /><button className="btn sm danger" onClick={() => setDocs(e.documents.filter((_, k) => k !== i))}>Remove</button></span>}</li>
            ))}{!e.documents.length && <li className="muted">No documents.</li>}</ul>
          </Card>
          <Card title="Training & certifications" actions={can('employees.edit') && <button className="btn sm" onClick={() => setDocForm('training')}><Icon name="plus" />Add</button>} flush>
            <ul className="list">{e.trainings.map((t, i) => (
              <li key={i}><div><b>{t.name}</b><div className="small muted">Completed {fmtDate(t.completed_on)} · {t.hours} h</div>{expiryBadge(t.expires)}</div>
                {can('employees.edit') && <button className="btn sm danger" onClick={() => attempt(() => store.update('employees', e.id, { trainings: e.trainings.filter((_, k) => k !== i) }))}>Remove</button>}</li>
            ))}{!e.trainings.length && <li className="muted">No trainings recorded.</li>}</ul>
          </Card>
        </div>
      )}

      {tab === 'score' && can('performance.view') && (
        <div className="stack">
          <div className="row"><input type="month" value={month} onChange={(x) => setMonth(x.target.value)} style={{ width: 'auto' }} aria-label="Month" />{can('performance.edit') && <button className="btn" onClick={() => setReview(true)}>{sc.hasReview ? 'Edit' : 'Add'} monthly review</button>}</div>
          <div className="grid g4 keep2"><Stat k="Monthly score" v={sc.score} tone={sc.score >= 85 ? 'good' : sc.score >= 70 ? undefined : 'bad'} /><Stat k="Performance tier" v={<span style={{ fontSize: 16 }}>{sc.tier}</span>} tone="navy" /><Stat k="Jobs completed" v={sc.jobsCompleted} /><Stat k="Client rating" v={sc.clientRating ? `${(sc.clientRating / 20).toFixed(1)} / 5` : '—'} /></div>
          <Card title="Scorecard breakdown">
            <div className="grid g2" style={{ gap: 18 }}>
              <Metric k="Attendance rate" v={sc.attendanceRate} /><Metric k="Punctuality" v={sc.punctuality} /><Metric k="Job quality / client rating" v={sc.clientRating} /><Metric k="Safety compliance" v={sc.safety} />
              <Metric k="Equipment care" v={sc.equipmentCare} /><Metric k="Material wastage control" v={sc.wastage} /><Metric k="Teamwork" v={sc.teamwork} /><Metric k="Supervisor rating" v={sc.supervisor} />
            </div>
            <hr style={{ border: 0, borderTop: '1px solid var(--line-2)', margin: '16px 0' }} />
            <dl className="kv"><dt>Training completed</dt><dd>{sc.training} this month</dd><dt>Disciplinary record</dt><dd>{sc.disciplinary || 'None'}</dd><dt>Incentive / penalty</dt><dd>{money(sc.incentive)} / {money(sc.penalty)}</dd></dl>
            {!sc.hasReview && <div className="alert info" style={{ marginTop: 10 }}>No supervisor review for this month yet — score uses attendance, punctuality and client ratings only.</div>}
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <Card flush><ul className="list">{atts.map((a) => (
          <li key={a.id}><div><b>{fmtDate(a.date)}</b> <span className="muted small">{a.kind === 'Present' ? `${fmtTime(a.clock_in)} – ${fmtTime(a.clock_out)} · ${a.worked_hours} h` : a.kind}</span>{a.late_min > db.settings.grace_minutes && <> <Badge tone="amber">Late {a.late_min}m</Badge></>}{a.ot_min > 0 && <> <Badge tone="teal">OT {a.ot_min / 60}h</Badge></>}</div><Badge>{a.approval}</Badge></li>
        ))}</ul></Card>
      )}

      {edit && <EmployeeForm initial={e} onClose={() => setEdit(false)} />}
      {review && <ReviewModal empId={e.id} month={month} onClose={() => setReview(false)} />}
      {docForm === 'doc' && <DocModal onClose={() => setDocForm(null)} onSave={(d) => { setDocs([...e.documents, d]); setDocForm(null); }} />}
      {docForm === 'training' && <TrainingModal onClose={() => setDocForm(null)} onSave={(t) => { attempt(() => store.update('employees', e.id, { trainings: [...e.trainings, t] }), 'Training added'); setDocForm(null); }} />}
    </>
  );
}

function DocModal({ onClose, onSave }: { onClose: () => void; onSave: (d: EmployeeDoc) => void }) {
  const f = useObj({ name: '', number: '', expires: '' });
  return <Modal title="Add document" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.v.name.trim()} onClick={() => onSave({ name: f.v.name, number: f.v.number || undefined, expires: f.v.expires || undefined })}>Add</button></>}><div className="form-grid"><Field label="Document" required><input {...f.bind('name')} placeholder="e.g. Driver's license" /></Field><Field label="Number"><input {...f.bind('number')} /></Field><Field label="Expiry date"><input type="date" {...f.bind('expires')} /></Field></div></Modal>;
}
function TrainingModal({ onClose, onSave }: { onClose: () => void; onSave: (t: Training) => void }) {
  const f = useObj({ name: '', completed_on: today(), expires: '', hours: 8 });
  return <Modal title="Add training / certification" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.v.name.trim()} onClick={() => onSave({ name: f.v.name, completed_on: f.v.completed_on, expires: f.v.expires || undefined, hours: f.v.hours })}>Add</button></>}><div className="form-grid"><Field label="Training" required className="full"><input {...f.bind('name')} placeholder="e.g. Working-at-Heights Safety" /></Field><Field label="Completed on"><input type="date" {...f.bind('completed_on')} /></Field><Field label="Certification expires"><input type="date" {...f.bind('expires')} /></Field><Field label="Hours"><input type="number" {...f.bind('hours')} /></Field></div></Modal>;
}
function ReviewModal({ empId, month, onClose }: { empId: string; month: string; onClose: () => void }) {
  const { db } = useAuth();
  const cur = db.reviews.find((r) => r.employee_id === empId && r.month === month && !r.deleted_at);
  const f = useObj<Omit<PerfReview, 'id' | 'created_at' | 'updated_at' | 'created_by'>>(() => cur ?? { employee_id: empId, month, quality: 85, safety: 90, equipment_care: 85, teamwork: 85, supervisor: 85, training_completed: 0, disciplinary: '', incentive: 0, penalty: 0, notes: '' });
  const num = (k: 'quality' | 'safety' | 'equipment_care' | 'teamwork' | 'supervisor', l: string) => <Field label={`${l} (0–100)`}><input type="number" min={0} max={100} {...f.bind(k)} /></Field>;
  return (
    <Modal title={`Monthly review – ${month}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { attempt(() => (cur ? store.update('reviews', cur.id, f.v) : store.insert('reviews', f.v)), 'Review saved'); onClose(); }}>Save</button></>}>
      <div className="form-grid">{num('quality', 'Job quality')}{num('safety', 'Safety compliance')}{num('equipment_care', 'Equipment care')}{num('teamwork', 'Teamwork')}{num('supervisor', 'Supervisor rating')}
        <Field label="Trainings completed"><input type="number" min={0} {...f.bind('training_completed')} /></Field><Field label="Incentive (₱)"><input type="number" min={0} {...f.bind('incentive')} /></Field><Field label="Penalty (₱)"><input type="number" min={0} {...f.bind('penalty')} /></Field>
        <Field label="Disciplinary record" className="full"><input {...f.bind('disciplinary')} /></Field></div>
    </Modal>
  );
}
void addDays;
