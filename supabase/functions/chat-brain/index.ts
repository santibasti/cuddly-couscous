// The AI brain: ManyChat sends every customer message here (External Request). POST JSON, key in  x-api-key: <LEAD_INTAKE_KEY>  or  ?key=
//   { "channel": "messenger" | "instagram" | "whatsapp", "subscriber_id": "...", "name": "...", "text": "the customer's message", "message_id": "...", "lang": "en" | "tl" | "taglish" }
// Mode (Admin → Settings → AI chat): off = nothing happens; suggest = the AI writes a DRAFT for staff, nothing is sent; auto = the reply goes out at once unless a safety check fails.
// Answer: { ok, status: "queued" | "reply" | "held" | "handover" | "duplicate" | "off", reply, mode } ("queued": the work continues after the answer because ManyChat waits only 10 seconds) — put `reply` in the chatbot's next message; when it is empty, send nothing (staff or a draft is handling it).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cardForLog, explainsPanelCount, panelGuideUrl } from '../_shared/estimatecard.ts';
import { BOOKING_HOWTO, honorificFor, wantsToBook, buildSystem, composeFirst, flattenMessages, splitMessages, decide, guardReply, parseMode, runBrain, fallbackFor } from '../_shared/brain.ts';
import { makeExec } from '../_shared/chatexec.ts';
import { parseLang } from '../chat-availability/logic.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-api-key, authorization, apikey', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const safeEq = (a: string, b: string) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0); return d === 0; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const key = env('LEAD_INTAKE_KEY'); const given = req.headers.get('x-api-key') ?? new URL(req.url).searchParams.get('key') ?? '';
  if (!key || !safeEq(given, key)) return json({ error: 'Invalid or missing key' }, 401);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null; if (!b) return json({ error: 'Send a JSON body' }, 400);
  // The body can be the short one we wrote, or ManyChat's own "Add Full Contact Data" (safer: ManyChat builds that JSON, so quotes, emoji and line breaks in a customer's message can never break it).
  const c = ((b.contact ?? b.data ?? {}) as Record<string, unknown>), pick = (...ks: string[]) => { for (const k of ks) { const v = b[k] ?? c[k]; if (v !== undefined && v !== null && String(v).trim() !== '') return v; } return ''; };
  const sub = clip(pick('subscriber_id', 'user_id', 'id'), 80), text = clip(pick('text', 'message', 'last_input_text', 'last_text_input'), 2000); const channel = ['messenger', 'instagram', 'whatsapp'].includes(String(b.channel)) ? String(b.channel) : String(b.channel ?? '') === '' ? 'messenger' : 'other';
  const honorific = honorificFor(pick('gender'));   // ManyChat's contact data carries the customer's gender when Facebook shares it
  b.name = pick('name', 'first_name'); b.message_id = pick('message_id') || `${sub}-${text.slice(0, 40)}-${Math.floor(Date.now() / 20000)}`; b.lang = pick('lang', 'ai_lang');
  if (!sub || !text) return json({ error: 'subscriber_id and text are required' }, 400);

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle(); const cfg = (st?.data as Record<string, unknown> | undefined)?.chat_ai as { mode?: string; model?: string } | undefined; const mode = parseMode(cfg?.mode);
  let { data: conv } = await sb.from('chat_conversations').select('*').eq('channel', channel).eq('subscriber_id', sub).maybeSingle();
  if (!conv) { const { data: c, error } = await sb.from('chat_conversations').insert({ channel, subscriber_id: sub, name: clip(b.name, 120) || null }).select('*').single(); if (error) return json({ error: error.message }, 500); conv = c; }
  const lang0 = parseLang(b.lang ?? conv.lang), lang = lang0 === 'tl' ? 'taglish' : lang0;   // never pure Tagalog: English with po, or Taglish
  if (conv.lang !== lang) await sb.from('chat_conversations').update({ lang }).eq('id', conv.id);
  const ext = clip(b.message_id, 120) || null;
  const { error: de } = await sb.from('chat_messages').insert({ conversation_id: conv.id, direction: 'in', body: text, status: 'received', external_id: ext });
  if (de) return de.code === '23505' ? json({ ok: true, status: 'duplicate', reply: '', mode }) : json({ error: de.message }, 500);   // the same message again (a retry): handled once
  await sb.from('chat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id);
  if (mode === 'off') return json({ ok: true, status: 'off', reply: '', mode });
  if (conv.status === 'Needs a person') return json({ ok: true, status: 'handover', reply: '', mode });                    // a person has this conversation: the AI stays silent
  if (!env('ANTHROPIC_API_KEY')) return json({ ok: true, status: 'held', reply: '', mode, note: 'ANTHROPIC_API_KEY is not set' });

  // ManyChat gives an External Request only 10 seconds. The AI needs longer, so the work runs after we have answered ("queued"): in suggest mode the draft appears in AI Chat; in full mode the reply is pushed to the customer with the ManyChat API token. Without that token a full-mode reply is awaited and returned as before.
  const run = async (): Promise<Response> => {
  const [{ data: hist }, { data: rb }] = await Promise.all([
    sb.from('chat_messages').select('direction, body, status').eq('conversation_id', conv.id).in('status', ['received', 'sent', 'approved']).order('created_at', { ascending: false }).limit(14),
    sb.from('ai_rulebook').select('version, sections').eq('status', 'published').maybeSingle(),
  ]);
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [];
  for (const m of (hist ?? []).reverse()) { const role = m.direction === 'in' ? 'user' : 'assistant'; if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += `\n${m.body}`; else messages.push({ role, content: m.body }); }
  if (!messages.length || messages[0].role !== 'user') messages.unshift({ role: 'user', content: text });
  const model = cfg?.model || env('CHAT_AI_MODEL') || 'claude-haiku-5-5';
  const { count: sentBefore } = await sb.from('chat_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conv.id).eq('direction', 'out').in('status', ['sent', 'approved', 'draft']); const first = (sentBefore ?? 0) === 0;   // the first reply of a conversation starts with the welcome
  let booking: { number: string; date: string; status: string } | null = null;                                              // a booking this chat already made for the customer: the AI must never contradict it
  if (conv.inquiry_id) { const { data: qs } = await sb.from('quotations').select('id').eq('inquiry_id', conv.inquiry_id).is('deleted_at', null); if (qs?.length) { const { data: js } = await sb.from('jobs').select('number, start_at, status').in('quotation_id', qs.map((x: { id: string }) => x.id)).is('deleted_at', null).not('status', 'in', '("Cancelled","Rescheduled")').order('created_at', { ascending: false }).limit(1); if (js?.length) booking = { number: js[0].number, date: String(js[0].start_at).slice(0, 10), status: js[0].status }; } }
  const system = buildSystem({ booking, firstMessage: first, honorific, sections: (rb?.sections as { key: string; title: string; body: string }[]) ?? [], version: rb?.version ?? null, lang, customerName: (conv as { name?: string | null }).name, companyPhone: (st?.data as { company?: { phone?: string } } | undefined)?.company?.phone });
  const callModel = async (sys: string, msgs: unknown[], tools: unknown) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 2500, system: sys, tools, messages: msgs }) });
    if (!r.ok) throw new Error(`AI error ${r.status}`); return await r.json();
  };
  const exec = makeExec({ booking, sb, base: env('SUPABASE_URL'), key, conv, lang, context: [...(hist ?? []).filter((m) => m.direction === 'in').map((m) => String(m.body ?? '')), text].join(' ').slice(-600) });
  const brain = await runBrain({ mode, system, messages, callModel, exec, maxRounds: 3 });
  if (!brain.reply.trim() && !brain.error && wantsToBook(text)) { brain.reply = BOOKING_HOWTO; brain.note = undefined; }   // the model wrote nothing but the customer wants to book: send the booking-details request
  const d0 = decide(mode, brain, lang); const d = first && (d0.kind === 'draft' || d0.kind === 'send') ? { ...d0, text: composeFirst(d0.text, honorific) } : d0; const flags = guardReply(brain.bookReply ?? brain.reply, { amounts: brain.amounts, booked: brain.booked }).violations;
  const appUrl = env('APP_URL') || 'https://ops.topmop.ph'; const card = d.kind === 'send' || d.kind === 'draft' ? (cardForLog(brain.log, appUrl) ?? (explainsPanelCount(text, brain.reply) ? panelGuideUrl(appUrl) : null)) : null;   // one picture per reply: the estimate card, else the panel-counting guide
  const common = { card_url: card, conversation_id: conv.id, direction: 'out', model, rulebook_version: rb?.version ?? null, tool_log: brain.log, error: brain.error ?? (brain.reply.trim() ? (brain.note ? brain.note.slice(0, 240) : null) : `The AI wrote no text: ${brain.note ?? ''}`.slice(0, 240)) };

  const put = async (row: Record<string, unknown>) => { let r = await sb.from('chat_messages').insert(row); if (r.error && /card_url/i.test(r.error.message)) { const { card_url: _c, ...rest } = row; r = await sb.from('chat_messages').insert(rest); } return r.error?.message ?? null; };   // works before migration 0126 too
  if (d.kind === 'draft') {                                                                                                                // suggest: a draft for staff, nothing is sent
    const pe = await put({ ...common, body: d.text, status: 'draft', actions: brain.actions, flags });
    if (pe) return json({ ok: false, status: 'error', reply: '', mode, note: `Could not save the draft: ${pe.slice(0, 160)}` });
    await sb.from('alert_outbox').insert({ kind: 'chat', title: 'AI reply waits for approval', body: `${conv.name ?? 'A customer'} (${channel}) wrote: ${text.slice(0, 120)}`, link: '/ai-chat' });
    return json({ ok: true, status: 'held', reply: '', mode });
  }
  if (d.kind === 'handover') {
    await sb.from('chat_conversations').update({ status: 'Needs a person', human_reason: d.reason.slice(0, 300) }).eq('id', conv.id);
    await sb.from('alert_outbox').insert({ kind: 'chat', title: 'Chat needs a person', body: `${conv.name ?? 'A customer'} (${channel}): ${d.reason.slice(0, 160)}`, link: '/ai-chat' });
    if (mode === 'suggest') { await put({ ...common, body: d.text || fallbackFor(lang), status: 'draft', actions: [], flags: [d.reason] }); return json({ ok: true, status: 'held', reply: '', mode }); }
    await put({ ...common, body: d.text, status: 'sent', flags: [d.reason] });
    return json({ ok: true, status: 'handover', reply: d.text, mode });                                                                         // the customer gets the safe sentence, a person takes over
  }
  await put({ ...common, body: d.text, status: 'sent' });
  return json({ ok: true, status: 'reply', reply: edge?.waitUntil && token ? d.text : flattenMessages(d.text), mode, card_url: card ?? '' });
  };
  const token = env('MANYCHAT_API_TOKEN'), edge = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (!edge?.waitUntil || (mode === 'auto' && !token)) return await run();
  edge.waitUntil((async () => {
    try {
      const res = await run(); const j = await res.json().catch(() => ({})) as { reply?: string; card_url?: string };
      if (mode === 'auto' && j.reply) {
        const r = await fetch('https://api.manychat.com/fb/sending/sendContent', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriber_id: sub, data: { version: 'v2', content: { messages: [...splitMessages(j.reply).map((t) => ({ type: 'text', text: t })), ...(j.card_url ? [{ type: 'image', url: j.card_url }] : [])] } } }) });
        if (!r.ok) await sb.from('alert_outbox').insert({ kind: 'chat', title: 'A full-mode reply could not be sent', body: `ManyChat said ${r.status}: ${(await r.text()).slice(0, 120)}`, link: '/ai-chat' });
      }
    } catch (e) { await sb.from('alert_outbox').insert({ kind: 'chat', title: 'The AI chat had an error', body: String((e as Error).message ?? e).slice(0, 160), link: '/ai-chat' }); }
  })());
  return json({ ok: true, status: 'queued', reply: '', mode });
});
