// The AI brain: ManyChat sends every customer message here (External Request). POST JSON, key in  x-api-key: <LEAD_INTAKE_KEY>  or  ?key=
//   { "channel": "messenger" | "instagram" | "whatsapp", "subscriber_id": "...", "name": "...", "text": "the customer's message", "message_id": "...", "lang": "en" | "tl" | "taglish" }
// Mode (Admin → Settings → AI chat): off = nothing happens; suggest = the AI writes a DRAFT for staff, nothing is sent; auto = the reply goes out at once unless a safety check fails.
// Answer: { ok, status: "queued" | "reply" | "held" | "handover" | "duplicate" | "off", reply, mode } ("queued": the work continues after the answer because ManyChat waits only 10 seconds) — put `reply` in the chatbot's next message; when it is empty, send nothing (staff or a draft is handling it).
// V2: structured memory (chat_conversations.context), delivered-only history, idempotent conversation creation, one answer per burst (per-conversation lock + debounce + drain), intent/stage, reply validation with repair and safe fallbacks.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { contactSince, olderThanAi, mobileFrom, returningByTag, type ReturningInfo, isPhotoMessage, honorificFor, parseMode } from '../_shared/brain.ts';
import { createWorker } from '../_shared/chatworker.ts';
import { readContext } from '../_shared/chatcontext.ts';
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
    const aiStart = (cfg as { ai_started_on?: string } | undefined)?.ai_started_on;   // set once by the owner: when the AI first answered real customers
    if (!why && aiStart && olderThanAi((conv as { created_at?: string }).created_at, aiStart, 0)) why = 'This conversation started before the AI chat was switched on; our team handled it';   // works without the ManyChat token, on every message
    // Ask ManyChat about the contact once (their first message here): its tags, and when they first became a contact. A contact from before the AI chat started was already dealing with our team.
    const prevCtx = readContext((conv as { context?: unknown }).context);
    if (!why && env('MANYCHAT_API_TOKEN')) {
      if (!prevCtx.returning_checked) {   // once per conversation (not only on the first message: conversations that existed before this check are looked at on their next message)
        const r = await fetch(`https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${encodeURIComponent(sub)}`, { headers: { Authorization: `Bearer ${env('MANYCHAT_API_TOKEN')}` }, signal: AbortSignal.timeout(3000) }).catch(() => null);
        const info = r && r.ok ? ((await r.json().catch(() => ({}))) as { data?: Record<string, unknown> }).data : undefined;
        if (info) {
          await sb.from('chat_conversations').update({ context: { ...prevCtx, returning_checked: true } }).eq('id', conv.id);
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
  const worker = createWorker({ sb, env, conv, sub, channel, text, lang, honorific, returning, photo, mode, cfg, st, queued, token, key, model: cfg?.model || env('CHAT_AI_MODEL') || 'claude-haiku-5-5', appUrl: env('APP_URL') || 'https://ops.topmop.ph', debounceMs: queued ? Number(env('CHAT_DEBOUNCE_MS') || 2500) : 0 });
  if (!queued) { const o = await worker(); return json({ ok: o.status !== 'error', ...o, mode }); }
  edge!.waitUntil!(worker().catch(async (e) => { await sb.from('alert_outbox').insert({ kind: 'chat', title: 'The AI chat had an error', body: String((e as Error).message ?? e).slice(0, 160), link: '/ai-chat' }); }));
  return json({ ok: true, status: 'queued', reply: '', mode });
});
