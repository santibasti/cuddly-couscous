// Staff act on the AI chat from the app (signed-in user with permission inbox.manage). POST JSON with the user's token:
//   { action: "approve", message_id, text? }   run the queued actions (book, save the lead), then send the reply to the customer through ManyChat (secret MANYCHAT_API_TOKEN)
//                                              — without that token the reply is marked "approved" and shown to copy into ManyChat's live chat
//   { action: "discard", message_id }          { action: "takeover" | "release", conversation_id }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { makeExec } from '../_shared/chatexec.ts';
import type { Action } from '../_shared/brain.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } });
  const { data: ok } = await asUser.rpc('can_manage_inbox'); if (ok !== true) return json({ error: 'Not allowed' }, 403);
  const { data: u } = await asUser.auth.getUser(); const who = u?.user?.id ?? 'staff';
  const b = await req.json().catch(() => ({})) as Record<string, unknown>; const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const action = String(b.action ?? '');

  if (action === 'takeover' || action === 'release') {
    const { data: c } = await sb.from('chat_conversations').select('id, inquiry_id').eq('id', String(b.conversation_id ?? '')).maybeSingle(); if (!c) return json({ error: 'Conversation not found' }, 404);
    await sb.from('chat_conversations').update(action === 'takeover' ? { status: 'Needs a person', human_reason: 'A staff member took over' } : { status: c.inquiry_id ? 'Lead created' : 'Open', human_reason: null }).eq('id', c.id);
    return json({ ok: true });
  }
  const { data: msg } = await sb.from('chat_messages').select('*').eq('id', String(b.message_id ?? '')).maybeSingle(); if (!msg || msg.direction !== 'out') return json({ error: 'Message not found' }, 404);
  if (action === 'discard') { await sb.from('chat_messages').update({ status: 'discarded', decided_by: who, decided_at: new Date().toISOString() }).eq('id', msg.id); return json({ ok: true }); }
  if (action !== 'approve') return json({ error: 'Unknown action' }, 400);
  if (!['draft', 'failed', 'approved'].includes(msg.status)) return json({ error: 'This reply was already handled' }, 409);
  const { data: conv } = await sb.from('chat_conversations').select('*').eq('id', msg.conversation_id).maybeSingle(); if (!conv) return json({ error: 'Conversation not found' }, 404);

  let text = String(b.text ?? msg.body).trim();
  if (msg.status === 'draft') {                                                                                                         // the queued actions run only once, on the first approval
    const exec = makeExec({ sb, base: env('SUPABASE_URL'), key: env('LEAD_INTAKE_KEY'), conv, lang: conv.lang ?? 'en' });
    for (const a of (msg.actions ?? []) as Action[]) { const o = await exec(a.type, a.input); if (a.type === 'book_date' && o.booked) text = o.booked.reply || text; }   // a booking's wording comes from the system, never from the draft
  }
  if (!text) return json({ error: 'Nothing to send' }, 400);
  const token = env('MANYCHAT_API_TOKEN');
  if (!token) { await sb.from('chat_messages').update({ status: 'approved', body: text, actions: [], decided_by: who, decided_at: new Date().toISOString() }).eq('id', msg.id); return json({ ok: true, sent: false, text, note: 'MANYCHAT_API_TOKEN is not set: copy this reply into the ManyChat live chat.' }); }
  const r = await fetch('https://api.manychat.com/fb/sending/sendContent', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriber_id: conv.subscriber_id, data: { version: 'v2', content: { messages: [{ type: 'text', text }] } } }) });
  if (!r.ok) { const err = (await r.text()).slice(0, 250); await sb.from('chat_messages').update({ status: 'failed', body: text, actions: [], error: err, decided_by: who, decided_at: new Date().toISOString() }).eq('id', msg.id); return json({ error: `ManyChat did not accept the message: ${err}` }, 502); }
  await sb.from('chat_messages').update({ status: 'sent', body: text, actions: [], error: null, decided_by: who, decided_at: new Date().toISOString() }).eq('id', msg.id);
  await sb.from('chat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id);
  return json({ ok: true, sent: true, text });
});
