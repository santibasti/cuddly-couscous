// Marketing AI: posts for the Facebook Page written by the AI (or by you) — review, edit, schedule, approve and post.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Modal, PageHead, toast } from '@/components/ui';
import { AiRephrase } from '@/components/AiRephrase';
import { CLOUD, supabase } from '@/lib/cloud';
import { photoUrls } from '@/lib/photos';
import { fmtStamp } from '@/lib/util';

type Status = 'Idea' | 'Approved' | 'Posted' | 'Failed' | 'Rejected';
interface Post { id: string; kind: string; text: string; photo_ids: string[]; job_id: string | null; scheduled_at: string; status: Status; by_ai: boolean; fb_post_id: string | null; posted_at: string | null; error: string | null }
const TONE: Record<Status, string> = { Idea: 'amber', Approved: 'blue', Posted: 'green', Failed: 'red', Rejected: 'gray' };
const LABEL: Record<Status, string> = { Idea: 'Needs your approval', Approved: 'Approved — will post', Posted: 'Posted', Failed: 'Failed', Rejected: 'Rejected' };
const KINDS = ['Tip', 'Completed job', 'Promo', 'Seasonal', 'Other'];

const toLocal = (iso: string) => { const d = new Date(Date.parse(iso) + 8 * 3600_000); return d.toISOString().slice(0, 16); };       // Manila wall clock for <input type=datetime-local>
const fromLocal = (v: string) => new Date(Date.parse(v + ':00Z') - 8 * 3600_000).toISOString();

async function fn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body });
  if (error) { let msg = error.message; try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* generic */ } throw new Error(msg); }
  const d = data as { error?: string }; if (d?.error) throw new Error(d.error);
  return data as T;
}

