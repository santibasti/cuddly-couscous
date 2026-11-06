// A client's photos and videos (from the app and from Telegram), newest first, shown on the client page.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, Card } from '@/components/ui';
import { CLOUD, supabase } from '@/lib/cloud';
import { fmtDate } from '@/lib/util';

interface P { id: string; job_id: string | null; path: string; thumb_path: string | null; kind: string; caption: string; media: string | null; source: string | null; sent_by_employee_id: string | null; created_at: string }

export function ClientPhotos({ clientId }: { clientId: string }) {
  const { db, can } = useAuth();
  const [rows, setRows] = useState<P[]>([]); const [urls, setUrls] = useState<Record<string, string>>({}); const [open, setOpen] = useState<P>(); const [big, setBig] = useState<string>(); const [loading, setLoading] = useState(true); const [more, setMore] = useState(false); const [limit, setLimit] = useState(48);
  useEffect(() => {
    if (!CLOUD) { setLoading(false); return; }
    let live = true; setLoading(true);
    void (async () => {
      const { data } = await supabase().from('job_photos').select('id, job_id, path, thumb_path, kind, caption, media, source, sent_by_employee_id, created_at').eq('client_id', clientId).is('deleted_at', null).order('created_at', { ascending: false }).limit(limit + 1);
      if (!live) return; const list = (data ?? []) as P[]; setMore(list.length > limit); const show = list.slice(0, limit); setRows(show); setLoading(false);
      const paths = show.filter((p) => p.media !== 'video').map((p) => p.thumb_path ?? p.path);
      if (paths.length) { const s = await supabase().storage.from('job-photos').createSignedUrls(paths, 3600); if (live) setUrls(Object.fromEntries((s.data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl as string]))); }
    })();
    return () => { live = false; };
  }, [clientId, limit]);
  useEffect(() => { setBig(undefined); if (!open) return; void supabase().storage.from('job-photos').createSignedUrl(open.path, 3600).then(({ data }) => setBig(data?.signedUrl)); }, [open]);
  if (!CLOUD) return <Card title="Photos"><div className="muted">Photos are stored on the live system only.</div></Card>;
  const jobNo = (id: string | null) => db.jobs.find((j) => j.id === id)?.number ?? '';
  return (
    <Card title="Photos & videos" actions={can('photos.manage') || can('jobs.mine') ? <Link className="btn sm" to="/photos">Photo Library</Link> : undefined}>
      {!rows.length && <div className="muted">{loading ? 'Loading…' : 'No photos for this client yet. Photos sent on Telegram or added to a job appear here.'}</div>}
      <div className="photogrid">
        {rows.map((p) => (
          <button key={p.id} type="button" className="photocell" onClick={() => setOpen(p)} title={`${jobNo(p.job_id)} ${p.caption}`.trim()}>
            {p.media === 'video' ? <span style={{ fontSize: 34 }} aria-label="Video">🎬</span> : urls[p.thumb_path ?? p.path] ? <img src={urls[p.thumb_path ?? p.path]} alt={p.caption || p.kind} loading="lazy" /> : <span className="muted small">…</span>}
            <span className="pk">{p.kind}{jobNo(p.job_id) ? ` · ${jobNo(p.job_id)}` : ''}</span>
          </button>
        ))}
      </div>
      {more && <div style={{ textAlign: 'center', marginTop: 10 }}><button className="btn" onClick={() => setLimit(limit + 48)}>Show more</button></div>}
      {open && (
        <div role="dialog" aria-modal="true" onClick={() => setOpen(undefined)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 80, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: '100%', display: 'grid', gap: 8, justifyItems: 'center' }}>
            {big ? (open.media === 'video' ? <video src={big} controls playsInline style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8 }} /> : <img src={big} alt={open.caption || open.kind} style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }} />) : <span style={{ color: '#fff' }}>Loading…</span>}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', color: '#fff' }}>
              <Badge tone="gray">{open.kind}</Badge><span className="small">{jobNo(open.job_id)} · {fmtDate(open.created_at.slice(0, 10))}{open.source === 'telegram' ? ` · Telegram${db.employees.find((e) => e.id === open.sent_by_employee_id) ? ` · ${db.employees.find((e) => e.id === open.sent_by_employee_id)!.full_name}` : ''}` : ''}</span>
              {big && <a className="btn sm" href={big} download target="_blank" rel="noreferrer">Download</a>}
              <button className="btn sm" onClick={() => setOpen(undefined)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
