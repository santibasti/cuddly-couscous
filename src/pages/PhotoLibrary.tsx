// Photo library: every job photo in one place (instead of a chat group), filtered by job, client, type or tag.
// Files live in the private Storage bucket 'job-photos'; the phone's location data is removed when a photo is added.
import { EnhanceToggle } from '@/components/EnhanceToggle';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Modal, PageHead, attempt, toast } from '@/components/ui';
import { CLOUD, supabase } from '@/lib/cloud';
import { fmtDate } from '@/lib/util';
import { prepare } from '@/lib/photos';

type Kind = 'Before' | 'After' | 'During' | 'Site' | 'Other';
const KINDS: Kind[] = ['Before', 'After', 'During', 'Site', 'Other'];
interface Photo { id: string; job_id: string | null; client_id: string | null; path: string; thumb_path: string | null; kind: Kind; caption: string; tags: string[]; taken_at: string; client_ok: boolean; uploaded_by: string | null; created_at: string }
const PAGE = 48;

export default function PhotoLibrary() {
  const { db, can, user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState<Photo[]>([]); const [urls, setUrls] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false); const [loading, setLoading] = useState(false);
  const [job, setJob] = useState(sp.get('job') ?? ''); const [kind, setKind] = useState(''); const [okOnly, setOkOnly] = useState(false); const [q, setQ] = useState('');
  const [up, setUp] = useState<{ job: string; kind: Kind; ok: boolean; caption: string; tags: string }>({ job: sp.get('job') ?? '', kind: 'After', ok: false, caption: '', tags: '' });
  const [busy, setBusy] = useState<string>(); const [open, setOpen] = useState<Photo>();
  const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null);
  const manage = can('photos.manage');

  const jobs = useMemo(() => db.jobs.filter((j) => !j.deleted_at).sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 400), [db.jobs]);
  const jobLabel = useCallback((id: string | null) => { const j = db.jobs.find((x) => x.id === id); return j ? `${j.number} · ${db.clients.find((c) => c.id === j.client_id)?.name ?? ''}` : 'No job'; }, [db]);

  const sign = useCallback(async (list: Photo[]) => {
    const paths = list.flatMap((p) => [p.thumb_path ?? p.path]).filter(Boolean) as string[];
    if (!paths.length) return;
    const { data } = await supabase().storage.from('job-photos').createSignedUrls(paths, 3600);
    setUrls((u) => { const n = { ...u }; for (const d of data ?? []) if (d.path && d.signedUrl) n[d.path] = d.signedUrl; return n; });
  }, []);
  const load = useCallback(async (from: number, reset: boolean) => {
    setLoading(true);
    let qy = supabase().from('job_photos').select('*').is('deleted_at', null).order('created_at', { ascending: false }).range(from, from + PAGE - 1);
    if (job) qy = qy.eq('job_id', job); if (kind) qy = qy.eq('kind', kind); if (okOnly) qy = qy.eq('client_ok', true);
    if (q.trim()) { const t = q.trim().replace(/[%,()]/g, ' '); qy = qy.or(`caption.ilike.%${t}%,tags.cs.{${t.toLowerCase()}}`); }
    const { data } = await qy; const list = (data ?? []) as Photo[];
    setRows((r) => (reset ? list : [...r, ...list])); setMore(list.length === PAGE); setLoading(false); sign(list);
  }, [job, kind, okOnly, q, sign]);
  useEffect(() => { if (!CLOUD) return; const t = setTimeout(() => load(0, true), 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { const n = new URLSearchParams(sp); if (job) n.set('job', job); else n.delete('job'); setSp(n, { replace: true }); }, [job]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const j = db.jobs.find((x) => x.id === up.job);
    if (!up.job && !manage) { toast('Choose the job these photos belong to', 'err'); return; }
    const tags = up.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    let done = 0;
    for (const f of Array.from(files)) {
      setBusy(`Uploading ${++done} of ${files.length}…`);
      try {
        const p = await prepare(f); const id = crypto.randomUUID(); const base = `${up.job || 'general'}/${id}`;
        const sb = supabase().storage.from('job-photos');
        const a = await sb.upload(`${base}.jpg`, p.full, { contentType: 'image/jpeg' }); if (a.error) throw new Error(a.error.message);
        const b = await sb.upload(`${base}_t.jpg`, p.thumb, { contentType: 'image/jpeg' }); if (b.error) throw new Error(b.error.message);
        const ins = await supabase().from('job_photos').insert({ id, job_id: up.job || null, client_id: j?.client_id ?? null, path: `${base}.jpg`, thumb_path: `${base}_t.jpg`, kind: up.kind, caption: up.caption.trim().slice(0, 200), tags, width: p.width, height: p.height, client_ok: up.ok });
        if (ins.error) throw new Error(ins.error.message);
      } catch (e) { toast(`${f.name}: ${(e as Error).message}`, 'err'); }
    }
    setBusy(undefined); toast('Photos added'); load(0, true);
  };

  if (!can('photos.manage') && !can('jobs.mine')) return <div className="alert warn">Your role does not have access to the photo library.</div>;
  return (
    <>
      <PageHead icon="📷" title="Photo Library" sub="All job photos in one place — add them from the site, find them by job, type or tag." />
      {!CLOUD && <div className="alert info">The photo library works on the live system (connected to Supabase). Photos are not stored in this demo.</div>}
      {CLOUD && (
        <>
          <Card title="Add photos">
            <div className="form-grid">
              <Field label="Job"><select value={up.job} onChange={(e) => setUp({ ...up, job: e.target.value })}><option value="">— no job (general) —</option>{jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j.id)} · {fmtDate(j.start_at.slice(0, 10))}</option>)}</select></Field>
              <Field label="Type"><div className="chips" role="group">{KINDS.map((k) => <button key={k} type="button" className={up.kind === k ? 'on' : ''} onClick={() => setUp({ ...up, kind: k })}>{k}</button>)}</div></Field>
              <Field label="Caption (optional)"><input value={up.caption} maxLength={200} onChange={(e) => setUp({ ...up, caption: e.target.value })} placeholder="e.g. 3rd floor front, after cleaning" /></Field>
              <Field label="Tags (optional, comma separated)"><input value={up.tags} onChange={(e) => setUp({ ...up, tags: e.target.value })} placeholder="glass, solar, roof" /></Field>
              <label className="check full"><input type="checkbox" checked={up.ok} onChange={(e) => setUp({ ...up, ok: e.target.checked })} />The client agreed that these photos may be used for our marketing (Facebook)</label>
            </div>
            <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              <input ref={cam} type="file" accept="image/*" capture="environment" multiple className="hide" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
              <input ref={gal} type="file" accept="image/*" multiple className="hide" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
              <button className="btn primary" disabled={!!busy} onClick={() => cam.current?.click()}>Take a photo</button>
              <button className="btn" disabled={!!busy} onClick={() => gal.current?.click()}>Choose from gallery</button>
              <EnhanceToggle />
              {busy && <span className="small muted">{busy}</span>}
              <span className="small muted">Photos are resized, and the phone's location data is removed.</span>
            </div>
          </Card>
          <Card title="Photos" actions={<span className="small muted">{rows.length}{more ? '+' : ''} shown</span>}>
            <div className="filterbar" style={{ marginTop: 0 }}>
              <Field label="Job"><select value={job} onChange={(e) => setJob(e.target.value)}><option value="">All jobs</option>{jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j.id)}</option>)}</select></Field>
              <Field label="Type"><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All</option>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
              <Field label="Search caption or tag"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
              <label className="check"><input type="checkbox" checked={okOnly} onChange={(e) => setOkOnly(e.target.checked)} />Client agreed (marketing)</label>
            </div>
            <div className="photogrid">
              {rows.map((p) => (
                <button key={p.id} type="button" className="photocell" onClick={() => setOpen(p)} title={p.caption || jobLabel(p.job_id)}>
                  {urls[p.thumb_path ?? p.path] ? <img src={urls[p.thumb_path ?? p.path]} alt={p.caption || p.kind} loading="lazy" /> : <span className="muted small">Loading…</span>}
                  <span className="pk">{p.kind}</span>{p.client_ok && <span className="pok" title="Client agreed to marketing use">✓</span>}
                </button>
              ))}
            </div>
            {!rows.length && !loading && <div className="muted">No photos yet. Add the first ones above.</div>}
            {more && <div style={{ textAlign: 'center', marginTop: 12 }}><button className="btn" disabled={loading} onClick={() => load(rows.length, false)}>{loading ? 'Loading…' : 'Load more'}</button></div>}
          </Card>
        </>
      )}
      {open && <PhotoModal p={open} label={jobLabel(open.job_id)} canEdit={manage || open.uploaded_by === user?.id} onClose={() => setOpen(undefined)} onChanged={(np) => { setRows((r) => (np ? r.map((x) => (x.id === np.id ? np : x)) : r.filter((x) => x.id !== open.id))); if (!np) setOpen(undefined); else setOpen(np); }} />}
    </>
  );
}

