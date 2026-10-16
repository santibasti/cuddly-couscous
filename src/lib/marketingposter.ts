// Poster layout for Facebook posts (1080 × 1350, the 4:5 portrait size that fills the feed): bold headline with colour, photo panel, offer ribbon, area chips,
// urgency banner, icon steps, info cards and a contact footer. Every block is optional — only what the post needs is drawn.
import { LOGO_SMALL_URL } from './logo';

export type IconName = 'window' | 'house' | 'building' | 'solar' | 'shield' | 'leaf' | 'calendar' | 'clock' | 'sparkle' | 'check' | 'phone' | 'pin' | 'drop';
export const ICONS: IconName[] = ['window', 'house', 'building', 'solar', 'shield', 'leaf', 'calendar', 'clock', 'sparkle', 'check', 'phone', 'pin', 'drop'];
export const ICON_LABEL: Record<IconName, string> = { window: 'Window', house: 'House', building: 'Building', solar: 'Solar panel', shield: 'Safety', leaf: 'Eco-safe', calendar: 'Calendar', clock: 'Time', sparkle: 'Sparkle', check: 'Check', phone: 'Phone', pin: 'Location', drop: 'Water' };

export interface PosterSpec {
  kicker: string;                       // first, coloured line of the headline (e.g. a place or a hook)
  badge: string; badge_sub: string;     // the offer ribbon: big word(s) plus a green strip under it
  areas: string[];                      // place chips
  urgency: string; urgency_sub: string; // dark banner (only when the owner or the company knowledge says so)
  features: { icon: IconName; label: string }[];   // up to 3 icon steps / tips
  cards: { label: string; value: string }[];        // up to 2 info cards (dates, hours …)
  note: string;                         // small line with a tick
}
export const EMPTY_POSTER: PosterSpec = { kicker: '', badge: '', badge_sub: '', areas: [], urgency: '', urgency_sub: '', features: [], cards: [], note: '' };

const TEAL = '#17a9b8', TEAL2 = '#5fd0d8', GREEN = '#7ac143', NAVY = '#0b2545', INK = '#14202e', GOLD = '#f5b83d', WHITE = '#fff';
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
export const POSTER_W = 1080, POSTER_H = 1350;

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };

function wrap(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) { const t = line ? `${line} ${w}` : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}
function fit(c: CanvasRenderingContext2D, text: string, weight: string, max: number, min: number, maxW: number, maxLines: number) {
  for (let s = max; s >= min; s -= 2) { c.font = `${weight} ${s}px ${FONT}`; const l = wrap(c, text, maxW); if (l.length <= maxLines) return { size: s, lines: l }; }
  c.font = `${weight} ${min}px ${FONT}`; return { size: min, lines: wrap(c, text, maxW).slice(0, maxLines) };
}
const upper = (s: string) => s.toUpperCase();

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
    case 'drop': path((p) => { p.moveTo(0, -44); p.quadraticCurveTo(-38, 0, -30, 18); p.quadraticCurveTo(-22, 42, 0, 42); p.quadraticCurveTo(22, 42, 30, 18); p.quadraticCurveTo(38, 0, 0, -44); }); break;
  }
  c.restore();
}

function swoosh(c: CanvasRenderingContext2D) {
  // top-right teal / green sweep and bottom sweeps, like a printed flyer
  c.fillStyle = TEAL; c.beginPath(); c.moveTo(POSTER_W, 0); c.lineTo(POSTER_W - 480, 0); c.quadraticCurveTo(POSTER_W - 200, 34, POSTER_W, 150); c.closePath(); c.fill();
  c.fillStyle = GREEN; c.beginPath(); c.moveTo(POSTER_W - 640, 0); c.lineTo(POSTER_W - 360, 0); c.quadraticCurveTo(POSTER_W - 480, 22, POSTER_W - 640, 14); c.closePath(); c.fill();
  c.fillStyle = TEAL2; c.globalAlpha = 0.45; c.beginPath(); c.moveTo(0, POSTER_H); c.lineTo(0, POSTER_H - 170); c.quadraticCurveTo(300, POSTER_H - 120, 620, POSTER_H); c.closePath(); c.fill(); c.globalAlpha = 1;
}

