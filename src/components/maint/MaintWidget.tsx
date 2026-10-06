// Maintenance summary for the dashboard: what is due, overdue, out of action, and what it will cost.
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, Card } from '@/components/ui';
import { dueState, maintStats, maintTone } from '@/lib/maintenance-core';
import { fmtDate, moneyShort, today } from '@/lib/util';

export function MaintWidget() {
  const { db, can } = useAuth(); const T = today();
  if (!can('maintenance.view')) return null;
  const st = maintStats(db, T);
  const alerts = [...new Map([...st.overdue, ...st.urgent].map((r) => [r.id, r])).values()];
  const cell = (k: string, v: React.ReactNode, s?: string, tone?: string) => <Link to="/maintenance" className={`kpi glass ${tone ?? ''}`}><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</Link>;
  return (
    <Card title="Maintenance" actions={<Link to="/maintenance" className="btn sm">Open</Link>}>
      <div className="exec-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 10 }}>
        {cell('Due this week', st.dueWeek.length)}
        {cell('Overdue', st.overdue.length, st.overdue.length ? 'act now' : 'none', st.overdue.length ? 'bad' : 'good')}
        {cell('Under maintenance', st.underMaintenance.length, st.underMaintenance.map((a) => a.code).join(', ') || 'none')}
        {cell('Out of service', st.outOfService.length, st.outOfService.map((a) => a.code).join(', ') || 'none', st.outOfService.length ? 'bad' : undefined)}
        {cell('Est. cost this month', moneyShort(st.estMonth), `${moneyShort(st.actualMonth)} spent`)}
        {cell('Parts awaiting purchase', st.partsAwaiting.length)}
      </div>
      {(alerts.length > 0 || st.renewals.length > 0) && <ul className="list">
        {alerts.slice(0, 4).map((r) => <li key={r.id}><span><b>{r.title}</b>{r.due_date ? <span className="small muted"> · due {fmtDate(r.due_date)}</span> : null}</span><Badge tone={r.priority === 'Urgent' ? 'red' : maintTone(dueState(db, r, T))}>{r.priority === 'Urgent' ? 'Urgent' : dueState(db, r, T)}</Badge></li>)}
        {st.renewals.slice(0, 3).map((x) => <li key={x.asset.id + x.what}><span><b>{x.asset.name}</b> <span className="small muted">· {x.what.toLowerCase()} {x.days < 0 ? 'expired' : 'due'} {fmtDate(x.due)}</span></span><Badge tone={x.days < 0 ? 'red' : x.days <= 14 ? 'amber' : 'gray'}>{x.days < 0 ? 'Expired' : `${x.days} days`}</Badge></li>)}
      </ul>}
    </Card>
  );
}
