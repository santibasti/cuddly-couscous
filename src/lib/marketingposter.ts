// Poster layout for Facebook posts (1080 × 1350, the 4:5 portrait size that fills the feed): bold headline with colour, photo panel, offer ribbon, area chips,
// urgency banner, icon steps, info cards and a contact footer. Every block is optional — only what the post needs is drawn.
import { LOGO_SMALL_URL } from './logo';

export type IconName = 'window' | 'house' | 'building' | 'solar' | 'shield' | 'leaf' | 'calendar' | 'clock' | 'sparkle' | 'check' | 'phone' | 'pin' | 'drop' | 'mail' | 'globe' | 'chat' | 'fb' | 'gear';
export const ICONS: IconName[] = ['window', 'house', 'building', 'solar', 'shield', 'leaf', 'calendar', 'clock', 'sparkle', 'check', 'phone', 'pin', 'drop'];
export const ICON_LABEL: Record<IconName, string> = { window: 'Window', house: 'House', building: 'Building', solar: 'Solar panel', shield: 'Safety', leaf: 'Eco-safe', calendar: 'Calendar', clock: 'Time', sparkle: 'Sparkle', check: 'Check', phone: 'Phone', pin: 'Location', drop: 'Water', mail: 'Email', globe: 'Website', chat: 'Chat', fb: 'Facebook', gear: 'Gear' };

export interface PosterSpec {
  kicker: string;                       // first, coloured line of the headline (e.g. a place or a hook)
  badge: string; badge_sub: string;     // the offer ribbon: big word(s) plus a green strip under it
  areas: string[];                      // place chips
  urgency: string; urgency_sub: string; // dark banner (only when the owner or the company knowledge says so)
  features: { icon: IconName; label: string }[];   // up to 3 icon steps / tips
  cards: { label: string; value: string }[];        // up to 2 info cards (dates, hours …)
  note: string;                         // small line with a tick
  subtitle: string;                     // service template: line under the big service name (e.g. EXTERIOR & INTERIOR)
  location: string; location_sub: string; // service template: the place tag (only when the request says where)
  words: string[];                      // service template: the four words in the navy band (default Clean, Restore, Protect, Maintain)
}
export const EMPTY_POSTER: PosterSpec = { kicker: '', badge: '', badge_sub: '', areas: [], urgency: '', urgency_sub: '', features: [], cards: [], note: '', subtitle: '', location: '', location_sub: '', words: [] };

// the TopMop logo palette: deep navy blue, cyan-blue, bright green and the dark teal of the centre
const NAVY = '#06284a', BLUE = '#0b5f9e', CYAN = '#12a7d8', GREEN = '#52c75a', GREEN_L = '#8be063', TEAL_D = '#0c4f46', WHITE = '#ffffff', SOFT = '#d3e8f3';
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
export const POSTER_W = 1080, POSTER_H = 1350;

export const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
export const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };

export function wrap(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) { const t = line ? `${line} ${w}` : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}
export function fit(c: CanvasRenderingContext2D, text: string, weight: string, max: number, min: number, maxW: number, maxLines: number) {
  for (let s = max; s >= min; s -= 2) { c.font = `${weight} ${s}px ${FONT}`; const l = wrap(c, text, maxW); if (l.length <= maxLines) return { size: s, lines: l }; }
  c.font = `${weight} ${min}px ${FONT}`; return { size: min, lines: wrap(c, text, maxW).slice(0, maxLines) };
}
export const upper = (s: string) => s.toUpperCase();

