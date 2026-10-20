// Announcements: rewards, awards, recognition and news from TopMop to the crew. The Owner posts; everyone reads, cheers and sees it in their app.
import { useEffect, useMemo, useState } from 'react';
import { useAuth, live } from '@/lib/store';
import { AnnCard } from '@/components/AnnCard';
import { ShareAwardModal } from '@/components/ShareAwardModal';
import { Badge, Card, Field, Modal, PageHead, attempt, toast } from '@/components/ui';
import { KINDS, deleteAnnouncement, markSeen, react, saveAnnouncement, setAnnouncementStatus, useAnnouncements, type AnnInput, type AnnKind, type Announcement, type Audience } from '@/lib/announcements';
import type { Employee } from '@/lib/types';

const SUGGEST: Record<AnnKind, string> = { Award: 'Employee of the Month', Reward: 'Bonus for a job well done', Recognition: 'Thank you for going the extra mile', Announcement: '', Reminder: '' };

export default function Announcements() {
  const { db, can, user } = useAuth();
  const { items, all, mine, stats, loaded } = useAnnouncements();
  const manage = can('announce.manage');
  const list = manage ? all : items;
  const [edit, setEdit] = useState<Announcement | 'new' | null>(null);
  const [share, setShare] = useState<Announcement | null>(null);
  const myEmp = user?.employee_id ? db.employees.find((e) => e.id === user.employee_id) : undefined;
  // opening the page counts as seeing what is on it
  useEffect(() => { if (loaded && items.length) void markSeen(items.map((a) => a.id)); }, [loaded, items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const emps = useMemo(() => new Map(db.employees.map((e) => [e.id, e])), [db.employees]);
  return (
    <>
      <PageHead icon="📣" title="Announcements" sub="Rewards, awards and recognition from TopMop — and news for the whole team.">
        {manage && <button className="btn primary" onClick={() => setEdit('new')}>＋ New announcement</button>}
      </PageHead>
      {!loaded && <div className="muted">Loading…</div>}
      {loaded && !list.length && <Card><div className="muted">{manage ? 'Nothing posted yet. Tap “New announcement” to celebrate someone or share news — it appears in everyone’s app.' : 'No announcements right now. Check back soon!'}</div></Card>}
      <div className="stack">
        {list.map((a) => (
          <AnnCard key={a.id} a={a} emps={emps} meId={user?.employee_id ?? null} myReaction={mine[a.id]?.reaction ?? null} stats={stats[a.id]} manage={manage}
            onShare={myEmp && user?.employee_id && a.awardee_ids.includes(user.employee_id) && a.status === 'Published' ? () => setShare(a) : undefined} onReact={(e) => attempt(() => react(a.id, e), undefined)} onEdit={() => setEdit(a)}
            onStatus={(s) => attempt(() => setAnnouncementStatus(a.id, s), s === 'Published' ? 'Published' : 'Archived')}
            onDelete={() => { if (confirm('Delete this announcement? It disappears from everyone’s app.')) attempt(() => deleteAnnouncement(a.id), 'Deleted'); }} />
        ))}
      </div>
      {share && myEmp && <ShareAwardModal a={share} emp={myEmp} onClose={() => setShare(null)} />}
      {edit && <Compose initial={edit === 'new' ? undefined : edit} emps={live(db.employees).filter((e) => e.status !== 'inactive')} onClose={() => setEdit(null)} />}
    </>
  );
}

function Compose({ initial, emps, onClose }: { initial?: Announcement; emps: Employee[]; onClose: () => void }) {
  const { db } = useAuth();
  const [f, setF] = useState<AnnInput>(() => initial ? { kind: initial.kind, title: initial.title, body: initial.body, awardee_ids: initial.awardee_ids, reward: initial.reward ?? '', audience: initial.audience, audience_ids: initial.audience_ids, pinned: initial.pinned, status: initial.status, publish_at: initial.publish_at ?? '', expires_on: initial.expires_on ?? '' } : { kind: 'Recognition', title: '', body: '', awardee_ids: [], reward: '', audience: 'all', audience_ids: [], pinned: false, status: 'Published', publish_at: '', expires_on: '' });
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<AnnInput>) => setF((x) => ({ ...x, ...p }));
  const toggle = (key: 'awardee_ids' | 'audience_ids', id: string) => up({ [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] } as Partial<AnnInput>);
  const emap = useMemo(() => new Map(db.employees.map((e) => [e.id, e])), [db.employees]);
  const save = async (status: Announcement['status']) => {
    setBusy(true);
    try { await saveAnnouncement({ ...f, status, publish_at: f.publish_at ? new Date(f.publish_at).toISOString() : null }, initial?.id); toast(status === 'Published' ? 'Posted — it shows in the crew’s app' : 'Saved as a draft', 'ok'); onClose(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'err'); } finally { setBusy(false); }
  };
  const Pick = ({ k }: { k: 'awardee_ids' | 'audience_ids' }) => <div className="ann-pick">{emps.map((e) => <label key={e.id} className="check"><input type="checkbox" checked={f[k].includes(e.id)} onChange={() => toggle(k, e.id)} />{e.full_name}</label>)}</div>;
  const preview: Announcement = { id: 'preview', created_at: '', kind: f.kind, title: f.title || 'Your title appears here', body: f.body, awardee_ids: f.awardee_ids, reward: f.reward, audience: f.audience, audience_ids: f.audience_ids, pinned: f.pinned, status: 'Published', expires_on: f.expires_on };
  return (
    <Modal title={initial ? 'Edit announcement' : 'New announcement'} size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={() => void save('Draft')}>Save as draft</button><button className="btn primary" disabled={busy} onClick={() => void save('Published')}>{busy ? 'Posting…' : f.publish_at ? 'Schedule' : 'Post to the crew'}</button></>}>
      <div className="stack">
        <div className="chips" role="group" aria-label="What is it">{(Object.keys(KINDS) as AnnKind[]).map((k) => <button key={k} type="button" className={f.kind === k ? 'on' : ''} title={KINDS[k].blurb} onClick={() => up({ kind: k, title: f.title || SUGGEST[k] })}>{KINDS[k].icon} {k}</button>)}</div>
        <Field label="Title" required><input value={f.title} onChange={(e) => up({ title: e.target.value })} placeholder={SUGGEST[f.kind] || 'e.g. New safety gear arrives Monday'} /></Field>
        <Field label="Message"><textarea rows={4} value={f.body} onChange={(e) => up({ body: e.target.value })} placeholder="Say thank you, say what they did, say what happens next…" /></Field>
        {['Reward', 'Award', 'Recognition'].includes(f.kind) && <>
          <Field label="Who is being recognised? (they see it first, with a celebration)"><Pick k="awardee_ids" /></Field>
          <Field label="Reward (optional)"><input value={f.reward ?? ''} onChange={(e) => up({ reward: e.target.value })} placeholder="e.g. ₱1,000 bonus · extra day off · gift card" /></Field>
        </>}
        <div className="form-grid">
          <Field label="Who sees it"><select value={f.audience} onChange={(e) => up({ audience: e.target.value as Audience })}><option value="all">Everyone (crew, leaders and staff)</option><option value="leaders">Team leaders and office only</option><option value="people">Selected people only</option></select></Field>
          <Field label="Pin to the top"><label className="check"><input type="checkbox" checked={f.pinned} onChange={(e) => up({ pinned: e.target.checked })} />Keep it first in the list</label></Field>
          <Field label="Show from (optional)" hint="Leave empty to show right away."><input type="datetime-local" value={f.publish_at ? f.publish_at.slice(0, 16) : ''} onChange={(e) => up({ publish_at: e.target.value })} /></Field>
          <Field label="Hide after (optional)"><input type="date" value={f.expires_on ?? ''} onChange={(e) => up({ expires_on: e.target.value })} /></Field>
        </div>
        {f.audience === 'people' && <Field label="Choose the people"><Pick k="audience_ids" /></Field>}
        <div><div className="small muted" style={{ marginBottom: 6 }}>Preview — how it looks in the crew’s app</div><AnnCard a={preview} emps={emap} meId={null} myReaction={null} preview /></div>
      </div>
    </Modal>
  );
}
