// Staff sends (or discards) a reply from the Facebook Inbox. Called by the app with the signed-in user's token.
// body: { message_id: number, text?: string, action?: 'send' | 'discard' }  — secrets: FB_PAGE_TOKEN
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } });
  const { data: ok } = await asUser.rpc('can_manage_inbox');
  if (ok !== true) return json({ error: 'Not allowed' }, 403);
  const { message_id, text, action } = await req.json().catch(() => ({}));
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: msg } = await sb.from('fb_messages').select('id, conversation_id, status, text').eq('id', message_id).maybeSingle();
  if (!msg) return json({ error: 'Message not found' }, 404);
  if (action === 'discard') { await sb.from('fb_messages').update({ status: 'discarded' }).eq('id', msg.id); return json({ ok: true }); }
  if (msg.status !== 'draft' && msg.status !== 'failed') return json({ error: 'This reply was already sent' }, 409);
  const { data: conv } = await sb.from('fb_conversations').select('psid').eq('id', msg.conversation_id).maybeSingle();
  const body = String(text ?? msg.text).trim(); if (!conv || !body) return json({ error: 'Nothing to send' }, 400);
  const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(env('FB_PAGE_TOKEN'))}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: conv.psid }, messaging_type: 'RESPONSE', message: { text: body.slice(0, 1900) } }) });
  if (!res.ok) { const err = (await res.text()).slice(0, 250); await sb.from('fb_messages').update({ status: 'failed', error: err }).eq('id', msg.id); return json({ error: `Facebook did not accept the message: ${err}` }, 502); }
  await sb.from('fb_messages').update({ status: 'sent', text: body, error: null }).eq('id', msg.id);
  await sb.from('fb_conversations').update({ last_message_at: new Date().toISOString(), needs_human: false }).eq('id', msg.conversation_id);
  return json({ ok: true });
});
