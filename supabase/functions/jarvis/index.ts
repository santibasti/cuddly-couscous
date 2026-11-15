// Jarvis: the owner's voice assistant on Telegram.
//  • POST {action:'brief'}                  morning brief (called by the database scheduler at 7:00 Manila time)
//  • POST {action:'alert', id}              an instant alert (discount requested, quotation accepted), called by the database the moment it is recorded
//  • POST {action:'inquiry', id}            a new inquiry arrived (Facebook, lead form …)
//  • POST {action:'ask', chat_id, message_id, text? , voice?}   the owner wrote or sent a voice note to the bot (forwarded by telegram-webhook)
//  • POST {action:'test'}                   "Jarvis is online" check
//  • The Jarvis screen in the app (owner login, Authorization: Bearer <jwt>): {action:'panel'} live figures, {action:'chat', text, history} an answer, {action:'speak', text} the voice as an mp3,
//    and raw audio with header x-jarvis-action: transcribe → {text}. The owner is the profile with role 'owner'.
// Every call must carry the header x-webhook-secret = WEBHOOK_SECRET (this function refuses to run without that secret). Read-only: Jarvis never changes any business data.
// Secrets: TELEGRAM_BOT_TOKEN, WEBHOOK_SECRET, ANTHROPIC_API_KEY, JARVIS_OWNER_TELEGRAM_ID (your Telegram id, from /myid; several: comma separated),
//          ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID. Optional: JARVIS_MODEL (default claude-sonnet-5-5), JARVIS_ADDRESS (how it addresses you), JARVIS_SPEAK_NAMES=0 (do not say client names),
//          JARVIS_WEB=0 (turn off the web search; on by default), ELEVENLABS_TTS_MODEL (default eleven_multilingual_v2), ELEVENLABS_STT_MODEL (default scribe_v1; scribe_v2 is tried if that one is refused). Deploy with --no-verify-jwt.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { addDays, alertIsInstant, alertLine, chunks, cleanNote, invoiceBalance, knowledgeBlock, MAX_KNOWLEDGE_CHARS, pickSections, splitKnowledge, invoiceTotal, LEARN_RULES, manilaDay, MAX_NOTES, memoryBlock, NOTE_KINDS, ownerIds, personaPrompt, round2, speakable, TOOL_TOPIC } from './logic.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-jarvis-action', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const safeEq = (a: string, b: string) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0); return d === 0; };
// deno-lint-ignore no-explicit-any
type Db = any;
const db = (): Db => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

