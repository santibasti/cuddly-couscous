// Stage 8 — Expenses & internal close. After the service, Admin / Finance enters everything that was spent on the job
// (gas, toll, parking, meals, supplies bought on the way) with receipts, then closes the job internally so its cost is exact.
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { JOB_EXPENSE_PRESETS, addJobExpense, closeJobInternally, jobExpenses, reopenJobInternally, reverseExpense } from '@/lib/actions';
import { isDone } from '@/lib/business';
import { Badge, Card, Field, PhotoInput, ask, attempt } from '@/components/ui';
import { fmtDate, fmtStamp, money, sum, today } from '@/lib/util';
import type { ExpenseCategory, ExpenseMethod, Job } from '@/lib/types';

const METHODS: ExpenseMethod[] = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card', 'Check', 'Other'];
const blank = (date = today()) => ({ preset: 0, category: JOB_EXPENSE_PRESETS[0].category as ExpenseCategory, payee: JOB_EXPENSE_PRESETS[0].payee, amount: '', date, method: 'Cash' as ExpenseMethod, petty: false, receipt: '' as string, notes: '' });

export function JobExpensesPanel({ job }: { job: Job }) {
  const { db, can, user } = useAuth();
  const [f, setF] = useState(blank(job.start_at.slice(0, 10)));
  const [none, setNone] = useState(false); const [notes, setNotes] = useState('');
  if (!can('expenses.view') && !can('jobs.close_internal')) return null;
  if (!isDone(job.status)) return null;                         // appears once the service is completed
  const list = jobExpenses(db, job.id); const total = sum(list, (e) => e.amount);
  const closed = !!job.internal_closed_at; const ready = job.status === 'Closed';
  const canEnter = can('expenses.edit') && !closed; const canClose = can('jobs.close_internal') && !closed;
  const by = db.users.find((u) => u.id === job.internal_closed_by)?.name;
  const byCat = [...new Set(list.map((e) => e.category))].map((c) => [c, sum(list.filter((e) => e.category === c), (e) => e.amount)] as const);
  const set = (p: Partial<ReturnType<typeof blank>>) => setF((x) => ({ ...x, ...p }));
  const add = () => attempt(() => { addJobExpense(job.id, { category: f.category, payee: f.payee, amount: Number(f.amount), date: f.date, method: f.method, petty_cash: f.petty, receipt: f.receipt || undefined, notes: f.notes }); setF({ ...blank(job.start_at.slice(0, 10)), preset: f.preset, category: f.category, payee: f.payee }); setNone(false); }, 'Expense added');
  return (
    <Card title="Stage 8 — Expenses & internal close" actions={closed ? <Badge tone="green">Closed internally</Badge> : ready ? <Badge tone="amber">Open — enter expenses</Badge> : <Badge tone="gray">Waiting for operational close-out</Badge>}>
      {!closed && !ready && <div className="small muted" style={{ marginBottom: 8 }}>Expenses can be entered now. The job can be closed internally after the team finishes the close-out (equipment return and arrival at HQ).</div>}
      {closed && <div className="alert info" style={{ marginBottom: 10 }}><b>Closed internally</b> on {fmtStamp(job.internal_closed_at!)}{by ? ` by ${by}` : ''} — total expenses <b>{money(job.internal_expense_total ?? total)}</b>{job.internal_no_expenses ? ' (no expenses)' : ''}.{job.internal_notes ? <div className="small">{job.internal_notes}</div> : null}
        {user?.role === 'owner' && <div style={{ marginTop: 6 }}><button className="btn sm" onClick={async () => { const r = await ask('Reopen this job', 'Reason (e.g. a receipt was missed)', { required: true }); if (r) attempt(() => reopenJobInternally(job.id, r), 'Job reopened'); }}>Reopen (Owner)</button></div>}</div>}

      {canEnter && <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>{JOB_EXPENSE_PRESETS.map((p, i) => <button key={p.label} type="button" className={f.preset === i ? 'btn sm primary' : 'btn sm'} onClick={() => set({ preset: i, category: p.category, payee: p.payee })}>{p.label}</button>)}</div>
        <div className="form-grid">
          <Field label="What was it for?" required><input value={f.payee} onChange={(e) => set({ payee: e.target.value })} placeholder="e.g. NLEX toll, Shell Alabang, crew lunch" /></Field>
          <Field label="Amount (₱)" required><input type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></Field>
          <Field label="Date"><input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Paid by"><select value={f.method} onChange={(e) => set({ method: e.target.value as ExpenseMethod })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Category"><select value={f.category} onChange={(e) => set({ category: e.target.value as ExpenseCategory })}>{(['Fuel', 'Toll & Parking', 'Meals & Snacks', 'Materials', 'Transportation', 'Equipment Repair', 'Subcontractor', 'Other'] as ExpenseCategory[]).map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Note (optional)"><input value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        </div>
        <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={f.petty} onChange={(e) => set({ petty: e.target.checked })} />Paid from petty cash</label>
        <div className="row" style={{ marginTop: 8, gap: 10, flexWrap: 'wrap' }}><PhotoInput label={f.receipt ? 'Replace receipt photo' : 'Add receipt photo'} accept="image/*" capture="environment" onAdd={(d) => set({ receipt: d })} />{f.receipt && <img src={f.receipt} alt="Receipt" style={{ height: 48, borderRadius: 4 }} />}
          <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={add} disabled={!f.payee.trim() || !(Number(f.amount) > 0)}>+ Add expense</button></div>
      </div>}

      <div className="table-wrap"><table className="tbl"><thead><tr><th>Date</th><th>What</th><th>Category</th><th className="num">Amount</th><th></th></tr></thead>
        <tbody>{list.map((e) => <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{e.payee}{e.petty_cash && <span className="small muted"> · petty cash</span>}{e.approval === 'Pending' && <> <Badge tone="amber">Pending approval</Badge></>}{e.receipt && <> <a href={e.receipt} target="_blank" rel="noreferrer" className="small">receipt</a></>}</td><td>{e.category}</td><td className="num">{money(e.amount)}</td>
          <td>{!closed && e.approval === 'Approved' && can('expenses.approve') && <button className="btn sm" onClick={async () => { const r = await ask('Remove expense', 'Reason', { required: true }); if (r) attempt(() => reverseExpense(e.id, r), 'Expense reversed'); }}>Remove</button>}</td></tr>)}
          {!list.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 14 }}>No expenses entered yet.</td></tr>}</tbody>
        {list.length > 0 && <tfoot><tr><td colSpan={3}><b>Total expenses</b>{byCat.length > 1 && <span className="small muted"> — {byCat.map(([c, v]) => `${c} ${money(v)}`).join(' · ')}</span>}</td><td className="num"><b>{money(total)}</b></td><td></td></tr></tfoot>}
      </table></div>

      {canClose && <div style={{ marginTop: 12 }}>
        {!list.length && <label className="check"><input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} />No expenses for this job</label>}
        <Field label="Internal notes (optional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. toll receipts attached, snacks paid by the leader" /></Field>
        <button className="btn navy lg" style={{ marginTop: 8 }} disabled={!ready} title={ready ? undefined : 'Available after the team finishes the operational close-out'} onClick={() => attempt(() => closeJobInternally(job.id, { noExpenses: none && !list.length, notes }), 'Job closed internally')}>Close job internally</button>
        {!ready && <span className="small muted"> Waiting for the team's close-out.</span>}
      </div>}
    </Card>
  );
}
