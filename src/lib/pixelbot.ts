// Pixel-art version of every robot. A sprite is a grid of characters built from the agent's Look (head, face, ears, antenna, body, feet) so each agent keeps its own silhouette.
// Pure data (no drawing): 'l' highlight, 'p' prop body, 'q' paper, 'k' dark gadget, '.' empty, 'o' outline, 'w' shell, 'g' shade, 'v' visor, 'e' eye, 'a' agent colour, 'f' feet.
import { lookOf, type Look } from './botlook';
export type PixView = 'front' | 'back' | 'side';
export const PIX_W = 24, PIX_H = 36;
const HEAD: Record<Look['head'], { w: number; h: number; cut: number }> = { sphere: { w: 14, h: 12, cut: 3 }, tall: { w: 12, h: 14, cut: 3 }, square: { w: 14, h: 11, cut: 1 }, dome: { w: 15, h: 11, cut: 3 }, big: { w: 16, h: 13, cut: 3 } };
const BODY: Record<Look['body'], { top: number; bot: number; h: number }> = { slim: { top: 8, bot: 8, h: 8 }, chunk: { top: 12, bot: 12, h: 9 }, pear: { top: 8, bot: 12, h: 9 }, round: { top: 10, bot: 12, h: 9 } };

export function spriteRows(key: string, view: PixView, frame: 0 | 1, seated: boolean, prop?: string): string[] {
  const look = lookOf(key); const g: string[][] = Array.from({ length: PIX_H }, () => Array(PIX_W).fill('.'));
  const put = (x0: number, y0: number, c: string) => { const x = Math.round(x0), y = Math.round(y0); if (x >= 0 && x < PIX_W && y >= 0 && y < PIX_H) g[y][x] = c; };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string) => { for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) put(x, y, c); };
  const cx = PIX_W / 2; const hd = HEAD[look.head]; const bd = BODY[look.body];
  const hx0 = cx - Math.floor(hd.w / 2), hx1 = hx0 + hd.w - 1, hy0 = 6, hy1 = hy0 + hd.h - 1;
  const bodyH = bd.h + (seated ? 4 : 0); const by0 = hy1 + 1, by1 = by0 + bodyH - 1;
  // antenna
  if (look.ant !== 'none') { rect(cx - 1, hy0 - 3, cx, hy0 - 1, 'o'); put(cx - 1, hy0 - 4, 'a'); put(cx, hy0 - 4, 'a'); if (look.ant === 'ball') { put(cx - 2, hy0 - 5, 'a'); put(cx + 1, hy0 - 5, 'a'); put(cx - 1, hy0 - 5, 'a'); put(cx, hy0 - 5, 'a'); } }
  // body
  const taper = (y: number) => bd.top + Math.round(((bd.bot - bd.top) * (y - by0)) / Math.max(1, bodyH - 1));
  for (let y = by0; y <= by1; y++) { const w = taper(y); for (let x = cx - w / 2; x < cx + w / 2; x++) put(x, y, 'o'); for (let x = cx - w / 2 + 1; x < cx + w / 2 - 1; x++) put(x, y, x >= cx + w / 2 - 3 ? 'g' : 'w'); }
  if (view === 'front' && look.face === 'screen') rect(cx - 2, by0 + 2, cx + 1, by0 + 4, 'e'); else if (view === 'front') rect(cx - 1, by0 + 2, cx, by0 + 3, 'a');
  if (view === 'back') rect(cx - 2, by0 + 1, cx + 1, by0 + 5, 'g');
  rect(cx - bd.bot / 2 + 1, by1 - 1, cx + bd.bot / 2 - 2, by1 - 1, 'a');
  // arms
  if (view !== 'side') { const ax = (w: number) => cx - w / 2 - 2; for (const [x, c] of [[ax(bd.top), 0], [cx + bd.top / 2, 1]] as const) { rect(x, by0 + 1, x + 1, by0 + 6, 'o'); rect(x, by0 + 1, x + 1, by0 + 5, c ? 'g' : 'w'); rect(x, by0 + 6, x + 1, by0 + 7, 'a'); } }
  else { rect(cx - 1, by0 + 1, cx, by0 + 6, 'o'); rect(cx - 1, by0 + 1, cx, by0 + 5, 'w'); rect(cx - 1, by0 + 6, cx, by0 + 7, 'a'); }
  // head
  for (let y = hy0; y <= hy1; y++) for (let x = hx0; x <= hx1; x++) {
    const dx = Math.min(x - hx0, hx1 - x), dy = look.head === 'square' ? Math.min(y - hy0, hy1 - y) + 1 : look.head === 'dome' ? (y - hy0) : Math.min(y - hy0, hy1 - y);
    const corner = look.head === 'dome' ? (y - hy0 < hd.cut && dx < hd.cut - (y - hy0)) : (dx + dy < hd.cut);
    if (!corner) put(x, y, 'o');
  }
  for (let y = hy0 + 1; y <= hy1 - 1; y++) for (let x = hx0 + 1; x <= hx1 - 1; x++) if (g[y][x] === 'o') { const inner = (x > hx0 + 1 && x < hx1 - 1 && y > hy0 + 1 && y < hy1 - 1) || true; if (inner) put(x, y, x >= hx1 - 2 ? 'g' : 'w'); }
  // face
  const vy0 = hy0 + 3, vy1 = Math.min(hy1 - 2, vy0 + 5);
  if (view === 'front') {
    rect(hx0 + 2, vy0, hx1 - 2, vy1, 'v');
    if (look.face === 'cyclops') rect(cx - 2, vy0 + 1, cx + 1, vy1 - 1, 'e');
    else if (look.face === 'band') rect(hx0 + 3, vy0 + 2, hx1 - 3, vy0 + 3, 'e');
    else if (look.face === 'screen') { rect(hx0 + 3, vy0 + 1, hx1 - 3, vy0 + 1, 'e'); rect(hx0 + 3, vy0 + 3, hx1 - 5, vy0 + 3, 'e'); rect(hx0 + 3, vy0 + 5 > vy1 ? vy1 : vy0 + 5, hx1 - 7, vy0 + 5 > vy1 ? vy1 : vy0 + 5, 'e'); }
    else { const wide = look.face === 'wide'; rect(cx - (wide ? 4 : 3), vy0 + 1, cx - (wide ? 2 : 2), vy0 + 2, 'e'); rect(cx + (wide ? 2 : 1), vy0 + 1, cx + (wide ? 3 : 2), vy0 + 2, 'e'); if (wide) { rect(cx - 4, vy0 + 3, cx - 3, vy0 + 3, 'e'); rect(cx + 2, vy0 + 3, cx + 3, vy0 + 3, 'e'); } }
  } else if (view === 'side') { rect(cx + 1, vy0, hx1 - 1, vy1, 'v'); rect(hx1 - 3, vy0 + 1, hx1 - 2, vy0 + 2, 'e'); }
  else rect(cx - 2, vy0, cx + 1, vy0 + 3, 'g');
  // ears
  if (look.ears !== 'none') { const ey = hy0 + Math.floor(hd.h / 2) - 1; for (const x of view === 'side' ? [hx0 + 4] : [hx0 - 2, hx1 + 1]) { rect(x, ey, x + 1, ey + 3, 'o'); rect(x, ey + 1, x + 1, ey + 2, look.ears === 'lens' ? 'e' : 'a'); } }
  // legs (not when seated)
  if (!seated) {
    const ly0 = by1 + 1; const l = (x: number, len: number) => { rect(x, ly0, x + 2, ly0 + len - 1, 'o'); rect(x + 1, ly0, x + 1, ly0 + len - 2, 'w'); rect(x - 1, ly0 + len - 1, x + (view === 'side' ? 4 : 3), ly0 + len, 'f'); };
    if (look.feet === 'wheel') { rect(cx - 3, ly0, cx + 2, ly0 + 4, 'o'); rect(cx - 2, ly0 + 1, cx + 1, ly0 + 3, 'f'); }
    else if (view === 'side') { l(cx - 2 + (frame ? 2 : -2), 5 - (frame ? 1 : 0)); l(cx - 2 + (frame ? -2 : 2), 5 - (frame ? 0 : 1)); }
    else { l(cx - 5, 5 - (frame ? 1 : 0)); l(cx + 2, 5 - (frame ? 0 : 1)); }
  }
  // highlights on the shell so the head and body read as glossy
  if (view !== 'back') { put(hx0 + 2, hy0 + 1, 'l'); put(hx0 + 3, hy0 + 1, 'l'); put(hx0 + 1, hy0 + 2, 'l'); }
  put(cx - bd.top / 2 + 2, by0 + 1, 'l'); put(cx - bd.top / 2 + 2, by0 + 2, 'l');
  if (look.ears === 'headset' && view !== 'back') { const ey = hy0 + Math.floor(hd.h / 2) - 1; put(hx0 - 1, ey + 4, 'o'); put(hx0, ey + 5, 'o'); put(hx0 + 1, ey + 5, 'o'); put(hx0 + 2, ey + 5, 'a'); }
  // the prop in the right hand
  if (prop && view !== 'back') {
    const ox = Math.round(view === 'side' ? cx + 1 : cx + bd.top / 2 + 1), oy = by0 + 3;
    const shape: Record<string, string[]> = {
      clip: ['.kk.', 'pppp', 'pqqp', 'pqqp', 'pqqp', 'pppp'], tablet: ['kkkk', 'keek', 'keek', 'keek', 'kkkk'], phone: ['kkk', 'kek', 'kek', 'kkk'],
      envelope: ['qqqqq', 'qoqoq', 'qqoqq', 'qqqqq'], camera: ['.kk..', 'kkkkk', 'keeek', 'kkkkk'], laptop: ['kkkkkk', 'keeeek', 'keeeek', 'oooooo'],
      magnifier: ['.oo..', 'o..o.', 'o..o.', '.oo.o', '....o'], orb: ['.ee.', 'eeee', 'eeee', '.ee.'],
    };
    (shape[prop] ?? shape.tablet).forEach((row, dy) => [...row].forEach((c, dx) => { if (c !== '.') put(ox + dx, oy + dy, c === 'p' ? 'p' : c === 'e' ? 'e' : c); }));
  }
  return g.map((r) => r.join(''));
}
/** Merge each row into runs of the same colour so a sprite is a few dozen rects, not hundreds. */
export function spriteRuns(rows: string[]): { x: number; y: number; w: number; c: string }[] {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  rows.forEach((r, y) => { let x = 0; while (x < r.length) { const c = r[x]; let e = x; while (e < r.length && r[e] === c) e++; if (c !== '.') out.push({ x, y, w: e - x, c }); x = e; } });
  return out;
}