/* ---------------- Telegram ---------------- */
const TG = (m: string) => `https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/${m}`;
async function tgText(chat: number, text: string) {
  for (const part of chunks(text)) { const r = await fetch(TG('sendMessage'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: part }) }); if (!r.ok) console.error('sendMessage', r.status, (await r.text()).slice(0, 200)); }
}
async function tgFile(method: 'sendVoice' | 'sendAudio', field: 'voice' | 'audio', chat: number, bytes: Uint8Array, mime: string, name: string): Promise<boolean> {
  const f = new FormData(); f.set('chat_id', String(chat)); f.set(field, new Blob([bytes], { type: mime }), name);
  const r = await fetch(TG(method), { method: 'POST', body: f });
  if (!r.ok) console.error(method, r.status, (await r.text()).slice(0, 200));
  return r.ok;
}
async function tgDownload(fileId: string): Promise<Uint8Array> {
  const info = await (await fetch(TG('getFile'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: fileId }) })).json();
  const path = info?.result?.file_path; if (!path) throw new Error('Telegram would not give the file');
  const r = await fetch(`https://api.telegram.org/file/bot${env('TELEGRAM_BOT_TOKEN')}/${path}`); if (!r.ok) throw new Error(`download ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/* ---------------- voice (ElevenLabs) ---------------- */
async function tts(text: string, format: string): Promise<Uint8Array | null> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env('ELEVENLABS_VOICE_ID'))}?output_format=${format}`, {
    method: 'POST', headers: { 'xi-api-key': env('ELEVENLABS_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: env('ELEVENLABS_TTS_MODEL') || 'eleven_multilingual_v2', voice_settings: { stability: 0.55, similarity_boost: 0.75 } }) });
  if (!res.ok) { console.error('tts', format, res.status, (await res.text()).slice(0, 200)); return null; }
  return new Uint8Array(await res.arrayBuffer());
}
/** Sends the text, and the same words as a voice message when a voice is connected. The text always goes first so nothing is lost if the voice fails. */
async function deliver(chat: number, text: string) {
  await tgText(chat, text);
  if (!env('ELEVENLABS_API_KEY') || !env('ELEVENLABS_VOICE_ID')) return;
  const spoken = speakable(text, 1500); if (!spoken) return;
  try {
    const ogg = await tts(spoken, 'opus_48000_64');                       // a Telegram voice bubble needs OGG / Opus
    if (ogg && await tgFile('sendVoice', 'voice', chat, ogg, 'audio/ogg', 'jarvis.ogg')) return;
    const mp3 = await tts(spoken, 'mp3_44100_128');                       // fallback: an audio file
    if (mp3) await tgFile('sendAudio', 'audio', chat, mp3, 'audio/mpeg', 'jarvis.mp3');
  } catch (e) { console.error('voice', String(e)); }
}
async function transcribe(bytes: Uint8Array, mime = 'audio/ogg', name = 'voice.ogg'): Promise<string> {
  for (const model of [env('ELEVENLABS_STT_MODEL') || 'scribe_v1', 'scribe_v2']) {
    const f = new FormData(); f.set('model_id', model); f.set('file', new Blob([bytes], { type: mime }), name);
    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': env('ELEVENLABS_API_KEY') }, body: f });
    if (r.ok) return String((await r.json())?.text ?? '').trim();
    console.error('stt', model, r.status, (await r.text()).slice(0, 200)); if (![400, 404, 422].includes(r.status)) break;
  }
  return '';
}

/* ---------------- idempotency and memory ---------------- */
/** true the first time a key is seen (calls may be repeated by Telegram, cron or the database). */
async function once(sb: Db, key: string): Promise<boolean> {
  const { error } = await sb.from('jarvis_log').insert({ key });
  if (error && error.code === '23505') return false;
  if (error) console.error('jarvis_log', error.message);
  return true;
}
/** One line in the activity log shown on the Jarvis screen (kind of event only, never the question or the answer). */
async function logEvent(sb: Db, kind: string, text: string) { try { await sb.from('jarvis_events').insert({ kind, text: text.slice(0, 120) }); } catch (e) { console.error('event', String(e)); } }
type Turn = { role: 'user' | 'assistant'; content: string };
async function remember(sb: Db, chat: number): Promise<Turn[]> {
  const { data } = await sb.from('jarvis_memory').select('turns, updated_at').eq('chat_id', chat).maybeSingle();
  if (!data || Date.now() - new Date(data.updated_at).getTime() > 3 * 3600_000) return [];
  return (data.turns as Turn[]).slice(-10);
}
const store = (sb: Db, chat: number, turns: Turn[]) => sb.from('jarvis_memory').upsert({ chat_id: chat, turns: turns.slice(-10), updated_at: new Date().toISOString() });

/* ---------------- long-term memory: notes and favourite topics ---------------- */
type Note = { id: number; kind: string; text: string };
async function loadNotes(sb: Db): Promise<Note[]> { try { const { data } = await sb.from('jarvis_notes').select('id, kind, text').order('id', { ascending: true }).limit(MAX_NOTES); return (data ?? []) as Note[]; } catch { return []; } }
async function loadTopics(sb: Db): Promise<{ topic: string; n: number }[]> { try { const { data } = await sb.from('jarvis_topics').select('topic, n').order('n', { ascending: false }).limit(8); return data ?? []; } catch { return []; } }
const memory = async (sb: Db) => memoryBlock(await loadNotes(sb), await loadTopics(sb));
async function saveNote(sb: Db, kind: unknown, text: unknown) {
  const t = cleanNote(text); if (!t) return { saved: false, reason: 'That cannot be kept as a note (too short, or it holds a link, a number or a secret).' };
  const k = (NOTE_KINDS as readonly string[]).includes(String(kind)) ? String(kind) : 'fact';
  const notes = await loadNotes(sb); const same = notes.find((n) => n.text.toLowerCase() === t.toLowerCase());
  if (same) return { saved: true, id: same.id, already: true };
  if (notes.length >= MAX_NOTES) return { saved: false, reason: 'Memory is full. Ask the owner which note to forget first.' };
  const { data, error } = await sb.from('jarvis_notes').insert({ kind: k, text: t }).select('id').maybeSingle();
  if (error) return { saved: false, reason: 'Could not save it.' };
  await logEvent(sb, 'memory', 'Learned a new note'); return { saved: true, id: data?.id };
}
async function forgetNote(sb: Db, id: unknown) {
  const n = Number(id); if (!Number.isInteger(n)) return { forgotten: false };
  const { error } = await sb.from('jarvis_notes').delete().eq('id', n); if (!error) await logEvent(sb, 'memory', 'Forgot a note');
  return { forgotten: !error };
}
async function countTopics(sb: Db, used: string[]) {
  for (const topic of new Set(used.map((u) => TOOL_TOPIC[u]).filter(Boolean))) {
    try { const { data } = await sb.from('jarvis_topics').select('n').eq('topic', topic).maybeSingle(); await sb.from('jarvis_topics').upsert({ topic, n: (data?.n ?? 0) + 1, last_at: new Date().toISOString() }); } catch { /* learning is best effort */ }
  }
}

/* ---------------- company knowledge base ---------------- */
type KRow = { num: number; title: string; body: string };
async function loadKnowledge(sb: Db): Promise<KRow[]> { try { const { data } = await sb.from('jarvis_knowledge').select('num, title, body').order('num', { ascending: true }); return (data ?? []) as KRow[]; } catch { return []; } }
async function saveKnowledge(sb: Db, text: string) {
  const t = String(text ?? '').trim(); if (t.length < 200) return { error: 'That looks too short to be a knowledge document.' };
  if (t.length > MAX_KNOWLEDGE_CHARS) return { error: 'The document is too long (the limit is about 250,000 characters).' };
  const secs = splitKnowledge(t); if (!secs.length) return { error: 'I could not find any sections. Use "# " headings to separate them.' };
  const del = await sb.from('jarvis_knowledge').delete().gte('num', 0); if (del.error) return { error: 'Could not replace the old document.' };
  const ins = await sb.from('jarvis_knowledge').insert(secs.map((x) => ({ num: x.num, title: x.title.slice(0, 160), body: x.body, chars: x.body.length, updated_at: new Date().toISOString() })));
  if (ins.error) return { error: 'Could not save the document.' };
  await logEvent(sb, 'memory', `Knowledge base updated · ${secs.length} sections`); return { ok: true, sections: secs.length, chars: t.length };
}
const knowledgeList = async (sb: Db) => { try { const { data } = await sb.from('jarvis_knowledge').select('num, title, chars').order('num', { ascending: true }); return data ?? []; } catch { return []; } };

/* ---------------- business data (read-only) ---------------- */
const names = async (sb: Db, table: string, col: string, ids: string[]): Promise<Record<string, string>> => {
  const u = [...new Set(ids.filter(Boolean))]; if (!u.length) return {};
  const { data } = await sb.from(table).select(`id, ${col}`).in('id', u);
  return Object.fromEntries((data ?? []).map((r: Record<string, string>) => [r.id, r[col]]));
};
const clampDays = (n: unknown, d = 7) => Math.min(60, Math.max(1, Math.round(Number(n) || d)));
const today = () => manilaDay(Date.now());

async function getJobs(sb: Db, from: string, to: string) {
  const { data } = await sb.from('jobs').select('id, number, client_id, start_at, status, leader_id, crew_ids').is('deleted_at', null)
    .gte('start_at', `${from}T00:00:00`).lte('start_at', `${to}T23:59:59`).order('start_at').limit(40);
  const jobs = data ?? [];
  const [cn, en] = await Promise.all([names(sb, 'clients', 'name', jobs.map((j: Db) => j.client_id)), names(sb, 'employees', 'full_name', jobs.map((j: Db) => j.leader_id))]);
  return jobs.map((j: Db) => ({ number: j.number, client: cn[j.client_id] ?? '', day: String(j.start_at).slice(0, 10), start: String(j.start_at).slice(11, 16), status: j.status,
    leader: j.leader_id ? en[j.leader_id] ?? 'assigned' : 'NOT ASSIGNED', crew: Array.isArray(j.crew_ids) ? j.crew_ids.length : 0 }));
}
async function getAttendance(sb: Db, date: string) {
  const { data } = await sb.from('attendance').select('employee_id, kind, late_min, clock_in').is('deleted_at', null).eq('date', date).limit(200);
  const rows = data ?? []; const en = await names(sb, 'employees', 'full_name', rows.map((r: Db) => r.employee_id));
  return { date, present: rows.filter((r: Db) => r.kind === 'Present').length,
    absent: rows.filter((r: Db) => r.kind === 'Absent').map((r: Db) => en[r.employee_id]),
    late: rows.filter((r: Db) => r.kind === 'Present' && r.late_min > 0).map((r: Db) => ({ name: en[r.employee_id], minutes: r.late_min })) };
}
async function getPending(sb: Db) {
  const [d, e, p, q] = await Promise.all([
    sb.from('discount_requests').select('number, requested_amount, job_id, client_id, submitted_at').is('deleted_at', null).eq('status', 'Pending Admin Approval').order('submitted_at').limit(10),
    sb.from('expenses').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('approval', 'Pending'),
    sb.from('payments').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'Pending Verification'),
    sb.from('quotations').select('number, client_id, sent_at').is('deleted_at', null).eq('status', 'Sent').lt('sent_at', new Date(Date.now() - 3 * 86400_000).toISOString()).limit(10)]);
  const cn = await names(sb, 'clients', 'name', [...(d.data ?? []), ...(q.data ?? [])].map((r: Db) => r.client_id));
  return { discount_requests_waiting: (d.data ?? []).map((r: Db) => ({ number: r.number, client: cn[r.client_id] ?? '', amount_off: r.requested_amount })),
    expenses_awaiting_approval: e.count ?? 0, payments_awaiting_verification: p.count ?? 0,
    quotations_sent_over_3_days_ago_without_answer: (q.data ?? []).map((r: Db) => ({ number: r.number, client: cn[r.client_id] ?? '' })) };
}
async function getLeads(sb: Db, days: number) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await sb.from('inquiries').select('client_id, stage, source, details, created_at').is('deleted_at', null).gte('created_at', since).order('created_at', { ascending: false }).limit(30);
  const rows = data ?? []; const cn = await names(sb, 'clients', 'name', rows.map((r: Db) => r.client_id)); const by: Record<string, number> = {};
  for (const r of rows) by[r.stage] = (by[r.stage] ?? 0) + 1;
  return { days, total: rows.length, by_stage: by, latest: rows.slice(0, 6).map((r: Db) => ({ client: cn[r.client_id] ?? '', source: r.source, stage: r.stage, about: String(r.details ?? '').slice(0, 90) })) };
}
async function getReceivables(sb: Db) {
  const { data: inv } = await sb.from('invoices').select('id, number, client_id, due_date, items, discount, vat_mode, vat_rate').is('deleted_at', null).eq('status', 'Approved').limit(500);
  const invoices = inv ?? []; if (!invoices.length) return { outstanding_total: 0, overdue_total: 0, overdue_count: 0, top: [] };
  const { data: pays } = await sb.from('payments').select('invoice_id, amount, wht_amount, status, reversed, method, cheque_status, deleted_at').in('invoice_id', invoices.map((i: Db) => i.id)).limit(5000);
  const byInv: Record<string, Db[]> = {}; for (const p of pays ?? []) (byInv[p.invoice_id] ??= []).push(p);
  const cn = await names(sb, 'clients', 'name', invoices.map((i: Db) => i.client_id)); const t = today();
  const rows = invoices.map((i: Db) => ({ number: i.number, client: cn[i.client_id] ?? '', due: i.due_date, balance: invoiceBalance(i, byInv[i.id] ?? []) })).filter((r: Db) => r.balance > 0.5);
  const overdue = rows.filter((r: Db) => r.due < t);
  return { outstanding_total: round2(rows.reduce((s: number, r: Db) => s + r.balance, 0)), unpaid_invoices: rows.length, overdue_total: round2(overdue.reduce((s: number, r: Db) => s + r.balance, 0)), overdue_count: overdue.length,
    top: [...rows].sort((a: Db, b: Db) => b.balance - a.balance).slice(0, 5), note: 'approximate: invoice total minus verified payments' };
}
async function getMoneyIn(sb: Db, days: number) {
  const from = addDays(today(), -days + 1);
  const { data } = await sb.from('payments').select('amount, date, status, reversed, method, cheque_status, wht_amount').is('deleted_at', null).gte('date', from).lte('date', today()).limit(2000);
  const ok = (data ?? []).filter((p: Db) => !p.reversed && (p.status ?? 'Verified') === 'Verified' && (p.method !== 'Cheque' || (p.cheque_status ?? 'Cleared') === 'Cleared'));
  return { from, to: today(), payments: ok.length, received: round2(ok.reduce((s: number, p: Db) => s + p.amount, 0)) };
}
async function getQuotes(sb: Db, days: number) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await sb.from('quotations').select('status, items, discount, vat_mode, vat_rate, decided_at').is('deleted_at', null).in('status', ['Approved', 'Rejected']).gte('decided_at', since).limit(300);
  const rows = data ?? []; const ok = rows.filter((r: Db) => r.status === 'Approved');
  return { days, approved: ok.length, approved_value: round2(ok.reduce((s: number, r: Db) => s + invoiceTotal(r), 0)), rejected: rows.length - ok.length };
}
async function getHandovers(sb: Db) {
  const { data } = await sb.from('workflows').select('job_id, finish_at, rep_client_at').is('deleted_at', null).not('finish_at', 'is', null).is('rep_client_at', null).limit(40);
  const ids = (data ?? []).map((w: Db) => w.job_id); if (!ids.length) return { waiting: [] };
  const { data: jobs } = await sb.from('jobs').select('number, client_id, status, start_at').in('id', ids).is('deleted_at', null).neq('status', 'Cancelled').gte('start_at', `${addDays(today(), -21)}T00:00:00`);
  const cn = await names(sb, 'clients', 'name', (jobs ?? []).map((j: Db) => j.client_id));
  return { waiting: (jobs ?? []).map((j: Db) => ({ job: j.number, client: cn[j.client_id] ?? '', day: String(j.start_at).slice(0, 10) })) };
}
const safe = async (p: Promise<unknown>) => { try { return await p; } catch (e) { return { unavailable: String((e as Error).message ?? e).slice(0, 120) }; } };

