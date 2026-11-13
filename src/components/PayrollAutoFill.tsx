// Creates the weekly payroll (Monday to Sunday) when the week starts and keeps the draft payrolls filled in from attendance by itself
// (for people who can edit payroll): nobody has to create a period or press Generate.
import { useEffect } from 'react';
import { CLOUD } from '@/lib/cloud';
import { store, useAuth, useBoot } from '@/lib/store';
import { autoFillPayroll, ensureWeeklyPeriods } from '@/lib/actions';

export function PayrollAutoFill() {
  const { db, can } = useAuth(); const boot = useBoot();
  useEffect(() => {
    if (boot !== 'ready' || !can('payroll.edit')) return;
    const t = setTimeout(() => {
      // on the live site only from data that was just fetched: never fill a payroll from an old copy kept on this device
      if (CLOUD && Date.now() - store.lastPull > 180_000) return;
      try { ensureWeeklyPeriods(); autoFillPayroll(); } catch { /* it is tried again on the next change */ }
    }, 2500);
    return () => clearTimeout(t);
  }, [boot, db.attendance, db.jobs, db.workflows, db.employees, db.holidays, db.adjustments, db.periods, db.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