export default function Marketing() {
  const { db } = useAuth(); const mode = db.settings.marketing?.mode ?? 'off';
  const [posts, setPosts] = useState<Post[]>([]); const [busy, setBusy] = useState<string>(); const [add, setAdd] = useState(false); const [tab, setTab] = useState<'todo' | 'posted'>('todo');
  const load = useCallback(async () => { const { data } = await supabase().from('marketing_posts').select('*').order('scheduled_at', { ascending: true }).limit(300); setPosts((data ?? []) as Post[]); }, []);
  useEffect(() => { if (!CLOUD) return; load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  if (!CLOUD) return <div className="alert warn">Marketing AI works in the live app only (it needs the cloud connection and the Facebook Page).</div>;

  const generate = async () => {
    setBusy('The AI is writing posts…');
    try { const r = await fn<{ made?: number; note?: string }>('marketing-run', { action: 'generate', count: 3 }); toast(r.made ? `${r.made} new post${r.made === 1 ? '' : 's'} written — review them below` : (r.note ?? 'Nothing new was written'), r.made ? 'ok' : 'err'); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not write posts', 'err'); } finally { setBusy(undefined); }
  };
  const todo = posts.filter((p) => p.status === 'Idea' || p.status === 'Approved' || p.status === 'Failed');
  const done = posts.filter((p) => p.status === 'Posted' || p.status === 'Rejected').sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const waiting = todo.filter((p) => p.status === 'Idea').length;

  return (
    <>
      <PageHead title="Marketing AI" sub={mode === 'off' ? 'Switched off — turn it on in Admin → Settings → Marketing AI. You can still write posts by hand or ask the AI for ideas.' : mode === 'auto' ? 'Auto: approved posts go to your Facebook Page on schedule.' : 'The AI drafts posts and waits for your approval before anything is published.'}>
        <button className="btn primary" disabled={!!busy} onClick={generate}>✨ Write 3 ideas now</button>
        <button className="btn" onClick={() => setAdd(true)}>New post</button>
        <Link to="/admin" className="btn">Settings</Link>
      </PageHead>
      {busy && <div className="alert">{busy}</div>}
      {waiting > 0 && <div className="alert warn">{waiting} post{waiting === 1 ? '' : 's'} waiting for your approval.</div>}
      <div className="chips" role="tablist" style={{ marginBottom: 12 }}>
        <button type="button" className={tab === 'todo' ? 'on' : ''} onClick={() => setTab('todo')}>Upcoming ({todo.length})</button>
        <button type="button" className={tab === 'posted' ? 'on' : ''} onClick={() => setTab('posted')}>Posted & rejected ({done.length})</button>
      </div>
      <div className="stack">
        {(tab === 'todo' ? todo : done).map((p) => <PostCard key={p.id} p={p} onChanged={load} />)}
        {!(tab === 'todo' ? todo : done).length && <Card><div className="muted small">{tab === 'todo' ? 'No upcoming posts. Tap “Write 3 ideas now”, or switch the Marketing AI on in Admin so it keeps the schedule filled.' : 'Nothing posted yet.'}</div></Card>}
      </div>
      {add && <NewPost onClose={() => setAdd(false)} onSaved={load} />}
    </>
  );
}

function PostCard({ p, onChanged }: { p: Post; onChanged: () => void }) {
  const [text, setText] = useState(p.text); const [at, setAt] = useState(toLocal(p.scheduled_at)); const [photos, setPhotos] = useState<string[]>(p.photo_ids); const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const area = useRef<HTMLTextAreaElement>(null);
  const editable = p.status === 'Idea' || p.status === 'Approved' || p.status === 'Failed';
  const dirty = text !== p.text || at !== toLocal(p.scheduled_at) || photos.join() !== p.photo_ids.join();
  useEffect(() => { setText(p.text); setAt(toLocal(p.scheduled_at)); setPhotos(p.photo_ids); }, [p.id, p.text, p.scheduled_at, p.photo_ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p.photo_ids.length) return;
    supabase().from('job_photos').select('id, path').in('id', p.photo_ids).then(async ({ data }) => setUrls(await photoUrls((data ?? []) as { id: string; path: string }[])));
  }, [p.photo_ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (v: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const { error } = await supabase().from('marketing_posts').update({ ...v, updated_at: new Date().toISOString() }).eq('id', p.id);
    setBusy(false); if (error) { toast(error.message, 'err'); return false; } toast(ok, 'ok'); onChanged(); return true;
  };
  const save = () => patch({ text: text.trim(), scheduled_at: fromLocal(at), photo_ids: photos }, 'Saved');
  const approve = async () => { if (dirty && !(await save())) return; await patch({ status: 'Approved', error: null }, 'Approved — it will be posted at the scheduled time'); };
  const postNow = async () => {
    if (!confirm('Post this to your Facebook Page right now?')) return;
    if (dirty && !(await save())) return; if (p.status !== 'Approved' && !(await patch({ status: 'Approved', error: null }, 'Approved'))) return;
    setBusy(true);
    try { await fn('marketing-run', { action: 'post_now', id: p.id }); toast('Posted to your Facebook Page', 'ok'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not post', 'err'); }
    setBusy(false); onChanged();
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Text copied — paste it into Facebook', 'ok'); } catch { toast('Could not copy', 'err'); } };

  return (
    <Card title={<span className="row" style={{ gap: 8 }}><Badge tone={TONE[p.status]}>{LABEL[p.status]}</Badge><Badge tone="gray">{p.kind}</Badge>{p.by_ai && <span className="small muted">✨ written by AI</span>}</span>}
      actions={editable ? <div className="row"><AiRephrase value={text} area={() => area.current} onApply={setText} /></div> : undefined}>
      <div className="stack">
        {editable ? <textarea ref={area} rows={Math.min(12, Math.max(5, text.split('\n').length + 1))} style={{ width: '100%' }} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} /> : <div style={{ whiteSpace: 'pre-wrap' }}>{p.text}</div>}
        {photos.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>{photos.map((id) => <div key={id} style={{ position: 'relative' }}>
            {urls[id] ? <img src={urls[id]} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 96, height: 96, borderRadius: 6, background: '#eef3f7' }} />}
            {editable && <button type="button" className="btn sm danger" style={{ position: 'absolute', top: 2, right: 2, padding: '0 6px' }} aria-label="Remove photo" onClick={() => setPhotos(photos.filter((x) => x !== id))}>×</button>}
          </div>)}</div>
        )}
        {p.error && <div className="alert warn">Could not post: {p.error}</div>}
        {editable ? (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Field label="Post on (Manila time)"><input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignSelf: 'flex-end' }}>
              {dirty && <button className="btn" disabled={busy} onClick={save}>Save</button>}
              {p.status !== 'Approved' && <button className="btn primary" disabled={busy || !text.trim()} onClick={approve}>Approve</button>}
              {p.status === 'Approved' && <button className="btn" disabled={busy} onClick={() => patch({ status: 'Idea' }, 'Moved back to needs approval')}>Unapprove</button>}
              <button className="btn navy" disabled={busy || !text.trim()} onClick={postNow}>Post now</button>
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
  const [kind, setKind] = useState('Tip'); const [text, setText] = useState(''); const [at, setAt] = useState(toLocal(new Date(Date.now() + 86400_000).toISOString())); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase().from('marketing_posts').insert({ kind, text: text.trim(), scheduled_at: fromLocal(at), status: 'Idea', by_ai: false });
    setBusy(false); if (error) { toast(error.message, 'err'); return; } toast('Post added — approve it when it is ready', 'ok'); onSaved(); onClose();
  };
  return (
    <Modal title="New post" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !text.trim()} onClick={save}>Add post</button></>}>
      <div className="form-grid">
        <Field label="Type"><select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Post on (Manila time)"><input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label="Text" className="full"><textarea rows={7} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Write the post, or leave it to the AI with “Write 3 ideas now”." /></Field>
      </div>
    </Modal>
  );
}
