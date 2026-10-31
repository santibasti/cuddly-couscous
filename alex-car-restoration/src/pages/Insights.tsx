import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Columns, Donut, Gauge, TrendChart } from '../components/charts';
import { Bar, Card, Empty, Pill, ServicePill, StripStat, carName } from '../components/ui';
import { RANGE_LABEL, RANGE_PREV, hoursByStage, onTimeRate, pctChange, rangeOf, rangeText, salesByMonth, shopLoad, sourcesFor, teamFor, trendFor, unitsFor, type RangeKey } from '../lib/crm';
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
  const trend = trendFor(data, r);
  const onTime = onTimeRate(cur);
  const onTimePrev = onTimeRate(prev);
  const load = shopLoad(data, r.start, r.end);
  const loadPrev = shopLoad(data, r.prevStart, r.prevEnd);
  const backRate = cur.received.length ? Math.round((cur.backjobs.length / cur.received.length) * 100) : 0;
  const sources = sourcesFor(data, cur.received);
  const SRC_COLORS = ['var(--arc)', '#ff4d8d', '#8b7bff', 'var(--amber)', 'var(--green)', 'var(--muted)'];
  const SVC_COLORS: Record<string, string> = { restoration: '#ff4d8d', paint: '#ffb04d', detailing: 'var(--arc)', ceramic: '#8b7bff' };
  const vs = (now: number, before: number | null, unit = '%') => (compare && before !== null ? `before: ${before}${unit}` : undefined);
  const brandMax = Math.max(1, ...cur.byBrand.map((b) => b.count));

  return (
    <div className="neo">
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

      <div className="grid g4 mt">
        <Card className="panel"><Gauge value={onTime ?? 100} label="On-time release" display={onTime === null ? '–' : `${onTime}%`} color="var(--green)" sub={vs(onTime ?? 0, onTimePrev) ?? (onTime === null ? 'No cars released' : 'Released by the promised date')} /></Card>
        <Card className="panel"><Gauge value={Math.min(100, load)} label="Shop load" display={`${load}%`} color={load > 100 ? 'var(--red)' : 'var(--arc)'} sub={vs(load, loadPrev) ?? 'Hours worked vs the team can work'} /></Card>
        <Card className="panel"><Gauge value={Math.min(100, backRate * 5)} label="Back jobs" display={`${backRate}%`} color={backRate > 10 ? 'var(--red)' : '#ffb04d'} sub={`${cur.backjobs.length} of ${cur.received.length} cars came back`} /></Card>
        <Card className="panel" title="Cars by service">
          <div className="row" style={{ gap: 14, flexWrap: 'nowrap', alignItems: 'center' }}>
            <Donut className="glow-soft" size={110} center={String(cur.received.length)} items={SERVICE_KEYS.map((k) => ({ label: SERVICES[k].label, value: cur.byService[k], color: SVC_COLORS[k] }))} />
            <div className="stack grow">
              {SERVICE_KEYS.map((k) => <div key={k} className="row spread small" style={{ flexWrap: 'nowrap' }}><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><i className="swatch" style={{ background: SVC_COLORS[k] }} />{SERVICES[k].short}</span><span className="num">{cur.byService[k]}</span></div>)}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid g21 mt">
        <Card title="Cars in and out" action={<span className="row small" style={{ gap: 12 }}><span className="row" style={{ gap: 5 }}><i className="swatch" style={{ background: 'var(--arc)' }} />Received</span><span className="row" style={{ gap: 5 }}><i className="swatch" style={{ background: '#ff4d8d' }} />Released</span></span>}>
          <TrendChart labels={trend.map((t) => t.label)} series={[{ label: 'Received', color: 'var(--arc)', values: trend.map((t) => t.received), area: true }, { label: 'Released', color: '#ff4d8d', values: trend.map((t) => t.released) }]} />
        </Card>
        <Card title="Where clients came from" action={<span className="muted small">Cars received</span>}>
          {sources.length === 0 && <div className="muted small">No cars received in this period.</div>}
          {sources.length > 0 && (
            <div className="row" style={{ gap: 14, flexWrap: 'nowrap', alignItems: 'center' }}>
              <Donut className="glow-soft" size={120} center={String(cur.received.length)} items={sources.map((x, i) => ({ label: x.label, value: x.count, color: SRC_COLORS[i % SRC_COLORS.length] }))} />
              <div className="stack grow">
                {sources.map((x, i) => <div key={x.key} className="row spread small" style={{ flexWrap: 'nowrap' }}><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><i className="swatch" style={{ background: SRC_COLORS[i % SRC_COLORS.length] }} />{x.label}</span><span className="num">{x.count}</span></div>)}
              </div>
            </div>
          )}
        </Card>
      </div>

      {money && (
        <Card className="mt" title="Cash received" action={<span className="muted small">{RANGE_LABEL[key]}</span>}>
          <TrendChart labels={trend.map((t) => t.label)} format={(n) => moneyC(n).replace('₱', '')} series={[{ label: 'Cash received', color: '#8b7bff', values: trend.map((t) => t.billed), area: true }]} height={200} />
          <div className="small muted">Values in ₱.</div>
        </Card>
      )}

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
    </div>
  );
}
