import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { store, useAuth } from '@/lib/store';
import { Badge, Card, Icon, PageHead, Stat, attempt, ask } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { PayrollWho } from '@/components/PayrollWho';
import { approvePayroll, deletePeriod, finalizePayroll, generateRun, returnPayroll, submitPayroll } from '@/lib/actions';
import { buildPayrollLines } from '@/lib/business';
import { payslipPdf } from '@/lib/export';
import { fmtDate, fmtStamp, money, sum } from '@/lib/util';
import type { JobPayRow, PayrollLine } from '@/lib/types';

const STEPS = ['Draft', 'For Approval', 'Approved', 'Finalized'] as const;

export default function PayrollDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const { db, can } = useAuth();
  const per = db.periods.find((p) => p.id === id);
  if (!per) return <div className="alert warn">Payroll period not found. <Link to="/payroll">Back</Link></div>;
  const [full, setFull] = useState(false);
  const run = db.runs.find((r) => r.period_id === per.id);
  const lines = run?.lines ?? [];
  const pendingNow = per.status === 'Draft' ? buildPayrollLines(db, per).pending : 0;
  const t = (k: keyof PayrollLine) => sum(lines, (l) => l[k] as number);
  const name = (l: PayrollLine) => db.employees.find((e) => e.id === l.employee_id)?.full_name ?? '';
  const idx = STEPS.indexOf(per.status);
  const exp = per.expense_id ? db.expenses.find((e) => e.id === per.expense_id) : undefined;
  const who = (id?: string) => db.users.find((u) => u.id === id)?.name ?? '—';

  // the compact view: what each person earned for the work (daily / job-order pay), the three job bonuses, and the total
  const bonusOf = (l: PayrollLine, k: 'panel_bonus' | 'outside_bonus' | 'commercial_bonus') => sum(l.job_pay ?? [], (r) => r[k]);
  const jobBonusTotal = (l: PayrollLine) => bonusOf(l, 'panel_bonus') + bonusOf(l, 'outside_bonus') + bonusOf(l, 'commercial_bonus');
  const daily = (l: PayrollLine) => Math.round((l.gross - l.allowances - l.incentives - l.reimbursements) * 100) / 100;
  const other = (l: PayrollLine) => Math.round((l.allowances + (l.incentives - jobBonusTotal(l)) + l.reimbursements) * 100) / 100;
  const hasOther = lines.some((l) => Math.abs(other(l)) > 0.004);
  const rateNote = (l: PayrollLine) => { const e = db.employees.find((x) => x.id === l.employee_id); if (!e) return ''; return e.pay_basis === 'per_job' ? `${l.job_pay?.length ?? 0} job order${(l.job_pay?.length ?? 0) === 1 ? '' : 's'} × ${money(e.job_rate ?? 0)}` : e.pay_basis === 'daily' ? `${l.days_worked} day${l.days_worked === 1 ? '' : 's'} × ${money(e.daily_rate)}` : 'monthly salary'; };
  const money2 = (k: keyof PayrollLine, h: string) => ({ key: k as string, header: h, num: true, type: 'money' as const, value: (l: PayrollLine) => l[k] as number, render: (l: PayrollLine) => ((l[k] as number) ? money(l[k] as number) : '—') });
  return (
    <>
      <PageHead title={<>{per.locked && <Icon name="lock" size={18} />} {per.label} <Badge>{per.status}</Badge></>} sub={`${fmtDate(per.start)} – ${fmtDate(per.end)} · ${per.type} payroll`}>
        <Link to="/payroll" className="btn">← Payroll</Link>
        {per.status === 'Draft' && can('payroll.edit') && <button className="btn navy" onClick={() => { const r = attempt(() => generateRun(per.id)) as { pending: number; employees: number } | undefined; if (r) attempt(() => { if (r.pending) throw new Error(`Calculated ${r.employees} employees. ${r.pending} attendance record(s) still need approval before you can submit.`); }); }}><Icon name="attendance" />{run ? 'Recalculate from attendance' : 'Generate from attendance'}</button>}
        {per.status === 'Draft' && can('payroll.edit') && run && <button className="btn primary" onClick={() => attempt(() => submitPayroll(per.id), 'Submitted for approval')}>Submit for approval</button>}
        {per.status === 'For Approval' && can('payroll.approve') && <><button className="btn" onClick={async () => { const n = await ask('Return payroll to draft', 'What needs to change?'); if (n) attempt(() => returnPayroll(per.id, n), 'Returned to draft'); }}>Return</button><button className="btn primary" onClick={() => attempt(() => approvePayroll(per.id), 'Payroll approved — expense posted')}>Approve</button></>}
        {per.status === 'Approved' && can('payroll.approve') && <button className="btn primary" onClick={async () => { const c = await ask('Finalize & lock payroll', 'Type FINALIZE to confirm — this locks the period permanently', { okLabel: 'Finalize' }); if (c === 'FINALIZE') attempt(() => finalizePayroll(per.id), 'Payroll finalized and locked'); else if (c) attempt(() => { throw new Error('Confirmation text did not match.'); }); }}><Icon name="lock" />Finalize & lock</button>}
      {((per.status === 'Draft' && can('payroll.edit')) || (per.status === 'For Approval' && can('payroll.approve'))) && <button className="btn danger" onClick={() => { if (confirm(`Delete the payroll period "${per.label}"? Its calculated payroll is removed too.`) && attempt(() => deletePeriod(per.id), 'Payroll period deleted')) nav('/payroll'); }}><Icon name="trash" size={14} />Delete</button>}
      </PageHead>

      <Card>
        <div className="row" style={{ gap: 4 }}>{STEPS.map((s, i) => <div key={s} style={{ flex: '1 1 120px' }}><div style={{ height: 6, borderRadius: 3, background: i <= idx ? 'var(--teal)' : 'var(--gray-bg)' }} /><div className="small" style={{ marginTop: 4, fontWeight: i === idx ? 700 : 500, color: i <= idx ? 'var(--navy)' : 'var(--muted)' }}>{s}</div></div>)}</div>
        <div className="small muted" style={{ marginTop: 8 }}>Created {fmtStamp(per.created_at)} by {who(per.created_by)}{per.submitted_by && ` · submitted by ${who(per.submitted_by)}`}{per.approved_at && ` · approved ${fmtStamp(per.approved_at)} by ${who(per.approved_by)}`}{per.finalized_at && ` · finalized ${fmtStamp(per.finalized_at)} by ${who(per.finalized_by)}`}</div>
      </Card>
      <div style={{ height: 12 }} />
      {pendingNow > 0 && <div className="alert warn" style={{ marginBottom: 12 }}>{pendingNow} attendance record(s) in this period are pending approval and are excluded from the calculation. <Link to="/attendance">Review attendance</Link></div>}
      {(per.status === 'Draft' || (run && lines.length === 0 && per.status !== 'Finalized')) && <div style={{ marginBottom: 10 }}><PayrollWho type={per.type} start={per.start} end={per.end} run={!!run} /></div>}
      {!run && <div className="alert info" style={{ marginBottom: 12 }}>No payroll has been generated yet. Click “Generate from attendance” to pull approved attendance for {per.type} employees.</div>}
      {run && (
        <>
          <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
            <Stat k="Employees" v={lines.length} /><Stat k="Gross pay" v={money(t('gross'))} tone="navy" /><Stat k="Total deductions" v={money(t('total_deductions'))} tone="warn" /><Stat k="Net pay" v={money(t('net'))} tone="good" />
          </div>
          {exp && <div className="alert info" style={{ marginBottom: 12 }}>Payroll expense of <b>{money(exp.amount)}</b> posted to Expenses on {fmtDate(exp.date)} (category Payroll) — {exp.paid ? 'marked paid' : 'unpaid until finalized'}. It flows into the P&L automatically.</div>}
          <Card title="Payroll" flush actions={<button type="button" className="btn sm" onClick={() => setFull(!full)}>{full ? 'Hide' : 'Show'} full register (deductions, net pay)</button>}>
            <DataTable<PayrollLine> rows={lines} rowKey={(l) => l.employee_id} exportTitle={`Payroll ${per.label}`} pageSize={25}
              totals={['Total', money(sum(lines, daily)), money(sum(lines, (l) => bonusOf(l, 'panel_bonus'))), money(sum(lines, (l) => bonusOf(l, 'outside_bonus'))), money(sum(lines, (l) => bonusOf(l, 'commercial_bonus'))), ...(hasOther ? [money(sum(lines, other))] : []), money(t('gross'))]}
              cols={[
                { key: 'emp', header: 'Name', value: name, render: (l) => <b>{name(l)}</b> },
                { key: 'daily', header: 'Daily rate pay', num: true, type: 'money' as const, value: daily, render: (l) => <>{daily(l) ? money(daily(l)) : '—'}{rateNote(l) && <div className="small muted">{rateNote(l)}</div>}</> },
                { key: 'bonus', header: 'Bonus', num: true, type: 'money' as const, value: (l) => bonusOf(l, 'panel_bonus'), render: (l) => (bonusOf(l, 'panel_bonus') ? money(bonusOf(l, 'panel_bonus')) : '—') },
                { key: 'oot', header: 'Out of town', num: true, type: 'money' as const, value: (l) => bonusOf(l, 'outside_bonus'), render: (l) => (bonusOf(l, 'outside_bonus') ? money(bonusOf(l, 'outside_bonus')) : '—') },
                { key: 'com', header: 'Commercial', num: true, type: 'money' as const, value: (l) => bonusOf(l, 'commercial_bonus'), render: (l) => (bonusOf(l, 'commercial_bonus') ? money(bonusOf(l, 'commercial_bonus')) : '—') },
                ...(hasOther ? [{ key: 'other', header: 'Other', num: true, type: 'money' as const, value: other, render: (l: PayrollLine) => (other(l) ? money(other(l)) : '—') }] : []),
                { key: 'total', header: 'Total', num: true, type: 'money' as const, value: (l) => l.gross, render: (l) => <b>{money(l.gross)}</b> },
                { key: 'actions', header: '', noExport: true, sortable: false, render: (l) => <button className="btn sm" onClick={() => attempt(() => payslipPdf(db, per, l))}>Payslip</button> },
              ]} />
            <div className="small muted" style={{ padding: '8px 14px' }}>Total is the gross pay before deductions. {hasOther ? 'Other = allowances, other incentives and reimbursements. ' : ''}Late arrival does not reduce job-order pay. SSS, PhilHealth, Pag-IBIG, tax, cash advances and net pay are in the full register.</div>
          </Card>
          {full && <div style={{ height: 12 }} />}
          {full && <Card title="Full payroll register" flush>
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
          </Card>}
          {full && lines.some((l) => l.job_pay?.length) && (
            <>
              <div style={{ height: 12 }} />
              <Card title="Job orders & bonuses in this payroll" flush actions={<span className="small muted">Job pay is filled in from approved attendance, late or not. Bonuses are recorded under each assigned employee.</span>}>
                <DataTable<JobPayRow & { emp: string }> rows={lines.flatMap((l) => (l.job_pay ?? []).map((r) => ({ ...r, emp: l.employee_id })))} rowKey={(r) => `${r.emp}:${r.job_id}`} exportTitle={`Job orders and bonuses ${per.label}`} pageSize={25}
                  totals={['Total', '', '', sum(lines.flatMap((l) => l.job_pay ?? []), (r) => r.rate), sum(lines.flatMap((l) => l.job_pay ?? []), (r) => r.panel_bonus), sum(lines.flatMap((l) => l.job_pay ?? []), (r) => r.outside_bonus), sum(lines.flatMap((l) => l.job_pay ?? []), (r) => r.commercial_bonus), sum(lines.flatMap((l) => l.job_pay ?? []), (r) => r.total)]}
                  cols={[
                    { key: 'emp', header: 'Employee', value: (r) => db.employees.find((e) => e.id === r.emp)?.full_name ?? '', render: (r) => <b>{db.employees.find((e) => e.id === r.emp)?.full_name}</b> },
                    { key: 'date', header: 'Date', value: (r) => r.date, render: (r) => fmtDate(r.date) },
                    { key: 'job', header: 'Job order', value: (r) => r.number, render: (r) => <Link to={`/jobs/${r.job_id}`}>{r.number}</Link> },
                    { key: 'rate', header: 'Job pay', num: true, type: 'money' as const, value: (r) => r.rate, render: (r) => (r.rate ? money(r.rate) : '—') },
                    { key: 'panel', header: 'Panel bonus', num: true, type: 'money' as const, value: (r) => r.panel_bonus, render: (r) => (r.panel_bonus ? money(r.panel_bonus) : '—') },
                    { key: 'outside', header: 'Outside Metro Manila', num: true, type: 'money' as const, value: (r) => r.outside_bonus, render: (r) => (r.outside_bonus ? money(r.outside_bonus) : '—') },
                    { key: 'commercial', header: 'Commercial', num: true, type: 'money' as const, value: (r) => r.commercial_bonus, render: (r) => (r.commercial_bonus ? money(r.commercial_bonus) : '—') },
                    { key: 'total', header: 'Total', num: true, type: 'money' as const, value: (r) => r.total, render: (r) => <b>{money(r.total)}</b> },
                  ]} />
              </Card>
            </>
          )}
        </>
      )}
      <p className="small muted" style={{ marginTop: 10 }}>SSS, PhilHealth, Pag-IBIG and withholding tax use the configurable rates in Admin → Rates & settings, not hard-coded legal tables. Verify them against current government schedules before finalizing.</p>
      <span className="hide">{store.getDB().version}</span>
    </>
  );
}