/* ---------------- the AI ---------------- */
const TOOLS = [
  { name: 'get_jobs', description: 'Job orders starting between two dates (Manila dates, YYYY-MM-DD), with client, start time, status, leader and crew count.', input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
  { name: 'get_attendance', description: 'Crew attendance for one date: how many present, who is absent, who was late.', input_schema: { type: 'object', properties: { date: { type: 'string' } }, required: ['date'] } },
  { name: 'get_pending_approvals', description: 'What waits for the owner: discount requests, expenses, payments to verify, quotations unanswered for over 3 days.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_leads', description: 'New inquiries in the last N days (count by stage, latest few).', input_schema: { type: 'object', properties: { days: { type: 'number' } }, required: ['days'] } },
  { name: 'get_receivables', description: 'Unpaid invoices: total outstanding, overdue amount and count, biggest balances.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_money_in', description: 'Payments received (verified) in the last N days.', input_schema: { type: 'object', properties: { days: { type: 'number' } }, required: ['days'] } },
  { name: 'get_quotations_summary', description: 'Quotations approved or rejected in the last N days with the approved value.', input_schema: { type: 'object', properties: { days: { type: 'number' } }, required: ['days'] } },
  { name: 'lookup_knowledge', description: 'Read the owner-uploaded company knowledge base (services, methods, reference prices, safety limits, clients, policies, plans, rules). Pass a topic or keywords, or a section number from the list in your instructions. Returns the best matching sections.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'remember_note', description: 'Save one short lasting note about how the owner wants you to work (preference, correction, routine, or business fact they told you). Only what the owner said themselves in this conversation.', input_schema: { type: 'object', properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['preference', 'fact', 'routine', 'correction'] } }, required: ['text'] } },
  { name: 'forget_note', description: 'Delete one saved note by its id (shown as [#id] in your notes) when the owner asks you to forget it.', input_schema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] } },
  { name: 'get_handovers_waiting', description: 'Finished jobs whose client has not yet signed the handover (their bonus and billing wait for it).', input_schema: { type: 'object', properties: {} } }];
