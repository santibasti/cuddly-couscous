import { useId } from 'react';
import { moneyC } from '../lib/logic';

export interface Slice { label: string; value: number; color: string }

/** Round an axis maximum up to a tidy number so gridline labels read cleanly. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export function Donut({ items, size = 150, center, className }: { items: Slice[]; size?: number; center?: string; className?: string }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={items.map((i) => `${i.label} ${total ? Math.round((i.value / total) * 100) : 0}%`).join(', ')}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'var(--line)' }} strokeWidth={14} />
      {total > 0 && items.map((i) => {
        const len = (i.value / total) * c;
        const el = <circle key={i.label} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={14} strokeDasharray={`${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ stroke: i.color }}><title>{`${i.label}: ${moneyC(i.value)} (${Math.round((i.value / total) * 100)}%)`}</title></circle>;
        offset += len;
        return el;
      })}
      {center && <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--ink)', font: '600 22px var(--serif)' }}>{center}</text>}
    </svg>
  );
}

export interface Column { label: string; value: number; tip?: string; muted?: boolean }

/** Column chart with a zero baseline, three gridlines and optional reference marks (e.g. capacity). */
export function Columns({ data, marks, format = (n) => String(n), height = 210, unit }: { data: Column[]; marks?: number[]; format?: (n: number) => string; height?: number; unit?: string }) {
  const W = 560;
  const padL = 46;
  const padB = 26;
  const padT = 14;
  const max = niceMax(Math.max(...data.map((d) => d.value), ...(marks ?? [0])));
  const plotH = height - padB - padT;
  const slot = (W - padL - 8) / data.length;
  const bw = Math.min(54, slot * 0.56);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" style={{ display: 'block', maxHeight: height + 40 }}>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - 8} y1={y(max * t)} y2={y(max * t)} style={{ stroke: 'var(--line)' }} strokeDasharray={t === 0 ? undefined : '3 4'} />
          <text x={padL - 8} y={y(max * t)} textAnchor="end" dominantBaseline="central" style={{ fill: 'var(--muted)', font: '11px Inter, sans-serif' }}>{format(max * t)}{unit && t === 1 ? unit : ''}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + slot * i + (slot - bw) / 2;
        const top = y(d.value);
        const inside = padT + plotH - top > 28 && !d.muted;
        return (
          <g key={d.label}>
            <rect x={x} y={top} width={bw} height={Math.max(0, padT + plotH - top)} rx={5} style={{ fill: d.muted ? 'var(--line2)' : 'var(--arc)', opacity: d.muted ? 0.7 : 0.9 }}><title>{d.tip ?? `${d.label}: ${format(d.value)}`}</title></rect>
            {d.value > 0 && (inside
              ? <text x={x + bw / 2} y={top + 16} textAnchor="middle" style={{ fill: '#031821', font: '700 11px Inter, sans-serif' }}>{format(d.value)}</text>
              : <text x={x + bw / 2} y={top - 6} textAnchor="middle" style={{ fill: 'var(--ink2)', font: '600 11px Inter, sans-serif' }}>{format(d.value)}</text>)}
            {marks?.[i] !== undefined && <line x1={x - 6} x2={x + bw + 6} y1={y(marks[i])} y2={y(marks[i])} strokeWidth={2.5} strokeLinecap="round" style={{ stroke: 'var(--accent2)' }}><title>{`Capacity: ${format(marks[i])}`}</title></line>}
            <text x={x + bw / 2} y={height - 8} textAnchor="middle" style={{ fill: 'var(--muted)', font: '11px Inter, sans-serif' }}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** A dial from 0 to 100 with tick marks, for one headline rate. */
export function Gauge({ value, label, sub, color = 'var(--arc)', size = 190, display }: { value: number; label: string; sub?: string; color?: string; size?: number; display?: string }) {
  const v = Math.max(0, Math.min(100, value)) / 100;
  const r = size / 2 - 18;
  const c = 2 * Math.PI * r;
  const arc = 0.75 * c;
  const cx = size / 2;
  const ticks = Array.from({ length: 28 }, (_, i) => {
    const a = (135 + (270 * i) / 27) * (Math.PI / 180);
    const on = i / 27 <= v;
    return <line key={i} x1={cx + (r - 14) * Math.cos(a)} y1={cx + (r - 14) * Math.sin(a)} x2={cx + (r - (i % 3 === 0 ? 24 : 20)) * Math.cos(a)} y2={cx + (r - (i % 3 === 0 ? 24 : 20)) * Math.sin(a)} strokeWidth={i % 3 === 0 ? 2 : 1.2} style={{ stroke: on ? color : 'var(--line2)' }} />;
  });
  return (
    <div className="gauge">
      <svg width={size} height={size * 0.86} viewBox={`0 0 ${size} ${size * 0.86}`} role="img" aria-label={`${label}: ${display ?? Math.round(v * 100) + '%'}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" strokeWidth={10} strokeLinecap="round" strokeDasharray={`${arc} ${c}`} transform={`rotate(135 ${cx} ${cx})`} style={{ stroke: 'var(--line)' }} />
        <circle className="glow" cx={cx} cy={cx} r={r} fill="none" strokeWidth={10} strokeLinecap="round" strokeDasharray={`${Math.max(0.01, arc * v)} ${c}`} transform={`rotate(135 ${cx} ${cx})`} style={{ stroke: color, color }} />
        {ticks}
        <text x={cx} y={cx + 4} textAnchor="middle" style={{ fill: 'var(--ink)', font: '600 34px var(--serif)' }}>{display ?? `${Math.round(v * 100)}%`}</text>
        <text x={cx} y={cx + 26} textAnchor="middle" style={{ fill: 'var(--muted)', font: '600 10.5px Inter, sans-serif', letterSpacing: '.12em' }}>{label.toUpperCase()}</text>
      </svg>
      {sub && <div className="small muted" style={{ textAlign: 'center', marginTop: -6 }}>{sub}</div>}
    </div>
  );
}

export interface TrendSeries { label: string; color: string; values: number[]; area?: boolean }

/** Smooth glowing lines over time, with an optional filled area under a series. */
export function TrendChart({ labels, series, height = 230, format = (n) => String(Math.round(n)) }: { labels: string[]; series: TrendSeries[]; height?: number; format?: (n: number) => string }) {
  const uid = useId().replace(/:/g, '');
  const W = 620, padL = 44, padR = 12, padT = 14, padB = 26;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1));
  const y = (v: number) => padT + (height - padT - padB) * (1 - v / max);
  const path = (vals: number[]) => vals.map((v, i) => (i === 0 ? `M${x(i)},${y(v)}` : `C${(x(i - 1) + x(i)) / 2},${y(vals[i - 1])} ${(x(i - 1) + x(i)) / 2},${y(v)} ${x(i)},${y(v)}`)).join(' ');
  const every = Math.max(1, Math.ceil(n / 7));
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" style={{ display: 'block' }}>
      <defs>
        {series.map((s, k) => (
          <linearGradient key={k} id={`${uid}g${k}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity=".38" /><stop offset="100%" stopColor={s.color} stopOpacity="0" /></linearGradient>
        ))}
      </defs>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(max * t)} y2={y(max * t)} style={{ stroke: 'var(--line)' }} strokeDasharray={t === 0 ? undefined : '3 5'} />
          <text x={padL - 8} y={y(max * t)} textAnchor="end" dominantBaseline="central" style={{ fill: 'var(--muted)', font: '11px Inter, sans-serif' }}>{format(max * t)}</text>
        </g>
      ))}
      {series.map((s, k) => s.area && n > 1 && <path key={'a' + k} d={`${path(s.values)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${uid}g${k})`} />)}
      {series.map((s, k) => <path key={'l' + k} className="glow" d={path(s.values)} fill="none" strokeWidth={2.4} strokeLinecap="round" style={{ stroke: s.color, color: s.color }} />)}
      {series.map((s, k) => s.values.map((v, i) => <circle key={`${k}-${i}`} cx={x(i)} cy={y(v)} r={3} style={{ fill: 'var(--bg)', stroke: s.color }} strokeWidth={1.6}><title>{`${s.label}, ${labels[i]}: ${format(v)}`}</title></circle>))}
      {labels.map((l, i) => (i % every === 0 || i === n - 1) && <text key={i} x={x(i)} y={height - 8} textAnchor="middle" style={{ fill: 'var(--muted)', font: '11px Inter, sans-serif' }}>{l}</text>)}
    </svg>
  );
}
