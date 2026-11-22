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
import { afterFiling, alreadyElsewhere, chunk, clickSelect, keepVisible, matchesFilters } from '@/lib/photoselect';

type Kind = 'Before' | 'After' | 'During' | 'Site' | 'Other';
const KINDS: Kind[] = ['Before', 'After', 'During', 'Site', 'Other'];
interface Photo { id: string; job_id: string | null; client_id: string | null; path: string; thumb_path: string | null; kind: Kind; caption: string; tags: string[]; taken_at: string; client_ok: boolean; uploaded_by: string | null; created_at: string; source?: 'app' | 'telegram'; sent_by_employee_id?: string | null; media?: 'photo' | 'video' }
const PAGE = 48;
/** Demo mode only: sample photos (drawn pictures, nothing stored) so the selecting and filing can be tried. */
const demoImg = (label: string, hue: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="hsl(${hue},45%,38%)"/><rect x="40" y="60" width="220" height="180" rx="10" fill="hsl(${hue},40%,55%)"/><text x="150" y="165" font-family="sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="#fff">${label}</text></svg>`)}`;
const makeDemo = (otherJob: string | null): Photo[] => Array.from({ length: 14 }, (_, i) => ({ id: `demo-${i + 1}`, job_id: i >= 10 ? otherJob : null, client_id: null, path: `demo/${i + 1}.jpg`, thumb_path: `demo/${i + 1}_t.jpg`, kind: (['Other', 'Other', 'Before', 'After', 'During'] as Kind[])[i % 5], caption: '', tags: [], taken_at: new Date().toISOString(), client_ok: i === 3, uploaded_by: null, created_at: new Date(Date.now() - i * 60000).toISOString(), source: i % 4 === 3 ? 'app' : 'telegram', sent_by_employee_id: null, media: i === 6 ? 'video' : 'photo' }) as Photo);
const demoUrls = (): Record<string, string> => Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`demo/${i + 1}_t.jpg`, demoImg(`#${i + 1}`, (i * 47) % 360)]));

