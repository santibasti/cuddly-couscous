import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Columns } from '../components/charts';
import { Bar, Card, Empty, Pill, ServicePill, StripStat, carName } from '../components/ui';
import { RANGE_LABEL, RANGE_PREV, hoursByStage, pctChange, rangeOf, rangeText, salesByMonth, teamFor, unitsFor, type RangeKey } from '../lib/crm';
import { fmtDate, todayIso } from '../lib/dates';
import { SERVICES, SERVICE_KEYS, moneyC } from '../lib/logic';
import { ROLES, useRole } from '../lib/role';
import { useStore } from '../lib/store';

/** Change since the earlier period. For delays and back jobs a fall is the good direction. */
function Delta({ now, prev, lowerIsBetter, show, money }: { now: number; prev: number; lowerIsBetter?: boolean; show: boolean; money?: boolean }) {
  if (!show) return null;
  const ch = pctChange(now, prev);
  const was = money ? moneyC(prev) : prev;
  if (ch === null) return <span className="small muted">before: {was}</span>;
  const good = lowerIsBetter ? ch <= 0 : ch >= 0;
  return <span className={`small ${ch === 0 ? 'muted' : good ? 'ok' : 'over'}`}>{ch > 0 ? '▲' : ch < 0 ? '▼' : '='} {Math.abs(ch)}% <span className="muted">(before: {was})</span></span>;
}

