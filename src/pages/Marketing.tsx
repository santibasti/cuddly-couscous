// Marketing AI: posts for the Facebook Page written by the AI (or by you) — review, edit, schedule, approve and post.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Modal, PageHead, toast } from '@/components/ui';
import { AiRephrase } from '@/components/AiRephrase';
import { CLOUD, supabase } from '@/lib/cloud';
import { photoDataUrls, photoUrls } from '@/lib/photos';
import { callFn } from '@/lib/fnclient';
import { LibraryPicker, MarketingLibrary, mediaDataUrls, mediaUrls } from '@/components/MarketingLibrary';
import { EMPTY_POSTER, ICONS, ICON_LABEL, type IconName } from '@/lib/marketingposter';
import { TONES } from '@/lib/marketingtone';
import { GraphicSpec, GraphicStyle, STYLE_LABEL, canvasBlob, renderGraphic } from '@/lib/marketinggraphic';
import { fmtStamp } from '@/lib/util';

type Status = 'Idea' | 'Approved' | 'Posted' | 'Failed' | 'Rejected';
interface Post { id: string; kind: string; text: string; photo_ids: string[]; media_ids: string[]; job_id: string | null; graphic: GraphicSpec | null; image_path: string | null; scheduled_at: string; status: Status; by_ai: boolean; fb_post_id: string | null; posted_at: string | null; error: string | null }
const TONE: Record<Status, string> = { Idea: 'amber', Approved: 'blue', Posted: 'green', Failed: 'red', Rejected: 'gray' };
const LABEL: Record<Status, string> = { Idea: 'Needs your approval', Approved: 'Approved — will post', Posted: 'Posted', Failed: 'Failed', Rejected: 'Rejected' };
const KINDS = ['Tip', 'Completed job', 'Promo', 'Seasonal', 'Other'];

const toLocal = (iso: string) => { const d = new Date(Date.parse(iso) + 8 * 3600_000); return d.toISOString().slice(0, 16); };       // Manila wall clock for <input type=datetime-local>
const fromLocal = (v: string) => new Date(Date.parse(v + ':00Z') - 8 * 3600_000).toISOString();

const fn = callFn;

