// Photos and videos of an ocular visit, sent from Telegram by the estimator (or added by the office), shown on the visit.
import { useEffect, useState } from 'react';
import { CLOUD, supabase } from '@/lib/cloud';
import { fmtDateTime } from '@/lib/util';
import { toast } from '@/components/ui';

interface P { id: string; path: string; thumb_path: string | null; caption: string; media: string | null; created_at: string; sent_by_employee_id: string | null }

export function OcularPhotos({ visitId, number, sender }: { visitId: string; number: string; sender: (id: string | null) => string }) {
  const [rows, setRows] = useState<P[]>([]); const [urls, setUrls] = useState<Record<string, string>>({}); const [big, setBig] = useState<{ p: P; url: string }>();
  useEffect(() => {
    if (!CLOUD) return; let live = true;
    const load = async () => {
      const { data } = await supabase().from('job_photos').select('id, path, thumb_path, caption, media, created_at, sent_by_employee_id').eq('ocular_id', visitId).is('deleted_at', null).order('created_at', { ascending: false }).limit(60);
      if (!live) return; const list = (data ?? []) as P[]; setRows(list);
      const paths = list.filter((p) => p.media !== 'video').map((p) => p.thumb_path ?? p.path);
      if (paths.length) { const s = await supabase().storage.from('job-photos').createSignedUrls(paths, 3600); if (live) setUrls(Object.fromEntries((s.data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl as string]))); }
    };
    void load(); const i = setInterval(load, 30_000);
    return () => { live = false; clearInterval(i); };
  }, [visitId]);
  const open = async (p: P) => { const { data } = await supabase().storage.from('job-photos').createSignedUrl(p.path, 3600); if (data?.signedUrl) setBig({ p, url: data.signedUrl }); };
  const copy = async () => { try { await navigator.clipboard.writeText(`/ocular ${number}`); toast('Copied — send it to the Telegram bot, then send the photos', 'info'); } catch { window.prompt('Send this to the Telegram bot', `/ocular ${number}`); } };
  return (
    <div className="card" style={{ padding: 12 }}>
      <b>Photos from the site</b>
      <div className="small muted" style={{ margin: '4px 0 8px' }}>
        Send them on Telegram with <b>{number}</b> in the caption, or send <button type="button" className="btn sm" onClick={copy}>/ocular {number}</button> first and then the photos. They appear here by themselves{CLOUD ? '' : ' on the live system'}.
      </div>
      {CLOUD && !rows.length && <div className="muted small">No photos yet.</div>}
      <div className="photogrid">
        {rows.map((p) => (
          <button key={p.id} type="button" className="photocell" onClick={() => void open(p)} title={`${sender(p.sent_by_employee_id)} · ${fmtDateTime(p.created_at)} ${p.caption}`.trim()}>
            {p.media === 'video' ? <span style={{ fontSize: 34 }} aria-label="Video">🎬</span> : urls[p.thumb_path ?? p.path] ? <img src={urls[p.thumb_path ?? p.path]} alt={p.caption || 'Ocular photo'} loading="lazy" /> : <span className="muted small">…</span>}
          </button>
        ))}
      </div>
      {big && (
        <div role="dialog" aria-modal="true" onClick={() => setBig(undefined)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 90, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: '100%', display: 'grid', gap: 8, justifyItems: 'center' }}>
            {big.p.media === 'video' ? <video src={big.url} controls playsInline style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8 }} /> : <img src={big.url} alt="" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }} />}
            <div className="row" style={{ gap: 8, color: '#fff' }}><span className="small">{sender(big.p.sent_by_employee_id)} · {fmtDateTime(big.p.created_at)}</span><a className="btn sm" href={big.url} download target="_blank" rel="noreferrer">Download</a><button className="btn sm" onClick={() => setBig(undefined)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