const dateArg = (v: unknown, d: string) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d);
async function runTool(sb: Db, name: string, a: Record<string, unknown>) {
  switch (name) {
    case 'get_jobs': { const from = dateArg(a.from, today()); let to = dateArg(a.to, from); if (to < from) to = from; if (to > addDays(from, 31)) to = addDays(from, 31); return await getJobs(sb, from, to); }
    case 'get_attendance': return await getAttendance(sb, dateArg(a.date, today()));
    case 'get_pending_approvals': return await getPending(sb);
    case 'get_leads': return await getLeads(sb, clampDays(a.days));
    case 'get_receivables': return await getReceivables(sb);
    case 'get_money_in': return await getMoneyIn(sb, clampDays(a.days));
    case 'get_quotations_summary': return await getQuotes(sb, clampDays(a.days, 30));
    case 'get_handovers_waiting': return await getHandovers(sb);
    case 'lookup_knowledge': { const hits = pickSections(String(a.query ?? ''), await loadKnowledge(sb)); return hits.length ? { sections: hits.map((h) => ({ section: h.num, title: h.title, text: h.body.slice(0, 8000) })) } : { found: false }; }
    case 'remember_note': return await saveNote(sb, a.kind, a.text);
    case 'forget_note': return await forgetNote(sb, a.id);
    default: return { error: 'unknown tool' };
  }
}
const webOn = () => env('JARVIS_WEB') !== '0';
const persona = () => personaPrompt(env('JARVIS_ADDRESS'), env('JARVIS_SPEAK_NAMES') !== '0', webOn());
/** Claude's own web search (no Google key needed): the search runs on Anthropic's side and its results come back inside the reply. */
const WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'PH', city: 'Manila', timezone: 'Asia/Manila' } };
async function claude(system: string, messages: { role: string; content: unknown }[], tools?: unknown[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('JARVIS_MODEL') || 'claude-sonnet-5-5', max_tokens: 700, system, messages, ...(tools ? { tools } : {}) }) });
  if (!res.ok) { const detail = (await res.text()).slice(0, 300); console.error('AI', res.status, detail); throw new Error(`AI ${res.status}: ${detail}`); }
  return await res.json() as { content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[]; stop_reason: string };
}
const textOf = (c: { type: string; text?: string }[]) => c.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