export default function PhotoLibrary() {
  const { db, can, user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState<Photo[]>(() => (CLOUD ? [] : makeDemo(db.jobs.find((j) => !j.deleted_at)?.id ?? null))); const [urls, setUrls] = useState<Record<string, string>>(() => (CLOUD ? {} : demoUrls()));
  const [sel, setSel] = useState<Set<string>>(new Set()); const lastClick = useRef(-1); const [bulkJob, setBulkJob] = useState(sp.get('job') ?? ''); const [filing, setFiling] = useState(false);
  const [more, setMore] = useState(false); const [loading, setLoading] = useState(false);
  const [job, setJob] = useState(sp.get('job') ?? ''); const [kind, setKind] = useState(''); const [okOnly, setOkOnly] = useState(false); const [unsorted, setUnsorted] = useState(false); const [src, setSrc] = useState(''); const [q, setQ] = useState('');
  const [up, setUp] = useState<{ job: string; kind: Kind; ok: boolean; caption: string; tags: string }>({ job: sp.get('job') ?? '', kind: 'After', ok: false, caption: '', tags: '' });
  const [busy, setBusy] = useState<string>(); const [open, setOpen] = useState<Photo>();
  const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null);
  const manage = can('photos.manage');

  const jobs = useMemo(() => db.jobs.filter((j) => !j.deleted_at).sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 400), [db.jobs]);
  const jobLabel = useCallback((id: string | null) => { const j = db.jobs.find((x) => x.id === id); return j ? `${j.number} · ${db.clients.find((c) => c.id === j.client_id)?.name ?? ''}` : 'No job'; }, [db]);

  const sign = useCallback(async (list: Photo[]) => {
    const paths = list.filter((p) => p.media !== 'video').flatMap((p) => [p.thumb_path ?? p.path]).filter(Boolean) as string[];
    if (!paths.length) return;
    const { data } = await supabase().storage.from('job-photos').createSignedUrls(paths, 3600);
    setUrls((u) => { const n = { ...u }; for (const d of data ?? []) if (d.path && d.signedUrl) n[d.path] = d.signedUrl; return n; });
  }, []);
  const load = useCallback(async (from: number, reset: boolean) => {
    setLoading(true);
    let qy = supabase().from('job_photos').select('*').is('deleted_at', null).order('created_at', { ascending: false }).range(from, from + PAGE - 1);
    if (unsorted) qy = qy.is('job_id', null); else if (job) qy = qy.eq('job_id', job); if (src) qy = qy.eq('source', src); if (kind) qy = qy.eq('kind', kind); if (okOnly) qy = qy.eq('client_ok', true);
    if (q.trim()) { const t = q.trim().replace(/[%,()]/g, ' '); qy = qy.or(`caption.ilike.%${t}%,tags.cs.{${t.toLowerCase()}}`); }
    const { data } = await qy; const list = (data ?? []) as Photo[];
    setRows((r) => (reset ? list : [...r, ...list])); setMore(list.length === PAGE); setLoading(false); sign(list);
  }, [job, kind, okOnly, unsorted, src, q, sign]);
  useEffect(() => { if (!CLOUD) return; const t = setTimeout(() => load(0, true), 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { const n = new URLSearchParams(sp); if (job) n.set('job', job); else n.delete('job'); setSp(n, { replace: true }); }, [job]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters = useMemo(() => ({ job, unsorted, kind, src, okOnly }), [job, unsorted, kind, src, okOnly]);
  const shown = useMemo(() => (CLOUD ? rows : rows.filter((p) => matchesFilters(p, filters) && (!q.trim() || p.caption.toLowerCase().includes(q.trim().toLowerCase())))), [rows, filters, q]);   // live: the database filters; demo: the screen does
  useEffect(() => { setSel(new Set()); lastClick.current = -1; }, [filters, q]);                                                       // a new view starts with nothing selected
  useEffect(() => { setSel((s) => keepVisible(s, shown.map((p) => p.id))); }, [shown]);                                              // only photos still on screen stay selected
  useEffect(() => { if (job) setBulkJob(job); }, [job]);
  const tick = (i: number, shift: boolean) => { const last = lastClick.current; setSel((s) => clickSelect(s, shown.map((p) => p.id), i, last, shift)); lastClick.current = i; };   // `last` is read NOW: the update runs later, after lastClick has moved on
  /** File every selected photo to the chosen job (the office only; the database function checks it again). */
  const fileSelected = () => {
    if (!bulkJob) { toast('Choose the job first', 'err'); return; }
    const ids = [...sel]; if (!ids.length) return;
    const moved = alreadyElsewhere(shown, sel, bulkJob);
    if (moved && !confirm(`${moved} of the selected photo${moved === 1 ? ' is' : 's are'} already filed to another job. Move ${moved === 1 ? 'it' : 'them'} to ${jobLabel(bulkJob)}?`)) return;
    setFiling(true);
    attempt(async () => {
      try {
        if (CLOUD) for (const part of chunk(ids, 200)) { const { error } = await supabase().rpc('assign_photos', { p_ids: part, p_job: bulkJob }); if (error) throw new Error(error.message); }
        const cid = db.jobs.find((j) => j.id === bulkJob)?.client_id ?? null; const chosen = new Set(ids);
        // live: the list is the current filtered page, so photos that no longer match leave it; demo: the list is everything and the screen filters it
        setRows((r) => afterFiling(r, chosen, bulkJob, cid, CLOUD ? filters : { job: '', unsorted: false, kind: '', src: '', okOnly: false }));
        setSel(new Set()); lastClick.current = -1;
      } catch (e) { if (CLOUD) void load(0, true); throw e; }   // a block may already have been filed: show what is really there
      finally { setFiling(false); }
    }, `${ids.length} photo${ids.length === 1 ? '' : 's'} filed to ${jobLabel(bulkJob)}`);
  };

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
      {!CLOUD && <div className="alert info">Demo: these are sample pictures so you can try selecting photos and filing them to a job. Nothing is stored. On the live system the library shows your real photos.</div>}
      {(
        <>
          {CLOUD && <Card title="Add photos">
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
          </Card>}
          <Card title="Photos" actions={<div className="row" style={{ gap: 8 }}>{manage && shown.length > 0 && <button className="btn sm" onClick={() => { setSel(new Set(shown.map((p) => p.id))); lastClick.current = -1; }}>Select all {shown.length} shown</button>}<span className="small muted">{shown.length}{more ? '+' : ''} shown</span></div>}>
            <div className="filterbar" style={{ marginTop: 0 }}>
              <Field label="Job"><select value={job} onChange={(e) => setJob(e.target.value)}><option value="">All jobs</option>{jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j.id)}</option>)}</select></Field>
              <Field label="Type"><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All</option>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
              <Field label="Search caption or tag"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
              <Field label="Came from"><select value={src} onChange={(e) => setSrc(e.target.value)}><option value="">Anywhere</option><option value="telegram">Telegram</option><option value="app">The app</option></select></Field>
              <label className="check"><input type="checkbox" checked={unsorted} onChange={(e) => setUnsorted(e.target.checked)} />Unsorted (no job yet)</label>
              <label className="check"><input type="checkbox" checked={okOnly} onChange={(e) => setOkOnly(e.target.checked)} />Client agreed (marketing)</label>
            </div>
            {manage && <div className="small muted" style={{ marginTop: 8 }}>To add photos to a job: tick the box on each photo (hold Shift to tick a whole row of them), choose the job, then press <b>Add to this job</b>. Tap a photo itself to open it.</div>}
            <div className="photogrid">
              {shown.map((p, i) => (
                <div key={p.id} className={`pcwrap${sel.has(p.id) ? ' on' : ''}`}>
                  <button type="button" className="photocell" onClick={() => (CLOUD ? setOpen(p) : toast('Demo: on the live system this opens the photo.', 'ok'))} title={p.caption || jobLabel(p.job_id)}>
                    {p.media === 'video' ? <span style={{ fontSize: 34 }} aria-label="Video">🎬</span> : urls[p.thumb_path ?? p.path] ? <img src={urls[p.thumb_path ?? p.path]} alt={p.caption || p.kind} loading="lazy" /> : <span className="muted small">Loading…</span>}
                    <span className="pk">{p.kind}{p.source === 'telegram' ? ' · TG' : ''}</span>{p.client_ok && <span className="pok" title="Client agreed to marketing use">✓</span>}
                  </button>
                  {manage && <input type="checkbox" className="pcsel" checked={sel.has(p.id)} aria-label={`Select this ${p.media === 'video' ? 'video' : 'photo'}`} onChange={() => { /* handled in onClick (it knows about Shift) */ }} onClick={(e) => tick(i, e.shiftKey)} />}
                </div>
              ))}
            </div>
            {!shown.length && !loading && <div className="muted">No photos here{CLOUD ? ' yet. Add the first ones above.' : '.'}</div>}
            {manage && sel.size > 0 && (
              <div className="bulkbar" role="region" aria-label="Selected photos">
                <b>{sel.size} selected</b>
                <select value={bulkJob} onChange={(e) => setBulkJob(e.target.value)} aria-label="File the selected photos to this job"><option value="">Choose the job…</option>{jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j.id)}</option>)}</select>
                <button className="btn primary" disabled={!bulkJob || filing} onClick={fileSelected}>{filing ? 'Filing…' : 'Add to this job'}</button>
                <button className="btn" disabled={filing} onClick={() => { setSel(new Set()); lastClick.current = -1; }}>Clear</button>
              </div>
            )}
            {more && <div style={{ textAlign: 'center', marginTop: 12 }}><button className="btn" disabled={loading} onClick={() => load(rows.length, false)}>{loading ? 'Loading…' : 'Load more'}</button></div>}
          </Card>
        </>
      )}
      {open && <PhotoModal p={open} jobs={jobs} jobLabel={jobLabel} sender={db.employees.find((e) => e.id === open.sent_by_employee_id)?.full_name} label={jobLabel(open.job_id)} canEdit={manage || open.uploaded_by === user?.id} onClose={() => setOpen(undefined)} onChanged={(np) => { setRows((r) => (np ? r.map((x) => (x.id === np.id ? np : x)) : r.filter((x) => x.id !== open.id))); if (!np) setOpen(undefined); else setOpen(np); }} />}
    </>
  );
}

