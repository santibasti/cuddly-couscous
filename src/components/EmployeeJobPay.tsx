// An employee's job orders and what each paid: the job pay (for people paid per job order) and the bonuses recorded under them.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card } from '@/components/ui';
import { useAuth } from '@/lib/store';
import { employeeJobPay } from '@/lib/jobpay';
import { addDays, fmtDate, money, sum, today } from '@/lib/util';
import type { Employee } from '@/lib/types';

export function EmployeeJobPay({ emp }: { emp: Employee }) {
  const { db } = useAuth();
  const [from, setFrom] = useState(addDays(today(), -30)); const [to, setTo] = useState(today());
  const rows = useMemo(() => employeeJobPay(db, emp, from, to), [db, emp, from, to]);
  const t = (k: 'rate' | 'panel_bonus' | 'outside_bonus' | 'commercial_bonus' | 'total') => sum(rows, (r) => r[k]);
  return (
    <Card title="Job orders & bonuses" actions={<div className="row" style={{ gap: 6 }}><input type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /><input type="date" aria-label="To" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></div>}>
      <div className="small muted" style={{ marginBottom: 8 }}>{emp.pay_basis === 'per_job' ? `Paid ${money(emp.job_rate ?? 0)} for every job order attended (late or not). ` : ''}Bonuses are added once the job's panel count is final. Only approved attendance counts.</div>
      <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Date</th><th>Job order</th>{emp.pay_basis === 'per_job' && <th className="num">Job pay</th>}<th className="num">Panel bonus</th><th className="num">Outside MM</th><th className="num">Commercial</th><th className="num">Total</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.job_id}><td>{fmtDate(r.date)}</td><td><Link to={`/jobs/${r.job_id}`}><b>{r.number}</b></Link><div className="small muted">{r.client}</div></td>{emp.pay_basis === 'per_job' && <td className="num">{money(r.rate)}</td>}<td className="num">{r.final ? money(r.panel_bonus) : <Badge tone="gray">not final</Badge>}</td><td className="num">{r.outside_bonus ? money(r.outside_bonus) : '—'}</td><td className="num">{r.commercial_bonus ? money(r.commercial_bonus) : '—'}</td><td className="num"><b>{money(r.total)}</b></td></tr>)}
          {!rows.length && <tr><td colSpan={7} className="muted">No job orders attended in this range.</td></tr>}
        </tbody>
        {rows.length > 0 && <tfoot><tr><th colSpan={2}>Total · {rows.length} job order{rows.length === 1 ? '' : 's'}</th>{emp.pay_basis === 'per_job' && <th className="num">{money(t('rate'))}</th>}<th className="num">{money(t('panel_bonus'))}</th><th className="num">{money(t('outside_bonus'))}</th><th className="num">{money(t('commercial_bonus'))}</th><th className="num">{money(t('total'))}</th></tr></tfoot>}
      </table></div>
    </Card>
  );
}
