import { moneyC } from '../lib/logic';

export interface Slice { label: string; value: number; color: string }

/** Round an axis maximum up to a tidy number so gridline labels read cleanly. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export function Donut({ items, size = 150, center }: { items: Slice[]; size?: number; center?: string }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={items.map((i) => `${i.label} ${total ? Math.round((i.value / total) * 100) : 0}%`).join(', ')}>
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
