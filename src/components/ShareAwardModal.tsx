// "Share my award": the person being recognised can post a picture card to their own social media. Optional, and they decide everything.
import { useEffect, useState } from 'react';
import { Modal, toast } from '@/components/ui';
import { KINDS, type Announcement } from '@/lib/announcements';
import { defaultCaption, makeShareCard, saveCard, shareCard } from '@/lib/sharecard';
import type { Employee } from '@/lib/types';

const first = (n: string) => n.replace(/^(Mr|Ms|Mrs)\.?\s+/i, '').split(' ')[0];
export function ShareAwardModal({ a, emp, onClose }: { a: Announcement; emp: Employee; onClose: () => void }) {
  const k = KINDS[a.kind];
  const [blob, setBlob] = useState<Blob | null>(null); const [url, setUrl] = useState(''); const [caption, setCaption] = useState(defaultCaption(a.title, a.body)); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let off = false; let u = '';
    makeShareCard({ name: first(emp.full_name), title: a.title, kicker: a.kind === 'Award' ? 'Congratulations' : a.kind === 'Reward' ? 'Well deserved' : 'Thank you', icon: k.icon, message: a.body, photo: emp.avatar ?? null })
      .then((b) => { if (off) return; u = URL.createObjectURL(b); setBlob(b); setUrl(u); }).catch(() => toast('Could not make the picture', 'err'));
    return () => { off = true; if (u) URL.revokeObjectURL(u); };
  }, [a.id, emp.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const share = async () => {
    if (!blob) return; setBusy(true);
    try { const r = await shareCard(blob, caption); if (r === 'shared') onClose(); else if (r === 'saved') toast('Picture saved and caption copied — post it from your gallery', 'ok'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Share my award" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Not now</button><button className="btn" disabled={!blob} onClick={() => blob && saveCard(blob)}>Save picture</button><button className="btn primary" disabled={!blob || busy} onClick={() => void share()}>📲 Share…</button></>}>
      <div className="stack">
        <div className="small muted">This is your choice — nothing is posted unless you share it. The picture does not show the reward amount or any client details.</div>
        {url ? <img src={url} alt="Your award card" style={{ width: '100%', maxWidth: 340, margin: '0 auto', borderRadius: 14, display: 'block', boxShadow: '0 8px 30px rgba(0,0,0,.35)' }} /> : <div className="muted">Making your card…</div>}
        <label className="small muted">Caption (change it as you like)<textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} style={{ width: '100%' }} /></label>
      </div>
    </Modal>
  );
}
