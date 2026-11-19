// The AI brain: ManyChat sends every customer message here (External Request). POST JSON, key in  x-api-key: <LEAD_INTAKE_KEY>  or  ?key=
//   { "channel": "messenger" | "instagram" | "whatsapp", "subscriber_id": "...", "name": "...", "text": "the customer's message", "message_id": "...", "lang": "en" | "tl" | "taglish" }
// Mode (Admin → Settings → AI chat): off = nothing happens; suggest = the AI writes a DRAFT for staff, nothing is sent; auto = the reply goes out at once unless a safety check fails.
// Answer: { ok, status: "queued" | "reply" | "held" | "handover" | "duplicate" | "off", reply, mode } ("queued": the work continues after the answer because ManyChat waits only 10 seconds) — put `reply` in the chatbot's next message; when it is empty, send nothing (staff or a draft is handling it).
// V2: structured memory (chat_conversations.context), delivered-only history, idempotent conversation creation, one answer per burst (per-conversation lock + debounce + drain), intent/stage, reply validation with repair and safe fallbacks.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cardForLog, explainsPanelCount, panelGuideUrl } from '../_shared/estimatecard.ts';
import { contactSince, olderThanAi, mobileFrom, returningByTag, type ReturningInfo, BOOKING_HOWTO, MSG_SPLIT, PHOTO_MARKER, PHOTO_THANKS, isPhotoMessage, honorificFor, buildSystem, composeFirst, flattenMessages, splitMessages, decide, guardReply, parseMode, runBrain, fallbackFor, type Brain } from '../_shared/brain.ts';
import { questionTopic, analyzeDelivered, applyDelivered, bookingForm, contextBlock, foldMessages, isAcknowledgment, readContext, type ChatContext } from '../_shared/chatcontext.ts';
import { ackReply, fallbackReply, repairReply, validateReply, type Check } from '../_shared/validate.ts';
import { buildHistory } from '../_shared/chathistory.ts';
import { makeExec } from '../_shared/chatexec.ts';
import { parseLang } from '../chat-availability/logic.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-api-key, authorization, apikey', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const safeEq = (a: string, b: string) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0); return d === 0; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Out = { status: string; reply: string; card_url?: string; note?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const key = env('LEAD_INTAKE_KEY'); const given = req.headers.get('x-api-key') ?? new URL(req.url).searchParams.get('key') ?? '';
  if (!key || !safeEq(given, key)) return json({ error: 'Invalid or missing key' }, 401);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null; if (!b) return json({ error: 'Send a JSON body' }, 400);
  // The body can be the short one we wrote, or ManyChat's own "Add Full Contact Data" (safer: ManyChat builds that JSON, so quotes, emoji and line breaks in a customer's message can never break it).
  const c = ((b.contact ?? b.data ?? {}) as Record<string, unknown>), pick = (...ks: string[]) => { for (const k of ks) { const v = b[k] ?? c[k]; if (v !== undefined && v !== null && String(v).trim() !== '') return v; } return ''; };
  const sub = clip(pick('subscriber_id', 'user_id', 'id'), 80), text = clip(pick('text', 'message', 'last_input_text', 'last_text_input'), 2000);
  const channel = ['messenger', 'instagram', 'whatsapp'].includes(String(b.channel)) ? String(b.channel) : String(b.channel ?? '') === '' ? 'messenger' : 'other';
  const honorific = honorificFor(pick('gender'));   // ManyChat's contact data carries the customer's gender when Facebook shares it
  b.name = pick('name', 'first_name'); b.message_id = pick('message_id') || `${sub}-${text.slice(0, 40)}-${Math.floor(Date.now() / 20000)}`; b.lang = pick('lang', 'ai_lang');
  if (!sub || !text) return json({ error: 'subscriber_id and text are required' }, 400);

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle(); const cfg = (st?.data as Record<string, unknown> | undefined)?.chat_ai as { mode?: string; model?: string; ai_started_on?: string } | undefined; const mode = parseMode(cfg?.mode);
  // Idempotent creation: two messages of a new customer arriving together can both try to create the conversation; the loser simply reads the winner's row.
  let { data: conv } = await sb.from('chat_conversations').select('*').eq('channel', channel).eq('subscriber_id', sub).maybeSingle();
  if (!conv) {
    const ins = await sb.from('chat_conversations').insert({ channel, subscriber_id: sub, name: clip(b.name, 120) || null }).select('*').single();
    if (ins.error) { if (ins.error.code !== '23505') return json({ error: ins.error.message }, 500); const again = await sb.from('chat_conversations').select('*').eq('channel', channel).eq('subscriber_id', sub).maybeSingle(); conv = again.data; if (!conv) return json({ error: 'Could not open the conversation' }, 500); } else conv = ins.data;
  }
  const lang0 = parseLang(b.lang ?? conv.lang), lang = lang0 === 'tl' ? 'taglish' : lang0;   // never pure Tagalog: English with po, or light Taglish
  if (conv.lang !== lang) await sb.from('chat_conversations').update({ lang }).eq('id', conv.id);
  const ext = clip(b.message_id, 120) || null;
  const { error: de } = await sb.from('chat_messages').insert({ conversation_id: conv.id, direction: 'in', body: text, status: 'received', external_id: ext });
  if (de) return de.code === '23505' ? json({ ok: true, status: 'duplicate', reply: '', mode }) : json({ error: de.message }, 500);   // the same message again (a retry): handled once
  await sb.from('chat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id);
  const photo = isPhotoMessage(text);
  if (photo) await sb.from('alert_outbox').insert({ kind: 'chat', title: 'Customer sent a photo', body: `${conv.name ?? 'A customer'} (${channel}) sent a photo. Technical team: please review it.`, link: '/ai-chat' });   // the AI promises the technical team will look at it

  // A returning customer: staff marked them, their mobile number matches a client we already have, or a ManyChat tag says so. The AI then skips the welcome and does not treat them as a new inquiry.
  let returning: ReturningInfo | null = null;
  try {
    const rc = conv as { returning_customer?: boolean; returning_note?: string | null; client_id?: string | null };
    const mob = mobileFrom(pick('phone', 'optin_phone', 'mobile', 'mobile_number'), text); const tag = returningByTag(b.tags ?? c.tags);
    let clientId = rc.client_id ?? undefined; let why = rc.returning_customer ? (rc.returning_note || 'Staff marked this customer as returning') : '';
    if (!why && mob) { const { data: cl } = await sb.from('clients').select('id, name').eq('mobile', mob).is('deleted_at', null).lt('created_at', (conv as { created_at?: string }).created_at ?? new Date().toISOString()).limit(1); if (cl?.length) { clientId = cl[0].id; why = `Matched existing client ${cl[0].name} by mobile number`; } }
    if (!why && tag) why = `ManyChat tag "${tag}"`;
    // Ask ManyChat about the contact once (their first message here): its tags, and when they first became a contact. A contact from before the AI chat started was already dealing with our team.
    if (!why && env('MANYCHAT_API_TOKEN')) {
      const { count: inCount } = await sb.from('chat_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conv.id).eq('direction', 'in');
      if ((inCount ?? 0) <= 1) {
        const r = await fetch(`https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${encodeURIComponent(sub)}`, { headers: { Authorization: `Bearer ${env('MANYCHAT_API_TOKEN')}` }, signal: AbortSignal.timeout(3000) }).catch(() => null);
        const info = r && r.ok ? ((await r.json().catch(() => ({}))) as { data?: Record<string, unknown> }).data : undefined;
        if (info) {
          const t2 = returningByTag(info.tags); const since = contactSince(b, c, info);
          const { data: first } = await sb.from('chat_conversations').select('created_at').order('created_at', { ascending: true }).limit(1);
          const startedOn = (cfg as { ai_started_on?: string } | undefined)?.ai_started_on || first?.[0]?.created_at;
          if (t2) why = `ManyChat tag "${t2}"`; else if (olderThanAi(since, startedOn)) why = `A ManyChat contact since ${String(since).slice(0, 10)}, before the AI chat started`;
          const { data: seen } = await sb.from('alert_outbox').select('id').eq('title', 'ManyChat contact fields').limit(1);
          if (!seen?.length) await sb.from('alert_outbox').insert({ kind: 'chat', title: 'ManyChat contact fields', body: `ManyChat sends these fields for a contact: ${Object.keys(info).join(', ')}. ${since ? `First-contact date found: ${since.slice(0, 10)}.` : 'No first-contact date was found, so old contacts cannot be recognised automatically (tags and mobile numbers still work).'}`, link: '/ai-chat' });
        }
      }
    }
    if (why) {
      const info: ReturningInfo = { note: why };
      if (clientId) {
        const [{ data: cl }, { data: jb }, { data: iq }] = await Promise.all([
          sb.from('clients').select('name, mobile, email, address').eq('id', clientId).maybeSingle(),
          sb.from('jobs').select('number, status, start_at').eq('client_id', clientId).is('deleted_at', null).order('start_at', { ascending: false }).limit(4),
          sb.from('inquiries').select('stage, details, created_at').eq('client_id', clientId).is('deleted_at', null).order('created_at', { ascending: false }).limit(3)]);
        if (cl) info.client = { name: cl.name, mobile: cl.mobile, email: cl.email, address: cl.address };
        info.jobs = (jb ?? []).map((j: { number: string; status: string; start_at: string }) => `${j.number} (${j.status}, ${String(j.start_at).slice(0, 10)})`);
        info.inquiries = (iq ?? []).map((q: { stage: string; details: string | null; created_at: string }) => `${String(q.created_at).slice(0, 10)} ${q.stage}: ${String(q.details ?? '').slice(0, 70)}`);
      }
      returning = info;
      if (!rc.returning_customer) {                                                                         // newly recognised: remember it and tell the team once
        const { error: re } = await sb.from('chat_conversations').update({ returning_customer: true, returning_note: why, ...(clientId && !rc.client_id ? { client_id: clientId } : {}) }).eq('id', conv.id);
        if (!re) await sb.from('alert_outbox').insert({ kind: 'chat', title: 'Returning customer messaged', body: `${conv.name ?? 'A customer'} (${channel}): ${why}. The AI will not treat them as new.`, link: '/ai-chat' });
      }
    }
  } catch (e) { console.error('returning check', (e as Error).message); }   // never stop the chat because of this check
  if (mode === 'off') return json({ ok: true, status: 'off', reply: '', mode });
  if (conv.status === 'Needs a person') return json({ ok: true, status: 'handover', reply: '', mode });                    // a person has this conversation: the AI stays silent
  if (!env('ANTHROPIC_API_KEY')) return json({ ok: true, status: 'held', reply: '', mode, note: 'ANTHROPIC_API_KEY is not set' });

  const token = env('MANYCHAT_API_TOKEN'), edge = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const queued = !!edge?.waitUntil && !(mode === 'auto' && !token);          // ManyChat waits only 10 seconds: on Supabase the work continues after we have answered; without a token a full-mode reply is awaited and returned
  const model = cfg?.model || env('CHAT_AI_MODEL') || 'claude-haiku-5-5';
  const appUrl = env('APP_URL') || 'https://ops.topmop.ph';
  let legacy = false;                                                          // true when migration 0133 has not been applied yet: the old single-message behaviour

  /** One batch: the customer's unprocessed messages are folded into the context and answered once. */
  const processBatch = async (pending: { id: string; body: string }[]): Promise<Out> => {
    const ids = pending.map((m) => m.id); const texts = pending.map((m) => isPhotoMessage(m.body) ? PHOTO_MARKER : m.body); const lastText = texts[texts.length - 1] ?? text;
    if (!legacy) await sb.from('chat_messages').update({ handled_at: new Date().toISOString() }).in('id', ids);   // from now on these messages count as taken care of
    try {
      const [{ data: hist }, { data: rb }, { data: cur }] = await Promise.all([
        sb.from('chat_messages').select('direction, body, status').eq('conversation_id', conv.id).in('status', ['received', 'sent', 'approved']).order('created_at', { ascending: false }).limit(40),
        sb.from('ai_rulebook').select('version, sections').eq('status', 'published').maybeSingle(),
        sb.from('chat_conversations').select('context, inquiry_id').eq('id', conv.id).maybeSingle(),
      ]);
      const rows = (hist ?? []).reverse() as { direction: 'in' | 'out'; body: string; status: string }[];
      const messages = buildHistory(rows).map((t) => ({ role: t.role, content: t.content as unknown }));
      if (!messages.length) messages.push({ role: 'user', content: lastText });
      const deliveredAi = rows.filter((m) => m.direction === 'out' && (m.status === 'sent' || m.status === 'approved')).map((m) => m.body);
      // the context: what we knew + what the customer just told us; "already said" and "last question" are read from replies that were really delivered
      const ctx: ChatContext = foldMessages(applyDelivered(readContext(cur?.context ?? conv.context), analyzeDelivered(deliveredAi)), texts);
      if (!legacy) await sb.from('chat_conversations').update({ context: ctx }).eq('id', conv.id);
      const vctx = (first: boolean): Check => ({ ctx, intent: ctx.intent, customerText: texts.join(' '), previousAi: deliveredAi.slice(-3), first });

      const { count: sentBefore } = await sb.from('chat_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conv.id).eq('direction', 'out').in('status', ['sent', 'approved', 'draft']); const first = (sentBefore ?? 0) === 0 && !returning;   // the first reply of a conversation starts with the welcome
      let booking: { number: string; date: string; status: string } | null = null;                                              // a booking this chat already made for the customer: the AI must never contradict it
      if (cur?.inquiry_id ?? conv.inquiry_id) { const { data: qs } = await sb.from('quotations').select('id').eq('inquiry_id', cur?.inquiry_id ?? conv.inquiry_id).is('deleted_at', null); if (qs?.length) { const { data: js } = await sb.from('jobs').select('number, start_at, status').in('quotation_id', qs.map((x: { id: string }) => x.id)).is('deleted_at', null).not('status', 'in', '("Cancelled","Rescheduled")').order('created_at', { ascending: false }).limit(1); if (js?.length) booking = { number: js[0].number, date: String(js[0].start_at).slice(0, 10), status: js[0].status }; } }

      let brain: Brain = { reply: '', actions: [], amounts: [], booked: false, log: [] };
      const allAck = texts.every((t) => isAcknowledgment(t));
      if (ctx.intent === 'complaint' || ctx.intent === 'human_assistance') {                                               // no model needed: a person takes over
        const f = fallbackReply(vctx(first)); brain = { ...brain, reply: f.text, humanReason: ctx.intent === 'complaint' ? 'The customer has a complaint' : 'The customer asked for a person', actions: [{ type: 'needs_human', input: { reason: ctx.intent } }] };
      } else if (allAck && ctx.intent !== 'booking_request' && !first && !photo) {                                         // "okay", "thanks": a brief acknowledgment, no model, no booking offer
        brain = { ...brain, reply: ackReply() };
      } else {
        const system = buildSystem({ returning, booking, firstMessage: first, honorific, context: contextBlock(ctx), sections: (rb?.sections as { key: string; title: string; body: string }[]) ?? [], version: rb?.version ?? null, lang, customerName: (conv as { name?: string | null }).name, companyPhone: (st?.data as { company?: { phone?: string } } | undefined)?.company?.phone });
        const callModel = async (sys: string, msgs: unknown[], tools: unknown) => {
          const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 1200, system: sys, tools, messages: msgs }) });
          if (!r.ok) throw new Error(`AI error ${r.status}`); return await r.json();
        };
        const exec = makeExec({ booking, sb, base: env('SUPABASE_URL'), key, conv, lang, context: [ctx.location ?? '', ...texts].join(' ').slice(-600) });
        brain = await runBrain({ mode, system, messages, callModel, exec, maxRounds: 3, check: (r) => (/^NO_ANSWER\W*$/i.test(r.trim()) ? [] : validateReply(r, vctx(first))) });
      }
      const isNoAnswer = /^NO_ANSWER\W*$/i.test(brain.reply.trim());
      let flags = guardReply(brain.bookReply ?? brain.reply, { amounts: brain.amounts, booked: brain.booked }).violations;
      if (!brain.error && !isNoAnswer && !brain.bookReply) {
        if (!brain.reply.trim()) {                                                                                         // the AI wrote nothing: a safe sentence, never a blank draft
          const f = ctx.intent === 'booking_request' && ctx.location && ctx.service ? { text: `Sure po, happy to help you book!${MSG_SPLIT}${bookingForm(ctx)}`, handover: false } : fallbackReply(vctx(first), 'empty'); brain.reply = f.text; if (f.handover && !brain.humanReason) brain.humanReason = 'The AI could not answer';
        } else if (brain.violations?.length) {                                                                              // still not clean after one rewrite: remove the offending sentences, else a safe sentence
          const repaired = repairReply(brain.reply, brain.violations, vctx(first));
          if (repaired && validateReply(repaired, vctx(first)).length === 0) { flags = [...flags, `repaired: ${brain.violations.join('; ')}`.slice(0, 240)]; brain.reply = repaired; }
          else { const f = fallbackReply(vctx(first)); flags = [...flags, `replaced by a safe sentence: ${brain.violations.join('; ')}`.slice(0, 240)]; brain.reply = f.text; if (f.handover && !brain.humanReason) brain.humanReason = 'The reply could not be made safe'; }
        }
      }
      if (!brain.reply.trim() && !brain.error && photo) brain.reply = PHOTO_THANKS;
      const d0 = decide(mode, brain, lang);
      // the welcome already asks for the location: the AI part must not ask it again
      const noDupAsk = (t: string) => t.split(MSG_SPLIT).map((part) => part.split(/(?<=[.!?])\s+/).filter((x) => !(x.includes('?') && questionTopic(x) === 'location')).join(' ').trim()).filter(Boolean).join(MSG_SPLIT);
      const d = first && (d0.kind === 'draft' || d0.kind === 'send') ? { ...d0, text: composeFirst(noDupAsk(d0.text), honorific) } : d0;
      const card = d.kind === 'send' || d.kind === 'draft' ? (cardForLog(brain.log, appUrl) ?? (explainsPanelCount(lastText, brain.reply) ? panelGuideUrl(appUrl) : null)) : null;   // one picture per reply: the estimate card, else the panel-counting guide
      const common = { card_url: card, conversation_id: conv.id, direction: 'out', model, rulebook_version: rb?.version ?? null, tool_log: brain.log, error: brain.error ?? (brain.reply.trim() ? (brain.note ? brain.note.slice(0, 240) : null) : `The AI wrote no text: ${brain.note ?? ''}`.slice(0, 240)) };
      const put = async (row: Record<string, unknown>) => { let r = await sb.from('chat_messages').insert(row); if (r.error && /card_url/i.test(r.error.message)) { const { card_url: _c, ...rest } = row; r = await sb.from('chat_messages').insert(rest); } return r.error?.message ?? null; };   // works before migration 0126 too
      if (d.kind === 'draft') {                                                                                            // suggest: a draft for staff, nothing is sent
        const pe = await put({ ...common, body: d.text, status: 'draft', actions: brain.actions, flags });
        if (pe) return { status: 'error', reply: '', note: `Could not save the draft: ${pe.slice(0, 160)}` };
        await sb.from('alert_outbox').insert({ kind: 'chat', title: 'AI reply waits for approval', body: `${conv.name ?? 'A customer'} (${channel}) wrote: ${lastText.slice(0, 120)}`, link: '/ai-chat' });
        return { status: 'held', reply: '' };
      }
      if (d.kind === 'handover') {
        await sb.from('chat_conversations').update({ status: 'Needs a person', human_reason: d.reason.slice(0, 300) }).eq('id', conv.id);
        await sb.from('alert_outbox').insert({ kind: 'chat', title: 'Chat needs a person', body: `${conv.name ?? 'A customer'} (${channel}): ${d.reason.slice(0, 160)}`, link: '/ai-chat' });
        if (mode === 'suggest') { await put({ ...common, body: d.text || fallbackFor(lang), status: 'draft', actions: [], flags: [d.reason] }); return { status: 'held', reply: '' }; }
        await put({ ...common, body: d.text, status: 'sent', flags: [d.reason] });
        return { status: 'handover', reply: d.text };                                                                    // the customer gets the safe sentence, a person takes over
      }
      await put({ ...common, body: d.text, status: 'sent' });
      return { status: 'reply', reply: queued && token ? d.text : flattenMessages(d.text), card_url: card ?? '' };
    } catch (e) {
      if (!legacy) await sb.from('chat_messages').update({ handled_at: null }).in('id', ids);                          // not answered: the next message retries them
      await sb.from('alert_outbox').insert({ kind: 'chat', title: 'The AI chat had an error', body: String((e as Error).message ?? e).slice(0, 160), link: '/ai-chat' });
      return { status: 'error', reply: '', note: String((e as Error).message ?? e).slice(0, 160) };
    }
  };

  const push = async (o: Out) => {                                                                                       // full mode on Supabase: the reply goes to the customer through the ManyChat API
    if (!(queued && mode === 'auto' && token && o.reply)) return;
    const r = await fetch('https://api.manychat.com/fb/sending/sendContent', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriber_id: sub, data: { version: 'v2', content: { messages: [...splitMessages(o.reply).map((t) => ({ type: 'text', text: t })), ...(o.card_url ? [{ type: 'image', url: o.card_url }] : [])] } } }) });
    if (!r.ok) await sb.from('alert_outbox').insert({ kind: 'chat', title: 'A full-mode reply could not be sent', body: `ManyChat said ${r.status}: ${(await r.text()).slice(0, 120)}`, link: '/ai-chat' });
  };
  /** One worker per conversation: it takes the lock, answers everything the customer has written (one batch at a time) and lets go. A request that cannot take the lock leaves its message to the worker that has it. */
  const worker = async (): Promise<Out> => {
    if (queued) await sleep(Number(env('CHAT_DEBOUNCE_MS') || 2500));                                                  // a customer who types several messages in a row gets one answer
    const lk = await sb.rpc('chat_lock', { p_conv: conv.id, p_secs: 90 }); const locked = lk.error ? true : lk.data === true;   // fail open when migration 0133 is missing
    if (!locked) return { status: 'merged', reply: '' };
    let last: Out = { status: 'merged', reply: '' };
    try {
      for (let i = 0; i < 4; i++) {
        const q = await sb.from('chat_messages').select('id, body').eq('conversation_id', conv.id).eq('direction', 'in').is('handled_at', null).order('created_at', { ascending: true }).limit(30);
        legacy = !!q.error; const pend = legacy ? [{ id: '', body: text }] : (q.data ?? []) as { id: string; body: string }[];
        if (!pend.length) break;
        last = await processBatch(pend); await push(last);
        if (legacy || !queued || last.status === 'error') break;                                                          // without the queue ManyChat is waiting for this one answer
      }
    } finally { await sb.rpc('chat_unlock', { p_conv: conv.id }); }
    return last;
  };
  if (!queued) { const o = await worker(); return json({ ok: o.status !== 'error', ...o, mode }); }
  edge!.waitUntil!(worker().catch(async (e) => { await sb.from('alert_outbox').insert({ kind: 'chat', title: 'The AI chat had an error', body: String((e as Error).message ?? e).slice(0, 160), link: '/ai-chat' }); }));
  return json({ ok: true, status: 'queued', reply: '', mode });
});