/** One conversation turn: the AI looks things up with its read-only tools and answers. Used by Telegram (with stored memory) and by the screen in the app (history sent by the page). */
async function converse(sb: Db, history: Turn[], question: string, src = 'screen'): Promise<string> {
  const system = `${persona()}\n${LEARN_RULES}${await memory(sb)}${knowledgeBlock(await loadKnowledge(sb))}\nToday is ${today()} (Manila time). Use the tools to look things up; call several when needed. ${webOn() ? 'If the question is not about the business, answer it helpfully, searching the web when you need current or outside facts.' : 'If the question is not about the business, answer briefly or say it is outside what you do.'}`;
  const tools = webOn() ? [...TOOLS, WEB_SEARCH] : TOOLS;
  const messages: { role: string; content: unknown }[] = [...history, { role: 'user', content: question }];
  let reply = ''; let searched = false; const used: string[] = [];
  for (let round = 0; round < 6; round++) {
    const out = await claude(system, messages, tools);
    reply = textOf(out.content); if (out.content.some((b) => b.type === 'server_tool_use')) { searched = true; used.push('web_search'); }
    const uses = out.content.filter((b) => b.type === 'tool_use');
    if (!uses.length && out.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: out.content }); continue; }   // a long web search: let it carry on
    if (!uses.length) break;
    messages.push({ role: 'assistant', content: out.content });
    used.push(...uses.map((u) => u.name ?? ''));
    const results = [];
    for (const u of uses) results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(await safe(runTool(sb, u.name ?? '', u.input ?? {}))).slice(0, 9000) });
    messages.push({ role: 'user', content: results });
  }
  if (searched) await logEvent(sb, 'search', 'Web search used');
  await countTopics(sb, used);
  await logEvent(sb, 'answer', `Question answered · ${src}`);
  return reply || 'I could not put an answer together. Please ask again.';
}
async function answer(sb: Db, chat: number, question: string): Promise<string> {
  const history = await remember(sb, chat);
  const reply = await converse(sb, history, question, 'Telegram');
  await store(sb, chat, [...history, { role: 'user', content: question }, { role: 'assistant', content: reply }]);
  return reply;
}

