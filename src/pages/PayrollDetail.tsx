import { Link, useParams } from 'react-router-dom';
import { store, useAuth } from '@/lib/store';
import { Badge, Card, Icon, PageHead, Stat, attempt, ask } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { approvePayroll, finalizePayroll, generateRun, returnPayroll, submitPayroll } from '@/lib/actions';
import { buildPayrollLines } from '@/lib/business';
import { payslipPdf } from '@/lib/export';
import { fmtDate, fmtStamp, money, sum } from '@/lib/util';
import type { PayrollLine } from '@/lib/types';

const STEPS = ['Draft', 'For Approval', 'Approved', 'Finalized'] as const;

export default function PayrollDetail() {
  const { id } = useParams();
  const { db, can } = useAuth();
  const per = db.periods.find((p) => p.id === id);
  if (!per) return <div className="alert warn">Payroll period not found. <Link to="/payroll">Back</Link></div>;
  const run = db.runs.find((r) => r.period_id === per.id);
  const lines = run?.lines ?? [];
  const pendingNow = per.status === 'Draft' ? buildPayrollLines(db, per).pending : 0;
  const t = (k: keyof PayrollLine) => sum(lines, (l) => l[k] as number);
  const name = (l: PayrollLine) => db.employees.find((e) => e.id === l.employee_id)?.full_name ?? '';
  const idx = STEPS.indexOf(per.status);
  const exp = per.expense_id ? db.expenses.find((e) => e.id === per.expense_id) : undefined;
  const who = (id?: string) => db.users.find((u) => u.id === id)?.name ?? '—';

  const money2 = (k: keyof PayrollLine, h: string) => ({ key: k as string, header: h, num: true, type: 'money' as const, value: (l: PayrollLine) => l[k] as number, render: (l: PayrollLine) => ((l[k] as number) ? money(l[k] as number) : '—') });
  return (
    <>
      <PageHead title={<>{per.locked && <Icon name="lock" size={18} />} {per.label} <Badge>{per.status}</Badge></>} sub={`${fmtDate(per.start)} – ${fmtDate(per.end)} · ${per.type} payroll`}>
        <Link to="/payroll" className="btn">← Payroll</Link>
        {per.status === 'Draft' && can('payroll.edit') && <button className="btn navy" onClick={() => { const r = attempt(() => generateRun(per.id)) as { pending: number; employees: number } | undefined; if (r) attempt(() => { if (r.pending) throw new Error(`Calculated ${r.employees} employees. ${r.pending} attendance record(s) still need approval before you can submit.`); }); }}><Icon name="attendance" />{run ? 'Recalculate from attendance' : 'Generate from attendance'}</button>}
        {per.status === 'Draft' && can('payroll.edit') && run && <button className="btn primary" onClick={() => attempt(() => submitPayroll(per.id), 'Submitted for approval')}>Submit for approval</button>}
        {per.status === 'For Approval' && can('payroll.approve') && <><button className="btn" onClick={async () => { const n = await ask('Return payroll to draft', 'What needs to change?'); if (n) attempt(() => returnPayroll(per.id, n), 'Returned to draft'); }}>Return</button><button className="btn primary" onClick={() => attempt(() => approvePayroll(per.id), 'Payroll approved — expense posted')}>Approve</button></>}
        {per.status === 'Approved' && can('payroll.approve') && <button className="btn primary" onClick={async () => { const c = await ask('Finalize & lock payroll', 'Type FINALIZE to confirm — this locks the period permanently', { okLabel: 'Finalize' }); if (c === 'FINALIZE') attempt(() => finalizePayroll(per.id), 'Payroll finalized and locked'); else if (c) attempt(() => { throw new Error('Confirmation text did not match.'); }); }}><Icon name="lock" />Finalize & lock</button>}
      </PageHead>

      <Card>
        <div className="row" style={{ gap: 4 }}>{STEPS.map((s, i) => <div key={s} style={{ flex: '1 1 120px' }}><div style={{ height: 6, borderRadius: 3, background: i <= idx ? 'var(--teal)' : 'var(--gray-bg)' }} /><div className="small" style={{ marginTop: 4, fontWeight: i === idx ? 700 : 500, color: i <= idx ? 'var(--navy)' : 'var(--muted)' }}>{s}</div></div>)}</div>
        <div className="small muted" style={{ marginTop: 8 }}>Created {fmtStamp(per.created_at)} by {who(per.created_by)}{per.submitted_by && ` · submitted by ${who(per.submitted_by)}`}{per.approved_at && ` · approved ${fmtStamp(per.approved_at)} by ${who(per.approved_by)}`}{per.finalized_at && ` · finalized ${fmtStamp(per.finalized_at)} by ${who(per.finalized_by)}`}</div>
      </Card>
      <div style={{ height: 12 }} />
      {pendingNow > 0 && <div className="alert warn" style={{ marginBottom: 12 }}>{pendingNow} attendance record(s) in this period are pending approval and are excluded from the calculation. <Link to="/attendance">Review attendance</Link></div>}
      {!run && <div className="alert info" style={{ marginBottom: 12 }}>No payroll has been generated yet. Click “Generate from attendance” to pull approved attendance for {per.type} employees.</div>}
      {run && (
        <>
          <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
            <Stat k="Employees" v={lines.length} /><Stat k="Gross pay" v={money(t('gross'))} tone="navy" /><Stat k="Total deductions" v={money(t('total_deductions'))} tone="warn" /><Stat k="Net pay" v={money(t('net'))} tone="good" />
          </div>
          {exp && <div className="alert info" style={{ marginBottom: 12 }}>Payroll expense of <b>{money(exp.amount)}</b> posted to Expenses on {fmtDate(exp.date)} (category Payroll) — {exp.paid ? 'marked paid' : 'unpaid until finalized'}. It flows into the P&L automatically.</div>}
          <Card title="Payroll register" flush>
            <div style={{ overflowX: 'auto' }}>
              <DataTable<PayrollLine> rows={lines} rowKey={(l) => l.employee_id} exportTitle={`Payroll register ${per.label}`} pageSize={25}
                totals={['Total', sum(lines, (l) => l.days_worked), t('regular_pay'), t('late_undertime_deduction'), t('overtime_pay'), t('holiday_pay'), t('rest_day_pay'), t('leave_pay'), t('allowances'), t('incentives'), t('reimbursements'), t('gross'), t('sss'), t('philhealth'), t('pagibig'), t('wtax'), t('cash_advance'), t('loan'), t('other_deductions'), t('total_deductions'), t('net'), ''] as never}
                cols={[
                  { key: 'emp', header: 'Employee', value: name, render: (l) => <b>{name(l)}</b> }, { key: 'days', header: 'Days', num: true, value: (l) => l.days_worked },
                  money2('regular_pay', 'Regular pay'), money2('late_undertime_deduction', 'Late/UT/absent'), money2('overtime_pay', 'Overtime'), money2('holiday_pay', 'Holiday'), money2('rest_day_pay', 'Rest day'), money2('leave_pay', 'Paid leave'),
                  money2('allowances', 'Allowances'), money2('incentives', 'Incentives'), money2('reimbursements', 'Reimb.'), money2('gross', 'Gross'),
                  money2('sss', 'SSS'), money2('philhealth', 'PhilHealth'), money2('pagibig', 'Pag-IBIG'), money2('wtax', 'W/tax'), money2('cash_advance', 'Cash adv.'), money2('loan', 'Loan'), money2('other_deductions', 'Other ded.'), money2('total_deductions', 'Total ded.'), money2('net', 'NET PAY'),
                  { key: 'actions', header: '', noExport: true, sortable: false, render: (l) => <button className="btn sm" onClick={() => attempt(() => payslipPdf(db, per, l))}>Payslip</button> },
                ]} />
            </div>
          </Card>
        </>
      )}
      <p className="small muted" style={{ marginTop: 10 }}>SSS, PhilHealth, Pag-IBIG and withholding tax use the configurable rates in Admin → Rates & settings, not hard-coded legal tables. Verify them against current government schedules before finalizing.</p>
      <span className="hide">{store.getDB().version}</span>
    </>
  );
}
