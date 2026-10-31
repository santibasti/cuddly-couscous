import { Link } from 'react-router-dom';
import { Columns, Donut } from '../components/charts';
import { Bar, Card, Empty, HealthPill, Icon, ServicePill, StripStat } from '../components/ui';
import { fmtDate, todayIso } from '../lib/dates';
import { byService, costMix, monthlyDeliveries, portfolio, riskRegister, supplierExposure, weeklyHours } from '../lib/exec';
import { money, moneyC } from '../lib/logic';
import { LABOR_COST_PER_HOUR } from '../lib/rates';
import { useStore } from '../lib/store';

export default function Executive() {
  const { data } = useStore();
  const today = todayIso();
  const pf = portfolio(data, today);
  const mix = costMix(data);
  const mixTotal = mix.labor + mix.parts + mix.sublet;
  const suppliers = supplierExposure(data, today);
  const supMax = Math.max(1, ...suppliers.map((s) => s.value));
  const months = monthlyDeliveries(data, today, 6);
  const weeks = weeklyHours(data, today, 4);
  const risks = riskRegister(data, today);
  const services = byService(data, today);
  const svcMax = Math.max(1, ...services.map((x) => x.contract));
  const high = risks.filter((r) => r.level === 'high').length;
  const marginTone = pf.marginPct < 20 ? 'red' : pf.marginPct < 30 ? 'amber' : '';
  const slices = [
    { label: 'Labor', value: mix.labor, color: 'var(--arc)' },
    { label: 'Parts', value: mix.parts, color: 'var(--accent2)' },
    { label: 'Sublet', value: mix.sublet, color: 'var(--accent)' },
  ];

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{fmtDate(today)} · Owner view</div>
          <h1>Executive overview</h1>
          <p>
            {pf.jobs.length} active jobs worth <b>{moneyC(pf.contract)}</b> are forecast to finish at a <b>{pf.marginPct}% gross margin</b>.
            {' '}{pf.late > 0 ? <><b>{pf.late}</b> {pf.late === 1 ? 'is' : 'are'} running late{pf.avgDelay ? ` by ${pf.avgDelay} days` : ''}. </> : 'Every job is on schedule. '}
            {pf.toBill > 0 && <>{moneyC(pf.toBill)} of completed work has not been billed yet.</>}
          </p>
        </div>
      </div>

      <Card>
        <div className="strip" style={{ marginTop: 0 }}>
          <StripStat label="Contract value" value={moneyC(pf.contract)} sub={`${pf.jobs.length} active · ${moneyC(pf.quotesValue)} in quotes`} />
          <StripStat label="Collected" value={moneyC(pf.collected)} sub={`${pf.contract ? Math.round((pf.collected / pf.contract) * 100) : 0}% of contract · ${moneyC(pf.outstanding)} to come`} />
          <StripStat label="Forecast margin" value={`${pf.marginPct}%`} tone={marginTone} sub={`${moneyC(pf.margin)} gross on ${moneyC(pf.forecastCost)} cost`} />
          <StripStat label="On schedule" value={`${pf.onTime}/${pf.jobs.length}`} tone={pf.late ? 'red' : ''} sub={pf.late ? `${pf.late} late · avg ${pf.avgDelay}d over` : 'No delays'} />
          <StripStat label="Booked work ahead" value={`${pf.backlogWeeks} wk${pf.backlogWeeks === 1 ? '' : 's'}`} sub={`${Math.round(pf.backlogHours)}h left for the current team`} />
        </div>
      </Card>

      <div className="grid exec-grid mt">
        <Card title="Profitability by job" flush action={<span className="muted small">Forecast margin · labour costed at {moneyC(LABOR_COST_PER_HOUR)}/h for everyone</span>}>
          <table className="exec-table" style={{ minWidth: 560 }}>
            <thead><tr><th>Job</th><th>Contract</th><th>Done</th><th>Collected</th><th>Forecast cost</th><th>Margin</th></tr></thead>
            <tbody>
              {pf.jobs.map((j) => (
                <tr key={j.project.id}>
                  <td><Link to={`/projects/${j.project.id}`} className="plink"><strong>{j.project.code} · {j.project.make} {j.project.model}</strong><span>{j.reasons[0] ?? j.project.year}</span></Link><div style={{ marginTop: 4 }}><HealthPill h={j.health} /></div></td>
                  <td className="num">{moneyC(j.contract)}</td>
                  <td><div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><div style={{ width: 54 }}><Bar thin value={j.progress} /></div><span className="small num">{j.progress}%</span></div></td>
                  <td>
                    <div className="num">{moneyC(j.collected)}</div>
                    <div className={`small ${j.billingGap > j.contract * 0.1 ? 'warn' : 'muted'}`}>{j.billingGap > 0 ? `${moneyC(j.billingGap)} to bill` : 'Paid ahead'}</div>
                  </td>
                  <td className="num">{moneyC(j.forecastCost)}</td>
                  <td><b className={j.marginPct < 20 ? 'over' : j.marginPct < 30 ? 'warn' : 'ok'}>{j.marginPct}%</b><div className="small muted num">{moneyC(j.margin)}</div></td>
                </tr>
              ))}
              {pf.jobs.length === 0 && <tr><td colSpan={6}><Empty>No active jobs.</Empty></td></tr>}
            </tbody>
            {pf.jobs.length > 0 && (
              <tfoot>
                <tr><td><b>Portfolio</b></td><td className="num"><b>{moneyC(pf.contract)}</b></td><td /><td className="num"><b>{moneyC(pf.collected)}</b></td><td className="num"><b>{moneyC(pf.forecastCost)}</b></td><td><b>{pf.marginPct}%</b></td></tr>
              </tfoot>
            )}
          </table>
        </Card>
        <Card title="Where the money goes" action={<span className="muted small">Active jobs</span>}>
          <div className="row" style={{ gap: 20, flexWrap: 'nowrap', alignItems: 'center' }}>
            <Donut items={slices} size={132} center={moneyC(mixTotal)} />
            <div className="stack grow">
              {slices.map((s) => (
                <div key={s.label} className="row spread small" style={{ flexWrap: 'nowrap' }}>
                  <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><i className="swatch" style={{ background: s.color }} />{s.label}</span>
                  <span className="num">{mixTotal ? Math.round((s.value / mixTotal) * 100) : 0}% · {moneyC(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="eyebrow" style={{ margin: '20px 0 8px' }}>Open orders by supplier</div>
          {suppliers.length === 0 && <div className="muted small">Nothing on order.</div>}
          {suppliers.slice(0, 5).map((s) => (
            <div key={s.supplier} className="sup">
              <div className="row spread small" style={{ flexWrap: 'nowrap' }}><span style={{ fontWeight: 500 }}>{s.supplier}</span><span className="num">{moneyC(s.value)}{s.late > 0 && <span className="over"> · {s.late} late</span>}</span></div>
              <Bar thin value={(s.value / supMax) * 100} tone={s.late ? 'red' : undefined} />
            </div>
          ))}
          <div className="eyebrow" style={{ margin: '20px 0 8px' }}>Quotes awaiting approval</div>
          {pf.quotes.length === 0 && <div className="muted small">No open quotes.</div>}
          {pf.quotes.map((q) => (
            <Link key={q.id} to={`/projects/${q.id}`} className="row spread small" style={{ flexWrap: 'nowrap', padding: '4px 0' }}>
              <span style={{ fontWeight: 500 }}>{q.code} · {q.make} {q.model}</span><span className="num">{moneyC(q.budget)}</span>
            </Link>
          ))}
        </Card>
      </div>

      <Card className="mt" title="Earnings by service" flush action={<span className="muted small">Active jobs</span>}>
        <table className="exec-table" style={{ minWidth: 560 }}>
          <thead><tr><th>Service</th><th>Jobs</th><th style={{ width: '34%' }}>Contract value</th><th>Average job</th><th>Margin</th></tr></thead>
          <tbody>
            {services.map((x) => (
              <tr key={x.service}>
                <td><ServicePill s={x.service} /></td>
                <td className="num">{x.jobs}</td>
                <td><div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><div className="grow"><Bar thin value={(x.contract / svcMax) * 100} /></div><span className="num small">{moneyC(x.contract)}</span></div></td>
                <td className="num">{x.jobs ? moneyC(x.avgJob) : '—'}</td>
                <td>{x.jobs ? <><b className={x.marginPct < 20 ? 'over' : x.marginPct < 30 ? 'warn' : 'ok'}>{x.marginPct}%</b><div className="small muted num">{moneyC(x.margin)}</div></> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid g2 mt">
        <Card title="Deliveries ahead" action={<span className="muted small">Due each month</span>}>
          <Columns data={months.map((m) => ({ label: m.label, value: m.value, tip: `${m.label}: ${m.jobs.length ? m.jobs.join(', ') : 'no deliveries'} · ${money(m.value)}` }))} format={(n) => moneyC(n).replace('₱', '')} unit="" />
          <div className="small muted" style={{ marginTop: 6 }}>Values in ₱. Late jobs are counted in this month. {months.filter((m) => m.jobs.length).map((m) => `${m.label}: ${m.jobs.join(', ')}`).join(' · ')}</div>
        </Card>
        <Card title="Shop hours" action={<span className="muted small">Clocked vs available</span>}>
          <Columns data={weeks.map((w) => ({ label: w.label, value: w.worked, muted: w.current, tip: `Week of ${w.label}: ${w.worked}h clocked of ${w.capacity}h available${w.current ? ' (so far)' : ''}` }))} marks={weeks.map((w) => w.capacity)} unit="h" />
          <div className="small muted" style={{ marginTop: 6 }}><i className="swatch" style={{ background: 'var(--accent2)', height: 3, width: 14 }} /> Hours available · this week so far is shown dimmed</div>
        </Card>
      </div>

      <Card className="mt" title="Risk register" flush action={high ? <span className="pill red"><i />{high} serious</span> : <span className="pill green"><i />Nothing serious</span>}>
        {risks.length === 0 && <Empty>No open risks.</Empty>}
        {risks.map((r, i) => (
          <Link key={i} to={r.to} className="item">
            <span className={`ico ${r.level === 'high' ? 'red' : 'amber'}`}><Icon name="warn" /></span>
            <div className="grow">{r.text}</div>
            {r.value ? <span className="small muted num">{moneyC(r.value)} at stake</span> : null}
            <Icon name="arrow" size={14} />
          </Link>
        ))}
      </Card>
    </>
  );
}