function PhotoModal({ p, label, jobs, jobLabel, sender, canEdit, onClose, onChanged }: { p: Photo; label: string; jobs: { id: string; start_at: string }[]; jobLabel: (id: string | null) => string; sender?: string; canEdit: boolean; onClose: () => void; onChanged: (p: Photo | null) => void }) {
  const [url, setUrl] = useState<string>();
  const [f, setF] = useState({ kind: p.kind, caption: p.caption, tags: p.tags.join(', '), ok: p.client_ok });
  useEffect(() => { supabase().storage.from('job-photos').createSignedUrl(p.path, 3600).then(({ data }) => setUrl(data?.signedUrl)); }, [p.path]);
  const save = () => attempt(async () => {
    const patch = { kind: f.kind, caption: f.caption.trim().slice(0, 200), tags: f.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean), client_ok: f.ok };
    const { error } = await supabase().from('job_photos').update(patch).eq('id', p.id); if (error) throw new Error(error.message);
    onChanged({ ...p, ...patch });
  }, 'Saved');
  const [target, setTarget] = useState('');
  const { can } = useAuth();
  const move = () => { if (!target) return; attempt(async () => { const { error } = await supabase().rpc('assign_photos', { p_ids: [p.id], p_job: target }); if (error) throw new Error(error.message); onChanged({ ...p, job_id: target }); }, 'Filed to the job'); };
  const del = () => { if (!confirm('Delete this photo?')) return; attempt(async () => { const { error } = await supabase().from('job_photos').update({ deleted_at: new Date().toISOString() }).eq('id', p.id); if (error) throw new Error(error.message); onChanged(null); }, 'Photo deleted'); };
  return (
    <Modal title={<>{p.kind} <Badge tone="gray">{label}</Badge></>} size="wide" onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="stack">
        {url && p.media === 'video' ? <video src={url} controls playsInline style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 8, justifySelf: 'center' }} /> : url ? <img src={url} alt={p.caption || p.kind} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8, justifySelf: 'center' }} /> : <div className="muted">Loading…</div>}
        <div className="small muted">Added {fmtDate(p.created_at.slice(0, 10))}{p.source === 'telegram' ? ` · sent on Telegram${sender ? ` by ${sender}` : ''}` : ''}</div>
        {can('photos.manage') && <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="File to job"><option value="">{p.job_id ? 'Move to another job…' : 'File to a job…'}</option>{jobs.map((j) => <option key={j.id} value={j.id}>{jobLabel(j.id)} · {fmtDate(j.start_at.slice(0, 10))}</option>)}</select><button className="btn" disabled={!target} onClick={move}>File</button></div>}
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
