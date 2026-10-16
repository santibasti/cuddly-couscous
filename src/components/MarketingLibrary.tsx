// Marketing photo library: photos you upload for the Marketing AI. The AI describes each one, flags anything that could identify a client, and later picks the photos that fit a post.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Card, Modal, toast } from '@/components/ui';
import { PrivacyEditor } from '@/components/PrivacyEditor';
import { supabase } from '@/lib/cloud';
import { callFn } from '@/lib/fnclient';
import { prepare } from '@/lib/photos';

export interface Media { id: string; path: string; thumb_path: string | null; description: string; tags: string[]; quality: number | null; privacy_note: string | null; ok_to_use: boolean; used_count: number; last_used_at: string | null; created_at: string }
const BUCKET = 'marketing-graphics';

export async function mediaUrls(items: { id: string; path: string }[]): Promise<Record<string, string>> {
  if (!items.length) return {};
  const { data } = await supabase().storage.from(BUCKET).createSignedUrls(items.map((m) => m.path), 3600);
  const out: Record<string, string> = {}; (data ?? []).forEach((d, i) => { if (d.signedUrl) out[items[i].id] = d.signedUrl; }); return out;
}
const small = async (file: Blob): Promise<string> => {
  const bmp = await createImageBitmap(file); const s = Math.min(1, 900 / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8).split(',')[1];
};

/** Uploads one photo to the library and lets the AI describe it. */
export async function addToLibrary(file: File | Blob, enhance?: boolean): Promise<void> {
  const id = crypto.randomUUID(); const p = await prepare(file as File, enhance); const base = `library/${id}`; const sb = supabase().storage.from(BUCKET);
  const a = await sb.upload(`${base}.jpg`, p.full, { contentType: 'image/jpeg' }); if (a.error) throw new Error(a.error.message);
  const b = await sb.upload(`${base}_t.jpg`, p.thumb, { contentType: 'image/jpeg' }); if (b.error) throw new Error(b.error.message);
  const ins = await supabase().from('marketing_media').insert({ id, path: `${base}.jpg`, thumb_path: `${base}_t.jpg`, width: p.width, height: p.height }); if (ins.error) throw new Error(ins.error.message);
  try {
    const t = await callFn<{ description: string; tags: string[]; quality: number; privacy_note: string }>('ai-photo-tag', { image: await small(p.full) });
    await supabase().from('marketing_media').update({ description: t.description, tags: t.tags, quality: t.quality, privacy_note: t.privacy_note || null, ok_to_use: !t.privacy_note }).eq('id', id);
  } catch (e) { toast(`Saved, but the AI could not describe it: ${e instanceof Error ? e.message : 'try again later'}`, 'err'); }
}

