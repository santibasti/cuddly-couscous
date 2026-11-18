// AI Chat: what the customer-service AI is doing in ManyChat (Messenger, Instagram, WhatsApp). In "suggest" mode every reply waits here for approval; staff can edit, approve (the reply is sent), discard, or take the conversation over.
// Live system only: the conversations come from the chat functions. The demo build shows how the screen works with a sample.
import { useCallback, useEffect, useState } from 'react';
import { Badge, Card, PageHead, attempt, toast } from '@/components/ui';
import { useAuth } from '@/lib/store';
import { CLOUD, supabase } from '@/lib/cloud';
import { callFn } from '@/lib/fnclient';
import { fmtStamp } from '@/lib/util';

interface Conv { id: string; channel: string; subscriber_id: string; name: string | null; lang: string | null; status: 'Open' | 'Needs a person' | 'Lead created' | 'Closed'; human_reason: string | null; last_message_at: string }
interface Msg { id: string; direction: 'in' | 'out'; body: string; status: 'received' | 'draft' | 'approved' | 'sent' | 'failed' | 'discarded'; actions: { type: string; input: Record<string, unknown> }[]; flags: string[]; rulebook_version: number | null; error: string | null; created_at: string; card_url?: string | null; original_body?: string | null }
const SAMPLE_CONV: Conv[] = [{ id: 's1', channel: 'messenger', subscriber_id: 'sample', name: 'Sample customer', lang: 'taglish', status: 'Open', human_reason: null, last_message_at: new Date().toISOString() }];
const SAMPLE_MSG: Msg[] = [
  { id: 'm1', direction: 'in', body: 'Magkano po window cleaning sa Makati? 21 panels lang po', status: 'received', actions: [], flags: [], rulebook_version: null, error: null, created_at: new Date().toISOString() },
  { id: 'm2', direction: 'out', body: 'Hi po! Sa Makati, ang package namin ay nagsisimula sa ₱4,799 para sa hanggang 31 glass panels. Para sa 21 panels ninyo, sakop pa po siya ng package, so ang estimate ay ₱4,799. Estimate lang po ito ha, kasi ang crew namin ang magbibilang ng final count sa site.', status: 'draft', actions: [], flags: [], rulebook_version: 1, error: null, created_at: new Date().toISOString() },
];
const ICON: Record<string, string> = { messenger: '💬', instagram: '📷', whatsapp: '🟢', other: '💬' };
const actionLabel = (a: Msg['actions'][number]) => a.type === 'book_date' ? `Book ${String(a.input.date ?? 'the date')} for ${String(a.input.name ?? 'the customer')}` : a.type === 'save_lead' ? `Save ${String(a.input.name ?? 'the customer')} as a lead` : `Hand over to a person: ${String(a.input.reason ?? '')}`;

