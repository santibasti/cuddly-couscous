import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar as RBar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, PageHead, Stat, Bar, Empty } from '@/components/ui';
import { SatisfactionDashboard } from '@/components/workflow/Satisfaction';
import { DiscountInbox } from '@/components/workflow/DiscountPanel';
import { addDays, eachDay, fmtDate, fmtTime, inRange, monthEnd, monthStart, money, moneyShort, nowLocal, pct, round2, sum, today, weekStart } from '@/lib/util';
import { paymentCounts, AWAY_JOB, FIELD_JOB, variationTotals, docTotals, invoiceBalance, invoiceTotals, isDone, isOpen, profitAndLoss, stockSummary, jobCost } from '@/lib/business';
import { isOverdue } from '@/lib/actions';
import type { DB, Invoice, ServiceCode } from '@/lib/types';

const C = { navy: '#0B2545', teal: '#0E9AA7', green: '#2C9A45', cyan: '#22C1C3', gray: '#9db0c5', amber: '#B7791F' };

/** Net (ex-VAT) revenue of an invoice attributed to each service line. */
export function revenueByService(invs: Invoice[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of invs) {
    const t = docTotals(i.items, i.discount, i.vat_mode, i.vat_rate);
    const lineSum = sum(i.items, (x) => x.qty * x.rate - x.discount) || 1;
    for (const it of i.items) out[it.service_code] = (out[it.service_code] || 0) + ((it.qty * it.rate - it.discount) / lineSum) * t.net;
  }
  return out;
}

const PRESETS = [
  ['month', 'This month'], ['last30', 'Last 30 days'], ['lastmonth', 'Last month'], ['quarter', 'This quarter'], ['ytd', 'Year to date'],
] as const;
function presetRange(p: string): [string, string] {
  const t = today();
  if (p === 'last30') return [addDays(t, -29), t];
  if (p === 'lastmonth') { const l = addDays(monthStart(t), -1); return [monthStart(l), monthEnd(l)]; }
  if (p === 'quarter') { const m = Math.floor((+t.slice(5, 7) - 1) / 3) * 3 + 1; const s = `${t.slice(0, 4)}-${String(m).padStart(2, '0')}-01`; return [s, t]; }
  if (p === 'ytd') return [`${t.slice(0, 4)}-01-01`, t];
  return [monthStart(t), monthEnd(t)];
}

