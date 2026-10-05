import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { useOrg } from '@/store/hooks';
import { addDays, endOfMonth, fmtDate, startOfMonth } from '@/domain/dates';
import { ALL_SOURCES, SOURCE_META } from '@/domain/meta';
import { buildReport, REPORT_LIST, type ReportId } from '@/domain/reports';
import { pct, peso, pesoCompact } from '@/domain/money';
import { downloadCsv, downloadTablePdf } from '@/lib/export';
import type { Source } from '@/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/bits';
import { cn } from '@/lib/utils';

type Preset = '30d' | 'month' | 'last-month' | 'next30' | 'custom';
const AXIS = { fontSize: 11, fill: '#7a8aa6' };

export default function Reports() {
  const org = useOrg()!;
  const [id, setId] = useState<ReportId>('revenue');
  const [preset, setPreset] = useState<Preset>('30d');
  const [custom, setCustom] = useState({ from: addDays(org.today, -29), to: org.today });
  const [res, setRes] = useState(''); const [src, setSrc] = useState<'' | Source>('');
  const [gran, setGran] = useState<'day' | 'week' | 'month'>('day');

  const { start, end } = useMemo(() => {
    if (preset === '30d') return { start: addDays(org.today, -29), end: addDays(org.today, 1) };
    if (preset === 'month') return { start: startOfMonth(org.today), end: addDays(endOfMonth(org.today), 1) };
    if (preset === 'last-month') { const e = startOfMonth(org.today); const s = startOfMonth(addDays(e, -1)); return { start: s, end: e }; }
    if (preset === 'next30') return { start: org.today, end: addDays(org.today, 30) };
    return { start: custom.from, end: addDays(custom.to < custom.from ? custom.from : custom.to, 1) };
  }, [preset, custom, org.today]);

  const report = useMemo(() => buildReport(id, {
    bookings: org.bookings, resources: org.resources, blocks: org.blocks, payments: org.payments, guests: org.guests, audit: org.audit, alerts: org.alerts, today: org.today, start, end,
    filters: { resourceIds: res ? [res] : undefined, sources: src ? [src] : undefined }, memberName: org.memberName, guestName: (g) => org.guestById(g)?.fullName ?? '—', resName: (r) => org.resourceById(r)?.name ?? '—',
  }, gran), [id, org, start, end, res, src, gran]);

  const fmtVal = (v: number, f: 'peso' | 'pct' | 'count') => (f === 'peso' ? peso(v) : f === 'pct' ? pct(v, 1) : String(v));
  const rangeLabel = `${fmtDate(start)} – ${fmtDate(addDays(end, -1))}`;
  const file = `${report.id}-${start}_${addDays(end, -1)}`;
  const money = (c: string | number, col: string) => (typeof c === 'number' && /PHP/.test(col) ? peso(c) : c);

  return (
    <div>
      <PageHeader title="Reports" subtitle={`${rangeLabel}${res ? ' · ' + org.resourceById(res)?.name : ''}${src ? ' · ' + SOURCE_META[src].label : ''}`} actions={<>
        <Button variant="outline" onClick={() => downloadCsv(file, report.columns, report.rows)}><Download />CSV</Button>
        <Button variant="outline" onClick={() => downloadTablePdf(file, report.title, `${org.org.name} | ${rangeLabel}`, report.columns, report.rows)}><FileText />PDF</Button>
      </>} />
      <Card className="mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Date range"><option value="30d">Last 30 days</option><option value="month">This month</option><option value="last-month">Last month</option><option value="next30">Next 30 days</option><option value="custom">Custom range</option></Select>
        {preset === 'custom' ? <div className="flex items-center gap-2 lg:col-span-2"><Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /><span>–</span><Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div> : <div className="hidden lg:col-span-2 lg:block" />}
        <Select value={res} onChange={(e) => setRes(e.target.value)} aria-label="Property"><option value="">All properties</option>{org.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        <Select value={src} onChange={(e) => setSrc(e.target.value as Source | '')} aria-label="Channel"><option value="">All channels</option>{ALL_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_META[s].label}</option>)}</Select>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Reports">
          {REPORT_LIST.map(([k, l]) => <button key={k} onClick={() => setId(k)} className={cn('whitespace-nowrap rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold', id === k ? 'bg-navy-900 text-white' : 'bg-white text-ink-soft ring-1 ring-line hover:bg-brand-50')}>{l}</button>)}
        </nav>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title={report.title} subtitle={report.description} action={id === 'revenue' && <div className="inline-flex rounded-lg bg-canvas p-1">{(['day', 'week', 'month'] as const).map((g) => <button key={g} onClick={() => setGran(g)} className={cn('rounded-md px-3 py-1 text-xs font-semibold capitalize', gran === g ? 'bg-white shadow-sm' : 'text-ink-soft')}>{g}</button>)}</div>} />
            <div className="grid gap-3 px-5 pb-4 sm:grid-cols-3">{report.summary.map((s) => <div key={s.label} className="rounded-xl bg-canvas p-3.5"><p className="text-xs font-semibold text-ink-mute">{s.label}</p><p className="mt-1 font-display text-xl font-extrabold tabnum">{s.value}</p></div>)}</div>
            {report.chart && report.chart.data.length > 0 && (
              <div className="h-64 px-2 pb-4">
                <ResponsiveContainer width="100%" height="100%">
                  {report.chart.kind === 'area' ? (
                    <AreaChart data={report.chart.data} margin={{ left: 4, right: 16, top: 8 }}>
                      <CartesianGrid stroke="#e1e8f2" vertical={false} /><XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={28} /><YAxis tickFormatter={pesoCompact} tick={AXIS} axisLine={false} tickLine={false} width={52} />
                      <RTooltip content={({ active, payload }) => active && payload?.length ? <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg"><p className="font-semibold">{payload[0].payload.label}</p><p className="tabnum text-brand-700">{fmtVal(Number(payload[0].value), report.chart!.format)}</p></div> : null} />
                      <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} fill="#2563eb" fillOpacity={0.1} dot={false} />
                    </AreaChart>
                  ) : (
                    <BarChart data={report.chart.data} margin={{ left: 4, right: 16, top: 8 }}>
                      <CartesianGrid stroke="#e1e8f2" vertical={false} /><XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={0} /><YAxis tickFormatter={(v) => report.chart!.format === 'peso' ? pesoCompact(v) : report.chart!.format === 'pct' ? `${Math.round(v * 100)}%` : String(v)} tick={AXIS} axisLine={false} tickLine={false} width={52} />
                      <RTooltip cursor={{ fill: 'rgba(37,99,235,.06)' }} content={({ active, payload }) => active && payload?.length ? <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg"><p className="font-semibold">{payload[0].payload.label}</p><p className="tabnum text-brand-700">{fmtVal(Number(payload[0].value), report.chart!.format)}</p></div> : null} />
                      <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={44} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </Card>
          <Card className="overflow-hidden">
            {report.rows.length === 0 ? <EmptyState title="Nothing to report" body="No data matches this range and these filters." /> : (
              <Table><thead><tr>{report.columns.map((c, k) => <Th key={c} className={typeof report.rows[0][k] === 'number' ? 'text-right' : ''}>{c}</Th>)}</tr></thead>
                <tbody>{report.rows.map((r, ri) => <tr key={ri} className="hover:bg-brand-50/30">{r.map((c, k) => <Td key={k} className={cn(typeof c === 'number' && 'tabnum text-right', k === 0 && 'font-semibold', report.columns[k] === 'Detail' && 'max-w-md truncate')}>{money(c, report.columns[k])}</Td>)}</tr>)}</tbody></Table>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
