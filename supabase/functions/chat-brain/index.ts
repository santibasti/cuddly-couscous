// The AI brain: ManyChat sends every customer message here (External Request). POST JSON, key in  x-api-key: <LEAD_INTAKE_KEY>  or  ?key=
//   { "channel": "messenger" | "instagram" | "whatsapp", "subscriber_id": "...", "name": "...", "text": "the customer's message", "message_id": "...", "lang": "en" | "tl" | "taglish" }
// Mode (Admin → Settings → AI chat): off = nothing happens; suggest = the AI writes a DRAFT for staff, nothing is sent; auto = the reply goes out at once unless a safety check fails.
// Answer: { ok, status: "queued" | "reply" | "held" | "handover" | "duplicate" | "off", reply, mode } ("queued": the work continues after the answer because ManyChat waits only 10 seconds) — put `reply` in the chatbot's next message; when it is empty, send nothing (staff or a draft is handling it).
// V2: structured memory (chat_conversations.context), delivered-only history, idempotent conversation creation, one answer per burst (per-conversation lock + debounce + drain), intent/stage, reply validation with repair and safe fallbacks.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { type ReturningInfo, isPhotoMessage, honorificFor, parseMode } from '../_shared/brain.ts';
import { resolveContact, type CandidateJobs } from '../_shared/contact.ts';
import type { Candidate, Identity, JobLine } from '../_shared/identity.ts';
import { manilaDay } from '../chat-availability/logic.ts';
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

  // V2.3: who is this? New contact, previous contact (talked to TopMop before, nothing verified) or existing client (matched to a TopMop client record). The result is kept on the conversation, the existing client's active bookings are loaded, and the AI is told before it writes anything.
  let returning: ReturningInfo | null = null; let jobs: JobLine[] = []; let staleJobs: JobLine[] = []; let referenced: Candidate[] = []; let candidateJobs: CandidateJobs[] = []; let identity: Identity | undefined;
  try {
    const aiStart = cfg?.ai_started_on || (await sb.from('chat_conversations').select('created_at').order('created_at', { ascending: true }).limit(1)).data?.[0]?.created_at;   // when the AI first answered real customers
    const rcv = await resolveContact({ sb, env, conv: conv as Record<string, unknown>, sub, payloads: [b, c], text, aiStartedOn: aiStart, today: manilaDay(Date.now()) });
    returning = rcv.returning; jobs = rcv.jobs; staleJobs = rcv.staleJobs; referenced = rcv.referenced; candidateJobs = rcv.candidateJobs; identity = rcv.identity;
    if (rcv.mc.fetched) {
      const { data: seen } = await sb.from('alert_outbox').select('id').eq('title', 'ManyChat contact fields').limit(1);
      if (!seen?.length) await sb.from('alert_outbox').insert({ kind: 'chat', title: 'ManyChat contact fields', body: `ManyChat sends these fields for a contact: ${(rcv.mc.fields ?? []).join(', ')}. ${rcv.mc.subscribed ? `First-contact date found: ${rcv.mc.subscribed.slice(0, 10)}.` : 'No first-contact date was found, so old contacts cannot be recognised by date (tags, the contact\'s mobile number and staff links still work).'} ManyChat gives contact fields only, never the old message history.`, link: '/ai-chat' });
    }
  } catch (e) {   // FAIL CLOSED: if we cannot tell who this customer is, the AI must not answer (it could treat a returning client as new and send a booking form or call their date full). The message is kept and unhandled; the recovery job retries.
    console.error('contact check', (e as Error).message);
    const since = new Date(Date.now() - 30 * 60_000).toISOString(); const { data: dup } = await sb.from('alert_outbox').select('id').eq('title', 'The AI could not check who this customer is').gte('created_at', since).limit(1);
    if (!dup?.length) await sb.from('alert_outbox').insert({ kind: 'chat', title: 'The AI could not check who this customer is', body: `${conv.name ?? 'A customer'} (${channel}): ${String((e as Error).message).slice(0, 120)}. No reply was sent or drafted; the system retries every minute. Reply by hand if it is urgent.`, link: '/ai-chat' });
    return json({ ok: true, status: 'held', reply: '', mode, note: 'contact check failed' });
  }
  if (mode === 'off') return json({ ok: true, status: 'off', reply: '', mode });
  if (conv.status === 'Needs a person') return json({ ok: true, status: 'handover', reply: '', mode });                    // a person has this conversation: the AI stays silent
  if (!env('ANTHROPIC_API_KEY')) return json({ ok: true, status: 'held', reply: '', mode, note: 'ANTHROPIC_API_KEY is not set' });

  const token = env('MANYCHAT_API_TOKEN'), edge = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const queued = !!edge?.waitUntil && !(mode === 'auto' && !token);          // ManyChat waits only 10 seconds: on Supabase the work continues after we have answered; without a token a full-mode reply is awaited and returned
  const worker = createWorker({ sb, env, conv, sub, channel, text, lang, honorific, returning, identity, jobs, staleJobs, referenced, candidateJobs, photo, mode, cfg, st, queued, token, key, model: cfg?.model || env('CHAT_AI_MODEL') || 'claude-haiku-5-5', appUrl: env('APP_URL') || 'https://ops.topmop.ph', debounceMs: queued ? Number(env('CHAT_DEBOUNCE_MS') || 2500) : 0 });
  if (!queued) { const o = await worker(); return json({ ok: o.status !== 'error', ...o, mode }); }
  edge!.waitUntil!(worker().catch(async (e) => { await sb.from('alert_outbox').insert({ kind: 'chat', title: 'The AI chat had an error', body: String((e as Error).message ?? e).slice(0, 160), link: '/ai-chat' }); }));
  return json({ ok: true, status: 'queued', reply: '', mode });
});
