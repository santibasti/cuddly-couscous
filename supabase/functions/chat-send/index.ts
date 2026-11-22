// Staff act on the AI chat from the app (signed-in user with permission inbox.manage). POST JSON with the user's token:
//   { action: "approve", message_id, text? }   run the queued actions (book, save the lead), then send the reply to the customer through ManyChat (secret MANYCHAT_API_TOKEN)
//                                              — without that token the reply is marked "approved" and shown to copy into ManyChat's live chat
//   { action: "discard", message_id }          { action: "takeover" | "release", conversation_id }   { action: "returning", conversation_id, on: true|false }
//   V2.3: { action: "link", conversation_id, client_id }  (staff link a chat to the right TopMop client)   { action: "unlink", conversation_id }   { action: "resync", conversation_id? }  (read the ManyChat contact again; without an id: the next 25 never-checked conversations)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { makeExec } from '../_shared/chatexec.ts';
import { flattenMessages, splitMessages, type Action } from '../_shared/brain.ts';
import { resolveContact } from '../_shared/contact.ts';
import { manilaDay } from '../chat-availability/logic.ts';

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
  const audit = (summary: string, id: string) => sb.from('audit_logs').insert({ user_id: who, action: 'update', table_name: 'chat_conversations', record_id: id, summary });
  if (action === 'link') {   // staff decide which TopMop client this contact is: the only way a contact is linked without the system's own verification
    const cid = String(b.conversation_id ?? ''), clid = String(b.client_id ?? '');
    const { data: cl } = await sb.from('clients').select('id, name').eq('id', clid).is('deleted_at', null).maybeSingle(); if (!cl) return json({ error: 'Client not found' }, 404);
    const patch = { client_id: cl.id, contact_status: 'existing', link_state: 'staff', link_basis: 'staff', link_candidates: [], linked_by: who, linked_at: new Date().toISOString(), returning_customer: true, returning_note: `Linked to client ${cl.name} by staff` };
    const { error } = await sb.from('chat_conversations').update(patch).eq('id', cid);
    if (error) return json({ error: /column|schema cache/i.test(error.message) ? 'Run supabase db push first (migration 0135).' : error.message }, 400);
    await audit(`Chat linked to client ${cl.name} by staff`, cid); return json({ ok: true, client: cl.name });
  }
  if (action === 'unlink') {
    const cid = String(b.conversation_id ?? '');
    const { error } = await sb.from('chat_conversations').update({ client_id: null, contact_status: 'previous', link_state: null, link_basis: null, link_candidates: [], linked_by: null, linked_at: null }).eq('id', cid);
    if (error) return json({ error: /column|schema cache/i.test(error.message) ? 'Run supabase db push first (migration 0135).' : error.message }, 400);
    await audit('Chat unlinked from its client by staff', cid); return json({ ok: true });
  }
  if (action === 'resync') {   // read the ManyChat contact fields again and re-run the matching (ManyChat gives contact fields only, never the old messages)
    const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle(); const aiStart = ((st?.data as Record<string, unknown> | undefined)?.chat_ai as { ai_started_on?: string } | undefined)?.ai_started_on;
    const one = String(b.conversation_id ?? '');
    const q = one ? sb.from('chat_conversations').select('*').eq('id', one) : sb.from('chat_conversations').select('*').is('mc_synced_at', null).order('last_message_at', { ascending: false }).limit(25);
    const { data: list, error } = await q; if (error) return json({ error: /column|schema cache/i.test(error.message) ? 'Run supabase db push first (migration 0135).' : error.message }, 400);
    const tally = { checked: 0, existing: 0, previous: 0, new: 0, ask_staff: 0 };
    for (const conv of (list ?? []) as Record<string, unknown>[]) {
      try { const r = await resolveContact({ sb, env, conv, sub: String(conv.subscriber_id), payloads: [], text: '', aiStartedOn: aiStart, today: manilaDay(Date.now()), force: true }); tally.checked++; tally[r.identity.status]++; if (r.identity.state === 'ambiguous' || r.identity.state === 'suggested') tally.ask_staff++; } catch (e) { console.error('resync', (e as Error).message); }
      await new Promise((r) => setTimeout(r, 250));   // ManyChat allows a few requests a second
    }
    return json({ ok: true, ...tally });
  }
  if (action === 'returning') {
    const on = b.on !== false; const cid0 = String(b.conversation_id ?? '');
    const { data: cur } = await sb.from('chat_conversations').select('contact_status').eq('id', cid0).maybeSingle();
    const base = { returning_customer: on, returning_note: on ? 'Staff marked this customer as returning' : null };
    let { error } = await sb.from('chat_conversations').update({ ...base, ...(on && (!cur?.contact_status || cur.contact_status === 'new') ? { contact_status: 'previous' } : {}), ...(!on && cur?.contact_status === 'previous' ? { contact_status: 'new' } : {}) }).eq('id', cid0);
    if (error && /contact_status/.test(error.message)) ({ error } = await sb.from('chat_conversations').update(base).eq('id', cid0));   // migration 0135 not applied yet: the older behaviour
    return error ? json({ error: error.message.includes('returning_customer') ? 'Run supabase db push first (migration 0132).' : error.message }, 400) : json({ ok: true });
  }
  const { data: msg } = await sb.from('chat_messages').select('*').eq('id', String(b.message_id ?? '')).maybeSingle(); if (!msg || msg.direction !== 'out') return json({ error: 'Message not found' }, 404);
  if (action === 'discard') { await sb.from('chat_messages').update({ status: 'discarded', decided_by: who, decided_at: new Date().toISOString() }).eq('id', msg.id); return json({ ok: true }); }
  if (action !== 'approve') return json({ error: 'Unknown action' }, 400);
  if (!['draft', 'failed', 'approved'].includes(msg.status)) return json({ error: 'This reply was already handled' }, 409);
  const { data: conv } = await sb.from('chat_conversations').select('*').eq('id', msg.conversation_id).maybeSingle(); if (!conv) return json({ error: 'Conversation not found' }, 404);

  let text = String(b.text ?? msg.body).trim();
  const original = msg.original_body ?? (msg.status === 'draft' && text !== String(msg.body ?? '').trim() ? msg.body : null);   // staff edited the AI's draft: keep what the AI wrote
  const save = async (patch: Record<string, unknown>) => { let r = await sb.from('chat_messages').update({ ...patch, original_body: original }).eq('id', msg.id); if (r.error && /original_body/i.test(r.error.message)) r = await sb.from('chat_messages').update(patch).eq('id', msg.id); return r; };   // works before migration 0129 too
  if (msg.status === 'draft') {                                                                                                         // the queued actions run only once, on the first approval
    const exec = makeExec({ sb, base: env('SUPABASE_URL'), key: env('LEAD_INTAKE_KEY'), conv, lang: conv.lang ?? 'en' });
    for (const a of (msg.actions ?? []) as Action[]) { const o = await exec(a.type, a.input); if (a.type === 'book_date' && o.booked) text = o.booked.reply || text; }   // a booking's wording comes from the system, never from the draft
  }
  if (!text) return json({ error: 'Nothing to send' }, 400);
  const token = env('MANYCHAT_API_TOKEN');
  if (!token) { await save({ status: 'approved', body: text, actions: [], decided_by: who, decided_at: new Date().toISOString() }); return json({ ok: true, sent: false, text: flattenMessages(text), note: 'MANYCHAT_API_TOKEN is not set: copy this reply into the ManyChat live chat.' }); }
  const r = await fetch('https://api.manychat.com/fb/sending/sendContent', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriber_id: conv.subscriber_id, data: { version: 'v2', content: { messages: [...splitMessages(text).map((t) => ({ type: 'text', text: t })), ...(msg.card_url && b.send_card !== false ? [{ type: 'image', url: msg.card_url }] : [])] } } }) });
  if (!r.ok) { const err = (await r.text()).slice(0, 250); await save({ status: 'failed', body: text, actions: [], error: err, decided_by: who, decided_at: new Date().toISOString() }); return json({ error: `ManyChat did not accept the message: ${err}` }, 502); }
  await save({ status: 'sent', body: text, actions: [], error: null, decided_by: who, decided_at: new Date().toISOString() });
  await sb.from('chat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id);
  return json({ ok: true, sent: true, text });
});
