// The AI brain: ManyChat sends every customer message here (External Request). POST JSON, key in  x-api-key: <LEAD_INTAKE_KEY>  or  ?key=
//   { "channel": "messenger" | "instagram" | "whatsapp", "subscriber_id": "...", "name": "...", "text": "the customer's message", "message_id": "...", "lang": "en" | "tl" | "taglish" }
// Mode (Admin → Settings → AI chat): off = nothing happens; suggest = the AI writes a DRAFT for staff, nothing is sent; auto = the reply goes out at once unless a safety check fails.
// Answer: { ok, status: "reply" | "held" | "handover" | "duplicate" | "off", reply, mode } — put `reply` in the chatbot's next message; when it is empty, send nothing (staff or a draft is handling it).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cardForLog } from '../_shared/estimatecard.ts';
import { buildSystem, decide, guardReply, parseMode, runBrain, fallbackFor } from '../_shared/brain.ts';
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
  const sub = clip(b.subscriber_id ?? b.user_id, 80), text = clip(b.text ?? b.message, 2000); const channel = ['messenger', 'instagram', 'whatsapp'].includes(String(b.channel)) ? String(b.channel) : 'other';
  if (!sub || !text) return json({ error: 'subscriber_id and text are required' }, 400);

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle(); const cfg = (st?.data as Record<string, unknown> | undefined)?.chat_ai as { mode?: string; model?: string } | undefined; const mode = parseMode(cfg?.mode);
  let { data: conv } = await sb.from('chat_conversations').select('*').eq('channel', channel).eq('subscriber_id', sub).maybeSingle();
  if (!conv) { const { data: c, error } = await sb.from('chat_conversations').insert({ channel, subscriber_id: sub, name: clip(b.name, 120) || null }).select('*').single(); if (error) return json({ error: error.message }, 500); conv = c; }
  const lang = parseLang(b.lang ?? conv.lang); if (conv.lang !== lang) await sb.from('chat_conversations').update({ lang }).eq('id', conv.id);
  const ext = clip(b.message_id, 120) || null;
  const { error: de } = await sb.from('chat_messages').insert({ conversation_id: conv.id, direction: 'in', body: text, status: 'received', external_id: ext });
  if (de) return de.code === '23505' ? json({ ok: true, status: 'duplicate', reply: '', mode }) : json({ error: de.message }, 500);   // the same message again (a retry): handled once
  await sb.from('chat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id);
  if (mode === 'off') return json({ ok: true, status: 'off', reply: '', mode });
  if (conv.status === 'Needs a person') return json({ ok: true, status: 'handover', reply: '', mode });                    // a person has this conversation: the AI stays silent
  if (!env('ANTHROPIC_API_KEY')) return json({ ok: true, status: 'held', reply: '', mode, note: 'ANTHROPIC_API_KEY is not set' });

  const [{ data: hist }, { data: rb }] = await Promise.all([
    sb.from('chat_messages').select('direction, body, status').eq('conversation_id', conv.id).in('status', ['received', 'sent', 'approved']).order('created_at', { ascending: false }).limit(14),
    sb.from('ai_rulebook').select('version, sections').eq('status', 'published').maybeSingle(),
  ]);
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [];
  for (const m of (hist ?? []).reverse()) { const role = m.direction === 'in' ? 'user' : 'assistant'; if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += `\n${m.body}`; else messages.push({ role, content: m.body }); }
  if (!messages.length || messages[0].role !== 'user') messages.unshift({ role: 'user', content: text });
  const model = cfg?.model || env('CHAT_AI_MODEL') || 'claude-haiku-5-5';
  const system = buildSystem({ sections: (rb?.sections as { key: string; title: string; body: string }[]) ?? [], version: rb?.version ?? null, lang, customerName: (conv as { name?: string | null }).name, companyPhone: (st?.data as { company?: { phone?: string } } | undefined)?.company?.phone });
  const callModel = async (sys: string, msgs: unknown[], tools: unknown) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 500, system: sys, tools, messages: msgs }) });
    if (!r.ok) throw new Error(`AI error ${r.status}`); return await r.json();
  };
  const exec = makeExec({ sb, base: env('SUPABASE_URL'), key, conv, lang });
  const brain = await runBrain({ mode, system, messages, callModel, exec, maxRounds: 3 });
  const d = decide(mode, brain, lang); const flags = guardReply(brain.bookReply ?? brain.reply, { amounts: brain.amounts, booked: brain.booked }).violations;
  const card = d.kind === 'reply' || d.kind === 'draft' ? cardForLog(brain.log, env('APP_URL') || 'https://ops.topmop.ph') : null;
  const common = { card_url: card, conversation_id: conv.id, direction: 'out', model, rulebook_version: rb?.version ?? null, tool_log: brain.log, error: brain.error ?? null };

  if (d.kind === 'draft') {                                                                                                                // suggest: a draft for staff, nothing is sent
    await sb.from('chat_messages').insert({ ...common, body: d.text, status: 'draft', actions: brain.actions, flags });
    await sb.from('alert_outbox').insert({ kind: 'chat', title: 'AI reply waits for approval', body: `${conv.name ?? 'A customer'} (${channel}) wrote: ${text.slice(0, 120)}`, link: '/ai-chat' });
    return json({ ok: true, status: 'held', reply: '', mode });
  }
  if (d.kind === 'handover') {
    await sb.from('chat_conversations').update({ status: 'Needs a person', human_reason: d.reason.slice(0, 300) }).eq('id', conv.id);
    await sb.from('alert_outbox').insert({ kind: 'chat', title: 'Chat needs a person', body: `${conv.name ?? 'A customer'} (${channel}): ${d.reason.slice(0, 160)}`, link: '/ai-chat' });
    if (mode === 'suggest') { await sb.from('chat_messages').insert({ ...common, body: d.text || fallbackFor(lang), status: 'draft', actions: [], flags: [d.reason] }); return json({ ok: true, status: 'held', reply: '', mode }); }
    await sb.from('chat_messages').insert({ ...common, body: d.text, status: 'sent', flags: [d.reason] });
    return json({ ok: true, status: 'handover', reply: d.text, mode });                                                                         // the customer gets the safe sentence, a person takes over
  }
  await sb.from('chat_messages').insert({ ...common, body: d.text, status: 'sent' });
  return json({ ok: true, status: 'reply', reply: d.text, mode, card_url: card ?? '' });
});
