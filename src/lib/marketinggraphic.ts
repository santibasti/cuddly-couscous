// Branded graphics for Facebook posts, drawn in the browser (1080 × 1080) from the AI's headline — no image generator involved, so every graphic uses the real TopMop logo and colours.
import { LOGO_SMALL_URL } from './logo';
import { EMPTY_POSTER, renderPoster, type PosterSpec } from './marketingposter';
import { renderTemplate } from './marketingtemplate';

export type GraphicStyle = 'auto' | 'template' | 'poster' | 'tip' | 'promo' | 'seasonal' | 'job';
export interface GraphicSpec { on: boolean; headline: string; sub: string; points: string[]; style: GraphicStyle; poster?: PosterSpec }
export const STYLE_LABEL: Record<GraphicStyle, string> = { auto: 'Automatic (TopMop service poster)', template: 'TopMop service poster (light)', poster: 'Dark poster', tip: 'Simple tip card', promo: 'Simple free-quote card', seasonal: 'Simple seasonal card', job: 'Simple job card' };
const NAVY = '#0b2545', NAVY2 = '#13427a', CYAN = '#1fb6c9', GOLD = '#f5b83d', WHITE = '#ffffff';
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
export const SIZE = 1080;

export const resolveStyle = (kind: string, s: GraphicStyle, hasPhotos: boolean): Exclude<GraphicStyle, 'auto' | 'template' | 'poster'> | 'poster' | 'template' => {
  void kind; void hasPhotos;
  if (s === 'auto' || s === 'template') return 'template';
  return s;
};
const TAG: Record<Exclude<GraphicStyle, 'auto' | 'template' | 'poster'>, string> = { tip: 'CLEANING TIP', promo: 'FREE QUOTE', seasonal: 'SEASON TIP', job: 'JOB UPDATE' };

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}
/** Largest font (≤ max) at which the text fits in `maxLines` lines. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: string, max: number, min: number, maxW: number, maxLines: number) {
  for (let size = max; size >= min; size -= 4) { ctx.font = `${weight} ${size}px ${FONT}`; const l = wrap(ctx, text, maxW); if (l.length <= maxLines) return { size, lines: l }; }
  ctx.font = `${weight} ${min}px ${FONT}`; return { size: min, lines: wrap(ctx, text, maxW).slice(0, maxLines) };
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip(); const s = Math.max(w / img.naturalWidth, h / img.naturalHeight); const iw = img.naturalWidth * s, ih = img.naturalHeight * s; ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); ctx.restore();
}

export async function renderGraphic(c: HTMLCanvasElement, spec: GraphicSpec, kind: string, o: { company: { name: string; phone: string; email: string; tagline?: string; website?: string; facebook?: string }; photos: string[] }) {
  const styleNow = resolveStyle(kind, spec.style, o.photos.length > 0);
  if (styleNow === 'template') { await renderTemplate(c, { headline: spec.headline, sub: spec.sub, poster: { ...EMPTY_POSTER, ...spec.poster, features: spec.poster?.features?.length ? spec.poster.features : spec.points.filter(Boolean).slice(0, 3).map((label) => ({ icon: 'check' as const, label })) }, company: o.company, photos: o.photos }); return; }
  if (styleNow === 'poster') { await renderPoster(c, { headline: spec.headline, sub: spec.sub, poster: { ...EMPTY_POSTER, ...spec.poster, features: spec.poster?.features?.length ? spec.poster.features : spec.points.filter(Boolean).slice(0, 3).map((label) => ({ icon: 'check' as const, label })) }, company: o.company, photos: o.photos }); return; }
  c.width = SIZE; c.height = SIZE; const ctx = c.getContext('2d')!;
  const imgs = (await Promise.all(o.photos.slice(0, 2).map(loadImg))).filter(Boolean) as HTMLImageElement[];
  const style = resolveStyle(kind, spec.style, imgs.length > 0) as Exclude<GraphicStyle, 'auto' | 'template' | 'poster'>; const accent = style === 'promo' ? GOLD : CYAN;
  // background
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE); g.addColorStop(0, NAVY); g.addColorStop(1, style === 'seasonal' ? '#0e6f7d' : NAVY2); ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, SIZE);
  let seed = [...spec.headline].reduce((a, ch) => a + ch.charCodeAt(0), 7); const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(rnd() * SIZE, rnd() * SIZE, 30 + rnd() * 110, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${0.035 + rnd() * 0.05})`; ctx.fill(); }
  // squeegee stripe
  ctx.save(); ctx.translate(SIZE, 0); ctx.rotate(Math.PI / 4); ctx.fillStyle = accent; ctx.globalAlpha = 0.9; ctx.fillRect(-60, 70, 560, 22); ctx.globalAlpha = 0.35; ctx.fillRect(-60, 110, 560, 10); ctx.restore();
  // header: logo + tag
  const logo = await loadImg(LOGO_SMALL_URL);
  ctx.fillStyle = WHITE; rr(ctx, 56, 52, 104, 104, 22); ctx.fill(); if (logo) ctx.drawImage(logo, 62, 58, 92, 92);
  ctx.font = `800 30px ${FONT}`; const tag = TAG[style]; const tw = ctx.measureText(tag).width + 56; ctx.fillStyle = accent; rr(ctx, 184, 82, tw, 52, 26); ctx.fill(); ctx.fillStyle = NAVY; ctx.textBaseline = 'middle'; ctx.fillText(tag, 212, 109);
  ctx.textBaseline = 'alphabetic';
  let y = 210;
  if (style === 'job' && imgs.length) {
    const h = 400; const two = imgs.length > 1; const w = two ? 462 : 968;
    cover(ctx, imgs[0], 56, y, w, h, 24); if (two) cover(ctx, imgs[1], 562, y, w, h, 24);
    const label = (t: string, x: number) => { ctx.font = `800 26px ${FONT}`; const lw = ctx.measureText(t).width + 36; ctx.fillStyle = 'rgba(11,37,69,.88)'; rr(ctx, x + 18, y + 18, lw, 44, 22); ctx.fill(); ctx.fillStyle = WHITE; ctx.textBaseline = 'middle'; ctx.fillText(t, x + 36, y + 41); ctx.textBaseline = 'alphabetic'; };
    if (two) { label('BEFORE', 56); label('AFTER', 562); }
    y += h + 56;
  } else y += 40;
  // headline
  ctx.fillStyle = WHITE; const hl = fit(ctx, spec.headline || 'Keep your glass sparkling', '800', style === 'job' ? 72 : 96, 52, 968, style === 'job' ? 2 : 4);
  ctx.font = `800 ${hl.size}px ${FONT}`; for (const l of hl.lines) { y += hl.size * 1.05; ctx.fillText(l, 56, y); } y += 30;
  ctx.fillStyle = accent; rr(ctx, 56, y, 120, 8, 4); ctx.fill(); y += 24;
  if (spec.sub) { ctx.fillStyle = 'rgba(255,255,255,.88)'; const sb = fit(ctx, spec.sub, '500', 44, 30, 968, style === 'job' ? 2 : 3); ctx.font = `500 ${sb.size}px ${FONT}`; for (const l of sb.lines) { y += sb.size * 1.3; ctx.fillText(l, 56, y); } y += 16; }
  if (style !== 'job') for (const p of (spec.points ?? []).filter(Boolean).slice(0, 3)) {
    y += 44; ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(80, y + 8, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = NAVY; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(70, y + 9); ctx.lineTo(77, y + 17); ctx.lineTo(91, y); ctx.stroke();
    ctx.fillStyle = WHITE; const pt = fit(ctx, p, '600', 40, 30, 840, 2); ctx.font = `600 ${pt.size}px ${FONT}`; pt.lines.forEach((l, i) => ctx.fillText(l, 124, y + 18 + i * pt.size * 1.15)); y += (pt.lines.length - 1) * pt.size * 1.15 + 36;
  }
  // footer
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0, SIZE - 132, SIZE, 132);
  ctx.fillStyle = WHITE; ctx.font = `800 34px ${FONT}`; ctx.fillText(o.company.name, 56, SIZE - 76);
  ctx.fillStyle = accent; ctx.font = `600 28px ${FONT}`; ctx.fillText([o.company.phone, 'Message us for a free quote'].filter(Boolean).join('  •  '), 56, SIZE - 32);
}

export const canvasBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the graphic'))), 'image/png'));
