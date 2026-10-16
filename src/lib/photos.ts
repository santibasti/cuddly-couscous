// Job photos: resize + strip hidden data, upload to the private 'job-photos' bucket (production) or keep an inline picture (demo).
import { CLOUD, supabase } from './cloud';

/** Re-draws the picture on a canvas: this resizes it and drops all hidden data (GPS position, camera details). */
const KEY = 'topmop-photo-enhance';
export const getEnhance = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export const setEnhance = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* not saved */ } };

/** Gentle automatic touch-up: stretches dull exposure (1%–99% levels), lifts dark shots, adds a little colour and sharpness. Runs on the device. */
export function enhanceCanvas(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d'); if (!ctx || !c.width || !c.height) return;
  const img = ctx.getImageData(0, 0, c.width, c.height); const d = img.data; const n = d.length / 4;
  const hist = new Uint32Array(256); let sum = 0;
  for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; hist[y]++; sum += y; }
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
  if (hi - lo < 40) { lo = Math.max(0, lo - 10); hi = Math.min(255, hi + 10); }
  const mean = sum / n; const gamma = mean < 95 ? 0.82 : mean > 175 ? 1.08 : 1; // lift dark photos, tame very bright ones
  const lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, Math.max(0, (v - lo) / Math.max(1, hi - lo))), gamma);
  const sat = 1.12;
  for (let i = 0; i < d.length; i += 4) {
    const r = lut[d[i]], g = lut[d[i + 1]], b = lut[d[i + 2]]; const y = 0.299 * r + 0.587 * g + 0.114 * b;
    d[i] = y + (r - y) * sat; d[i + 1] = y + (g - y) * sat; d[i + 2] = y + (b - y) * sat;
  }
  ctx.putImageData(img, 0, 0);
  // light unsharp mask: add a bit of (pixel − blurred copy)
  const w = c.width, h = c.height; const blur = document.createElement('canvas'); blur.width = w; blur.height = h;
  const bc = blur.getContext('2d'); if (!bc) return; bc.filter = 'blur(1.2px)'; bc.drawImage(c, 0, 0);
  const src = ctx.getImageData(0, 0, w, h); const bl = bc.getImageData(0, 0, w, h).data; const s2 = src.data; const amt = 0.55;
  for (let i = 0; i < s2.length; i += 4) for (let k = 0; k < 3; k++) s2[i + k] += (s2[i + k] - bl[i + k]) * amt;
  ctx.putImageData(src, 0, 0);
}

export async function prepare(file: File, enhance = getEnhance()): Promise<{ full: Blob; thumb: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const draw = (max: number, q: number, fix: boolean) => new Promise<{ blob: Blob; w: number; h: number }>((res, rej) => {
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height)); const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    if (fix) { try { enhanceCanvas(c); } catch { /* keep the original look */ } }
    c.toBlob((b) => (b ? res({ blob: b, w, h }) : rej(new Error('Could not process the photo'))), 'image/jpeg', q);
  });
  const f = await draw(1600, 0.82, enhance); const t = await draw(360, 0.7, enhance);
  return { full: f.blob, thumb: t.blob, width: f.w, height: f.h };
}
const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });

/** Adds a photo to a booking. Production: into the Photo Library (private storage) and returns its path. Demo: returns an inline picture. */
export async function addJobPhoto(file: File, o: { jobId: string; clientId?: string; kind: 'Before' | 'After' | 'During' | 'Site' | 'Other'; caption?: string }): Promise<{ id: string; path?: string; data?: string }> {
  const id = crypto.randomUUID();
  if (!CLOUD) {
    const bmp = await createImageBitmap(file); const s = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    if (getEnhance()) { try { enhanceCanvas(c); } catch { /* keep the original look */ } }
    return { id, data: c.toDataURL('image/jpeg', 0.72) };
  }
  const p = await prepare(file); const base = `${o.jobId}/${id}`; const sb = supabase().storage.from('job-photos');
  const a = await sb.upload(`${base}.jpg`, p.full, { contentType: 'image/jpeg' }); if (a.error) throw new Error(a.error.message);
  const b = await sb.upload(`${base}_t.jpg`, p.thumb, { contentType: 'image/jpeg' }); if (b.error) throw new Error(b.error.message);
  const ins = await supabase().from('job_photos').insert({ id, job_id: o.jobId, client_id: o.clientId ?? null, path: `${base}.jpg`, thumb_path: `${base}_t.jpg`, kind: o.kind, caption: (o.caption ?? '').slice(0, 200), width: p.width, height: p.height, client_ok: false });
  if (ins.error) throw new Error(ins.error.message);
  return { id, path: `${base}.jpg` };
}

/** Viewable addresses for photos (signed links for stored ones). */
export async function photoUrls(photos: { id: string; path?: string; data?: string }[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}; const paths: { id: string; path: string }[] = [];
  for (const p of photos) { if (p.data) out[p.id] = p.data; else if (p.path && CLOUD) paths.push({ id: p.id, path: p.path }); }
  if (paths.length) {
    const { data } = await supabase().storage.from('job-photos').createSignedUrls(paths.map((x) => x.path), 3600);
    for (const d of data ?? []) { const m = paths.find((x) => x.path === d.path); if (m && d.signedUrl) out[m.id] = d.signedUrl; }
  }
  return out;
}
/** The same photos as inline pictures (for the PDF). */
export async function photoDataUrls(photos: { id: string; path?: string; data?: string }[]): Promise<Record<string, string>> {
  const urls = await photoUrls(photos); const out: Record<string, string> = {};
  for (const [id, u] of Object.entries(urls)) { if (u.startsWith('data:')) out[id] = u; else { try { out[id] = await blobToDataUrl(await (await fetch(u)).blob()); } catch { /* skip a photo that cannot be loaded */ } } }
  return out;
}
