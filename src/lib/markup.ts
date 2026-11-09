// Drawing on a picture: circles, arrows, freehand and short text, kept as shapes so each can be undone, then drawn onto the image.
export type Tool = 'circle' | 'arrow' | 'pen' | 'text';
export type Shape =
  | { t: 'circle'; x1: number; y1: number; x2: number; y2: number; c: string }
  | { t: 'arrow'; x1: number; y1: number; x2: number; y2: number; c: string }
  | { t: 'pen'; pts: [number, number][]; c: string }
  | { t: 'text'; x: number; y: number; s: string; c: string };
export const MARK_COLORS = ['#e11d48', '#facc15', '#ffffff', '#16a34a'] as const;

/** Line thickness that looks the same on a small and a large picture. */
export const lineWidth = (w: number, h: number) => Math.max(3, Math.round(Math.max(w, h) / 170));

export function drawShape(ctx: CanvasRenderingContext2D, s: Shape, w: number, h: number) {
  const lw = lineWidth(w, h);
  ctx.save(); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = lw * 1.2;      // keeps a white or yellow mark readable on a light picture
  if (s.t === 'circle') {
    const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2, rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
    if (rx > 1 && ry > 1) { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); }
  } else if (s.t === 'arrow') {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = Math.hypot(dx, dy);
    if (len > 2) {
      const a = Math.atan2(dy, dx), head = Math.min(len * 0.6, lw * 5.5);
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2 - Math.cos(a) * head * 0.6, s.y2 - Math.sin(a) * head * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(a - 0.45), s.y2 - head * Math.sin(a - 0.45)); ctx.lineTo(s.x2 - head * Math.cos(a + 0.45), s.y2 - head * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
    }
  } else if (s.t === 'pen') {
    if (s.pts.length > 1) { ctx.beginPath(); ctx.moveTo(s.pts[0][0], s.pts[0][1]); for (const p of s.pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke(); }
  } else {
    const size = Math.max(16, Math.round(Math.max(w, h) / 24));
    ctx.font = `700 ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = s.c === '#ffffff' || s.c === '#facc15' ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.9)'; ctx.strokeText(s.s, s.x, s.y); ctx.fillText(s.s, s.x, s.y);
  }
  ctx.restore();
}
