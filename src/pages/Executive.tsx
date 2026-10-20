// Executive tab: forecast, operating constraints and an AI business review.
// Every figure is calculated from the company's own records (lib/executive.ts); the AI only explains them and suggests decisions.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/lib/store';
import { Badge, Card, PageHead, attempt, toast } from '@/components/ui';
import { aiSummary, buildExecutive, type ExecData, type Severity } from '@/lib/executive';
import { deleteReport, generateAnalysis, generateResearch, listReports, saveReport, type Analysis, type Research, type SavedReport } from '@/lib/executive-reports';
import { CLOUD } from '@/lib/cloud';
import { fmtDate, fmtDateTime, money, today } from '@/lib/util';

const TONE: Record<Severity, string> = { high: 'red', medium: 'amber', low: 'blue', ok: 'green' };
const SEV_LABEL: Record<Severity, string> = { high: 'Constraint', medium: 'Watch', low: 'Spare capacity', ok: 'Fine' };
const HEALTH: Record<string, [string, string]> = { strong: ['Strong', 'green'], steady: ['Steady', 'teal'], watch: ['Watch', 'amber'], at_risk: ['At risk', 'red'] };
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
const pc = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`);
const k = (n: number) => (Math.abs(n) >= 1_000_000 ? `₱${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `₱${Math.round(n / 1000)}K` : `₱${Math.round(n)}`);

export default function Executive() {
  const { db } = useAuth();
  const T = today();
  const d = useMemo(() => buildExecutive(db, T), [db, T]);
  const [research, setResearch] = useState(true);
  const [busy, setBusy] = useState<'' | 'analysis' | 'research'>('');
  const [part, setPart] = useState<{ analysis: Analysis | null; research: Research | null; err?: string; rerr?: string; model?: string } | null>(null);
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [openId, setOpenId] = useState('');
  const load = useCallback(() => { listReports().then(setSaved).catch(() => undefined); }, []);
  useEffect(load, [load]);

  const generate = async () => {
    setPart({ analysis: null, research: null }); setOpenId(''); setBusy('analysis');
    const summary = aiSummary(d);
    const a = generateAnalysis(summary); const r = research ? generateResearch(summary) : null;
    let analysis: Analysis | null = null; let rs: Research | null = null; let model: string | undefined; let err = ''; let rerr = '';
    try { const x = await a; analysis = x.result; model = x.model; } catch (e) { err = e instanceof Error ? e.message : 'The AI could not write the analysis.'; }
    setPart({ analysis, research: null, err, model }); setBusy(research ? 'research' : '');
    if (r) { try { rs = (await r).result; } catch (e) { rerr = e instanceof Error ? e.message : 'The research could not be done.'; } }
    setPart({ analysis, research: rs, err, rerr, model }); setBusy('');
    if (analysis || rs) {
      try { const row = await saveReport({ as_of: T, with_research: !!rs, model: model ?? null, metrics: summary, analysis, research: rs }); setSaved((s) => [row, ...s]); setOpenId(row.id); setPart(null); toast('Report saved', 'ok'); }
      catch (e) { toast(e instanceof Error ? e.message : 'The report could not be saved (it is shown below).', 'err'); }
    }
  };
  const shown = openId ? saved.find((s) => s.id === openId) : null;
  const view = shown ? { analysis: shown.analysis, research: shown.research, model: shown.model ?? undefined, when: shown.created_at } : part ? { ...part, when: '' } : null;

  return (
    <>
      <PageHead icon="🧭" title="Executive" sub="Forecast, where operations are limiting growth, and an AI business review. Every figure is calculated from your own records; the AI explains them and suggests decisions.">
        <label className="check small" title="Looks up current market information with sources, in a separate section"><input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} />Include outside research</label>
        <button className="btn primary" disabled={!!busy} onClick={() => void generate()}>{busy ? 'Writing the report…' : '✨ Generate AI report'}</button>
      </PageHead>

      <Verdict d={d} />
      <KpiRow d={d} />
      <ForecastCard d={d} />
      <ConstraintsCard d={d} />
      <ServicesCard d={d} />

      <Card title="AI business review" actions={saved.length > 0 && <select value={openId} onChange={(e) => { setOpenId(e.target.value); if (e.target.value) setPart(null); }} aria-label="Saved reports"><option value="">{part ? 'Current report' : 'Saved reports…'}</option>{saved.map((s) => <option key={s.id} value={s.id}>{fmtDate(s.as_of)} · {fmtDateTime(s.created_at).split(',').pop()?.trim()}{s.with_research ? ' · with research' : ''}</option>)}</select>}>
        {!view && !busy && (
          <div className="muted small" style={{ maxWidth: 720 }}>
            {CLOUD ? 'Tap “Generate AI report”. It takes about a minute. Only totals and trends are sent to the AI — no client, staff or site names, TINs or individual pay. Treat it as a second opinion: it does not know your market relationships or what you have already tried.' : 'The AI report works on the live site. The figures above work everywhere.'}
          </div>
        )}
        {busy && <div className="alert info">{busy === 'analysis' ? 'The AI is studying your numbers…' : 'Analysis ready. Researching the outside market…'} <span className="small muted">(keep this page open)</span></div>}
        {view?.err && <div className="alert err">{view.err}</div>}
        {view && <ReportView analysis={view.analysis} research={view.research} rerr={'rerr' in view ? view.rerr : undefined} wanted={research || !!shown?.with_research} />}
        {shown && <div style={{ marginTop: 12 }}><button className="btn sm" onClick={() => { if (confirm('Delete this saved report?')) attempt(async () => { await deleteReport(shown.id); setSaved((s) => s.filter((x) => x.id !== shown.id)); setOpenId(''); }, 'Report deleted'); }}>Delete this report</button></div>}
      </Card>
      <div className="small muted" style={{ marginTop: 10 }}>The AI does not give legal, tax or safety rulings, and its research can be wrong or out of date — check the sources before acting on anything important.</div>
    </>
  );
}