/** Simple line icons drawn around (cx, cy) inside a box of `s` pixels. */
export function drawIcon(c: CanvasRenderingContext2D, name: IconName, cx: number, cy: number, s: number, color: string) {
  c.save(); c.translate(cx, cy); c.scale(s / 100, s / 100); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round';
  const path = (f: (p: Path2D) => void, fill = false) => { const p = new Path2D(); f(p); if (fill) c.fill(p); else c.stroke(p); };
  switch (name) {
    case 'window': path((p) => { p.roundRect(-34, -34, 68, 68, 8); p.moveTo(0, -34); p.lineTo(0, 34); p.moveTo(-34, 0); p.lineTo(34, 0); }); path((p) => { p.moveTo(22, -52); p.lineTo(26, -42); p.lineTo(36, -38); p.lineTo(26, -34); p.lineTo(22, -24); p.lineTo(18, -34); p.lineTo(8, -38); p.lineTo(18, -42); p.closePath(); }, true); break;
    case 'house': path((p) => { p.moveTo(-42, -2); p.lineTo(0, -40); p.lineTo(42, -2); p.moveTo(-30, -8); p.lineTo(-30, 38); p.lineTo(30, 38); p.lineTo(30, -8); p.moveTo(-9, 38); p.lineTo(-9, 12); p.lineTo(9, 12); p.lineTo(9, 38); }); break;
    case 'building': path((p) => { p.rect(-28, -42, 56, 84); for (const y of [-26, -6, 14]) for (const x of [-14, 6]) p.rect(x, y, 8, 10); p.moveTo(-8, 42); p.lineTo(-8, 28); p.lineTo(8, 28); p.lineTo(8, 42); }); break;
    case 'solar': path((p) => { p.moveTo(-40, 10); p.lineTo(-24, -26); p.lineTo(40, -26); p.lineTo(24, 10); p.closePath(); p.moveTo(-32, -8); p.lineTo(32, -8); p.moveTo(-8, -26); p.lineTo(-24, 10); p.moveTo(16, -26); p.lineTo(0, 10); p.moveTo(0, 10); p.lineTo(0, 36); p.moveTo(-18, 36); p.lineTo(18, 36); }); path((p) => p.arc(-30, -42, 8, 0, Math.PI * 2), true); break;
    case 'shield': path((p) => { p.moveTo(0, -42); p.lineTo(34, -28); p.lineTo(34, 4); p.quadraticCurveTo(34, 30, 0, 44); p.quadraticCurveTo(-34, 30, -34, 4); p.lineTo(-34, -28); p.closePath(); p.moveTo(-14, 2); p.lineTo(-3, 14); p.lineTo(16, -10); }); break;
    case 'leaf': path((p) => { p.moveTo(-36, 34); p.quadraticCurveTo(-44, -30, 30, -40); p.quadraticCurveTo(44, 20, -20, 38); p.closePath(); p.moveTo(-36, 34); p.lineTo(8, -10); }); break;
    case 'calendar': path((p) => { p.roundRect(-38, -32, 76, 70, 10); p.moveTo(-38, -10); p.lineTo(38, -10); p.moveTo(-18, -44); p.lineTo(-18, -24); p.moveTo(18, -44); p.lineTo(18, -24); }); for (const [x, y] of [[-20, 6], [0, 6], [20, 6], [-20, 24], [0, 24]]) path((p) => p.arc(x, y, 4, 0, Math.PI * 2), true); break;
    case 'clock': path((p) => { p.arc(0, 0, 38, 0, Math.PI * 2); p.moveTo(0, -20); p.lineTo(0, 0); p.lineTo(16, 10); }); break;
    case 'sparkle': path((p) => { p.moveTo(0, -42); p.quadraticCurveTo(4, -6, 42, 0); p.quadraticCurveTo(4, 6, 0, 42); p.quadraticCurveTo(-4, 6, -42, 0); p.quadraticCurveTo(-4, -6, 0, -42); }, true); break;
    case 'check': path((p) => { p.arc(0, 0, 40, 0, Math.PI * 2); p.moveTo(-18, 2); p.lineTo(-5, 16); p.lineTo(20, -14); }); break;
    case 'phone': path((p) => { p.roundRect(-22, -42, 44, 84, 10); p.moveTo(-6, 32); p.lineTo(6, 32); }); break;
    case 'pin': path((p) => { p.moveTo(0, 42); p.quadraticCurveTo(-36, 0, -36, -14); p.arc(0, -14, 36, Math.PI, 0); p.quadraticCurveTo(36, 0, 0, 42); p.closePath(); p.moveTo(10, -14); p.arc(0, -14, 10, 0, Math.PI * 2); }); break;
    case 'mail': path((p) => { p.roundRect(-42, -28, 84, 56, 8); p.moveTo(-40, -24); p.lineTo(0, 6); p.lineTo(40, -24); }); break;
    case 'globe': path((p) => { p.arc(0, 0, 40, 0, Math.PI * 2); p.moveTo(-40, 0); p.lineTo(40, 0); p.moveTo(0, -40); p.quadraticCurveTo(-30, 0, 0, 40); p.moveTo(0, -40); p.quadraticCurveTo(30, 0, 0, 40); }); break;
    case 'chat': path((p) => { p.moveTo(-40, -6); p.quadraticCurveTo(-40, -36, 0, -36); p.quadraticCurveTo(40, -36, 40, -6); p.quadraticCurveTo(40, 24, 0, 24); p.lineTo(-18, 24); p.lineTo(-34, 38); p.lineTo(-30, 18); p.quadraticCurveTo(-40, 10, -40, -6); }); break;
    case 'fb': path((p) => { p.arc(0, 0, 42, 0, Math.PI * 2); }, true); c.fillStyle = '#fff'; c.font = 'bold 84px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText('f', 8, 38); break;
    case 'gear': path((p) => { p.arc(0, 0, 14, 0, Math.PI * 2); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; p.moveTo(Math.cos(a) * 28, Math.sin(a) * 28); p.lineTo(Math.cos(a) * 42, Math.sin(a) * 42); } p.moveTo(28, 0); p.arc(0, 0, 28, 0, Math.PI * 2); }); break;
    case 'drop': path((p) => { p.moveTo(0, -44); p.quadraticCurveTo(-38, 0, -30, 18); p.quadraticCurveTo(-22, 42, 0, 42); p.quadraticCurveTo(22, 42, 30, 18); p.quadraticCurveTo(38, 0, 0, -44); }); break;
  }
  c.restore();
}

