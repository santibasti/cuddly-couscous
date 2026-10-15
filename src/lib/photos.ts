// Job photos: resize + strip hidden data, upload to the private 'job-photos' bucket (production) or keep an inline picture (demo).
import { CLOUD, supabase } from './cloud';

/** Re-draws the picture on a canvas: this resizes it and drops all hidden data (GPS position, camera details). */
export async function prepare(file: File): Promise<{ full: Blob; thumb: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const draw = (max: number, q: number) => new Promise<{ blob: Blob; w: number; h: number }>((res, rej) => {
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height)); const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    c.toBlob((b) => (b ? res({ blob: b, w, h }) : rej(new Error('Could not process the photo'))), 'image/jpeg', q);
  });
  const f = await draw(1600, 0.82); const t = await draw(360, 0.7);
  return { full: f.blob, thumb: t.blob, width: f.w, height: f.h };
}
const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });

/** Adds a photo to a booking. Production: into the Photo Library (private storage) and returns its path. Demo: returns an inline picture. */
export async function addJobPhoto(file: File, o: { jobId: string; clientId?: string; kind: 'Before' | 'After' | 'During' | 'Site' | 'Other'; caption?: string }): Promise<{ id: string; path?: string; data?: string }> {
  const id = crypto.randomUUID();
  if (!CLOUD) {
    const bmp = await createImageBitmap(file); const s = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
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