function Verdict({ d }: { d: ExecData }) {
  const tone = d.verdict.constraint === 'operations' ? 'warn' : d.verdict.constraint === 'demand' ? 'info' : 'info';
  const label = d.verdict.constraint === 'operations' ? 'Operations are limiting growth' : d.verdict.constraint === 'demand' ? 'Demand is limiting growth' : d.verdict.constraint === 'balanced' ? 'Operations and demand are balanced' : 'Not enough data yet';
  return <div className={`alert ${tone}`} style={{ marginBottom: 12 }}><b>{label}.</b> {d.verdict.text}</div>;
}

function KpiRow({ d }: { d: ExecData }) {
  const x = d.kpis; const last3 = d.months.filter((m) => !m.partial).slice(-3);
  return (
    <div className="grid g4 keep2" style={{ marginBottom: 12 }}>
      <div className="stat navy"><div className="k">Revenue, last 90 days</div><div className="v">{money(x.revenue90)}</div><div className="s">gross margin {pc(x.grossMargin90)} · net {pc(x.netMargin90)}</div></div>
      <div className="stat"><div className="k">Next month forecast</div><div className="v">{d.forecast[0] ? money(d.forecast[0].base) : '—'}</div><div className="s">{d.forecast[0] ? `${pc(d.forecast[0].bookedShare)} already booked` : ''}</div></div>
      <div className={`stat ${(d.capacity.avgUtilNext28 ?? 0) >= 0.8 ? 'bad' : ''}`}><div className="k">Crew booked, next 28 days</div><div className="v">{pc(d.capacity.avgUtilNext28)}</div><div className="s">busiest day {pc(d.capacity.peakPct)} · {d.capacity.fieldStaff} field staff</div></div>
      <div className={`stat ${x.overduePct > 0.3 ? 'bad' : ''}`}><div className="k">Unpaid bills</div><div className="v">{money(x.receivables)}</div><div className="s">{pc(x.overduePct)} overdue · {x.dso ?? '—'} days of sales</div></div>
      <div className="stat"><div className="k">Repeat clients</div><div className="v">{pc(x.repeatRate)}</div><div className="s">{x.clients} billed · top 3 = {pc(x.top3Share)}</div></div>
      <div className="stat"><div className="k">Quotation win rate</div><div className="v">{pc(x.winRate)}</div><div className="s">{x.quotesOpen} open · {k(x.quotesOpenValue)}</div></div>
      <div className={`stat ${x.approvedUnbooked >= 3 ? 'bad' : ''}`}><div className="k">Approved, not yet booked</div><div className="v">{x.approvedUnbooked}</div><div className="s">about {k(x.approvedUnbookedValue)}</div></div>
      <div className="stat"><div className="k">Client rating (90 days)</div><div className="v">{x.rating ?? '—'} <span className="small">/ 5</span></div><div className="s">{last3.length ? `last 3 months ${k(last3.reduce((a, m) => a + m.revenue, 0))}` : ''}</div></div>
    </div>
  );
}