export default function Insights() {
  const { data } = useStore();
  const { role } = useRole();
  const today = todayIso();
  const [key, setKey] = useState<RangeKey>('30d');
  const [compare, setCompare] = useState(true);
  const r = rangeOf(key, today);
  const cur = unitsFor(data, r.start, r.end, today);
  const prev = unitsFor(data, r.prevStart, r.prevEnd, today);
  const team = teamFor(data, r.start, r.end);
  const stages = hoursByStage(data, r.start, r.end);
  const stageMax = Math.max(1, ...stages.map((s) => s.hours));
  const months = salesByMonth(data, today, 12);
  const money = ROLES[role].money;
  const lateNow = data.projects.filter((p) => p.status === 'active' && p.targetDate < today);
  const billedMax = Math.max(1, ...SERVICE_KEYS.map((k) => Math.max(cur.billedByService[k], compare ? prev.billedByService[k] : 0)));
  const brandMax = Math.max(1, ...cur.byBrand.map((b) => b.count));

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">Database and analysis</div>
          <h1>Insights</h1>
          <p>{RANGE_LABEL[key]}: <b>{cur.received.length}</b> cars received, <b>{cur.released.length}</b> released{cur.delayed.length ? <>, <b>{cur.delayed.length}</b> late</> : ', none late'}. {compare ? `Compared with ${RANGE_PREV[key]}.` : ''}</p>
        </div>
      </div>
      <div className="row spread" style={{ marginBottom: 16 }}>
        <div className="seg" role="group" aria-label="Period">
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => <button key={k} className={key === k ? 'on' : ''} onClick={() => setKey(k)}>{RANGE_LABEL[k]}</button>)}
        </div>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />Compare with {RANGE_PREV[key]}</label>
      </div>
      <div className="small muted" style={{ marginBottom: 12 }}>{rangeText(r.start, r.end)}{compare ? ` · before: ${rangeText(r.prevStart, r.prevEnd)}` : ''}</div>

      <Card>
        <div className="strip" style={{ marginTop: 0 }}>
          <StripStat label="Received" value={cur.received.length} sub={<Delta now={cur.received.length} prev={prev.received.length} show={compare} />} />
          <StripStat label="Released" value={cur.released.length} sub={<Delta now={cur.released.length} prev={prev.released.length} show={compare} />} />
          <StripStat label="Delayed" value={cur.delayed.length} tone={cur.delayed.length ? 'amber' : ''} sub={<Delta now={cur.delayed.length} prev={prev.delayed.length} lowerIsBetter show={compare} />} />
          <StripStat label="Back jobs" value={cur.backjobs.length} tone={cur.backjobs.length ? 'amber' : ''} sub={<Delta now={cur.backjobs.length} prev={prev.backjobs.length} lowerIsBetter show={compare} />} />
          {money ? <StripStat label="Billed" value={moneyC(cur.billed)} sub={<Delta now={cur.billed} prev={prev.billed} show={compare} money />} /> : <StripStat label="Running late now" value={lateNow.length} tone={lateNow.length ? 'red' : ''} sub="Active jobs past their date" />}
        </div>
      </Card>

      <div className="grid g2 mt">
        <Card title="Units per service" flush>
          <table style={{ minWidth: 0 }}>
            <thead><tr><th>Service</th><th style={{ textAlign: 'right' }}>Received</th>{compare && <th style={{ textAlign: 'right' }}>Before</th>}</tr></thead>
            <tbody>
              {SERVICE_KEYS.map((k) => (
                <tr key={k}><td><ServicePill s={k} /> <span className="small muted">{SERVICES[k].label}</span></td><td className="num" style={{ textAlign: 'right' }}>{cur.byService[k]}</td>{compare && <td className="num muted" style={{ textAlign: 'right' }}>{prev.byService[k]}</td>}</tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Units per car brand" action={<span className="muted small">Received in the period</span>}>
          {cur.byBrand.length === 0 && <div className="muted small">No cars received in this period.</div>}
          {cur.byBrand.slice(0, 8).map((b) => (
            <div key={b.brand} className="sup">
              <div className="row spread small" style={{ flexWrap: 'nowrap' }}><span style={{ fontWeight: 500 }}>{b.brand}</span><span className="num">{b.count}{compare && <span className="muted"> · before {prev.byBrand.find((x) => x.brand === b.brand)?.count ?? 0}</span>}</span></div>
              <Bar thin value={(b.count / brandMax) * 100} />
            </div>
          ))}
        </Card>
      </div>

      {money && (
        <div className="grid g2 mt">
          <Card title="Sales per month" action={<span className="muted small">Cash received, last 12 months</span>}>
            <Columns data={months.map((m) => ({ label: m.label, value: m.value, tip: `${m.key}: ${moneyC(m.value)}` }))} format={(n) => moneyC(n).replace('₱', '')} unit="" />
            <div className="small muted" style={{ marginTop: 6 }}>Values in ₱.</div>
          </Card>
          <Card title="Billing per service" action={<span className="muted small">Cash received in the period</span>}>
            {SERVICE_KEYS.map((k) => (
              <div key={k} className="sup">
                <div className="row spread small" style={{ flexWrap: 'nowrap' }}><span style={{ fontWeight: 500 }}>{SERVICES[k].label}</span><span className="num">{moneyC(cur.billedByService[k])}</span></div>
                <Bar thin value={(cur.billedByService[k] / billedMax) * 100} />
                {compare && <div className="row spread small muted" style={{ flexWrap: 'nowrap' }}><span>before</span><span className="num">{moneyC(prev.billedByService[k])}</span></div>}
              </div>
            ))}
          </Card>
        </div>
      )}

      <Card className="mt" title="Team" flush action={<span className="muted small">Jobs, hours, back jobs and attendance in the period</span>}>
        <table>
          <thead><tr><th>Member</th><th style={{ textAlign: 'right' }}>Current jobs</th><th style={{ textAlign: 'right' }}>Jobs worked</th><th style={{ textAlign: 'right' }}>Hours</th><th style={{ textAlign: 'right' }}>Back jobs</th><th style={{ textAlign: 'right' }}>Days in</th><th style={{ textAlign: 'right' }}>Late</th><th style={{ textAlign: 'right' }}>Absent</th><th style={{ textAlign: 'right' }}>Leave</th></tr></thead>
          <tbody>
            {team.map((t) => (
              <tr key={t.mechanic.id}>
                <td><strong>{t.mechanic.name}</strong><div className="small muted">{t.mechanic.specialty}</div></td>
                <td className="num" style={{ textAlign: 'right' }}>{t.current}</td><td className="num" style={{ textAlign: 'right' }}>{t.past}</td>
                <td className="num" style={{ textAlign: 'right' }}>{t.hours}h</td>
                <td className="num" style={{ textAlign: 'right' }}>{t.backjobs ? <span className="over">{t.backjobs}</span> : 0}</td>
                <td className="num" style={{ textAlign: 'right' }}>{t.present}</td><td className="num" style={{ textAlign: 'right' }}>{t.late}</td>
                <td className="num" style={{ textAlign: 'right' }}>{t.absent ? <span className="over">{t.absent}</span> : 0}</td><td className="num" style={{ textAlign: 'right' }}>{t.leave}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid g2 mt">
        <Card title="Hours per stage" action={<span className="muted small">Finished tasks in the period</span>}>
          {stages.length === 0 && <div className="muted small">No finished tasks in this period.</div>}
          {stages.map((s) => (
            <div key={s.key} className="sup">
              <div className="row spread small" style={{ flexWrap: 'nowrap' }}><span style={{ fontWeight: 500 }}>{s.label}</span><span className="num">{s.hours}h</span></div>
              <Bar thin value={(s.hours / stageMax) * 100} />
            </div>
          ))}
        </Card>
        <Card title="Delays" action={<Pill tone={cur.delayed.length || lateNow.length ? 'amber' : 'green'}>{cur.delayed.length} in period · {lateNow.length} late now</Pill>}>
          {cur.delayed.length === 0 && lateNow.length === 0 && <Empty>No delays.</Empty>}
          {[...new Map([...cur.delayed, ...lateNow].map((p) => [p.id, p])).values()].map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="item">
              <div className="grow"><b>{p.code} · {carName(p)}</b><div className="small muted">{p.releasedOn ? `Promised ${fmtDate(p.targetDate)}, out ${fmtDate(p.releasedOn)}` : `Promised ${fmtDate(p.targetDate)}, still in the shop`}</div></div>
              <ServicePill s={p.service} />
            </Link>
          ))}
        </Card>
      </div>
    </>
  );
}