export async function renderPoster(c: HTMLCanvasElement, o: { headline: string; sub: string; poster: PosterSpec; company: { name: string; phone: string; email: string; tagline?: string; website?: string }; photos: string[] }) {
  c.width = POSTER_W; c.height = POSTER_H; const g = c.getContext('2d')!; const p = { ...EMPTY_POSTER, ...o.poster };
  const bg = g.createLinearGradient(0, 0, POSTER_W, POSTER_H); bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#eaf6f8'); g.fillStyle = bg; g.fillRect(0, 0, POSTER_W, POSTER_H);
  swoosh(g);
  const imgs = (await Promise.all(o.photos.slice(0, 2).map(loadImg))).filter(Boolean) as HTMLImageElement[]; const logo = await loadImg(LOGO_SMALL_URL);
  const L = 52, COLW = 516; // left column
  if (logo) g.drawImage(logo, L, 36, 84, 84);
  g.fillStyle = NAVY; g.font = `800 34px ${FONT}`; g.textBaseline = 'alphabetic'; g.fillText('TopMop', L + 100, 72); g.fillStyle = TEAL; g.font = `600 20px ${FONT}`; g.fillText(o.company.tagline || 'Window Cleaning Solutions', L + 100, 104);

  // photo panel (right)
  const PX = 620, PY = 150, PW = 410, PH = 500;
  g.fillStyle = TEAL2; g.globalAlpha = 0.35; g.beginPath(); g.arc(PX + PW - 30, PY + PH - 40, 250, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  g.save(); g.shadowColor = 'rgba(11,37,69,.28)'; g.shadowBlur = 28; g.shadowOffsetY = 10; g.fillStyle = WHITE; rr(g, PX - 8, PY - 8, PW + 16, PH + 16, 30); g.fill(); g.restore();
  if (imgs.length) {
    const cover = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => { g.save(); rr(g, x, y, w, h, 24); g.clip(); const s = Math.max(w / img.naturalWidth, h / img.naturalHeight); g.drawImage(img, x + (w - img.naturalWidth * s) / 2, y + (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s); g.restore(); };
    if (imgs.length > 1) {
      const h = (PH - 12) / 2; cover(imgs[0], PX, PY, PW, h); cover(imgs[1], PX, PY + h + 12, PW, h);
      const tag = (t: string, y: number) => { g.font = `800 22px ${FONT}`; const w = g.measureText(t).width + 30; g.fillStyle = 'rgba(11,37,69,.9)'; rr(g, PX + 14, y + 14, w, 38, 19); g.fill(); g.fillStyle = WHITE; g.textBaseline = 'middle'; g.fillText(t, PX + 29, y + 33); g.textBaseline = 'alphabetic'; };
      tag('BEFORE', PY); tag('AFTER', PY + h + 12);
    } else cover(imgs[0], PX, PY, PW, PH);
  } else {
    const pg = g.createLinearGradient(PX, PY, PX + PW, PY + PH); pg.addColorStop(0, TEAL); pg.addColorStop(1, '#0e6f7d'); g.fillStyle = pg; rr(g, PX, PY, PW, PH, 24); g.fill();
    g.save(); rr(g, PX, PY, PW, PH, 24); g.clip(); g.fillStyle = 'rgba(255,255,255,.1)'; for (const [x, y, r] of [[PX + 80, PY + 90, 90], [PX + 330, PY + 200, 140], [PX + 120, PY + 400, 110]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 14; g.strokeRect(PX + 90, PY + 100, PW - 180, 280); g.beginPath(); g.moveTo(PX + PW / 2, PY + 100); g.lineTo(PX + PW / 2, PY + 380); g.moveTo(PX + 90, PY + 240); g.lineTo(PX + PW - 90, PY + 240); g.stroke(); g.restore();
    drawIcon(g, 'sparkle', PX + PW - 110, PY + 140, 90, WHITE); drawIcon(g, 'sparkle', PX + 120, PY + 430, 54, GOLD);
  }

  // headline (left)
  let y = 168;
  if (p.kicker) { const k = fit(g, upper(p.kicker), '900', 100, 50, COLW, 1); g.font = `900 ${k.size}px ${FONT}`; g.fillStyle = TEAL; y += k.size * 0.86; g.fillText(k.lines[0] ?? '', L, y); y += 8; }
  const hl = fit(g, upper(o.headline || 'Keep your glass sparkling'), '900', 70, 40, COLW, p.kicker ? 3 : 4);
  g.font = `900 ${hl.size}px ${FONT}`; hl.lines.forEach((l, i) => { g.fillStyle = i === hl.lines.length - 1 && hl.lines.length > 1 ? GREEN : INK; y += hl.size * 1.04; g.fillText(l, L, y); });
  y += 16; g.strokeStyle = GREEN; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(L, y); g.quadraticCurveTo(L + 150, y - 12, L + 300, y); g.stroke(); y += 36;
  if (o.sub) { g.fillStyle = INK; const sb = fit(g, o.sub, '500', 30, 22, COLW - 10, 4); g.font = `500 ${sb.size}px ${FONT}`; for (const l of sb.lines) { g.fillText(l, L, y); y += sb.size * 1.32; } y += 4; }
  const leftEnd = Math.max(y, PY + PH + 24);

  // left stack under the headline: offer ribbon, area chips, urgency banner. The icon row sits below, so when the stack would run into it the least important block is left out.
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
    g.save(); g.shadowColor = 'rgba(11,37,69,.22)'; g.shadowBlur = 18; g.shadowOffsetY = 6; g.fillStyle = TEAL; rr(g, L, y, bw, bh - (p.badge_sub ? 30 : 0), 22); g.fill(); g.restore();
    const b = fit(g, upper(p.badge), '900', 60, 32, bw - 70, 1); g.font = `900 ${b.size}px ${FONT}`; g.fillStyle = WHITE; g.textAlign = 'center'; g.fillText(b.lines[0] ?? '', L + bw / 2, y + (p.badge_sub ? 68 : 66)); g.textAlign = 'left';
    if (p.badge_sub) { g.fillStyle = GREEN; rr(g, L - 14, y + bh - 64, bw + 28, 60, 10); g.fill(); const s2 = fit(g, upper(p.badge_sub), '800', 34, 20, bw - 30, 1); g.font = `800 ${s2.size}px ${FONT}`; g.fillStyle = WHITE; g.textAlign = 'center'; g.fillText(s2.lines[0] ?? '', L + bw / 2, y + bh - 22); g.textAlign = 'left'; }
    y += bh + 22;
  }
  if (showA) {
    let x = L; g.font = `700 26px ${FONT}`;
    for (const a of areas) { const w = g.measureText(a).width + 58; if (x + w > L + 536) break; drawIcon(g, 'pin', x + 14, y + 18, 28, TEAL); g.fillStyle = INK; g.fillText(a, x + 34, y + 27); x += w; if (a !== areas[areas.length - 1]) { g.fillStyle = '#c9d6dd'; g.fillRect(x - 12, y + 4, 2, 30); } }
    y += ch;
  }
  if (showU) {
    g.fillStyle = INK; rr(g, L, y, 536, uh, 16); g.fill();
    drawIcon(g, 'sparkle', L + 38, y + uh / 2, 38, GOLD);
    const u = fit(g, upper(p.urgency), '900', 32, 20, 450, 1); g.font = `900 ${u.size}px ${FONT}`; g.fillStyle = WHITE; g.fillText(u.lines[0] ?? '', L + 74, y + (p.urgency_sub ? 40 : 43));
    if (p.urgency_sub) { const s2 = fit(g, upper(p.urgency_sub), '800', 26, 16, 450, 1); g.font = `800 ${s2.size}px ${FONT}`; g.fillStyle = GREEN; g.fillText(s2.lines[0] ?? '', L + 74, y + 74); }
    y += uh + 18;
  }

  // right column under the photo: info cards + note
  let ry = PY + PH + 40;
  for (const card of p.cards.filter((x) => x.label || x.value).slice(0, 2)) {
    if (ry + 100 > limit) break;
    g.save(); g.shadowColor = 'rgba(11,37,69,.18)'; g.shadowBlur = 16; g.shadowOffsetY = 5; g.fillStyle = WHITE; rr(g, PX - 8, ry, PW + 16, 100, 20); g.fill(); g.restore();
    const first = card === p.cards[0]; g.fillStyle = first ? TEAL : GREEN; g.beginPath(); g.arc(PX + 52, ry + 50, 34, 0, Math.PI * 2); g.fill(); drawIcon(g, 'calendar', PX + 52, ry + 50, 40, WHITE);
    g.fillStyle = INK; g.font = `800 20px ${FONT}`; g.fillText(upper(card.label), PX + 104, ry + 38);
    const v = fit(g, upper(card.value), '900', 38, 20, PW - 120, 1); g.font = `900 ${v.size}px ${FONT}`; g.fillStyle = first ? TEAL : GREEN; g.fillText(v.lines[0] ?? '', PX + 104, ry + 80);
    ry += 116;
  }
  if (p.note && ry + 70 < limit) {
    g.fillStyle = TEAL; g.beginPath(); g.arc(PX + 14, ry + 24, 14, 0, Math.PI * 2); g.fill(); drawIcon(g, 'check', PX + 14, ry + 24, 20, WHITE);
    g.fillStyle = INK; const n = fit(g, p.note, '500', 24, 18, PW - 50, 4); g.font = `500 ${n.size}px ${FONT}`; n.lines.forEach((l, i) => g.fillText(l, PX + 42, ry + 30 + i * n.size * 1.3)); ry += 40 + n.lines.length * n.size * 1.3;
  }

  // icon row
  const fy = Math.max(y, ry) + 8;
  if (feats.length) {
    const colw = (POSTER_W - 2 * L) / feats.length;
    feats.forEach((f, i) => {
      const cx = L + colw * i + colw / 2; g.fillStyle = i % 2 ? GREEN : TEAL; g.beginPath(); g.arc(cx, fy + 48, 48, 0, Math.PI * 2); g.fill(); drawIcon(g, f.icon in ICON_LABEL ? f.icon : 'check', cx, fy + 48, 56, WHITE);
      g.fillStyle = i % 2 ? GREEN : TEAL; const t = fit(g, upper(f.label), '900', 24, 16, colw - 40, 2); g.font = `900 ${t.size}px ${FONT}`; g.textAlign = 'center'; t.lines.forEach((l, k) => g.fillText(l, cx, fy + 128 + k * t.size * 1.2)); g.textAlign = 'left';
      if (i) { g.fillStyle = '#c9d6dd'; g.fillRect(L + colw * i, fy + 10, 2, 130); }
    });
  }

  // contact footer
  const FY = POSTER_H - 150;
  g.fillStyle = NAVY; g.fillRect(0, FY + 20, POSTER_W, POSTER_H - FY); g.fillStyle = GREEN; g.fillRect(0, FY + 14, POSTER_W, 8);
  g.fillStyle = TEAL; g.beginPath(); g.arc(L + 36, FY + 84, 34, 0, Math.PI * 2); g.fill(); drawIcon(g, 'phone', L + 36, FY + 84, 38, WHITE);
  g.fillStyle = TEAL2; g.font = `800 22px ${FONT}`; g.fillText('CONTACT US', L + 90, FY + 62);
  g.fillStyle = WHITE; g.font = `700 30px ${FONT}`; g.fillText(o.company.phone || '', L + 90, FY + 98);
  g.font = `500 24px ${FONT}`; g.fillStyle = '#d6e6ee'; g.fillText([o.company.email, o.company.website?.replace(/^https?:\/\//, '')].filter(Boolean).join('   •   '), L + 90, FY + 134);
  g.textAlign = 'right'; g.fillStyle = WHITE; g.font = `800 28px ${FONT}`; g.fillText('Message us for a FREE quote', POSTER_W - L, FY + 98); g.textAlign = 'left';
}