export default function Marketing() {
  const { db } = useAuth(); const company = { ...db.settings.company, email: db.settings.marketing?.email || 'info@topmop.ph', phone: db.settings.marketing?.phone || '+63 919 318 5860', facebook: db.settings.marketing?.facebook ?? 'Topmop Ph', website: db.settings.marketing?.website ?? 'https://www.topmop.ph' }; const mode = db.settings.marketing?.mode ?? 'off';
  const [tone, setTone] = useState<string>('Default'); const [ask, setAsk] = useState(''); const [askKind, setAskKind] = useState('Other'); const [askAt, setAskAt] = useState(''); const [posts, setPosts] = useState<Post[]>([]); const [busy, setBusy] = useState<string>(); const [add, setAdd] = useState(false); const [tab, setTab] = useState<'todo' | 'posted' | 'library'>('todo');
  const load = useCallback(async () => { const { data } = await supabase().from('marketing_posts').select('*').order('scheduled_at', { ascending: true }).limit(300); setPosts((data ?? []) as Post[]); }, []);
  useEffect(() => { if (!CLOUD) return; load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  if (!CLOUD) return <div className="alert warn">Marketing AI works in the live app only (it needs the cloud connection and the Facebook Page).</div>;

  const generate = async () => {
    setBusy('The AI is writing posts…');
    try { const r = await fn<{ made?: number; note?: string }>('marketing-run', { action: 'generate', count: 3, tone: tone === 'Default' ? undefined : tone }); toast(r.made ? `${r.made} new post${r.made === 1 ? '' : 's'} written — review them below` : (r.note ?? 'Nothing new was written'), r.made ? 'ok' : 'err'); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not write posts', 'err'); } finally { setBusy(undefined); }
  };
  const writeFromPrompt = async () => {
    setBusy('The AI is writing your post…');
    try {
      const r = await fn<{ made?: number; note?: string }>('marketing-run', { action: 'generate', prompt: ask.trim(), kind: askKind, at: askAt ? fromLocal(askAt) : undefined, tone: tone === 'Default' ? undefined : tone });
      toast(r.made ? 'Your post is ready — review it below' : (r.note ?? 'Nothing was written'), r.made ? 'ok' : 'err'); if (r.made) { setAsk(''); setTab('todo'); } await load();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not write the post', 'err'); } finally { setBusy(undefined); }
  };
  const todo = posts.filter((p) => p.status === 'Idea' || p.status === 'Approved' || p.status === 'Failed');
  const done = posts.filter((p) => p.status === 'Posted' || p.status === 'Rejected').sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const waiting = todo.filter((p) => p.status === 'Idea').length;

  return (
    <>
      <PageHead icon="📣" title="Marketing AI" sub={mode === 'off' ? 'Switched off — turn it on in Admin → Settings → Marketing AI. You can still write posts by hand or ask the AI for ideas.' : mode === 'auto' ? 'Auto: approved posts go to your Facebook Page on schedule.' : 'The AI drafts posts and waits for your approval before anything is published.'}>
        <select value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Mood of the new posts" title="Mood of the new posts"><option value="Default">Mood: {db.settings.marketing?.tone ?? 'Mixed'} (default)</option>{TONES.map((t) => <option key={t} value={t}>{t === 'Mixed' ? 'Mixed' : t}</option>)}</select>
        <button className="btn primary" disabled={!!busy} onClick={generate}>✨ Write 3 ideas now</button>
        <button className="btn" onClick={() => setAdd(true)}>New post</button>
        <Link to="/admin" className="btn">Settings</Link>
      </PageHead>
      {busy && <div className="alert">{busy}</div>}
      {waiting > 0 && <div className="alert warn">{waiting} post{waiting === 1 ? '' : 's'} waiting for your approval.</div>}
      <Card title="Ask the AI for a specific post">
        <div className="stack">
          <textarea rows={3} style={{ width: '100%' }} maxLength={1200} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Tell the AI what to post. e.g. “Announce that we now clean solar panels for warehouses in Laguna, mention the free ocular visit, upbeat tone.”" />
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
            <Field label="Type"><select value={askKind} onChange={(e) => setAskKind(e.target.value)}>{[['Other', 'General'], ['Tip', 'Tip'], ['Promo', 'Promo'], ['Seasonal', 'Seasonal'], ['Completed job', 'Completed job']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Post on (optional, Manila time)"><input type="datetime-local" value={askAt} onChange={(e) => setAskAt(e.target.value)} /></Field>
            <button className="btn primary" disabled={!!busy || ask.trim().length < 8} onClick={writeFromPrompt}>✨ Write this post</button>
          </div>
          <div className="small muted">It uses your company knowledge and the mood chosen at the top. The post lands in Upcoming for you to review. Leave the time empty and it takes the next free slot.</div>
        </div>
      </Card>
      <div className="chips" role="tablist" style={{ margin: '12px 0' }}>
        <button type="button" className={tab === 'todo' ? 'on' : ''} onClick={() => setTab('todo')}>Upcoming ({todo.length})</button>
        <button type="button" className={tab === 'posted' ? 'on' : ''} onClick={() => setTab('posted')}>Posted & rejected ({done.length})</button>
        <button type="button" className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>📷 Photo library</button>
      </div>
      <div className="stack">
        {tab === 'library' && <MarketingLibrary />}
        {tab !== 'library' && (tab === 'todo' ? todo : done).map((p) => <PostCard key={p.id} p={p} company={company} onChanged={load} />)}
        {tab !== 'library' && !(tab === 'todo' ? todo : done).length && <Card><div className="muted small">{tab === 'todo' ? 'No upcoming posts. Tap “Write 3 ideas now”, or switch the Marketing AI on in Admin so it keeps the schedule filled.' : 'Nothing posted yet.'}</div></Card>}
      </div>
      {add && <NewPost onClose={() => setAdd(false)} onSaved={load} />}
    </>
  );
}

type Company = { name: string; phone: string; email: string; tagline?: string; website?: string; facebook?: string };
const BLANK: GraphicSpec = { on: false, headline: '', sub: '', points: [], style: 'auto' };

/** The user's own picture: shrunk to 1600 px and re-encoded (which also drops GPS data). */
async function ownImageBlob(file: File): Promise<{ blob: Blob; ext: string }> {
  const bmp = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const png = file.type === 'image/png'; const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read the picture'))), png ? 'image/png' : 'image/jpeg', 0.92));
  return { blob, ext: png ? 'png' : 'jpg' };
}

function PostCard({ p, company, onChanged }: { p: Post; company: Company; onChanged: () => void }) {
  const [text, setText] = useState(p.text); const [at, setAt] = useState(toLocal(p.scheduled_at)); const [photos, setPhotos] = useState<string[]>(p.photo_ids); const [media, setMedia] = useState<string[]>(p.media_ids ?? []); const [mUrls, setMUrls] = useState<Record<string, string>>({}); const mediaRows = useRef<{ id: string; path: string }[]>([]); const mediaCache = useRef<Record<string, string>>({}); const [picker, setPicker] = useState(false); const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const area = useRef<HTMLTextAreaElement>(null);
  const [g, setG] = useState<GraphicSpec>(p.graphic ?? BLANK); const cv = useRef<HTMLCanvasElement>(null); const photoRows = useRef<{ id: string; path: string }[]>([]); const dataCache = useRef<Record<string, string>>({});
  const pst = { ...EMPTY_POSTER, ...g.poster };
  const setP = (v: Partial<typeof pst>) => setG({ ...g, poster: { ...pst, ...v } });
  const setFeat = (i: number, v: Partial<{ icon: IconName; label: string }>) => { const f = [0, 1, 2].map((k) => pst.features[k] ?? { icon: 'check' as IconName, label: '' }); f[i] = { ...f[i], ...v }; setP({ features: f }); };
  const setCard = (i: number, v: Partial<{ label: string; value: string }>) => { const c = [0, 1].map((k) => pst.cards[k] ?? { label: '', value: '' }); c[i] = { ...c[i], ...v }; setP({ cards: c }); };
  const gKey = JSON.stringify(g); const gDirty = gKey !== JSON.stringify(p.graphic ?? BLANK); const needsImage = g.on && !g.own && (!p.image_path || gDirty);
  const [ownUrl, setOwnUrl] = useState<string>(''); const ownFile = useRef<HTMLInputElement>(null);
  useEffect(() => { let off = false; setOwnUrl(''); if (p.graphic?.own && p.image_path) supabase().storage.from('marketing-graphics').createSignedUrl(p.image_path, 3600).then(({ data }) => { if (!off && data?.signedUrl) setOwnUrl(data.signedUrl); }); return () => { off = true; }; }, [p.image_path, p.graphic?.own]); // eslint-disable-line react-hooks/exhaustive-deps
  const [review, setReview] = useState<null | 'approve' | 'post' | 'look'>(null); const [shots, setShots] = useState<string[]>([]); const [loadingShots, setLoadingShots] = useState(false);
  const openReview = async (mode: 'approve' | 'post' | 'look') => {
    setReview(mode); setShots([]); setLoadingShots(true);
    try {
      const out: string[] = [];
      if (g.own) { if (ownUrl) out.push(ownUrl); }
      else if (g.on) { const c = document.createElement('canvas'); await draw(c); out.push(c.toDataURL('image/jpeg', 0.92)); }
      const wm = media.map((id) => mediaRows.current.find((r) => r.id === id)).filter(Boolean) as { id: string; path: string }[];
      const needM = wm.filter((r) => !mediaCache.current[r.id]); if (needM.length) Object.assign(mediaCache.current, await mediaDataUrls(needM));
      const want = photos.map((id) => photoRows.current.find((r) => r.id === id)).filter(Boolean) as { id: string; path: string }[];
      const need = want.filter((r) => !dataCache.current[r.id]); if (need.length) Object.assign(dataCache.current, await photoDataUrls(need));
      out.push(...wm.map((r) => mediaCache.current[r.id]), ...want.map((r) => dataCache.current[r.id]));
      setShots(out.filter(Boolean));
    } catch { toast('Could not load the full-size picture', 'err'); }
    setLoadingShots(false);
  };
  const editable = p.status === 'Idea' || p.status === 'Approved' || p.status === 'Failed';
  const dirty = text !== p.text || at !== toLocal(p.scheduled_at) || photos.join() !== p.photo_ids.join() || media.join() !== (p.media_ids ?? []).join() || gDirty || needsImage;
  useEffect(() => { setText(p.text); setAt(toLocal(p.scheduled_at)); setPhotos(p.photo_ids); setMedia(p.media_ids ?? []); setG(p.graphic ?? BLANK); }, [p.id, p.text, p.scheduled_at, p.photo_ids.join(), (p.media_ids ?? []).join(), JSON.stringify(p.graphic)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p.photo_ids.length) return;
    supabase().from('job_photos').select('id, path').in('id', p.photo_ids).then(async ({ data }) => { photoRows.current = (data ?? []) as { id: string; path: string }[]; setUrls(await photoUrls(photoRows.current)); });
  }, [p.photo_ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!media.length) return;
    supabase().from('marketing_media').select('id, path, thumb_path').in('id', media).then(async ({ data }) => { mediaRows.current = (data ?? []).map((m) => ({ id: m.id as string, path: m.path as string })); setMUrls(await mediaUrls((data ?? []).map((m) => ({ id: m.id as string, path: (m.thumb_path ?? m.path) as string })))); });
  }, [media.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const draw = async (c: HTMLCanvasElement) => {
    const want = photos.map((id) => photoRows.current.find((r) => r.id === id)).filter(Boolean) as { id: string; path: string }[];
    const need = want.filter((r) => !dataCache.current[r.id]); if (need.length) Object.assign(dataCache.current, await photoDataUrls(need));
    const wm = media.map((id) => mediaRows.current.find((r) => r.id === id)).filter(Boolean) as { id: string; path: string }[];
    const needM = wm.filter((r) => !mediaCache.current[r.id]); if (needM.length) Object.assign(mediaCache.current, await mediaDataUrls(needM));
    await renderGraphic(c, g, p.kind, { company, photos: [...wm.map((r) => mediaCache.current[r.id]), ...want.map((r) => dataCache.current[r.id])].filter(Boolean) });
  };
  useEffect(() => { if (editable && g.on && cv.current) draw(cv.current).catch(() => undefined); }, [gKey, photos.join(), media.join(), Object.keys(urls).length, Object.keys(mUrls).length, editable]); // eslint-disable-line react-hooks/exhaustive-deps
  const uploadGraphic = async (): Promise<string | null> => {
    const c = document.createElement('canvas'); await draw(c); const blob = await canvasBlob(c); const path = `${p.id}/${Date.now()}.png`;
    const { error } = await supabase().storage.from('marketing-graphics').upload(path, blob, { contentType: 'image/png' }); if (error) throw new Error(error.message); return path;
  };
  /** The user's own picture or flyer goes up as it is (only shrunk to 1600 px and re-encoded, which also drops GPS data); it replaces the TopMop graphic. */
  const uploadOwn = async (file: File) => {
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose a picture (JPG or PNG).');
      const { blob, ext } = await ownImageBlob(file); const path = `${p.id}/own-${Date.now()}.${ext}`;
      const { error } = await supabase().storage.from('marketing-graphics').upload(path, blob, { contentType: blob.type }); if (error) throw new Error(error.message);
      const next = { ...g, on: false, own: true }; setG(next); await patch({ graphic: next, image_path: path }, 'Your picture is attached — it will be posted instead of an AI graphic');
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not upload the picture', 'err'); }
  };
  const removeOwn = async () => { const next = { ...g, own: false }; setG(next); await patch({ graphic: next, image_path: null }, 'Your picture was removed'); };
  const downloadGraphic = async () => { const c = document.createElement('canvas'); await draw(c); const a = document.createElement('a'); a.href = URL.createObjectURL(await canvasBlob(c)); a.download = 'topmop-post.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };

  const patch = async (v: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const { error } = await supabase().from('marketing_posts').update({ ...v, updated_at: new Date().toISOString() }).eq('id', p.id);
    setBusy(false); if (error) { toast(error.message, 'err'); return false; } toast(ok, 'ok'); onChanged(); return true;
  };
  const save = async () => {
    try {
      const extra: Record<string, unknown> = { graphic: g };
      if (g.own) { /* the uploaded picture stays */ } else if (g.on) { if (needsImage) extra.image_path = await uploadGraphic(); } else extra.image_path = null;
      return await patch({ text: text.trim(), scheduled_at: fromLocal(at), photo_ids: photos, media_ids: media, ...extra }, 'Saved');
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save the graphic', 'err'); return false; }
  };
  const approve = async () => { if (dirty && !(await save())) return; await patch({ status: 'Approved', error: null }, 'Approved — it will be posted at the scheduled time'); };
  const postNow = async () => {
    if (dirty && !(await save())) return; if (p.status !== 'Approved' && !(await patch({ status: 'Approved', error: null }, 'Approved'))) return;
    setBusy(true);
    try { await fn('marketing-run', { action: 'post_now', id: p.id }); toast('Posted to your Facebook Page', 'ok'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not post', 'err'); }
    setBusy(false); onChanged();
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Text copied — paste it into Facebook', 'ok'); } catch { toast('Could not copy', 'err'); } };

  return (
    <Card title={<span className="row" style={{ gap: 8 }}><Badge tone={TONE[p.status]}>{LABEL[p.status]}</Badge><Badge tone="gray">{p.kind}</Badge>{p.by_ai && <span className="small muted">✨ written by AI</span>}</span>}
      actions={editable ? <div className="row"><AiRephrase value={text} area={() => area.current} onApply={setText} tones /></div> : undefined}>
      <div className="stack">
        {editable ? <textarea ref={area} rows={Math.min(12, Math.max(5, text.split('\n').length + 1))} style={{ width: '100%' }} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} /> : <div style={{ whiteSpace: 'pre-wrap' }}>{p.text}</div>}
        {photos.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>{photos.map((id) => <div key={id} style={{ position: 'relative' }}>
            {urls[id] ? <img src={urls[id]} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 96, height: 96, borderRadius: 6, background: '#eef3f7' }} />}
            {editable && <button type="button" className="btn sm danger" style={{ position: 'absolute', top: 2, right: 2, padding: '0 6px' }} aria-label="Remove photo" onClick={() => setPhotos(photos.filter((x) => x !== id))}>×</button>}
          </div>)}</div>
        )}
        {(media.length > 0 || editable) && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {media.map((id) => <div key={id} style={{ position: 'relative' }}>
              {mUrls[id] ? <img src={mUrls[id]} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 96, height: 96, borderRadius: 6, background: '#eef3f7' }} />}
              {editable && <button type="button" className="btn sm danger" style={{ position: 'absolute', top: 2, right: 2, padding: '0 6px' }} aria-label="Remove photo" onClick={() => setMedia(media.filter((x) => x !== id))}>×</button>}
            </div>)}
            {editable && <button type="button" className="btn sm" onClick={() => setPicker(true)}>📷 Add from library</button>}
            {media.length > 0 && !editable && <span className="small muted">Photos from the library</span>}
          </div>
        )}
        {picker && <LibraryPicker chosen={media} onPick={setMedia} onClose={() => setPicker(false)} />}
        {editable && (
          <div className="card" style={{ padding: 12 }}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              <input ref={ownFile} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadOwn(f); }} />
              <button type="button" className="btn sm" disabled={busy} onClick={() => ownFile.current?.click()}>📤 {g.own ? 'Replace my own picture' : 'Upload my own picture / flyer'}</button>
              <span className="small muted">Use your own design instead of a TopMop graphic — it is posted as it is.</span>
            </div>
            {g.own && (
              <div className="row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                {ownUrl ? <img src={ownUrl} alt="Your picture" style={{ width: 180, height: 'auto', borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,.2)' }} /> : <div style={{ width: 180, height: 220, borderRadius: 8, background: '#eef3f7' }} />}
                <div className="stack"><b>Your own picture is attached</b><button type="button" className="btn sm danger" disabled={busy} onClick={removeOwn}>Remove it</button></div>
              </div>
            )}
            <label className="check"><input type="checkbox" checked={g.on} onChange={(e) => setG({ ...g, own: false, on: e.target.checked, headline: g.headline || text.split('\n')[0].replace(/[#@]\S+/g, '').slice(0, 60).trim() })} /><b>🎨 Add a TopMop graphic</b> <span className="small muted">— a branded picture with the headline, posted with the text</span></label>
            {g.on && (
              <div className="stack" style={{ marginTop: 10 }}>
                <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start', gap: 14 }}>
                  <canvas ref={cv} style={{ width: 300, height: 'auto', aspectRatio: '4 / 5', borderRadius: 10, background: '#eaf6f8', boxShadow: '0 2px 10px rgba(0,0,0,.2)' }} />
                  <div className="form-grid" style={{ flex: 1, minWidth: 240 }}>
                    <Field label="Headline" className="full"><input value={g.headline} maxLength={70} onChange={(e) => setG({ ...g, headline: e.target.value })} /></Field>
                    <Field label="Line under it" className="full"><input value={g.sub} maxLength={110} onChange={(e) => setG({ ...g, sub: e.target.value })} /></Field>
                    <Field label="Short points (one per line, up to 3)" className="full"><textarea rows={3} value={g.points.join('\n')} onChange={(e) => setG({ ...g, points: e.target.value.split('\n').slice(0, 3) })} /></Field>
                    <Field label="Look"><select value={g.style} onChange={(e) => setG({ ...g, style: e.target.value as GraphicStyle })}>{(Object.keys(STYLE_LABEL) as GraphicStyle[]).map((k) => <option key={k} value={k}>{STYLE_LABEL[k]}</option>)}</select></Field>
                    <div style={{ alignSelf: 'flex-end' }}><button type="button" className="btn sm" onClick={downloadGraphic}>Download picture</button></div>
                    <details className="full" style={{ gridColumn: '1 / -1' }}>
                      <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Poster details (ribbon, places, banner, steps, dates)</summary>
                      <div className="form-grid" style={{ marginTop: 8 }}>
                        <Field label="Label (e.g. Professional)"><input value={pst.kicker} maxLength={28} onChange={(e) => setP({ kicker: e.target.value })} /></Field>
                        <Field label="Under the service name"><input value={pst.subtitle} maxLength={34} onChange={(e) => setP({ subtitle: e.target.value })} placeholder="Exterior & interior" /></Field>
                        <Field label="Place (tag on the photo)"><input value={pst.location} maxLength={30} onChange={(e) => setP({ location: e.target.value })} placeholder="Ayala Westgrove" /></Field>
                        <Field label="Place, second line"><input value={pst.location_sub} maxLength={30} onChange={(e) => setP({ location_sub: e.target.value })} placeholder="Silang, Cavite" /></Field>
                        <Field label="Ribbon (offer)"><input value={pst.badge} maxLength={24} onChange={(e) => setP({ badge: e.target.value })} placeholder="FREE" /></Field>
                        <Field label="Under the ribbon" className="full"><input value={pst.badge_sub} maxLength={36} onChange={(e) => setP({ badge_sub: e.target.value })} placeholder="Ocular visit & quotation" /></Field>
                        <Field label="Places (comma separated)" className="full"><input value={pst.areas.join(', ')} onChange={(e) => setP({ areas: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4) })} /></Field>
                        <Field label="Dark banner"><input value={pst.urgency} maxLength={34} onChange={(e) => setP({ urgency: e.target.value })} placeholder="Limited slots only!" /></Field>
                        <Field label="Banner second line"><input value={pst.urgency_sub} maxLength={30} onChange={(e) => setP({ urgency_sub: e.target.value })} placeholder="Reserve your slot now!" /></Field>
                        {[0, 1, 2].map((i) => (
                          <Field key={i} label={`Step / tip ${i + 1}`} className="full"><div className="row" style={{ gap: 6 }}>
                            <select value={pst.features[i]?.icon ?? 'check'} onChange={(e) => setFeat(i, { icon: e.target.value as IconName })}>{ICONS.map((k) => <option key={k} value={k}>{ICON_LABEL[k]}</option>)}</select>
                            <input style={{ flex: 1 }} value={pst.features[i]?.label ?? ''} maxLength={34} onChange={(e) => setFeat(i, { label: e.target.value })} />
                          </div></Field>
                        ))}
                        {[0, 1].map((i) => (
                          <Field key={i} label={`Info card ${i + 1} (label / value)`} className="full"><div className="row" style={{ gap: 6 }}>
                            <input style={{ flex: 1 }} value={pst.cards[i]?.label ?? ''} maxLength={26} onChange={(e) => setCard(i, { label: e.target.value })} placeholder="Open for bookings" />
                            <input style={{ flex: 1 }} value={pst.cards[i]?.value ?? ''} maxLength={22} onChange={(e) => setCard(i, { value: e.target.value })} placeholder="Mon to Sat" />
                          </div></Field>
                        ))}
                        <Field label="Small note" className="full"><input value={pst.note} maxLength={110} onChange={(e) => setP({ note: e.target.value })} /></Field>
                      </div>
                    </details>
                  </div>
                </div>
                <div className="small muted">The graphic is saved when you press Save, Approve or Post now.</div>
              </div>
            )}
          </div>
        )}
        {review && (
          <Modal size="xl" title="Review the post before it goes out" onClose={() => setReview(null)} footer={<>
            <button className="btn" onClick={() => setReview(null)}>{review === 'look' ? 'Close' : 'Back to editing'}</button>
            {review === 'approve' && <button className="btn primary" disabled={busy || loadingShots} onClick={async () => { setReview(null); await approve(); }}>Looks good — Approve</button>}
            {review === 'post' && <button className="btn navy" disabled={busy || loadingShots} onClick={async () => { setReview(null); await postNow(); }}>Looks good — Post now</button>}
          </>}>
            <div className="stack" style={{ gap: 14 }}>
              {loadingShots && <div className="muted">Loading the full-size picture…</div>}
              {shots.map((u, i) => <img key={i} src={u} alt={`Picture ${i + 1}`} style={{ width: '100%', maxWidth: 760, height: 'auto', alignSelf: 'center', borderRadius: 10, boxShadow: '0 2px 12px rgba(0,0,0,.25)' }} />)}
              {!loadingShots && !shots.length && <div className="alert">No picture on this post — it will be posted as text only.</div>}
              <div className="card" style={{ padding: 12, whiteSpace: 'pre-wrap' }}>{text}</div>
              <div className="small muted">Scheduled for {fmtStamp(fromLocal(at))}</div>
            </div>
          </Modal>
        )}
        {p.error && <div className="alert warn">Could not post: {p.error}</div>}
        {editable ? (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Field label="Post on (Manila time)"><input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignSelf: 'flex-end' }}>
              {dirty && <button className="btn" disabled={busy} onClick={save}>Save</button>}
              {p.status !== 'Approved' && <button className="btn primary" disabled={busy || !text.trim()} onClick={() => openReview('approve')}>Review &amp; approve</button>}
              <button className="btn" disabled={busy} onClick={() => openReview('look')}>🔍 Preview</button>
              {p.status === 'Approved' && <button className="btn" disabled={busy} onClick={() => patch({ status: 'Idea' }, 'Moved back to needs approval')}>Unapprove</button>}
              <button className="btn navy" disabled={busy || !text.trim()} onClick={() => openReview('post')}>Post now</button>
              <button className="btn" onClick={copy}>Copy text</button>
              <button className="btn danger" disabled={busy} onClick={() => { if (confirm('Reject this post? It will not be published.')) patch({ status: 'Rejected' }, 'Rejected'); }}>Reject</button>
            </div>
          </div>
        ) : <div className="small muted">{p.status === 'Posted' ? `Posted ${p.posted_at ? fmtStamp(p.posted_at) : ''}` : `Was scheduled for ${fmtStamp(p.scheduled_at)}`}</div>}
        {editable && <div className="small muted">Scheduled for {fmtStamp(fromLocal(at))}</div>}
      </div>
    </Card>
  );
}

function NewPost({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState('Tip'); const [text, setText] = useState(''); const [at, setAt] = useState(toLocal(new Date(Date.now() + 86400_000).toISOString())); const [busy, setBusy] = useState(false); const [pic, setPic] = useState<File | null>(null); const [preview, setPreview] = useState('');
  useEffect(() => { if (!pic) { setPreview(''); return; } const u = URL.createObjectURL(pic); setPreview(u); return () => URL.revokeObjectURL(u); }, [pic]);
  const save = async () => {
    setBusy(true);
    const id = crypto.randomUUID(); const row: Record<string, unknown> = { id, kind, text: text.trim(), scheduled_at: fromLocal(at), status: 'Idea', by_ai: false };
    try {
      if (pic) {
        if (!pic.type.startsWith('image/')) throw new Error('Choose a picture (JPG or PNG).');
        const { blob, ext } = await ownImageBlob(pic); const path = `${id}/own-${Date.now()}.${ext}`;
        const up = await supabase().storage.from('marketing-graphics').upload(path, blob, { contentType: blob.type }); if (up.error) throw new Error(up.error.message);
        row.image_path = path; row.graphic = { ...BLANK, own: true };
      }
    } catch (e) { setBusy(false); toast(e instanceof Error ? e.message : 'Could not upload the picture', 'err'); return; }
    const { error } = await supabase().from('marketing_posts').insert(row);
    setBusy(false); if (error) { toast(error.message, 'err'); return; } toast('Post added — approve it when it is ready', 'ok'); onSaved(); onClose();
  };
  return (
    <Modal title="New post" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !text.trim()} onClick={save}>Add post</button></>}>
      <div className="form-grid">
        <Field label="Type"><select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Post on (Manila time)"><input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label="Text" className="full"><textarea rows={7} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Write the post, or leave it to the AI with “Write 3 ideas now”." /></Field>
        <Field label="Your own picture / flyer (optional)" className="full">
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <input type="file" accept="image/*" onChange={(e) => setPic(e.target.files?.[0] ?? null)} />
            {preview && <img src={preview} alt="Your picture" style={{ width: 120, height: 'auto', borderRadius: 8 }} />}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