function PhotoModal({ p, label, canEdit, onClose, onChanged }: { p: Photo; label: string; canEdit: boolean; onClose: () => void; onChanged: (p: Photo | null) => void }) {
  const [url, setUrl] = useState<string>();
  const [f, setF] = useState({ kind: p.kind, caption: p.caption, tags: p.tags.join(', '), ok: p.client_ok });
  useEffect(() => { supabase().storage.from('job-photos').createSignedUrl(p.path, 3600).then(({ data }) => setUrl(data?.signedUrl)); }, [p.path]);
  const save = () => attempt(async () => {
    const patch = { kind: f.kind, caption: f.caption.trim().slice(0, 200), tags: f.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean), client_ok: f.ok };
    const { error } = await supabase().from('job_photos').update(patch).eq('id', p.id); if (error) throw new Error(error.message);
    onChanged({ ...p, ...patch });
  }, 'Saved');
  const del = () => { if (!confirm('Delete this photo?')) return; attempt(async () => { const { error } = await supabase().from('job_photos').update({ deleted_at: new Date().toISOString() }).eq('id', p.id); if (error) throw new Error(error.message); onChanged(null); }, 'Photo deleted'); };
  return (
    <Modal title={<>{p.kind} <Badge tone="gray">{label}</Badge></>} size="wide" onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="stack">
        {url ? <img src={url} alt={p.caption || p.kind} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8, justifySelf: 'center' }} /> : <div className="muted">Loading…</div>}
        <div className="small muted">Added {fmtDate(p.created_at.slice(0, 10))}</div>
        <div className="form-grid">
          <Field label="Type"><select disabled={!canEdit} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Tags"><input disabled={!canEdit} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
          <Field label="Caption" className="full"><input disabled={!canEdit} value={f.caption} maxLength={200} onChange={(e) => setF({ ...f, caption: e.target.value })} /></Field>
          <label className="check full"><input type="checkbox" disabled={!canEdit} checked={f.ok} onChange={(e) => setF({ ...f, ok: e.target.checked })} />The client agreed to marketing use</label>
        </div>
        <div className="row">
          {canEdit && <button className="btn primary" onClick={save}>Save</button>}
          {url && <a className="btn" href={url} download target="_blank" rel="noreferrer">Download</a>}
          {canEdit && <button className="btn danger" onClick={del}>Delete</button>}
        </div>
      </div>
    </Modal>
  );
}