/* ---------------- jobs of the function ---------------- */
async function morningBrief(sb: Db, owners: number[]) {
  if (!(await once(sb, `brief:${today()}`))) return;
  const t = today(); const y = addDays(t, -1);
  const [jobsToday, jobsTomorrow, attendanceYesterday, pending, leads, receivables, moneyYesterday, handovers] = await Promise.all([
    safe(getJobs(sb, t, t)), safe(getJobs(sb, addDays(t, 1), addDays(t, 1))), safe(getAttendance(sb, y)), safe(getPending(sb)), safe(getLeads(sb, 1)),
    safe(getReceivables(sb)), safe(getMoneyIn(sb, 1)), safe(getHandovers(sb))]);
  const data = { today: t, weekday: new Date(t + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }), jobsToday, jobsTomorrow, attendanceYesterday, waitingForYou: pending, newInquiriesLast24h: leads, receivables, moneyReceivedYesterday: moneyYesterday, handoversWaitingForClientSignature: handovers };
  const out = await claude(`${persona()}${await memory(sb)}${knowledgeBlock(await loadKnowledge(sb))}\nWrite the owner's MORNING BRIEF to be listened to. Open with a short greeting and the day. Put what needs the owner's attention or a decision first (waiting approvals, unassigned jobs, absent crew, overdue money, handovers waiting), then today's jobs in time order, then tomorrow in one line. Skip empty sections. Roughly 100 to 160 words.`,
    [{ role: 'user', content: `Data (JSON):\n${JSON.stringify(data).slice(0, 14000)}` }]);
  const text = textOf(out.content) || 'Good morning. I could not prepare the brief today.';
  for (const c of owners) await deliver(c, text);
  await logEvent(sb, 'brief', 'Morning brief delivered');
  try { await sb.from('jarvis_events').delete().lt('at', new Date(Date.now() - 45 * 86400_000).toISOString()); } catch { /* old lines stay a little longer */ }
}
async function instantAlert(sb: Db, id: number, owners: number[]) {
  const { data: a } = await sb.from('alert_outbox').select('id, kind, title, body').eq('id', id).maybeSingle();
  if (!a || !alertIsInstant(a.kind)) return;
  if (!(await once(sb, `alert:${a.id}`))) return;
  const text = alertLine(a); for (const c of owners) await deliver(c, text);
  await logEvent(sb, 'alert', String(a.title ?? 'Alert').slice(0, 80));
}
async function newInquiry(sb: Db, id: string, owners: number[]) {
  if (!(await once(sb, `inquiry:${id}`))) return;
  const { data: q } = await sb.from('inquiries').select('client_id, source, details, service_codes').eq('id', id).maybeSingle(); if (!q) return;
  const { data: c } = await sb.from('clients').select('name').eq('id', q.client_id).maybeSingle();
  const who = env('JARVIS_SPEAK_NAMES') === '0' ? 'a new contact' : (c?.name ?? 'someone');
  const text = speakable(`New inquiry${q.source ? ` from ${q.source}` : ''}. ${who}${q.details ? `: ${String(q.details).slice(0, 160)}` : ''}.`, 400);
  for (const c2 of owners) await deliver(c2, text);
  await logEvent(sb, 'inquiry', `New inquiry${q.source ? ` · ${q.source}` : ''}`);
}
interface AskBody { chat_id: number; message_id: number; text?: string; voice?: { file_id: string; duration?: number } }
async function ask(sb: Db, b: AskBody, owners: number[]) {
  if (!owners.includes(b.chat_id)) return;                                   // only the owner's private chat
  if (!(await once(sb, `ask:${b.chat_id}:${b.message_id}`))) return;
  let q = (b.text ?? '').trim();
  try {
    if (b.voice) {
      if ((b.voice.duration ?? 0) > 120) return void await tgText(b.chat_id, 'That voice note is over two minutes. Please send it in a shorter piece.');
      if (!env('ELEVENLABS_API_KEY')) return void await tgText(b.chat_id, 'I cannot understand voice notes until the voice service key is set. Please type it, or ask the office to finish the setup.');
      q = await transcribe(await tgDownload(b.voice.file_id));
      if (!q) return void await tgText(b.chat_id, 'Sorry, I could not make that out. Could you say it again?');
    }
    if (!q) return;
    if (q.length > 2000) q = q.slice(0, 2000);
    await deliver(b.chat_id, await answer(sb, b.chat_id, q));
  } catch (e) {   // only the owner's private chat reaches here, so the reason is shown to help fix it
    console.error('ask', String(e)); await tgText(b.chat_id, `Sorry, something went wrong on my side. Please try again in a moment.\n\n(Reason: ${String((e as Error)?.message ?? e).slice(0, 400)})`);
  }
}

