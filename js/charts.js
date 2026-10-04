// Small chart helpers (inline SVG/HTML). Palette validated: violet, green, amber, blue (CVD-safe adjacent).
import { money, num } from './store.js';
import { esc } from './ui.js';
export const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
const nice = max => { if (max <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(max))), n = max / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const short = (v, fmt) => (fmt === 'money' ? (v >= 1e6 ? '₱' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '₱' + (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k' : '₱' + Math.round(v)) : num(v));
const full = (v, fmt) => (fmt === 'money' ? money(v) : num(v));

// Vertical columns: items [{label, value, tip?, color?}]
export function columns(items, { fmt = 'money', color = 'var(--c1)', title = '', h = 220 } = {}) {
  if (!items.length) return '<div class="muted">No data for this period.</div>';
  const W = 640, padL = 46, padB = 28, padT = 14, ih = h - padB - padT, iw = W - padL - 8, max = nice(Math.max(...items.map(i => i.value), 0));
  const bw = Math.max(4, Math.min(38, iw / items.length - 6)), step = iw / items.length, top = Math.max(...items.map(i => i.value));
  const grid = [0, .5, 1].map(f => { const y = padT + ih - f * ih; return `<line x1="${padL}" x2="${W - 8}" y1="${y}" y2="${y}" class="gl"/><text x="${padL - 6}" y="${y + 4}" text-anchor="end" class="ax">${short(max * f, fmt)}</text>`; }).join('');
  const every = Math.ceil(items.length / 14);
  const bars = items.map((it, i) => { const x = padL + i * step + (step - bw) / 2, bh = max ? it.value / max * ih : 0, y = padT + ih - bh; return `<g data-tip="${esc(it.label)}: ${esc(it.tip || full(it.value, fmt))}"><rect x="${padL + i * step}" y="${padT}" width="${step}" height="${ih}" fill="transparent"/><path d="M${x} ${padT + ih}V${y + 3}Q${x} ${y} ${x + 3} ${y}H${x + bw - 3}Q${x + bw} ${y} ${x + bw} ${y + 3}V${padT + ih}Z" fill="${it.color || color}"/>${it.value === top && it.value > 0 ? `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" class="vl">${short(it.value, fmt)}</text>` : ''}${i % every === 0 ? `<text x="${x + bw / 2}" y="${h - 8}" text-anchor="middle" class="ax">${esc(it.label)}</text>` : ''}</g>`; }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(title)}">${grid}${bars}</svg>`;
}

// Horizontal bars (HTML): items [{label, value, tip?, color?}] with direct value labels.
export function hbars(items, { fmt = 'money', color = 'var(--c1)', max: mx, valFmt } = {}) {
  if (!items.length) return '<div class="muted">No data for this period.</div>';
  const max = mx || Math.max(...items.map(i => i.value), 0) || 1;
  return `<div class="hbars">${items.map(i => `<div class="hb" data-tip="${esc(i.label)}: ${esc(i.tip || (valFmt ? valFmt(i.value) : full(i.value, fmt)))}"><span class="hl">${esc(i.label)}</span><span class="ht"><i style="width:${Math.max(i.value > 0 ? 1.5 : 0, i.value / max * 100)}%;background:${i.color || color}"></i></span><b class="hv">${valFmt ? valFmt(i.value) : full(i.value, fmt)}</b></div>`).join('')}</div>`;
}

// Single 100% stacked bar with legend + direct labels (2px gaps between segments).
export function stack(items, { fmt = 'money' } = {}) {
  const tot = items.reduce((a, i) => a + i.value, 0);
  if (!tot) return '<div class="muted">No data for this period.</div>';
  return `<div class="stack">${items.filter(i => i.value > 0).map((i, k) => `<span style="width:${i.value / tot * 100}%;background:${i.color || SERIES[k % 4]}" data-tip="${esc(i.label)}: ${full(i.value, fmt)} (${(i.value / tot * 100).toFixed(1)}%)">${i.value / tot > .12 ? `<em>${(i.value / tot * 100).toFixed(0)}%</em>` : ''}</span>`).join('')}</div>
  <div class="legendrow">${items.map((i, k) => `<span><i class="sw" style="background:${i.color || SERIES[k % 4]}"></i>${esc(i.label)} <b>${full(i.value, fmt)}</b></span>`).join('')}</div>`;
}
