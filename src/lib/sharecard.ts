// The picture an employee can post to their own social media when TopMop recognises them: logo, brand colours, their photo, name and the award.
// It never includes the reward amount, pay, client names or job places.
import { LOGO_URL } from './logo';

export interface CardInput { name: string; title: string; kicker: string; icon: string; message?: string; photo?: string | null }
const W = 1080, H = 1350;
const NAVY = '#0b1b2e', TEAL = '#12a1a7', GREEN = '#2ee59d', GOLD = '#f5b83d';

const load = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
function wrap(c: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' '); const lines: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const cut = lines.slice(0, maxLines); cut[maxLines - 1] = cut[maxLines - 1].replace(/\s*\S*$/, '…'); return cut; }
  return lines;
}
const shrinkToFit = (c: CanvasRenderingContext2D, text: string, weight: string, size: number, maxW: number, min = 44) => { let s = size; do { c.font = `${weight} ${s}px system-ui, "Segoe UI", Roboto, sans-serif`; s -= 4; } while (c.measureText(text).width > maxW && s > min); };

export async function makeShareCard(d: CardInput): Promise<Blob> {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d')!;
  // background in the TopMop colours
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, NAVY); g.addColorStop(0.55, '#0e3a55'); g.addColorStop(1, TEAL); c.fillStyle = g; c.fillRect(0, 0, W, H);
  // soft light and confetti
  const glow = c.createRadialGradient(W / 2, 520, 40, W / 2, 520, 620); glow.addColorStop(0, 'rgba(46,229,157,.30)'); glow.addColorStop(1, 'rgba(46,229,157,0)'); c.fillStyle = glow; c.fillRect(0, 0, W, H);
  const dots = [[90, 160, 14, GOLD], [980, 220, 18, GREEN], [150, 560, 10, '#fff'], [940, 640, 12, GOLD], [70, 900, 16, GREEN], [1010, 940, 10, '#fff'], [220, 1180, 14, GOLD], [880, 1200, 12, GREEN], [520, 110, 9, '#fff'], [760, 90, 12, GOLD], [300, 220, 8, GREEN]] as const;
  for (const [x, y, r, col] of dots) { c.globalAlpha = 0.85; c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
  // logo
  const logo = await load(LOGO_URL);
  if (logo) { const s = 150; c.save(); c.beginPath(); c.arc(W / 2, 130, s / 2 + 8, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,.12)'; c.fill(); c.restore(); c.drawImage(logo, W / 2 - s / 2, 130 - s / 2, s, s); }
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  // kicker
  c.fillStyle = GOLD; c.font = '700 40px system-ui, "Segoe UI", Roboto, sans-serif'; c.fillText(d.kicker.toUpperCase().split('').join(' '), W / 2, 300);
  // photo (or the award icon)
  const cy = 520, r = 170;
  c.save(); c.beginPath(); c.arc(W / 2, cy, r + 16, 0, Math.PI * 2); c.fillStyle = GOLD; c.fill(); c.restore();
  const photo = d.photo ? await load(d.photo) : null;
  c.save(); c.beginPath(); c.arc(W / 2, cy, r, 0, Math.PI * 2); c.clip();
  if (photo) { const k = Math.max((2 * r) / photo.width, (2 * r) / photo.height); const w = photo.width * k, h = photo.height * k; c.drawImage(photo, W / 2 - w / 2, cy - h / 2, w, h); }
  else { c.fillStyle = '#12445f'; c.fillRect(W / 2 - r, cy - r, 2 * r, 2 * r); c.font = '200px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(d.icon, W / 2, cy + 8); c.textBaseline = 'alphabetic'; }
  c.restore();
  // little award badge on the photo
  c.save(); c.beginPath(); c.arc(W / 2 + 130, cy + 130, 52, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.font = '64px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; c.textBaseline = 'middle'; c.fillStyle = '#000'; c.fillText(d.icon, W / 2 + 130, cy + 134); c.restore();
  c.textBaseline = 'alphabetic';
  // name and award
  c.fillStyle = '#fff'; shrinkToFit(c, d.name, '800', 96, W - 160); c.fillText(d.name, W / 2, 800);
  c.fillStyle = GREEN; shrinkToFit(c, d.title, '700', 58, W - 160, 36); c.fillText(d.title, W / 2, 880);
  if (d.message?.trim()) { c.fillStyle = 'rgba(255,255,255,.92)'; c.font = '400 40px system-ui, "Segoe UI", Roboto, sans-serif'; wrap(c, d.message, W - 220, 4).forEach((ln, i) => c.fillText(ln, W / 2, 975 + i * 54)); }
  // footer
  c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(120, 1218, W - 240, 2);
  c.fillStyle = '#fff'; c.font = '700 38px system-ui, "Segoe UI", Roboto, sans-serif'; c.fillText('TopMop Window Cleaning Solutions Corp.', W / 2, 1272);
  c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '400 30px system-ui, "Segoe UI", Roboto, sans-serif'; c.fillText('Proud to be part of the team', W / 2, 1318);
  return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the picture'))), 'image/png'));
}

export const defaultCaption = (title: string, message?: string) =>
  `Proud to be part of TopMop! 🏆 ${title}${message?.trim() ? `\n\n${message.trim().slice(0, 220)}` : ''}\n\n#TopMop #TopMopPH #WindowCleaning`;

/** Opens the phone's own share menu with the picture and caption. Where that is not available the picture is saved and the caption copied. */
export async function shareCard(blob: Blob, caption: string, fileName = 'topmop-award.png'): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([blob], fileName, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text: caption, title: 'TopMop' }); return 'shared'; } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  saveCard(blob, fileName); try { await navigator.clipboard.writeText(caption); } catch { /* the caption is also shown on screen */ }
  return 'saved';
}
export function saveCard(blob: Blob, fileName = 'topmop-award.png') { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