export default function AiChat() {
  const { can, db } = useAuth(); const allowed = can('inbox.manage'); const mode = (db.settings as { chat_ai?: { mode?: string } }).chat_ai?.mode ?? 'off';
  const [convs, setConvs] = useState<Conv[]>(CLOUD ? [] : SAMPLE_CONV); const [sel, setSel] = useState<string | null>(CLOUD ? null : 's1'); const [msgs, setMsgs] = useState<Msg[]>(CLOUD ? [] : SAMPLE_MSG);
  const [filter, setFilter] = useState<'attention' | 'all'>('attention'); const [pending, setPending] = useState<Set<string>>(new Set()); const [edit, setEdit] = useState<Record<string, string>>({}); const [noCard, setNoCard] = useState<Record<string, boolean>>({}); const [busy, setBusy] = useState(false);

  const loadConvs = useCallback(async () => {
    if (!CLOUD) return;
    const { data } = await supabase().from('chat_conversations').select('*').order('last_message_at', { ascending: false }).limit(100); setConvs((data ?? []) as Conv[]);
    const { data: d } = await supabase().from('chat_messages').select('conversation_id').in('status', ['draft', 'failed', 'approved']); setPending(new Set((d ?? []).map((x: { conversation_id: string }) => x.conversation_id)));
  }, []);
  const loadMsgs = useCallback(async (id: string | null) => { if (!CLOUD || !id) return; const { data } = await supabase().from('chat_messages').select('*').eq('conversation_id', id).order('created_at'); setMsgs((data ?? []) as Msg[]); }, []);
  useEffect(() => { void loadConvs(); const i = setInterval(() => { if (!document.hidden) void loadConvs(); }, 10_000); return () => clearInterval(i); }, [loadConvs]);
  useEffect(() => { void loadMsgs(sel); if (!CLOUD) return; const i = setInterval(() => { if (!document.hidden) void loadMsgs(sel); }, 8_000); return () => clearInterval(i); }, [sel, loadMsgs]);

  const act = (body: Record<string, unknown>, ok: string) => attempt(async () => {
    if (!CLOUD) { toast('Demo: nothing is sent. In the live system this ' + ok.toLowerCase() + '.', 'ok'); return; }
    setBusy(true); try { const r = await callFn<{ sent?: boolean; text?: string; note?: string }>('chat-send', body); if (r.sent === false) { toast(r.note ?? 'Approved. Copy the reply into ManyChat.', 'ok'); if (r.text) void navigator.clipboard?.writeText(r.text); } else toast(ok, 'ok'); await loadConvs(); await loadMsgs(sel); } finally { setBusy(false); }
  });
  if (!allowed) return <div className="content"><div className="alert warn">Your role does not have access to the AI Chat.</div></div>;
  const shown = convs.filter((c) => !CLOUD || filter === 'all' || c.status === 'Needs a person' || pending.has(c.id)); const cur = convs.find((c) => c.id === sel);
  return (
    <div className="stack">
      <PageHead title="AI Chat" sub={<>Mode: <Badge tone={mode === 'auto' ? 'red' : mode === 'suggest' ? 'amber' : 'grey'}>{mode === 'auto' ? 'full (replies go out by themselves)' : mode === 'suggest' ? 'suggest (you approve every reply)' : 'off'}</Badge> · change it in Admin → Settings → AI chat{!CLOUD && ' · DEMO: a sample conversation'}</>} />
      <div className="row" style={{ gap: 6 }}><button className={`b ${filter === 'attention' ? 'primary' : ''}`} onClick={() => setFilter('attention')}>Needs attention ({convs.filter((c) => c.status === 'Needs a person' || pending.has(c.id)).length})</button><button className={`b ${filter === 'all' ? 'primary' : ''}`} onClick={() => setFilter('all')}>All conversations</button></div>
      <div className="aichat">
        <Card title="Conversations" flush><ul className="aichat-list">{shown.length === 0 && <li className="muted" style={{ padding: 12 }}>{CLOUD ? 'Nothing needs attention.' : ''}</li>}{shown.map((c) => (
          <li key={c.id}><button className={`aichat-row ${sel === c.id ? 'on' : ''}`} onClick={() => setSel(c.id)}><span>{ICON[c.channel] ?? '💬'}</span><b>{c.name || c.subscriber_id}</b>{(pending.has(c.id) || !CLOUD) && <Badge tone="amber">reply waits</Badge>}{c.status === 'Needs a person' && <Badge tone="red">needs a person</Badge>}<small className="muted">{fmtStamp(c.last_message_at)}</small></button></li>))}</ul></Card>
        <Card title={cur ? `${cur.name || cur.subscriber_id} · ${cur.channel}${cur.lang ? ` · ${cur.lang}` : ''}` : 'Pick a conversation'} actions={cur && <div className="row" style={{ gap: 6 }}>{cur.status === 'Needs a person' ? <button className="b" disabled={busy} onClick={() => act({ action: 'release', conversation_id: cur.id }, 'Handed back to the AI')}>Hand back to the AI</button> : <button className="b" disabled={busy} onClick={() => act({ action: 'takeover', conversation_id: cur.id }, 'You have the conversation. The AI stays silent')}>Take over</button>}</div>}>
          {cur?.human_reason && <div className="alert warn">Needs a person: {cur.human_reason}</div>}
          <div className="stack" style={{ gap: 8 }}>{msgs.map((m) => (
            <div key={m.id} className={`aichat-msg ${m.direction}`}>
              <small className="muted">{m.direction === 'in' ? 'Customer' : 'AI'} · {fmtStamp(m.created_at)}{m.rulebook_version ? ` · rulebook v${m.rulebook_version}` : ''} · {m.status}</small>
              {m.status === 'draft' || m.status === 'failed' || m.status === 'approved' ? <>
                <textarea rows={4} value={edit[m.id] ?? m.body} onChange={(e) => setEdit({ ...edit, [m.id]: e.target.value })} style={{ width: '100%' }} />
                {m.card_url && <div className="aichat-card"><img src={m.card_url} alt="Estimate card that will be sent with this reply" style={{ width: 180, borderRadius: 10, display: 'block' }} /><label className="muted small"><input type="checkbox" checked={noCard[m.id] !== true} onChange={(e) => setNoCard({ ...noCard, [m.id]: !e.target.checked })} /> Send this estimate card with the reply</label></div>}
                {m.body.includes('---') && <div className="muted small">A line with only --- splits the reply into separate chat messages.</div>}
                {m.flags.length > 0 && <div className="alert warn">Safety check: {m.flags.join('; ')}. Read it carefully before approving.</div>}
                {m.actions.length > 0 && <div className="muted small">On approval the system will: {m.actions.map(actionLabel).join(' · ')}. (A booking's wording comes from the system, not from this draft.)</div>}
                {m.error && <div className="alert err">{m.error}</div>}
                <div className="row" style={{ gap: 6 }}><button className="b primary" disabled={busy} onClick={() => act({ action: 'approve', message_id: m.id, text: edit[m.id] ?? m.body, send_card: noCard[m.id] !== true }, 'Sent')}>Approve & send</button><button className="b" disabled={busy} onClick={() => act({ action: 'discard', message_id: m.id }, 'Discarded')}>Discard</button></div>
              </> : <div>{m.body}{m.original_body && <details className="aichat-edit" style={{ marginTop: 6 }}><summary className="muted small">✏️ Edited by staff — see what the AI wrote</summary><div className="muted small" style={{ whiteSpace: 'pre-wrap' }}>{m.original_body}</div></details>}</div>}
            </div>))}</div>
          {!cur && CLOUD && <p className="muted">Pick a conversation on the left.</p>}
        </Card>
      </div>
      <style>{`.aichat{display:grid;grid-template-columns:minmax(220px,320px) 1fr;gap:12px;align-items:start}@media(max-width:800px){.aichat{grid-template-columns:1fr}}.aichat-list{list-style:none;margin:0;padding:0;max-height:70vh;overflow:auto}.aichat-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid rgba(120,160,255,.15);padding:10px 12px;color:inherit;cursor:pointer}.aichat-row.on,.aichat-row:hover{background:rgba(120,160,255,.12)}.aichat-msg{padding:8px 10px;border-radius:10px;border:1px solid rgba(120,160,255,.2);max-width:92%}.aichat-msg.in{align-self:flex-start}.aichat-msg.out{align-self:flex-end;background:rgba(80,130,255,.1)}`}</style>
    </div>
  );
}