const grad = (g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => { const k = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => k.addColorStop(o, col)); return k; };
const glass = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { g.save(); g.shadowColor = 'rgba(0,10,30,.45)'; g.shadowBlur = 24; g.shadowOffsetY = 8; g.fillStyle = 'rgba(255,255,255,.10)'; rr(g, x, y, w, h, r); g.fill(); g.restore(); g.strokeStyle = 'rgba(255,255,255,.30)'; g.lineWidth = 2; rr(g, x, y, w, h, r); g.stroke(); g.fillStyle = grad(g, x, y, x, y + h, [[0, 'rgba(255,255,255,.14)'], [0.5, 'rgba(255,255,255,0)']]); rr(g, x, y, w, h, r); g.fill(); };
const sparkle = (g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) => { g.save(); g.globalAlpha = a; g.fillStyle = WHITE; g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r, y); g.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r); g.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r, y); g.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r); g.fill(); g.restore(); };

/** Dark, glossy backdrop in the logo colours with the logo's segmented ring as a faint motif and soft glass streaks. */
function backdrop(g: CanvasRenderingContext2D) {
  g.fillStyle = grad(g, 0, 0, POSTER_W, POSTER_H, [[0, '#04203d'], [0.45, '#0a4a7c'], [1, '#0b5a55']]); g.fillRect(0, 0, POSTER_W, POSTER_H);
  const glow = (x: number, y: number, r: number, col: string) => { const k = g.createRadialGradient(x, y, 0, x, y, r); k.addColorStop(0, col); k.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = k; g.fillRect(0, 0, POSTER_W, POSTER_H); };
  glow(POSTER_W - 120, 260, 620, 'rgba(18,167,216,.38)'); glow(120, POSTER_H - 380, 560, 'rgba(82,199,90,.26)'); glow(POSTER_W / 2, 80, 420, 'rgba(255,255,255,.10)');
  // segmented ring (the logo's ring) – big and faint behind the photo, small at the top-left
  const ring = (cx: number, cy: number, r: number, w: number, a: number) => { const segs: [number, number, string][] = [[-1.9, -0.5, GREEN], [-0.5, 1.0, CYAN], [1.0, 1.9, GREEN], [1.9, 4.38, BLUE]]; g.save(); g.globalAlpha = a; g.lineWidth = w; g.lineCap = 'butt'; for (const [a0, a1, col] of segs) { g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke(); } g.restore(); };
  ring(POSTER_W - 150, 470, 330, 78, 0.20); ring(70, 1010, 190, 46, 0.14);
  // glass streaks
  g.save(); g.fillStyle = 'rgba(255,255,255,.05)'; for (const [x, w] of [[120, 90], [310, 40], [760, 120], [940, 36]]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w, 0); g.lineTo(x + w - 420, POSTER_H); g.lineTo(x - 420, POSTER_H); g.closePath(); g.fill(); } g.restore();
  for (const [x, y, r, a] of [[540, 70, 11, 0.5], [985, 100, 20, 0.8], [1020, 1000, 15, 0.45], [560, 1080, 12, 0.4]]) sparkle(g, x, y, r, a);
}

