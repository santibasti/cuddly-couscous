// Explains who a payroll period includes (by the employee's Payroll type) and warns when nobody would be in it.
import { useAuth } from '@/lib/store';
import { payrollEligible, payrollTypeCounts } from '@/lib/business';
import type { PayrollPeriod } from '@/lib/types';

export function PayrollWho({ type, start, end, run }: { type: PayrollPeriod['type']; start: string; end: string; run?: boolean }) {
  const { db } = useAuth();
  const people = payrollEligible(db, { type, start, end }); const n = people.length; const jobCrew = people.filter((e) => e.pay_basis === 'per_job').length; const counts = payrollTypeCounts(db);
  const by = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
  if (n > 0) return <div className="small muted">{run ? 'Includes' : 'Will include'} {n} employee{n === 1 ? '' : 's'}: {jobCrew} paid per job order (the crew present on job orders in these dates, whatever their Payroll type) and {n - jobCrew} whose Payroll type is <b>{type}</b>.</div>;
  return <div className="alert warn">Nobody would be in this payroll. Crew paid per job order appear when they were present on a job order in these dates (their attendance must be clocked in{' '}and approved to be paid). Other employees appear when their Payroll type matches <b>{type}</b>; right now: {by}.</div>;
}
