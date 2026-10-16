// "TopMop service poster": the light, airy flyer — a full-width photo faded into white behind the text, logo block, navy banner (Clean | Restore | Protect | Maintain),
// a green label, the service name in big navy letters, three icon steps, a location tag, a Before / After strip, a navy band and a contact footer.
// To make a poster for another service only the words change (service name, subtitle, paragraph, steps, place); the design stays the same.
import { LOGO_SMALL_URL } from './logo';
import { EMPTY_POSTER, POSTER_H, POSTER_W, drawIcon, fit, loadImg, rr, upper, wrap, type PosterSpec } from './marketingposter';

const NAVY = '#0b2f5e', NAVY_D = '#071f42', BLUE = '#0b5f9e', GREEN = '#1fa653', GREEN_L = '#52c75a', INK = '#1d2b3c';
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const SCRIPT = 'italic 600 46px "Segoe Script", "Brush Script MT", "Snell Roundhand", "Apple Chancery", cursive';
export const DEFAULT_WORDS = ['Clean', 'Restore', 'Protect', 'Maintain'];

const grad = (g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => { const k = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => k.addColorStop(o, col)); return k; };
const spaced = (g: CanvasRenderingContext2D, px: number) => { try { (g as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; } catch { /* older browsers: no letter spacing */ } };

function cover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight); g.drawImage(img, x + (w - img.naturalWidth * s) / 2, y + (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
}

/** A bright sky and a glass facade, used when the post has no photo. */
function skyAndGlass(g: CanvasRenderingContext2D, h: number) {
  g.fillStyle = grad(g, 0, 0, 0, h, [[0, '#a9d8f5'], [0.6, '#dff2fc'], [1, '#f7fcff']]); g.fillRect(0, 0, POSTER_W, h);
  g.fillStyle = 'rgba(255,255,255,.85)'; for (const [x, y, r] of [[160, 360, 90], [260, 340, 120], [380, 380, 80], [700, 120, 70], [790, 110, 100]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  // glass building on the right
  const bx = 640, by = -20, bw = POSTER_W - bx + 40, bh = h + 20;
  g.fillStyle = '#f3f6f9'; g.fillRect(bx - 22, by, 22, bh);
  const panes = grad(g, bx, by, bx + bw, by + bh, [[0, '#0d4f86'], [0.5, '#1d86c4'], [1, '#0a3b6c']]); g.fillStyle = panes; g.fillRect(bx, by, bw, bh);
  g.fillStyle = 'rgba(255,255,255,.22)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(bx + 60 + i * 150, by); g.lineTo(bx + 110 + i * 150, by); g.lineTo(bx - 120 + i * 150, by + bh); g.lineTo(bx - 170 + i * 150, by + bh); g.closePath(); g.fill(); }
  g.strokeStyle = '#06284a'; g.lineWidth = 12; for (let x = bx + 140; x < POSTER_W + 20; x += 140) { g.beginPath(); g.moveTo(x, by); g.lineTo(x, by + bh); g.stroke(); } for (let y = 150; y < h; y += 180) { g.beginPath(); g.moveTo(bx, y); g.lineTo(POSTER_W, y); g.stroke(); }
  // squeegee pole and a few droplets
  g.strokeStyle = '#102a4a'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(POSTER_W - 40, 760); g.lineTo(POSTER_W - 300, 220); g.stroke(); g.fillStyle = '#102a4a'; g.save(); g.translate(POSTER_W - 300, 220); g.rotate(-0.45); g.fillRect(-60, -10, 120, 20); g.restore();
  g.fillStyle = 'rgba(255,255,255,.6)'; for (const [x, y] of [[760, 260], [820, 330], [900, 240], [960, 380], [700, 420], [1000, 300]]) { g.beginPath(); g.ellipse(x, y, 5, 9, 0, 0, Math.PI * 2); g.fill(); }
}

export async function renderTemplate(c: HTMLCanvasElement, o: { headline: string; sub: string; poster: PosterSpec; company: { name: string; phone: string; email: string; website?: string; facebook?: string }; photos: string[] }) {
  c.width = POSTER_W; c.height = POSTER_H; const g = c.getContext('2d')!; const p = { ...EMPTY_POSTER, ...o.poster }; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  const imgs = (await Promise.all(o.photos.slice(0, 3).map(loadImg))).filter(Boolean) as HTMLImageElement[]; const logo = await loadImg(LOGO_SMALL_URL);
  const L = 48, HERO_H = 960, STRIP_Y = 968, STRIP_H = 150, BAND_Y = STRIP_Y + STRIP_H, BAND_H = 72, FOOT_Y = BAND_Y + BAND_H;
  const hasStrip = imgs.length >= 3; const heroH = hasStrip ? HERO_H : BAND_Y;

  // hero photo (or sky and glass) + white fade for the text
  g.save(); g.beginPath(); g.rect(0, 0, POSTER_W, heroH); g.clip();
  if (imgs[0]) cover(g, imgs[0], 0, 0, POSTER_W, heroH); else skyAndGlass(g, heroH);
  g.fillStyle = grad(g, 0, 0, 760, 0, [[0, 'rgba(255,255,255,.97)'], [0.5, 'rgba(255,255,255,.86)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, 760, heroH);
  g.fillStyle = grad(g, 0, 0, 0, 220, [[0, 'rgba(255,255,255,.75)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, POSTER_W, 220);
  g.restore();

  // top-right navy banner with the four words + script tagline
  const words = (p.words.filter(Boolean).length ? p.words.filter(Boolean) : DEFAULT_WORDS).slice(0, 4);
  g.font = `800 26px ${FONT}`; const widths = words.map((w) => g.measureText(w).width); const gap = 20; const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1) * 2; let x = POSTER_W - 40 - total;
  g.fillStyle = NAVY; g.beginPath(); g.moveTo(x - 20, 0); g.lineTo(POSTER_W, 0); g.lineTo(POSTER_W, 84); g.lineTo(x - 54, 84); g.closePath(); g.fill();
  words.forEach((w, i) => { g.fillStyle = '#fff'; g.fillText(w, x, 54); x += widths[i]; if (i < words.length - 1) { x += gap; g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(x, 28, 2, 34); x += gap; } });
  { const k = g.createRadialGradient(POSTER_W - 200, 160, 10, POSTER_W - 200, 160, 250); k.addColorStop(0, 'rgba(255,255,255,.92)'); k.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = k; g.fillRect(POSTER_W - 460, 84, 460, 190); }
  g.save(); g.font = SCRIPT; g.fillStyle = BLUE; g.textAlign = 'right'; g.shadowColor = 'rgba(255,255,255,.9)'; g.shadowBlur = 12; g.fillText('Cleaner Spaces', POSTER_W - 36, 142); g.fillText('Brighter Tomorrows', POSTER_W - 36, 192); g.restore();
  g.strokeStyle = GREEN_L; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(POSTER_W - 320, 208); g.quadraticCurveTo(POSTER_W - 180, 192, POSTER_W - 40, 204); g.stroke();

  // brand block
  if (logo) { g.save(); g.shadowColor = 'rgba(11,47,94,.35)'; g.shadowBlur = 20; g.shadowOffsetY = 6; g.drawImage(logo, L - 6, 22, 168, 168); g.restore(); }
  g.fillStyle = NAVY; g.font = `800 25px ${FONT}`; g.fillText('WINDOW CLEANING', L + 178, 74); g.fillText('SOLUTIONS CORP.', L + 178, 104);
  g.fillStyle = GREEN; g.fillRect(L + 178, 118, 190, 3); g.fillStyle = NAVY; g.font = `500 24px ${FONT}`; g.fillText('Specialized Exterior', L + 178, 152); g.fillText('Cleaning & Property Care', L + 178, 182);

  // green label
  let y = 236;
  const label = upper(p.kicker || 'Professional'); g.font = `800 28px ${FONT}`; spaced(g, 9); const lw = g.measureText(label).width + 56; g.fillStyle = GREEN; g.fillRect(L, y, lw, 54); g.fillStyle = '#fff'; g.fillText(label, L + 30, y + 38); spaced(g, 0);
  y += 54;
  // service name
  const hl = fit(g, upper(o.headline || 'Window Cleaning'), '900', 108, 60, 530, 2); g.font = `900 ${hl.size}px ${FONT}`; g.fillStyle = NAVY_D; y += 20;
  g.save(); g.shadowColor = 'rgba(255,255,255,.9)'; g.shadowBlur = 14; hl.lines.forEach((l) => { y += hl.size * 0.98; g.fillText(l, L - 2, y); }); g.restore();
  y += 22;
  if (p.subtitle) { g.font = `800 34px ${FONT}`; spaced(g, 4); g.fillStyle = NAVY; g.fillText(upper(p.subtitle), L, y + 24); spaced(g, 0); y += 44; }
  g.fillStyle = GREEN; g.fillRect(L, y, 74, 4); y += 38;
  if (o.sub) { g.fillStyle = INK; g.font = `500 31px ${FONT}`; const lines = wrap(g, o.sub, 470).slice(0, 4); for (const l of lines) { g.fillText(l, L, y); y += 40; } }

  // three icon steps
  const feats = p.features.filter((f) => f.label).slice(0, 3); const fy = Math.max(y + 4, 690);
  feats.forEach((f, i) => {
    const cx = L + 70 + i * 178, cy = fy + 44;
    g.save(); g.shadowColor = 'rgba(11,47,94,.35)'; g.shadowBlur = 14; g.shadowOffsetY = 5; g.fillStyle = NAVY; g.beginPath(); g.arc(cx, cy, 42, 0, Math.PI * 2); g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 36, 0, Math.PI * 2); g.stroke();
    drawIcon(g, f.icon, cx, cy, 46, '#fff');
    g.fillStyle = NAVY; const t = fit(g, f.label, '700', 22, 17, 160, 2); g.font = `700 ${t.size}px ${FONT}`; g.textAlign = 'center'; t.lines.forEach((l, k) => g.fillText(l, cx, cy + 64 + k * t.size * 1.2)); g.textAlign = 'left';
  });

  // location tag
  if (p.location) {
    const ly = heroH - 66; g.save(); g.shadowColor = 'rgba(0,15,40,.35)'; g.shadowBlur = 14; g.fillStyle = NAVY; g.beginPath(); g.moveTo(0, ly); g.lineTo(470, ly); g.lineTo(436, ly + 62); g.lineTo(0, ly + 62); g.closePath(); g.fill(); g.restore();
    drawIcon(g, 'pin', L + 18, ly + 31, 38, '#fff'); g.fillStyle = '#fff'; const n = fit(g, p.location, '800', 28, 20, 330, 1); g.font = `800 ${n.size}px ${FONT}`; g.fillText(n.lines[0] ?? '', L + 56, ly + (p.location_sub ? 29 : 40));
    if (p.location_sub) { g.font = `500 23px ${FONT}`; g.fillStyle = '#d9e8f7'; g.fillText(p.location_sub, L + 56, ly + 54); }
  }

  // Before / After strip
  if (hasStrip) {
    const half = POSTER_W / 2;
    g.save(); g.beginPath(); g.moveTo(0, STRIP_Y); g.lineTo(half + 26, STRIP_Y); g.lineTo(half - 26, STRIP_Y + STRIP_H); g.lineTo(0, STRIP_Y + STRIP_H); g.closePath(); g.clip(); cover(g, imgs[1], 0, STRIP_Y, half + 40, STRIP_H); g.restore();
    g.save(); g.beginPath(); g.moveTo(half + 32, STRIP_Y); g.lineTo(POSTER_W, STRIP_Y); g.lineTo(POSTER_W, STRIP_Y + STRIP_H); g.lineTo(half - 20, STRIP_Y + STRIP_H); g.closePath(); g.clip(); cover(g, imgs[2], half - 20, STRIP_Y, half + 20, STRIP_H); g.restore();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(half + 26, STRIP_Y); g.lineTo(half + 34, STRIP_Y); g.lineTo(half - 18, STRIP_Y + STRIP_H); g.lineTo(half - 26, STRIP_Y + STRIP_H); g.closePath(); g.fill();
    const tab = (t: string, x: number, col: string, tx: string) => { g.font = `800 24px ${FONT}`; spaced(g, 2); const w = g.measureText(t).width + 56; g.fillStyle = col; g.beginPath(); g.moveTo(x, STRIP_Y + STRIP_H - 46); g.lineTo(x + w, STRIP_Y + STRIP_H - 46); g.lineTo(x + w - 18, STRIP_Y + STRIP_H); g.lineTo(x, STRIP_Y + STRIP_H); g.closePath(); g.fill(); g.fillStyle = tx; g.fillText(t, x + 26, STRIP_Y + STRIP_H - 14); spaced(g, 0); };
    tab('BEFORE', 0, NAVY, '#fff'); tab('AFTER', half + 60, GREEN, '#fff');
  }

  // navy band with four icons
  g.fillStyle = grad(g, 0, BAND_Y, POSTER_W, BAND_Y, [[0, NAVY_D], [1, '#0d3d78']]); g.fillRect(0, BAND_Y, POSTER_W, BAND_H);
  const bicons: ('sparkle' | 'shield' | 'gear' | 'leaf')[] = ['sparkle', 'shield', 'gear', 'leaf']; const bw = POSTER_W / words.length;
  words.forEach((w, i) => {
    const cx = bw * i + bw / 2 - 58; const cy = BAND_Y + BAND_H / 2;
    g.strokeStyle = i % 2 ? GREEN_L : '#2fb7ea'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 24, 0, Math.PI * 2); g.stroke(); drawIcon(g, bicons[i % 4], cx, cy, 26, '#fff');
    g.fillStyle = '#fff'; g.font = `700 29px ${FONT}`; g.fillText(w, cx + 38, cy + 10); if (i) { g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(bw * i, BAND_Y + 14, 2, BAND_H - 28); }
  });

  // footer: call to action + contact
  g.fillStyle = '#fff'; g.fillRect(0, FOOT_Y, POSTER_W, POSTER_H - FOOT_Y);
  const cy = FOOT_Y + (POSTER_H - FOOT_Y) / 2;
  g.save(); g.shadowColor = 'rgba(31,166,83,.45)'; g.shadowBlur = 16; g.shadowOffsetY = 5; g.fillStyle = grad(g, L, cy - 40, L + 390, cy + 40, [[0, GREEN_L], [1, GREEN]]); rr(g, L - 8, cy - 40, 396, 80, 40); g.fill(); g.restore();
  drawIcon(g, 'chat', L + 36, cy, 38, '#fff'); g.fillStyle = '#fff'; g.font = `800 27px ${FONT}`; g.fillText('Get a Free Quotation  ›', L + 70, cy + 10);
  const items: ['phone' | 'mail' | 'globe' | 'fb', string][] = [['phone', o.company.phone], ['mail', o.company.email], ['globe', (o.company.website ?? '').replace(/^https?:\/\//, '')], ['fb', o.company.facebook ?? '']];
  const shown = items.filter(([, t]) => t); g.font = `600 25px ${FONT}`;
  shown.forEach(([ic, t], i) => { const col = i % 2, row = Math.floor(i / 2); const ix = 470 + col * 300, iy = cy - 14 + row * 44; drawIcon(g, ic, ix + 14, iy - 8, 28, NAVY); g.fillStyle = NAVY; g.fillText(t, ix + 40, iy); });
}
