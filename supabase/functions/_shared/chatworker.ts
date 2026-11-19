// The worker of the customer-service chat: takes the per-conversation lock, answers everything the customer has written (one batch at a time) and lets go.
// Shared by chat-brain (a customer message) and chat-recover (a message that was left unanswered because a worker stopped or crashed).
import { cardForLog, explainsPanelCount, panelGuideUrl } from './estimatecard.ts';
import { type ReturningInfo, type Mode, type Honorific, type Brain, PHOTO_MARKER, PHOTO_THANKS, MSG_SPLIT, isPhotoMessage, buildSystem, composeFirst, flattenMessages, splitMessages, decide, guardReply, runBrain, fallbackFor } from './brain.ts';
import { BOOKING_SEND_FORM, questionTopic, analyzeDelivered, applyDelivered, contextBlock, foldMessages, isAcknowledgment, readContext, type ChatContext } from './chatcontext.ts';
import { ackReply, fallbackReply, repairReply, validateReply, type Check } from './validate.ts';
import { buildHistory } from './chathistory.ts';
import { makeExec } from './chatexec.ts';

// deno-lint-ignore no-explicit-any
type Sb = any;
export type Out = { status: string; reply: string; card_url?: string; note?: string };
export interface WorkerDeps {
  sb: Sb; env: (k: string) => string; conv: { id: string; channel: string; subscriber_id: string; name?: string | null; inquiry_id?: string | null; context?: unknown; lang?: string | null; status?: string; [k: string]: unknown }; sub: string; channel: string; text: string; lang: string; honorific: Honorific; returning: ReturningInfo | null; photo: boolean;
  mode: Mode; cfg?: { model?: string } | undefined; st?: { data?: unknown } | null; queued: boolean; token: string; key: string; model: string; appUrl: string; debounceMs: number;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A failure that is worth trying again later (the AI service is busy or unreachable) rather than handing the customer to a person at once. */
export const isTransientError = (m: string) => /AI error (408|409|425|429|5\d\d)|timed? ?out|fetch failed|network|econn|aborted|temporarily/i.test(String(m ?? ''));
const GIVE_UP_MIN = 10;   // after this long without an answer a transient failure becomes a handover to a person

export function createWorker(d: WorkerDeps): () => Promise<Out> {
  const { sb, env, conv, sub, channel, text, lang, honorific, returning, photo, mode, st, queued, token, key, model, appUrl } = d;
  let legacy = false;                                                          // true when migration 0133 has not been applied yet: the old single-message behaviour

  /** One batch: the customer's unprocessed messages are folded into the context and answered once. */
  const processBatch = async (pending: { id: string; body: string; created_at?: string }[]): Promise<Out> => {
    const ids = pending.map((m) => m.id); const texts = pending.map((m) => isPhotoMessage(m.body) ? PHOTO_MARKER : m.body); const lastText = texts[texts.length - 1] ?? text;
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
      } else if (ctx.intent === 'booking_request' && ctx.location && !ctx.form_sent && !photo && !texts.some((t) => /\b(how much|magkano|price|presyo|rate|ocular)\b/i.test(t))) {   // the customer wants to book and the city is known: the booking-details form goes out as its own message (no model needed)
        brain = { ...brain, reply: BOOKING_SEND_FORM };
      } else if (allAck && ctx.intent !== 'booking_request' && !first && !photo) {                                         // "okay", "thanks": a brief acknowledgment, no model, no booking offer
        brain = { ...brain, reply: ackReply() };
      } else {
        const system = buildSystem({ returning, booking, firstMessage: first, honorific, context: contextBlock(ctx), sections: (rb?.sections as { key: string; title: string; body: string }[]) ?? [], version: rb?.version ?? null, lang, customerName: (conv as { name?: string | null }).name, companyPhone: (st?.data as { company?: { phone?: string } } | undefined)?.company?.phone });
        const callModel = async (sys: string, msgs: unknown[], tools: unknown) => {
          const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 1200, system: sys, tools, messages: msgs }) });
          if (!r.ok) throw new Error(`AI error ${r.status}`); return await r.json();
        };
        const exec = makeExec({ noHumanAlert: true, booking, sb, base: env('SUPABASE_URL'), key, conv, lang, context: [ctx.location ?? '', ...texts].join(' ').slice(-600) });
        brain = await runBrain({ mode, system, messages, callModel, exec, maxRounds: 3, check: (r) => (/^NO_ANSWER\W*$/i.test(r.trim()) ? [] : validateReply(r, vctx(first))) });
      }
      const isNoAnswer = /^NO_ANSWER\W*$/i.test(brain.reply.trim());
      if (brain.error && isTransientError(brain.error) && !legacy && (Date.now() - Date.parse(pending[0]?.created_at ?? new Date().toISOString())) < GIVE_UP_MIN * 60_000) return { status: 'retry', reply: '', note: brain.error.slice(0, 160) };   // nothing is saved and nothing is marked: the next pass (a new message or the recovery job) tries again
      let flags = guardReply(brain.bookReply ?? brain.reply, { amounts: brain.amounts, booked: brain.booked }).violations;
      if (!brain.error && !isNoAnswer && !brain.bookReply) {
        if (!brain.reply.trim()) {                                                                                         // the AI wrote nothing: a safe sentence, never a blank draft
          const f = fallbackReply(vctx(first), 'empty'); brain.reply = f.text; if (f.handover && !brain.humanReason) brain.humanReason = 'The AI could not answer';
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
      const d = first && (d0.kind === 'draft' || d0.kind === 'send') ? { ...d0, text: composeFirst(noDupAsk(d0.text)) } : d0;
      const card = d.kind === 'send' || d.kind === 'draft' ? (cardForLog(brain.log, appUrl) ?? (explainsPanelCount(lastText, brain.reply) ? panelGuideUrl(appUrl) : null)) : null;   // one picture per reply: the estimate card, else the panel-counting guide
      const common = { card_url: card, conversation_id: conv.id, direction: 'out', model, rulebook_version: rb?.version ?? null, tool_log: brain.log, error: brain.error ?? (brain.reply.trim() ? (brain.note ? brain.note.slice(0, 240) : null) : `The AI wrote no text: ${brain.note ?? ''}`.slice(0, 240)) };
      // The reply and the "handled" mark are saved in ONE database transaction (chat_answer): a crash before it leaves the messages unhandled (they are retried), a crash after it leaves nothing to retry.
      const store = async (row: Record<string, unknown>): Promise<string | null> => {
        if (!legacy) { const r = await sb.rpc('chat_answer', { p_ids: ids, p_row: row }); if (!r.error) return null; if (!/chat_answer|function|does not exist|schema cache/i.test(r.error.message)) return r.error.message; }
        let r = await sb.from('chat_messages').insert(row); if (r.error && /card_url/i.test(r.error.message)) { const { card_url: _c, ...rest } = row; r = await sb.from('chat_messages').insert(rest); }
        if (!r.error && !legacy) await sb.from('chat_messages').update({ handled_at: new Date().toISOString() }).in('id', ids);   // an older database: not atomic, but marked only after the reply is stored
        return r.error?.message ?? null;
      };
      if (d.kind === 'draft') {                                                                                            // suggest: a draft for staff, nothing is sent
        const pe = await store({ ...common, body: d.text, status: 'draft', actions: brain.actions, flags });
        if (pe) return { status: 'error', reply: '', note: `Could not save the draft: ${pe.slice(0, 160)}` };
        await sb.from('alert_outbox').insert({ kind: 'chat', title: 'AI reply waits for approval', body: `${conv.name ?? 'A customer'} (${channel}) wrote: ${lastText.slice(0, 120)}`, link: '/ai-chat' });
        return { status: 'held', reply: '' };
      }
      if (d.kind === 'handover') {
        await sb.from('chat_conversations').update({ status: 'Needs a person', human_reason: d.reason.slice(0, 300) }).eq('id', conv.id);
        await sb.from('alert_outbox').insert({ kind: 'chat', title: 'Chat needs a person', body: `${conv.name ?? 'A customer'} (${channel}): ${d.reason.slice(0, 160)}`, link: '/ai-chat' });
        if (mode === 'suggest') { await store({ ...common, body: d.text || fallbackFor(lang), status: 'draft', actions: [], flags: [d.reason] }); return { status: 'held', reply: '' }; }
        await store({ ...common, body: d.text, status: 'sent', flags: [d.reason] });
        return { status: 'handover', reply: d.text };                                                                    // the customer gets the safe sentence, a person takes over
      }
      await store({ ...common, body: d.text, status: 'sent' });
      return { status: 'reply', reply: queued && token ? d.text : flattenMessages(d.text), card_url: card ?? '' };
    } catch (e) {
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
    if (d.debounceMs > 0) await sleep(d.debounceMs);                                                                     // a customer who types several messages in a row gets one answer
    const lk = await sb.rpc('chat_lock', { p_conv: conv.id, p_secs: 90 }); const locked = lk.error ? true : lk.data === true;   // fail open when migration 0133 is missing
    if (!locked) return { status: 'merged', reply: '' };
    let last: Out = { status: 'merged', reply: '' };
    try {
      for (let i = 0; i < 4; i++) {
        const q = await sb.from('chat_messages').select('id, body, created_at').eq('conversation_id', conv.id).eq('direction', 'in').is('handled_at', null).order('created_at', { ascending: true }).limit(30);
        legacy = !!q.error; const pend = legacy ? [{ id: '', body: text }] : (q.data ?? []) as { id: string; body: string; created_at?: string }[];
        if (!pend.length) break;
        last = await processBatch(pend); await push(last);
        if (legacy || !queued || last.status === 'error' || last.status === 'retry') break;                                                          // without the queue ManyChat is waiting for this one answer
      }
    } finally { await sb.rpc('chat_unlock', { p_conv: conv.id }); }
    return last;
  };
  return worker;
}