export async function renderPoster(c: HTMLCanvasElement, o: { headline: string; sub: string; poster: PosterSpec; company: { name: string; phone: string; email: string; tagline?: string; website?: string }; photos: string[] }) {
  c.width = POSTER_W; c.height = POSTER_H; const g = c.getContext('2d')!; const p = { ...EMPTY_POSTER, ...o.poster };
  backdrop(g);
  const imgs = (await Promise.all(o.photos.slice(0, 2).map(loadImg))).filter(Boolean) as HTMLImageElement[]; const logo = await loadImg(LOGO_SMALL_URL);
  const L = 52, COLW = 516;
  // brand
  if (logo) { g.save(); g.shadowColor = 'rgba(139,224,99,.65)'; g.shadowBlur = 26; g.drawImage(logo, L, 30, 96, 96); g.restore(); }
  g.fillStyle = WHITE; g.font = `800 38px ${FONT}`; g.textBaseline = 'alphabetic'; g.fillText('TopMop', L + 114, 72);
  g.fillStyle = GREEN_L; g.font = `700 21px ${FONT}`; g.fillText(upper(o.company.tagline || 'Window Cleaning Solutions'), L + 114, 104);

  // photo panel (right): gradient ring frame + glow
  const PX = 620, PY = 150, PW = 410, PH = 500;
  g.save(); g.shadowColor = 'rgba(18,167,216,.7)'; g.shadowBlur = 50; g.fillStyle = grad(g, PX, PY, PX + PW, PY + PH, [[0, GREEN_L], [0.5, CYAN], [1, GREEN]]); rr(g, PX - 10, PY - 10, PW + 20, PH + 20, 34); g.fill(); g.restore();
  g.fillStyle = NAVY; rr(g, PX - 3, PY - 3, PW + 6, PH + 6, 28); g.fill();
  if (imgs.length) {
    const cover = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => { g.save(); rr(g, x, y, w, h, 24); g.clip(); const sc = Math.max(w / img.naturalWidth, h / img.naturalHeight); g.drawImage(img, x + (w - img.naturalWidth * sc) / 2, y + (h - img.naturalHeight * sc) / 2, img.naturalWidth * sc, img.naturalHeight * sc); g.fillStyle = grad(g, x, y, x, y + h, [[0, 'rgba(255,255,255,.14)'], [0.35, 'rgba(255,255,255,0)'], [1, 'rgba(0,20,40,.28)']]); g.fillRect(x, y, w, h); g.restore(); };
    if (imgs.length > 1) {
      const h = (PH - 12) / 2; cover(imgs[0], PX, PY, PW, h); cover(imgs[1], PX, PY + h + 12, PW, h);
      const tag = (t: string, y: number, col: string) => { g.font = `800 22px ${FONT}`; const w = g.measureText(t).width + 32; g.fillStyle = col; rr(g, PX + 14, y + 14, w, 38, 19); g.fill(); g.fillStyle = WHITE; g.textBaseline = 'middle'; g.fillText(t, PX + 30, y + 33); g.textBaseline = 'alphabetic'; };
      tag('BEFORE', PY, 'rgba(6,40,74,.92)'); tag('AFTER', PY + h + 12, GREEN);
    } else cover(imgs[0], PX, PY, PW, PH);
  } else {
    g.save(); rr(g, PX, PY, PW, PH, 24); g.clip();
    g.fillStyle = grad(g, PX, PY, PX + PW, PY + PH, [[0, '#18b8e6'], [0.55, BLUE], [1, '#083d70']]); g.fillRect(PX, PY, PW, PH);
    g.fillStyle = 'rgba(255,255,255,.10)'; for (const [x, y, r] of [[PX + 70, PY + 90, 90], [PX + 340, PY + 210, 140], [PX + 110, PY + 400, 110]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    // a clean window pane with a glass reflection
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(PX + 90, PY + 100, PW - 180, 280); g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 14; g.strokeRect(PX + 90, PY + 100, PW - 180, 280);
    g.beginPath(); g.moveTo(PX + PW / 2, PY + 100); g.lineTo(PX + PW / 2, PY + 380); g.moveTo(PX + 90, PY + 240); g.lineTo(PX + PW - 90, PY + 240); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.moveTo(PX + 120, PY + 110); g.lineTo(PX + 200, PY + 110); g.lineTo(PX + 130, PY + 230); g.lineTo(PX + 100, PY + 230); g.closePath(); g.fill();
    g.restore(); sparkle(g, PX + PW - 100, PY + 120, 46, 1); sparkle(g, PX + 120, PY + 430, 30, 0.9); sparkle(g, PX + PW - 160, PY + 440, 20, 0.8);
  }

  // headline (left)
  let y = 168;
  if (p.kicker) { const k = fit(g, upper(p.kicker), '900', 100, 50, COLW, 1); g.font = `900 ${k.size}px ${FONT}`; g.fillStyle = grad(g, L, 0, L + g.measureText(k.lines[0] ?? '').width, 0, [[0, GREEN_L], [1, CYAN]]); y += k.size * 0.86; g.fillText(k.lines[0] ?? '', L, y); y += 8; }
  const hl = fit(g, upper(o.headline || 'Keep your glass sparkling'), '900', 70, 40, COLW, p.kicker ? 3 : 4);
  g.font = `900 ${hl.size}px ${FONT}`;
  hl.lines.forEach((l, i) => { const last = i === hl.lines.length - 1 && hl.lines.length > 1; g.fillStyle = last ? grad(g, L, 0, L + g.measureText(l).width, 0, [[0, GREEN_L], [1, CYAN]]) : WHITE; y += hl.size * 1.04; g.save(); g.shadowColor = 'rgba(0,15,40,.45)'; g.shadowBlur = 10; g.shadowOffsetY = 4; g.fillText(l, L, y); g.restore(); });
  y += 18; g.fillStyle = grad(g, L, 0, L + 220, 0, [[0, GREEN_L], [1, CYAN]]); rr(g, L, y, 220, 8, 4); g.fill(); g.fillStyle = WHITE; g.beginPath(); g.arc(L + 232, y + 4, 6, 0, Math.PI * 2); g.fill(); y += 40;
  if (o.sub) { g.fillStyle = SOFT; const sb = fit(g, o.sub, '500', 30, 22, COLW - 10, 4); g.font = `500 ${sb.size}px ${FONT}`; for (const l of sb.lines) { g.fillText(l, L, y); y += sb.size * 1.32; } y += 4; }
  const leftEnd = Math.max(y, PY + PH + 24);

  // left stack: offer ribbon, area chips, urgency banner (the least important block is left out when the stack would run into the icon row)
  const feats = p.features.filter((f) => f.label).slice(0, 3); const limit = feats.length ? 990 : 1170;
  const areas = p.areas.filter(Boolean).slice(0, 5);
  const bh = p.badge ? (p.badge_sub ? 146 : 100) : 0, uh = p.urgency ? (p.urgency_sub ? 92 : 66) : 0, ch = areas.length ? 56 : 0;
  let showU = !!p.urgency, showA = areas.length > 0;
  const stack = () => leftEnd + (bh ? bh + 22 : 0) + (showA ? ch : 0) + (showU ? uh + 18 : 0);
  if (stack() > limit) showA = false;
  if (stack() > limit) showU = false;
  y = leftEnd;
  if (p.badge) {
    const bw = 536;
    g.save(); g.shadowColor = 'rgba(82,199,90,.55)'; g.shadowBlur = 26; g.shadowOffsetY = 6; g.fillStyle = grad(g, L, y, L, y + bh, [[0, GREEN_L], [1, GREEN]]); rr(g, L, y, bw, bh - (p.badge_sub ? 30 : 0), 22); g.fill(); g.restore();
    const b = fit(g, upper(p.badge), '900', 60, 32, bw - 70, 1); g.font = `900 ${b.size}px ${FONT}`; g.fillStyle = NAVY; g.textAlign = 'center'; g.fillText(b.lines[0] ?? '', L + bw / 2, y + (p.badge_sub ? 68 : 66)); g.textAlign = 'left';
    if (p.badge_sub) { g.save(); g.shadowColor = 'rgba(0,15,40,.4)'; g.shadowBlur = 12; g.fillStyle = grad(g, L, y + bh - 64, L + bw, y + bh, [[0, BLUE], [1, CYAN]]); rr(g, L - 14, y + bh - 64, bw + 28, 60, 12); g.fill(); g.restore(); const s2 = fit(g, upper(p.badge_sub), '800', 34, 20, bw - 30, 1); g.font = `800 ${s2.size}px ${FONT}`; g.fillStyle = WHITE; g.textAlign = 'center'; g.fillText(s2.lines[0] ?? '', L + bw / 2, y + bh - 22); g.textAlign = 'left'; }
    y += bh + 22;
  }
  if (showA) {
    let x = L; g.font = `700 25px ${FONT}`;
    for (const a of areas) { const w = g.measureText(a).width + 62; if (x + w > L + 536) break; glass(g, x, y, w - 8, 46, 23); drawIcon(g, 'pin', x + 24, y + 23, 26, GREEN_L); g.fillStyle = WHITE; g.fillText(a, x + 44, y + 32); x += w; }
    y += ch;
  }
  if (showU) {
    g.save(); g.shadowColor = 'rgba(0,10,30,.5)'; g.shadowBlur = 20; g.fillStyle = 'rgba(2,18,36,.82)'; rr(g, L, y, 536, uh, 16); g.fill(); g.restore();
    g.fillStyle = grad(g, L, y, L, y + uh, [[0, GREEN_L], [1, GREEN]]); rr(g, L, y, 10, uh, 5); g.fill();
    drawIcon(g, 'sparkle', L + 46, y + uh / 2, 38, GREEN_L);
    const u = fit(g, upper(p.urgency), '900', 32, 20, 430, 1); g.font = `900 ${u.size}px ${FONT}`; g.fillStyle = WHITE; g.fillText(u.lines[0] ?? '', L + 80, y + (p.urgency_sub ? 40 : 43));
    if (p.urgency_sub) { const s2 = fit(g, upper(p.urgency_sub), '800', 26, 16, 430, 1); g.font = `800 ${s2.size}px ${FONT}`; g.fillStyle = GREEN_L; g.fillText(s2.lines[0] ?? '', L + 80, y + 74); }
    y += uh + 18;
  }

  // right column under the photo: info cards + note
  let ry = PY + PH + 40;
  for (const card of p.cards.filter((x) => x.label || x.value).slice(0, 2)) {
    if (ry + 100 > limit) break;
    glass(g, PX - 8, ry, PW + 16, 100, 22);
    const first = card === p.cards[0]; g.fillStyle = first ? grad(g, PX + 18, ry + 16, PX + 86, ry + 84, [[0, CYAN], [1, BLUE]]) : grad(g, PX + 18, ry + 16, PX + 86, ry + 84, [[0, GREEN_L], [1, GREEN]]); g.beginPath(); g.arc(PX + 52, ry + 50, 34, 0, Math.PI * 2); g.fill(); drawIcon(g, 'calendar', PX + 52, ry + 50, 40, WHITE);
    g.fillStyle = SOFT; g.font = `800 20px ${FONT}`; g.fillText(upper(card.label), PX + 104, ry + 38);
    const v = fit(g, upper(card.value), '900', 38, 20, PW - 120, 1); g.font = `900 ${v.size}px ${FONT}`; g.fillStyle = grad(g, PX + 104, 0, PX + 104 + g.measureText(v.lines[0] ?? '').width, 0, [[0, GREEN_L], [1, CYAN]]); g.fillText(v.lines[0] ?? '', PX + 104, ry + 80);
    ry += 116;
  }
  if (p.note && ry + 70 < limit) {
    g.fillStyle = GREEN; g.beginPath(); g.arc(PX + 14, ry + 24, 14, 0, Math.PI * 2); g.fill(); drawIcon(g, 'check', PX + 14, ry + 24, 20, NAVY);
    g.fillStyle = SOFT; const n = fit(g, p.note, '500', 24, 18, PW - 50, 4); g.font = `500 ${n.size}px ${FONT}`; n.lines.forEach((l, i) => g.fillText(l, PX + 42, ry + 30 + i * n.size * 1.3)); ry += 40 + n.lines.length * n.size * 1.3;
  }

  // icon row: ring badges like the logo
  const base = Math.max(y, ry) + 8; const fy = base + Math.min(90, Math.max(0, ((POSTER_H - 150 + 14) - base - 175) / 2)); // spread out when the poster has few blocks
  if (feats.length) {
    const colw = (POSTER_W - 2 * L) / feats.length;
    feats.forEach((f, i) => {
      const cx = L + colw * i + colw / 2, cy = fy + 50;
      g.save(); g.shadowColor = i % 2 ? 'rgba(82,199,90,.6)' : 'rgba(18,167,216,.6)'; g.shadowBlur = 24; g.strokeStyle = i % 2 ? grad(g, cx - 50, cy - 50, cx + 50, cy + 50, [[0, GREEN_L], [1, GREEN]]) : grad(g, cx - 50, cy - 50, cx + 50, cy + 50, [[0, CYAN], [1, GREEN_L]]); g.lineWidth = 9; g.fillStyle = 'rgba(2,24,48,.7)'; g.beginPath(); g.arc(cx, cy, 46, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore();
      drawIcon(g, f.icon in ICON_LABEL ? f.icon : 'check', cx, cy, 52, WHITE);
      g.fillStyle = WHITE; const t = fit(g, upper(f.label), '900', 24, 16, colw - 40, 2); g.font = `900 ${t.size}px ${FONT}`; g.textAlign = 'center'; t.lines.forEach((l, k) => g.fillText(l, cx, fy + 130 + k * t.size * 1.2)); g.textAlign = 'left';
      if (i) { g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(L + colw * i, fy + 12, 2, 130); }
    });
  }

  // contact footer
  const FY = POSTER_H - 150;
  g.fillStyle = 'rgba(2,16,34,.88)'; g.fillRect(0, FY + 20, POSTER_W, POSTER_H - FY); g.fillStyle = grad(g, 0, 0, POSTER_W, 0, [[0, GREEN], [0.5, CYAN], [1, GREEN_L]]); g.fillRect(0, FY + 14, POSTER_W, 8);
  g.fillStyle = grad(g, L, FY + 50, L + 72, FY + 118, [[0, CYAN], [1, GREEN]]); g.beginPath(); g.arc(L + 36, FY + 84, 34, 0, Math.PI * 2); g.fill(); drawIcon(g, 'phone', L + 36, FY + 84, 38, WHITE);
  g.fillStyle = GREEN_L; g.font = `800 22px ${FONT}`; g.fillText('CONTACT US', L + 90, FY + 62);
  g.fillStyle = WHITE; g.font = `700 30px ${FONT}`; g.fillText(o.company.phone || '', L + 90, FY + 98);
  g.font = `500 24px ${FONT}`; g.fillStyle = SOFT; g.fillText([o.company.email, o.company.website?.replace(/^https?:\/\//, '')].filter(Boolean).join('   •   '), L + 90, FY + 134);
  g.textAlign = 'right'; g.fillStyle = grad(g, POSTER_W - L - 360, 0, POSTER_W - L, 0, [[0, GREEN_L], [1, CYAN]]); g.font = `800 28px ${FONT}`; g.fillText('Message us for a FREE quote', POSTER_W - L, FY + 98); g.textAlign = 'left';
}