export default function Dashboard() {
  const { db, can, user } = useAuth();
  const fin = can('dashboard.finance');
  const mine = !can('jobs.all');
  const [range, setRange] = useState<[string, string]>(presetRange('month'));
  const [preset, setPreset] = useState('month');
  const [branch, setBranch] = useState('');
  const [service, setService] = useState('');
  const [client, setClient] = useState('');
  const [from, to] = range;
  const T = today();
  const myEmp = user?.employee_id;

  const d = useMemo(() => compute(db, from, to, { branch, service, client }, mine ? myEmp : undefined), [db, from, to, branch, service, client, mine, myEmp]);

  return (
    <>
      <PageHead title="Executive dashboard" sub={`${fmtDate(from)} – ${fmtDate(to)} • live from operations data`} />
      <DiscountInbox />
      <div className="filterbar no-print">
        <Field label="Period"><select value={preset} onChange={(e) => { setPreset(e.target.value); if (e.target.value !== 'custom') setRange(presetRange(e.target.value)); }}>{PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="custom">Custom…</option></select></Field>
        <Field label="From"><input type="date" value={from} onChange={(e) => { setPreset('custom'); setRange([e.target.value, to]); }} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => { setPreset('custom'); setRange([from, e.target.value]); }} /></Field>
        <Field label="Branch"><select value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">All branches</option>{db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Service"><select value={service} onChange={(e) => setService(e.target.value)}><option value="">All services</option>{db.services.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></Field>
        <Field label="Client"><select value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option>{db.clients.filter((c) => !c.deleted_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        {(branch || service || client) && <button className="btn" onClick={() => { setBranch(''); setService(''); setClient(''); }}>Clear</button>}
      </div>

      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        <Stat k="Today's jobs" v={d.todayJobs.length} s={`${d.todayJobs.filter((j) => FIELD_JOB.includes(j.status)).length} in the field`} to="/jobs" />
        <Stat k="Crew clocked in" v={`${d.clockedIn} / ${d.crewTotal}`} s={`${d.clockedOut} clocked out • ${d.notIn} not in`} tone={d.notIn > 3 ? 'warn' : undefined} to="/attendance" />
        <Stat k="Machines checked out" v={d.checkedOut.length} s={d.overdueReturns ? `${d.overdueReturns} overdue return(s)` : 'None overdue'} tone={d.overdueReturns ? 'bad' : undefined} to="/assets" />
        <Stat k="Low-stock alerts" v={d.lowStock.length} s={`${d.expiring} expiring soon`} tone={d.lowStock.length ? 'warn' : 'good'} to="/inventory" />
      </div>

      {(can('dispatch.view') || can('assets.view')) && (
        <>
          <Card title="Jobs by workflow status" actions={<Link to="/jobs" className="btn sm">All jobs</Link>}>
            <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              {d.byStatus.map((s) => <Stat key={s.status} k={s.label} v={s.count} s={s.hint} tone={s.tone} to={`/jobs?status=${encodeURIComponent(s.status)}`} />)}
            </div>
          </Card>
          <div className="grid g3" style={{ margin: '14px 0', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <Stat k="Machines in use" v={d.machinesInUse.length} s={d.machinesInUse.slice(0, 4).map((a) => a.code).join(', ') || 'None out'} to="/assets" />
            <Stat k="Vehicles in use" v={d.vehiclesInUse.length} s={d.vehiclesInUse.map((a) => a.code).join(', ') || 'None out'} to="/assets" />
            <Stat k="Missing / damaged equipment" v={d.equipAlerts.length} s={`${d.openIncidents.length} open incident(s)`} tone={d.equipAlerts.length || d.openIncidents.length ? 'bad' : 'good'} to="/assets?tab=incidents" />
          </div>
          {(d.inField.length > 0 || d.equipAlerts.length > 0 || d.openIncidents.length > 0) && (
            <div className="grid g2" style={{ marginBottom: 14 }}>
              <Card title="Teams in the field" flush>
                <ul className="list">{d.inField.map((j) => <li key={j.id}><div><Link to={`/jobs/${j.id}`}><b>{j.number}</b></Link> · {db.employees.find((e) => e.id === j.leader_id)?.full_name}<div className="small muted">{db.clients.find((c) => c.id === j.client_id)?.name} · {db.sites.find((s) => s.id === j.site_id)?.name}</div></div><Badge>{j.status}</Badge></li>)}{!d.inField.length && <li className="muted">No teams out.</li>}</ul>
              </Card>
              <Card title="Missing or damaged equipment" flush actions={<Link to="/assets?tab=incidents" className="btn sm">Incidents</Link>}>
                <ul className="list">{d.equipAlerts.map((a) => <li key={a.id}><div><b>{a.code}</b> · {a.name}<div className="small muted">{a.location}</div></div><Badge>{a.status}</Badge></li>)}{d.openIncidents.filter((i) => !i.asset_id).slice(0, 4).map((i) => <li key={i.id}><div><b>{i.number}</b> · {i.type}<div className="small muted">{i.description}</div></div><Badge>{i.status}</Badge></li>)}{!d.equipAlerts.length && !d.openIncidents.length && <li className="muted">No alerts.</li>}</ul>
              </Card>
            </div>
          )}
        </>
      )}

      {!mine && can('reports.ops') && <div style={{ marginBottom: 14 }}><SatisfactionDashboard from={from} to={to} /></div>}
      {fin && (
        <>
          <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
            <Stat k="Revenue (billed, ex-VAT)" v={moneyShort(d.pnl.revenue)} s={`${d.invCount} invoices`} tone="navy" to="/finance" />
            <Stat k="Expenses (approved)" v={moneyShort(d.expenses)} s={`Payroll ${moneyShort(d.pnl.payrollExpense)}`} to="/finance?tab=expenses" />
            <Stat k="Gross profit" v={moneyShort(d.pnl.grossProfit)} s={`Gross margin ${pct(d.pnl.grossMargin)}`} tone={d.pnl.grossProfit >= 0 ? 'good' : 'bad'} to="/finance?tab=profit" />
            <Stat k="Net profit" v={moneyShort(d.pnl.netProfit)} s={`Net margin ${pct(d.pnl.netMargin)}`} tone={d.pnl.netProfit >= 0 ? 'good' : 'bad'} to="/finance?tab=profit" />
          </div>
          <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
            <Stat k="Receivables outstanding" v={moneyShort(d.receivables)} s={`${moneyShort(d.overdueAmt)} overdue`} tone={d.overdueAmt ? 'warn' : undefined} to="/finance?tab=receivables" />
            <Stat k="Pending quotations" v={d.pendingQuotes.length} s={`${moneyShort(d.pendingQuoteValue)} potential`} to="/sales" />
            <Stat k="Payroll payable" v={moneyShort(d.payrollPayable)} s={d.payrollWaiting ? `${d.payrollWaiting} awaiting approval` : 'Approved, unpaid'} tone={d.payrollWaiting ? 'warn' : undefined} to="/payroll" />
            <Stat k="Upcoming bookings (7d)" v={d.upcoming.length} s={`${moneyShort(sum(d.upcoming, (j) => j.contract_amount))} contract value`} to="/jobs" />
          </div>
          <Card title="Money flow — expected → billed → collected → paid">
            <div className="grid g4 keep2">
              <Flow k="Expected" v={d.expected} s="Approved quotes not yet invoiced" c={C.gray} />
              <Flow k="Billed" v={d.billed} s="Invoices issued (incl. VAT)" c={C.navy} />
              <Flow k="Collected" v={d.collected} s="Payments + withholding credited" c={C.green} />
              <Flow k="Paid out" v={d.paidOut} s="Expenses & payroll paid" c={C.teal} />
            </div>
          </Card>
          <div style={{ height: 14 }} />
        </>
      )}

      <div className="grid g2" style={{ marginBottom: 14 }}>
        <Card title={`Today's scheduled jobs — ${fmtDate(T)}`} flush actions={<Link to="/jobs" className="btn sm">Calendar</Link>}>
          {d.todayJobs.length ? (
            <ul className="list">
              {d.todayJobs.map((j) => {
                const c = db.clients.find((x) => x.id === j.client_id);
                return (
                  <li key={j.id}>
                    <div><Link to={`/jobs/${j.id}`}><b>{j.number}</b></Link> · {c?.name}<div className="small muted">{fmtTime(j.start_at)}–{fmtTime(j.end_at)} · {db.sites.find((s) => s.id === j.site_id)?.name} · {j.service_codes.map((s) => db.services.find((x) => x.code === s)?.name).join(', ')}</div></div>
                    <Badge>{j.status}</Badge>
                  </li>
                );
              })}
            </ul>
          ) : <Empty>No jobs scheduled today.</Empty>}
        </Card>
        <Card title="Jobs completed vs scheduled" actions={<span className="small muted">{d.jobsCompleted} of {d.jobsScheduled} in range</span>}>
          <div style={{ height: 230 }}>
            <ResponsiveContainer>
              <BarChart data={d.weekly} margin={{ left: -10, right: 8 }}>
                <CartesianGrid stroke="#eaeff4" vertical={false} /><XAxis dataKey="label" fontSize={11} tickLine={false} /><YAxis fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip /><Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                <RBar dataKey="scheduled" name="Scheduled" fill={C.gray} radius={[3, 3, 0, 0]} /><RBar dataKey="completed" name="Completed" fill={C.green} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid g2" style={{ marginBottom: 14 }}>
        <Card title="Crew currently on the clock" flush>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Employee</th><th>Status</th><th>Clock-in</th><th>Site / job</th></tr></thead>
            <tbody>
              {d.crew.map((r) => (
                <tr key={r.id}><td>{r.name}</td><td><Badge tone={r.state === 'In' ? 'green' : r.state === 'Out' ? 'gray' : 'amber'}>{r.state === 'In' ? 'Clocked in' : r.state === 'Out' ? 'Clocked out' : 'Not in'}</Badge></td><td>{fmtTime(r.at)}</td><td>{r.job}</td></tr>
              ))}
            </tbody>
          </table></div>
        </Card>
        <Card title="Machines checked out" flush actions={<Link to="/assets" className="btn sm">Out/In</Link>}>
          {d.checkedOut.length ? <ul className="list">{d.checkedOut.map((c) => {
            const a = db.assets.find((x) => x.id === c.asset_id); const j = db.jobs.find((x) => x.id === c.job_id);
            return <li key={c.id}><div><b>{a?.name}</b><div className="small muted">{j?.number} · {db.employees.find((e) => e.id === c.responsible_id)?.full_name} · due {fmtTime(c.expected_return)}{c.expected_return.slice(0, 10) !== T ? ` (${fmtDate(c.expected_return)})` : ''}</div></div>{isOverdue(c) ? <Badge tone="red">Overdue</Badge> : <Badge tone="teal">Out</Badge>}</li>;
          })}</ul> : <Empty>Nothing checked out.</Empty>}
        </Card>
      </div>

      {fin && (
        <>
          <div className="grid g2" style={{ marginBottom: 14 }}>
            <Card title="Revenue by service type">
              {d.byService.length ? (
                <div style={{ height: 250 }}><ResponsiveContainer><BarChart data={d.byService} layout="vertical" margin={{ left: 30, right: 16 }}>
                  <CartesianGrid stroke="#eaeff4" horizontal={false} /><XAxis type="number" fontSize={11} tickFormatter={(v) => moneyShort(v)} tickLine={false} /><YAxis type="category" dataKey="name" fontSize={11} width={140} tickLine={false} />
                  <Tooltip formatter={(v) => money(Number(v))} /><RBar dataKey="value" name="Revenue" radius={[0, 3, 3, 0]}>{d.byService.map((_, i) => <Cell key={i} fill={i === 0 ? C.navy : C.teal} />)}</RBar>
                </BarChart></ResponsiveContainer></div>
              ) : <Empty>No revenue in range.</Empty>}
            </Card>
            <Card title="Revenue vs expenses — last 6 months">
              <div style={{ height: 250 }}><ResponsiveContainer><BarChart data={d.trend} margin={{ left: -6, right: 8 }}>
                <CartesianGrid stroke="#eaeff4" vertical={false} /><XAxis dataKey="label" fontSize={11} tickLine={false} /><YAxis fontSize={11} tickFormatter={(v) => moneyShort(v)} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => money(Number(v))} /><Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                <RBar dataKey="revenue" name="Revenue" fill={C.navy} radius={[3, 3, 0, 0]} /><RBar dataKey="expenses" name="Expenses" fill={C.cyan} radius={[3, 3, 0, 0]} />
              </BarChart></ResponsiveContainer></div>
            </Card>
          </div>
          <div className="grid g2" style={{ marginBottom: 14 }}>
            <Card title="Top clients (billed revenue)" flush>
              <ul className="list">{d.topClients.map((c) => (
                <li key={c.id}><div className="grow"><Link to={`/clients/${c.id}`}><b>{c.name}</b></Link><Bar value={c.value} max={d.topClients[0]?.value || 1} /></div><span className="mono nowrap">{money(c.value)}</span></li>
              ))}{!d.topClients.length && <li className="muted">No billed revenue in range.</li>}</ul>
            </Card>
            <Card title="Outstanding client balances" flush actions={<Link to="/finance?tab=receivables" className="btn sm">Aging</Link>}>
              <ul className="list">{d.balances.map((c) => (
                <li key={c.id}><div><Link to={`/clients/${c.id}`}><b>{c.name}</b></Link><div className="small muted">{c.overdue ? `${money(c.overdue)} overdue` : 'Not yet due'}</div></div><b className="mono">{money(c.balance)}</b></li>
              ))}{!d.balances.length && <li className="muted">No outstanding balances.</li>}</ul>
            </Card>
          </div>
          {d.loss.length > 0 && (
            <Card title="Profitability alerts — jobs below breakeven">
              <ul className="list">{d.loss.map((x) => <li key={x.id}><div><Link to={`/jobs/${x.id}`}><b>{x.number}</b></Link> <span className="muted">{x.client}</span></div><span><Badge tone="red">{money(x.gp)}</Badge> <span className="small muted">{x.estimated ? 'estimated cost' : 'actual cost'}</span></span></li>)}</ul>
            </Card>
          )}
        </>
      )}
      <p className="small muted" style={{ marginTop: 10 }}>Reference: {nowLocal().replace('T', ' ')} Manila. Revenue is billed (invoiced) net of VAT; “Expected” counts approved quotations not yet invoiced.</p>
    </>
  );
}

function Flow({ k, v, s, c }: { k: string; v: number; s: string; c: string }) {
  return <div style={{ borderLeft: `4px solid ${c}`, paddingLeft: 12 }}><div className="small muted" style={{ textTransform: 'uppercase', fontWeight: 650, letterSpacing: '.05em' }}>{k}</div><div style={{ fontSize: 21, fontWeight: 700, color: C.navy }} className="mono">{money(v)}</div><div className="small muted">{s}</div></div>;
}

function compute(db: DB, from: string, to: string, f: { branch: string; service: string; client: string }, mineEmp?: string | null) {
  const T = today();
  const live = <X extends { deleted_at?: string | null }>(a: X[]) => a.filter((x) => !x.deleted_at);
  const jobOk = (j: DB['jobs'][number]) => (!f.branch || j.branch_id === f.branch) && (!f.client || j.client_id === f.client) && (!f.service || j.service_codes.includes(f.service as ServiceCode)) && (!mineEmp || j.leader_id === mineEmp || j.crew_ids.includes(mineEmp));
  const jobs = live(db.jobs).filter(jobOk);
  const todayJobs = jobs.filter((j) => j.start_at.startsWith(T) && !['Cancelled', 'Rescheduled'].includes(j.status));
  const inRangeJobs = jobs.filter((j) => inRange(j.start_at, from, to) && !['Cancelled', 'Rescheduled'].includes(j.status));
  const jobsCompleted = inRangeJobs.filter((j) => isDone(j.status)).length;
  // weekly buckets
  const wk = new Map<string, { label: string; scheduled: number; completed: number }>();
  for (const j of inRangeJobs) {
    const w = weekStart(j.start_at.slice(0, 10));
    const e = wk.get(w) ?? { label: fmtDate(w).replace(/, \d+$/, ''), scheduled: 0, completed: 0 };
    e.scheduled += 1; if (isDone(j.status)) e.completed += 1; wk.set(w, e);
  }
  const weekly = [...wk.entries()].sort().map(([, v]) => v);

  // crew
  const crewEmps = live(db.employees).filter((e) => e.status !== 'inactive' && e.department === 'Field Operations');
  const attToday = new Map(live(db.attendance).filter((a) => a.date === T).map((a) => [a.employee_id, a]));
  const crew = crewEmps.map((e) => {
    const a = attToday.get(e.id);
    const state: 'In' | 'Out' | 'None' = a?.clock_in && !a.clock_out ? 'In' : a?.clock_out ? 'Out' : 'None';
    const job = a?.job_id ? db.jobs.find((j) => j.id === a.job_id) : undefined;
    return { id: e.id, name: e.full_name, state, at: a?.clock_in, job: job ? `${job.number} · ${db.sites.find((s) => s.id === job.site_id)?.name}` : a?.clock_in ? 'Yard / standby' : '—' };
  }).sort((a, b) => (a.state === b.state ? a.name.localeCompare(b.name) : a.state === 'In' ? -1 : b.state === 'In' ? 1 : a.state === 'Out' ? -1 : 1));

  const checkedOut = live(db.checkouts).filter((c) => c.status === 'Released');
  const lowStock = live(db.items).filter((i) => stockSummary(db, i.id).available <= i.reorder_level);
  const expiring = live(db.items).filter((i) => i.track_expiry && i.expiry_date && i.expiry_date <= addDays(T, db.settings.reminder_days.chemical_expiry)).length;

  // finance
  const invBase = live(db.invoices).filter((i) => i.status === 'Approved' && (!f.branch || i.branch_id === f.branch) && (!f.client || i.client_id === f.client) && (!f.service || i.items.some((it) => it.service_code === f.service)));
  const invRange = invBase.filter((i) => inRange(i.issue_date, from, to));
  const pnl = profitAndLoss(db, from, to, { branch: f.branch || undefined, client: f.client || undefined, service: f.service || undefined });
  const expenses = sum(live(db.expenses).filter((e) => e.approval === 'Approved' && !e.reversed && inRange(e.date, from, to) && (!f.branch || e.branch_id === f.branch)), (e) => e.amount);
  const receivables = sum(invBase, (i) => invoiceBalance(db, i));
  const overdueAmt = sum(invBase.filter((i) => i.due_date < T), (i) => invoiceBalance(db, i));
  const pendingQuotes = live(db.quotations).filter((q) => ['Draft', 'Sent'].includes(q.status) && (!f.client || q.client_id === f.client) && (!f.branch || q.branch_id === f.branch) && (!f.service || q.items.some((i) => i.service_code === f.service)));
  const pendingQuoteValue = sum(pendingQuotes, (q) => docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total);
  const payrollPeriods = live(db.periods).filter((p) => p.status === 'For Approval' || p.status === 'Approved');
  const payrollPayable = sum(payrollPeriods, (p) => sum(db.runs.find((r) => r.period_id === p.id)?.lines ?? [], (l) => l.net));
  const payrollWaiting = payrollPeriods.filter((p) => p.status === 'For Approval').length;
  const upcoming = jobs.filter((j) => j.start_at.slice(0, 10) > T && j.start_at.slice(0, 10) <= addDays(T, 7) && ['Pending', 'Confirmed', 'Dispatch Checklist Pending'].includes(j.status));
  const approvedQuotes = live(db.quotations).filter((q) => q.status === 'Approved' && !db.jobs.some((j) => j.quotation_id === q.id && j.status === 'Cancelled') && !db.invoices.some((i) => i.quotation_id === q.id && i.status === 'Approved'));
  const expected = sum(approvedQuotes.filter((q) => (!f.client || q.client_id === f.client) && (!f.branch || q.branch_id === f.branch)), (q) => docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total + sum(live(db.variations).filter((v) => v.status === 'Approved' && db.jobs.some((j) => j.id === v.job_id && j.quotation_id === q.id)), (v) => variationTotals(v).total));
  const billed = sum(invRange, (i) => invoiceTotals(i).total);
  const collected = sum(live(db.payments).filter((p) => paymentCounts(p) && inRange(p.date, from, to) && (!f.client || p.client_id === f.client)), (p) => p.amount + p.wht_amount);
  const paidOut = sum(live(db.expenses).filter((e) => e.paid && e.approval === 'Approved' && !e.reversed && inRange(e.date, from, to)), (e) => e.amount - e.wht);
  const svc = revenueByService(invRange);
  const byService = Object.entries(svc).map(([code, value]) => ({ name: db.services.find((s) => s.code === code)?.name.replace(/ \/ .*/, '') ?? code, value: round2(value) })).sort((a, b) => b.value - a.value);
  const byClient = new Map<string, number>();
  for (const i of invRange) byClient.set(i.client_id, (byClient.get(i.client_id) ?? 0) + invoiceTotals(i).net);
  const topClients = [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, value]) => ({ id, name: db.clients.find((c) => c.id === id)?.name ?? '—', value }));
  const balMap = new Map<string, { balance: number; overdue: number }>();
  for (const i of invBase) { const b = invoiceBalance(db, i); if (b <= 0.005) continue; const e = balMap.get(i.client_id) ?? { balance: 0, overdue: 0 }; e.balance += b; if (i.due_date < T) e.overdue += b; balMap.set(i.client_id, e); }
  const balances = [...balMap.entries()].sort((a, b) => b[1].balance - a[1].balance).slice(0, 6).map(([id, v]) => ({ id, name: db.clients.find((c) => c.id === id)?.name ?? '—', ...v }));
  // 6-month trend
  const trend: { label: string; revenue: number; expenses: number }[] = [];
  for (let k = 5; k >= 0; k--) {
    const ref = addDays(monthStart(T), -k * 30); const s = monthStart(ref), e = monthEnd(ref);
    const rev = sum(live(db.invoices).filter((i) => i.status === 'Approved' && i.issue_date >= s && i.issue_date <= e && (!f.branch || i.branch_id === f.branch) && (!f.client || i.client_id === f.client)), (i) => invoiceTotals(i).net);
    const ex = sum(live(db.expenses).filter((x) => x.approval === 'Approved' && !x.reversed && x.date >= s && x.date <= e && (!f.branch || x.branch_id === f.branch)), (x) => x.amount - x.vat);
    if (!trend.some((t) => t.label === s.slice(0, 7))) trend.push({ label: s.slice(0, 7), revenue: round2(rev), expenses: round2(ex) });
  }
  const loss = jobs.filter((j) => isDone(j.status) || j.status === 'In Progress').map((j) => ({ j, c: jobCost(db, j) })).filter((x) => x.c.revenue > 0 && x.c.grossProfit < 0).slice(0, 5)
    .map((x) => ({ id: x.j.id, number: x.j.number, client: db.clients.find((c) => c.id === x.j.client_id)?.name, gp: x.c.grossProfit, estimated: x.c.estimated }));
  // dispatch & field widgets (current state, not date-range based)
  const allJobs = live(db.jobs).filter((j) => (!f.branch || j.branch_id === f.branch) && (!f.client || j.client_id === f.client) && (!mineEmp || j.leader_id === mineEmp || j.crew_ids.includes(mineEmp)));
  const T0 = today();
  const cnt = (s: string) => allJobs.filter((j) => j.status === s);
  const byStatus: { status: string; label: string; count: number; hint?: string; tone?: 'navy' | 'warn' | 'good' | 'bad' }[] = [
    { status: 'Dispatch Checklist Pending', label: 'Job prep (HQ)', count: cnt('Dispatch Checklist Pending').length + allJobs.filter((j) => j.status === 'Confirmed' && j.start_at.startsWith(T0)).length, hint: 'confirmed today / in progress' },
    { status: 'Dispatched', label: 'Dispatched', count: cnt('Dispatched').length, hint: 'on the road', tone: 'navy' },
    { status: 'On Site', label: 'On site', count: cnt('On Site').length, hint: 'awaiting scope approval' },
    { status: 'In Progress', label: 'Work in progress', count: cnt('In Progress').length, tone: 'navy' },
    { status: 'Work Completed', label: 'Handover signed', count: cnt('Work Completed').length, hint: 'close-out pending', tone: cnt('Work Completed').length ? 'warn' : undefined },
    { status: 'Closed', label: 'Closed (7 days)', count: allJobs.filter((j) => (j.status === 'Closed' || j.status === 'Completed') && j.start_at.slice(0, 10) >= addDays(T0, -7)).length, tone: 'good' },
  ];
  const inField = allJobs.filter((j) => AWAY_JOB.includes(j.status));
  const machinesInUse = live(db.assets).filter((a) => a.category !== 'Vehicle' && a.status === 'In Use');
  const vehiclesInUse = live(db.assets).filter((a) => a.category === 'Vehicle' && live(db.checkouts).some((c) => c.asset_id === a.id && c.status === 'Released'));
  const equipAlerts = live(db.assets).filter((a) => a.status === 'Missing' || a.status === 'Damaged');
  const openIncidents = live(db.incidents).filter((i) => ['Open', 'Investigating'].includes(i.status));
  void eachDay; void AWAY_JOB; void isOpen;
  return {
    byStatus, inField, machinesInUse, vehiclesInUse, equipAlerts, openIncidents,
    todayJobs, jobsCompleted, jobsScheduled: inRangeJobs.length, weekly, crew, clockedIn: crew.filter((c) => c.state === 'In').length, clockedOut: crew.filter((c) => c.state === 'Out').length,
    notIn: crew.filter((c) => c.state === 'None').length, crewTotal: crew.length, checkedOut, overdueReturns: checkedOut.filter(isOverdue).length, lowStock, expiring,
    pnl, expenses, receivables, overdueAmt, pendingQuotes, pendingQuoteValue, payrollPayable, payrollWaiting, upcoming, expected, billed, collected, paidOut, byService, topClients, balances, trend, loss, invCount: invRange.length,
  };
}