/* ---------------- the screen in the app ---------------- */
async function ownerFromJwt(sb: Db, req: Request): Promise<boolean> {
  const h = req.headers.get('authorization') ?? ''; const jwt = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
  if (!jwt) return false;
  const { data } = await sb.auth.getUser(jwt); const uid = data?.user?.id; if (!uid) return false;
  const { data: p } = await sb.from('profiles').select('role, active').eq('id', uid).maybeSingle();
  return !!p && p.active === true && p.role === 'owner';
}
async function panel(sb: Db) {
  const t = today();
  const [jobsToday, jobsTomorrow, attendanceToday, attendanceYesterday, pending, leads, receivables, moneyToday, quotes, handovers, alerts] = await Promise.all([
    safe(getJobs(sb, t, t)), safe(getJobs(sb, addDays(t, 1), addDays(t, 1))), safe(getAttendance(sb, t)), safe(getAttendance(sb, addDays(t, -1))), safe(getPending(sb)), safe(getLeads(sb, 1)),
    safe(getReceivables(sb)), safe(getMoneyIn(sb, 1)), safe(getQuotes(sb, 7)), safe(getHandovers(sb)),
    safe((async () => { const { data } = await sb.from('alert_outbox').select('kind, title, body, created_at').order('created_at', { ascending: false }).limit(8); return data ?? []; })())]);
  const parts = [jobsToday, jobsTomorrow, attendanceToday, attendanceYesterday, pending, leads, receivables, moneyToday, quotes, handovers, alerts];
  const okParts = parts.filter((x) => !(x && typeof x === 'object' && !Array.isArray(x) && 'unavailable' in (x as object))).length;
  const events = await safe((async () => { const { data } = await sb.from('jarvis_events').select('kind, text, at').order('at', { ascending: false }).limit(16); return data ?? []; })());
  const delivered = await safe((async () => { const { data } = await sb.from('alert_outbox').select('sent_at').order('created_at', { ascending: false }).limit(20); const rows = data ?? []; return rows.length ? Math.round(rows.filter((r: Db) => r.sent_at).length / rows.length * 100) : null; })());
  const memoryNotes = await loadNotes(sb);
  return { at: new Date().toISOString(), today: t, memory: memoryNotes, knowledge: await knowledgeList(sb), voice: !!(env('ELEVENLABS_API_KEY') && env('ELEVENLABS_VOICE_ID')), ai: !!env('ANTHROPIC_API_KEY'),
    health: { data: Math.round(okParts / parts.length * 100), voice: !!(env('ELEVENLABS_API_KEY') && env('ELEVENLABS_VOICE_ID')), ai: !!env('ANTHROPIC_API_KEY'), alerts: typeof delivered === 'number' ? delivered : null, web: webOn() },
    events, jobsToday, jobsTomorrow, attendanceToday, attendanceYesterday, pending, leads, receivables, moneyToday, quotes, handovers, alerts };
}
async function webRequest(req: Request): Promise<Response> {
  const sb = db();
  if (!(await ownerFromJwt(sb, req))) return json({ error: 'Only the owner can use Jarvis.' }, 403);
  if (req.headers.get('x-jarvis-action') === 'transcribe') {
    if (!env('ELEVENLABS_API_KEY')) return json({ error: 'The voice service key is not set yet.' }, 400);
    const bytes = new Uint8Array(await req.arrayBuffer()); if (!bytes.length || bytes.length > 6_000_000) return json({ error: 'No audio, or it is too long.' }, 400);
    const type = (req.headers.get('content-type') ?? 'audio/webm').split(';')[0] || 'audio/webm';
    return json({ text: await transcribe(bytes, type, type.includes('mp4') ? 'voice.m4a' : 'voice.webm') });
  }
  const b = await req.json().catch(() => ({})) as { action?: string; text?: string; id?: unknown; history?: { role: string; content: string }[] };
  if (b.action === 'panel') return json(await panel(sb));
  if (b.action === 'chat') {
    if (!env('ANTHROPIC_API_KEY')) return json({ error: 'The AI key is not set yet.' }, 400);
    const q = String(b.text ?? '').trim().slice(0, 2000); if (!q) return json({ error: 'Say or type something first.' }, 400);
    const history: Turn[] = (Array.isArray(b.history) ? b.history : []).filter((h) => (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string').slice(-8).map((h) => ({ role: h.role as Turn['role'], content: h.content.slice(0, 1500) }));
    return json({ text: await converse(sb, history, q, 'screen') });
  }
  if (b.action === 'knowledge_save') return json(await saveKnowledge(sb, String(b.text ?? '')));
  if (b.action === 'knowledge_clear') { const r = await sb.from('jarvis_knowledge').delete().gte('num', 0); return json({ ok: !r.error }); }
  if (b.action === 'forget') return json(await forgetNote(sb, (b as { id?: unknown }).id));
  if (b.action === 'speak') {
    if (!env('ELEVENLABS_API_KEY') || !env('ELEVENLABS_VOICE_ID')) return json({ error: 'No voice is connected yet.' }, 400);
    const text = speakable(String(b.text ?? ''), 1200); if (!text) return json({ error: 'Nothing to say.' }, 400);
    const mp3 = await tts(text, 'mp3_44100_128'); if (!mp3) return json({ error: 'The voice service did not answer.' }, 502);
    return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg', ...CORS } });
  }
  return json({ error: 'Unknown action.' }, 400);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const secret = env('WEBHOOK_SECRET');
  if (!req.headers.get('x-webhook-secret') && req.headers.get('authorization')) { try { return await webRequest(req); } catch (e) { console.error('web', String(e)); return json({ error: `Something went wrong: ${String((e as Error)?.message ?? e).slice(0, 300)}` }, 500); } }
  if (!secret || !safeEq(req.headers.get('x-webhook-secret') ?? '', secret)) return json({ error: 'Unauthorized' }, 401);
  const owners = ownerIds(env('JARVIS_OWNER_TELEGRAM_ID'));
  if (!owners.length || !env('TELEGRAM_BOT_TOKEN') || !env('ANTHROPIC_API_KEY')) return json({ ok: true, configured: false });
  const body = await req.json().catch(() => ({})) as { action?: string; id?: number | string } & Partial<AskBody>;
  const sb = db();
  const work = (async () => {
    try {
      if (body.action === 'brief') await morningBrief(sb, owners);
      else if (body.action === 'alert') await instantAlert(sb, Number(body.id), owners);
      else if (body.action === 'inquiry') await newInquiry(sb, String(body.id), owners);
      else if (body.action === 'ask') await ask(sb, body as AskBody, owners);
      else if (body.action === 'test') for (const c of owners) await deliver(c, 'Jarvis online. All systems nominal.');
    } catch (e) { console.error('jarvis', String(e)); }
  })();
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(work); else await work;
  return json({ ok: true });
});