export function MarketingLibrary() {
  const [items, setItems] = useState<Media[]>([]); const [urls, setUrls] = useState<Record<string, string>>({}); const [busy, setBusy] = useState<string>(); const [priv, setPriv] = useState<{ m: Media; src: string }>();
  const gal = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const { data } = await supabase().from('marketing_media').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(300);
    const rows = (data ?? []) as Media[]; setItems(rows); setUrls(await mediaUrls(rows.map((m) => ({ id: m.id, path: m.thumb_path ?? m.path }))));
  }, []);
  useEffect(() => { load(); }, [load]);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; let n = 0;
    for (const f of Array.from(files)) { setBusy(`Adding photo ${++n} of ${files.length} — the AI is looking at it…`); try { await addToLibrary(f); } catch (e) { toast(`${f.name}: ${e instanceof Error ? e.message : 'failed'}`, 'err'); } }
    setBusy(undefined); await load();
  };
  const upd = async (id: string, v: Record<string, unknown>) => { const { error } = await supabase().from('marketing_media').update(v).eq('id', id); if (error) toast(error.message, 'err'); else load(); };
  const openPriv = async (m: Media) => { const { data } = await supabase().storage.from(BUCKET).createSignedUrl(m.path, 600); if (!data?.signedUrl) { toast('Could not open this photo', 'err'); return; } const blob = await (await fetch(data.signedUrl)).blob(); const src = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); }); setPriv({ m, src }); };

  return (
    <div className="stack">
      <Card title="Photo library for the Marketing AI" actions={<><input ref={gal} type="file" accept="image/*" multiple className="hide" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} /><button className="btn primary" disabled={!!busy} onClick={() => gal.current?.click()}>Upload photos</button></>}>
        <div className="small muted">Upload photos you are happy to show publicly — finished work, the crew in action, equipment, before/after shots. The AI describes each one and picks the ones that fit a post. Photos where it spots a face, plate, house number or sign are held back until you clear them or hide the detail.</div>
        {busy && <div className="small" style={{ marginTop: 8 }}>{busy}</div>}
      </Card>
      <div className="photogrid">
        {items.map((m) => (
          <div key={m.id} className="photocell" style={{ aspectRatio: 'auto', display: 'block', cursor: 'default' }}>
            <div style={{ aspectRatio: '1', display: 'grid', placeItems: 'center' }}>{urls[m.id] ? <img src={urls[m.id]} alt={m.description} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="small muted">Loading…</span>}</div>
            <div style={{ padding: 6, display: 'grid', gap: 6 }}>
              <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                {m.quality != null && <Badge tone={m.quality >= 4 ? 'green' : m.quality === 3 ? 'amber' : 'red'}>{'★'.repeat(m.quality)}</Badge>}
                {m.privacy_note ? <Badge tone="red">Privacy check</Badge> : null}
                {!m.ok_to_use && !m.privacy_note ? <Badge tone="gray">Not used</Badge> : null}
                {m.used_count > 0 && <span className="small muted">used {m.used_count}×</span>}
              </div>
              <textarea rows={3} defaultValue={m.description} placeholder="What does this photo show?" onBlur={(e) => { if (e.target.value !== m.description) upd(m.id, { description: e.target.value.slice(0, 240) }); }} />
              <input defaultValue={m.tags.join(', ')} placeholder="tags, separated by commas" onBlur={(e) => { const t = e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 8); if (t.join() !== m.tags.join()) upd(m.id, { tags: t }); }} />
              {m.privacy_note && <div className="small" style={{ color: '#b42318' }}>{m.privacy_note}</div>}
              <label className="check small"><input type="checkbox" checked={m.ok_to_use} onChange={(e) => upd(m.id, { ok_to_use: e.target.checked })} />{m.privacy_note ? 'I checked it — OK to post' : 'The AI may use this photo'}</label>
              <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={() => openPriv(m)}>🔒 Hide details</button>
                <button className="btn sm danger" onClick={() => { if (confirm('Remove this photo from the library?')) upd(m.id, { deleted_at: new Date().toISOString() }); }}>Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!items.length && <Card><div className="muted small">No photos yet. Upload some and the AI will start using them in posts.</div></Card>}
      {priv && <PrivacyEditor src={priv.src} onClose={() => setPriv(undefined)} onSave={async (blob) => { await addToLibrary(blob, false); await upd(priv.m.id, { ok_to_use: false }); toast('Saved as a new library photo; the original is no longer used', 'ok'); }} />}
    </div>
  );
}

/** Pick library photos to attach to a post. */
export function LibraryPicker({ chosen, onPick, onClose }: { chosen: string[]; onPick: (ids: string[]) => void; onClose: () => void }) {
  const [items, setItems] = useState<Media[]>([]); const [urls, setUrls] = useState<Record<string, string>>({}); const [sel, setSel] = useState<string[]>(chosen);
  useEffect(() => { supabase().from('marketing_media').select('*').is('deleted_at', null).eq('ok_to_use', true).order('created_at', { ascending: false }).limit(200).then(async ({ data }) => { const rows = (data ?? []) as Media[]; setItems(rows); setUrls(await mediaUrls(rows.map((m) => ({ id: m.id, path: m.thumb_path ?? m.path })))); }); }, []);
  return (
    <Modal title="Add photos from the library" size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { onPick(sel); onClose(); }}>Use {sel.length} photo{sel.length === 1 ? '' : 's'}</button></>}>
      <div className="photogrid">{items.map((m) => (
        <button key={m.id} type="button" className="photocell" style={{ outline: sel.includes(m.id) ? '3px solid #19c37d' : undefined, padding: 0 }} onClick={() => setSel(sel.includes(m.id) ? sel.filter((x) => x !== m.id) : [...sel, m.id].slice(0, 4))} title={m.description}>
          {urls[m.id] ? <img src={urls[m.id]} alt={m.description} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        </button>
      ))}</div>
      {!items.length && <div className="muted small">The library is empty or every photo is held back. Add photos on the Photo library tab.</div>}
    </Modal>
  );
}
