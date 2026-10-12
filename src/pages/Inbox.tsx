// Facebook Page inbox: customer messages, the AI assistant's suggested replies (approve / edit / discard) and the lead it created.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, Card, PageHead, attempt } from '@/components/ui';
import { CLOUD, supabase } from '@/lib/cloud';
import { fmtDateTime } from '@/lib/util';

interface Conv { id: string; name: string | null; status: 'Open' | 'Needs a person' | 'Lead created' | 'Closed'; needs_human: boolean; human_reason: string | null; inquiry_id: string | null; client_id: string | null; last_message_at: string }
interface Msg { id: number; conversation_id: string; direction: 'in' | 'out'; text: string; status: 'received' | 'draft' | 'sent' | 'failed' | 'discarded'; by_ai: boolean; error: string | null; created_at: string }
const TONE: Record<Conv['status'], string> = { Open: 'blue', 'Needs a person': 'red', 'Lead created': 'green', Closed: 'gray' };

export default function Inbox() {
  const { db, can } = useAuth();
  const [convs, setConvs] = useState<Conv[]>([]); const [sel, setSel] = useState<string>();
  const [msgs, setMsgs] = useState<Msg[]>([]); const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const mode = db.settings.fb_ai?.mode ?? 'off';

  const loadConvs = useCallback(async () => { const { data } = await supabase().from('fb_conversations').select('*').order('last_message_at', { ascending: false }).limit(100); setConvs((data ?? []) as Conv[]); }, []);
  const loadMsgs = useCallback(async (id: string) => { const { data } = await supabase().from('fb_messages').select('*').eq('conversation_id', id).order('created_at').limit(200); setMsgs((data ?? []) as Msg[]); }, []);
  useEffect(() => { if (!CLOUD) return; loadConvs(); const t = setInterval(loadConvs, 15000); return () => clearInterval(t); }, [loadConvs]);
  useEffect(() => { if (!CLOUD || !sel) return; loadMsgs(sel); const t = setInterval(() => loadMsgs(sel), 10000); return () => clearInterval(t); }, [sel, loadMsgs]);
  const pending = msgs.filter((m) => m.direction === 'out' && (m.status === 'draft' || m.status === 'failed')).slice(-1)[0];
  useEffect(() => { setDraft(pending?.text ?? ''); }, [pending?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { const { data, error } = await supabase().functions.invoke('fb-send', { body }); if (error) throw new Error(error.message); if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error); }
    finally { setBusy(false); }
  };
  const send = () => { if (!pending || !draft.trim()) return; attempt(() => call({ message_id: pending.id, text: draft, action: 'send' }).then(() => { loadMsgs(sel!); loadConvs(); }), 'Reply sent on Facebook'); };
  const discard = () => { if (!pending) return; attempt(() => call({ message_id: pending.id, action: 'discard' }).then(() => loadMsgs(sel!)), 'Draft discarded'); };
  const setStatus = async (id: string, status: Conv['status']) => { await supabase().from('fb_conversations').update({ status, needs_human: status === 'Needs a person' }).eq('id', id); loadConvs(); };
  const cur = convs.find((c) => c.id === sel);

  if (!can('inbox.manage')) return <div className="alert warn">Your role does not have access to the Facebook inbox.</div>;
  return (
    <>
      <PageHead title="Facebook Inbox" sub="Customer messages from your Facebook Page. The AI assistant drafts the replies and saves leads in TopMop." />
      {!CLOUD && <div className="alert info">The Facebook inbox works on the live system (connected to Supabase). In this demo there are no Facebook messages.</div>}
      {CLOUD && <div className="alert info" style={{ marginBottom: 12 }}>AI assistant mode: <b>{mode === 'off' ? 'Off — messages are only stored' : mode === 'suggest' ? 'Suggest — you approve every reply' : 'Auto — simple replies are sent right away'}</b>. Change it in Admin → Settings → Facebook AI assistant.</div>}
      {CLOUD && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 12, alignItems: 'start' }}>
          <Card flush title="Conversations">
            <ul className="list">
              {convs.map((c) => (
                <li key={c.id} onClick={() => setSel(c.id)} style={{ cursor: 'pointer', background: sel === c.id ? 'var(--teal-bg, rgba(34,193,195,.1))' : undefined }}>
                  <div><b>{c.name || 'Facebook user'}</b><div className="small muted">{fmtDateTime(c.last_message_at.slice(0, 16))}</div></div><Badge tone={TONE[c.status]}>{c.status}</Badge>
                </li>
              ))}
              {!convs.length && <li className="muted">No messages yet. Once the Page is connected, customer chats appear here.</li>}
            </ul>
          </Card>
          <Card title={cur ? <>{cur.name || 'Facebook user'} <Badge tone={TONE[cur.status]}>{cur.status}</Badge></> : 'Select a conversation'} actions={cur && <span className="row" style={{ gap: 6 }}>
            {cur.inquiry_id && cur.client_id && <Link className="btn sm" to={`/clients/${cur.client_id}`}>Open client</Link>}
            {cur.status !== 'Closed' ? <button className="btn sm" onClick={() => setStatus(cur.id, 'Closed')}>Close</button> : <button className="btn sm" onClick={() => setStatus(cur.id, 'Open')}>Reopen</button>}
          </span>}>
            {cur?.needs_human && <div className="alert warn" style={{ marginBottom: 10 }}><b>A person is needed:</b> {cur.human_reason || 'the assistant asked for help.'}</div>}
            {cur?.inquiry_id && <div className="alert info" style={{ marginBottom: 10 }}>A lead was created in TopMop (stage Inquiry, source Facebook). Open the client to schedule an ocular visit or make the quotation.</div>}
            <div style={{ display: 'grid', gap: 8, maxHeight: 460, overflowY: 'auto', marginBottom: 12 }}>
              {msgs.filter((m) => m.status !== 'discarded').map((m) => (
                <div key={m.id} style={{ justifySelf: m.direction === 'out' ? 'end' : 'start', maxWidth: '80%', padding: '8px 12px', borderRadius: 12, background: m.direction === 'out' ? (m.status === 'draft' ? 'rgba(217,139,15,.18)' : 'var(--teal-bg, rgba(34,193,195,.18))') : 'var(--panel-2, rgba(255,255,255,.06))', whiteSpace: 'pre-wrap' }}>
                  {m.text}
                  <div className="small muted">{m.direction === 'out' ? (m.by_ai ? 'AI assistant' : 'TopMop') : 'Customer'} · {m.status === 'draft' ? 'draft — not sent' : m.status === 'failed' ? 'failed' : fmtDateTime(m.created_at.slice(0, 16))}</div>
                </div>
              ))}
              {sel && !msgs.length && <div className="muted">Loading…</div>}
            </div>
            {cur && (
              <div className="stack">
                {pending?.error && <div className="alert err">Not sent: {pending.error}</div>}
                <textarea rows={4} style={{ width: '100%' }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={pending ? 'Edit the suggested reply…' : 'Type a reply…'} />
                <div className="row">
                  {pending ? <><button className="btn primary" disabled={busy || !draft.trim()} onClick={send}>Approve &amp; send</button><button className="btn" disabled={busy} onClick={discard}>Discard draft</button></>
                    : <button className="btn primary" disabled={busy || !draft.trim()} onClick={() => attempt(async () => { const { data: m, error } = await supabase().from('fb_messages').insert({ conversation_id: cur.id, direction: 'out', text: draft, status: 'draft' }).select('id').single(); if (error) throw new Error(error.message); await call({ message_id: m.id, text: draft, action: 'send' }); setDraft(''); loadMsgs(cur.id); loadConvs(); }, 'Reply sent on Facebook')}>Send</button>}
                  <span className="small muted">Facebook only lets a Page reply within 24 hours of the customer's last message.</span>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