function ForecastCard({ d }: { d: ExecData }) {
  const cur = today().slice(0, 7);
  const lastFull = [...d.months].reverse().find((m) => !m.partial)?.month;
  const data = [
    ...d.months.map((m) => ({ label: monthLabel(m.month), actual: m.revenue, partial: m.partial, forecast: m.month === lastFull ? m.revenue : undefined as number | undefined, band: undefined as [number, number] | undefined })),
    ...d.forecast.filter((f) => f.month !== cur || !d.months.some((m) => m.month === cur)).map((f) => ({ label: monthLabel(f.month), actual: undefined as number | undefined, partial: false, forecast: f.base, band: [f.low, f.high] as [number, number] })),
  ];
  // the current month shows what is billed so far (actual) and what is expected for the whole month (forecast)
  const curRow = d.forecast.find((f) => f.month === cur); const ci = data.findIndex((r) => r.label === monthLabel(cur));
  if (curRow && ci >= 0) { data[ci].forecast = curRow.base; data[ci].band = [curRow.low, curRow.high]; }
  return (
    <Card title="Forecast: next 3 months">
      <div style={{ width: '100%', height: 250 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3a4a63" /><XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} tickFormatter={(v) => k(Number(v))} />
            <Tooltip formatter={(v, n) => [Array.isArray(v) ? `${k(v[0])} – ${k(v[1])}` : money(Number(v)), n === 'band' ? 'Likely range' : n === 'forecast' ? 'Forecast' : 'Billed']} />
            <Legend formatter={(v) => (v === 'band' ? 'Likely range' : v === 'forecast' ? 'Forecast' : 'Billed (net of VAT)')} />
            <Area dataKey="band" stroke="none" fill="#12a1a7" fillOpacity={0.18} isAnimationActive={false} />
            <Line type="monotone" dataKey="actual" stroke="#4aa3ff" strokeWidth={3} dot={{ r: 3 }} connectNulls={false} />
            <Line type="monotone" dataKey="forecast" stroke="#2ee59d" strokeWidth={3} strokeDasharray="6 4" dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Month</th><th className="num">Booked so far</th><th className="num">Run-rate</th><th className="num">Forecast</th><th className="num">Range</th><th>Covered by bookings</th></tr></thead><tbody>
        {d.forecast.map((f) => <tr key={f.month}><td>{monthLabel(f.month)}</td><td className="num">{money(f.booked)}</td><td className="num">{money(f.runRate)}</td><td className="num"><b>{money(f.base)}</b></td><td className="num small">{k(f.low)} – {k(f.high)}</td><td><span className="satbar"><i style={{ width: `${f.bookedShare * 100}%`, background: f.bookedShare >= 0.6 ? 'var(--green)' : f.bookedShare >= 0.3 ? 'var(--amber)' : 'var(--red)' }} /></span> {pc(f.bookedShare)}</td></tr>)}
      </tbody></table></div>
      <p className="small muted" style={{ marginTop: 8 }}>{d.forecastMethod} A forecast is a guess based on the past: a lost big client, a rainy season or a new contract can move it.</p>
    </Card>
  );
}

function ConstraintsCard({ d }: { d: ExecData }) {
  const c = d.capacity;
  return (
    <Card title="Are we constrained in operations?" actions={<span className="small muted">next 28 days · {c.fieldStaff} field staff · teams of ~{c.avgTeamSize} · {c.vehicles} vehicle{c.vehicles === 1 ? '' : 's'}</span>}>
      <div className="small muted" style={{ marginBottom: 6 }}>Each bar is a day: how much of the available crew is booked (red = more people booked than you have).</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(28, minmax(0, 1fr))', gap: 3, alignItems: 'end', height: 74, marginBottom: 14 }}>
        {c.days.map((x) => (
          <div key={x.date} title={`${fmtDate(x.date)}: ${x.demand} of ${x.available} crew booked (${x.jobs} job${x.jobs === 1 ? '' : 's'})`} style={{ height: `${Math.max(6, Math.min(100, x.pct * 100))}%`, borderRadius: 3, background: x.available === 0 ? 'rgba(120,140,170,.3)' : x.pct > 1 ? 'var(--red)' : x.pct >= 0.85 ? 'var(--amber)' : x.pct >= 0.5 ? 'var(--teal)' : 'rgba(18,161,167,.4)' }} />
        ))}
      </div>
      <div className="grid g2">
        {d.constraints.map((x) => (
          <div key={x.key} className="card" style={{ padding: 12 }}>
            <div className="row between"><b>{x.title}</b><Badge tone={TONE[x.severity] as never}>{SEV_LABEL[x.severity]}</Badge></div>
            <div className="small" style={{ marginTop: 4 }}><b>{x.metric}</b></div>
            <div className="small muted" style={{ marginTop: 4 }}>{x.detail}</div>
            <div className="small" style={{ marginTop: 6 }}>➜ {x.action}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ServicesCard({ d }: { d: ExecData }) {
  if (!d.services.length) return null;
  return (
    <Card title="Which services earn the most (last 90 days)">
      <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Service</th><th className="num">Revenue</th><th className="num">Share</th><th className="num">Gross margin</th></tr></thead><tbody>
        {d.services.map((s) => <tr key={s.name}><td>{s.name}</td><td className="num">{money(s.revenue)}</td><td className="num">{pc(s.share)}</td><td className="num">{pc(s.grossMargin)}</td></tr>)}
      </tbody></table></div>
    </Card>
  );
}

const List = ({ items }: { items?: string[] }) => (items?.length ? <ul className="list plain" style={{ margin: '4px 0 0 18px' }}>{items.map((x, i) => <li key={i} style={{ marginBottom: 3 }}>{x}</li>)}</ul> : null);
const H = ({ children }: { children: React.ReactNode }) => <h3 style={{ margin: '16px 0 4px', fontSize: 15 }}>{children}</h3>;

function ReportView({ analysis: a, research: r, rerr, wanted }: { analysis: Analysis | null; research: Research | null; rerr?: string; wanted: boolean }) {
  const h = a?.health ? HEALTH[a.health] : undefined;
  return (
    <div style={{ maxWidth: 860 }}>
      {a && (<>
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{h && <Badge tone={h[1] as never}>{h[0]}</Badge>}<b style={{ fontSize: 17 }}>{a.headline}</b></div>
        {a.summary && <p style={{ marginTop: 8 }}>{a.summary}</p>}
        {!!a.working?.length && <><H>What is working</H><List items={a.working} /></>}
        {!!a.risks?.length && <><H>Risks</H><ul className="list plain" style={{ margin: '4px 0 0 18px' }}>{a.risks.map((x, i) => <li key={i} style={{ marginBottom: 4 }}><Badge tone={(x.severity === 'high' ? 'red' : x.severity === 'medium' ? 'amber' : 'blue') as never}>{x.severity}</Badge> <b>{x.risk}</b> — {x.why}</li>)}</ul></>}
        {a.constraints && <><H>Are operations the constraint?</H><p style={{ margin: '4px 0' }}>{a.constraints.explanation}</p><List items={a.constraints.evidence} />{!!a.constraints.what_to_do?.length && <><div className="small muted" style={{ marginTop: 6 }}>What to do</div><List items={a.constraints.what_to_do} /></>}</>}
        {a.forecast && <><H>Forecast: what it means</H><p style={{ margin: '4px 0' }}>{a.forecast.outlook}</p>{!!a.forecast.assumptions?.length && <><div className="small muted">Assumptions</div><List items={a.forecast.assumptions} /></>}{!!a.forecast.could_change_it?.length && <><div className="small muted" style={{ marginTop: 6 }}>What could change it</div><List items={a.forecast.could_change_it} /></>}</>}
        {!!a.decisions?.length && <><H>Decisions to consider (best first)</H>
          <div className="grid g2">{a.decisions.map((x, i) => (
            <div key={i} className="card" style={{ padding: 12 }}>
              <div className="row between"><b>{i + 1}. {x.title}</b><span className="small muted">{x.basis === 'data' ? 'from your data' : 'assumption'}</span></div>
              <div className="small" style={{ marginTop: 4 }}>{x.why}</div>
              <div className="small" style={{ marginTop: 4 }}><b>Impact:</b> {x.expected_impact}</div>
              <div className="small muted" style={{ marginTop: 4 }}>Effort {x.effort} · confidence {x.confidence}</div>
              <div className="small" style={{ marginTop: 6 }}>➜ First step: {x.first_step}</div>
            </div>))}</div></>}
        {a.plan && <><H>30 / 60 / 90-day plan</H><div className="grid g3"><div><b>30 days</b><List items={a.plan.days_30} /></div><div><b>60 days</b><List items={a.plan.days_60} /></div><div><b>90 days</b><List items={a.plan.days_90} /></div></div></>}
        {!!a.questions?.length && <><H>Questions only you can answer</H><List items={a.questions} /></>}
        {!!a.data_gaps?.length && <><H>Data the system does not record yet</H><List items={a.data_gaps} /></>}
      </>)}
      {(r || rerr || wanted) && <><H>Outside research (with sources)</H>
        {rerr && <div className="alert warn">{rerr}</div>}
        {!r && !rerr && <div className="muted small">No research in this report.</div>}
        {r?.caution && <div className="small muted" style={{ marginBottom: 6 }}>{r.caution}</div>}
        {r?.findings?.map((x, i) => <div key={i} className="card" style={{ padding: 12, marginBottom: 8 }}><b>{x.topic}</b><div className="small" style={{ marginTop: 4 }}>{x.finding}</div><div className="small muted" style={{ marginTop: 4 }}>Why it matters: {x.why_it_matters}</div>{x.source_url && <div className="small" style={{ marginTop: 4 }}>Source: <a href={x.source_url} target="_blank" rel="noreferrer">{x.source_title || x.source_url}</a></div>}</div>)}
        {!!r?.ideas?.length && <><div className="small muted" style={{ marginTop: 8 }}>Ideas to test</div>{r.ideas.map((x, i) => <div key={i} style={{ marginTop: 6 }}><b>{x.idea}</b><div className="small muted">Test cheaply: {x.how_to_test_cheaply}{x.source_url && <> · <a href={x.source_url} target="_blank" rel="noreferrer">source</a></>}</div></div>)}</>}
      </>}
    </div>
  );
}
