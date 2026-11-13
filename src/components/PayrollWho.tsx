// Explains who a payroll period includes (by the employee's Payroll type) and warns when nobody would be in it.
import { useAuth } from '@/lib/store';
import { payrollEligible, payrollTypeCounts } from '@/lib/business';
import type { PayrollPeriod } from '@/lib/types';

export function PayrollWho({ type, end, run }: { type: PayrollPeriod['type']; end: string; run?: boolean }) {
  const { db } = useAuth();
  const n = payrollEligible(db, type, end).length; const counts = payrollTypeCounts(db);
  const by = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
  if (n > 0) return <div className="small muted">{run ? 'Includes' : 'Will include'} the {n} active employee{n === 1 ? '' : 's'} whose Payroll type is <b>{type}</b>.</div>;
  return <div className="alert warn">No active employee has the Payroll type <b>{type}</b>, so this payroll would be empty. A period includes only employees whose Payroll type (set on each employee: daily, weekly, biweekly or monthly) matches the period type. Right now: {by}. Create a period of the matching type, or change the Payroll type on the employees.</div>;
}
